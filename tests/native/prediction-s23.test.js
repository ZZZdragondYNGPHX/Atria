import { expect, jest, test } from '@jest/globals';
import { PredictionService, assertPredictionCapture, assertPredictionCaptureCurrent } from '../../src/native/prediction-service.js';
import { predictionFixture, installedPredictionFixture } from './helpers/prediction-fixture.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';

function consumerFixture(change = () => {}) {
    const f = predictionFixture(change), state = { base: f.base, installed: f.installed };
    let capture;
    const host = { sessionCore: { load: jest.fn(async () => state.base), _openPackage: jest.fn(async () => state.installed) },
        executePrediction: jest.fn(async (handle, _input, value) => {
            capture = value;
            const data = assertPredictionCapture(value, { host, handle });
            await assertPredictionCaptureCurrent(value, { host, handle });
            return { record: { payload: { prediction: 'The public note may change.', assumptions: ['The declared action is selected.'],
                supportRefs: [data.observation.items[0].id], uncertainty: { confidence: 0.7, limitations: ['The action has not happened.'] } },
            requestSnapshotHash: 'snapshot-hash', rawResultHash: 'raw-hash', promptProgramRef: data.variant.prompt,
            generationProfileRef: data.variant.generation, runtimeRouteId: 'route.prediction',
            execution: { connection: { providerAdapter: 'provider.fixture', connectionProfileId: 'connection.fixture', endpoint: 'PRIVATE ENDPOINT', options: { key: 'PRIVATE OPTION' } },
                model: { modelProfileId: 'model.fixture', remoteModelId: 'remote.fixture' }, generation: { generationProfileId: data.variant.generation.resourceId, revision: 'r1' },
                resources: [{ body: 'PRIVATE PROMPT' }] } },
            routing: { compute: { configured: true, observationScope: 'current_request', attempts: [{ status: 'settled', usage: { totalTokens: 100 } }] } } };
        }), previewPrediction: jest.fn(async (handle, _input, value) => {
            capture = value; assertPredictionCapture(value, { host, handle });
            return { preview: true, snapshot: { contextPlan: { items: [{ id: 'hypothetical-prediction' }] } } };
        }) };
    return { ...f, state, host, service: new PredictionService({ host }), capture: () => capture };
}

