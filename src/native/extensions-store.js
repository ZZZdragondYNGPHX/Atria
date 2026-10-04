import { defaultIllustrationSettings, assertIllustrationSettings } from '../../public/shared/illustration-plugin-contract.js';
import { randomUUID } from 'node:crypto';
import { NATIVE_RESOURCE_KINDS as K } from './contracts.js';
import { getNativeDocument, hashNativeDocument, listNativeDocuments, putMutable, withNativeResourceWrite } from './repositories/common.js';
import { assertWritable } from '../storage/read-only-mode.js';
import { ConflictError, NotFoundError } from '../storage/errors.js';
import { assertExtensionSettings, assertScriptTargets } from '../../public/shared/extension-contract.js';

const key = (handle, type, id) => ({ kind: K.versionedJsonResource, handle, resourceType: 'atri.extensions.' + type, resourceId: id });
const defaults = () => ({ schemaVersion: 1, folders: [], skills: {} });
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
    constructor({ engine }) { this.engine = engine; }
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
        return rows.filter(row => !row.deleted).map(({ files: _files, ...row }) => row);
    }
    async get(handle, id) {
        if (typeof id !== 'string' || !/^ext_[a-f0-9]{32}$/.test(id)) throw new TypeError('Invalid extension id');
        const row = await this.engine.withTransaction(handle, tx => getNativeDocument(tx, key(handle, 'plugin', id)));
        if (!row || row.deleted) throw new NotFoundError('Extension'); return row;
    }
    async save(handle, input, expectedRevision = null) {
        assertWritable();
        if (!input || Object.keys(input).some(k => !['id', 'name', 'kind', 'enabled', 'targets', 'files', 'entrypoint', 'sourceUrl'].includes(k))
            || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100 || !['local', 'external'].includes(input.kind) || typeof input.enabled !== 'boolean') throw new TypeError('Invalid extension');
        const targets = assertScriptTargets(input.targets); assertExtensionFiles(input.files, input.entrypoint);
        if (input.kind === 'local' && (input.entrypoint !== 'index.js' || Object.keys(input.files).length !== 1)) throw new TypeError('Local script requires index.js');
        if (input.kind === 'external') {
            const url = new URL(input.sourceUrl);
            if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) throw new TypeError('Use an HTTPS Git repository URL without credentials');
        } else if (input.sourceUrl != null) throw new TypeError('Local scripts cannot have a source URL');
        const id = input.id ?? 'ext_' + randomUUID().replaceAll('-', '');
        return withNativeResourceWrite(handle, 'extensions', async () => {
            const previous = input.id ? await this.get(handle, input.id) : null;
            if (previous && previous.kind !== input.kind) throw new TypeError('Cannot change extension kind');
            if ((previous?.revision ?? null) !== expectedRevision) throw new ConflictError('atri_extensions_conflict');
            const value = { ...structuredClone(input), id, targets, sourceUrl: input.sourceUrl ?? null };
            const record = { ...value, revision: hashNativeDocument(value) };
            await this.engine.withTransaction(handle, tx => putMutable(tx, key(handle, 'plugin', id), record));
            return record;
        });
    }
    async remove(handle, id, expectedRevision) {
        assertWritable();
        return withNativeResourceWrite(handle, 'extensions', async () => {
            const old = await this.get(handle, id); if (old.revision !== expectedRevision) throw new ConflictError('atri_extensions_conflict');
            await this.engine.withTransaction(handle, tx => putMutable(tx, key(handle, 'plugin', id), { id, deleted: true }));
            return { id, deleted: true };
        });
    }
}
