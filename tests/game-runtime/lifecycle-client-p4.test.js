import { afterEach, expect, jest, test } from '@jest/globals';
import { createNativeLifecycleClient } from '../../public/scripts/native/lifecycle-client.js';
import { NATIVE_SESSION_LIFECYCLE } from '../../public/scripts/native/session-lifecycle.js';

const clients = [];
const copy = value => structuredClone(value);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture({ tasks = false, ...options } = {}) {
    const contract = { lifecycleRuntime: { domains: [{ id: 'notes', scopeId: 'scene' }] },
        taskRuntime: { tasks: tasks ? [{ id: 'summary', bindingSlotId: 'model' }] : [] } };
    const snapshot = { session: { sessionId: 'session', packageId: 'package', packageVersionId: 'version', entryPointId: 'entry', packageContentHash: 'hash' },
        revision: { revisionId: 'r0', branchId: 'branch' }, timeline: [], manifest: { runtime: { experienceContract: contract } },
        states: { atri_lifecycle: { opening: { completed: false, step: null, history: [], values: {}, variant: null },
            scopes: { scene: { status: 'active', epoch: 0 } }, domains: { notes: { records: [] } }, outbox: [] } } };
    const runtime = { active: true, snapshot, host: { isGenerating: () => false },
        acceptOperationSnapshot: jest.fn(async value => { runtime.snapshot = copy(value); }) };
    let revision = 0;
    const transport = jest.fn(async (path, request) => {
        if (path.endsWith('/configuration')) return { routes: [{ runtimeRouteId: 'route' }] };
        if (path.endsWith('/lifecycle/prepare')) return { revisionId: runtime.snapshot.revision.revisionId, bindings: [] };
        const result = copy(runtime.snapshot); result.revision.revisionId = 'r' + ++revision;
        return path.endsWith('/generation/lifecycle') ? { snapshot: result, results: [] } : result;
    });
    const fetchImpl = jest.fn(async (path, request) => ({ ok: true, json: async () => transport(path, request) }));
    const emit = jest.fn(async () => {});
    const client = createNativeLifecycleClient({ runtime, fetchImpl, emit, headers: () => ({ 'X-CSRF-Token': 'fixture-only' }),
        getBindings: () => ({ model: { scope: 'player', runtimeRouteId: 'route' } }), ...options });
    clients.push(client);
    const packageState = { status: 'ready', active: true, sessionId: 'session',
        descriptor: { ...snapshot.session, experienceContract: contract } };
    return { runtime, client, transport, fetchImpl, emit, packageState };
}
async function loaded(f) { const load = f.client.beginLoad(); await load.prepare(f.packageState); await load.ready(); return load; }
afterEach(() => { clients.splice(0).forEach(client => client.cancel()); jest.useRealTimers(); });

test('Ready is distinct from Session loaded; one ready and one bounded pump after preparation', async () => {
    const f = fixture(); const load = f.client.beginLoad();
    expect(f.client.ready).toBe(false);
    expect(f.emit).not.toHaveBeenCalled();
    await expect(load.ready()).rejects.toThrow('not_prepared');
    await load.prepare(f.packageState);
    expect(f.emit).not.toHaveBeenCalled();
    await load.ready();
    expect(f.client.ready).toBe(true);
    expect(f.emit).toHaveBeenCalledWith(NATIVE_SESSION_LIFECYCLE.EXPERIENCE_READY, expect.objectContaining({ sessionId: 'session', revisionId: 'r0' }));
    expect(f.fetchImpl.mock.calls.map(call => JSON.parse(call[1].body).command.action.kind)).toEqual(['experience.ready', 'pump']);
    expect(f.runtime.acceptOperationSnapshot).toHaveBeenCalledTimes(2);
    await load.ready();
    expect(f.emit).toHaveBeenCalledTimes(1);
    f.client.cancel(); expect(f.client.ready).toBe(false);
});

test.each(['packageId', 'packageVersionId', 'entryPointId', 'packageContentHash'])('exact package mismatch %s never becomes ready', async key => {
    const f = fixture(); f.packageState.descriptor[key] = 'different'; const load = f.client.beginLoad();
    await expect(load.prepare(f.packageState)).rejects.toThrow('package_changed');
    await expect(load.ready()).rejects.toThrow('not_prepared');
    expect(f.emit).not.toHaveBeenCalled(); expect(f.fetchImpl).not.toHaveBeenCalled();
});

