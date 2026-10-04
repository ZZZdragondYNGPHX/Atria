import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { authorityTurnFixture } from './helpers/authority-turn-fixture.js';
import { lifecycleFixture } from './helpers/lifecycle-fixture.js';

const app = (text, domainId = 'notes') => ({ kind: 'app.command', domainId, commandId: 'save', recordId: 'main', args: { text } });
const schedule = (id, action) => ({ id, scopeId: 'session', maxCatchUp: 1, trigger: { kind: 'world.schedule', clockId: 'world', at: 1, catchUp: 'all' }, action });
const durable = value => ({ revision: value.revision, states: value.states, timeline: value.timeline });
function task(f) {
    const t = lifecycleFixture().taskRuntime.tasks[0];
    t.resultPolicy = { resultClass: 'declared_app_command', sink: 'app_command' };
    t.variants[0].resultBinding = { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main' };
    f.contract.taskRuntime.slots = [{ id: 'structured', requiredCapabilities: [] }]; f.contract.taskRuntime.tasks.push(t);
    f.base.manifest.resources = [
        { resourceType: 'core.prompt-program', resource: { schemaVersion: 1, promptProgramId: t.variants[0].prompt.resourceId, revision: 'r1', displayName: 'Task', stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
        { resourceType: 'core.generation-profile', resource: { schemaVersion: 1, generationProfileId: t.variants[0].generation.resourceId, revision: 'r1', displayName: 'Task', output: { maxTokens: 128 } } },
    ].map(item => ({ ...item, origin: { scope: 'package', packageId: f.base.session.packageId, packageVersionId: f.base.session.packageVersionId } }));
    f.contract.lifecycleRuntime.automations.push(schedule('task-due', { kind: 'task', taskId: t.id, variantId: 'default', input: {} }));
}
describe.each(CONTRACT_HARNESSES)('C3 unified publications - $name', ({ make }) => {
    let h, f;
    beforeEach(async () => { h = await make(); });
    afterEach(async () => { await h?.cleanup(); });
    const open = async change => { f = await authorityTurnFixture(h, 'http://127.0.0.1:1/v1/chat/completions', change); };
    const command = (action, invocationId = 'command') => f.core.applyLifecycleCommand(h.handle, f.base.session.sessionId,
        { type: 'lifecycle', invocationId, action }, { expectedRevisionId: f.base.revision.revisionId });
    test('ordinary App Command refreshes the same derived layer before one CAS', async () => {
        await open(); const commit = jest.spyOn(f.core._sessions, 'commitSnapshot');
        const result = await command(app('background change'));
        expect(commit).toHaveBeenCalledTimes(1);
        expect(result.states.atri_lifecycle.domains.public_notes.records[0].value.text).toBe('background change');
        expect(result.states.atri_action_receipts).toBeUndefined();
    });
    test.each(['derived-write', 'raw-world', 'raw-journal'])('ordinary %s bypass fails closed', async kind => {
        await open();
        const promise = kind === 'derived-write' ? command(app('invented projection', 'public_notes'))
            : f.core.updateState(h.handle, f.base.session.sessionId, { [kind === 'raw-world' ? 'atri_world_state' : 'atri_game_runtime']: {} }, { expectedRevisionId: f.base.revision.revisionId });
        await expect(promise).rejects.toThrow();
        expect(durable(await f.core.load(h.handle, f.base.session.sessionId))).toEqual(durable(f.base));
    });
    test('clock due work plus hook share the aggregate expanded-effect limit, with no partial publication', async () => {
        await open(value => { value.contract.authorityRuntime.policy.maxEffects = 6;
            value.contract.lifecycleRuntime.automations = Array.from({ length: 6 }, (_, i) => schedule('due-' + i, app('due'))); });
        f.base = await command({ kind: 'clock.advance', commandId: 'advance', ticks: 1 }, 'clock');
        await expect(command({ kind: 'pump' })).rejects.toThrow();
        expect(durable(await f.core.load(h.handle, f.base.session.sessionId))).toEqual(durable(f.base));
    });
    test('computed publication schema failure rolls back the ordinary source write too', async () => {
        await open(value => {
            value.contract.lifecycleRuntime.domains.find(item => item.id === 'public_notes').recordSchema.properties.text.maxLength = 32;
        });
        await expect(command(app('x'.repeat(40)))).rejects.toThrow();
        expect(durable(await f.core.load(h.handle, f.base.session.sessionId))).toEqual(durable(f.base));
    });
    test('Turn outbox stays private until Narrator succeeds; later background result refreshes projection atomically', async () => {
        await open(task);
        const binding = { scope: 'player', runtimeRouteId: f.seeded.routes[0].runtimeRouteId };
        const input = { ...f.input, slotBindings: { structured: binding } };
        f.host.execute = jest.fn(async (_owner, request, _signal, _chunk, options) => {
            if (request.role === 'intent_resolver') return { response: { toolCalls: [{ name: 'atri_transaction_0', args: f.selection.input }] }, snapshot: {} };
            expect(options.lanePlan.authorityContext.snapshot.states.atri_lifecycle.outbox).toHaveLength(1);
            expect((await f.core.load(h.handle, f.base.session.sessionId)).states.atri_lifecycle.outbox).toHaveLength(0);
            return { response: { text: 'Done.' }, snapshot: {} };
        });
        f.base = await f.host.executeTurn(h.handle, input);
        expect(f.base.states.atri_lifecycle.outbox).toHaveLength(1); expect(f.host.execute).toHaveBeenCalledTimes(2);
        f.host.execute = jest.fn(async () => ({ response: { jsonData: { text: 'background result' } }, snapshot: { contextPlan: {}, promptProgramRef: {}, generationProfileRef: {}, runtimeRouteId: f.seeded.routes[0].runtimeRouteId } }));
        const commit = jest.spyOn(f.core._sessions, 'commitSnapshot');
        const result = await f.host.executeLifecycle(h.handle, { sessionId: f.base.session.sessionId, revisionId: f.base.revision.revisionId, slotBindings: { structured: binding } });
        expect(commit).toHaveBeenCalledTimes(1);
        expect(result.snapshot.states.atri_lifecycle.domains.notes.records[0].value.text).toBe('background result');
        expect(result.snapshot.states.atri_lifecycle.domains.public_notes.records[0].value.text).toBe('background result');
        expect(result.snapshot.states.atri_lifecycle.outbox[0].status).toBe('completed');
    });
});
