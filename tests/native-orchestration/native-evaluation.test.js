import { projectModelFixture } from './helpers/project-model-fixture.js';
import { configureProjectToolPlan } from './helpers/project-tool-fixture.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { createNativeId } from '../../src/native/identity.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { EvolutionTargets } from '../../src/native/agent-intelligence/evolution-targets.js';
import { EvolutionEvaluator, promotionDecision } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { AgentEvolutionRepository } from '../../src/native/agent-intelligence/evolution-repository.js';
import { selectCases, loadFixture, PILOT_CASE_SET_REVISION } from '../../src/native/agent-intelligence/evaluation/cases.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
function configurePlan(plan) {
    plan.definition.nodes.find(node => node.kind === 'output').capabilities = ['chat.output'];
    plan.definition.capabilityCeiling.push('chat.output');
    Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 65536 } });
}

describe.each(harnesses)('$name isolated original Native RP evaluation', ({ make }) => {
    test('exact baseline/candidate Plans use real Native Run/Effect/Chat output while only the parent original Evolution ledger pays', async () => {
        const f = await rpModelFixture(make, { configurePlan }), handle = f.h.handle;
        try {
            const targets = new EvolutionTargets({ host: f.host }), scope = { domain: 'rp_chat', charDir: 'Actor', name: 'main', isGroup: false, groupId: '' };
            const choice = (await targets.catalog(handle, scope, 'Actor')).find(item => item.target.fieldPath === 'limits.maxSteps');
            await targets.declare(handle, scope, 'Actor', choice.target, choice.baseHash);
            const capture = await targets.capture(handle, scope, 'Actor', choice.target);
            const candidate = await targets.prepare(handle, scope, 'Actor', choice.target, capture, capture.body - 1);
            const settings = { baseline: await targets.evaluationSettings(handle, scope, 'Actor', choice.target),
                candidate: await targets.evaluationSettings(handle, scope, 'Actor', choice.target, candidate.candidateId) };
            const repository = new AgentEvolutionRepository({ engine: f.h.engine }), evaluator = new EvolutionEvaluator({ host: f.host, repository });
            await repository.limits(handle, { maxRequests: 10, maxTokens: 100000, minIntervalMs: 1000 }, 0);
            const config = await evaluator.configuration(handle, settings.baseline.runtimeRouteId);
            const job = { id: 'native-evaluation-case', scopeId: 'native-evaluation-scope', domain: 'rp', policyFingerprint: 'test-policy', targetPin: 'test-target', price: null };
            let checks = 0;
            const report = await evaluator.compare(handle, job, { baseline: config, candidate: config }, settings, new AbortController().signal, async () => { checks++; },
                async () => {}, async () => {}, { split: 'development', repetitions: 1, caseIds: ['rp_agency_d1', 'rp_variant_d1'] });
            expect(report.origin).toBe('host_evaluator'); expect(report.pairs).toHaveLength(2);
            for (const arm of ['baseline', 'candidate']) {
                const trial = report.pairs[0][arm];
                expect(trial.error).toBeNull(); expect(trial.checks).toMatchObject({ target_consumed: true, isolation: true, player_ownership: true, single_completion: true });
                expect(trial.refs.runIds).toHaveLength(1); expect(trial.refs.effectIds.length).toBeGreaterThan(1);
                expect(trial.evidence.find(item => item.name === 'native_plan_execution').observed.planRef).toEqual(settings[arm].nativePlan.planRef);
                expect(trial.charges).toHaveLength(1);
            }
            for (const arm of ['baseline', 'candidate']) {
                expect(report.pairs[1][arm].checks).toMatchObject({ stale_completion: true, variant_identity: true, target_consumed: true });
                expect(report.pairs[1][arm].charges).toHaveLength(1); expect(report.pairs[1][arm].refs.runIds).toHaveLength(2);
            }
            expect(checks).toBeGreaterThan(2); expect(f.requests).toHaveLength(6);
            const ledger = await repository.owner(handle); expect(ledger.attempts).toHaveLength(6);
            expect(ledger.attempts.every(attempt => attempt.status === 'reported')).toBe(true);
            expect(repository.totals(ledger).requests).toBe(6);
            expect((await f.chats.get(handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
            expect((await f.plans.getBinding(handle, f.sourceSelector)).planRef).toEqual(f.planRef); expect(f.effects).toEqual([]);
            expect(promotionDecision(report, { policyFingerprint: job.policyFingerprint, targetPin: job.targetPin }).eligible).toBe(false);
            let revoked = false;
            f.onResponse(async () => { revoked = true; });
            await expect(evaluator.compare(handle, { ...job, id: 'native-evaluation-revoked' }, { baseline: config, candidate: config }, settings,
                new AbortController().signal, async () => { if (revoked) throw Object.assign(new Error('native_orchestration_source_stale'), { code: 'native_orchestration_source_stale' }); },
                async () => {}, async () => {}, { split: 'development', repetitions: 1, caseIds: ['rp_agency_d1'] })).rejects.toThrow('native_orchestration_source_stale');
            expect(f.requests).toHaveLength(7);
            const retained = await repository.owner(handle); expect(retained.attempts).toHaveLength(7);
            expect(retained.attempts.at(-1).status).toBe('reported');
            expect((await f.chats.get(handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);

        } finally { await f.cleanup(); }
    }, 30000);
});


describe.each(harnesses)('$name isolated original Native Project evaluation', ({ make }) => {
    test.each(['ordinary', 'related_pilot', 'route_selection'])('%s exact Plan executes original Task tools, Review and Root in private source', async profile => {
        const pilot = profile === 'related_pilot';
        const routeSelection = profile === 'route_selection'; let routeAlternative;
        const entries = pilot ? selectCases({ purpose: 'evaluation', split: 'development', profileId: 'project.m1.related', caseSetRevision: PILOT_CASE_SET_REVISION }) : [];
        const fixtures = entries.map(entry => loadFixture(entry, { purpose: 'evaluation' }));
        const f = await projectModelFixture(make, { format: 'openai-compatible', maxModelRounds: 3, configurePlan: async args => {
            await configureProjectToolPlan(['atri_agent_get_project', 'atri_agent_set_plan', 'atri_agent_reset_operations', 'atri_agent_project_save', 'atri_agent_prepare_review'])(args);
            Object.assign(args.plan.definition.outputContract, { kind: 'project_review', resultPolicy: { outputType: 'json', maxBytes: 16384 } });
            args.plan.definition.limits.maxSteps = 100;
            const node = args.plan.definition.nodes[0]; node.inputs.push({ name: 'continuation', type: 'json', required: false });
            if (routeSelection) {
                const alternative = { ...args.route, runtimeRouteId: createNativeId('runtimeRoute'), displayName: 'Predeclared evaluation Route' };
                await args.host.persistence.saveRuntimeRoute(args.h.handle, alternative);
                routeAlternative = { scope: 'player', runtimeRouteId: alternative.runtimeRouteId };
                args.plan.dependencyPins.push({ pinId: 'studio.route-alternative', port: 'model', resourceRef: routeAlternative, integrity: hash(alternative) });
                node.dependencyPinIds.push('studio.route-alternative');
            }
            args.plan.definition.edges.push({ edgeId: createNativeId('orchestrationEdge'), from: { nodeId: node.nodeId, port: 'response' },
                to: { nodeId: node.nodeId, port: 'continuation' }, condition: 'always', maxVisits: 2, loopBack: true });
            await args.seeded.persistence.saveModelProfile(args.h.handle, { ...args.seeded.model, limits: { ...args.seeded.model.limits, contextTokens: 65536 } });
        }, responseBody: ({ body, index }) => {
            const project = body.messages.filter(message => message.role === 'tool' || message.content?.startsWith('Previous tool observation (atri_agent_get_project): ')).map(message => {
                try { return JSON.parse(message.content.replace(/^Previous tool observation \(atri_agent_get_project\): /, '')); } catch { return null; }
            }).find(result => result?.source?.project);
            const calls = project ? (() => {
                const source = structuredClone(project.source);
                if (pilot) {
                    const fixture = fixtures.find(item => source.project.displayName.startsWith(item.projectName));
                    if (!fixture) throw new Error('missing_test_pilot_source');
                    for (const edit of fixture.projectEdits) {
                        const item = source.package.entryPoints[edit.index];
                        if (edit.worldIndex !== undefined) { item.worldIds = [source.dependencies.worlds[edit.worldIndex].worldId]; item.primaryWorldId = item.worldIds[0]; }
                        if (edit.bindingIndices) item.knowledgeBindingIds = edit.bindingIndices.map(index => source.dependencies.knowledgeBindings[index]);
                    }
                }
                else { source.project.displayName += ' revised'; source.project.updatedAt++; }
                return body.messages.some(message => message.name === 'atri_agent_project_save' || message.content?.startsWith('Previous tool observation (atri_agent_project_save): '))
                    ? [['atri_agent_prepare_review', {}]] : [['atri_agent_project_save', { source, stepId: pilot ? 'repair' : 'edit' }]];
            })() : [['atri_agent_get_project', {}], pilot ? ['atri_agent_reset_operations', {}]
                : ['atri_agent_set_plan', { summary: 'Revise bounded metadata', steps: [{ id: 'edit', title: 'Revise metadata', impact: 'low' }] }]];
            return { choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: '', tool_calls: calls.map(([name, args], ordinal) => ({
                id: 'eval-' + index + '-' + ordinal, type: 'function', function: { name, arguments: JSON.stringify(args) } })) } }],
            usage: { total_tokens: 20, prompt_tokens: 12, completion_tokens: 8 } };
        } });
        const handle = f.h.handle;
        try {
            const targets = new EvolutionTargets({ host: f.host }), scope = { domain: 'project', projectId: f.projectId };
            const choice = (await targets.catalog(handle, scope, f.projectId)).find(item => item.target.fieldPath === (routeSelection ? 'routeRef' : 'limits.maxSteps'));
            await targets.declare(handle, scope, f.projectId, choice.target, choice.baseHash);
            const capture = await targets.capture(handle, scope, f.projectId, choice.target), candidate = await targets.prepare(handle, scope, f.projectId, choice.target, capture, routeSelection ? routeAlternative : capture.body - 1);
            const settings = { baseline: await targets.evaluationSettings(handle, scope, f.projectId, choice.target),
                candidate: await targets.evaluationSettings(handle, scope, f.projectId, choice.target, candidate.candidateId) };
            const repository = new AgentEvolutionRepository({ engine: f.h.engine }), evaluator = new EvolutionEvaluator({ host: f.host, repository });
            await repository.limits(handle, { maxRequests: 10, maxTokens: 500000, minIntervalMs: 1000 }, 0);
            const config = await evaluator.configuration(handle, settings.baseline.runtimeRouteId), before = hash((await f.studio.getProject(handle, f.projectId)).source);
            const configs = { baseline: config, candidate: routeSelection ? await evaluator.configuration(handle, settings.candidate.runtimeRouteId) : config };
            const job = { id: 'native-project-eval', scopeId: 'native-project-evaluation', domain: 'project', policyFingerprint: 'test-policy', targetPin: 'test-target', price: null };
            const signal = new AbortController().signal, fresh = async () => {};
            const report = pilot ? await evaluator.probe(handle, job, config, settings.baseline, signal, fresh, async () => {}, async () => {},
                { profileId: 'project.m1.related', caseSetRevision: PILOT_CASE_SET_REVISION, split: 'development', repetitions: 1, mode: 'source_probe' }) : await evaluator.compare(handle, job,
                configs, settings, new AbortController().signal, async () => {}, async () => {}, async () => {},
                { split: 'development', repetitions: 1, caseIds: ['project_authoring_d1'] });
            expect(report.pairs).toHaveLength(pilot ? 3 : 1);
            for (const pair of report.pairs) for (const arm of pilot ? ['baseline'] : ['baseline', 'candidate']) {
                expect(pair[arm].error).toBeNull();
                expect(pair[arm].checks).toMatchObject({ review_gate: true, ownership: true, isolation: true, target_consumed: true,
                    ...(pilot ? { related_proposal: true, preservation: true, validation_error: true, repair_bound: true, human_revision: true, no_silent_rebase: true } : { single_changeset: true }) });
                expect(pair[arm].refs.taskIds).toEqual([f.task.taskId]); expect(pair[arm].charges).toHaveLength(3);
                expect(pilot ? pair[arm].evidence.find(item => item.name === 'native_project_pilot').observed.currentTask : { status: 'review' })
                    .toMatchObject(pilot ? { taskId: f.task.taskId, status: 'review', commits: 0 } : { status: 'review' });
            }
            expect((await repository.owner(handle)).attempts).toHaveLength(pilot ? 9 : 7);
            expect(hash((await f.studio.getProject(handle, f.projectId)).source)).toBe(before);
            expect((await f.agent.getTask(handle, f.projectId, f.task.taskId)).status).toBe('planning');
            expect(f.effects).toEqual([]); expect((await f.plans.getBinding(handle, f.sourceSelector)).planRef).toEqual(f.planRef);
        } finally { await f.cleanup(); }
    }, 120000);
});
