import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import mysql from 'mysql2/promise';
import pg from 'pg';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { nativeRecord } from '../../src/native/repositories/common.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

describe.each(CONTRACT_HARNESSES.filter(item => ['MysqlEngine', 'PgEngine'].includes(item.name)))('$name actual Owner connection loss', ({ make }) => {
    test('losing the dedicated database session fences the old Host; a new Owner can read committed truth', async () => {
        const h = await make();
        let next;
        try {
            const lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
            const key = { kind: K.runControl, handle: h.handle, sessionId: createNativeId('session') };
            await h.engine.withTransaction(h.handle, tx => tx.putResource(key, nativeRecord({ marker: 'committed-before-loss' })));
            let signal;
            // Observe the original permit after terminating only the dedicated
            // Owner session identified by our test database's advisory lock.
            const lost = new Promise(resolve => { signal = resolve; });
            const waitForLoss = setInterval(() => { try { lifecycle.assertActive(); } catch { signal(); } }, 10);
            try {
                if (h.engine.kind === 'mysql') {
                    const connection = await mysql.createConnection(h.engine._nativeOwnerUrl);
                    try {
                        const [database] = await connection.query('SELECT DATABASE() AS databaseName');
                        const lockName = 'atria.native-host.' + createHash('sha256').update(database[0].databaseName).digest('hex').slice(0, 40);
                        const [rows] = await connection.execute('SELECT IS_USED_LOCK(?) AS ownerId', [lockName]);
                        if (!Number.isSafeInteger(rows[0].ownerId) || rows[0].ownerId < 1) throw new Error('Expected our test database Owner session');
                        await connection.query('KILL CONNECTION ?', [rows[0].ownerId]);
                    } finally { await connection.end(); }
                } else {
                    const connection = new pg.Client({ connectionString: h.engine._nativeOwnerUrl });
                    await connection.connect();
                    try {
                        const digest = createHash('sha256').update('atria.native-host-owner.v1').digest();
                        const { rows } = await connection.query("SELECT pid FROM pg_locks WHERE locktype = 'advisory' AND granted AND objsubid = 2 AND classid = $1::oid AND objid = $2::oid AND database = (SELECT oid FROM pg_database WHERE datname = current_database())", [digest.readUInt32BE(0), digest.readUInt32BE(4)]);
                        if (rows.length !== 1 || !Number.isSafeInteger(rows[0].pid)) throw new Error('Expected exactly our test database Owner session');
                        await connection.query('SELECT pg_terminate_backend($1)', [rows[0].pid]);
                    } finally { await connection.end(); }
                }
                let timeout;
                try { await Promise.race([lost, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Owner loss did not fence Host')), 3000); })]); } finally { clearTimeout(timeout); }
            } finally { clearInterval(waitForLoss); }
            await expect(h.engine.withTransaction(h.handle, tx => tx.putResource(key, nativeRecord({ marker: 'old-writer' })))).rejects.toMatchObject({ code: 'native_orchestration_writer_unavailable' });
            const root = path.join(h.dataRoot, 'new-owner');
            fs.mkdirSync(root, { recursive: true });
            next = new h.engine.constructor({ url: h.engine._nativeOwnerUrl, nativeHostTopology: h.engine.nativeHostTopology, poolSize: 1 });
            attachNativeHostLifecycle(next, { directoriesByHandle: () => ({ ...h.dirs, root }) });
            expect((await next.withTransaction(h.handle, tx => tx.getResource(key))).doc.marker).toBe('committed-before-loss');
        } finally { await next?.close(); await h.engine.close(); await h.cleanup(); }
    });
});
