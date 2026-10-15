import fs from 'node:fs';
import path from 'node:path';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { NativeHostOwner } from '../../src/storage/native-host-owner.js';
import { installAccountQuota, withAccountFileGrowth } from '../../src/storage/account-quota.js';
import { writeAccountFile } from '../../src/storage/account-file-write.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { nativeRecord } from '../../src/native/repositories/common.js';

describe.each(CONTRACT_HARNESSES)('$name original quota inside Host ownership', ({ make }) => {
    let h, limit;
    beforeEach(async () => {
        h = await make(); limit = -1;
        attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs,
            installTransactionPolicy: engine => installAccountQuota(engine, { directoriesByHandle: () => h.dirs, limit: async () => limit }) });
    });
    afterEach(async () => { await h?.engine.close(); await h?.cleanup(); });

    test('zero quota still permits bounded Host fencing and reads, but rejects the entire business metadata transaction', async () => {
        limit = 0;
        const key = { kind: K.orchestrationPlan, handle: h.handle, planId: createNativeId('orchestrationPlan') };
        const command = { kind: K.orchestrationCommand, handle: h.handle, commandId: createNativeId('orchestrationCommand') };
        expect(await h.engine.withTransaction(h.handle, tx => tx.getResource(key))).toBeNull();
        const fence = await h.engine.withTransaction(h.handle, tx => tx.getResource({ kind: K.hostFence, handle: h.handle }));
        expect(fence.doc).toMatchObject({ schemaVersion: 1, generation: 1 });
        await expect(h.engine.withTransaction(h.handle, async tx => {
            await tx.putResource(key, nativeRecord({ business: 'Plan' }));
            await tx.putResource(command, nativeRecord({ business: 'Command' }));
        })).rejects.toMatchObject({ code: 'storage_quota_exceeded' });
        expect(await h.engine.withTransaction(h.handle, tx => tx.getResource(key))).toBeNull();
        expect(await h.engine.withTransaction(h.handle, tx => tx.getResource(command))).toBeNull();
    });

    test('the first file publication obtains root/SQL ownership through the original quota path', async () => {
        const file = path.join(h.dirs.root, 'publication.bin');
        await writeAccountFile(h.handle, file, Buffer.from('only the original file writer'), h.engine);
        expect(fs.existsSync(path.join(h.dirs.root, 'native-host.identity'))).toBe(true);
        const other = new NativeHostOwner();
        try { await expect(other.acquireLocal(h.dirs.root)).rejects.toMatchObject({ code: 'native_orchestration_writer_unavailable' }); } finally { await other.close(); }
        expect(fs.readFileSync(file, 'utf8')).toBe('only the original file writer');
    });

    test('Engine shutdown drains original file publications before releasing the last Owner', async () => {
        let entered, release;
        const started = new Promise(resolve => { entered = resolve; });
        const gate = new Promise(resolve => { release = resolve; });
        const publication = withAccountFileGrowth(h.handle, 10, async () => { entered(); await gate; return 'published'; }, h.engine);
        await started;
        let closed = false;
        const closing = h.engine.close().then(() => { closed = true; });
        expect(closed).toBe(false);
        release(); expect(await publication).toBe('published'); await closing; expect(closed).toBe(true);
    });
});
