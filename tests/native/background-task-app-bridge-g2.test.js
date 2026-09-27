import { jest } from '@jest/globals';
import { assertNativeExperienceContract as assertExperienceContract } from '../../public/shared/native-experience-contract.js';
import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { runStudioArchiveScenario } from '../../src/native/studio-scenario.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { sessionFixture, services } from './helpers/session-fixture.js';
import { lifecycleFixture } from './helpers/lifecycle-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';

function declaration(mode = 'immediate') {
    const value = lifecycleFixture();
    const task = value.taskRuntime.tasks[0]; const variant = task.variants[0];
    value.lifecycleRuntime.workflows = [];
    value.lifecycleRuntime.automations[0].action = { kind: 'task', taskId: task.id, variantId: variant.id, input: {} };
    task.resultPolicy = { resultClass: 'declared_app_command', sink: 'app_command' };
    variant.resultBinding = { kind: 'app.command', domainId: 'notes', commandId: 'save' };
    if (mode !== 'immediate') {
        variant.resultBinding = { kind: 'interaction.schedule', interactionId: 'mail' };
        variant.outputSchema = { type: 'object', additionalProperties: false, required: ['recordId', 'dueTick', 'args'],
            properties: { recordId: { type: 'string', maxLength: 64 }, dueTick: { type: 'integer', minimum: 0, maximum: 64 },
                args: value.lifecycleRuntime.domains[0].commands[0].argsSchema } };
        value.lifecycleRuntime.interactions = [{ id: 'mail', scopeId: 'session', taskId: task.id,
            clockId: 'world', domainId: 'notes', commandId: 'save', maxDelay: 5 }];
        if (mode === 'proposal') {
            task.resultPolicy = { resultClass: 'advisory', sink: 'proposal' }; delete variant.resultBinding;
        }
    }
    return { schemaVersion: 1, capabilities: [], dataResources: [], ...value };
}
const output = mode => mode === 'immediate' ? { text: 'NPC content' } : { recordId: 'mail-one', dueTick: 3, args: { text: 'NPC content' } };
const records = snapshot => snapshot.states.atri_lifecycle.domains.notes.records;

describe('G2 declared binding contract', () => {
    test.each(['immediate', 'scheduled', 'proposal'])('accepts %s and preserves normalization', mode => {
        const normalized = assertExperienceContract(declaration(mode));
        expect(assertExperienceContract(normalized)).toEqual(normalized);
    });
    test.each([
        ['missing lifecycle', value => { delete value.lifecycleRuntime; }],
        ['missing binding', value => { delete value.taskRuntime.tasks[0].variants[0].resultBinding; }],
        ['advisory binding', value => { value.taskRuntime.tasks[0].resultPolicy = { resultClass: 'advisory', sink: 'proposal' }; }],
        ['interactive authority', value => { value.taskRuntime.tasks[0].executionClass = 'interactive'; }],
        ['superseding authority', value => { value.taskRuntime.tasks[0].queuePolicy = 'latest'; }],
        ['unknown domain', value => { value.taskRuntime.tasks[0].variants[0].resultBinding.domainId = 'missing'; }],
        ['unknown command', value => { value.taskRuntime.tasks[0].variants[0].resultBinding.commandId = 'missing'; }],
        ['unknown binding field', value => { value.taskRuntime.tasks[0].variants[0].resultBinding.patch = {}; }],
        ['mismatched schema', value => { value.taskRuntime.tasks[0].variants[0].outputSchema.properties.text.maxLength = 12; }],
        ['cross-scope trigger', value => {
            value.lifecycleRuntime.scopes.push({ id: 'other', kind: 'session' }); value.lifecycleRuntime.automations[0].scopeId = 'other';
        }],
    ])('rejects %s', (_name, mutate) => {
        const value = declaration(); mutate(value); expect(() => assertExperienceContract(value)).toThrow();
    });
    test('Variant selects only its own predeclared interaction and exact schema', () => {
        const value = declaration('scheduled');
        value.taskRuntime.tasks[0].variants[0].resultBinding.interactionId = 'unknown';
        expect(() => assertExperienceContract(value)).toThrow();
        const mismatch = declaration('scheduled');
        mismatch.taskRuntime.tasks[0].variants[0].outputSchema.properties.args = { type: 'object', properties: {}, required: [], additionalProperties: false };
        expect(() => assertExperienceContract(mismatch)).toThrow(/match/);
    });
});

