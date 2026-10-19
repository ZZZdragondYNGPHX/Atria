import { Readable } from 'node:stream';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { nativeRecord } from '../../src/native/repositories/common.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

describe.each(CONTRACT_HARNESSES.filter(item => ['MysqlEngine', 'PgEngine'].includes(item.name)))('$name original administrative transactions', ({ make }) => {
    let h, lifecycle, key;
    beforeEach(async () => {
        h = await make();
        lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        key = { kind: K.runControl, handle: h.handle, sessionId: createNativeId('session') };
        await h.engine.withTransaction(h.handle, tx => tx.putResource(key, nativeRecord({ marker: 'original-domain-data' })));
    });
    afterEach(async () => { await h?.engine.close(); await h?.cleanup(); });

    test('dump/restore uses one fenced non-replayed transaction and retains destination Owner', async () => {
        const original = await h.engine.withTransaction(h.handle, tx => lifecycle.assertWriter(h.handle, tx));
        const chunks = [];
        for await (const chunk of await h.engine.dumpUser(h.handle)) chunks.push(Buffer.from(chunk));
        expect(Buffer.concat(chunks).toString('utf8')).not.toContain('atri_host_fence');
        await h.engine.withTransaction(h.handle, tx => tx.putResource(key, nativeRecord({ marker: 'changed' })));
        await h.engine.restoreUser(h.handle, Readable.from([Buffer.concat(chunks)]));
        const after = await h.engine.withTransaction(h.handle, tx => lifecycle.assertWriter(h.handle, tx));
        expect(after).toMatchObject({ hostBootId: original.hostBootId, ownerInstanceId: original.ownerInstanceId, generation: original.generation + 1 });
        expect((await h.engine.withTransaction(h.handle, tx => tx.getResource(key))).doc.marker).toBe('original-domain-data');
    });

    test('invalid streaming input rolls back the wipe and permits safe observation afterwards', async () => {
        await expect(h.engine.restoreUser(h.handle, Readable.from([Buffer.from('{invalid json}\n')]))).rejects.toThrow();
        expect((await h.engine.withTransaction(h.handle, tx => tx.getResource(key))).doc.marker).toBe('original-domain-data');
    });

    test('account row deletion preserves only the Owner control fence and advances future generation', async () => {
        const before = await h.engine.withTransaction(h.handle, tx => lifecycle.assertWriter(h.handle, tx));
        await h.engine.deleteUser(h.handle);
        expect(await h.engine.withTransaction(h.handle, tx => tx.getResource(key))).toBeNull();
        const after = await h.engine.withTransaction(h.handle, tx => lifecycle.assertWriter(h.handle, tx));
        expect(after.generation).toBe(before.generation + 1);
    });
});