test('S23 consumer returns explicitly hypothetical authorized prediction with safe actual execution and no state publication', async () => {
    const f = consumerFixture(), before = structuredClone(f.base);
    const artifact = await f.service.prepare('owner', f.body);
    expect(artifact).toMatchObject({ kind: 'hypothetical', mode: 'model_prediction', uncertainty: { confidence: 0.7, realOutcome: 'not_observed' },
        execution: { effective: { providerAdapter: 'provider.fixture', remoteModelId: 'remote.fixture' }, compute: { attempts: [{ usage: { totalTokens: 100 } }] } } });
    const data = assertPredictionCapture(f.capture());
    expect(JSON.stringify(data.observation)).not.toContain('PRIVATE SENTINEL');
    expect(JSON.stringify(artifact)).not.toMatch(/PRIVATE|snapshot":|candidate|proof|receipt/);
    expect(Object.isFrozen(data.snapshot.states)).toBe(true); expect(Object.isFrozen(artifact.uncertainty)).toBe(true);
    expect(f.base).toEqual(before); expect(await f.service.current('owner', { sessionId: f.body.sessionId, artifact })).toEqual({ current: true });
});

test('S23 captures are bound to Host and owner and copies never carry prediction authority', async () => {
    const f = consumerFixture(); await f.service.prepare('owner', f.body);
    expect(() => assertPredictionCapture(f.capture(), { host: {}, handle: 'owner' })).toThrow(/capture_invalid/);
    expect(() => assertPredictionCapture(f.capture(), { host: f.host, handle: 'foreign' })).toThrow(/capture_invalid/);
    expect(() => assertPredictionCapture({ ...f.capture() })).toThrow(/capture_invalid/);
    await expect(assertPredictionCaptureCurrent(f.capture(), { host: f.host, handle: 'foreign' })).rejects.toThrow(/capture_invalid/);
});

test('S23 currentness covers unrevisioned state, source bytes, scope and Session identity changes', async () => {
    const f = consumerFixture(), artifact = await f.service.prepare('owner', f.body);
    for (const alter of [base => { base.timeline[0].content = 'new turn'; },
        base => { base.states.atri_lifecycle.scopes.session.epoch++; }, base => { base.states.atri_lifecycle.scopes.session.status = 'suspended'; }]) {
        f.state.base = structuredClone(f.base); alter(f.state.base);
        expect(await f.service.current('owner', { sessionId: f.body.sessionId, artifact })).toEqual({ current: false });
    }
    f.state.base = f.base; f.state.installed = { ...f.installed, sourceFiles: new Map(f.installed.sourceFiles) };
    f.state.installed.sourceFiles.set('logic.json', Buffer.from('{}'));
    expect(await f.service.current('owner', { sessionId: f.body.sessionId, artifact })).toEqual({ current: false });
    expect(await f.service.current('owner', { sessionId: 'foreign', artifact })).toEqual({ current: false });
    expect(await f.service.current('owner', { sessionId: f.body.sessionId, artifact: { ...artifact, mode: 'deterministic' } })).toEqual({ current: false });
});

test('S23 preparation and preflight reject unsafe request/task/view before reaching provider', async () => {
    for (const change of [f => { f.task = null; f.contract.taskRuntime.tasks[0].context.push('world'); },
        f => { f.contract.taskRuntime.tasks[0].resultPolicy.applyCommand = 'unsafe.apply'; },
        f => { f.contract.taskRuntime.tasks[0].executionClass = 'background'; }]) {
        const f = consumerFixture(change);
        await expect(f.service.prepare('owner', f.body)).rejects.toThrow(); expect(f.host.executePrediction).not.toHaveBeenCalled();
    }
    const f = consumerFixture();
    for (const body of [{ ...f.body, handle: 'foreign' }, { ...f.body, revisionId: 'stale' },
        { ...f.body, request: { ...f.body.request, viewId: 'private' } },
        { ...f.body, request: { ...f.body.request, action: { ...f.body.request.action, proof: {} } } },
        { ...f.body, request: { ...f.body.request, slotBindings: { structured: { scope: 'session', runtimeRouteId: 'route.prediction' } } } }]) {
        await expect(f.service.prepare('owner', body)).rejects.toThrow();
    }
    expect(f.host.executePrediction).not.toHaveBeenCalled();
    expect(await f.service.preflight('owner', f.body)).toMatchObject({ preview: true });
    expect(f.host.executePrediction).not.toHaveBeenCalled(); expect(f.host.previewPrediction).toHaveBeenCalledTimes(1);
});

test('S23 late results and cancellation are refused while actual Host costs remain owned by the Host', async () => {
    const f = consumerFixture(), run = f.host.executePrediction.getMockImplementation();
    f.host.executePrediction.mockImplementation(async (...args) => { const result = await run(...args); f.state.base = structuredClone(f.base); f.state.base.timeline.push({ role: 'user', content: 'intervening turn' }); return result; });
    await expect(f.service.prepare('owner', f.body)).rejects.toThrow(/revision_conflict/);
    expect(f.host.executePrediction).toHaveBeenCalledTimes(1);
    const cancelled = consumerFixture(), controller = new AbortController(); controller.abort();
    await expect(cancelled.service.prepare('owner', cancelled.body, controller.signal)).rejects.toThrow(); expect(cancelled.host.executePrediction).not.toHaveBeenCalled();
    const late = consumerFixture(), operation = late.host.executePrediction.getMockImplementation(), abort = new AbortController();
    late.host.executePrediction.mockImplementation(async (...args) => { const result = await operation(...args); abort.abort(); return result; });
    await expect(late.service.prepare('owner', late.body, abort.signal)).rejects.toThrow();
    expect(late.host.executePrediction).toHaveBeenCalledTimes(1);
});

test('S23 model payload cannot invent support refs, source anchors or unsupported confidence', async () => {
    for (const alter of [payload => { payload.supportRefs = ['private:invented']; }, payload => { payload.supportRefs.push(payload.supportRefs[0]); },
        payload => { payload.baseAnchor = {}; }, payload => { payload.uncertainty.confidence = 1.1; }]) {
        const f = consumerFixture(), operation = f.host.executePrediction.getMockImplementation();
        f.host.executePrediction.mockImplementation(async (...args) => { const result = await operation(...args); alter(result.record.payload); return result; });
        await expect(f.service.prepare('owner', f.body)).rejects.toThrow(); expect(f.host.executePrediction).toHaveBeenCalledTimes(1);
    }
});

test('S23 capture work uses the existing installed Session ledger, retains failed preparation costs and preflight is nonpersistent', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const installed = await installedPredictionFixture(h), f = consumerFixture();
        f.host.sessionCore = installed.core;
        f.host.persistence = { getRuntimeRoute: jest.fn(async () => ({ scope: 'player', executionPolicy: { computeBudget: {
            maxRequests: 1, maxTokens: 4096, localWork: { maxJobs: 2, maxItems: 10000, maxInputBytes: 16777216 } } } })) };
        const before = await installed.core.runs.status(h.handle, installed.body.sessionId);
        await f.service.preflight(h.handle, installed.body);
        expect(await installed.core.runs.status(h.handle, installed.body.sessionId)).toEqual(before);
        const artifact = await f.service.prepare(h.handle, installed.body);
        expect(artifact.execution.compute.localWork[0]).toMatchObject({ kind: 'context_build', status: 'settled', usage: { cpuScope: 'process', outcome: 'completed' } });
        const invalid = structuredClone(installed.body); invalid.request.action.input.amount = 99;
        await expect(f.service.prepare(h.handle, invalid)).rejects.toThrow();
        const bank = await installed.core.runs.status(h.handle, installed.body.sessionId);
        const entries = Object.values(bank.operations).flatMap(op => op.compute?.localWork ?? []);
        expect(entries).toHaveLength(2); expect(entries[1]).toMatchObject({ status: 'settled', usage: { outcome: 'failed' } });
        await expect(f.service.prepare(h.handle, installed.body)).rejects.toThrow(/budget/);
        expect(await installed.core.runs.status(h.handle, installed.body.sessionId)).toEqual(bank);
        expect(f.host.executePrediction).toHaveBeenCalledTimes(1);
        expect(await installed.core.load(h.handle, installed.body.sessionId)).toEqual(installed.base);
    } finally { await h.cleanup(); }
});
