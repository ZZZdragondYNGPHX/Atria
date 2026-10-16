import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectModelFixture } from './helpers/project-model-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';
import { assertProjectToolReceipt } from '../../src/native/orchestration/project-tool-contracts.js';
import { runGuard } from '../../src/native/orchestration/controller-common.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const responseBody = () => ({ id: 'project-tool-response', status: 'completed',
    output: [{ id: 'project-tool-item', type: 'function_call', status: 'completed', call_id: 'project-tool-call', name: 'atri_agent_get_project', arguments: '{}' }],
    usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } });
const configurePlan = async ({ plan, host, task, h }) => {
    const descriptor = (await host.agent.observeModelContext(h.handle, task.projectId, task.taskId)).tools.find(item => item.function.name === 'atri_agent_get_project');
    const node = plan.definition.nodes[0]; node.capabilities.push('project.read'); node.dependencyPinIds.push('project.read');
    plan.definition.capabilityCeiling.push('project.read');
    plan.dependencyPins.push({ pinId: 'project.read', port: 'tool', resourceRef: { kind: 'project_agent_tool', projectId: task.projectId,
        taskId: task.taskId, name: 'atri_agent_get_project' }, integrity: hash(descriptor) });
};

describe.each(harnesses)('$name original Project tool Effect', ({ make }) => {
    test('a pinned read executes once through its own Effect, original bank and durable original Task receipt', async () => {
        const f = await projectModelFixture(make, { configurePlan, responseBody });
        try {
            await f.run();
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId), call = task.attempts.find(item => item.kind === 'generation').calls[0];
            expect(call).toMatchObject({ name: 'atri_agent_get_project', argsHash: hash({}) });
            expect(assertProjectToolReceipt(call.nativeReceipt)).toMatchObject({ runId: f.effects[0].runId, effectId: f.effects[1].effectId,
                fromFingerprint: f.task.executionFingerprint, toFingerprint: f.task.executionFingerprint });
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const tool = (await readEffect(tx, f.h.handle, root, f.effects[1].effectId)).doc;
                expect(tool).toMatchObject({ capability: 'project.read', status: 'confirmed', budgetAttemptRef: { kind: 'local_work' } });
            });
            expect(task.compute.localWork.filter(item => item.kind === 'project_tool')).toEqual([expect.objectContaining({ status: 'settled', usage: expect.objectContaining({ outcome: 'completed' }) })]);
            expect(task.compute.attempts).toHaveLength(1); expect(f.requests).toHaveLength(1); expect(task.changeSets).toEqual([]);
            expect(task.conversation.some(item => item.role === 'tool')).toBe(true);
            expect((await f.studio.observeRevision(f.h.handle, f.projectId)).revision).toBe(f.task.baseRevision);
            expect(root.status).toBe('running');
            await expect(f.agent.executeTool(f.h.handle, f.projectId, f.task.taskId, { name: 'atri_agent_get_project', args: {},
                attemptId: call.nativeReceipt.projectAttemptId, callId: 'forged-permit', nativeEffectPermit: structuredClone(call.nativeReceipt) }))
                .rejects.toThrow('native_orchestration_project_producer_denied');
        } finally { await f.cleanup(); }
    });

    test('a Binding change at tool dispatch refuses the original Task call and retains the Model bill', async () => {
        const f = await projectModelFixture(make, { configurePlan, responseBody });
        const execute = f.authority.executeProjectTool.bind(f.authority);
        f.authority.executeProjectTool = async args => {
            await f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: 0 });
            return execute(args);
        };
        try {
            await expect(f.run()).rejects.toThrow('native_orchestration_project_selection_stale');
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.attempts.find(item => item.kind === 'generation').calls).toEqual([]);
            expect(task.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } }); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test.each(['copied-token', 'different-name', 'changed-args', 'different-call', 'expired-token', 'ambient-transaction'])('%s cannot borrow a Model tool response', async change => {
        const f = await projectModelFixture(make, { configurePlan, responseBody });
        const execute = f.authority.executeProjectTool.bind(f.authority); let original;
        f.authority.executeProjectTool = args => {
            original = args;
            if (change === 'copied-token') return execute({ ...args, roundToken: { ...args.roundToken } });
            if (change === 'different-name') return execute({ ...args, input: { ...args.input, name: 'atri_agent_set_plan' } });
            if (change === 'changed-args') return execute({ ...args, input: { ...args.input, args: { extra: true } } });
            if (change === 'different-call') return execute({ ...args, input: { ...args.input, callId: 'foreign' } });
            if (change === 'ambient-transaction') return f.h.engine.withTransaction(f.h.handle, () => execute(args));
            return execute(args);
        };
        try {
            const outcome = await f.run().then(value => ({ value }), error => ({ error }));
            expect(Boolean(outcome.error)).toBe(change !== 'expired-token');
            await expect(execute(original)).rejects.toThrow('native_orchestration_project_tool_scope_unavailable');
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.attempts.find(item => item.kind === 'generation').calls).toHaveLength(change === 'expired-token' ? 1 : 0);
            expect(task.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } }); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test.each([false, true])('an unknown tool Effect ACK saved=%s never repeats the original Task tool', async saved => {
        const f = await projectModelFixture(make, { configurePlan, responseBody });
        const observe = f.authority.execution.effects.observe.bind(f.authority.execution.effects);
        let toolObservations = 0;
        f.authority.execution.effects.observe = async (handle, input) => {
            if (input.observation.reasonCode !== 'project_read_completed') return observe(handle, input);
            toolObservations++;
            if (saved) await observe(handle, input);
            throw Object.assign(new Error('Synthetic lost tool Effect ACK'), { code: 'storage_commit_unknown' });
        };
        try {
            const outcome = await f.run().then(value => ({ value }), error => ({ error }));
            expect(Boolean(outcome.error)).toBe(!saved); expect(toolObservations).toBe(1);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.attempts.find(item => item.kind === 'generation').calls).toHaveLength(1);
            expect(task.compute.localWork.filter(item => item.kind === 'project_tool')).toHaveLength(1); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test.each(['settings', 'binding', 'cancel'])('a final consumption %s change withholds the read body and retains original facts', async change => {
        const f = await projectModelFixture(make, { configurePlan, responseBody }), runs = f.authority.execution.runs;
        const consume = runs.withConsumption.bind(runs); let changed = false;
        runs.withConsumption = (handle, runId, callback, options) => consume(handle, runId, async args => {
            const last = f.effects.at(-1);
            const intent = last ? (await readEffect(args.tx, handle, args.root, last.effectId)).doc : null;
            if (!changed && intent?.actionRef.kind === 'native_project_read' && intent.status === 'confirmed') {
                changed = true;
                if (change === 'settings') f.host.extensions.settings = async () => ({ value: { changed: true } });
                if (change === 'binding') await f.plans.saveBinding(handle, createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: 0 });
                if (change === 'cancel') await runs.cancel(handle, createNativeId('orchestrationCommand'), { ...runGuard(await runs.get(handle, runId)), reasonCode: 'cancel_project_read_body' });
            }
            return callback(args);
        }, options);
        try {
            await expect(f.run()).rejects.toThrow(); expect(changed).toBe(true);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.attempts.find(item => item.kind === 'generation').calls).toHaveLength(1);
            expect(task.compute.localWork.find(item => item.kind === 'project_tool')).toMatchObject({ status: 'settled', usage: { outcome: 'completed' } });
            expect(task.conversation.some(item => item.role === 'tool')).toBe(false); expect(f.requests).toHaveLength(1);
            const root = await runs.get(f.h.handle, f.effects[0].runId), binding = await f.plans.getBinding(f.h.handle, f.sourceSelector);
            expect(change === 'binding' ? binding.version : change === 'cancel' ? root.cancelRequested : (await f.host.extensions.settings()).value.changed)
                .toBe(change === 'binding' ? 1 : true);
        } finally { await f.cleanup(); }
    });

    test.each([false, true])('the original Task receipt ACK saved=%s is observed without another writer call', async saved => {
        const f = await projectModelFixture(make, { configurePlan, responseBody }), save = f.repository.save.bind(f.repository);
        let intercepted = false, writerCalls = 0;
        f.repository.save = async (handle, next, ...args) => {
            if (!intercepted && next.attempts.some(item => item.calls.some(call => call.nativeReceipt))) {
                intercepted = true; writerCalls++;
                if (saved) await save(handle, next, ...args);
                throw Object.assign(new Error('Synthetic lost Task receipt ACK'), { code: 'storage_commit_unknown' });
            }
            return save(handle, next, ...args);
        };
        try {
            const outcome = await f.run().then(value => ({ value }), error => ({ error }));
            expect(Boolean(outcome.error)).toBe(!saved); expect(intercepted).toBe(true); expect(writerCalls).toBe(1);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.attempts.find(item => item.kind === 'generation').calls).toHaveLength(saved ? 1 : 0);
            expect(task.compute.localWork.find(item => item.kind === 'project_tool')).toMatchObject({ status: 'settled', usage: { outcome: saved ? 'completed' : 'failed' } });
            expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('two distinct original calls receive distinct Effects and costs without mutating the frozen Source or budget authority', async () => {
        const f = await projectModelFixture(make, { configurePlan, responseBody: () => {
            const response = responseBody(); response.output.push({ ...response.output[0], id: 'second-project-tool-item', call_id: 'second-project-tool-call' }); return response;
        } });
        try {
            await f.run();
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId), calls = task.attempts.find(item => item.kind === 'generation').calls;
            expect(calls).toHaveLength(2); expect(new Set(calls.map(call => call.nativeReceipt.effectId)).size).toBe(2);
            expect(task.compute.localWork.filter(item => item.kind === 'project_tool')).toHaveLength(2);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(calls.map(call => call.nativeReceipt.sourceBindingDigest)).toEqual([root.sourceBinding.bindingDigest, root.sourceBinding.bindingDigest]);
            expect(root.sourceBinding.sourceRef.executionFingerprint).toBe(f.task.executionFingerprint);
            expect(root.budgetAuthorityRef).toEqual(root.sourceBinding.budgetAuthorityRef); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('an unrelated original call with the same execution fingerprint cannot become owned continuation', async () => {
        const f = await projectModelFixture(make, { configurePlan, responseBody }), execute = f.authority.executeProjectTool.bind(f.authority);
        f.authority.executeProjectTool = async args => {
            await f.agent.executeTool(f.h.handle, f.projectId, f.task.taskId, { ...args.input, callId: 'independent-original-read' });
            return execute(args);
        };
        try {
            await expect(f.run()).rejects.toThrow('native_orchestration_source_stale');
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId), calls = task.attempts.find(item => item.kind === 'generation').calls;
            expect(task.executionFingerprint).toBe(f.task.executionFingerprint);
            expect(calls).toEqual([{ callId: 'independent-original-read', name: 'atri_agent_get_project', argsHash: hash({}) }]);
            expect(f.effects).toHaveLength(1); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('a Project revision change after the original tool bill settles keeps the read receipt but withholds its body', async () => {
        const f = await projectModelFixture(make, { configurePlan, responseBody });
        const settle = f.agent.settleLocalWork.bind(f.agent); let changed = false;
        f.agent.settleLocalWork = async (...args) => {
            const result = await settle(...args);
            if (!changed && f.effects.length === 2) { changed = true; await f.writeProject(); }
            return result;
        };
        try {
            await expect(f.run()).rejects.toThrow(); expect(changed).toBe(true);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.attempts.find(item => item.kind === 'generation').calls).toHaveLength(1);
            expect(task.compute.localWork.find(item => item.kind === 'project_tool')).toMatchObject({ status: 'settled', usage: { outcome: 'completed' } });
            expect(task.conversation.some(item => item.role === 'tool')).toBe(false);
            expect((await f.studio.observeRevision(f.h.handle, f.projectId)).revision).not.toBe(f.task.baseRevision);
            expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });
});
