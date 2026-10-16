import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectModelFixture } from './helpers/project-model-fixture.js';
import { configureProjectToolPlan } from './helpers/project-tool-fixture.js';
import { projectProbeSummary } from './helpers/native-live-summary.js';
import { EvolutionTargets } from '../../src/native/agent-intelligence/evolution-targets.js';
import { EvolutionEvaluator } from '../../src/native/agent-intelligence/evolution-evaluator.js';
import { AgentEvolutionRepository } from '../../src/native/agent-intelligence/evolution-repository.js';
import { PILOT_CASE_SET_REVISION } from '../../src/native/agent-intelligence/evaluation/cases.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
describe.each(harnesses)('$name failed original Native Project evaluation', ({ make }) => {
    test('worker failure preserves the safe real Root projection and original charge through onTrial without an eligible report', async () => {
        const f = await projectModelFixture(make, { format: 'openai-compatible', configurePlan: async args => {
            await configureProjectToolPlan(['atri_agent_set_plan', 'atri_agent_prepare_review'])(args);
            Object.assign(args.plan.definition.outputContract, { kind: 'project_review', resultPolicy: { outputType: 'json', maxBytes: 16384 } });
            args.plan.definition.limits.maxSteps = 100;
            await args.seeded.persistence.saveModelProfile(args.h.handle, { ...args.seeded.model, limits: { ...args.seeded.model.limits, contextTokens: 65536 } });
        }, responseBody: () => ({ choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', content: '', tool_calls: [0, 1].map(index => ({
            id: 'invalid-batch-' + index, type: 'function', function: { name: 'atri_agent_set_plan', arguments: JSON.stringify({
                summary: 'Rejected duplicate proposals', steps: [{ id: 'repair', title: 'Repair metadata' }] }) } })) } }],
        usage: { total_tokens: 20, prompt_tokens: 12, completion_tokens: 8 } }) });
        try {
            const handle = f.h.handle, targets = new EvolutionTargets({ host: f.host }), scope = { domain: 'project', projectId: f.projectId };
            const target = (await targets.catalog(handle, scope, f.projectId)).find(choice => choice.target.fieldPath === 'limits.maxSteps').target;
            const settings = await targets.evaluationSettings(handle, scope, f.projectId, target);
            const repository = new AgentEvolutionRepository({ engine: f.h.engine }), evaluator = new EvolutionEvaluator({ host: f.host, repository });
            await repository.limits(handle, { maxRequests: 2, maxTokens: 100000, minIntervalMs: 1000 }, 0);
            const config = await evaluator.configuration(handle, settings.runtimeRouteId), trials = [], pairs = [];
            const before = hash((await f.studio.getProject(handle, f.projectId)).source);
            await expect(evaluator.probe(handle, { id: 'native-failure-evidence', scopeId: 'native-failure-scope', domain: 'project',
                policyFingerprint: 'test-policy', targetPin: hash(settings), price: null }, config, settings, new AbortController().signal,
            async () => {}, async pair => { pairs.push(pair); }, async trial => { trials.push(trial); },
            { profileId: 'project.m1.related', caseSetRevision: PILOT_CASE_SET_REVISION, split: 'development', repetitions: 1, mode: 'source_probe' }))
                .rejects.toThrow('native_orchestration_project_tool_batch_unavailable');
            expect(trials).toHaveLength(1); expect(pairs).toEqual([]);
            expect(trials[0].trial).toMatchObject({ error: 'native_orchestration_project_tool_batch_unavailable',
                checks: { native_execution: false, target_consumed: false } });
            const evidence = trials[0].trial.evidence.find(item => item.name === 'native_project_execution_failure');
            expect(evidence.observed).toMatchObject({ status: 'available', projection: { status: 'blocked', costs: { modelAttempts: 1, knownTotalTokens: 20 },
                capacity: { scope: 'original_bank', used: { requests: 1, tokens: 20 } }, controls: { resume: false } } });
            expect(projectProbeSummary(trials[0].trial)).toMatchObject({ available: true, failed: true, runStatus: 'blocked',
                capacity: { used: { requests: 1, tokens: 20 } } });
            for (const key of ['inputRef', 'dispatchToken', 'modelResult', 'conversation', 'requestSnapshot']) expect(JSON.stringify(evidence)).not.toContain('"' + key + '"');
            const owner = await repository.owner(handle);
            expect(owner.attempts).toHaveLength(1); expect(owner.attempts[0]).toMatchObject({ status: 'reported', tokens: 20 });
            expect(hash((await f.studio.getProject(handle, f.projectId)).source)).toBe(before);
            expect((await f.agent.observeTask(handle, f.projectId, f.task.taskId)).status).toBe('planning'); expect(f.effects).toEqual([]);
        } finally { await f.cleanup(); }
    }, 60000);
});
