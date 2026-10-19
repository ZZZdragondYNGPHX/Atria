import '../util/browser-context.js';
import { createNativeId } from '../../src/native/identity.js';
import { validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { evolutionFixture, testConfig } from './evolution-fixture.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { createLiveBridge } from './live-bridge.js';
import { hash, selectCases } from '../../src/native/agent-intelligence/evaluation/cases.js';
import { promotionDecision } from '../../src/native/agent-intelligence/evolution-evaluator.js';

const selection = { profileId: 'rp.m1.information', split: 'development', repetitions: 1, mode: 'source_probe' };
async function fixture(fetchImpl) {
    const f = await evolutionFixture(makeTempFsEngineHarness, 'rp-skill', { realEvaluator: true, confirmedPrice: null, fetchImpl });
    try {
        await createLiveBridge({ engine: f.h.engine, handle: f.h.handle, config: { ...testConfig, maxOutputTokens: 2048 }, secretPort: f.host.secretPort });
        const probe = (await f.host.persistence.listRuntimeRoutes(f.h.handle)).find(route => route.role === 'role.orchestrator' && route.runtimeRouteId !== f.route.runtimeRouteId);
        const route = await f.host.persistence.saveRuntimeRoute(f.h.handle, { ...probe, role: 'role.narrator', executionPolicy: { ...f.route.executionPolicy,
            allowedModelProfileIds: [probe.modelProfileRef.modelProfileId] } });
        const original = await f.service.targets.evaluationSettings(f.h.handle, f.scope, f.subject, f.target);
        const plans = f.host.turnOrchestration.plans, revision = original.nativePlan.revision;
        const draft = await plans.create(f.h.handle, createNativeId('orchestrationCommand'), { viewState: { positions: {} },
            definition: revision.definition, dependencyPins: revision.dependencyPins.map(pin => pin.port === 'model' ? { ...pin,
                resourceRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, integrity: hash(route) } : pin) });
        const expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
        const validation = await plans.validate(f.h.handle, expected);
        if (validation.status !== 'valid') throw new Error('Extended source observation Plan invalid');
        const { planRef } = await plans.publish(f.h.handle, createNativeId('orchestrationCommand'), { ...expected, validationDigest: validationDigest(validation) });
        const settings = { ...original, runtimeRouteId: route.runtimeRouteId,
            nativePlan: { ...original.nativePlan, planRef, revision: await plans.getRevision(f.h.handle, planRef) } };
        const config = await f.evaluator.sourceProbeConfiguration(f.h.handle, route.runtimeRouteId);
        const doc = await f.repository.get(f.h.handle, f.scope, f.subject);
        return { ...f, route, config, settings, job: { id: 'explicit-source-probe', scopeId: doc.scopeId, domain: 'rp', price: null } };
    } catch (error) { await f.h.cleanup(); throw error; }
}
function packet(config, arm = 'baseline') {
    const rendered = { endpoint: config.connection.endpoint, body: { model: config.model.remoteModelId, max_tokens: 2048 } };
    return { arm, inputTokens: 100, outputTokens: 2048, rendered, requestHash: hash(rendered), snapshotHash: hash('private-probe-packet'), trialId: 'probe-trial' };
}

test('explicit source observation honors the original 2048 Route ceiling through the funded worker without promotion or mutation', async () => {
    let calls = 0;
    const f = await fixture(async (_endpoint, options) => {
        calls++; expect(JSON.parse(options.body).max_tokens).toBe(2048);
        return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ choices: [{ message: { content: 'NPC offers the next choice.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } }) };
    });
    try {
        await expect(f.evaluator.configuration(f.h.handle, f.route.runtimeRouteId)).rejects.toThrow('supported exact bounded');
        const before = hash(f.config), entry = selectCases({ purpose: 'evaluation', split: 'development', profileId: selection.profileId })[0];
        const report = await f.evaluator.probe(f.h.handle, f.job, f.config, f.settings, new AbortController().signal, async () => {}, undefined, undefined,
            { ...selection, caseIds: [entry.caseId] });
        expect(calls).toBe(1); expect(hash(f.config)).toBe(before); expect(Object.isFrozen(f.config.generation.output)).toBe(true);
        expect(report.origin).toBe('host_source_probe'); expect(report.purpose).toBe('source_probe');
        expect(report.pairs[0]).toMatchObject({ candidate: null, judge: null, human: null }); expect(promotionDecision(report).eligible).toBe(false);
        expect(report.charges).toEqual([expect.objectContaining({ kind: 'baseline', tokens: 10, status: 'reported' })]);
        expect((await f.repository.owner(f.h.handle)).attempts).toEqual([expect.objectContaining({ kind: 'baseline', tokens: 10, status: 'reported' })]);
        await expect(f.evaluator.send(f.h.handle, f.job, f.config, packet(f.config), new AbortController().signal, async () => {})).rejects.toThrow('baseline only');
    } finally { await f.h.cleanup(); }
}, 30000);

test('extended probe identity cannot be copied, reused as candidate/judge/extraction, change the rendered output cap or outlive its active job', async () => {
    let sends = 0;
    const f = await fixture(async () => { sends++; throw new Error('Forbidden synthetic send'); });
    const signal = new AbortController().signal, send = (config, payload) => f.evaluator.send(f.h.handle, f.job, config, payload, signal, async () => {});
    const evaluate = f.evaluator._evaluate.bind(f.evaluator);
    try {
        await expect(send(f.config, packet(f.config))).rejects.toThrow('baseline only');
        await expect(f.evaluator.extract(f.h.handle, f.job, f.config, signal, async () => {}, {})).rejects.toThrow('observation only');
        await expect(f.evaluator.compare(f.h.handle, f.job, { baseline: f.config, candidate: f.config }, {}, signal, async () => {})).rejects.toThrow('observation only');
        f.evaluator._evaluate = async () => {
            for (const arm of ['candidate', 'judge', 'extraction']) await expect(send(f.config, packet(f.config, arm))).rejects.toThrow('baseline only');
            await expect(send(structuredClone(f.config), packet(f.config))).rejects.toThrow();
            for (const change of [{ max_tokens: 4096 }, { max_tokens: 2048, max_completion_tokens: 2048 }]) {
                const input = packet(f.config); Object.assign(input.rendered.body, change); input.requestHash = hash(input.rendered);
                await expect(send(f.config, input)).rejects.toThrow('output ceiling changed');
            }
            const different = { ...f.job };
            await expect(f.evaluator.send(f.h.handle, different, f.config, packet(f.config), signal, async () => {})).rejects.toThrow('baseline only');
            return { origin: 'test-no-send' };
        };
        await f.evaluator.probe(f.h.handle, f.job, f.config, f.settings, signal, async () => {}, undefined, undefined, selection);
        await expect(send(f.config, packet(f.config))).rejects.toThrow('baseline only');
        expect(sends).toBe(0); expect((await f.repository.owner(f.h.handle)).attempts).toEqual([]);
    } finally { f.evaluator._evaluate = evaluate; await f.h.cleanup(); }
}, 30000);

test('the same extended configuration cannot fund concurrent probe jobs and is released when its first job fails', async () => {
    const f = await fixture(async () => { throw new Error('No transport needed'); });
    let enter, stop;
    const entered = new Promise(resolve => { enter = resolve; }), blocked = new Promise(resolve => { stop = resolve; });
    const failure = new Error('Synthetic observation failure'), signal = new AbortController().signal;
    f.evaluator._evaluate = async () => { enter(); await blocked; throw failure; };
    try {
        const first = f.evaluator.probe(f.h.handle, f.job, f.config, f.settings, signal, async () => {}, undefined, undefined, selection);
        first.catch(() => {}); await entered;
        await expect(f.evaluator.probe(f.h.handle, { ...f.job }, f.config, f.settings, signal, async () => {}, undefined, undefined, selection)).rejects.toThrow('already active');
        stop(); await expect(first).rejects.toBe(failure);
        await expect(f.evaluator.send(f.h.handle, f.job, f.config, packet(f.config), signal, async () => {})).rejects.toThrow('baseline only');
        expect((await f.repository.owner(f.h.handle)).attempts).toEqual([]);
    } finally { stop(); await f.h.cleanup(); }
}, 30000);
