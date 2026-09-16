import { AgentRuntime, AgentRegistry } from '../../lib/agent-runtime/index.js';
import { throwIfAborted, createAbortError, isAbortError } from './abort-utils.js';
import { normalizeWorkerReply, workerHistory } from './legacy-worker-protocol.js';

/** Single's serial rounds are driven by Runtime; host preparation and wire formatting stay compatible. */
export async function runLegacySingleRequest({ runId, request, send, onEvent = null, worker = null, store = undefined }) {
    throwIfAborted(request.abortSignal, 'Orchestration aborted.');
    let activeRequest = request;
    let portError = null;
    // Legacy tools can return Memory OS text. Keep that content out of execution checkpoints.
    // A future durable adapter must rehydrate source-guarded references, not replay these strings.
    const toolResults = new Map();
    const tools = (request.tools || []).map(tool => String(tool?.function?.name || '').replace(/\./g, '_')).filter(Boolean);
    const runtime = new AgentRuntime({
        store,
        registry: new AgentRegistry([{ id: 'single_agent', tools }]),
        // Compatibility measurement only. Phase 3 installs the host tokenizer and layer diagnostics.
        countTokens: message => String(message.content || '').length,
        contextBudget: Number.MAX_SAFE_INTEGER,
        contextInput: worker ? async ({ state, signal }) => {
            const history = workerHistory(state.scratch, entry => {
                if (!toolResults.has(entry.toolCallId)) throw new Error('Transient tool result unavailable; source revalidation required');
                return toolResults.get(entry.toolCallId);
            });
            activeRequest = await worker.prepareRequest(state.step, history);
            throwIfAborted(signal, 'Orchestration aborted.');
            return { legacyMessages: activeRequest.taskMessages };
        } : { legacyMessages: request.taskMessages },
        ports: {
            model: { async request({ messages, signal, effectId, step }) {
                try {
                    const detailed = await send({ ...activeRequest, taskMessages: messages, abortSignal: signal });
                    throwIfAborted(signal, 'Orchestration aborted.');
                    if (!worker) return { type: 'complete', output: detailed };
                    const { decision, traceTurn } = normalizeWorkerReply(detailed, { ...worker, effectId });
                    worker.onTurn({ ...traceTurn, _round: step });
                    return decision;
                } catch (error) {
                    if (worker && error.traceTurn && !signal.aborted) worker.onTurn({ ...error.traceTurn, _round: step });
                    portError = error;
                    throw error;
                }
            } },
            tool: { async execute(effect) {
                if (!worker) throw new Error('Single adapter does not execute tools');
                let result;
                try {
                    throwIfAborted(effect.signal, 'Orchestration aborted.');
                    const data = await worker.execute(effect);
                    throwIfAborted(effect.signal, 'Orchestration aborted.');
                    result = { ok: true, data };
                } catch (error) {
                    if (isAbortError(error, effect.signal) || !worker.isStructuredToolError(error)) {
                        portError = error;
                        throw error;
                    }
                    result = { ok: false, error: String(error.message || ''), code: String(error.code || 'TOOL_ERROR'), hint: String(error.hint || '') };
                }
                const content = worker.serialize(result);
                toolResults.set(effect.effectId, content);
                worker.onTurn({ role: 'tool', tool_call_id: effect.providerCallId, name: effect.metadata?.sourceName || effect.toolName, content, _round: effect.step });
                return { ok: result.ok, value: { transientToolResult: effect.effectId }, ...(result.ok ? {} : { error: { code: result.code } }) };
            } },
            // No new retrieval: existing world-info assembly owns Memory OS injection here.
            memory: { async recall() { return { references: [], content: '', assertCurrent() {} }; } },
        },
    });
    const unsubscribe = onEvent ? runtime.events.subscribe(onEvent) : () => {};
    const cancel = () => runtime.cancelRun(runId);
    request.abortSignal?.addEventListener('abort', cancel, { once: true });
    try {
        const result = await runtime.startRun({ runId, agentId: 'single_agent', task: 'Legacy Single final guidance', maxSteps: worker?.maxRounds || 1 });
        if (result.status === 'cancelled') throw createAbortError('Orchestration aborted.');
        if (result.status !== 'completed') {
            if (portError) throw portError;
            if (worker && result.error === 'Step budget exhausted') {
                throw new Error(`Node '${worker.nodeId}' exceeded max iteration rounds (${worker.maxRounds}) without ${worker.outputToolName}.`);
            }
            throw new Error(result.error || 'Single runtime failed');
        }
        return result.output;
    } finally {
        request.abortSignal?.removeEventListener('abort', cancel);
        unsubscribe();
        toolResults.clear();
    }
}
