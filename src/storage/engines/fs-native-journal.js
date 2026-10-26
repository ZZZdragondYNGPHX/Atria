import fsp from 'node:fs/promises';
import { readNativeFileBatch } from './native-resource-batch.js';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { durableWriteAsync, durableRemoveAsync, syncDirectoryAsync } from '../durable-file.js';
import { isNativeStorageKind, normalizeNativeResourceKey, encodeNativeResourceKey, nativeResourceMatchesFilter, sortAndLimitNativeRecords } from './native-resource-key.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../native/contracts.js';
import { prepareIndependent } from '../../../public/shared/native-independent-preparation.js';
import { decodeNativeJsonAsync } from './native-json-codec.js';
import { encodedNativeJournal, encodeNativeJournal, decodeNativeJournal } from './native-journal-codec.js';

const identity = key => key.kind + '\0' + encodeNativeResourceKey(key);
const digest = text => createHash('sha256').update(text).digest('hex');
const dependencies = new Set([K.sessionState, K.sessionRevision, K.timelineEntry, K.timelineVariant, K.branch]);

// One committed redo journal per user. Engine isolation excludes readers while
// installation is partial. Recovery finishes installation before any read/ACK.
export class FsNativeJournal {
    constructor(tx, root, handle, fault = () => {}, stateCache = null) {
        this.base = tx; this.root = root; this.handle = handle; this.fault = fault;
        this.writes = new Map();
        this.reads = new Map();
        this.stateCache = stateCache;
        this.file = path.join(root, 'native-commit.journal');
        this.tx = new Proxy(tx, { get: (target, name) => {
            if (name === 'nativeStateCache') return this.stateCache;
            if (['getResource', 'getImmutableResource', 'getNativeResources', 'putResource', 'putResourceIfMatch', 'deleteResource', 'listResources'].includes(name)) return this[name].bind(this);
            const value = target[name]; return typeof value === 'function' ? value.bind(target) : value;
        } });
    }
    checkedKey(key) {
        const normalized = normalizeNativeResourceKey(key);
        if (normalized.handle !== this.handle) throw new TypeError('FS transaction handle mismatch');
        return normalized;
    }
    async getResource(key) {
        return structuredClone(await this.getImmutableResource(key));
    }
    async getNativeResources(keys) {
        return readNativeFileBatch(keys, key => this.getImmutableResource(key));
    }
    async getImmutableResource(key) {
        if (!isNativeStorageKind(key.kind)) return this.base.getResource(key);
        const normalized = this.checkedKey(key), item = this.writes.get(identity(normalized));
        if (item) return item.record;
        const id = identity(normalized);
        if (!this.reads.has(id)) {
            if (this.reads.size >= 64) this.reads.delete(this.reads.keys().next().value);
            this.reads.set(id, this.base.getImmutableResource(normalized));
        }
        return this.reads.get(id);
    }
    async putResource(key, record) {
        if (!isNativeStorageKind(key.kind)) return this.base.putResource(key, record);
        const normalized = this.checkedKey(key);
        this.stateCache?.delete([normalized.handle, normalized.sessionId, normalized.namespace, normalized.head].join('\0'));
        const existing = await this.getImmutableResource(normalized), now = Date.now();
        this.writes.set(identity(normalized), { key: normalized, record: structuredClone({ ...record, key: normalized,
            createdAt: record.createdAt ?? existing?.createdAt ?? now, updatedAt: record.updatedAt ?? now }) });
    }
    async putResourceIfMatch(key, expectedIntegrity, record) {
        if (!isNativeStorageKind(key.kind)) return this.base.putResourceIfMatch(key, expectedIntegrity, record);
        const existing = await this.getImmutableResource(key);
        if (expectedIntegrity === null ? existing !== null : !existing || existing.integrity !== expectedIntegrity) return { updated: false };
        await this.putResource(key, record); return { updated: true };
    }
    async deleteResource(key) {
        if (!isNativeStorageKind(key.kind)) return this.base.deleteResource(key);
        const normalized = this.checkedKey(key), existed = Boolean(await this.getImmutableResource(normalized));
        this.stateCache?.delete([normalized.handle, normalized.sessionId, normalized.namespace, normalized.head].join('\0'));
        this.writes.set(identity(normalized), { key: normalized, record: null }); return existed;
    }
    async listResources(filter) {
        if (!isNativeStorageKind(filter.kind)) return this.base.listResources(filter);
        if (filter.handle !== this.handle) throw new TypeError('FS transaction handle mismatch');
        const rows = new Map((await this.base.listResources({ ...filter, limit: undefined })).map(row => [identity(row.key), row]));
        for (const [id, item] of this.writes) if (nativeResourceMatchesFilter(item.key, filter)) {
            if (item.record) rows.set(id, structuredClone(item.record)); else rows.delete(id);
        }
        return sortAndLimitNativeRecords([...rows.values()], filter);
    }
    async install(items) {
        const install = async ({ item, index }) => {
            this.checkedKey(item.key);
            if (item.bytes) await this.base.putEncodedNativeResource(item.key, item.bytes);
            else if (item.record) await this.base.putResource(item.key, item.record);
            else await this.base.deleteResource(item.key);
            await this.fault('install', index);
        };
        let batch = [];
        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            if ((item.bytes || item.record) && dependencies.has(item.key.kind)) batch.push({ item, index });
            else {
                // Independent files may sync together; mutable roots and
                // deletions remain ordered barriers after all siblings settle.
                await prepareIndependent(batch, install, { concurrency: 4 }); batch = [];
                await install({ item, index });
            }
        }
        await prepareIndependent(batch, install, { concurrency: 4 });
    }
    async recover() {
        let raw;
        try { raw = await fsp.readFile(this.file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (raw !== undefined) {
            this.stateCache?.clear();
            let items;
            if (encodedNativeJournal(raw)) items = decodeNativeJournal(raw);
            else {
                const journal = await decodeNativeJsonAsync(raw);
                if (journal.schemaVersion !== 1 || digest(journal.payload) !== journal.digest) throw new Error('Native commit journal integrity mismatch');
                items = JSON.parse(journal.payload);
            }
            await this.install(items);
            await durableRemoveAsync(this.file);
        }
        await durableRemoveAsync(this.file + '.prepared');
    }
    async commit() {
        if (!this.writes.size) return;
        const prepared = this.file + '.prepared';
        await this.fault('prepare');
        // zlib jobs use independent libuv workers. Target-file bytes are reused
        // by the redo record and installation instead of encoding every tree twice.
        const items = await prepareIndependent([...this.writes.values()], async ({ key, record }) => ({ key,
            bytes: record ? await this.base.encodeNativeResource(key, record) : null,
        }), { concurrency: 4 });
        await durableWriteAsync(prepared, encodeNativeJournal(items));
        await this.fault('dependencies');
        await fsp.rename(prepared, this.file); await syncDirectoryAsync(this.root);
        await this.fault('publish');
        await this.install(items);
        await durableRemoveAsync(this.file);
        await this.fault('ack');
    }
}
