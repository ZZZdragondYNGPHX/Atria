import { preflightPersonaMigration, applyPersonaMigration, readPersonaMigration, adoptPersonaMigrationDefault } from '../persona-migration.js';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { createNativeId, assertNativeId } from '../identity.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import { nativeRecord, hashNativeDocument, putImmutable, withNativeResourceWrite, withNativeResourceWrites } from './common.js';
import { assertPersonaContent, assertPersonaRef, capturePersona, personaFailure, personaFields, personaHash, personaDocumentReferences, EMPTY_PERSONA_FINGERPRINT, PERSONA_NAMESPACE, PERSONA_MEDIA_TYPES } from '../persona-contract.js';

const key = (kind, handle, extra = {}) => ({ kind, handle, ...extra });
const checked = record => {
    if (record && hashNativeDocument(record.doc) !== record.integrity) throw personaFailure('native_persona_conflict');
    return record;
};
// One account resource lock precedes Session publication locks. FS has no rollback.
export class PersonaRepo {
    constructor({ engine, assetStore, handles = async handle => [handle] }) {
        if (!engine || !assetStore) throw new TypeError('PersonaRepo requires engine and AssetStore');
        Object.assign(this, { engine, assets: assetStore, handles });
    }
    migrationPreflight(handle, input) { return preflightPersonaMigration(this, handle, input); }
    migrationApply(handle, input) { return applyPersonaMigration(this, handle, input); }
    migrationReceipt(handle, input) { return readPersonaMigration(this, handle, input); }
    migrationAdoptDefault(handle, input) { return adoptPersonaMigrationDefault(this, handle, input); }
    lock(handle, operation) { return withNativeResourceWrite(handle, 'personas', operation); }
    locks(handles, operation) {
        const sorted = [...new Set(handles)].sort();
        const enter = index => index === sorted.length ? operation() : this.lock(sorted[index], () => enter(index + 1));
        return enter(0);
    }
    async _record(handle, kind, extra = {}) {
        return this.engine.withTransaction(handle, async tx => checked(await tx.getResource(key(kind, handle, extra))));
    }
    async get(handle, input) {
        personaFields(input, ['personaId', 'ref']);
        if (Object.hasOwn(input, 'ref') === Object.hasOwn(input, 'personaId')) throw personaFailure();
        let id;
        try { id = input.ref ? assertPersonaRef(input.ref).personaId : assertNativeId(input.personaId, 'persona'); } catch { throw personaFailure(); }
        const root = await this._record(handle, K.persona, { personaId: id });
        if (!root) throw personaFailure('native_persona_unavailable');
        const revisionId = input.ref?.revisionId ?? root.doc.currentRevisionId;
        if (!(root.doc.publishedRevisionIds ?? [root.doc.currentRevisionId]).includes(revisionId)) throw personaFailure('native_persona_unavailable');
        const revision = await this._record(handle, K.personaRevision, { personaId: id, revisionId });
        if (!revision || (input.ref && revision.integrity !== input.ref.contentIdentity)) throw personaFailure('native_persona_unavailable');
        const { schemaVersion, personaId, revisionId: revId, ...content } = revision.doc;
        if (schemaVersion !== 1 || personaId !== id || revId !== revisionId) throw personaFailure('native_persona_invalid');
        assertPersonaContent(content);
        return { root: root.doc, revision: revision.doc, ref: { personaId: id, revisionId, contentIdentity: revision.integrity }, expectedFingerprint: root.integrity };
    }
    async list(handle, input = {}) {
        personaFields(input, ['query', 'includeArchived', 'cursor', 'limit', 'sort']);
        const { query = '', includeArchived = false, cursor = null, limit = 50, sort = 'id' } = input;
        if (typeof query !== 'string' || query.length > 256 || typeof includeArchived !== 'boolean' || (cursor !== null && (typeof cursor !== 'string' || cursor.length > 2048)) || !Number.isInteger(limit) || limit < 1 || limit > 100 || !['id', 'name'].includes(sort)) throw personaFailure();
        const roots = await this.engine.withTransaction(handle, tx => tx.listResources({ kind: K.persona, handle }));
        const items = [];
        for (const record of roots) {
            checked(record);
            if (!includeArchived && record.doc.archived) continue;
            const item = await this.get(handle, { personaId: record.key.personaId });
            if (item.revision.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())) items.push(item);
        }
        const order = item => sort === 'name' ? item.revision.name.toLocaleLowerCase() + '\u0000' + item.root.personaId : item.root.personaId;
        const page = items.sort((a, b) => order(a).localeCompare(order(b))).filter(item => !cursor || order(item).localeCompare(cursor) > 0);
        return { items: page.slice(0, limit), nextCursor: page.length > limit ? order(page[limit - 1]) : null };
    }
    async revisions(handle, input) {
        personaFields(input, ['personaId']);
        const current = await this.get(handle, input);
        return this.engine.withTransaction(handle, async tx => (await tx.listResources({ kind: K.personaRevision, handle, personaId: input.personaId })).filter(record => current.root.publishedRevisionIds.includes(record.key.revisionId)).map(record => checked(record).doc));
    }
    async _cas(tx, k, doc, expectedFingerprint) {
        personaHash(expectedFingerprint);
        const existing = checked(await tx.getResource(k));
        if ((existing?.integrity ?? EMPTY_PERSONA_FINGERPRINT) !== expectedFingerprint) throw personaFailure('native_persona_conflict');
        const record = nativeRecord(doc, { existing });
        const result = await tx.putResourceIfMatch(k, existing?.integrity ?? null, record);
        if (!result.updated) throw personaFailure('native_persona_conflict');
        return record;
    }
    async _verifyAvatar(handle, avatar) {
        if (!avatar) return;
        const stored = await this.assets.read(handle, avatar.assetId).catch(() => { throw personaFailure('native_persona_unavailable', { reason: 'avatar_missing_or_corrupt' }); });
        if (!stored || hashNativeDocument(stored.ref) !== hashNativeDocument(avatar)) throw personaFailure('native_persona_unavailable');
        await validateAvatar(stored.bytes, avatar.mediaType);
    }
    async create(handle, input) {
        personaFields(input, ['content', 'expectedFingerprint']);
        const content = assertPersonaContent(input.content);
        if (input.expectedFingerprint !== EMPTY_PERSONA_FINGERPRINT) throw personaFailure(input.expectedFingerprint ? 'native_persona_conflict' : 'native_persona_invalid');
        return this.lock(handle, async () => {
            assertWritable();
            const personaId = createNativeId('persona'), revisionId = createNativeId('revision');
            return this._publish(handle, { schemaVersion: 1, personaId, revisionId, ...content }, input.expectedFingerprint, false);
        });
    }
    async revise(handle, input) {
        personaFields(input, ['personaId', 'content', 'expectedFingerprint']);
        personaHash(input.expectedFingerprint);
        const content = assertPersonaContent(input.content);
        return this.lock(handle, async () => {
            assertWritable();
            const current = await this.get(handle, { personaId: input.personaId });
            if (current.expectedFingerprint !== input.expectedFingerprint) throw personaFailure('native_persona_conflict');
            return this._publish(handle, { schemaVersion: 1, personaId: input.personaId, revisionId: createNativeId('revision'), ...content }, input.expectedFingerprint, current.root.archived);
        });
    }
    async _publish(handle, revision, expected, archived) {
        // Lock Asset refs through root publication, so deletion cannot win after validation.
        return withNativeResourceWrites(handle, revision.avatar ? ['asset:' + revision.avatar.assetId] : [], async () => {
            await this._verifyAvatar(handle, revision.avatar);
            const previous = await this._record(handle, K.persona, { personaId: revision.personaId });
            const root = { schemaVersion: 1, personaId: revision.personaId, currentRevisionId: revision.revisionId, archived,
                publishedRevisionIds: [...(previous?.doc.publishedRevisionIds ?? []), revision.revisionId] };
            await this.engine.withTransaction(handle, async tx => {
                await putImmutable(tx, key(K.personaRevision, handle, { personaId: revision.personaId, revisionId: revision.revisionId }), revision);
                await this._cas(tx, key(K.persona, handle, { personaId: revision.personaId }), root, expected);
            });
            // Publication is complete; returning the receipt never depends on a refresh read.
            return { root, revision, ref: { personaId: revision.personaId, revisionId: revision.revisionId, contentIdentity: hashNativeDocument(revision) }, expectedFingerprint: hashNativeDocument(root), published: true };
        });
    }
    async archive(handle, input) {
        personaFields(input, ['personaId', 'archived', 'expectedFingerprint']);
        personaHash(input.expectedFingerprint);
        if (typeof input.archived !== 'boolean') throw personaFailure();
        return this.lock(handle, async () => {
            assertWritable();
            const current = await this.get(handle, { personaId: input.personaId });
            const root = { ...current.root, archived: input.archived };
            await this.engine.withTransaction(handle, tx => this._cas(tx, key(K.persona, handle, { personaId: input.personaId }), root, input.expectedFingerprint));
            return { ...current, root, expectedFingerprint: hashNativeDocument(root), published: true };
        });
    }
    async readDefault(handle, input = {}) {
        personaFields(input, []);
        const record = await this._record(handle, K.personaDefault);
        return { selection: record?.doc.selection ?? null, expectedFingerprint: record?.integrity ?? EMPTY_PERSONA_FINGERPRINT };
    }
    async setDefault(handle, input) {
        personaFields(input, ['selection', 'expectedFingerprint']);
        personaHash(input.expectedFingerprint);
        if (!Object.hasOwn(input, 'selection')) throw personaFailure();
        return this.lock(handle, async () => {
            assertWritable();
            await this.capture(handle, input.selection, 'explicit');
            const doc = { schemaVersion: 1, selection: input.selection };
            const record = await this.engine.withTransaction(handle, tx => this._cas(tx, key(K.personaDefault, handle), doc, input.expectedFingerprint));
            return { selection: record.doc.selection, expectedFingerprint: record.integrity, published: true };
        });
    }
    // Called while holding the account lock, all the way through Session HEAD publication.
    async capture(handle, selection, source = 'explicit') {
        if (selection === undefined) return this.capture(handle, (await this.readDefault(handle)).selection, 'default');
        if (selection === null) return null;
        const exact = await this.get(handle, { ref: assertPersonaRef(selection) });
        if (exact.root.archived) throw personaFailure('native_persona_unavailable', { reason: 'archived' });
        await this._verifyAvatar(handle, exact.revision.avatar);
        return capturePersona(exact.revision, source);
    }
    async usedBy(handle, input) {
        personaFields(input, ['personaId']);
        await this.get(handle, input);
        const refs = [];
        const defaultRef = (await this.readDefault(handle)).selection;
        if (defaultRef?.personaId === input.personaId) refs.push({ kind: 'default' });
        // Exact snapshots in every immutable state protect branch/save/request history,
        // including authorized copies in another Session owner's store.
        for (const owner of await this.handles(handle)) {
            await this.engine.withTransaction(owner, async tx => {
                for (const record of await tx.listResources({ kind: K.sessionState, handle: owner })) {
                    if (record.key.namespace !== PERSONA_NAMESPACE) continue;
                    const selections = [record.doc.solo, ...Object.values(record.doc.seats ?? {})];
                    if (selections.some(item => item?.ref.personaId === input.personaId)) refs.push({ kind: 'session-snapshot', sessionId: record.key.sessionId, head: record.key.head });
                }
            });
        }
        await this.engine.withTransaction(handle, async tx => {
            for (const record of await tx.listResources({ kind: K.personaMigration, handle })) {
                if (personaDocumentReferences(record.doc.items, 'personaId', input.personaId)) refs.push({ kind: 'migration-receipt', sourceDigest: record.key.sourceDigest });
            }
        });
        return { references: refs };
    }
    async delete(handle, input) {
        personaFields(input, ['personaId', 'expectedFingerprint']);
        personaHash(input.expectedFingerprint);
        return this.lock(handle, async () => {
            assertWritable();
            const current = await this.get(handle, { personaId: input.personaId });
            if (current.expectedFingerprint !== input.expectedFingerprint) throw personaFailure('native_persona_conflict');
            const { references } = await this.usedBy(handle, { personaId: input.personaId });
            if (references.length) throw personaFailure('native_persona_referenced', { references });
            await this.engine.withTransaction(handle, async tx => {
                // Root first: an interrupted FS delete only leaves unreachable immutable data.
                await tx.deleteResource(key(K.persona, handle, { personaId: input.personaId }));
                for (const record of await tx.listResources({ kind: K.personaRevision, handle, personaId: input.personaId })) await tx.deleteResource(record.key);
            });
            return { deleted: true, personaId: input.personaId };
        });
    }
    async avatar(handle, input) {
        personaFields(input, ['bytes', 'mediaType']);
        if (typeof input.bytes !== 'string' || input.bytes.length > 12 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.bytes)) throw personaFailure();
        const bytes = Buffer.from(input.bytes, 'base64');
        await validateAvatar(bytes, input.mediaType);
        const ref = { assetId: createNativeId('asset'), contentHash: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, mediaType: input.mediaType };
        return this.assets.put(handle, ref, bytes);
    }
}

