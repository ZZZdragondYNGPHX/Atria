import { AgentRuntime, AgentRegistry, ParallelExecutor, createRuntimeBranchPort } from '../../../lib/agent-runtime/index.js';
import { createDelegatedMemoryPort, createHostTokenCounter } from '../../../lib/agent-runtime/host-ports.js';
import { validateGraph, createPolicyController, initialPolicyState, planIdentity } from '../../../lib/orchestration-engine/index.js';
import { openRuntimeCheckpointStore } from '../runtime-checkpoints.js';
import { createEngineObserver } from './observer.js';
import { throwIfAborted } from '../abort-utils.js';

/** Host supplies child Runtime factories. Engine owns no provider, pool, storage or long-term memory. */
export async function runEnginePlan({ plan: input, runId, createChildRuntime, branchPort, context = {}, store, signal,
    resume = false, panelRunId, onEvent, assertFresh = () => {}, policyController, initialState }) {
    const { plan, diagnostics } = validateGraph(input);
    throwIfAborted(signal);
    const ownedStore = store ? null : await openRuntimeCheckpointStore(runId);
    store ||= ownedStore;
    const parentId = `engine:${plan.planId}`;
    const registry = new AgentRegistry([{ id: parentId, handoffs: plan.agents.map(agent => agent.id),
        policies: { maxConcurrency: plan.budgets.maxConcurrency } }, ...plan.agents]);
    let runtime;
    const controller = policyController || createPolicyController(plan);
    const children = branchPort || createRuntimeBranchPort(createChildRuntime);
    const guardedChildren = Object.fromEntries(['execute', 'resume'].map(method => [method, async request => {
        assertFresh();
        const result = await children[method]({ ...request, assertCurrent: () => { request.assertCurrent?.(); assertFresh(); } });
        assertFresh();
        return result;
    }]));
    const sink = createEngineObserver({ plan, panelRunId, onEvent, getState: id => runtime.getState(id) });
    runtime = new AgentRuntime({ registry, store, eventSink: sink, countTokens: createHostTokenCounter(context),
        ports: { policy: { advance(request) { assertFresh(); return controller.advance(request); } }, memory: createDelegatedMemoryPort(assertFresh),
            model: { request() { throw new Error('Engine coordinator has no model port'); } },
            tool: { execute() { throw new Error('Engine coordinator has no tool port'); } },
            parallel: new ParallelExecutor(guardedChildren) } });
    const cancel = () => { if (runtime.getState(runId)) runtime.cancelRun(runId); };
    ownedStore?.bindCancel(cancel);
    signal?.addEventListener('abort', cancel, { once: true });
    try {
        throwIfAborted(signal);
        assertFresh();
        const saved = runtime.getState(runId);
        if (saved && saved.policyState?.planFingerprint !== planIdentity(plan)) throw new Error('Plan fingerprint mismatch; cannot resume');
        const state = await (resume ? runtime.resumeRun(runId) : runtime.startRun({ runId, agentId: parentId,
            controlMode: 'policy', policyState: initialState || initialPolicyState(plan), maxSteps: plan.budgets.maxSteps }));
        throwIfAborted(signal);
        assertFresh();
        return { state, plan, diagnostics };
    } finally {
        signal?.removeEventListener('abort', cancel);
        ownedStore?.close();
    }
}
