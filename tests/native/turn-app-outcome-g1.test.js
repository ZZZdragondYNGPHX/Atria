import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { sessionFixture, services } from './helpers/session-fixture.js';
import { lifecycleFixture } from './helpers/lifecycle-fixture.js';
import { compileDeclarativeLogic } from '../../public/scripts/native/experience/logic/declarative.js';
import { createInterpretationMappingRegistry } from '../../public/scripts/native/experience/logic/interpretations.js';

const empty = { type: 'object', properties: {}, required: [], additionalProperties: false };
const appCommand = () => ({ domainId: 'notes', commandId: 'save', recordId: 'beat', args: { text: { formula: 'args.eventType' } } });
const envelope = () => ({ schemaVersion: 1, narrative: 'The event advances.', diagnostics: [], outcomes: [
    { requestId: 'outcome', interpretation: { decision: 'event', eventType: 'healed', confidence: 1 } },
] });
const durable = value => ({ revision: value.revision, states: value.states, timeline: value.timeline, variants: value.variants });

describe.each(CONTRACT_HARNESSES)('G1 atomic Turn App outcome - $name', ({ make }) => {
    let h, f, base;
    beforeEach(async () => { h = await make(); });
    afterEach(async () => { await h?.cleanup(); });
    async function open(configure = () => {}) {
        f = { ...sessionFixture(), ...services(h) };
        const declarations = lifecycleFixture();
        declarations.lifecycleRuntime.automations = []; declarations.lifecycleRuntime.workflows = [];
        const task = declarations.taskRuntime.tasks[0];
        task.executionClass = 'turn_blocking'; task.resultPolicy = { resultClass: 'world_outcome_proposal', sink: 'proposal' };
        task.interpretation = { id: 'outcome', instruction: 'Classify only', allowedEventTypes: ['healed'], confidenceThreshold: 0.7 };
        task.variants[0].outputSchema = { type: 'object', additionalProperties: false, properties: {
            decision: { type: 'string', maxLength: 16 }, eventType: { type: 'string', maxLength: 128 }, confidence: { type: 'number', minimum: 0, maximum: 1 },
        }, required: ['decision', 'confidence'] };
        declarations.taskRuntime.turn = { policy: 'narrative-outcome', stages: [], interpreterTaskId: task.id };
        const logic = { schemaVersion: 2, mutations: [{ id: 'heal', event: 'healed', argsSchema: empty, assign: { hp: { formula: 'world.hp + 1' } } }],
            interpretations: [{ eventType: 'healed', command: 'heal', args: {}, appCommand: appCommand() }] };
        configure(logic, declarations);
        const variant = task.variants[0];
        f.manifest.resources = [
            { resourceType: 'core.prompt-program', resource: { schemaVersion: 1, promptProgramId: variant.prompt.resourceId, revision: 'r1', displayName: 'Task', stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
            { resourceType: 'core.generation-profile', resource: { schemaVersion: 1, generationProfileId: variant.generation.resourceId, revision: 'r1', displayName: 'Task', output: { maxTokens: 128 } } },
        ].map(item => ({ ...item, origin: { scope: 'package', packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId } }));
        f.manifest.runtime = { game: { logic: 'logic.json' }, experienceContract: { schemaVersion: 1, capabilities: [], dataResources: [], ...declarations } };
        const { archive } = buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: new Map([['logic.json', Buffer.from(JSON.stringify(logic))]]), assetPayloads: new Map() });
        await f.packageInstaller.install(h.handle, archive);
        base = await f.core.create(h.handle, { packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId, entryPointId: f.entryPointId });
    }
    const finalize = (raw = envelope(), invocationId = 'turn-one', anchor = base.revision.revisionId) => f.core.finalizeTurn(h.handle, base.session.sessionId,
        { envelope: raw, invocationId }, { expectedRevisionId: anchor });
    test.each([false, true])('Narrative + App (+ World=%s) publish one Revision with Variant and retry receipt', async world => {
        await open(logic => { if (!world) { delete logic.interpretations[0].command; delete logic.interpretations[0].args; } });
        const next = await finalize();
        expect(next.core.parentRevisionId).toBe(base.revision.revisionId);
        expect(next.timeline).toHaveLength(base.timeline.length + 1);
        expect(next.timeline.at(-1).content).toBe('The event advances.');
        expect(next.variants.length).toBe(base.variants.length + 1);
        expect(next.states.atri_world_state.worlds[f.worldId].state.hp).toBe(world ? 9 : 8);
        expect(next.states.atri_lifecycle.domains.notes.records[0].value.text).toBe('healed');
        expect(next.states.atri_lifecycle.logicalTime).toBe(base.states.atri_lifecycle.logicalTime + 1);
        expect(next.states.atri_task_results.records[0].storedRevisionId).toBe(next.revision.revisionId);
        expect(durable(await finalize())).toEqual(durable(next));
        const changed = envelope(); changed.narrative = 'Different';
        await expect(finalize(changed)).rejects.toThrow('conflict');
        const fork = await f.core.forkBranch(h.handle, base.session.sessionId, { revisionId: base.revision.revisionId, expectedRevisionId: next.revision.revisionId });
        expect(fork.states.atri_lifecycle.domains.notes.records).toEqual([]);
        expect(fork.states.atri_world_state.worlds[f.worldId].state.hp).toBe(8);
    });
    test.each(['args', 'record-schema', 'scope', 'world', 'retention'])('%s failure leaves all authorities and provisional prose untouched', async failure => {
        await open((logic, declarations) => {
            if (failure === 'args') logic.interpretations[0].appCommand.args.text = 42;
            if (failure === 'record-schema') declarations.lifecycleRuntime.domains[0].commands[0].assign.text = { formula: '42' };
            if (failure === 'world') logic.mutations[0].validators = [{ formula: 'world.hp < 0' }];
            if (failure === 'retention') declarations.lifecycleRuntime.domains[0].retention.maxLogicalBytes = 16;
        });
        if (failure === 'scope') base = await f.core.applyLifecycleCommand(h.handle, base.session.sessionId,
            { type: 'lifecycle', invocationId: 'suspend', action: { kind: 'scope.transition', scopeId: 'session', status: 'suspended' } }, { expectedRevisionId: base.revision.revisionId });
        await expect(finalize()).rejects.toThrow();
        expect(durable(await f.core.load(h.handle, base.session.sessionId))).toEqual(durable(base));
    });
    test('stale anchor cannot commit any outcome', async () => {
        await open();
        const next = await f.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Concurrent input' });
        await expect(finalize()).rejects.toThrow();
        expect(durable(await f.core.load(h.handle, base.session.sessionId))).toEqual(durable(next));
    });
    test('no_change bypasses both mappings', async () => {
        await open(); const raw = envelope(); raw.outcomes[0].interpretation = { decision: 'no_change', confidence: 1 };
        const next = await finalize(raw);
        expect(next.states.atri_lifecycle.domains.notes.records).toEqual([]);
        expect(next.states.atri_world_state.worlds[f.worldId].state.hp).toBe(8);
    });
    test('concurrent finalizers publish only one complete outcome', async () => {
        await open();
        const results = await Promise.allSettled([finalize(), finalize(envelope(), 'turn-two')]);
        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        const next = await f.core.load(h.handle, base.session.sessionId);
        expect(next.core.parentRevisionId).toBe(base.revision.revisionId);
        expect(next.states.atri_world_state.worlds[f.worldId].state.hp).toBe(9);
        expect(next.states.atri_lifecycle.domains.notes.records).toHaveLength(1);
        expect(next.states.atri_task_results.records).toHaveLength(1);
        expect(next.timeline).toHaveLength(base.timeline.length + 1);
    });
    test('ordinary semantic proposals stay inert until explicit Host acceptance', async () => {
        await open();
        const proposal = await f.core.recordTaskResult(h.handle, base.session.sessionId, { taskId: 'summarize', variantId: 'default',
            invocationId: 'proposal', payload: envelope().outcomes[0].interpretation }, { expectedRevisionId: base.revision.revisionId });
        expect(proposal.states.atri_lifecycle.domains.notes.records).toEqual([]);
        expect(proposal.states.atri_world_state.worlds[f.worldId].state.hp).toBe(8);
        const request = { invocationId: 'proposal', decision: 'apply' };
        const next = await f.core.resolveTaskProposal(h.handle, base.session.sessionId, request, { expectedRevisionId: proposal.revision.revisionId });
        expect(next.states.atri_lifecycle.domains.notes.records[0].value.text).toBe('healed');
        expect(next.states.atri_world_state.worlds[f.worldId].state.hp).toBe(9);
        expect(durable(await f.core.resolveTaskProposal(h.handle, base.session.sessionId, request, { expectedRevisionId: proposal.revision.revisionId }))).toEqual(durable(next));
    });
    test('record identity uses bounded mapping; terminal records cannot be advanced', async () => {
        await open(logic => { logic.interpretations[0].appCommand.recordId = { formula: 'args.eventType' }; });
        const next = await finalize();
        expect(next.states.atri_lifecycle.domains.notes.records[0].id).toBe('healed');
        base = await f.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 'finish',
            action: { kind: 'app.command', domainId: 'notes', recordId: 'healed', commandId: 'finish', args: {} } }, { expectedRevisionId: next.revision.revisionId });
        await expect(finalize(envelope(), 'turn-next')).rejects.toThrow('terminal');
        expect(durable(await f.core.load(h.handle, base.session.sessionId))).toEqual(durable(base));
    });
    test.each(['domainId', 'commandId'])('unknown %s is rejected before installation', async key => {
        await expect(open(logic => { logic.interpretations[0].appCommand[key] = 'unknown'; })).rejects.toThrow('unknown App Command');
    });
    test.each(['domainId', 'commandId', 'patch'])('model cannot supply %s', async key => {
        await open(); const raw = envelope(); raw.outcomes[0].interpretation[key] = 'arbitrary';
        await expect(finalize(raw)).rejects.toThrow();
        expect(durable(await f.core.load(h.handle, base.session.sessionId))).toEqual(durable(base));
    });
});

