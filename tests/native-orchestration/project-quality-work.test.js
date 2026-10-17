import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectModelFixture } from './helpers/project-model-fixture.js';
import { configureProjectToolPlan } from './helpers/project-tool-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { readAttempt, readAttemptInvalidation, runGuard } from '../../src/native/orchestration/controller-common.js';
import { readProjectQualityReview } from '../../src/native/orchestration/project-quality-contracts.js';
import { readProjectReviewOutput } from '../../src/native/orchestration/project-review-output-contracts.js';
import { readGraphNodeResult } from '../../src/native/orchestration/graph-result-contracts.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const textResponse = (text, index, usage = true) => ({ id: 'quality-response-' + index, status: 'completed', output: [{ id: 'quality-item-' + index,
    type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] }],
...(usage ? { usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } } : {}) });

async function fixture(make, { rerun = false, invalid = false, requestLimit = 8, unknown = false, draftTool = false, alwaysRerun = false } = {}) {
    let proposed, businessRound = 0, reviewRound = 0;
    return projectModelFixture(make, { maxModelRounds: 3, changeRoute: route => ({ ...route, executionPolicy: { ...route.executionPolicy,
        computeBudget: { ...route.executionPolicy.computeBudget, maxRequests: requestLimit, localWork: { ...route.executionPolicy.computeBudget.localWork, maxJobs: 128 } } } }),
    configurePlan: async args => {
        const { plan, seeded, h, host, original } = args;
        proposed = structuredClone(original); proposed.project.displayName = 'Approved advisory Project proposal';
        await configureProjectToolPlan(['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review'])(args);
        await seeded.persistence.saveModelProfile(h.handle, { ...seeded.model, limits: { ...seeded.model.limits, contextTokens: 65536 } });
        const graph = plan.definition, worker = graph.nodes[0], output = graph.nodes[1];
        worker.inputs = [{ name: 'advisory', type: 'text', required: false }, { name: 'quality', type: 'json', required: false },
            { name: 'continuation', type: 'json', required: false }];
        const draft = { ...structuredClone(worker), nodeId: createNativeId('orchestrationNode'), label: 'Propose a source-bound Project change', inputs: [],
            outputs: [{ name: 'draft', type: 'text', required: false }], dependencyPinIds: ['studio.route'], capabilities: ['generation.send'] };
        const review = { ...structuredClone(draft), nodeId: createNativeId('orchestrationNode'), kind: 'review', label: 'Check proposal against original Task and source',
            inputs: [{ name: 'draft', type: 'text', required: true }], outputs: [{ name: 'review', type: 'json', required: false }],
            policy: { agentPinId: 'studio.route', maxRounds: 2 } };
        const edge = (from, fromPort, to, toPort, maxVisits = 1, loopBack = false) => ({ edgeId: createNativeId('orchestrationEdge'),
            from: { nodeId: from.nodeId, port: fromPort }, to: { nodeId: to.nodeId, port: toPort }, condition: 'always', maxVisits, loopBack });
        graph.nodes = [draft, review, worker, output]; graph.entryNodeIds = [draft.nodeId];
        graph.edges = [edge(draft, 'draft', review, 'draft', 2), edge(draft, 'draft', worker, 'advisory'), edge(review, 'review', worker, 'quality'),
            edge(worker, 'response', output, 'response'), edge(worker, 'response', worker, 'continuation', 2, true)];
        Object.assign(graph.limits, { maxSteps: 120, maxAttempts: 12, maxReviews: 2, maxLoopIterations: 2, maxEdgeVisits: 8 });
        Object.assign(graph.outputContract, { kind: 'project_review', resultPolicy: { outputType: 'json', maxBytes: 16384 } });
        // Keep the formal Project source unchanged; only the original tools may propose.
        if ((await host.studio.observeProject(h.handle, original.project.projectId)).source.project.displayName !== original.project.displayName) throw new Error('Fixture source changed');
    }, responseBody: ({ body, index }) => {
        const serialized = JSON.stringify(body);
        if (serialized.includes('native_project_quality_review')) {
            reviewRound++;
            return textResponse(JSON.stringify(invalid ? { decision: 'approve', reasonCode: 'incomplete_proposal' }
                : rerun && (reviewRound === 1 || alwaysRerun) ? { decision: 'rerun', reasonCode: 'incomplete_proposal' } : { decision: 'approve', reasonCode: 'quality_ready' }), index);
        }
        if (serialized.includes('native_project_advisory_draft') && draftTool) return { id: 'ungranted-worker-tool', status: 'completed', output: [{ id: 'worker-tool',
            type: 'function_call', status: 'completed', call_id: 'worker-tool-call', name: 'atri_agent_set_plan', arguments: JSON.stringify({ summary: 'Forbidden', steps: [] }) }],
        usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } };
        if (serialized.includes('native_project_advisory_draft')) return textResponse('Source-bound advisory proposal version ' + index, index, !unknown);
        const round = businessRound++;
        return { id: 'business-response-' + index, status: 'completed', output: [{ id: 'business-item-' + index,
            type: 'function_call', status: 'completed', call_id: 'business-call-' + index,
            name: ['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review'][round],
            arguments: JSON.stringify(round === 0 ? { summary: 'Execute reviewed advisory', steps: [{ id: 'rename', title: 'Rename Project' }] }
                : round === 1 ? { source: proposed, stepId: 'rename' } : {}) }], usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } };
    } });
}

