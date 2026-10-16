import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectReadFixture, configureProjectToolPlan, projectReadResponse } from './helpers/project-tool-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { readProjectRoundReceipt } from '../../src/native/orchestration/project-round-contracts.js';
import { readAttempt } from '../../src/native/orchestration/controller-common.js';
import { runGuard } from '../../src/native/orchestration/controller-common.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const plan = { summary: 'Owned loop plan', steps: [{ id: 'inspect', title: 'Inspect original Project' }] };
const configureLoop = rounds => async args => {
    await configureProjectToolPlan(['atri_agent_set_plan', 'atri_agent_get_project'])(args);
    await args.seeded.persistence.saveModelProfile(args.h.handle, { ...args.seeded.model, limits: { ...args.seeded.model.limits, contextTokens: 65536 } });
    const { definition } = args.plan, node = definition.nodes[0];
    node.inputs.push({ name: 'continuation', type: 'json', required: false });
    definition.edges.push({ edgeId: createNativeId('orchestrationEdge'), from: { nodeId: node.nodeId, port: 'response' },
        to: { nodeId: node.nodeId, port: 'continuation' }, condition: 'always', maxVisits: rounds - 1, loopBack: true });
    definition.limits.maxLoopIterations = rounds - 1; definition.limits.maxEdgeVisits = Math.max(definition.limits.maxEdgeVisits, rounds);
};
const text = () => ({ id: 'last-project-response', status: 'completed', output: [{ id: 'last-project-item', type: 'message', status: 'completed', role: 'assistant',
    content: [{ type: 'output_text', text: 'Synthetic bounded Project task completed.', annotations: [] }] }], usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } });
const fixture = (make, rounds = 2, options = {}) => projectReadFixture(make, { maxModelRounds: rounds, configurePlan: configureLoop(rounds), responseBody: ({ index }) => {
    if (index === rounds - 1) return text();
    const response = projectReadResponse(); response.output[0].id += index; response.output[0].call_id += index;
    if (index === 0) { response.output[0].name = 'atri_agent_set_plan'; response.output[0].arguments = JSON.stringify(plan); }
    return response;
}, ...options });