test('missing player Task route fails the barrier without a model or ready event', async () => {
    const f = fixture({ tasks: true, getBindings: () => ({}) }); const load = f.client.beginLoad();
    await expect(load.prepare(f.packageState)).rejects.toThrow('binding_missing');
    await expect(load.ready()).rejects.toThrow('not_prepared');
    expect(f.emit).not.toHaveBeenCalled(); expect(f.fetchImpl.mock.calls.map(call => call[0])).toEqual(['/api/native/generation/configuration']);
});

test('timeout races an ignored loader and superseded loads never emit ready', async () => {
    jest.useFakeTimers(); const f = fixture({ timeoutMs: 10 }); const load = f.client.beginLoad();
    await load.prepare(f.packageState);
    const wait = load.wait(new Promise(() => {})).catch(error => error);
    await jest.advanceTimersByTimeAsync(11); expect((await wait).message).toContain('timeout');
    await expect(load.ready()).rejects.toThrow('stale');
    const replacement = f.client.beginLoad(); await replacement.prepare(f.packageState); f.client.beginLoad();
    await expect(replacement.ready()).rejects.toThrow('stale'); expect(f.emit).not.toHaveBeenCalled();
});

test.each(['history', 'generation', 'failed'])('%s prevents writes and automatic readiness', async flag => {
    const f = fixture(); f.runtime[flag] = true; const load = f.client.beginLoad(); await load.prepare(f.packageState);
    const result = await load.ready().then(() => null, error => error.code);
    expect(result).toBe(flag === 'history' ? null : 'native_lifecycle_busy_or_historical');
    await expect(f.client.command({ kind: 'pump' })).rejects.toThrow('busy_or_historical');
    expect(f.fetchImpl).not.toHaveBeenCalled(); expect(f.emit).not.toHaveBeenCalled();
});

