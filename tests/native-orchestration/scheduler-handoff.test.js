import { NativeTaskScheduler } from '../../src/native/task-scheduler.js';

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const turn = () => new Promise(resolve => setImmediate(resolve));
const expected = { owner: 'owner', anchor: { sessionId: 'session', branchId: 'branch', revisionId: 'revision' },
    kind: 'model_task', executionClass: 'interactive', resources: ['session:session'], key: 'parent', fingerprint: 'parent-source' };
const child = (run, extra = {}) => ({ kind: 'model_task', executionClass: 'interactive', resources: expected.resources,
    key: 'child', fingerprint: 'child-source', run, finalize: async value => value, fresh: async () => true, ...extra });
const submit = (scheduler, run, extra = {}) => scheduler.submit({ ...expected, run, finalize: async value => value, fresh: async () => true, ...extra });

test('original Scheduler yields all capacity to a same-resource child and restores the same opaque parent permit', async () => {
    const scheduler = new NativeTaskScheduler({ concurrency: 1, perResource: 1, timeoutMs: 1000 });
    let parentRuns = 0, childRuns = 0;
    const operation = submit(scheduler, async boundary => {
        parentRuns++;
        const result = await scheduler.withResourceHandoff(boundary, expected, child(async childBoundary => {
            childRuns++;
            expect(scheduler.running.size).toBe(1);
            expect(scheduler.suspended.size).toBe(1);
            expect(scheduler.project(expected.owner, boundary.operationId).status).toBe('waiting_child');
            expect(() => scheduler.assertActiveBoundary(boundary, expected)).toThrow(/boundary_denied/);
            expect(scheduler.assertFanoutControlBoundary(boundary, expected).operationId).toBe(boundary.operationId);
            expect(() => scheduler.assertFanoutControlBoundary(boundary, { ...expected, fingerprint: 'forged' })).toThrow(/boundary_denied/);
            boundary.onChunk({ text: 'No suspended stream' });
            expect(scheduler.project(expected.owner, boundary.operationId).status).toBe('waiting_child');
            expect(childBoundary.signal.aborted).toBe(false);
            return 'child observation';
        }));
        expect(scheduler.assertActiveBoundary(boundary, expected).attempt).toBe(0);
        return result;
    });
    await expect(operation.result).resolves.toBe('child observation');
    expect(parentRuns).toBe(1); expect(childRuns).toBe(1);
    expect(scheduler.running.size).toBe(0); expect(scheduler.suspended.size).toBe(0);
});

test.each(['owner', 'resource', 'priority', 'parent-key', 'forged-boundary'])('%s cannot broaden child scheduling scope or yield a forged permit', async mutation => {
    const scheduler = new NativeTaskScheduler({ concurrency: 1, perResource: 1, timeoutMs: 1000 });
    let childRuns = 0;
    const operation = submit(scheduler, async boundary => {
        const spec = child(async () => { childRuns++; });
        if (mutation === 'owner') spec.owner = 'foreign';
        if (mutation === 'resource') spec.resources = ['foreign-resource'];
        if (mutation === 'priority') spec.executionClass = 'turn_blocking';
        if (mutation === 'parent-key') spec.key = expected.key;
        await expect(scheduler.withResourceHandoff(mutation === 'forged-boundary' ? { ...boundary } : boundary, expected, spec)).rejects.toThrow();
        scheduler.assertActiveBoundary(boundary, expected);
        return 'denied';
    });
    await expect(operation.result).resolves.toBe('denied'); expect(childRuns).toBe(0);
});

test('failed child returns the parent permits but never triggers Scheduler automatic parent retry', async () => {
    const scheduler = new NativeTaskScheduler({ concurrency: 1, perResource: 1, timeoutMs: 1000, retries: 1, backoffMs: 1 });
    let parentRuns = 0, childRuns = 0;
    const operation = submit(scheduler, boundary => {
        parentRuns++;
        return scheduler.withResourceHandoff(boundary, expected, child(async () => {
            childRuns++; throw Object.assign(new Error('provider unavailable'), { code: 'generation_provider_failed' });
        }));
    });
    await expect(operation.result).rejects.toMatchObject({ code: 'operation_child_failed', cause: { code: 'generation_provider_failed' } });
    expect(parentRuns).toBe(1); expect(childRuns).toBe(1);
    expect(scheduler.running.size).toBe(0); expect(scheduler.suspended.size).toBe(0);
});

test('parent waits for reacquisition instead of oversubscribing a busy resource', async () => {
    const scheduler = new NativeTaskScheduler({ concurrency: 1, perResource: 1, timeoutMs: 1000 });
    const childStarted = deferred(), childRelease = deferred(), otherStarted = deferred(), otherRelease = deferred();
    let resumed = false;
    const parent = submit(scheduler, async boundary => {
        await scheduler.withResourceHandoff(boundary, expected, child(async () => { childStarted.resolve(); await childRelease.promise; }));
        resumed = true;
    });
    await childStarted.promise;
    const other = submit(scheduler, async () => { otherStarted.resolve(); await otherRelease.promise; }, { key: 'other', executionClass: 'turn_blocking' });
    childRelease.resolve(); await otherStarted.promise;
    await turn(); expect(resumed).toBe(false); expect(scheduler.running.size).toBe(1);
    otherRelease.resolve(); await Promise.all([other.result, parent.result]);
    expect(resumed).toBe(true); expect(scheduler.running.size).toBe(0);
});

