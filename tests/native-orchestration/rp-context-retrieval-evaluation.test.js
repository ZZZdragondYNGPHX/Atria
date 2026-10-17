import { contextRetrievalFixture } from './helpers/context-retrieval-fixture.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { EvolutionTargets } from '../../src/native/agent-intelligence/evolution-targets.js';
import { EvolutionEvaluator, promotionDecision } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { AgentEvolutionRepository } from '../../src/native/agent-intelligence/evolution-repository.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';
import { sendEvaluationRetrieval } from '../../src/native/agent-intelligence/evaluation/retrieval-transport.js';
import { retrievalRef } from '../../public/scripts/native/retrieval-contracts.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { createNativeId } from '../../src/native/identity.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { retrievalPostTarget } from '../../src/native/retrieval-send-contracts.js';
import { configureRetrievalAgentGraph } from './helpers/rp-agent-graph-retrieval-fixture.js';
import { configurePlannerExpansion } from './helpers/rp-planner-fixture.js';
import { configureControlRetrieval } from './helpers/rp-control-retrieval-fixture.js';

async function setup(make, options = {}) {
    const f = await contextRetrievalFixture(make, { embedding: true, ...options }), handle = f.h.handle;
    const targets = new EvolutionTargets({ host: f.host }), scope = { domain: 'rp_chat', charDir: 'Actor', name: 'main', isGroup: false, groupId: '' };
    const choice = (await targets.catalog(handle, scope, 'Actor')).find(item => item.target.fieldPath === 'limits.maxSteps');
    await targets.declare(handle, scope, 'Actor', choice.target, choice.baseHash);
    const captured = await targets.capture(handle, scope, 'Actor', choice.target);
    const candidate = await targets.prepare(handle, scope, 'Actor', choice.target, captured, captured.body - 1);
    const settings = { baseline: await targets.evaluationSettings(handle, scope, 'Actor', choice.target),
        candidate: await targets.evaluationSettings(handle, scope, 'Actor', choice.target, candidate.candidateId) };
    const repository = new AgentEvolutionRepository({ engine: f.h.engine }), evaluator = new EvolutionEvaluator({ host: f.host, repository });
    await repository.limits(handle, { maxRequests: 12, maxTokens: 100000, minIntervalMs: 1000 }, 0);
    const configs = {};
    for (const arm of ['baseline', 'candidate']) configs[arm] = await evaluator.configuration(handle, settings[arm].runtimeRouteId, null, settings[arm].nativePlan);
    const job = { id: 'context-embedding-evaluation', scopeId: 'context-scope', domain: 'rp', policyFingerprint: 'test-policy', targetPin: 'test-target',
        price: { source: 'synthetic Model only', currency: 'USD', inputPerMillion: 1, outputPerMillion: 1, confirmedAt: 1000 } };
    return { ...f, repository, evaluator, configs, settings, job, compare: () => evaluator.compare(handle, job, configs, settings, new AbortController().signal,
        async () => {}, async () => {}, async () => {}, { split: 'development', repetitions: 1, caseIds: ['rp_agency_d1'] }) };
}

