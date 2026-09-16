import { AgentRuntime, AgentRegistry } from '../../../lib/agent-runtime/index.js';
import { copy } from '../../../lib/agent-runtime/contracts.js';
import { createHostTokenCounter, createDelegatedMemoryPort, guardRequestCallbacks } from '../../../lib/agent-runtime/host-ports.js';
import { withRuntimeContext } from '../../../lib/agent-runtime/prepared-context.js';
import { initialPolicyState, planIdentity, createResult, assertCapability } from '../../../lib/orchestration-engine/index.js';
import { toolCapability } from '../../../lib/orchestration-engine/capabilities.js';
import { compilePreset } from './preset-compiler.js';
import { openRuntimeCheckpointStore } from '../runtime-checkpoints.js';
import { createRuntimeObserver } from '../run-state/runtime-observer.js';
import { createLegacyWorkflowRunId } from '../legacy-workflow-adapter.js';
import { throwIfAborted, createAbortError } from '../abort-utils.js';
import { appendToSection, ensureSection, setSectionStatus, setRoundStatus } from '../run-state/store.js';

/** Execute one already-admitted port operation using the existing transport/retry formatter. */
export async function invokePort(iterator, kind, execute) {
    let next = await iterator.next();
    while (!next.done) {
        if (next.value?.kind !== kind) throw new Error('Unexpected operation in Director port adapter');
        try { next = await iterator.next(await execute(next.value)); } catch (error) { next = await iterator.throw(error); }
    }
    return next.value;
}

