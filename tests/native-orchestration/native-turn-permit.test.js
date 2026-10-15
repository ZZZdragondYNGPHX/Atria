import { NativeTaskScheduler, nativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { captureNativeTurnPermit, assertNativeTurnPermit } from '../../src/native/orchestration/native-turn-permit.js';

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const anchor = { sessionId: 'session', branchId: 'branch', revisionId: 'revision' };
const expected = { owner: 'owner', anchor, kind: 'turn', executionClass: 'turn_blocking', key: 'session:invocation:turn', fingerprint: 'a'.repeat(64), resources: ['model:model', 'session:owner:session'] };
const submit = (scheduler, extra) => scheduler.submit({ ...expected, fresh: async () => true, retry: false, finalize: async result => result, ...extra });
async function held(scheduler = new NativeTaskScheduler(), extra = {}) {
    const entered = deferred(), release = deferred();
    const operation = submit(scheduler, { run: async boundary => { entered.resolve(boundary); await release.promise; return 'done'; }, ...extra });
    const boundary = await entered.promise;
    return { scheduler, operation, boundary, release };
}
const finish = async f => { f.release.resolve(); await f.operation.result; };

test('only the original active and streaming boundary proves the exact original operation resources', async () => {
    const f = await held();
    try {
        const active = f.scheduler.assertActiveBoundary(f.boundary, { ...expected, resources: [...expected.resources].reverse() });
        expect(active).toMatchObject({ operationId: f.operation.operationId, attempt: 0 });
        expect(active.signal).toBe(f.boundary.signal); expect(Object.isFrozen(active)).toBe(true);
        f.boundary.onChunk({ text: 'provisional' });
        expect(f.scheduler.project('owner', f.operation.operationId).status).toBe('streaming');
        expect(f.scheduler.assertActiveBoundary(f.boundary, expected).operationId).toBe(f.operation.operationId);
    } finally { await finish(f); }
});

test('plain, JSON, another Scheduler and changed owner, source, key, policy or resources cannot borrow a boundary', async () => {
    const f = await held();
    try {
        for (const boundary of [{ ...f.boundary }, JSON.parse(JSON.stringify(f.boundary)), { signal: f.boundary.signal, operationId: f.operation.operationId }])
            expect(() => f.scheduler.assertActiveBoundary(boundary, expected)).toThrow('operation_boundary_denied');
        expect(() => new NativeTaskScheduler().assertActiveBoundary(f.boundary, expected)).toThrow('operation_boundary_denied');
        for (const altered of [{ owner: 'other' }, { anchor: { ...anchor, revisionId: 'other' } }, { key: 'other' }, { fingerprint: 'b'.repeat(64) },
            { resources: ['model:other'] }, { kind: 'model_task' }, { executionClass: 'interactive' }, { approved: true }])
            expect(() => f.scheduler.assertActiveBoundary(f.boundary, { ...expected, ...altered })).toThrow('operation_boundary_denied');
        expect(() => f.scheduler.assertActiveBoundary(f.boundary, { owner: 'owner' })).toThrow('operation_boundary_denied');
    } finally { await finish(f); }
});

test('completed un-aborted and evicted operations cannot transfer their former active boundary', async () => {
    const scheduler = new NativeTaskScheduler({ retention: 1 });
    const f = await held(scheduler); await finish(f);
    expect(f.boundary.signal.aborted).toBe(false);
    expect(() => scheduler.assertActiveBoundary(f.boundary, expected)).toThrow('operation_boundary_denied');
    const second = submit(scheduler, { key: 'another', run: async () => 'done' }); await second.result;
    expect(scheduler.operations.has(f.operation.operationId)).toBe(false);
    expect(() => scheduler.assertActiveBoundary(f.boundary, expected)).toThrow('operation_boundary_denied');
});

test('the uninterruptible finalizing phase is not another generation permit', async () => {
    const scheduler = new NativeTaskScheduler(), finalizing = deferred(), release = deferred(); let boundary;
    const operation = submit(scheduler, { run: async current => { boundary = current; return 'done'; },
        finalize: async value => { finalizing.resolve(); await release.promise; return value; } });
    await finalizing.promise;
    try {
        expect(boundary.signal.aborted).toBe(false);
        expect(scheduler.project('owner', operation.operationId).status).toBe('finalizing');
        expect(() => scheduler.assertActiveBoundary(boundary, expected)).toThrow('operation_boundary_denied');
    } finally { release.resolve(); await operation.result; }
});

test('a retry cannot reactivate the previous attempt boundary even with the same original operationId and signal', async () => {
    const scheduler = new NativeTaskScheduler({ retries: 1, backoffMs: 1 }), entered = deferred(), release = deferred(); let first, second;
    const operation = submit(scheduler, { retry: true, run: async boundary => {
        if (!first) { first = boundary; throw Object.assign(new Error('retry'), { code: 'generation_provider_failed' }); }
        second = boundary; entered.resolve(); await release.promise; return 'done';
    } });
    await entered.promise;
    try {
        expect(first.operationId).toBe(second.operationId); expect(first.signal).toBe(second.signal);
        expect(() => scheduler.assertActiveBoundary(first, expected)).toThrow('operation_boundary_denied');
        expect(scheduler.assertActiveBoundary(second, expected).attempt).toBe(1);
    } finally { release.resolve(); await operation.result; }
});

test('cancelled workers retain original resource occupancy until settlement but cannot use their boundary', async () => {
    const scheduler = new NativeTaskScheduler({ concurrency: 2, perResource: 1 });
    const f = await held(scheduler), secondEntered = deferred();
    const second = submit(scheduler, { key: 'second', run: async () => { secondEntered.resolve(); return 'done'; } });
    expect(scheduler.project('owner', second.operationId).status).toBe('queued');
    scheduler.cancel('owner', f.operation.operationId);
    await expect(f.operation.result).rejects.toMatchObject({ code: 'operation_cancelled' });
    expect(scheduler.running.size).toBe(1);
    expect(() => scheduler.assertActiveBoundary(f.boundary, expected)).toThrow('operation_boundary_denied');
    expect(scheduler.project('owner', second.operationId).status).toBe('queued');
    f.release.resolve(); await secondEntered.promise; await second.result;
    expect(scheduler.running.size).toBe(0);
});

test('a forged running projection without original running membership does not grant a boundary', async () => {
    const f = await held();
    const operation = f.scheduler.operations.get(f.operation.operationId);
    try {
        f.scheduler.running.delete(operation);
        expect(f.scheduler.project('owner', f.operation.operationId).status).toBe('running');
        expect(() => f.scheduler.assertActiveBoundary(f.boundary, expected)).toThrow('operation_boundary_denied');
    } finally { f.scheduler.running.add(operation); await finish(f); }
});

test('original Map identity and an un-aborted original controller are both required even with a running projection', async () => {
    const f = await held(), operation = f.scheduler.operations.get(f.operation.operationId);
    try {
        f.scheduler.operations.set(f.operation.operationId, { ...operation });
        expect(() => f.scheduler.assertActiveBoundary(f.boundary, expected)).toThrow('operation_boundary_denied');
        f.scheduler.operations.set(f.operation.operationId, operation);
        operation.controller.abort();
        expect(f.scheduler.project('owner', f.operation.operationId).status).toBe('running');
        expect(() => f.scheduler.assertActiveBoundary(f.boundary, expected)).toThrow('operation_boundary_denied');
    } finally { f.scheduler.operations.set(f.operation.operationId, operation); f.release.resolve(); }
    await expect(f.operation.result).rejects.toMatchObject({ code: 'operation_cancelled' });
});

test('original Turn permit fixes Host, selection, invocation, source and exact resources, and expires without abort', async () => {
    const f = await held(nativeTaskScheduler), host = { sessionCore: {} }, selection = Object.freeze({});
    const input = { host, handle: 'owner', sessionId: 'session', anchor: { branchId: 'branch', revisionId: 'revision' }, invocationId: 'invocation',
        requestHash: expected.fingerprint, selection, boundary: f.boundary, resources: expected.resources };
    let permit;
    try {
        permit = captureNativeTurnPermit(input);
        expect(assertNativeTurnPermit(permit, { host, selection, requiredResources: ['model:model'] }).signal).toBe(f.boundary.signal);
        for (const altered of [{ host: { sessionCore: {} } }, { selection: {} }, { handle: 'other' }, { sessionId: 'other' },
            { anchor: { branchId: 'branch', revisionId: 'other' } }, { invocationId: 'other' }, { requestHash: 'b'.repeat(64) },
            { requiredResources: ['model:other'] }, { signal: f.boundary.signal }])
            expect(() => assertNativeTurnPermit(permit, altered)).toThrow('native_orchestration_turn_permit_denied');
        for (const copy of [{}, structuredClone(permit), JSON.parse(JSON.stringify(permit))])
            expect(() => assertNativeTurnPermit(copy)).toThrow('native_orchestration_turn_permit_denied');
        expect(() => captureNativeTurnPermit({ ...input, resources: ['model:other'] })).toThrow('operation_boundary_denied');
    } finally { await finish(f); }
    expect(f.boundary.signal.aborted).toBe(false);
    expect(() => assertNativeTurnPermit(permit)).toThrow('operation_boundary_denied');
});
