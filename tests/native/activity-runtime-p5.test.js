import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { openActivity } from './helpers/activity-fixture.js';
import { services } from './helpers/session-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';

const state = base => base.states.atri_lifecycle;
const activity = base => state(base).activities?.[0];
const settle = (extra = {}) => ({ kind: 'activity.settle', instanceId: 'play-1', runEpoch: 0, activityElapsedMs: 1200, outcome: { text: 'won' }, ...extra });
describe.each(CONTRACT_HARNESSES)('P5 Activity / $name', ({ make }) => {
    let h, f, base, serial;
    beforeEach(async () => { h = await make(); serial = 0; });
    afterEach(async () => { jest.restoreAllMocks(); await h?.cleanup(); });
    const open = async configure => { ({ f, base } = await openActivity(h, configure)); };
    const command = async (action, invocationId = `p5-${++serial}`, snapshot = base) => {
        base = await f.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId, action }, { expectedRevisionId: snapshot.revision.revisionId }); return base;
    };
    const ready = async () => { await command({ kind: 'experience.ready' }); await command({ kind: 'activity.start', activityId: 'encounter', instanceId: 'play-1' }); };
    const read = () => f.core.load(h.handle, base.session.sessionId);
    const finalize = (payload = 'The contest is over.', snapshot = base) => f.core.recordTaskResult(h.handle, snapshot.session.sessionId,
        { invocationId: state(snapshot).outbox[0].invocationId, taskId: 'summarize', variantId: 'default', payload,
            fingerprint: 'fixture', deliveryReceipt: { kind: 'model_delivery', delivered: true } }, { expectedRevisionId: snapshot.revision.revisionId });

    test('Ready gates start; fixed App settlement commits facts and Observation before any Narrator', async () => {
        await open(); await expect(command({ kind: 'activity.start', activityId: 'encounter', instanceId: 'play-1' })).rejects.toThrow('Ready');
        await ready(); const timeline = base.timeline; const clocks = state(base).clocks;
        await command(settle(), 'settle');
        expect(state(base).domains.notes.records[0].value).toEqual({ text: 'won' });
        expect(activity(base)).toMatchObject({ status: 'settled', activityElapsedMs: 1200, observation: {
            committedRevisionId: base.revision.revisionId, branchId: base.revision.branchId, outcome: { text: 'won' } } });
        expect(state(base).outbox[0].input).toEqual({ observation: activity(base).observation });
        expect(base.timeline).toEqual(timeline); expect(state(base).clocks).toEqual(clocks);
        const settled = base; await command(settle(), 'settle', settled); expect(base.revision).toEqual(settled.revision);
        await expect(command(settle(), 'second-settle')).rejects.toThrow('Stale'); expect(await read()).toMatchObject({ revision: settled.revision });
    });
    test('string Narrator, task result, immutable narrative and authority receipt publish once', async () => {
        await open(); await ready(); await command(settle()); const before = base;
        const result = await finalize(); expect(result.timeline).toHaveLength(before.timeline.length + 1);
        expect(result.variants.find(item => item.variantId === result.timeline.at(-1).activeVariantId).content).toBe('The contest is over.');
        expect(activity(result).status).toBe('completed'); expect(activity(result).observation).toEqual(activity(before).observation);
        expect(result.states.atri_task_results.records[0]).toMatchObject({ kind: 'task', status: 'completed',
            authorityReceipt: { kind: 'authority', activityInstanceId: 'play-1' }, deliveryReceipt: { kind: 'model_delivery' } });
        await expect(finalize('duplicate', result)).rejects.toThrow();
    });
    test.each([NaN, -1, 1.5, 604800001, Infinity])('rejects invalid elapsed %s atomically', async value => {
        await open(); await ready(); const before = base; await expect(command(settle({ activityElapsedMs: value }))).rejects.toThrow();
        expect((await read()).states).toEqual(before.states);
    });
    test('pause/resume is explicit, persisted elapsed excludes downtime and old run epochs', async () => {
        await open(); await ready(); await command({ kind: 'activity.pause', instanceId: 'play-1', runEpoch: 0, activityElapsedMs: 300 });
        await expect(command(settle())).rejects.toThrow();
        f.core = services(h).core; base = await read(); expect(activity(base).activityElapsedMs).toBe(300);
        await command({ kind: 'activity.resume', instanceId: 'play-1' }); expect(activity(base).runEpoch).toBe(1);
        await expect(command(settle())).rejects.toThrow('Stale');
        await expect(command(settle({ runEpoch: 1, activityElapsedMs: 299 }))).rejects.toThrow();
        await command(settle({ runEpoch: 1, activityElapsedMs: 700 })); expect(activity(base).observation.activityElapsedMs).toBe(700);
    });
    test.each(['cancel', 'scope'])('%s after settlement keeps facts and closes late Narrator', async mode => {
        await open(); await ready(); await command(settle()); const pending = base;
        await command(mode === 'cancel' ? { kind: 'activity.cancel', instanceId: 'play-1' } : { kind: 'scope.transition', scopeId: 'session', status: 'suspended' });
        expect(state(base).domains.notes.records[0].value).toEqual({ text: 'won' });
        expect(state(base).outbox).toEqual([]); expect(activity(base).status).toBe(mode === 'cancel' ? 'cancelled' : 'stale');
        await expect(finalize('late', pending)).rejects.toThrow(); expect((await read()).timeline).toEqual(pending.timeline);
    });
    test('typed outcome failure rolls back facts, elapsed and receipts', async () => {
        await open(); await ready(); const before = base;
        await expect(command(settle({ outcome: { text: 'bad', patch: {} } }))).rejects.toThrow();
        await expect(command({ ...settle(), commandId: 'heal' })).rejects.toThrow();
        expect((await read()).states).toEqual(before.states);
    });
    test('Narrator input schema failure leaves no partial settlement', async () => {
        await open(value => { value.taskRuntime.tasks[0].inputSchema.properties.observation.properties.outcome.properties.text.maxLength = 2; });
        await ready(); const before = base; await expect(command(settle())).rejects.toThrow(); expect((await read()).states).toEqual(before.states);
    });
    test('World settlement reuses pinned Command/Rule/Reducer, does not advance clocks', async () => {
        await open(value => { const item = value.presentationRuntime.activities[0]; delete item.narrator;
            item.outcomeSchema = { type: 'object', properties: { amount: { type: 'integer', minimum: 1, maximum: 5 } }, required: ['amount'], additionalProperties: false };
            item.settlement = { kind: 'world.command', commandId: 'heal' }; });
        await ready(); const hp = base.states.atri_world_state.worlds[f.worldId].state.hp;
        await command(settle({ outcome: { amount: 2 } })); expect(base.states.atri_world_state.worlds[f.worldId].state.hp).toBe(hp + 2);
        expect(activity(base).status).toBe('completed'); expect(state(base).clocks.world).toBe(0); expect(state(base).outbox).toEqual([]);
    });
    test('fork/restore view never leaks later Activity facts or narrative', async () => {
        await open(); await ready(); const start = base; await command(settle()); base = await finalize();
        base = await f.core.forkBranch(h.handle, base.session.sessionId, { revisionId: start.revision.revisionId, expectedRevisionId: base.revision.revisionId });
        expect(activity(base).status).toBe('active'); expect(state(base).domains.notes.records).toEqual([]); expect(base.timeline).toEqual(start.timeline);
        await command(settle()); expect(activity(base).observation.branchId).toBe(base.revision.branchId);
    });
    test('retention compacts terminal Activity to shared-budget tombstones, never reenables instance', async () => {
        await open(); await ready(); await command({ kind: 'activity.cancel', instanceId: 'play-1' }); await command({ kind: 'retention.compact' });
        expect(state(base).activities).toEqual([]); expect(state(base).activityTombstones).toEqual([{ instanceId: 'play-1', activityId: 'encounter', status: 'cancelled' }]);
        f.core = services(h).core; base = await read(); await expect(command({ kind: 'activity.start', activityId: 'encounter', instanceId: 'play-1' })).rejects.toThrow('already exists');
    });
    test('empty or structured Narrator output cannot publish prose or change committed facts', async () => {
        await open(); await ready(); await command(settle()); const before = base;
        await expect(finalize({ html: '<scene/>' })).rejects.toThrow(); await expect(finalize(' ')).rejects.toThrow();
        expect((await read()).states).toEqual(before.states); expect((await read()).timeline).toEqual(before.timeline);
    });
    test('Host restart drains committed Observation through existing Task scheduler, once-only', async () => {
        await open(); await ready(); await command(settle()); const committed = activity(base).observation;
        const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/unused' });
        const host = new NativeGenerationHost({ ...seeded, sessionCore: services(h).core, packageInstaller: f.packageInstaller });
        host.execute = jest.fn(async (_handle, _input, _signal, _onChunk, options) => {
            expect(options.taskPlan.payload).toEqual({ observation: committed });
            expect((await read()).states.atri_lifecycle.domains.notes.records[0].value).toEqual({ text: 'won' });
            return { response: { jsonData: 'Only committed facts.' }, snapshot: { contextPlan: {}, promptProgramRef: {}, generationProfileRef: {}, runtimeRouteId: seeded.routes[0].runtimeRouteId } };
        });
        const input = () => ({ sessionId: base.session.sessionId, revisionId: base.revision.revisionId,
            slotBindings: { structured: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } } });
        const result = await host.executeLifecycle(h.handle, input()); base = result.snapshot;
        expect(result.results).toHaveLength(1); expect(activity(base).status).toBe('completed');
        expect((await host.executeLifecycle(h.handle, input())).results).toEqual([]); expect(host.execute).toHaveBeenCalledTimes(1);
    });
});