test('App mapping cannot execute through non-Session interpretation consumer', () => {
    const logic = compileDeclarativeLogic({ interpretations: [{ eventType: 'healed', appCommand: appCommand() }] }, { data: {} });
    expect(() => createInterpretationMappingRegistry(logic.interpretations).map(envelope().outcomes[0].interpretation)).toThrow('Session authority');
});
test.each(['domainId', 'commandId'])('App mapping requires literal %s', key => {
    const app = appCommand(); app[key] = { formula: 'args.eventType' };
    expect(() => compileDeclarativeLogic({ interpretations: [{ eventType: 'healed', appCommand: app }] })).toThrow('fixed identifiers');
});
test('compiled App mapping captures fixed authority and retains the shared when gate', () => {
    const app = appCommand();
    const logic = compileDeclarativeLogic({ interpretations: [{ eventType: 'healed', appCommand: app, when: 'world.hp > 0' }] }, { data: {} });
    app.domainId = 'other'; app.commandId = 'other';
    const registry = createInterpretationMappingRegistry(logic.interpretations, { sessionAuthority: true });
    expect(registry.map(envelope().outcomes[0].interpretation, { world: { hp: 8 } }).commands[0]).toMatchObject({ domainId: 'notes', commandId: 'save' });
    expect(registry.map(envelope().outcomes[0].interpretation, { world: { hp: 0 } }).commands).toEqual([]);
});