describe.each(harnesses)('$name Project advisory quality work', ({ make }) => {
    test.each([false, true])('real pure-model work and bounded rerun=%s feed original tools and human Review with all charges preserved', async rerun => {
        const f = await fixture(make, { rerun });
        try {
            const pureCalls = rerun ? 4 : 2;
            f.onResponse(async ({ index }) => {
                if (index >= pureCalls) return;
                const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
                expect(task.attempts).toHaveLength(1); expect(task.attempts[0].status).toBe('started');
                expect(task.attempts[0].calls).toEqual([]); expect(task.plan).toBeNull(); expect(task.changeSets).toEqual([]);
            });
            await f.run(); const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(root.status).toBe('completed'); expect(root.progress.reviews).toBe(rerun ? 2 : 1); expect(task.status).toBe('review');
            expect(f.requests).toHaveLength(pureCalls + 3); expect(task.attempts.filter(attempt => attempt.kind === 'generation')).toHaveLength(3);
            expect(task.attempts.filter(attempt => attempt.kind === 'evaluation')).toHaveLength(1); expect(task.compute.attempts).toHaveLength(pureCalls + 3);
            expect(task.compute.attempts.every(row => row.status === 'settled' && row.usage.totalTokens === 20)).toBe(true);
            expect(JSON.stringify(task.conversation)).not.toContain('Source-bound advisory proposal');
            expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const drafts = [], reviews = [], results = [];
                for (const ref of root.attemptRefs) {
                    const { doc } = await readAttempt(tx, f.h.handle, root, ref), node = root.graph.nodes.find(node => node.nodeId === doc.nodeId);
                    if (node.nodeId === root.graph.entryNodeIds[0]) {
                        results.push(await readGraphNodeResult(tx, f.h.handle, root, doc.resultRefs[0].resultId)); drafts.push(doc);
                    }
                    if (node.kind === 'review') reviews.push(await readProjectQualityReview(tx, f.h.handle, root, ref));
                }
                expect(drafts).toHaveLength(rerun ? 2 : 1); expect(reviews.at(-1).review.decision).toBe('approve');
                expect(results.every(Boolean)).toBe(true); expect(new Set(drafts.map(draft => draft.attemptId)).size).toBe(drafts.length);
                const invalidated = [];
                for (const draft of drafts) invalidated.push(Boolean(await readAttemptInvalidation(tx, f.h.handle, root, draft)));
                expect(invalidated).toEqual(rerun ? [true, false] : [false]);
                const output = await readProjectReviewOutput(tx, f.h.handle, root); expect(output.receipt.costs.closed).toBe(true);
                expect(output.receipt.costs.budgetAttemptRefs.filter(ref => ref.kind !== 'local_work')).toHaveLength(pureCalls + 3);
            });
            const finalRequest = JSON.stringify(f.requests[pureCalls]);
            expect(finalRequest).toContain('Reviewed advisory proposal'); expect(finalRequest).toContain('Source-bound advisory proposal version ' + (rerun ? 2 : 0));
            expect(finalRequest.includes('Source-bound advisory proposal version 0')).toBe(!rerun);
        } finally { await f.cleanup(); }
    }, 120000);

    test.each(['invalid', 'budget', 'unknown', 'draft-tool', 'round-limit'])('%s quality work cannot reach a Project tool or fabricate completion', async mode => {
        const f = await fixture(make, { invalid: mode === 'invalid', rerun: ['budget', 'round-limit'].includes(mode), draftTool: mode === 'draft-tool', alwaysRerun: mode === 'round-limit', requestLimit: mode === 'budget' ? 4 : 8, unknown: mode === 'unknown' });
        try {
            await expect(f.run()).rejects.toThrow(); const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.attempts.every(attempt => !attempt.calls.length)).toBe(true); expect(task.changeSets).toEqual([]); expect(task.plan).toBeNull();
            expect(f.requests).toHaveLength(['unknown', 'draft-tool'].includes(mode) ? 1 : mode === 'round-limit' ? 4 : 2);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId); expect(root.outputClaims).toEqual([]); expect(root.status).not.toBe('completed');
            expect(task.compute.attempts).toHaveLength(f.requests.length);
            expect(task.compute.attempts[0].status).toBe(mode === 'unknown' ? 'unknown' : 'settled');
            expect(root.status).toBe(['unknown', 'draft-tool'].includes(mode) ? 'reconciling' : 'blocked');
            expect(root.pendingEffectRefs.length > 0).toBe(mode === 'draft-tool');
        } finally { await f.cleanup(); }
    }, 60000);

    test.each(['source', 'cancel'])('%s withdrawal during pure work prevents every original tool and final output', async change => {
        const f = await fixture(make);
        try {
            f.onResponse(async ({ index }) => {
                if (change === 'source' && index === 0) await f.writeProject();
                if (change === 'cancel' && index === 1) {
                    const runs = f.authority.execution.runs, root = await runs.get(f.h.handle, f.effects[0].runId);
                    await runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(root), reasonCode: 'project_quality_withdrawn' });
                }
            });
            await expect(f.run()).rejects.toThrow();
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.attempts.every(attempt => !attempt.calls.length)).toBe(true); expect(task.changeSets).toEqual([]); expect(task.plan).toBeNull();
            expect(f.requests).toHaveLength(change === 'source' ? 1 : 2);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.outputClaims).toEqual([]); expect(root.status).not.toBe('completed');
            expect(task.compute.attempts).toHaveLength(f.requests.length);
        } finally { await f.cleanup(); }
    }, 60000);

});
