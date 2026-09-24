import { configuredNativeRoute } from '../../../native/runtime-route-ref.js';
import { AgentRuntime, AgentRegistry } from '../../../lib/agent-runtime/index.js';
import { copy } from '../../../lib/agent-runtime/contracts.js';
import { createHostTokenCounter, createDelegatedMemoryPort, guardRequestCallbacks } from '../../../lib/agent-runtime/host-ports.js';
import { withRuntimeContext } from '../../../lib/agent-runtime/prepared-context.js';
import { compilePreset } from './preset-compiler.js';
import { initialPolicyState, planIdentity, createResult } from '../../../lib/orchestration-engine/index.js';
import { assertOutputAuthorized } from './output-adapter.js';
import { toolCapability, effectiveCapabilities } from '../../../lib/orchestration-engine/capabilities.js';
import { openRuntimeCheckpointStore } from '../runtime-checkpoints.js';
import { createEngineObserver } from './observer.js';
import { throwIfAborted, createAbortError } from '../abort-utils.js';
import { appendToSection, setSectionStatus, setRoundStatus, addTokenUsage } from '../run-state/store.js';
import { ensureEngineRound, ensureEngineSection } from './panel-adapter.js';
import { i18n, i18nFormat } from '../i18n.js';

/** Single-agent iterative policy. Only execution scratch is persisted; tool bodies stay source guarded. */
export async function runLoopEngine({ context, payload, profile, deps, toolContext, tools, messages, refreshRuntimeStateMessage,
    sendLlm, executeTool, runId: panelRunId, deadline, record, resolveToolSource, isStructuredToolError,
    makeOkToolMessage, makeErrorToolMessage, normalizeToolOk }) {
    const plan = compilePreset(profile, { mode: 'loop', settings: deps.settings || {}, toolsByNode: { owner: tools.map(tool => tool.function.name) } });
    const owner = plan.nodes.find(node => node.nodeId === plan.output.ownerNodeId);
    const permissions = effectiveCapabilities(plan, owner);
    const allowedTools = plan.agents.find(agent => agent.id === owner.agentId).tools;
    tools.splice(0, tools.length, ...tools.filter(tool => permissions[toolCapability(tool.function.name, 'loop')]
        && (allowedTools.includes('*') || allowedTools.includes(tool.function.name))));
    const fingerprint = planIdentity(plan), runId = deps.engineRunId || `${panelRunId}/engine`;
    const signal = payload?.signal;
    const ownedStore = deps.engineStore ? null : await openRuntimeCheckpointStore(runId);
    const store = deps.engineStore || ownedStore;
    const toolResults = new Map(), guards = new Set();
    const assertFresh = () => { for (const guard of guards) guard(); };
    const baseMessages = messages.filter(message => !String(message.content).startsWith('<runtime_state>'));
    const toolNames = tools.map(tool => tool.function.name.replace(/\./g, '_'));
    const sourceName = name => String(name || '').replace(/\./g, '_');
    const section = (round, id, kind, title, meta = {}) => ensureEngineSection(panelRunId, `agent-${round}`, { id, kind, title, meta });
    const settle = (round, id, status = 'done') => { section(round, id, id === 'text' ? 'text' : 'tool_result', id); setSectionStatus({ runId: panelRunId, roundId: `agent-${round}`, sectionId: id, status }); };
    const append = (round, id, delta) => { section(round, id, id === 'text' ? 'text' : 'tool_result', id); appendToSection({ runId: panelRunId, roundId: `agent-${round}`, sectionId: id, delta }); };
    const rebuild = async state => {
        const history = state.history.map(entry => {
            if (!entry.toolResultRef) return entry;
            if (!toolResults.has(entry.toolResultRef)) throw new Error('Transient Loop tool result unavailable; source revalidation required');
            return toolResults.get(entry.toolResultRef);
        });
        messages.splice(0, messages.length, ...baseMessages, ...history);
        await refreshRuntimeStateMessage();
        assertFresh();
    };
    const finish = (state, reason = '') => {
        const status = state.capsule === null ? 'budget_exhausted' : 'completed';
        if (reason) record('budget_exhausted', { round: state.round, reason, limit: reason === 'no_tool_call_streak' ? 3 : profile.max_rounds, streak: state.noToolCallStreak });
        const value = state.capsule ?? state.lastNaturalText;
        const result = createResult({ runId, nodeId: 'owner', agentId: owner.agentId, status: status === 'completed' ? 'completed' : 'partial', value });
        state.results = [result]; state.resultRefs = [result.resultId];
        state.outputState = { kind: 'guidance', ownerNodeId: 'owner', status, value, resultId: result.resultId, reason };
        return { intent: { type: 'complete', output: { ...state.outputState, capsule: value, total_rounds: state.round } }, policyState: state };
    };
    const recordToolResult = (state, call, message, error = null, reference = null) => {
        state.history.push(reference ? { toolResultRef: reference } : message);
        const source = resolveToolSource(sourceName(call.name), toolContext);
        record(error ? 'tool_error' : 'tool_result', { round: state.round, name: call.name, tool_call_id: call.id, source,
            ...(error ? { code: error.code, error: error.message } : {}) });
        const id = section(state.round, `tool-result-${state.index}`, 'tool_result', i18nFormat('Tool result: ${0}', call.name), { ok: !error });
        settle(state.round, id, error ? 'failed' : 'done');
        settle(state.round, `tool-${state.index}`, error ? 'failed' : 'done');
    };
    let runtime;
    runtime = new AgentRuntime({ store, registry: new AgentRegistry([{ id: owner.agentId, tools: toolNames }]),
        eventSink: createEngineObserver({ plan, getState: id => runtime.getState(id), panelRunId, onEvent: deps.onRuntimeEvent }), countTokens: createHostTokenCounter(context), contextBudget: Number.MAX_SAFE_INTEGER,
        contextInput: async ({ state }) => {
            await rebuild(state.policyState);
            record('llm_request', { round: state.policyState.round, max_rounds: profile.max_rounds, message_count: messages.length });
            ensureEngineRound(panelRunId, `agent-${state.policyState.round}`);
            section(state.policyState.round, 'text', 'text', i18n('Text'));
            return { legacyMessages: messages, tools, budgetScope: 'task-messages-and-tools' };
        },
        ports: {
            memory: createDelegatedMemoryPort(assertFresh),
            model: { request: effect => sendLlm(withRuntimeContext(guardRequestCallbacks({ context, settings: deps.settings || null,
                runtimeWorldInfo: deps.runtimeWorldInfo || null, ...configuredNativeRoute(profile), apiPresetName: String(profile.apiPresetName || ''), llmPresetName: String(profile.promptPresetName || ''),
                messages: effect.messages, tools, round: effect.step, abortSignal: effect.signal,
                onUsage: usage => addTokenUsage({ runId: panelRunId, usage }) }, effect.signal), context, assertFresh)) },
            tool: { async execute(effect) {
                let message, error = null;
                const state = runtime.getState(runId).policyState;
                const call = state.calls[state.index];
                try {
                    Object.assign(toolContext, { signal: effect.signal, abortSignal: effect.signal, runId, stepId: effect.stepId, effectId: effect.effectId,
                        __agentRuntimeMemoryGuard: guard => guards.add(guard) });
                    const value = await executeTool(call.name, effect.args, toolContext);
                    throwIfAborted(effect.signal);
                    message = makeOkToolMessage(call.id, normalizeToolOk(value), state.round);
                } catch (failure) {
                    throwIfAborted(effect.signal);
                    if (!isStructuredToolError(failure)) throw failure;
                    error = { message: String(failure.message), code: String(failure.code || 'TOOL_ERROR'), hint: String(failure.hint || '') };
                    message = makeErrorToolMessage(call.id, error, state.round);
                }
                toolResults.set(effect.effectId, message);
                return { ok: !error, value: { reference: effect.effectId }, error };
            } },
            policy: { async advance({ policyState, receipt, effectId }) {
                if (policyState.planFingerprint !== fingerprint) throw new Error('Plan fingerprint mismatch');
                assertFresh();
                const state = copy(policyState);
                state.events = [];
                if (state.pending === 'tool') {
                    const call = state.calls[state.index];
                    if (!toolResults.has(receipt.value.reference)) throw new Error('Transient Loop tool result unavailable');
                    recordToolResult(state, call, toolResults.get(receipt.value.reference), receipt.error, receipt.value.reference);
                    state.index++;
                } else if (state.pending === 'model') {
                    const text = String(receipt.assistantText || '').trim();
                    if (text) { state.lastNaturalText = text; append(state.round, 'text', text); }
                    if (receipt.reasoning) { const id = section(state.round, 'reasoning', 'reasoning', i18n('Reasoning')); append(state.round, id, String(receipt.reasoning)); settle(state.round, id); }
                    settle(state.round, 'text');
                    state.calls = (receipt.toolCalls || []).map((call, index) => ({ id: String(call.id || `${effectId}/call/${index}`), name: String(call.name), args: call.args || {} }));
                    state.index = 0;
                    record('llm_response', { round: state.round, tool_call_count: state.calls.length, has_assistant_text: Boolean(text) });
                    if (state.calls.length) {
                        state.noToolCallStreak = 0;
                        state.history.push({ role: 'assistant', content: text, reasoning: String(receipt.reasoning || ''),
                            ...(receipt.reasoningBlocks?.length ? { reasoning_blocks: receipt.reasoningBlocks } : {}),
                            ...(receipt.reasoningDetails?.length ? { reasoning_details: receipt.reasoningDetails } : {}),
                            tool_calls: state.calls.map(call => ({ id: call.id, type: 'function', function: { name: sourceName(call.name), arguments: JSON.stringify(call.args) }, source: resolveToolSource(sourceName(call.name), toolContext) })), _round: state.round });
                    } else {
                        state.noToolCallStreak++;
                        record('agent_no_tool_call', { round: state.round, streak: state.noToolCallStreak });
                    }
                }
                state.pending = null;
                while (state.index < state.calls.length) {
                    const call = state.calls[state.index], name = sourceName(call.name);
                    record('tool_call', { round: state.round, name: call.name, tool_call_id: call.id, source: resolveToolSource(name, toolContext) });
                    section(state.round, `tool-${state.index}`, 'tool_call', i18nFormat('Tool: ${0}', call.name), { args: call.args });
                    if (!toolNames.includes(name) || toolCapability(name, 'loop').startsWith('reply.')) {
                        state.events.push({ type: 'capability.denied', nodeId: 'owner', toolName: name, capability: toolCapability(name, 'loop') });
                        const error = { message: `Tool '${call.name}' is not enabled.`, code: 'NOT_IMPLEMENTED', hint: 'Pick an enabled tool or finalize.' };
                        recordToolResult(state, call, makeErrorToolMessage(call.id, error, state.round), error);
                        state.index++; continue;
                    }
                    if (name === 'finalize') {
                        const text = String(call.args.capsule_text || '').trim();
                        const error = text ? null : { message: 'finalize requires a non-empty capsule_text.', code: 'FINALIZE_EMPTY', hint: 'Provide a non-empty capsule_text describing the guidance for the next turn.' };
                        recordToolResult(state, call, error ? makeErrorToolMessage(call.id, error, state.round) : makeOkToolMessage(call.id, { ok: true, finalized: true }, state.round), error);
                        if (text) { state.capsule = text; await rebuild(state); return finish(state); }
                        state.index++; continue;
                    }
                    state.pending = 'tool';
                    return { intent: { type: 'tool', toolName: name, args: call.args }, policyState: state };
                }
                if (state.round) setRoundStatus({ runId: panelRunId, roundId: `agent-${state.round}`, status: 'done' });
                await rebuild(state);
                const reason = state.noToolCallStreak >= 3 ? 'no_tool_call_streak'
                    : state.deadline !== null && Date.now() >= state.deadline ? 'wall_clock' : state.round >= profile.max_rounds ? 'max_rounds' : '';
                if (reason) return finish(state, reason);
                state.round++; state.pending = 'model';
                return { intent: { type: 'model' }, policyState: state };
            } },
        } });
    const cancel = () => { if (runtime.getState(runId)) runtime.cancelRun(runId); };
    store?.bindCancel?.(cancel); signal?.addEventListener('abort', cancel, { once: true });
    try {
        throwIfAborted(signal);
        const saved = runtime.getState(runId);
        if (saved && saved.policyState?.planFingerprint !== fingerprint) throw new Error('Plan fingerprint mismatch');
        const state = await (deps.engineResume ? runtime.resumeRun(runId) : runtime.startRun({ runId, agentId: owner.agentId, controlMode: 'policy', maxSteps: profile.max_rounds,
            policyState: { ...initialPolicyState(plan), pending: null, round: 0, history: [], calls: [], index: 0, noToolCallStreak: 0, capsule: null, lastNaturalText: null, deadline } }));
        if (state.status === 'cancelled') throw createAbortError('Orchestration aborted.');
        if (state.status !== 'completed') throw new Error(state.error || 'Loop failed');
        assertOutputAuthorized({ plan, state, generation: state.generation, assertFresh });
        return state.output;
    } finally { signal?.removeEventListener('abort', cancel); ownedStore?.close(); toolResults.clear(); guards.clear(); }
}
