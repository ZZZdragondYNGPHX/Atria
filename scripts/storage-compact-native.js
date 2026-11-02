#!/usr/bin/env node
// Offline, lossless SQLite/FS Native compaction. Never drops history or backups.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { NativeHostOwner } from '../src/storage/native-host-owner.js';
import { initSchema } from '../src/storage/engines/sqlite-schema.js';
import { compressNativeRows } from '../src/storage/engines/sqlite-native-compression.js';

async function main() {
    const { values } = parseArgs({ options: {
        'data-root': { type: 'string' }, handle: { type: 'string' }, engine: { type: 'string', default: 'fs' }, help: { type: 'boolean' },
    } });
    if (values.help) {
        console.log('Usage: node scripts/storage-compact-native.js --data-root <path> --handle <handle> [--engine fs|sqlite]\n'
            + 'Stop the Host first. Acquires its existing data/account ownership guards, takes a SQLite backup,\n'
            + 'encodes old Native JSON rows losslessly, then VACUUMs the database. Does not remove any rows.\n'
            + 'Backup stays in <data-root>/_storage-compactions/. Allow space for the backup and VACUUM.\n'
            + 'Requires a host supporting SQLite schema v3 afterwards; older hosts must use the backup.');
        return;
    }
    const handle = values.handle;
    if (!values['data-root'] || !handle || !/^[a-zA-Z0-9_-]+$/.test(handle) || !['fs', 'sqlite'].includes(values.engine)) throw new TypeError('Explicit data-root, safe handle and fs/sqlite engine required');
    const root = fs.realpathSync(values['data-root']);
    const account = fs.realpathSync(path.join(root, handle));
    const file = fs.realpathSync(path.join(account, values.engine === 'fs' ? 'atria-native/resources.sqlite' : 'atria-storage.sqlite'));
    const within = (parent, child) => { const relative = path.relative(parent, child); return relative && !relative.startsWith('..') && !path.isAbsolute(relative); };
    if (!within(root, account) || !within(account, file)) throw new Error('Database must stay inside the named data root and account');
    const owner = new NativeHostOwner();
    let db;
    try {
        await owner.acquireLocal(root);
        await owner.acquireLocal(account);
        db = new Database(file, { fileMustExist: true });
        const beforeBytes = db.pragma('page_count', { simple: true }) * db.pragma('page_size', { simple: true });
        const backupDirectory = path.join(root, '_storage-compactions', randomUUID());
        fs.mkdirSync(backupDirectory, { recursive: true });
        const backup = path.join(backupDirectory, path.basename(file));
        await db.backup(backup);
        console.log(JSON.stringify({ backup, beforeBytes }));
        owner.assertActive();
        db.pragma('synchronous = FULL');
        initSchema(db);
        const count = db.prepare('SELECT count(*) AS n FROM native_resources').get().n;
        let rows = 0, logicalBytes = 0, encodedBytes = 0, result;
        const slice = db.transaction(() => compressNativeRows(db, handle));
        do {
            owner.assertActive();
            result = slice(); rows += result.rows; logicalBytes += result.beforeBytes; encodedBytes += result.afterBytes;
            await new Promise(resolve => setImmediate(resolve));
        } while (!result.done);
        owner.assertActive();
        // Only this explicit offline path performs the one-time full rebuild.
        db.pragma('auto_vacuum = INCREMENTAL');
        db.exec('VACUUM');
        db.pragma('wal_checkpoint(TRUNCATE)');
        if (db.prepare('SELECT count(*) AS n FROM native_resources').get().n !== count || db.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('Compaction verification failed; retain the backup');
        console.log(JSON.stringify({ rows, logicalBytes, encodedBytes, beforeBytes, afterBytes: fs.statSync(file).size, backup }));
    } finally {
        db?.close();
        await owner.close();
    }
}

main().catch(error => { console.error(error.code ?? error.name, error.message); process.exitCode = 1; });
