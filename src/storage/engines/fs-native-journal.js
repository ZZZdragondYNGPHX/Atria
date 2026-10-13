import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { durableWrite, durableRemove, syncDirectory } from '../durable-file.js';
import { isNativeStorageKind, normalizeNativeResourceKey, encodeNativeResourceKey, nativeResourceMatchesFilter, sortAndLimitNativeRecords } from './native-resource-key.js';

const identity = key => key.kind + '\0' + encodeNativeResourceKey(key);
const digest = text => createHash('sha256').update(text).digest('hex');

// One committed redo journal per user. Engine isolation excludes readers while
// installation is partial. Recovery finishes installation before any read/ACK.
export class FsNativeJournal {
    constructor(tx, root, handle, fault = () => {}) {
        this.base = tx; this.root = root; this.handle = handle; this.fault = fault;
        this.writes = new Map();
        this.file = path.join(root, 'native-commit.journal');
        this.tx = new Proxy(tx, { get: (target, name) => {
            if (['getResource', 'putResource', 'putResourceIfMatch', 'deleteResource', 'listResources'].includes(name)) return this[name].bind(this);
            const value = target[name]; return typeof value === 'function' ? value.bind(target) : value;
        } });
    }
    checkedKey(key) {
        const normalized = normalizeNativeResourceKey(key);
        if (normalized.handle !== this.handle) throw new TypeError('FS transaction handle mismatch');
        return normalized;
    }
    async getResource(key) {
        if (!isNativeStorageKind(key.kind)) return this.base.getResource(key);
        const normalized = this.checkedKey(key), item = this.writes.get(identity(normalized));
        return item ? structuredClone(item.record) : this.base.getResource(normalized);
    }
    async putResource(key, record) {
        if (!isNativeStorageKind(key.kind)) return this.base.putResource(key, record);
        const normalized = this.checkedKey(key);
        const existing = await this.getResource(normalized), now = Date.now();
        this.writes.set(identity(normalized), { key: normalized, record: structuredClone({ ...record, key: normalized,
            createdAt: record.createdAt ?? existing?.createdAt ?? now, updatedAt: record.updatedAt ?? now }) });
    }
    async putResourceIfMatch(key, expectedIntegrity, record) {
        if (!isNativeStorageKind(key.kind)) return this.base.putResourceIfMatch(key, expectedIntegrity, record);
        const existing = await this.getResource(key);
        if (expectedIntegrity === null ? existing !== null : !existing || existing.integrity !== expectedIntegrity) return { updated: false };
        await this.putResource(key, record); return { updated: true };
    }
    async deleteResource(key) {
        if (!isNativeStorageKind(key.kind)) return this.base.deleteResource(key);
        const normalized = this.checkedKey(key), existed = Boolean(await this.getResource(normalized));
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
        for (let i = 0; i < items.length; i++) {
            const item = items[i]; this.checkedKey(item.key);
            if (item.record) await this.base.putResource(item.key, item.record);
            else await this.base.deleteResource(item.key);
            await this.fault('install', i);
        }
    }
    async recover() {
        if (fs.existsSync(this.file)) {
            const journal = JSON.parse(fs.readFileSync(this.file, 'utf8'));
            if (journal.schemaVersion !== 1 || digest(journal.payload) !== journal.digest) throw new Error('Native commit journal integrity mismatch');
            await this.install(JSON.parse(journal.payload));
            durableRemove(this.file);
        }
        durableRemove(this.file + '.prepared');
    }
    async commit() {
        if (!this.writes.size) return;
        const items = [...this.writes.values()], payload = JSON.stringify(items);
        const prepared = this.file + '.prepared';
        await this.fault('prepare');
        durableWrite(prepared, JSON.stringify({ schemaVersion: 1, payload, digest: digest(payload) }));
        await this.fault('dependencies');
        fs.renameSync(prepared, this.file); syncDirectory(this.root);
        await this.fault('publish');
        await this.install(items);
        durableRemove(this.file);
        await this.fault('ack');
    }
}
