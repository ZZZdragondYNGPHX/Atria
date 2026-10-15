import fs from 'node:fs';
import path from 'node:path';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { nativeRecord } from '../../src/native/repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

describe.each(CONTRACT_HARNESSES)('$name shared Native Host ownership', ({ make }) => {
    let h, lifecycle, inspect;
    const extras = [];
    beforeEach(async () => {
        h = await make();
        inspect = h.engine.withTransaction.bind(h.engine);
        lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
    });
    afterEach(async () => {
        for (const engine of extras.splice(0)) await engine.close();
        await h?.engine.close();
        await h?.cleanup();
    });

    test('original domain and V3 writes share the same durable fence, including nested repository transactions', async () => {
        let oldTransaction;
        const key = { kind: K.orchestrationRun, handle: h.handle, runId: createNativeId('orchestrationRun') };
        const receipt = await h.engine.withTransaction(h.handle, async tx => {
            oldTransaction = tx;
            const fence = await lifecycle.assertWriter(h.handle, tx);
            await h.engine.withTransaction(h.handle, nested => {
                expect(nested).toBe(tx);
                return nested.putResource(key, nativeRecord({ marker: 'native-domain' }));
            });
            return fence;
        });
        expect(receipt).toMatchObject({ schemaVersion: 1, hostBootId: lifecycle.hostBootId, generation: 1 });
        expect((await h.engine.withTransaction(h.handle, tx => tx.getResource(key))).doc.marker).toBe('native-domain');
        await expect(lifecycle.assertWriter(h.handle, {})).rejects.toMatchObject({ code: 'native_orchestration_writer_unavailable' });
        expect(() => oldTransaction.putResource(key, nativeRecord({ late: true }))).toThrow();
    });

    test('ownership loss rejects original writes and rolls back the whole pending transaction', async () => {
        const key = { kind: K.orchestrationCommand, handle: h.handle, commandId: createNativeId('orchestrationCommand') };
        await expect(h.engine.withTransaction(h.handle, async tx => {
            await tx.putResource(key, nativeRecord({ shouldNotCommit: true }));
            lifecycle.invalidate();
        })).rejects.toMatchObject({ code: 'native_orchestration_writer_unavailable' });
        expect(await inspect(h.handle, tx => tx.getResource(key))).toBeNull();
        await expect(h.engine.withTransaction(h.handle, tx => tx.getResource(key))).rejects.toMatchObject({ code: 'native_orchestration_writer_unavailable' });
    });

    test('second Host cannot open the same root; SQL also rejects a different root for the same actual database', async () => {
        await h.engine.withTransaction(h.handle, async () => {});
        for (const alternate of ['same', ...(['mysql', 'postgres'].includes(h.engine.kind) ? ['different'] : [])]) {
            const root = alternate === 'same' ? h.dirs.root : path.join(h.dataRoot, 'other-root');
            fs.mkdirSync(root, { recursive: true });
            const other = new h.engine.constructor({ url: h.engine._nativeOwnerUrl, poolSize: 1, directoriesByHandle: () => ({ ...h.dirs, root }) });
            extras.push(other);
            attachNativeHostLifecycle(other, { directoriesByHandle: () => ({ ...h.dirs, root }) });
            await expect(other.withTransaction(h.handle, async () => {})).rejects.toMatchObject({ code: 'native_orchestration_writer_unavailable' });
        }
    });

    test('close drains an in-flight transaction before releasing the lifetime owner', async () => {
        let release, started;
        const entered = new Promise(resolve => { started = resolve; });
        const pause = new Promise(resolve => { release = resolve; });
        const operation = h.engine.withTransaction(h.handle, async () => { started(); await pause; return 'committed'; });
        await entered;
        let closed = false;
        const closing = h.engine.close().then(() => { closed = true; });
        expect(closed).toBe(false);
        await expect(h.engine.withTransaction(h.handle, async () => {})).rejects.toMatchObject({ code: 'native_orchestration_writer_unavailable' });
        release();
        expect(await operation).toBe('committed');
        await closing;
        expect(closed).toBe(true);
    });

    test('reopen advances the fence and SQL lifetime ownership leaves a pool of one free for business', async () => {
        const before = await h.engine.withTransaction(h.handle, tx => lifecycle.assertWriter(h.handle, tx));
        await h.engine.close();
        const reopened = new h.engine.constructor({ url: h.engine._nativeOwnerUrl, poolSize: 1, directoriesByHandle: () => h.dirs });
        extras.push(reopened);
        const next = attachNativeHostLifecycle(reopened, { directoriesByHandle: () => h.dirs });
        const after = await reopened.withTransaction(h.handle, tx => next.assertWriter(h.handle, tx));
        expect(after.generation).toBe(before.generation + 1);
        expect(after.ownerInstanceId).toBe(before.ownerInstanceId);
        expect(after.hostBootId).not.toBe(before.hostBootId);
    });
});
