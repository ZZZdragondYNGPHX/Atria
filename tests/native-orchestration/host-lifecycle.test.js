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

    test('storage handover shares Host and SQL lifetime ownership until every participating Engine has drained', async () => {
        const before = await h.engine.withTransaction(h.handle, tx => lifecycle.assertWriter(h.handle, tx));
        const sibling = new h.engine.constructor({ url: h.engine._nativeOwnerUrl, poolSize: 1, directoriesByHandle: () => h.dirs });
        extras.push(sibling);
        const second = lifecycle.attachStorageEngine(sibling);
        const after = await sibling.withTransaction(h.handle, tx => second.assertWriter(h.handle, tx));
        expect(after.hostBootId).toBe(before.hostBootId);
        expect(after.generation).toBe(before.generation + 1);
        await expect(h.engine.withTransaction(h.handle, async () => {})).rejects.toMatchObject({ code: 'native_orchestration_writer_unavailable' });
        await h.engine.close();
        await expect(sibling.withTransaction(h.handle, async () => 'still-owned')).resolves.toBe('still-owned');
        const independent = new h.engine.constructor({ url: h.engine._nativeOwnerUrl, poolSize: 1, directoriesByHandle: () => h.dirs });
        extras.push(independent);
        attachNativeHostLifecycle(independent, { directoriesByHandle: () => h.dirs });
        await expect(independent.withTransaction(h.handle, async () => {})).rejects.toMatchObject({ code: 'native_orchestration_writer_unavailable' });
        await independent.close();
        await sibling.close();
        const reopened = new h.engine.constructor({ url: h.engine._nativeOwnerUrl, poolSize: 1, directoriesByHandle: () => h.dirs });
        extras.push(reopened);
        attachNativeHostLifecycle(reopened, { directoriesByHandle: () => h.dirs });
        await expect(reopened.withTransaction(h.handle, async () => 'new-owner')).resolves.toBe('new-owner');
    });

    test('maintenance drains admitted writes, blocks external transactions, and only retires after successful copy', async () => {
        let releaseWrite, enteredWrite;
        const entered = new Promise(resolve => { enteredWrite = resolve; });
        const gate = new Promise(resolve => { releaseWrite = resolve; });
        const write = h.engine.withTransaction(h.handle, async () => { enteredWrite(); await gate; });
        await entered;
        let enteredMaintenance = false, releaseMaintenance, maintenanceEntered;
        const holding = new Promise(resolve => { releaseMaintenance = resolve; });
        const started = new Promise(resolve => { maintenanceEntered = resolve; });
        const copying = lifecycle.withMaintenance(async () => {
            enteredMaintenance = true; maintenanceEntered();
            await holding;
            return h.engine.withTransaction(h.handle, async () => 'copied');
        });
        expect(enteredMaintenance).toBe(false);
        await expect(h.engine.withTransaction(h.handle, async () => {})).rejects.toMatchObject({ code: 'native_orchestration_writer_unavailable' });
        releaseWrite(); await write; await started;
        await expect(h.engine.withTransaction(h.handle, async () => {})).rejects.toMatchObject({ code: 'native_orchestration_writer_unavailable' });
        releaseMaintenance(); expect(await copying).toBe('copied');
        await expect(h.engine.withTransaction(h.handle, async () => 'resumed')).resolves.toBe('resumed');
        await expect(lifecycle.withMaintenance(async () => { throw new Error('controlled copy failure'); }, { retireWhen: () => true })).rejects.toThrow('copy failure');
        await expect(h.engine.withTransaction(h.handle, async () => 'not-retired')).resolves.toBe('not-retired');
        await lifecycle.withMaintenance(async () => true, { retireWhen: result => result });
        await expect(h.engine.withTransaction(h.handle, async () => {})).rejects.toMatchObject({ code: 'native_orchestration_writer_unavailable' });
        const replacement = new h.engine.constructor({ url: h.engine._nativeOwnerUrl, poolSize: 1, directoriesByHandle: () => h.dirs });
        extras.push(replacement);
        lifecycle.attachStorageEngine(replacement);
        await h.engine.close();
        await expect(replacement.withTransaction(h.handle, async () => 'replacement')).resolves.toBe('replacement');
    });
});
