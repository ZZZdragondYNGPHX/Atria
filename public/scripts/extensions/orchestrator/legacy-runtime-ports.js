import { throwIfAborted, isAbortError } from './abort-utils.js';
import { normalizeWorkerReply } from './legacy-worker-protocol.js';

/** Wire adapters only: serial scheduling, IDs and cancellation belong to AgentRuntime.
 * send uses requestToolCallsWithRetry -> generateTask -> existing dispatch transport.
 * execute uses the existing tool registry, simulation policy and scoped host context.
 */
export function createLegacyExecutionPorts({ send, getRequest, worker, toolResults, onError }) {
    return {
        model: { async request({ messages, signal, effectId, step }) {
            try {
                const detailed = await send({ ...getRequest(), taskMessages: messages, abortSignal: signal });
                throwIfAborted(signal, 'Orchestration aborted.');
                if (!worker) return { type: 'complete', output: detailed };
                const { decision, traceTurn } = normalizeWorkerReply(detailed, { ...worker, effectId });
                worker.onTurn({ ...traceTurn, _round: step });
                return decision;
            } catch (error) {
                if (worker && error.traceTurn && !signal.aborted) worker.onTurn({ ...error.traceTurn, _round: step });
                onError(error);
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
                    onError(error);
                    throw error;
                }
                result = { ok: false, error: String(error.message || ''), code: String(error.code || 'TOOL_ERROR'), hint: String(error.hint || '') };
            }
            const content = worker.serialize(result);
            toolResults.set(effect.effectId, content);
            worker.onTurn({ role: 'tool', tool_call_id: effect.providerCallId, name: effect.metadata?.sourceName || effect.toolName, content, _round: effect.step });
            return { ok: result.ok, value: { transientToolResult: effect.effectId }, ...(result.ok ? {} : { error: { code: result.code } }) };
        } },
    };
}
