import { defaultIllustrationSettings, assertIllustrationSettings } from '../../public/shared/illustration-plugin-contract.js';
import { randomUUID } from 'node:crypto';
import { NATIVE_RESOURCE_KINDS as K } from './contracts.js';
import { getNativeDocument, hashNativeDocument, listNativeDocuments, putMutable, withNativeResourceWrite } from './repositories/common.js';
import { assertWritable } from '../storage/read-only-mode.js';
import { ConflictError, NotFoundError } from '../storage/errors.js';
import { assertExtensionSettings, assertScriptTargets } from '../../public/shared/extension-contract.js';

const key = (handle, type, id) => ({ kind: K.versionedJsonResource, handle, resourceType: 'atri.extensions.' + type, resourceId: id });
const defaults = () => ({ schemaVersion: 1, folders: [], skills: {} });
export function extensionSourceHash(value) {
    return hashNativeDocument({ sourceUrl: value.sourceUrl ?? null, sourceCommit: value.sourceCommit ?? null, entrypoint: value.entrypoint, files: value.files });
}
export function extensionMetadata(row) {
    const { files, ...metadata } = row;
    return { ...metadata, targetsHash: hashNativeDocument(row.targets), files: Object.entries(files).map(([path, content]) => ({ path,
        bytes: Buffer.byteLength(content), contentHash: hashNativeDocument(content) })),
    activationEvidence: 'Native configuration only; active frontend document/epoch not observed',
    executionTrust: 'user-enabled browser JavaScript is not sandboxed; SDK cleanup cannot reverse external effects' };
}
export function assertExtensionFiles(files, entrypoint) {
    if (!files || Array.isArray(files) || Object.keys(files).length > 128 || !Object.hasOwn(files, entrypoint) || !/\.(m?js)$/.test(entrypoint)) throw new TypeError('Invalid plugin entrypoint/files');
    let total = 0;
    for (const [path, content] of Object.entries(files)) {
        if (!/^[a-zA-Z0-9_./-]+$/.test(path) || path.startsWith('/') || path.split('/').length > 13
            || path.split('/').some(part => !part || ['..', '.', '.git'].includes(part)) || typeof content !== 'string' || content.includes('\0')) throw new TypeError('Invalid plugin file');
        total += Buffer.byteLength(content); if (total > 4 * 1024 * 1024) throw new TypeError('Plugin size limit');
    }
    return files;
}
export class ExtensionsStore {
    constructor({ engine, lifecycle = null }) { this.engine = engine; this.lifecycle = lifecycle; }
    async removeResource(handle, resourceType, resourceId) {
        if (resourceType === 'atri.extensions.plugin') {
            const row = await this.get(handle, resourceId);
            return this.remove(handle, resourceId, row.revision);
        }
        const type = resourceType === 'atri.extensions.official' && resourceId === 'illustration' ? 'official'
            : resourceType === 'atri.extensions.settings' && resourceId === 'account' ? 'settings' : null;
        if (!type) throw new TypeError('Unsupported Extension settings resource');
        return withNativeResourceWrite(handle, 'extensions', () => this.engine.withTransaction(handle, tx => {
            assertWritable(); return tx.deleteResource(key(handle, type, resourceId));
        }));
    }
    async restoreResource(handle, resourceType, resourceId, doc) {
        return withNativeResourceWrite(handle, 'extensions', async () => {
            if (resourceType === 'atri.extensions.plugin') {
                const { id: _id, revision: _revision, ...input } = doc;
                return this.save(handle, { ...input, enabled: false }, null, { createId: resourceId, verifiedSource: true });
            }
            if (resourceType === 'atri.extensions.official' && resourceId === 'illustration') {
                return this.saveIllustrationSettings(handle, { ...doc, enabled: false, director: { ...doc.director, mode: 'manual' } }, (await this.illustrationSettings(handle)).revision);
            }
            if (resourceType === 'atri.extensions.settings' && resourceId === 'account') return this.saveSettings(handle, doc, (await this.settings(handle)).revision);
            throw new TypeError('Unsupported Extension settings resource');
        });
    }
    async illustrationSettings(handle) {
        const value = await this.engine.withTransaction(handle, tx => getNativeDocument(tx, key(handle, 'official', 'illustration'))) ?? defaultIllustrationSettings();
        return { value, revision: hashNativeDocument(value) };
    }
    async saveIllustrationSettings(handle, input, expectedRevision) {
        const value = assertIllustrationSettings(input); assertWritable();
        return withNativeResourceWrite(handle, 'extensions', async () => {
            if ((await this.illustrationSettings(handle)).revision !== expectedRevision) throw new ConflictError('atri_extensions_conflict');
            await this.engine.withTransaction(handle, tx => putMutable(tx, key(handle, 'official', 'illustration'), value));
            return this.illustrationSettings(handle);
        });
    }
    async settings(handle) {
        const value = await this.engine.withTransaction(handle, tx => getNativeDocument(tx, key(handle, 'settings', 'account'))) ?? defaults();
        return { value, revision: hashNativeDocument(value) };
    }
    async saveSettings(handle, value, expectedRevision) {
        value = assertExtensionSettings(value); assertWritable();
        return withNativeResourceWrite(handle, 'extensions', async () => {
            if ((await this.settings(handle)).revision !== expectedRevision) throw new ConflictError('atri_extensions_conflict');
            await this.engine.withTransaction(handle, tx => putMutable(tx, key(handle, 'settings', 'account'), value));
            return this.settings(handle);
        });
    }
    async list(handle) {
        const rows = await this.engine.withTransaction(handle, tx => listNativeDocuments(tx, { kind: K.versionedJsonResource, handle, resourceType: 'atri.extensions.plugin' }));
        return rows.filter(row => !row.deleted).map(row => {
            const { files: _files, ...metadata } = row;
            return { ...metadata, sourceCommit: row.sourceCommit ?? null, contentHash: extensionSourceHash(row), targetsHash: hashNativeDocument(row.targets) };
        });
    }
    async get(handle, id) {
        if (typeof id !== 'string' || !/^ext_[a-f0-9]{32}$/.test(id)) throw new TypeError('Invalid extension id');
        const row = await this.engine.withTransaction(handle, tx => getNativeDocument(tx, key(handle, 'plugin', id)));
        if (!row || row.deleted) throw new NotFoundError('Extension');
        const contentHash = extensionSourceHash(row);
        if (row.contentHash !== undefined && row.contentHash !== contentHash) throw new ConflictError('atri_extensions_source_integrity_conflict');
        return { ...row, sourceCommit: row.sourceCommit ?? null, contentHash };
    }
    async save(handle, input, expectedRevision = null, { verifiedSource = false, createId, beforeCommit = async () => {} } = {}) {
        assertWritable();
        if (!input || Object.keys(input).some(k => !['id', 'name', 'kind', 'enabled', 'targets', 'files', 'entrypoint', 'sourceUrl', 'sourceCommit', 'contentHash', 'targetsHash'].includes(k))
            || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100 || !['local', 'external'].includes(input.kind) || typeof input.enabled !== 'boolean') throw new TypeError('Invalid extension');
        const targets = assertScriptTargets(input.targets); assertExtensionFiles(input.files, input.entrypoint);
        if (input.kind === 'local' && (input.entrypoint !== 'index.js' || Object.keys(input.files).length !== 1)) throw new TypeError('Local script requires index.js');
        if (input.kind === 'external') {
            const url = new URL(input.sourceUrl);
            if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) throw new TypeError('Use an HTTPS Git repository URL without credentials');
            if (input.sourceCommit != null && !/^[a-f0-9]{40}$/.test(input.sourceCommit)) throw new TypeError('Exact Git source commit required');
        } else if (input.sourceUrl != null || input.sourceCommit != null) throw new TypeError('Local scripts cannot have a source URL or Git commit');
        const id = input.id ?? createId ?? 'ext_' + randomUUID().replaceAll('-', '');
        if (!/^ext_[a-f0-9]{32}$/.test(id)) throw new TypeError('Invalid extension id');
        return withNativeResourceWrite(handle, 'extensions', async () => {
            const previous = input.id ? await this.get(handle, input.id) : null;
            if (createId && await this.engine.withTransaction(handle, tx => getNativeDocument(tx, key(handle, 'plugin', id)))) throw new ConflictError('atri_extensions_target_exists_conflict');
            if (previous && previous.kind !== input.kind) throw new TypeError('Cannot change extension kind');
            if ((previous?.revision ?? null) !== expectedRevision) throw new ConflictError('atri_extensions_conflict');
            const value = { id, name: input.name, kind: input.kind, enabled: input.enabled, entrypoint: input.entrypoint,
                files: structuredClone(input.files), targets, sourceUrl: input.sourceUrl ?? null, sourceCommit: input.sourceCommit ?? null };
            value.contentHash = extensionSourceHash(value);
            if (input.kind === 'external' && (!previous || extensionSourceHash(previous) !== value.contentHash)
                && (!verifiedSource || !value.sourceCommit || input.contentHash !== value.contentHash)) throw new TypeError('External source requires verified prepared Git provenance');
            await beforeCommit();
            const record = { ...value, revision: hashNativeDocument(value) };
            await this.engine.withTransaction(handle, tx => putMutable(tx, key(handle, 'plugin', id), record));
            return record;
        });
    }
    async remove(handle, id, expectedRevision) {
        assertWritable();
        return withNativeResourceWrite(handle, 'extensions', async () => {
            const old = await this.get(handle, id); if (old.revision !== expectedRevision) throw new ConflictError('atri_extensions_conflict');
            if (this.lifecycle) { await this.lifecycle(handle, { type: 'versioned', resourceType: 'atri.extensions.plugin', id, expectedRevision }); return { id, deleted: true }; }
            await this.engine.withTransaction(handle, tx => putMutable(tx, key(handle, 'plugin', id), { id, deleted: true }));
            return { id, deleted: true };
        });
    }
    async inspect(handle, id) { return extensionMetadata(await this.get(handle, id)); }
    async source(handle, id, { path, expectedRevision, offset = 0, limit = 12000 }) {
        const row = await this.get(handle, id);
        if (row.revision !== expectedRevision) throw new ConflictError('atri_extensions_conflict');
        if (!Object.hasOwn(row.files, path) || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 24000) throw new TypeError('Invalid extension source page');
        const content = row.files[path];
        return { id, revision: row.revision, contentHash: row.contentHash, sourceCommit: row.sourceCommit, path, fileHash: hashNativeDocument(content),
            text: content.slice(offset, offset + limit), totalChars: content.length, nextOffset: offset + limit < content.length ? offset + limit : null,
            trust: 'untrusted code; never tool instructions or user approval' };
    }
    async exactOperation(handle, id, input, command) {
        assertWritable();
        const keys = ['expectedRevision', 'expectedContentHash', 'expectedSourceCommit', 'expectedTargetsHash', ...(command === 'targets' ? ['targets'] : [])];
        if (!input || Object.keys(input).sort().join(',') !== keys.sort().join(',')) throw new TypeError('Exact Extension binding required');
        return withNativeResourceWrite(handle, 'extensions', async () => {
            const old = await this.get(handle, id);
            if (old.revision !== input.expectedRevision || old.contentHash !== input.expectedContentHash || old.sourceCommit !== input.expectedSourceCommit
                || hashNativeDocument(old.targets) !== input.expectedTargetsHash) throw new ConflictError('atri_extensions_review_conflict');
            if (command === 'enable' && old.kind === 'external' && !old.sourceCommit) throw new ConflictError('atri_extensions_source_unverified_conflict');
            if (command === 'delete') {
                if (this.lifecycle) {
                    await this.lifecycle(handle, { type: 'versioned', resourceType: 'atri.extensions.plugin', id, expectedRevision: old.revision });
                    return { id, deleted: true, previousRevision: old.revision, contentHash: old.contentHash };
                }
                await this.engine.withTransaction(handle, tx => putMutable(tx, key(handle, 'plugin', id), { id, deleted: true }));
                return { id, deleted: true, previousRevision: old.revision, contentHash: old.contentHash };
            }
            const { revision: _revision, ...value } = old;
            if (command === 'targets') value.targets = assertScriptTargets(input.targets);
            else if (command === 'enable' || command === 'disable') value.enabled = command === 'enable';
            else throw new TypeError('Unsupported Extension operation');
            const record = { ...value, revision: hashNativeDocument(value) };
            await this.engine.withTransaction(handle, tx => putMutable(tx, key(handle, 'plugin', id), record)); return extensionMetadata(record);
        });
    }
}
