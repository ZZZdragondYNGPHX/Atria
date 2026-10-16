import { NativeTaskScheduler, nativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { captureNativeTurnPermit, assertNativeTurnPermit, captureNativeTurnFinalizationPermit, assertNativeTurnFinalizationPermit } from '../../src/native/orchestration/native-turn-permit.js';

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const anchor = { sessionId: 'session', branchId: 'branch', revisionId: 'revision' };
const expected = { owner: 'owner', anchor, kind: 'turn', executionClass: 'turn_blocking', key: 'session:invocation:turn',
    fingerprint: 'a'.repeat(64), resources: ['model:model', 'session:owner:session'] };
const issue = (host, selection, boundary, invocationId = 'invocation') => captureNativeTurnPermit({ host, selection, boundary,
    handle: 'owner', sessionId: 'session', anchor: { branchId: 'branch', revisionId: 'revision' }, invocationId,
    requestHash: 'a'.repeat(64), resources: expected.resources });
async function held(scheduler = new NativeTaskScheduler(), { spec = expected, onRun = () => {}, fail = false, retainResult = false } = {}) {
    const entered = deferred(), release = deferred(); let execution;
    const operation = scheduler.submit({ ...spec, fresh: async () => true, retry: false, retainResult,
        run: async boundary => { execution = boundary; await onRun(boundary); return 'actual prepared output'; },
        finalize: async (output, receipt, capture) => { entered.resolve({ capture, receipt }); await release.promise;
            if (fail) throw new Error('Actual finalizer failed');
            return retainResult ? { output, capture } : output;
        } });
    const frame = await entered.promise;
    return { scheduler, operation, execution, ...frame, release };
}
const finish = async fixture => { fixture.release.resolve(); return fixture.operation.result; };

test('the actual finalizer receives a distinct live scope while original resources remain held and generation stays denied', async () => {
    const f = await held();
    try {
        const active = f.scheduler.assertFinalizationBoundary(f.capture, f.execution, { ...expected, resources: [...expected.resources].reverse() });
        expect(active.operationId).toBe(f.operation.operationId); expect(active.signal).toBe(f.execution.signal); expect(Object.isFrozen(active)).toBe(true);
        expect(f.receipt).toMatchObject({ kind: 'model_delivery', operationId: f.operation.operationId, delivered: true });
        expect(f.scheduler.project('owner', f.operation.operationId).status).toBe('finalizing'); expect(f.scheduler.running.size).toBe(1);
        expect(f.scheduler.cancel('owner', f.operation.operationId)).toBe(false);
        expect(() => f.scheduler.assertActiveBoundary(f.execution, expected)).toThrow('operation_boundary_denied');
    } finally { await finish(f); }
    expect(() => f.scheduler.assertFinalizationBoundary(f.capture, f.execution, expected)).toThrow('operation_finalization_boundary_denied');
});

test('fake, cloned, foreign Scheduler/operation/execution and changed field claims cannot borrow finalization', async () => {
    const scheduler = new NativeTaskScheduler(), first = await held(scheduler);
    const secondExpected = { ...expected, key: 'other-operation' }, second = await held(scheduler, { spec: secondExpected });
    try {
        for (const capture of [{}, structuredClone(first.capture), first.execution])
            expect(() => scheduler.assertFinalizationBoundary(capture, first.execution, expected)).toThrow();
        expect(() => new NativeTaskScheduler().assertFinalizationBoundary(first.capture, first.execution, expected)).toThrow();
        expect(() => scheduler.assertFinalizationBoundary(first.capture, second.execution, expected)).toThrow();
        expect(() => scheduler.assertFinalizationBoundary(second.capture, first.execution, expected)).toThrow();
        expect(() => scheduler.assertFinalizationBoundary(first.capture, { ...first.execution }, expected)).toThrow();
        for (const changed of [{ ...expected, owner: 'foreign' }, { ...expected, resources: ['model:model'] }, { ...expected, key: 'foreign' },
            { ...expected, anchor: { ...anchor, revisionId: 'foreign' } }, { ...expected, executionClass: 'interactive' }, { ...expected, grant: true }])
            expect(() => scheduler.assertFinalizationBoundary(first.capture, first.execution, changed)).toThrow();
        const original = scheduler.operations.get(first.operation.operationId);
        scheduler.operations.delete(first.operation.operationId);
        expect(() => scheduler.assertFinalizationBoundary(first.capture, first.execution, expected)).toThrow();
        scheduler.operations.set(first.operation.operationId, original);
    } finally { await finish(first); await finish(second); }
});

test('a failing finalizer expires its scope and releases resources without retrying the prepared work', async () => {
    let runs = 0;
    const scheduler = new NativeTaskScheduler({ concurrency: 1, perResource: 1 }), f = await held(scheduler, { fail: true, onRun: () => { runs++; } });
    f.release.resolve(); await expect(f.operation.result).rejects.toThrow('Actual finalizer failed');
    expect(() => scheduler.assertFinalizationBoundary(f.capture, f.execution, expected)).toThrow(); expect(scheduler.running.size).toBe(0);
    const next = await held(scheduler, { spec: { ...expected, key: 'next' } }); await finish(next); expect(runs).toBe(1);
});

test('retained result data and a later finalizing operation do not reactivate an expired scope', async () => {
    const scheduler = new NativeTaskScheduler(), first = await held(scheduler, { retainResult: true });
    const returned = await finish(first), second = await held(scheduler, { spec: { ...expected, key: 'later' } });
    try {
        expect(returned.output).toBe('actual prepared output'); expect(returned.capture).toBe(first.capture);
        expect(() => scheduler.assertFinalizationBoundary(returned.capture, first.execution, expected)).toThrow();
        expect(() => scheduler.assertFinalizationBoundary(first.capture, second.execution, expected)).toThrow();
        expect(JSON.stringify(scheduler.project('owner', first.operation.operationId))).not.toContain('actual prepared output');
    } finally { await finish(second); }
});

test('a native Turn exchanges its original permit once for output finalization, with exact owner/Host/source/selection/resources', async () => {
    const host = { sessionCore: {} }, selection = {}, expectedPermit = { host, selection, handle: 'owner', sessionId: 'session',
        anchor: { branchId: 'branch', revisionId: 'revision' }, invocationId: 'invocation', requestHash: expected.fingerprint, requiredResources: expected.resources };
    let permit;
    const f = await held(nativeTaskScheduler, { onRun: boundary => { permit = issue(host, selection, boundary); } }); let output;
    try {
        output = captureNativeTurnFinalizationPermit({ permit, finalizationBoundary: f.capture });
        const active = assertNativeTurnFinalizationPermit(output, expectedPermit);
        expect(active.operationId).toBe(f.operation.operationId); expect(active.signal).toBe(f.execution.signal);
        expect(() => assertNativeTurnPermit(permit, expectedPermit)).toThrow();
        expect(() => captureNativeTurnFinalizationPermit({ permit, finalizationBoundary: f.capture })).toThrow();
        for (const scope of [{}, structuredClone(output), permit]) expect(() => assertNativeTurnFinalizationPermit(scope, expectedPermit)).toThrow();
        for (const changed of [{ ...expectedPermit, host: { sessionCore: {} } }, { ...expectedPermit, handle: 'foreign' }, { ...expectedPermit, selection: {} },
            { ...expectedPermit, anchor: { ...expectedPermit.anchor, revisionId: 'foreign' } }, { ...expectedPermit, requiredResources: ['foreign'] }, { ...expectedPermit, allowed: true }])
            expect(() => assertNativeTurnFinalizationPermit(output, changed)).toThrow();
    } finally { await finish(f); }
    expect(() => assertNativeTurnFinalizationPermit(output, expectedPermit)).toThrow();
});

test('running, copied original permits and another original Turn cannot mint the current finalization scope', async () => {
    const host = { sessionCore: {} }, selection = {}; let permit, earlyError;
    const first = await held(nativeTaskScheduler, { onRun: boundary => {
        permit = issue(host, selection, boundary);
        try { captureNativeTurnFinalizationPermit({ permit, finalizationBoundary: boundary }); } catch (error) { earlyError = error; }
    } });
    let foreign;
    const second = await held(nativeTaskScheduler, { spec: { ...expected, key: 'session:another:turn' },
        onRun: boundary => { foreign = issue(host, selection, boundary, 'another'); } });
    try {
        expect(earlyError).toMatchObject({ code: 'operation_finalization_boundary_denied' });
        expect(() => captureNativeTurnFinalizationPermit({ permit: structuredClone(permit), finalizationBoundary: first.capture })).toThrow();
        expect(() => captureNativeTurnFinalizationPermit({ permit: foreign, finalizationBoundary: first.capture })).toThrow();
        expect(() => captureNativeTurnFinalizationPermit({ permit, finalizationBoundary: first.capture, allowed: true })).toThrow();
        const valid = captureNativeTurnFinalizationPermit({ permit, finalizationBoundary: first.capture });
        expect(assertNativeTurnFinalizationPermit(valid, { host, selection, handle: 'owner' }).operationId).toBe(first.operation.operationId);
    } finally { await finish(first); await finish(second); }
});

test('a stale source at the original post-run check never enters finalization', async () => {
    const scheduler = new NativeTaskScheduler(); let current = true, finalized = false, execution;
    const operation = scheduler.submit({ ...expected, retry: false, fresh: async () => current,
        run: boundary => { execution = boundary; current = false; return 'discarded prepared output'; },
        finalize: () => { finalized = true; return 'invalid'; } });
    await expect(operation.result).rejects.toMatchObject({ code: 'operation_stale' }); expect(finalized).toBe(false);
    expect(() => scheduler.assertActiveBoundary(execution, expected)).toThrow(); expect(scheduler.running.size).toBe(0);
});
