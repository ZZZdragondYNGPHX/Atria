import { jest, describe, beforeEach, afterEach, test, expect } from '@jest/globals';
import { makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { services } from './helpers/session-fixture.js';
import { authorityCandidateFixture } from './helpers/authority-candidate-fixture.js';
import { lifecycleFixture } from './helpers/lifecycle-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { PredictionService, PREDICTION_INPUT_SCHEMA, PREDICTION_OUTPUT_SCHEMA } from '../../src/native/prediction-service.js';
import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { projectInformation } from '../../public/shared/native-information-runtime.js';

describe('S23 original Host prediction lane (local synthetic provider only)', () => {
    let h, svc, base, host, service, seeded, requests, respond, serial, fetchImpl;
    const output = () => ({ prediction: 'The visible note may change if this proposed action is performed.', assumptions: ['The declared action succeeds.'],
        supportRefs: ['public.notes:main'], uncertainty: { confidence: 0.5, limitations: ['No actual outcome has been observed.'] } });
    const request = () => ({ sessionId: base.session.sessionId, revisionId: base.revision.revisionId, request: {
        viewId: 'player.notes', anchor: projectInformation(base, 'player.notes').anchor,
        action: { kind: 'transaction', transactionId: 'note.update', input: { target: 'main', text: 'proposed public change', amount: 2 } },
        taskId: 'predict', variantId: 'default', slotBindings: { structured: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } }, invocationId: 'prediction-' + ++serial } });
    async function command(text, domainId = 'other') {
        base = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 'note-' + ++serial,
            action: { kind: 'app.command', domainId, commandId: 'save', recordId: 'main', args: { text } } }, { expectedRevisionId: base.revision.revisionId });
    }
    const ledger = async () => Object.values((await svc.core.runs.status(h.handle, base.session.sessionId))?.operations ?? {}).find(op => op.compute)?.compute;
    beforeEach(async () => {
        h = await makeTempSqliteEngineHarness(); svc = services(h); requests = []; serial = 0;
        const f = authorityCandidateFixture(({ contract, logic }) => {
            logic.transactions[0].effects = logic.transactions[0].effects.filter(effect => !['clock.advance', 'workflow.transition'].includes(effect.kind));
            contract.taskRuntime = lifecycleFixture().taskRuntime;
            const task = contract.taskRuntime.tasks[0];
            Object.assign(task, { id: 'predict', executionClass: 'interactive', inputSchema: structuredClone(PREDICTION_INPUT_SCHEMA),
                resultPolicy: { resultClass: 'advisory', sink: 'proposal' } });
            task.variants[0].outputSchema = structuredClone(PREDICTION_OUTPUT_SCHEMA);
            const counter = { type: 'object', additionalProperties: false, required: ['effectiveTurns'], properties: { effectiveTurns: { type: 'integer', minimum: 0, maximum: 1000000 } } };
            contract.capabilities.push({ id: 'generation-budget', version: 1, required: true });
            contract.lifecycleRuntime.domains.push({ id: 'progress', scopeId: 'session', schemaVersion: 1, recordSchema: counter, initial: { effectiveTurns: 0 },
                commands: [{ id: 'save', argsSchema: counter, event: 'progress.saved', assign: { effectiveTurns: { formula: 'args.effectiveTurns' } } }],
                retention: { maxItems: 32, maxLogicalBytes: 16384, keepPinned: true, keepReferenced: true } });
            contract.generationBudget = { schemaVersion: 1, resolverAttempts: 1, narratorAttempts: 1, turnAttempts: 2, backgroundAttempts: 1,
                backgroundWindowTurns: 4, backgroundPeriodTurns: 20, backgroundPeriodAttempts: 2, turnCounter: { domainId: 'progress', recordId: 'main', field: 'effectiveTurns' } };
        });
        const variant = f.contract.taskRuntime.tasks[0].variants[0];
        f.base.manifest.resources = [
            { resourceType: 'core.prompt-program', resource: { schemaVersion: 1, promptProgramId: variant.prompt.resourceId, revision: 'r1', displayName: 'Prediction', stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
            { resourceType: 'core.generation-profile', resource: { schemaVersion: 1, generationProfileId: variant.generation.resourceId, revision: 'r1', displayName: 'Prediction', output: { maxTokens: 512 } } },
        ].map(item => ({ ...item, origin: { scope: 'package', packageId: f.base.session.packageId, packageVersionId: f.base.session.packageVersionId } }));
        const { archive } = buildAtriaPackageContainer({ manifest: f.base.manifest, sourceFiles: f.installed.sourceFiles, assetPayloads: new Map() });
        await svc.packageInstaller.install(h.handle, archive);
        base = await svc.core.create(h.handle, { packageId: f.base.session.packageId, packageVersionId: f.base.session.packageVersionId, entryPointId: f.base.session.entryPointId });
        base = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 'ready', action: { kind: 'experience.ready' } }, { expectedRevisionId: base.revision.revisionId });
        await command('public baseline', 'notes');
        await command('PRIVATE PREDICTION SENTINEL');
        base = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 'progress',
            action: { kind: 'app.command', domainId: 'progress', commandId: 'save', recordId: 'main', args: { effectiveTurns: 0 } } }, { expectedRevisionId: base.revision.revisionId });
        base = await svc.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Update the note.' });
        seeded = await seedGenerationProfiles({ ...h, endpoint: 'https://synthetic.invalid/v1/chat/completions' });
        await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: { schemaVersion: 1,
            allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: { maxRequests: 1, maxTokens: 32000,
                localWork: { maxJobs: 32, maxItems: 32, maxInputBytes: 16777216 } } } });
        respond = async () => ({ choices: [{ message: { content: JSON.stringify(output()) } }], usage: { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 } });
        fetchImpl = jest.fn(async (_url, options) => {
            const body = JSON.parse(options.body); requests.push(body);
            return new Response(JSON.stringify(await respond(body, options)), { status: 200, headers: { 'content-type': 'application/json' } });
        });
        host = new NativeGenerationHost({ ...seeded, sessionCore: svc.core, packageInstaller: svc.packageInstaller,
            providers: { 'provider.openai-compatible': createHttpGenerationProvider({ fetchImpl }) }, secretPort: { resolveSecret: async () => 'synthetic-secret' },
            skillRepository: jest.fn(() => { throw new Error('Prediction must not open Skills'); }), extensions: { settings: jest.fn(() => { throw new Error('Prediction must not read Skills settings'); }) } });
        service = new PredictionService({ host });
    });
    afterEach(async () => { jest.restoreAllMocks(); await h?.cleanup(); });

    test('authorized observation/action alone reach the original provider; advice stays transient and costs remain', async () => {
        const before = await svc.core.load(h.handle, base.session.sessionId);
        const publish = jest.spyOn(svc.sessionRepo, 'commitSnapshot'), adopt = jest.spyOn(svc.core, 'recordTaskResult');
        const result = await service.prepare(h.handle, request());
        expect(result).toMatchObject({ kind: 'hypothetical', mode: 'model_prediction', uncertainty: { realOutcome: 'not_observed' } });
        expect(requests).toHaveLength(1);
        const wire = JSON.stringify(requests[0]);
        expect(wire).toContain('public baseline'); expect(wire).toContain('proposed public change');
        expect(wire).toContain('hypothetical prediction'); expect(wire).toContain('uncalibrated model estimate');
        expect(wire).not.toContain('PRIVATE PREDICTION SENTINEL'); expect(requests[0].tools).toBeUndefined();
        expect(host.skillRepository).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled(); expect(adopt).not.toHaveBeenCalled();
        expect(await svc.core.load(h.handle, base.session.sessionId)).toEqual(before);
        expect((await ledger()).attempts).toEqual([expect.objectContaining({ status: 'settled', usage: { inputTokens: 30, outputTokens: 20, totalTokens: 50 } })]);
        const op = Object.values((await svc.core.runs.status(h.handle, base.session.sessionId)).operations).find(op => op.compute);
        expect(op).toMatchObject({ lane: 'turn', total: 1, attempts: { narrator: 1 } });
        await expect(service.prepare(h.handle, request())).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
        expect(requests).toHaveLength(1);
    });

    test('preflight compiles the same narrow prompt and resolves capabilities without sending or charging', async () => {
        const before = await svc.core.runs.status(h.handle, base.session.sessionId);
        const generated = await service.preflight(h.handle, request());
        expect(JSON.stringify(generated)).toContain('hypothetical prediction');
        expect(JSON.stringify(generated)).not.toContain('PRIVATE PREDICTION SENTINEL');
        expect(requests).toEqual([]);
        expect(await svc.core.runs.status(h.handle, base.session.sessionId)).toEqual(before);
    });

    test('forged captures and ordinary lane predictionContext cannot authorize a prediction', async () => {
        await expect(host.executePrediction(h.handle, { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, requestId: 'forged',
            routeRef: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } }, { snapshot: base, observation: 'private' })).rejects.toMatchObject({ code: 'native_prediction_capture_invalid' });
        await expect(host.execute(h.handle, { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, role: 'narrator', requestId: 'forged' }, undefined, undefined,
            { lanePlan: { prediction: { payload: { observation: 'private' } } } })).rejects.toMatchObject({ code: 'native_prediction_capture_required' });
        expect(requests).toEqual([]);
    });

    test('a capture cannot execute under another Host or handle', async () => {
        const original = host.executePrediction.bind(host);
        const wrongHost = new NativeGenerationHost({ ...host });
        host.executePrediction = async (handle, input, capture) => {
            await expect(wrongHost.executePrediction(handle, input, capture)).rejects.toMatchObject({ code: 'native_prediction_capture_invalid' });
            await expect(original('another-owner', input, capture)).rejects.toMatchObject({ code: 'native_prediction_capture_invalid' });
            return original(handle, input, capture);
        };
        await service.prepare(h.handle, request()); expect(requests).toHaveLength(1);
    });

    test('a revision change before rendering refuses sending; a change after sending refuses advisory delivery but retains costs', async () => {
        const provider = host.providers['provider.openai-compatible'];
        host.providers['provider.openai-compatible'] = { ...provider, countTokens: async input => { await command('new private state'); return provider.countTokens(input); } };
        await expect(service.prepare(h.handle, request())).rejects.toThrow(); expect(requests).toEqual([]);
        host.providers['provider.openai-compatible'] = provider;
        respond = async () => { await command('after-send private state'); return { choices: [{ message: { content: JSON.stringify(output()) } }], usage: { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 } }; };
        const adopt = jest.spyOn(svc.core, 'recordTaskResult');
        await expect(service.prepare(h.handle, request())).rejects.toThrow(); expect(requests).toHaveLength(1); expect(adopt).not.toHaveBeenCalled();
        const control = await svc.core.runs.status(h.handle, base.session.sessionId);
        expect(control.retiredCompute).toMatchObject({ modelAttempts: 1, knownTotalTokens: 50 });
    });

    test('unsupported structured output is rejected before any provider send', async () => {
        const provider = host.providers['provider.openai-compatible'];
        host.providers['provider.openai-compatible'] = { ...provider, resolveCapabilities: async () => [{ capability: 'generation.structured-output', state: 'unsupported', provenance: [{ kind: 'adapter-metadata', source: 'synthetic' }] }] };
        await expect(service.prepare(h.handle, request())).rejects.toThrow(); expect(requests).toEqual([]);
    });

    test('a cancelled provider attempt cannot publish a prediction and is never refunded', async () => {
        const controller = new AbortController();
        respond = async () => { controller.abort(); throw new Error('synthetic cancellation'); };
        const adopt = jest.spyOn(svc.core, 'recordTaskResult');
        await expect(service.prepare(h.handle, request(), controller.signal)).rejects.toThrow();
        expect(requests).toHaveLength(1); expect(adopt).not.toHaveBeenCalled();
        const compute = await ledger(); expect(compute.attempts).toHaveLength(1);
        expect(compute.attempts[0]).toMatchObject({ status: 'unknown', usage: null });
    });
});
