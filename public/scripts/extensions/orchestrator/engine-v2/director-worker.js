import { AgentRuntime, AgentRegistry, ParallelExecutor } from '../../../lib/agent-runtime/index.js';
import { copy } from '../../../lib/agent-runtime/contracts.js';
import { createDelegatedMemoryPort, createHostTokenCounter, guardRequestCallbacks } from '../../../lib/agent-runtime/host-ports.js';
import { withRuntimeContext } from '../../../lib/agent-runtime/prepared-context.js';
import { openRuntimeCheckpointStore } from '../runtime-checkpoints.js';
import { createRuntimeObserver } from '../run-state/runtime-observer.js';
import { invokePort } from './director-adapter.js';
import { throwIfAborted } from '../abort-utils.js';

/** One Runtime executor shared by all dynamic dispatch groups in a Director run. */
export function createDirectorDelegateExecutor(maxConcurrency) {
    const ports = new Map();
    const executor = new ParallelExecutor({ execute: request => ports.get(request.runId)(request) }, { maxConcurrency });
    return async (request, execute) => {
        const id = `${request.effectId}/branch/worker`;
        ports.set(id, execute);
        try { return await executor.run(request); } finally { ports.delete(id); }
    };
}

/** A delegate is a child run. It never changes the parent's current agent. */
export async function runDirectorWorker({ runId, parentRunId, agentId, nodeId, task, messages, tools, maxRounds,
    requestRound, executeTool, signal, context = {}, onEvent, recovering = false, delegate = createDirectorDelegateExecutor(1), transformOutput = value => value }) {
    const sink = createRuntimeObserver({ onEvent });
    const observer = event => sink({ ...event, ...(nodeId ? { nodeId } : {}) });
    const execute = async branch => {
        const store = await openRuntimeCheckpointStore(branch.runId);
        if (recovering && !store) throw new Error('Durable Director child checkpoint required for recovery');
        const names = tools.map(tool => tool.function.name).filter(name => name !== 'finalize'
            && !['dispatch_subagent', 'dispatch_inline_subagent', 'await_subagents', 'cancel_subagent'].includes(name));
        const base = messages.slice(), transient = new Map(), guards = new Set();
        const assertFresh = () => { branch.assertCurrent?.(); for (const guard of guards) guard(); };
        const render = state => {
            messages.splice(0, messages.length, ...base, ...state.history.map(entry => {
                if (!entry.transientRef) return entry;
                if (!transient.has(entry.transientRef)) throw new Error('Worker source-guarded feedback unavailable; replan required');
                return transient.get(entry.transientRef);
            }));
        };
        let runtime;
        runtime = new AgentRuntime({ store, registry: new AgentRegistry([{ id: agentId, tools: names }]),
            contextBudget: Number.MAX_SAFE_INTEGER, countTokens: createHostTokenCounter(context), eventSink: observer,
            contextInput: ({ state }) => { render(state.policyState); return { legacyMessages: messages, tools }; },
            ports: { memory: createDelegatedMemoryPort(assertFresh),
                policy: { advance({ policyState, receipt, effectId }) {
                    assertFresh(); const state = copy(policyState);
                    if (state.pending === 'model') {
                        const result = receipt;
                        state.calls = result.roundToolCalls.map((call, i) => ({ id: String(call.raw?.id || call.id || `${effectId}/${i}`), name: call.name, args: call.args || {} }));
                        state.index = 0;
                        state.history.push({ role: 'assistant', content: result.roundAssistantText || (state.calls.length ? null : ''),
                            reasoning: result.roundReasoningText || '',
                            ...(result.roundReasoningBlocks ? { reasoning_blocks: result.roundReasoningBlocks } : {}),
                            ...(result.roundReasoningDetails ? { reasoning_details: result.roundReasoningDetails } : {}),
                            ...(state.calls.length ? { tool_calls: state.calls.map(call => ({ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } })) } : {}), _round: state.round });
                        if (!state.calls.length) {
                            render(state);
                            return { intent: { type: 'complete', output: transformOutput(result.roundAssistantText) }, policyState: state };
                        }
                    } else if (state.pending === 'tool') {
                        state.history.push({ transientRef: receipt.value.ref }); state.index++;
                    }
                    while (state.index < state.calls.length) {
                        const call = state.calls[state.index];
                        if (!names.includes(call.name)) {
                            state.history.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ ok: false, error: `Capability denied: ${call.name}` }), _round: state.round });
                            state.index++; continue;
                        }
                        state.pending = 'tool';
                        return { intent: { type: 'tool', toolName: call.name, args: call.args }, policyState: state };
                    }
                    state.round++;
                    if (state.round >= maxRounds) return { intent: { type: 'fail', error: `did not converge within ${maxRounds} rounds` }, policyState: state };
                    state.pending = 'model';
                    return { intent: { type: 'model' }, policyState: state };
                } },
                model: { request: effect => invokePort(requestRound(runtime.getState(branch.runId).policyState.round), 'model', intent =>
                    intent.send(withRuntimeContext(guardRequestCallbacks({ ...intent.request, taskMessages: effect.messages, abortSignal: effect.signal }, effect.signal), context, assertFresh))) },
                tool: { async execute(effect) {
                    assertFresh(); throwIfAborted(effect.signal);
                    if (!names.includes(effect.toolName)) throw new Error('Worker capability denied');
                    const state = runtime.getState(branch.runId).policyState;
                    const result = await invokePort(executeTool(effect.toolName, effect.args, state.round, state.index), 'tool', intent => {
                        Object.assign(intent.context, { signal: effect.signal, abortSignal: effect.signal, runId: branch.runId,
                            effectId: effect.effectId, stepId: effect.stepId, nodeId, __agentRuntimeMemoryGuard: guard => guards.add(guard) });
                        return intent.execute(intent.name, intent.args, intent.context);
                    });
                    assertFresh(); throwIfAborted(effect.signal);
                    transient.set(effect.effectId, { role: 'tool', tool_call_id: state.calls[state.index].id, content: JSON.stringify(result), _round: state.round });
                    return { ok: result?.ok !== false, value: { ref: effect.effectId } };
                } },
            } });
        const cancel = () => { if (runtime.getState(branch.runId)) runtime.cancelRun(branch.runId); };
        store?.bindCancel(cancel); branch.signal.addEventListener('abort', cancel, { once: true });
        try {
            throwIfAborted(branch.signal);
            const saved = runtime.getState(branch.runId);
            const state = await (saved ? runtime.resumeRun(branch.runId) : runtime.startRun({ runId: branch.runId, parentRunId, agentId, task,
                maxSteps: maxRounds, controlMode: 'policy', policyState: { round: -1, calls: [], index: 0, history: [], pending: null } }));
            if (state.status !== 'completed') throw new Error(state.error || state.status);
            return state.output;
        } finally { branch.signal.removeEventListener('abort', cancel); store?.close(); transient.clear(); guards.clear(); }
    };
    const joined = await delegate({ runId: parentRunId, effectId: runId, signal, concurrency: 1, failurePolicy: 'settled',
        branches: [{ id: 'worker', toAgentId: agentId, task, contextPolicy: 'task_only' }],
        onEvent: event => observer({ ...event, eventId: `${event.effectId}/${event.type}`, runId: parentRunId, generation: 0, version: 0 }) }, execute);
    const result = joined.branches[0];
    if (result.status !== 'completed') throw new Error(result.error || result.status);
    return result.value;
}