test('authenticated lifecycle command retries exact invocation, payload and expected revision', async () => {
    const f = fixture(); await loaded(f); f.fetchImpl.mockClear();
    const actual = f.fetchImpl.getMockImplementation(); f.fetchImpl.mockRejectedValueOnce(new Error('lost response')).mockImplementation(actual);
    const action = { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main', args: { text: 'A' } };
    await expect(f.client.command(action)).rejects.toThrow('lost response');
    await expect(f.client.command({ kind: 'pump' })).rejects.toThrow('retry_pending');
    await f.client.command(action);
    const [first, second] = f.fetchImpl.mock.calls;
    expect(first[0]).toBe('/api/native/session/command'); expect(first[1].body).toBe(second[1].body);
    expect(first[1].headers).toMatchObject({ 'X-CSRF-Token': 'fixture-only', 'Content-Type': 'application/json' });
    expect(JSON.parse(first[1].body)).toMatchObject({ expectedRevisionId: 'r2', command: { type: 'lifecycle', action, invocationId: expect.any(String) } });
});

test.each(['branch', 'revision', 'close', 'supersede'])('late response after %s is never installed', async change => {
    const f = fixture(); await loaded(f); const gate = deferred(); f.transport.mockImplementationOnce(() => gate.promise);
    const pending = f.client.command({ kind: 'pump' }); const rejection = pending.catch(error => error);
    const next = copy(f.runtime.snapshot); next.revision.revisionId = 'late';
    await Promise.resolve();
    if (change === 'branch') f.runtime.snapshot.revision.branchId = 'other';
    if (change === 'revision') f.runtime.snapshot.revision.revisionId = 'other';
    if (change === 'close') { f.runtime.active = false; f.client.cancel(); }
    if (change === 'supersede') f.client.beginLoad();
    gate.resolve(next); expect(await rejection).toBeInstanceOf(Error);
    expect(f.runtime.acceptOperationSnapshot).toHaveBeenCalledTimes(2);
});

test('snapshot acceptance is marked so host projection loads do not recursively ready/pump', async () => {
    const f = fixture(); f.runtime.acceptOperationSnapshot.mockImplementation(async snapshot => {
        expect(f.client.acceptingSnapshot).toBe(true); f.runtime.snapshot = copy(snapshot);
    });
    await loaded(f); expect(f.client.acceptingSnapshot).toBe(false); expect(f.fetchImpl).toHaveBeenCalledTimes(2);
});

test('only declared pending Tasks with player binding drain via the existing Host endpoint', async () => {
    const f = fixture({ tasks: true });
    f.runtime.snapshot.states.atri_lifecycle.outbox = [{ status: 'pending', taskId: 'summary', scopeId: 'scene' }];
    await loaded(f);
    const drain = f.fetchImpl.mock.calls.find(call => call[0] === '/api/native/generation/lifecycle');
    expect(JSON.parse(drain[1].body)).toEqual({ sessionId: 'session', revisionId: 'r2', slotBindings: { model: { scope: 'player', runtimeRouteId: 'route' } } });
    expect(f.runtime.acceptOperationSnapshot).toHaveBeenCalledTimes(3);
});

test('no outbox or a non-active scope never starts a model request', async () => {
    const f = fixture({ tasks: true }); await loaded(f);
    expect(f.fetchImpl.mock.calls.some(call => call[0].endsWith('/lifecycle'))).toBe(false);
    f.runtime.snapshot.states.atri_lifecycle.outbox = [{ status: 'pending', taskId: 'summary', scopeId: 'scene' }];
    f.runtime.snapshot.states.atri_lifecycle.scopes.scene.status = 'suspended';
    await expect(f.client.pump()).rejects.toThrow('task_unavailable');
    expect(f.fetchImpl.mock.calls.some(call => call[0].endsWith('/lifecycle'))).toBe(false);
});

test('application projection is copied, declared and active-scope only', () => {
    const f = fixture(); const state = f.runtime.snapshot.states.atri_lifecycle;
    state.domains.notes.records = [{ id: 'one', scopeId: 'scene', value: { text: 'visible' } }, { id: 'other', scopeId: 'hidden', value: { text: 'private' } }];
    const records = f.client.getApplicationRecords('notes'); expect(records).toHaveLength(1);
    records[0].value.text = 'edited'; expect(f.client.getApplicationRecords('notes')[0].value.text).toBe('visible');
    expect(f.client.getApplicationRecords('undeclared')).toEqual([]);
    state.scopes.scene.status = 'archived'; expect(f.client.getApplicationRecords('notes')).toEqual([]);
    f.runtime.active = false; expect(f.client.getApplicationRecords('notes')).toEqual([]);
});

test('partial Task drain failure reloads canonical HEAD without retrying the model or re-emitting ready', async () => {
    const f = fixture({ tasks: true }); await loaded(f);
    f.runtime.snapshot.states.atri_lifecycle.outbox = [{ status: 'pending', taskId: 'summary', scopeId: 'scene' }];
    const transport = f.transport.getMockImplementation();
    f.transport.mockImplementation((path, request) => { if (path.endsWith('/generation/lifecycle')) throw new Error('second Task failed'); return transport(path, request); });
    f.runtime.acceptOperationSnapshot.mockImplementation(async snapshot => {
        f.runtime.snapshot = copy(snapshot);
        if (f.runtime.acceptOperationSnapshot.mock.calls.length === 4) f.runtime.snapshot.states.atri_lifecycle.domains.notes.records.push({ id: 'first', scopeId: 'scene', value: { text: 'committed first Task' } });
    });
    await expect(f.client.pump()).rejects.toThrow('second Task failed');
    expect(f.client.getApplicationRecords('notes')).toHaveLength(1);
    expect(f.emit).toHaveBeenCalledTimes(1); expect(f.fetchImpl.mock.calls.filter(call => call[0].endsWith('/generation/lifecycle'))).toHaveLength(1);
});

test('Temporal projection separates declared WorldInstant, logical revision, wall clock and explicitly supplied Activity elapsed', async () => {
    let activity = null; const f = fixture({ wallNow: () => 1234, getActivityElapsed: () => activity }); await loaded(f);
    const state = f.runtime.snapshot.states.atri_lifecycle; state.logicalTime = 9; state.clocks = { world: 7, hidden: 8 };
    f.runtime.snapshot.manifest.runtime.experienceContract.lifecycleRuntime.clocks = [{ id: 'world' }];
    expect(f.client.getTemporalProjection().activity).toBeNull();
    activity = { activityId: 'activity_one', elapsedMs: 30 }; const before = copy(f.runtime.snapshot);
    expect(f.client.getTemporalProjection()).toEqual({ world: [{ clockId: 'world', tick: 7 }],
        logical: { revisionId: 'r2', sequence: 9 }, wall: { epochMs: 1234 }, activity: { activityId: 'activity_one', elapsedMs: 30 } });
    expect(f.runtime.snapshot).toEqual(before);
    activity = { activityId: 'invalid', elapsedMs: -1 }; expect(f.client.getTemporalProjection().activity).toBeNull();
});

test.each(['interaction.schedule', 'interaction.cancel', 'workflow.cancel', 'scheduled.cancel', 'app.pin'])('Host forwards typed %s through the single command route', async kind => {
    const f = fixture(); await loaded(f); await f.client.command({ kind });
    expect(JSON.parse(f.fetchImpl.mock.calls.at(-1)[1].body).command.action).toEqual({ kind });
});

test('canonical projection guard checks again after its network load, before changing Session state', async () => {
    const { NativeSessionRuntime } = await import('../../public/scripts/native/session-runtime.js');
    const runtime = new NativeSessionRuntime();
    const snapshot = { session: { sessionId: 'old' }, revision: { branchId: 'branch', revisionId: 'r' } };
    runtime.snapshot = snapshot; runtime.host = { install: jest.fn() };
    const gate = deferred(); runtime.request = jest.fn(() => gate.promise);
    let valid = true;
    const pending = runtime.acceptOperationSnapshot(snapshot, { acceptGuard: () => valid });
    const fresh = { session: { sessionId: 'new' } }; runtime.snapshot = fresh; valid = false;
    gate.resolve(snapshot);
    await expect(pending).rejects.toThrow('before projection install');
    expect(runtime.snapshot).toBe(fresh); expect(runtime.host.install).not.toHaveBeenCalled();
});


test('Task readiness performs read-only exact resource/capability preflight after route lookup', async () => {
    const f = fixture({ tasks: true }); const load = f.client.beginLoad(); await load.prepare(f.packageState);
    expect(f.fetchImpl.mock.calls.map(call => call[0])).toEqual(['/api/native/generation/configuration', '/api/native/generation/lifecycle/prepare']);
    const request = f.fetchImpl.mock.calls[1][1];
    expect(request.method).toBe('POST'); expect(request.headers['X-CSRF-Token']).toBe('fixture-only');
    expect(JSON.parse(request.body)).toEqual({ sessionId: 'session', revisionId: 'r0', slotBindings: { model: { scope: 'player', runtimeRouteId: 'route' } } });
    expect(f.emit).not.toHaveBeenCalled(); expect(f.runtime.acceptOperationSnapshot).not.toHaveBeenCalled();
    await load.ready(); expect(f.emit).toHaveBeenCalledTimes(1);
});

test('rejected exact Task resource/capability preflight never marks prepared or emits Ready', async () => {
    const f = fixture({ tasks: true }); const fetch = f.fetchImpl.getMockImplementation();
    f.fetchImpl.mockImplementation((path, request) => path.endsWith('/lifecycle/prepare')
        ? { ok: false, status: 422, json: async () => ({ error: 'native_task_capability_unsupported' }) } : fetch(path, request));
    const load = f.client.beginLoad();
    await expect(load.prepare(f.packageState)).rejects.toThrow('native_task_capability_unsupported');
    await expect(load.ready()).rejects.toThrow('not_prepared');
    expect(f.emit).not.toHaveBeenCalled(); expect(f.runtime.acceptOperationSnapshot).not.toHaveBeenCalled();
    expect(f.fetchImpl.mock.calls.map(call => call[0])).toEqual(['/api/native/generation/configuration', '/api/native/generation/lifecycle/prepare']);
});

test('stale read-only Task preflight result cannot pass Ready Barrier', async () => {
    const f = fixture({ tasks: true }); const transport = f.transport.getMockImplementation();
    f.transport.mockImplementation((path, request) => path.endsWith('/lifecycle/prepare') ? { revisionId: 'stale', bindings: [] } : transport(path, request));
    const load = f.client.beginLoad();
    await expect(load.prepare(f.packageState)).rejects.toThrow('stale'); await expect(load.ready()).rejects.toThrow('not_prepared');
    expect(f.emit).not.toHaveBeenCalled();
});