export async function validateAvatar(bytes, mediaType) {
    if (!PERSONA_MEDIA_TYPES.includes(mediaType) || !bytes.length || bytes.length > 8 * 1024 * 1024) throw personaFailure();
    try {
        // Bound allocation before full decode, then validate actual codec and decoded dimensions.
        const { imageSize } = await import('image-size');
        const size = imageSize(bytes);
        const types = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif' };
        if (types[size.type] !== mediaType || !size.width || !size.height || size.width > 4096 || size.height > 4096 || size.width * size.height > 16777216) throw personaFailure();
        const decoded = mediaType === 'image/png' ? PNG.sync.read(bytes, { checkCRC: true }) : await decodeAvatar(size.type, bytes);
        if (decoded.width !== size.width || decoded.height !== size.height) throw personaFailure();
    } catch { throw personaFailure(); }
}

// Initialize the already installed Jimp codecs from local WASM bytes. Their
// default browser URL loading cannot fetch file: URLs on Node, and validation
// must never depend on a network download.
const avatarDecoders = new Map();
const requireCodec = createRequire(import.meta.url);
async function decodeAvatar(type, bytes) {
    const format = type === 'jpg' ? 'jpeg' : type;
    if (!avatarDecoders.has(format)) {
        const loading = (async () => {
            const owner = createRequire(requireCodec.resolve('@jimp/wasm-' + format + '/package.json'));
            const codec = await import(pathToFileURL(owner.resolve('@jsquash/' + format + '/decode.js')).href);
            const name = format === 'jpeg' ? 'mozjpeg' : format;
            const wasm = await WebAssembly.compile(await readFile(owner.resolve('@jsquash/' + format + '/codec/dec/' + name + '_dec.wasm')));
            await codec.init(wasm);
            return codec;
        })();
        avatarDecoders.set(format, loading);
        loading.catch(() => avatarDecoders.delete(format));
    }
    const codec = await avatarDecoders.get(format);
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return codec.default(data, { preserveOrientation: true });
}