export async function runDirectorEngine({ profile, handle, eventData, deps, toolSchemas, messages, requestRound, executeMainTool, dispatcher, limits, resolveToolSource, customToolRegistry }) {
    const context = deps.contextForNotes || {};
    const plan = compilePreset(profile, { mode: 'director', settings: deps.settings || {}, toolsByNode: { owner: toolSchemas.map(tool => tool.function.name) } });
    const owner = plan.nodes.find(node => node.nodeId === 'owner');
    const fingerprint = planIdentity(plan), runId = deps.engineRunId || `${deps.runId || createLegacyWorkflowRunId()}/engine`;
    const signal = eventData?.abortSignal, store = await openRuntimeCheckpointStore(runId);
    const guards = new Set(), transient = new Map(), base = messages.slice();
    const assertFresh = () => { for (const guard of guards) guard(); };
    const toolNames = toolSchemas.map(tool => tool.function.name);
    const render = state => {
        const history = state.history.map(entry => {
            if (!entry.transientRef) return entry;
            if (!transient.has(entry.transientRef)) throw new Error('Director source-guarded tool feedback unavailable');
            return transient.get(entry.transientRef);
        });
        messages.splice(0, messages.length, ...base, ...history);
    };
    const policyController = { advance({ policyState, receipt, effectId }) {
        if (policyState.planFingerprint !== fingerprint) throw new Error('Plan fingerprint mismatch');
        const state = copy(policyState);
        assertFresh();
        if (state.pending === 'model') {
            const { result, toolCalls, reasoningAccum } = receipt;
            state.calls = toolCalls.map((call, index) => ({ id: String(call.raw?.id || call.id || `${effectId}/call/${index}`), name: String(call.name), args: call.args || {} }));
            state.index = 0;
            state.parentHistory = state.history.slice();
            state.history.push({ role: 'assistant', content: result.assistantText || null, reasoning: reasoningAccum || String(result.reasoning || ''),
                ...(result.reasoningBlocks?.length ? { reasoning_blocks: result.reasoningBlocks } : {}),
                ...(result.reasoningDetails?.length ? { reasoning_details: result.reasoningDetails } : {}),
                tool_calls: state.calls.map(call => ({ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) },
                    source: resolveToolSource(call.name, { __customToolRegistry: customToolRegistry }) })), _round: state.round });
        } else if (state.pending === 'tool') {
            state.delegates = receipt.value.delegates;
            const call = state.calls[state.index];
            if (receipt.value.transientRef) state.history.push({ transientRef: receipt.value.transientRef });
            else state.history.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(receipt.value.result), _round: state.round });
            state.index++;
            if (call.name === 'finalize' && receipt.ok && receipt.value.result?.ok) {
                const value = handle.getText?.() || '';
                const result = createResult({ runId, nodeId: 'owner', agentId: owner.agentId, value });
                state.results.push(result); state.resultRefs.push(result.resultId);
                state.outputState = { kind: 'reply', ownerNodeId: 'owner', status: state.budgetSubmit ? 'budget_exhausted' : 'completed', value, resultId: result.resultId };
                render(state);
                return { intent: { type: 'complete', output: state.outputState }, policyState: state };
            }
        }
        state.pending = null;
        while (state.index < state.calls.length) {
            const call = state.calls[state.index];
            assertCapability(plan, owner, toolCapability(call.name, 'director'));
            if (!toolNames.includes(call.name)) {
                state.history.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ ok: false, error: `unknown tool: ${call.name}` }), _round: state.round });
                state.index++; continue;
            }
            state.pending = 'tool';
            return { intent: { type: 'tool', toolName: call.name, args: call.args }, policyState: state };
        }
        if (state.round >= 0 && deps.runId) setRoundStatus({ runId: deps.runId, roundId: `main-${state.round}`, status: 'done' });
        state.round++;
        if (state.round >= limits.maxRounds) {
            if (state.budgetSubmit) return { intent: { type: 'fail', error: 'Director budget exhausted without a valid reply' }, policyState: state };
            state.budgetSubmit = true;
            state.calls = [{ id: `${effectId}/budget-submit`, name: 'finalize', args: {} }]; state.index = 0; state.pending = 'tool';
            return { intent: { type: 'tool', toolName: 'finalize', args: {} }, policyState: state };
        }
        render(state);
        for (const notice of dispatcher.drainCompletionNotifications?.() || []) {
            const tail = notice.status === 'completed' ? `completed (${notice.summary || 'no summary'}). Call await_subagents(["${notice.handleId}"]) to retrieve the output.` : `${notice.status} — ${notice.summary || ''}`;
            state.history.push({ role: 'system', content: `[Runtime] sub-agent ${notice.handleId} (${notice.subagentId}) ${tail}` });
        }
        state.pending = 'model';
        return { intent: { type: 'model' }, policyState: state };
    } };
    let runtime;
    runtime = new AgentRuntime({ store, registry: new AgentRegistry([{ id: owner.agentId, tools: toolNames }]), countTokens: createHostTokenCounter(context),
        contextBudget: Number.MAX_SAFE_INTEGER, eventSink: createRuntimeObserver({ panelRunId: deps.runId, onEvent: deps.onRuntimeEvent }),
        contextInput: ({ state }) => { render(state.policyState); return { legacyMessages: messages, tools: toolSchemas }; },
        ports: { memory: createDelegatedMemoryPort(assertFresh), policy: policyController,
            model: { async request(effect) {
                const round = runtime.getState(runId).policyState.round;
                const result = await invokePort(requestRound(round), 'model', intent => intent.send(withRuntimeContext(guardRequestCallbacks({
                    ...intent.request, taskMessages: effect.messages, abortSignal: effect.signal,
                }, effect.signal), context, assertFresh)));
                return copy(result);
            } },
            tool: { async execute(effect) {
                const state = runtime.getState(runId);
                if (state.generation !== effect.generation || state.status !== 'waiting_tool' || state.policyState.planFingerprint !== fingerprint) throw new Error('Stale Director operation');
                assertFresh(); throwIfAborted(effect.signal);
                assertCapability(plan, owner, toolCapability(effect.toolName, 'director'));
                if (effect.toolName === 'finalize' && owner.nodeId !== plan.output.ownerNodeId) throw new Error('Reply submitter is not owner');
                const policy = state.policyState;
                if (deps.runId) {
                    const roundId = `main-${policy.round}`;
                    const id = ensureSection({ runId: deps.runId, roundId, section: { id: `tool-${policy.index}`, kind: 'tool_call', title: effect.toolName,
                        meta: { args: effect.args, source: resolveToolSource(effect.toolName, { __customToolRegistry: customToolRegistry }) } } });
                    appendToSection({ runId: deps.runId, roundId, sectionId: id, delta: JSON.stringify(effect.args) });
                }
                const parentMessages = [...base, ...policy.parentHistory.map(entry => entry.transientRef ? transient.get(entry.transientRef) : entry)];
                const result = await invokePort(executeMainTool(effect.toolName, effect.args, parentMessages), 'tool', intent => {
                    Object.assign(intent.context, { signal: effect.signal, abortSignal: effect.signal, runId, effectId: effect.effectId,
                        __agentRuntimeMemoryGuard: guard => guards.add(guard) });
                    return intent.execute(intent.name, intent.args, intent.context);
                });
                throwIfAborted(effect.signal); assertFresh();
                if (deps.runId) {
                    const roundId = `main-${policy.round}`;
                    const id = ensureSection({ runId: deps.runId, roundId, section: { id: `tool-result-${policy.index}`, kind: 'tool_result', title: effect.toolName,
                        meta: { ok: !!result?.ok, err: result?.error || null } } });
                    appendToSection({ runId: deps.runId, roundId, sectionId: id, delta: JSON.stringify(result) });
                    setSectionStatus({ runId: deps.runId, roundId, sectionId: id, status: result?.ok ? 'done' : 'failed' });
                    setSectionStatus({ runId: deps.runId, roundId, sectionId: `tool-${policy.index}`, status: result?.ok ? 'done' : 'failed' });
                }
                const capability = toolCapability(effect.toolName, 'director');
                if (capability === 'tool.call' || capability === 'memory.recall') {
                    transient.set(effect.effectId, { role: 'tool', tool_call_id: policy.calls[policy.index].id, content: JSON.stringify(result), _round: policy.round });
                    return { ok: !!result?.ok, value: { transientRef: effect.effectId, delegates: dispatcher.snapshot() } };
                }
                return { ok: !!result?.ok, value: { result, delegates: dispatcher.snapshot() } };
            } },
        } });
    const cancel = () => { if (runtime.getState(runId)) runtime.cancelRun(runId); };
    store?.bindCancel(cancel); signal?.addEventListener('abort', cancel, { once: true });
    try {
        throwIfAborted(signal);
        if (deps.engineResume) {
            const saved = runtime.getState(runId);
            if (!store || saved?.policyState?.planFingerprint !== fingerprint) throw new Error('Durable matching Director checkpoint required');
            render(saved.policyState);
            await dispatcher.restore(saved.policyState.delegates, messages);
        }
        const result = await (deps.engineResume ? runtime.resumeRun(runId) : runtime.startRun({ runId, agentId: owner.agentId, controlMode: 'policy', maxSteps: limits.maxRounds,
            policyState: { ...initialPolicyState(plan), round: -1, history: [], parentHistory: [], calls: [], index: 0, pending: null, delegates: dispatcher.snapshot() } }));
        if (result.status === 'cancelled') throw createAbortError('Orchestration aborted.');
        if (result.status !== 'completed') throw new Error(result.error || 'Director Engine failed');
        return result.output;
    } finally { dispatcher.cancelAll(); signal?.removeEventListener('abort', cancel); store?.close(); transient.clear(); guards.clear(); }
}
