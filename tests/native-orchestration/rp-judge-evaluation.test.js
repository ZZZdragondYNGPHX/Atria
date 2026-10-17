import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { configureJudge } from './helpers/rp-judge-fixture.js';
import { configureAgentGraph } from './helpers/rp-agent-graph-fixture.js';
import { configurePlannerLoop, configurePlannerGraph, configurePlannerExpansion, plannerTaskFromRequest } from './helpers/rp-planner-fixture.js';
import { EvolutionTargets } from '../../src/native/agent-intelligence/evolution-targets.js';
import { EvolutionEvaluator, promotionDecision } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { AgentEvolutionRepository } from '../../src/native/agent-intelligence/evolution-repository.js';

jest.setTimeout(60_000);

describe.each(CONTRACT_HARNESSES)('$name isolated Native multi-Agent evaluation', ({ make }) => {
    test.each([['Judge', configureJudge, 4], ['Agent DAG', configureAgentGraph, 4], ['Planner loop', configurePlannerLoop, 3], ['Planner graph', configurePlannerGraph, 4], ['Planner expansion', configurePlannerExpansion, 3]])('%s baseline/candidate Plans execute in private Native Hosts while only the original parent ledger sends and pays', async (profile, configurePlan, modelCalls) => {
        const f = await rpModelFixture(make, { configurePlan,
            responsePayload: (body, ordinal) => ordinal === modelCalls * 2 + 1 ? JSON.stringify({ preference: 'tie', deltas: { player_agency: 0 }, rationale: 'Synthetic fixture only.' })
                : profile === 'Planner expansion' ? (ordinal - 1) % modelCalls === 0 ? (() => {
                    const template = plannerTaskFromRequest(body).nodeTemplates[0];
                    return JSON.stringify({ operations: [{ op: 'addNode', node: template.node }, ...template.edges.map(edge => ({ op: 'addEdge', edge }))] });
                })() : 'Final advisory narration.'
                    : profile === 'Planner loop' ? [JSON.stringify({ operations: [{ op: 'requestReplan' }] }), JSON.stringify({ operations: [{ op: 'requestFinalize' }] }), 'Final narration.'][(ordinal - 1) % modelCalls]
                        : profile === 'Planner graph' ? [JSON.stringify({ operations: [{ op: 'requestFinalize' }] }), 'ADVISORY A', 'ADVISORY B', 'Final narration.'][(ordinal - 1) % modelCalls]
                            : ['ADVISORY A', 'ADVISORY B', JSON.stringify({ selectedCandidate: 1, reasonCode: 'candidate_selected' }), 'Final narration.'][(ordinal - 1) % modelCalls] });
        try {
            const handle = f.h.handle, targets = new EvolutionTargets({ host: f.host });
            const scope = { domain: 'rp_chat', charDir: 'Actor', name: 'main', isGroup: false, groupId: '' };
            const choice = (await targets.catalog(handle, scope, 'Actor')).find(item => item.target.fieldPath === 'limits.maxSteps');
            await targets.declare(handle, scope, 'Actor', choice.target, choice.baseHash);
            const captured = await targets.capture(handle, scope, 'Actor', choice.target);
            const candidate = await targets.prepare(handle, scope, 'Actor', choice.target, captured, captured.body - 1);
            const settings = { baseline: await targets.evaluationSettings(handle, scope, 'Actor', choice.target),
                candidate: await targets.evaluationSettings(handle, scope, 'Actor', choice.target, candidate.candidateId) };
            const repository = new AgentEvolutionRepository({ engine: f.h.engine }), evaluator = new EvolutionEvaluator({ host: f.host, repository });
            await repository.limits(handle, { maxRequests: 12, maxTokens: 100000, minIntervalMs: 1000 }, 0);
            const config = await evaluator.configuration(handle, settings.baseline.runtimeRouteId, null, settings.baseline.nativePlan);
            const job = { id: 'native-judge-evaluation', scopeId: 'judge-scope', domain: 'rp', policyFingerprint: 'test-policy', targetPin: 'test-target', price: null };
            const report = await evaluator.compare(handle, job, { baseline: config, candidate: config }, settings, new AbortController().signal,
                async () => {}, async () => {}, async () => {}, { split: 'development', repetitions: 1, caseIds: ['rp_agency_d1'] });
            for (const arm of ['baseline', 'candidate']) {
                const trial = report.pairs[0][arm];
                expect(trial.error).toBeNull(); expect(trial.checks).toMatchObject({ target_consumed: true, single_completion: true, isolation: true, player_ownership: true });
                expect(trial.refs.effectIds).toHaveLength(modelCalls + 1); expect(trial.charges).toHaveLength(modelCalls);
                expect(trial.evidence.find(item => item.name === 'native_plan_execution').observed.planRef).toEqual(settings[arm].nativePlan.planRef);
            }
            expect(f.requests.length).toBe(modelCalls * 2 + 1); expect(f.effects).toEqual([]);
            const ledger = await repository.owner(handle); expect(ledger.attempts).toHaveLength(modelCalls * 2 + 1);
            expect(ledger.attempts.filter(item => item.kind === 'judge')).toHaveLength(1);
            expect(ledger.attempts.every(item => item.status === 'reported')).toBe(true);
            expect((await f.chats.get(handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
            expect((await f.plans.getBinding(handle, f.sourceSelector)).planRef).toEqual(f.planRef);
            expect(promotionDecision(report, { policyFingerprint: job.policyFingerprint, targetPin: job.targetPin }).eligible).toBe(false);
        } finally { await f.cleanup(); }
    });
    test('every selected Route is pinned before evaluation and foreign or missing frozen Routes are rejected before send', async () => {
        const f = await rpModelFixture(make, { configurePlan: configureJudge });
        try {
            const handle = f.h.handle, targets = new EvolutionTargets({ host: f.host }), scope = { domain: 'rp_chat', charDir: 'Actor', name: 'main', isGroup: false, groupId: '' };
            const choice = (await targets.catalog(handle, scope, 'Actor')).find(item => item.target.fieldPath === 'limits.maxSteps');
            const settings = await targets.evaluationSettings(handle, scope, 'Actor', choice.target);
            expect(settings.runtimeRouteId).toBe(f.input.routeRef.runtimeRouteId);
            const repository = new AgentEvolutionRepository({ engine: f.h.engine }), evaluator = new EvolutionEvaluator({ host: f.host, repository });
            const config = await evaluator.configuration(handle, settings.runtimeRouteId, null, settings.nativePlan);
            expect(config.nativeRoutes).toHaveLength(3);
            const job = { id: 'missing-routes', scopeId: 'judge-scope', domain: 'rp', policyFingerprint: 'test-policy', targetPin: 'test-target', price: null };
            await expect(evaluator.compare(handle, job, { baseline: { ...config, nativeRoutes: [] }, candidate: config }, { baseline: settings, candidate: settings },
                new AbortController().signal, async () => {}, undefined, undefined, { split: 'development', repetitions: 1, caseIds: ['rp_agency_d1'] })).rejects.toThrow('native_orchestration_evaluation_unavailable');
            const foreign = { ...config, nativeRoutes: [...config.nativeRoutes, config] };
            await expect(evaluator.compare(handle, job, { baseline: foreign, candidate: config }, { baseline: settings, candidate: settings },
                new AbortController().signal, async () => {}, undefined, undefined, { split: 'development', repetitions: 1, caseIds: ['rp_agency_d1'] })).rejects.toThrow('native_orchestration_evaluation_unavailable');
            const route = config.nativeRoutes[0].route;
            await f.persistence.saveRuntimeRoute(handle, { ...route, displayName: 'Changed original selected Route' });
            await expect(evaluator.configuration(handle, settings.runtimeRouteId, null, settings.nativePlan)).rejects.toThrow('native_orchestration_evaluation_unavailable');
            expect(f.requests.length).toBe(0); expect(await repository.owner(handle)).toBeNull();
        } finally { await f.cleanup(); }
    });
});