describe.each(CONTRACT_HARNESSES)('G2 background App bridge - $name', ({ make }) => {
    let h, f, base, seeded, serial, mode;
    beforeEach(async () => { h = await make(); serial = 0; });
    afterEach(async () => { jest.restoreAllMocks(); await h?.cleanup(); });
    async function open(selected = 'immediate', configure = () => {}) {
        mode = selected;
        f = { ...sessionFixture(), ...services(h) };
        const contract = declaration(mode); configure(contract);
        const variant = contract.taskRuntime.tasks[0].variants[0];
        f.manifest.resources = [
            { resourceType: 'core.prompt-program', resource: { schemaVersion: 1, promptProgramId: variant.prompt.resourceId,
                revision: 'r1', displayName: 'Task', stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
            { resourceType: 'core.generation-profile', resource: { schemaVersion: 1, generationProfileId: variant.generation.resourceId,
                revision: 'r1', displayName: 'Task', output: { maxTokens: 128 } } },
        ].map(item => ({ ...item, origin: { scope: 'package', packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId } }));
        f.manifest.runtime = { experienceContract: contract };
        const { archive } = buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: new Map(), assetPayloads: new Map() });
        await f.packageInstaller.install(h.handle, archive);
        base = await f.core.create(h.handle, { packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId, entryPointId: f.entryPointId });
        seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/unused' });
    }
    async function command(action) {
        base = await f.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 'g2-' + ++serial, action },
            { expectedRevisionId: base.revision.revisionId }); return base;
    }
    const input = () => ({ sessionId: base.session.sessionId, revisionId: base.revision.revisionId,
        slotBindings: { structured: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } } });
    function host(core = f.core, payload = output(mode)) {
        const value = new NativeGenerationHost({ ...seeded, sessionCore: core, packageInstaller: f.packageInstaller });
        value.execute = jest.fn(async () => ({ response: { jsonData: payload }, snapshot: { contextPlan: {}, promptProgramRef: {},
            generationProfileRef: {}, runtimeRouteId: seeded.routes[0].runtimeRouteId } }));
        return value;
    }
    const read = () => f.core.load(h.handle, base.session.sessionId);
    async function run(runtime = host()) {
        const result = await runtime.executeLifecycle(h.handle, input()); base = result.snapshot; return result;
    }

    test('ready intent automatically commits Command, result and receipt in one revision; exact retry and restart append once', async () => {
        await open(); await command({ kind: 'experience.ready' });
        const before = base; const intent = base.states.atri_lifecycle.outbox[0];
        const retry = { ...input(), invocationId: intent.invocationId, taskId: intent.taskId, variantId: intent.variantId, input: intent.input };
        const runtime = host(); const result = await run(runtime);
        expect(records(base)).toHaveLength(1); expect(records(base)[0].value).toEqual(output(mode));
        expect(base.timeline).toEqual(before.timeline);
        expect(result.results[0]).toMatchObject({ status: 'applied', storedRevisionId: base.revision.revisionId,
            anchorRevisionId: before.revision.revisionId, authorityReceipt: { kind: 'authority', decision: 'app.command',
                committedRevisionId: base.revision.revisionId }, deliveryReceipt: { kind: 'model_delivery' } });
        expect(base.states.atri_lifecycle.outbox[0].status).toBe('completed');
        expect((await runtime.executeTask(h.handle, retry, undefined, undefined, { lifecycleInvocation: true })).snapshot.revision).toEqual(base.revision);
        expect(runtime.execute).toHaveBeenCalledTimes(1);
        const restarted = host(services(h).core); await command({ kind: 'pump' });
        expect((await run(restarted)).results).toEqual([]); expect(restarted.execute).not.toHaveBeenCalled();
        expect(records(base)).toHaveLength(1);
        await expect(restarted.executeTask(h.handle, { ...retry, input: { unexpected: true } }, undefined, undefined, { lifecycleInvocation: true })).rejects.toThrow();
    });

    test('Host restart resumes only committed pending intent; direct Task invocation is denied before generation', async () => {
        await open(); const runtime = host();
        await expect(runtime.executeTask(h.handle, { ...input(), invocationId: 'direct', taskId: 'summarize', variantId: 'default', input: {} })).rejects.toThrow('lifecycle_intent_required');
        expect(runtime.execute).not.toHaveBeenCalled();
        await expect(f.core.recordTaskResult(h.handle, base.session.sessionId,
            { invocationId: 'direct', taskId: 'summarize', variantId: 'default', payload: output(mode) },
            { expectedRevisionId: base.revision.revisionId })).rejects.toThrow(/durable Lifecycle intent/);
        await command({ kind: 'experience.ready' }); await command({ kind: 'pump' });
        expect(base.states.atri_lifecycle.outbox).toHaveLength(1);
        await run(host(services(h).core)); expect(records(base)).toHaveLength(1);
    });

    test.each([{ text: 42 }, { text: 'ok', domainId: 'other', commandId: 'escape' }, { statePatch: {} }])('invalid output %j publishes nothing', async payload => {
        await open(); await command({ kind: 'experience.ready' }); const before = base;
        await expect(run(host(f.core, payload))).rejects.toThrow();
        const current = await read(); expect(current.revision).toEqual(before.revision);
        expect(records(current)).toEqual([]); expect(current.states.atri_task_results).toBeUndefined();
        expect(current.states.atri_lifecycle.outbox[0].status).toBe('pending');
    });

    test.each(['stale', 'branch', 'scope', 'cancel', 'abort'])('%s while generation is in flight cannot commit', async change => {
        await open(); await command({ kind: 'experience.ready' }); const anchor = base;
        let entered, release;
        const started = new Promise(resolve => { entered = resolve; }); const gate = new Promise(resolve => { release = resolve; });
        const runtime = host(); const execute = runtime.execute;
        runtime.execute = jest.fn(async (...args) => { entered(); await gate; return execute(...args); });
        const controller = new AbortController();
        const pending = runtime.executeLifecycle(h.handle, input(), controller.signal);
        const settled = pending.catch(error => error); await started;
        if (change === 'branch') base = await f.core.forkBranch(h.handle, base.session.sessionId,
            { revisionId: anchor.revision.revisionId, expectedRevisionId: base.revision.revisionId });
        else if (change === 'scope') await command({ kind: 'scope.transition', scopeId: 'session', status: 'suspended' });
        else if (change === 'cancel') await command({ kind: 'scheduled.cancel', invocationId: base.states.atri_lifecycle.outbox[0].invocationId });
        else if (change === 'stale') await command({ kind: 'clock.advance', commandId: 'advance', ticks: 1 });
        else controller.abort();
        release(); await expect(settled).resolves.toBeInstanceOf(Error);
        const current = await read(); expect(current.revision).toEqual(base.revision);
        expect(records(current)).toEqual([]); expect(current.states.atri_task_results).toBeUndefined();
        if (change === 'stale') await run(host(services(h).core));
        expect(records(base)).toHaveLength(change === 'stale' ? 1 : 0);
        const resumed = ['scope', 'cancel'].includes(change) ? await run() : { results: [] };
        expect(resumed.results).toEqual([]);
    });

    test('ordinary advisory proposal still requires explicit Host acceptance', async () => {
        await open('proposal'); await command({ kind: 'experience.ready' }); const result = await run();
        expect(result.results[0].status).toBe('draft'); expect(base.states.atri_lifecycle.interactions).toEqual([]);
        expect(records(base)).toEqual([]);
        await command({ kind: 'interaction.schedule', interactionId: 'mail', proposalId: result.results[0].invocationId });
        expect(base.states.atri_lifecycle.interactions[0].status).toBe('scheduled');
    });

    test('scheduled result survives restart; before dueTick no delivery; due pump delivers once', async () => {
        await open('scheduled'); await command({ kind: 'experience.ready' }); const result = await run();
        const receipt = result.results[0];
        expect(receipt).toMatchObject({ status: 'applied', authorityReceipt: { decision: 'schedule', committedRevisionId: base.revision.revisionId } });
        expect(base.states.atri_lifecycle.interactions).toHaveLength(1); expect(records(base)).toEqual([]);
        f.core = services(h).core; await command({ kind: 'clock.advance', commandId: 'advance', ticks: 2 });
        await command({ kind: 'pump' }); expect(records(base)).toEqual([]);
        const runtime = host(); expect((await run(runtime)).results).toEqual([]); expect(runtime.execute).not.toHaveBeenCalled();
        await command({ kind: 'clock.advance', commandId: 'advance', ticks: 1 }); await command({ kind: 'pump' });
        expect(records(base)).toHaveLength(1); expect(records(base)[0].value).toEqual({ text: 'NPC content' });
        const first = structuredClone(records(base)); await command({ kind: 'pump' }); expect(records(base)).toEqual(first);
        expect(base.states.atri_lifecycle.interactions[0].status).toBe('delivered');
    });

    test.each(['interaction', 'scope'])('scheduled %s cancellation prevents due delivery', async cancel => {
        await open('scheduled'); await command({ kind: 'experience.ready' }); const result = await run();
        await command(cancel === 'interaction' ? { kind: 'interaction.cancel', proposalId: result.results[0].invocationId }
            : { kind: 'scope.transition', scopeId: 'session', status: 'suspended' });
        await command({ kind: 'clock.advance', commandId: 'advance', ticks: 3 }); await command({ kind: 'pump' });
        expect(records(base)).toEqual([]);
    });

    test('scheduled output beyond maxDelay rolls back result, intent completion and schedule', async () => {
        await open('scheduled'); await command({ kind: 'experience.ready' }); const before = base;
        await expect(run(host(f.core, { ...output(mode), dueTick: 6 }))).rejects.toThrow(/bounds/);
        expect((await read()).revision).toEqual(before.revision); expect((await read()).states).toEqual(before.states);
    });

    test('typed reducer rejection rolls back the App candidate and leaves intent pending', async () => {
        await open('immediate', value => { value.lifecycleRuntime.domains[0].commands[0].assign.text = { formula: '42' }; });
        await command({ kind: 'experience.ready' }); const before = base;
        await expect(run()).rejects.toThrow(/schema/);
        expect((await read()).states).toEqual(before.states); expect((await read()).revision).toEqual(before.revision);
    });

    test('concurrent result finalizers publish only one App append and authority receipt', async () => {
        await open(); await command({ kind: 'experience.ready' }); const before = base;
        const intent = base.states.atri_lifecycle.outbox[0];
        const record = { invocationId: intent.invocationId, taskId: intent.taskId, variantId: intent.variantId, payload: output(mode), fingerprint: 'recorded' };
        const writes = await Promise.allSettled([1, 2].map(() => f.core.recordTaskResult(h.handle, base.session.sessionId, record,
            { expectedRevisionId: before.revision.revisionId })));
        expect(writes.filter(item => item.status === 'fulfilled')).toHaveLength(1);
        base = await read(); expect(records(base)).toHaveLength(1); expect(base.states.atri_task_results.records).toHaveLength(1);
        expect(base.states.atri_task_results.records[0].authorityReceipt.committedRevisionId).toBe(base.revision.revisionId);
    });

    test('compaction preserves exact fingerprint replay without re-appending', async () => {
        await open('immediate', value => {
            value.lifecycleRuntime.retention.maxTaskResults = 1;
            value.lifecycleRuntime.automations[0].trigger = { kind: 'world.schedule', clockId: 'world', at: 0, every: 1 };
        });
        await command({ kind: 'experience.ready' }); const intent = base.states.atri_lifecycle.outbox[0];
        const retry = { ...input(), invocationId: intent.invocationId, taskId: intent.taskId, variantId: intent.variantId, input: intent.input };
        await run(); await command({ kind: 'clock.advance', commandId: 'advance', ticks: 1 }); await command({ kind: 'pump' });
        await run(); expect(records(base)).toHaveLength(2);
        expect(base.states.atri_lifecycle.taskTombstones).toHaveLength(1);
        const runtime = host(services(h).core);
        const replay = await runtime.executeTask(h.handle, retry, undefined, undefined, { lifecycleInvocation: true });
        expect(replay.snapshot.revision).toEqual(base.revision); expect(runtime.execute).not.toHaveBeenCalled();
        await expect(runtime.executeTask(h.handle, { ...retry, fallbackMode: 'enabled' }, undefined, undefined, { lifecycleInvocation: true })).rejects.toThrow('invocation_conflict');
    });

    test('Workflow model_task uses the same durable bridge with a fixed record target', async () => {
        await open('immediate', value => {
            value.taskRuntime.tasks[0].variants[0].resultBinding.recordId = 'report';
            value.lifecycleRuntime.automations = [];
            value.lifecycleRuntime.workflows = [{ id: 'daily', scopeId: 'session', initial: 'generate',
                nodes: [{ id: 'generate', kind: 'model_task', action: { kind: 'task', taskId: 'summarize', variantId: 'default', input: {} } }], transitions: [] }];
        });
        await command({ kind: 'experience.ready' }); await run();
        expect(records(base)).toEqual([expect.objectContaining({ id: 'report', value: output(mode) })]);
        await command({ kind: 'pump' }); expect((await run()).results).toEqual([]);
    });

    test.each(['immediate', 'scheduled'])('production recorded Scenario executes %s without provider calls and restores no future effects', async selected => {
        await open(selected);
        const { archive } = buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: new Map(), assetPayloads: new Map() });
        const result = await runStudioArchiveScenario(archive, { schemaVersion: 1, steps: [
            { kind: 'lifecycle', input: { kind: 'experience.ready' } },
            { kind: 'checkpoint', input: 'before-result' },
            { kind: 'task', input: { taskId: 'summarize', variantId: 'default', invocationId: '$pending', payload: output(mode) } },
            { kind: 'assert', input: { path: 'states.atri_task_results.records.0.status', equals: 'applied' } },
            { kind: 'lifecycle', input: { kind: 'clock.advance', commandId: 'advance', ticks: 3 } },
            { kind: 'lifecycle', input: { kind: 'pump' } },
            { kind: 'assert', input: { path: 'states.atri_lifecycle.domains.notes.records.0.value.text', equals: 'NPC content' } },
            { kind: 'restore', input: 'before-result' },
            { kind: 'lifecycle', input: { kind: 'clock.advance', commandId: 'advance', ticks: 3 } },
            { kind: 'lifecycle', input: { kind: 'pump' } },
            { kind: 'assert', input: { path: 'states.atri_lifecycle.domains.notes.records', equals: [] } },
            { kind: 'assert', input: { path: 'states.atri_lifecycle.interactions', equals: [] } },
            { kind: 'assert', input: { path: 'states.atri_lifecycle.outbox.0.status', equals: 'pending' } },
        ] });
        expect(result).toMatchObject({ status: 'passed', persisted: false, providerCalls: 0 });
        expect(result.steps).toHaveLength(13);
    });
});
