import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SqliteTransaction } from './sqlite-engine-transaction.js';
import { initSchema } from './sqlite-schema.js';
import { FsNativeJournal } from './fs-native-journal.js';
import { decodeNativeJsonAsync } from './native-json-codec.js';
import { isNativeStorageKind, normalizeNativeResourceKey, nativeResourceFileId } from './native-resource-key.js';
import { resolveUserDirectory } from '../../constants.js';
import { durableMkdirAsync, syncDirectoryAsync } from '../durable-file.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../native/contracts.js';

export const NATIVE_DATABASE = 'atria-native/resources.sqlite';
export const NATIVE_PRE_WAL = 'atria-native/pre-wal-resources';
export const nativeDatabaseFile = relative => /^atria-native\/resources\.sqlite(?:-(?:wal|shm))?$/.test(relative.replaceAll('\\', '/'));
export const nativeSnapshotExcluded = relative => nativeDatabaseFile(relative)
    || relative.replaceAll('\\', '/').split('/').slice(0, 2).join('/') === NATIVE_PRE_WAL;

async function* resourceFiles(directory) {
    let entries;
    try { entries = await fsp.opendir(directory); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for await (const entry of entries) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) yield* resourceFiles(file);
        else if (entry.isSymbolicLink()) throw new Error('Native migration does not follow symbolic links');
        else if (entry.isFile() && entry.name.endsWith('.json')) yield file;
    }
}

// FS remains the legacy-file/blob engine. Native records use the existing SQL
// table and CAS implementation, with one FULL WAL commit per logical transaction.
export class FsNativeStore {
    static async open({ root, handle, files, directoriesByHandle, stateCache, fault }) {
        const file = path.join(root, NATIVE_DATABASE);
        await durableMkdirAsync(path.dirname(file));
        const store = new FsNativeStore(file, handle, directoriesByHandle, stateCache, fault);
        try {
            await store.migrate(root, files);
            return store;
        } catch (error) { store.close(); throw error; }
    }
    constructor(file, handle, directoriesByHandle, stateCache, fault) {
        this.db = new Database(file); this.handle = handle; this.stateCache = stateCache; this.fault = fault;
        try {
            this.db.pragma('journal_mode = WAL'); this.db.pragma('synchronous = FULL');
            if (this.db.pragma('journal_mode', { simple: true }) !== 'wal' || this.db.pragma('synchronous', { simple: true }) !== 2) throw new Error('Native WAL durability unavailable');
            this.db.pragma('wal_autocheckpoint = 1000');
            initSchema(this.db);
            this.db.exec('CREATE TABLE IF NOT EXISTS native_file_store (handle TEXT PRIMARY KEY, version INTEGER NOT NULL)');
            this.sql = new SqliteTransaction({ db: this.db, handle, directoriesByHandle });
        } catch (error) { this.db.close(); throw error; }
        this.directoriesByHandle = directoriesByHandle;
    }
    async migrate(root, files) {
        const owners = this.db.prepare('SELECT handle, version FROM native_file_store').all();
        if (owners.length && (owners.length !== 1 || owners[0].handle !== this.handle || owners[0].version !== 1)) throw new Error('Native store account/version mismatch');
        const directory = resolveUserDirectory(this.directoriesByHandle(this.handle), 'nativeResources');
        if (!owners.length) {
            // Finish any committed pre-upgrade transaction before importing its
            // files. The marker and all rows commit together; failure can retry.
            await new FsNativeJournal(files, root, this.handle, this.fault, this.stateCache).recover();
            this.db.exec('BEGIN IMMEDIATE');
            try {
                for await (const file of resourceFiles(directory)) {
                    const record = await decodeNativeJsonAsync(await fsp.readFile(file));
                    const key = normalizeNativeResourceKey(record.key);
                    const expected = path.join(directory, key.kind, ...(key.sessionId ? [key.sessionId] : []), nativeResourceFileId(key) + '.json');
                    if (key.handle !== this.handle || file !== expected || !Object.hasOwn(record, 'doc')) throw new Error('Invalid Native migration resource');
                    // Maintenance cursors name the old file ordering. Start a
                    // new reachability proof under the SQL ordering after import.
                    if (key.kind !== K.maintenance) await this.sql.putResource(key, record);
                    await this.fault('migrate-record');
                }
                this.db.prepare('INSERT INTO native_file_store VALUES (?, 1)').run(this.handle);
                await this.fault('migrate-commit');
                this.db.exec('COMMIT');
                await this.fault('migrated');
            } catch (error) { if (this.db.inTransaction) this.db.exec('ROLLBACK'); throw error; }
        }
        // Keep the pre-upgrade files as an explicitly inactive recovery copy.
        // Reads never fall back to it, so deletes cannot resurrect old records.
        if (fs.existsSync(directory)) {
            const retired = path.join(root, NATIVE_PRE_WAL);
            if (!(await fsp.readdir(directory)).length) await fsp.rmdir(directory);
            else {
                if (fs.existsSync(retired)) throw new Error('Native legacy files recreated beside the active WAL store');
                await fsp.rename(directory, retired);
            }
            await syncDirectoryAsync(path.dirname(directory));
        }
        this.version = this.db.pragma('data_version', { simple: true });
    }
    transaction(files) {
        const version = this.db.pragma('data_version', { simple: true });
        if (version !== this.version) { this.stateCache.clear(); this.version = version; }
        const methods = new Set(['getResource', 'getImmutableResource', 'putResource', 'putResourceIfMatch', 'deleteResource', 'listResources']);
        return new Proxy(files, { get: (target, name) => {
            if (name === 'nativeStateCache') return this.stateCache;
            if (name === 'getNativeResources') return keys => this.sql.getNativeResources(keys);
            if (methods.has(name)) return (key, ...args) => {
                if (!isNativeStorageKind(key.kind)) return target[name](key, ...args);
                if (key.handle !== this.handle) throw new TypeError('FS transaction handle mismatch');
                if (['putResource', 'putResourceIfMatch', 'deleteResource'].includes(name)) this.stateCache.delete([key.handle, key.sessionId, key.namespace, key.head].join('\0'));
                return this.sql[name](key, ...args);
            };
            const value = target[name]; return typeof value === 'function' ? value.bind(target) : value;
        } });
    }
    async run(files, operation) {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const result = await operation(this.transaction(files));
            await this.fault('commit');
            this.db.exec('COMMIT');
            await this.fault('ack');
            return result;
        } catch (error) {
            if (this.db.inTransaction) this.db.exec('ROLLBACK');
            this.stateCache.clear(); throw error;
        }
    }
    checkpoint() { return this.db.pragma('wal_checkpoint(TRUNCATE)'); }
    async backup(destination) { await this.db.backup(destination); }
    close() { this.sql.dispose(); this.db.close(); }
}