describe.each(harnesses)('$name original Project bounded Graph loop', ({ make }) => {
    test.each([2, 3])('%s Model rounds traverse the actual loop under one frozen Root and the same original Task bank', async rounds => {
        const f = await fixture(make, rounds);
        try {
            await f.run(); const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId), runs = f.authority.execution.runs;
            const root = await runs.get(f.h.handle, f.effects[0].runId);
            expect(new Set(f.effects.map(effect => effect.runId)).size).toBe(1); expect(f.requests).toHaveLength(rounds);
            expect(root.attemptRefs).toHaveLength(rounds); expect(root.progress.loopIterations).toBe(rounds - 1);
            expect(task.compute.attempts).toHaveLength(rounds); expect(task.compute.attempts.every(row => row.status === 'settled' && row.usage.totalTokens === 20)).toBe(true);
            expect(task.plan.summary).toBe(plan.summary); expect(root.sourceBinding.sourceRef.executionFingerprint).toBe(f.task.executionFingerprint);
            expect(root.budgetAuthorityRef).toEqual(root.sourceBinding.budgetAuthorityRef); expect(task.executionFingerprint).not.toBe(f.task.executionFingerprint);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                for (const [index, attemptId] of root.attemptRefs.entries()) {
                    const { doc } = await readAttempt(tx, f.h.handle, root, attemptId);
                    const fact = await readProjectRoundReceipt(tx, f.h.handle, root, attemptId, { projectAgent: f.agent });
                    expect(doc).toMatchObject({ attemptNumber: index + 1, status: 'completed', budgetRef: root.budgetAuthorityRef });
                    expect(fact.receipt.round).toBe(index); expect(fact.receipt.toFingerprint).toBe(task.executionFingerprint);
                }
            });
            expect(JSON.stringify(f.requests[1])).toContain(plan.summary); expect(task.changeSets).toEqual([]); expect(root.status).toBe('running');
        } finally { await f.cleanup(); }
    }, 30000);

    test('a plain actual response stops after one round even when the published loop and preflight allow more', async () => {
        const f = await fixture(make, 3, { responseBody: text });
        try {
            await f.run(); const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.attemptRefs).toHaveLength(1); expect(root.progress.loopIterations).toBe(0); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('the actual round bound ends continuing tool responses without another Root or a third send', async () => {
        const f = await fixture(make, 2, { responseBody: () => projectReadResponse() });
        try {
            await f.run(); const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(f.requests).toHaveLength(2); expect(new Set(f.effects.map(effect => effect.runId)).size).toBe(1);
            expect(task.attempts.filter(attempt => attempt.kind === 'generation')).toHaveLength(2);
            expect(task.compute.attempts).toHaveLength(2);
        } finally { await f.cleanup(); }
    }, 30000);

    test('a request beyond the exact published loop bound fails during real preflight', async () => {
        const f = await fixture(make, 3, { configurePlan: configureLoop(2) });
        try {
            await expect(f.preflight()).rejects.toThrow('native_orchestration_project_plan_unavailable');
            expect(f.requests).toEqual([]); expect(f.effects).toEqual([]);
        } finally { await f.cleanup(); }
    });

    test.each(['task-edit', 'binding', 'cancel', 'previous-system'])('%s between original rounds cannot acquire another Model request', async change => {
        const f = await fixture(make), finish = f.authority.finishProjectRound.bind(f.authority), prepare = f.authority.prepareProjectRound.bind(f.authority);
        let changed = false;
        if (change === 'previous-system') f.authority.prepareProjectRound = args => prepare({ ...args, previousSystem: args.previousSystem === undefined ? undefined : 'Forged previous system' });
        else f.authority.finishProjectRound = async args => {
            const task = await finish(args);
            if (!changed) {
                changed = true;
                if (change === 'task-edit') await f.agent.setPlan(f.h.handle, f.projectId, f.task.taskId, { ...plan, summary: 'Independent plan between rounds' });
                if (change === 'binding') await f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: 0 });
                if (change === 'cancel') {
                    const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
                    await f.authority.execution.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(root), reasonCode: 'cancel_between_project_rounds' });
                }
            }
            return task;
        };
        try {
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.compute.attempts).toHaveLength(1); expect(task.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            expect(task.attempts[0].status).toBe('completed'); expect(task.attempts[0].calls).toHaveLength(1);
            expect(task.plan.summary).toBe(change === 'task-edit' ? 'Independent plan between rounds' : plan.summary);
        } finally { await f.cleanup(); }
    });

    test('unknown original Model spending retains the completed Task round but cannot settle its producer or start the next round', async () => {
        const f = await fixture(make, 2, { responseBody: () => {
            const response = projectReadResponse(); response.output[0].name = 'atri_agent_set_plan'; response.output[0].arguments = JSON.stringify(plan);
            delete response.usage; return response;
        } });
        try {
            await expect(f.run()).rejects.toThrow('native_orchestration_project_round_not_ready');
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId), root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(task.attempts[0].status).toBe('completed'); expect(task.attempts).toHaveLength(1); expect(task.compute.attempts[0].status).toBe('unknown');
            expect(task.plan.summary).toBe(plan.summary); expect(root.attemptRefs).toHaveLength(1); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('rehashing a fabricated traversal cannot replace the actual Graph admission or native command', async () => {
        const f = await fixture(make);
        try {
            await f.run(); const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const rows = await tx.listResources({ kind: 'atri_orchestration_record', handle: f.h.handle, runId: root.runId, recordType: 'receipt' });
                const row = rows.find(record => record.doc.receiptKind === 'graph_transition'), doc = structuredClone(row.doc);
                doc.producerReceiptRefs = [];
                try {
                    await tx.putResource(row.key, { ...row, doc, integrity: hash(doc) });
                    await expect(readProjectRoundReceipt(tx, f.h.handle, root, root.attemptRefs[1], { projectAgent: f.agent })).rejects.toThrow();
                } finally { await tx.putResource(row.key, row); }
            });
            expect(f.requests).toHaveLength(2);
        } finally { await f.cleanup(); }
    }, 30000);
});
