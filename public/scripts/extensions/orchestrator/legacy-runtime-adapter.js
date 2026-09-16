import { createLegacyExecutionPorts } from './legacy-runtime-ports.js';
import { createHostTokenCounter, createDelegatedMemoryPort } from '../../lib/agent-runtime/host-ports.js';
import { AgentRuntime, AgentRegistry } from '../../lib/agent-runtime/index.js';
import { throwIfAborted, createAbortError } from './abort-utils.js';
import { workerHistory } from './legacy-worker-protocol.js';

/** Single's serial rounds are driven by Runtime; host preparation and wire formatting stay compatible. */
export async function runLegacySingleRequest({ runId, request, send, onEvent = null, worker = null, store = undefined, hostContext = {}, contextBudget = Number.MAX_SAFE_INTEGER }) {
    throwIfAborted(request.abortSignal, 'Orchestration aborted.');
    let activeRequest = request;
    let portError = null;
    // Legacy tools can return Memory OS text. Keep that content out of execution checkpoints.
    // A future durable adapter must rehydrate source-guarded references, not replay these strings.
    const toolResults = new Map();
    const tools = (request.tools || []).map(tool => String(tool?.function?.name || '').replace(/\./g, '_')).filter(Boolean);
    const measurement = { tokenCounting: typeof hostContext.getTokenCountAsync === 'function' ? 'host-tokenizer' : 'utf8-bytes-estimate', budgetScope: 'task-messages-and-tools' };
    const runtime = new AgentRuntime({
        store,
        registry: new AgentRegistry([{ id: 'single_agent', tools }]),
        // Final card/preset budget remains enforced by the existing host sender.
        countTokens: createHostTokenCounter(hostContext),
        contextBudget,
        contextInput: worker ? async ({ state, signal }) => {
            const history = workerHistory(state.scratch, entry => {
                if (!toolResults.has(entry.toolCallId)) throw new Error('Transient tool result unavailable; source revalidation required');
                return toolResults.get(entry.toolCallId);
            });
            activeRequest = await worker.prepareRequest(state.step, history);
            throwIfAborted(signal, 'Orchestration aborted.');
            return { ...measurement, legacyMessages: activeRequest.taskMessages, tools: activeRequest.tools || request.tools };
        } : { ...measurement, legacyMessages: request.taskMessages, tools: request.tools },
        ports: {
            ...createLegacyExecutionPorts({ send, getRequest: () => activeRequest, worker, toolResults, onError: error => { portError = error; } }),
            // No new retrieval: existing world-info assembly owns Memory OS injection here.
            memory: createDelegatedMemoryPort(),
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