test('parent cancellation propagates to child but retains an abort-ignoring worker until it settles', async () => {
    const scheduler = new NativeTaskScheduler({ concurrency: 1, perResource: 1, timeoutMs: 1000 });
    const started = deferred(), release = deferred(); let childBoundary, childFinalized = false, parentFinalized = false;
    const parent = submit(scheduler, boundary => scheduler.withResourceHandoff(boundary, expected, child(async value => {
        childBoundary = value; started.resolve(); await release.promise;
    }, { finalize: async () => { childFinalized = true; } })), { finalize: async () => { parentFinalized = true; } });
    await started.promise; scheduler.cancel(expected.owner, parent.operationId);
    await expect(parent.result).rejects.toMatchObject({ code: 'operation_cancelled' });
    expect(childBoundary.signal.aborted).toBe(true);
    await turn(); expect(scheduler.hasOwnerWork(expected.owner)).toBe(true); expect(scheduler.running.size).toBe(1);
    release.resolve(); await turn(); await turn();
    expect(scheduler.hasOwnerWork(expected.owner)).toBe(false); expect(scheduler.running.size).toBe(0);
    expect(childFinalized).toBe(false); expect(parentFinalized).toBe(false);
});

test('completed child key cannot be dispatched a second time by the same live parent', async () => {
    const scheduler = new NativeTaskScheduler({ concurrency: 1, perResource: 1, timeoutMs: 1000 });
    let childRuns = 0;
    const parent = submit(scheduler, async boundary => {
        const spec = child(async () => { childRuns++; });
        await scheduler.withResourceHandoff(boundary, expected, spec);
        await expect(scheduler.withResourceHandoff(boundary, expected, spec)).rejects.toMatchObject({ code: 'operation_handoff_duplicate' });
        scheduler.assertActiveBoundary(boundary, expected);
    });
    await parent.result; expect(childRuns).toBe(1);
});

test('child inherits the captured original source, not mutable caller expected fields', async () => {
    const scheduler = new NativeTaskScheduler({ concurrency: 1, perResource: 1, timeoutMs: 1000 });
    const request = structuredClone(expected);
    const parent = submit(scheduler, boundary => scheduler.withResourceHandoff(boundary, request, child(async childBoundary => {
        request.anchor.revisionId = 'caller mutation';
        expect(scheduler.project(expected.owner, childBoundary.operationId).anchor).toEqual(expected.anchor);
        return 'fixed original source';
    })));
    await expect(parent.result).resolves.toBe('fixed original source');
});

test('cancellation while waiting to reacquire removes only the parent continuation, not another worker', async () => {
    const scheduler = new NativeTaskScheduler({ concurrency: 1, perResource: 1, timeoutMs: 1000 });
    const childStarted = deferred(), childRelease = deferred(), otherStarted = deferred(), otherRelease = deferred();
    let parentResumed = false;
    const parent = submit(scheduler, async boundary => {
        await scheduler.withResourceHandoff(boundary, expected, child(async () => { childStarted.resolve(); await childRelease.promise; }));
        parentResumed = true;
    });
    await childStarted.promise;
    const other = submit(scheduler, async () => { otherStarted.resolve(); await otherRelease.promise; }, { key: 'other', executionClass: 'turn_blocking' });
    childRelease.resolve(); await otherStarted.promise; await turn();
    expect(scheduler.queue).toHaveLength(1);
    scheduler.cancel(expected.owner, parent.operationId);
    await expect(parent.result).rejects.toMatchObject({ code: 'operation_cancelled' }); await turn();
    expect(scheduler.queue).toHaveLength(0); expect(scheduler.running.size).toBe(1); expect(parentResumed).toBe(false);
    otherRelease.resolve(); await other.result;
    expect(scheduler.suspended.size).toBe(0); expect(scheduler.running.size).toBe(0);
});

test('parent cancellation never claims to undo a child already in its original finalizing boundary', async () => {
    const scheduler = new NativeTaskScheduler({ concurrency: 1, perResource: 1, timeoutMs: 1000 });
    const finalizing = deferred(), release = deferred(); let childCommitted = false, parentCommitted = false, childId;
    const parent = submit(scheduler, boundary => scheduler.withResourceHandoff(boundary, expected, child(async childBoundary => {
        childId = childBoundary.operationId; return 'observation';
    }, { finalize: async () => { finalizing.resolve(); await release.promise; childCommitted = true; return 'domain receipt'; } })),
    { finalize: async () => { parentCommitted = true; } });
    await finalizing.promise;
    scheduler.cancel(expected.owner, parent.operationId);
    await expect(parent.result).rejects.toMatchObject({ code: 'operation_cancelled' });
    expect(scheduler.project(expected.owner, childId).status).toBe('finalizing'); expect(scheduler.hasOwnerWork(expected.owner)).toBe(true);
    release.resolve(); await turn(); await turn();
    expect(childCommitted).toBe(true); expect(parentCommitted).toBe(false);
    expect(scheduler.project(expected.owner, childId).status).toBe('completed'); expect(scheduler.hasOwnerWork(expected.owner)).toBe(false);
});

test('Run navigation metadata requires the exact active worker and cannot switch to a different Run', async () => {
    const scheduler = new NativeTaskScheduler({ timeoutMs: 1000 });
    const runId = 'orun_' + 'a'.repeat(32);
    let capture;
    const operation = submit(scheduler, async boundary => {
        capture = boundary;
        expect(() => scheduler.associateRun({}, expected, runId)).toThrow(/boundary_denied/);
        scheduler.associateRun(boundary, expected, runId);
        scheduler.associateRun(boundary, expected, runId);
        expect(() => scheduler.associateRun(boundary, expected, 'orun_' + 'b'.repeat(32))).toThrow('operation_run_conflict');
        expect(scheduler.project(expected.owner, boundary.operationId).runId).toBe(runId);
        return 'done';
    });
    await operation.result;
    expect(() => scheduler.associateRun(capture, expected, runId)).toThrow(/boundary_denied/);
});