function packet(f) {
    const profile = f.configs.baseline.retrievalProfiles[0], { endpoint, method } = retrievalPostTarget(profile);
    const body = profile.mode === 'embed' ? { model: profile.model, input: ['Synthetic public fixture'] }
        : { model: profile.model, query: 'Why did Alice leave?', documents: ['A storm.', 'A promise.'], top_n: 2 };
    const payload = { arm: 'baseline', kind: 'retrieval', trialId: 'transport-fixture', nativeRetrievalRef: retrievalRef(profile), profileIntegrity: hash(profile),
        endpoint, method, body, requestHash: hash({ endpoint, method, body }), snapshotHash: null,
        effectRef: { runId: createNativeId('orchestrationRun'), effectId: createNativeId('orchestrationEffect'),
            nodeAttemptId: createNativeId('orchestrationAttempt'), modelEffectId: createNativeId('orchestrationEffect') } };
    payload.snapshotHash = hash({ profile, effectRef: payload.effectRef }); return payload;
}
const dispatch = (f, payload) => sendEvaluationRetrieval({ host: f.host, repository: f.repository, handle: f.h.handle, job: f.job,
    config: f.configs.baseline, payload, signal: new AbortController().signal, fresh: async () => {} });

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s isolated original Context retrieval', (_name, make) => {
    test('actual private workers use original embedding Effects/index and parent-only paid protocols without touching production Source', async () => {
        const f = await setup(make);
        try {
            const original = await f.chats.get(f.h.handle, 'Actor', 'main'), binding = await f.plans.getBinding(f.h.handle, f.sourceSelector);
            const report = await f.compare(), ledger = await f.repository.owner(f.h.handle);
            expect(f.calls).toHaveLength(4); expect(f.requests).toHaveLength(3);
            expect(f.calls.every(row => row.auth === 'Bearer synthetic-rerank-secret')).toBe(true);
            expect(JSON.stringify(f.calls)).not.toContain('PRIVATE:'); expect(JSON.stringify(f.configs)).not.toContain('synthetic-rerank-secret');
            expect(report.charges).toHaveLength(7); expect(ledger.attempts).toHaveLength(7);
            expect(report.charges.every(row => row.status === 'reported')).toBe(true);
            expect(report.charges.filter(row => row.cost === null)).toHaveLength(4);
            for (const arm of ['baseline', 'candidate']) {
                expect(report.pairs[0][arm].checks).toMatchObject({ target_consumed: true, isolation: true, request_exposure: true, single_completion: true });
                expect(report.pairs[0][arm].charges).toHaveLength(3); expect(report.pairs[0][arm].refs.effectIds).toHaveLength(4);
            }
            expect(promotionDecision(report, { ...f.job, ledger, jobId: f.job.id }).eligible).toBe(false);
            expect(promotionDecision(report, { ...f.job, ledger, jobId: f.job.id }).reasons).toContain('job_cost_unsettled');
            expect(await f.chats.get(f.h.handle, 'Actor', 'main')).toEqual(original);
            expect(await f.plans.getBinding(f.h.handle, f.sourceSelector)).toEqual(binding);
        } finally { await f.cleanup(); }
    }, 60000);

    test('private Planner workers retain exact template retrieval pins even when no optional Draft is selected', async () => {
        const f = await setup(make, { afterPlan: async (plan, args) => {
            await configurePlannerExpansion(plan, args); await configureControlRetrieval(plan, args); plan.definition.limits.maxSteps = 160;
        }, responsePayload: (_body, ordinal) => ordinal === 5
            ? JSON.stringify({ preference: 'tie', deltas: { player_agency: 0 }, rationale: 'Synthetic engineering fixture only.' })
            : ordinal % 2 === 1 ? JSON.stringify({ operations: [{ op: 'requestFinalize' }] }) : 'Final optional narration.' });
        try {
            const original = await f.chats.get(f.h.handle, 'Actor', 'main'), report = await f.compare(), ledger = await f.repository.owner(f.h.handle);
            expect(f.calls).toHaveLength(6); expect(f.requests).toHaveLength(5); expect(report.charges).toHaveLength(11);
            expect(ledger.attempts).toHaveLength(11); expect(ledger.attempts.every(row => row.status === 'reported')).toBe(true);
            for (const arm of ['baseline', 'candidate']) {
                const trial = report.pairs[0][arm];
                expect(trial.error).toBeNull(); expect(trial.checks).toMatchObject({ target_consumed: true, isolation: true, request_exposure: true, single_completion: true });
                expect(trial.charges).toHaveLength(5); expect(trial.refs.effectIds).toHaveLength(6);
            }
            expect(report.charges.filter(row => row.cost === null)).toHaveLength(6);
            expect(promotionDecision(report, { ...f.job, ledger, jobId: f.job.id }).eligible).toBe(false);
            expect(await f.chats.get(f.h.handle, 'Actor', 'main')).toEqual(original); expect(f.effects).toEqual([]);
        } finally { await f.cleanup(); }
    }, 120000);

    test('private Agent graph workers close original Draft retrieval/Result fees and reuse each arm own index', async () => {
        const f = await setup(make, { afterPlan: (plan, args) => configureRetrievalAgentGraph(plan, args, 'one-draft') });
        try {
            const original = await f.chats.get(f.h.handle, 'Actor', 'main'), report = await f.compare();
            expect(f.calls).toHaveLength(6); expect(f.requests).toHaveLength(5); expect(report.charges).toHaveLength(11);
            for (const arm of ['baseline', 'candidate']) {
                expect(report.pairs[0][arm].checks.target_consumed).toBe(true);
                expect(report.pairs[0][arm].charges).toHaveLength(5); expect(report.pairs[0][arm].refs.effectIds).toHaveLength(6);
            }
            expect((await f.repository.owner(f.h.handle)).attempts).toHaveLength(11);
            expect(await f.chats.get(f.h.handle, 'Actor', 'main')).toEqual(original);
        } finally { await f.cleanup(); }
    }, 120000);

    test.each([['absent', { usage: false }], ['partial', { providerUsage: { prompt_tokens: 7 } }]])('%s embedding usage preserves the parent charge and stops before Model, Judge or second arm', async (_mode, options) => {
        const f = await setup(make, options);
        try {
            await expect(f.compare()).rejects.toThrow(); expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(0);
            expect((await f.repository.owner(f.h.handle)).attempts).toMatchObject([{ status: 'unknown', cost: null }]);
        } finally { await f.cleanup(); }
    }, 60000);

    test('parent strips unrelated Provider usage fields before the worker response', async () => {
        const f = await setup(make, { providerUsage: { total_tokens: 7, echoed_secret: 'synthetic-rerank-secret', request: 'FORBIDDEN ECHO' } });
        try {
            const result = await dispatch(f, packet(f)); expect(result.raw.usage).toEqual({ total_tokens: 7 });
            expect(JSON.stringify(result)).not.toContain('synthetic-rerank-secret'); expect(JSON.stringify(result)).not.toContain('FORBIDDEN ECHO');
        } finally { await f.cleanup(); }
    }, 60000);

    test('configured production retrieval without a Plan capability is also refused by the isolated original Memory consumer', async () => {
        const f = await setup(make, { declareRetrieval: false });
        try {
            expect(f.configs.baseline.memorySettings.nativeRetrieval.embed).toBeDefined();
            expect(f.configs.baseline.retrievalProfiles).toBeUndefined();
            await expect(f.compare()).rejects.toThrow(); expect(f.calls).toHaveLength(0); expect(f.requests).toHaveLength(0);
            expect((await f.repository.owner(f.h.handle)).attempts).toEqual([]);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each(['profile', 'settings'])('forged frozen %s closure is refused before worker or paid work', async field => {
        const f = await setup(make);
        try {
            if (field === 'profile') f.configs.baseline.retrievalProfiles[0].endpoint += '/different';
            else f.configs.baseline.memorySettings.rerankEnabled = true;
            await expect(f.compare()).rejects.toThrow('native_orchestration_evaluation_retrieval_denied');
            expect(f.calls).toHaveLength(0); expect(f.requests).toHaveLength(0); expect((await f.repository.owner(f.h.handle)).attempts).toEqual([]);
        } finally { await f.cleanup(); }
    }, 60000);

    test('parent validates target/body and stable child Effect identity prevents an RPC resend', async () => {
        const f = await setup(make);
        try {
            const payload = packet(f), forged = { ...payload, endpoint: payload.endpoint + '/forged' };
            forged.requestHash = hash({ endpoint: forged.endpoint, method: forged.method, body: forged.body });
            await expect(dispatch(f, forged)).rejects.toThrow(); expect(f.calls).toHaveLength(0);
            const result = await dispatch(f, payload); expect(result.raw.data).toHaveLength(1); expect(result.charge.cost).toBeNull();
            await expect(dispatch(f, payload)).rejects.toThrow('Duplicate evolution send');
            await expect(dispatch(f, { ...payload, arm: 'candidate', trialId: payload.trialId + ':forged' })).rejects.toThrow('Duplicate evolution send');
            expect(f.calls).toHaveLength(1); expect((await f.repository.owner(f.h.handle)).attempts).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test('parent uses the same original Rerank protocol and keeps its distinct unpriced service charge', async () => {
        const f = await setup(make, { embedding: false, reranking: true });
        try {
            const result = await dispatch(f, packet(f));
            expect(f.calls).toHaveLength(1); expect(f.calls[0].endpoint).toBe('/v1/rerank');
            expect(f.calls[0].auth).toBe('Bearer synthetic-rerank-secret');
            expect(result.raw).toEqual({ results: [{ index: 0, relevance_score: 0 }, { index: 1, relevance_score: 1 }], usage: { total_tokens: 7 } });
            expect(result.charge).toMatchObject({ status: 'reported', tokens: 7, cost: null });
            expect((await f.repository.owner(f.h.handle)).attempts).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test('parent final ledger settlement cannot return a response after original Memory settings withdrawal', async () => {
        const f = await setup(make), original = f.repository.settle.bind(f.repository);
        f.repository.settle = async (...args) => {
            const value = await original(...args), repo = new SettingsRepo({ engine: f.h.engine }), settings = await repo.get(f.h.handle);
            settings.atri_capabilities.memory_graph.recallEnabled = false; await repo.save(f.h.handle, settings); return value;
        };
        try {
            await expect(dispatch(f, packet(f))).rejects.toThrow('native_orchestration_evaluation_retrieval_denied');
            expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(0);
            expect((await f.repository.owner(f.h.handle)).attempts).toMatchObject([{ status: 'reported', cost: null, tokens: 7 }]);
        } finally { await f.cleanup(); }
    }, 60000);

    test('parent ambient transaction is refused before a reservation or Provider send', async () => {
        const f = await setup(make);
        try {
            await expect(f.h.engine.withTransaction(f.h.handle, () => dispatch(f, packet(f)))).rejects.toThrow();
            expect(f.calls).toHaveLength(0); expect((await f.repository.owner(f.h.handle)).attempts).toEqual([]);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each([false, true])('parent settlement ACK lost, saved=%s, withholds the actual worker response and never starts Model/Judge', async saved => {
        const f = await setup(make), original = f.repository.settle.bind(f.repository); let lost = false;
        f.repository.settle = async (...args) => {
            if (!lost) {
                lost = true; if (saved) await original(...args);
                throw new StorageCommitUnknownError(new Error('Synthetic parent retrieval settlement ACK'));
            }
            return original(...args);
        };
        try {
            await expect(f.compare()).rejects.toThrow(); expect(lost).toBe(true);
            expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(0);
            expect((await f.repository.owner(f.h.handle)).attempts).toMatchObject([{ status: saved ? 'reported' : 'reserved', cost: null }]);
        } finally { await f.cleanup(); }
    }, 60000);

    test('original settings changed while parent Provider works preserve the real fee and stop the worker before Model', async () => {
        const f = await setup(make);
        try {
            f.onRerank(async () => {
                const repo = new SettingsRepo({ engine: f.h.engine }), settings = await repo.get(f.h.handle);
                settings.atri_capabilities.memory_graph.recallEnabled = false; await repo.save(f.h.handle, settings);
            });
            await expect(f.compare()).rejects.toThrow(); expect(f.calls).toHaveLength(1); expect(f.requests).toHaveLength(0);
            expect((await f.repository.owner(f.h.handle)).attempts).toMatchObject([{ status: 'reported', tokens: 7 }]);
            expect((await new SettingsRepo({ engine: f.h.engine }).get(f.h.handle)).atri_capabilities.memory_graph.recallEnabled).toBe(false);
        } finally { await f.cleanup(); }
    }, 60000);
});
