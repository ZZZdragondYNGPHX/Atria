import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectReadFixture, configureProjectToolPlan } from './helpers/project-tool-fixture.js';
import { readProjectToolReceipt } from '../../src/native/orchestration/project-tool-receipts.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const plan = { summary: 'Synthetic original Task plan', steps: [{ id: 'inspect', title: 'Inspect original Project', impact: 'low' }] };
const call = (name, args, id = 'project-plan-call') => ({ id, type: 'function_call', status: 'completed', call_id: id, name, arguments: JSON.stringify(args) });
const response = output => ({ id: 'project-plan-response', status: 'completed', output, usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } });
const fixture = (make, options = {}) => projectReadFixture(make, { configurePlan: configureProjectToolPlan(['atri_agent_get_project', 'atri_agent_set_plan']),
    responseBody: () => response([call('atri_agent_set_plan', plan)]), ...options });

describe.each(harnesses)('$name original Project Task plan Effect', ({ make }) => {
    test('the real Task writer records its exact owned Source advance while frozen Root Source and bank refs remain unchanged', async () => {
        const f = await fixture(make);
        try {
            await f.run();
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId), root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            const receipt = task.attempts[0].calls[0].nativeReceipt;
            expect(task).toMatchObject({ status: 'planned', plan: { summary: plan.summary } }); expect(task.executionFingerprint).not.toBe(f.task.executionFingerprint);
            expect(receipt).toMatchObject({ name: 'atri_agent_set_plan', fromFingerprint: f.task.executionFingerprint, toFingerprint: task.executionFingerprint });
            expect(root.sourceBinding.sourceRef.executionFingerprint).toBe(f.task.executionFingerprint);
            expect(root.budgetAuthorityRef).toEqual(root.sourceBinding.budgetAuthorityRef);
            const fact = await f.h.engine.withTransaction(f.h.handle, tx => readProjectToolReceipt(tx, f.h.handle, root, f.effects[1].effectId,
                { projectAgent: f.agent, requireHostReceipt: true }));
            expect(fact.receipt).toEqual(receipt); expect(fact.observation.reasonCode).toBe('project_proposal_completed');
            await expect(f.authority.execution.sourcePort.revalidate(f.h.handle, root.sourceBinding)).rejects.toThrow('native_orchestration_source_stale');
            await expect(f.authority.execution.budgetPort.assertCurrent(f.h.handle, root.budgetAuthorityRef)).rejects.toThrow();
            expect(task.compute.localWork.find(item => item.kind === 'project_tool')).toMatchObject({ status: 'settled', usage: { outcome: 'completed' } });
            expect(task.conversation.some(item => item.role === 'tool')).toBe(true); expect(root.status).toBe('running'); expect(f.requests).toHaveLength(1);
            expect(task.changeSets).toEqual([]); expect((await f.studio.observeRevision(f.h.handle, f.projectId)).revision).toBe(f.task.baseRevision);
        } finally { await f.cleanup(); }
    });

    test('a read followed by one final plan call retains both original receipts and advances only its own Task Source', async () => {
        const f = await fixture(make, { responseBody: () => response([call('atri_agent_get_project', {}, 'project-read-call'), call('atri_agent_set_plan', plan)]) });
        try {
            await f.run();
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId), receipts = task.attempts[0].calls.map(item => item.nativeReceipt);
            expect(receipts).toHaveLength(2); expect(receipts[0].toFingerprint).toBe(receipts[1].fromFingerprint);
            expect(receipts[1].toFingerprint).toBe(task.executionFingerprint); expect(f.effects).toHaveLength(3);
            expect(task.compute.attempts).toHaveLength(1); expect(task.compute.localWork.filter(item => item.kind === 'project_tool')).toHaveLength(2);
        } finally { await f.cleanup(); }
    });

    test.each(['ungranted', 'changed-args', 'write-before-read', 'two-writes'])('%s cannot add a Task mutation to the bounded actual Model response', async change => {
        const options = change === 'ungranted' ? { configurePlan: configureProjectToolPlan(['atri_agent_get_project']) }
            : change === 'write-before-read' ? { responseBody: () => response([call('atri_agent_set_plan', plan), call('atri_agent_get_project', {}, 'after-write')]) }
                : change === 'two-writes' ? { responseBody: () => response([call('atri_agent_set_plan', plan), call('atri_agent_set_plan', plan, 'another-write')]) } : {};
        const f = await fixture(make, options);
        if (change === 'changed-args') {
            const execute = f.authority.executeProjectTool.bind(f.authority);
            f.authority.executeProjectTool = args => execute({ ...args, input: { ...args.input, args: { ...plan, summary: 'Altered after Model completion' } } });
        }
        try {
            await expect(f.run()).rejects.toThrow();
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.plan).toBeNull(); expect(task.attempts[0].calls).toEqual([]);
            expect(task.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } }); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('an independent original Task edit after the tool bill cannot be accepted as this operation’s Source advance', async () => {
        const f = await fixture(make), settle = f.agent.settleLocalWork.bind(f.agent); let changed = false;
        f.agent.settleLocalWork = async (...args) => {
            const result = await settle(...args);
            if (!changed && f.effects.length === 2) {
                changed = true; await f.agent.setPlan(f.h.handle, f.projectId, f.task.taskId, { ...plan, summary: 'Independent original Task edit' });
            }
            return result;
        };
        try {
            await expect(f.run()).rejects.toThrow('native_orchestration_source_stale'); expect(changed).toBe(true);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId), receipt = task.attempts[0].calls[0].nativeReceipt;
            expect(task.plan.summary).toBe('Independent original Task edit'); expect(task.executionFingerprint).not.toBe(receipt.toFingerprint);
            expect(task.conversation.some(item => item.role === 'tool')).toBe(false);
            expect(task.compute.localWork.find(item => item.kind === 'project_tool')).toMatchObject({ status: 'settled', usage: { outcome: 'completed' } });
            expect(f.requests).toHaveLength(1); expect(receipt.argsHash).toBe(hash(plan));
        } finally { await f.cleanup(); }
    });

    test.each([false, true])('the actual plan writer ACK saved=%s is resolved only by its original durable receipt', async saved => {
        const f = await fixture(make), save = f.repository.save.bind(f.repository); let writes = 0;
        f.repository.save = async (handle, next, ...args) => {
            if (writes === 0 && next.attempts.some(attempt => attempt.calls.some(item => item.name === 'atri_agent_set_plan' && item.nativeReceipt))) {
                writes++;
                if (saved) await save(handle, next, ...args);
                throw Object.assign(new Error('Synthetic lost original plan ACK'), { code: 'storage_commit_unknown' });
            }
            return save(handle, next, ...args);
        };
        try {
            const outcome = await f.run().then(value => ({ value }), error => ({ error }));
            expect(Boolean(outcome.error)).toBe(!saved); expect(writes).toBe(1);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.plan?.summary ?? null).toBe(saved ? plan.summary : null);
            expect(task.attempts[0].calls).toHaveLength(saved ? 1 : 0); expect(f.requests).toHaveLength(1);
            expect(task.compute.localWork.find(item => item.kind === 'project_tool')).toMatchObject({ status: 'settled', usage: { outcome: saved ? 'completed' : 'failed' } });
        } finally { await f.cleanup(); }
    });
});
