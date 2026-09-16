import { openRuntimeCheckpointStore } from './runtime-checkpoints.js';
import { createRuntimeObserver } from './run-state/runtime-observer.js';
import { createLegacyExecutionPorts } from './legacy-runtime-ports.js';
import { createHostTokenCounter, createDelegatedMemoryPort } from '../../lib/agent-runtime/host-ports.js';
import { AgentRuntime, AgentRegistry } from '../../lib/agent-runtime/index.js';
import { throwIfAborted, createAbortError } from './abort-utils.js';
import { workerHistory } from './legacy-worker-protocol.js';

/** Single's serial rounds are driven by Runtime; host preparation and wire formatting stay compatible. */
export async function runLegacySingleRequest({ runId, agentId = 'single_agent', request, send, onEvent = null, worker = null, store = undefined, resume = false, hostContext = {}, contextBudget = Number.MAX_SAFE_INTEGER }) {
    throwIfAborted(request.abortSignal, 'Orchestration aborted.');
    const opening = store ? null : openRuntimeCheckpointStore(runId);
    const ownedStore = opening ? await opening : undefined;
    store ||= ownedStore;
    if (request.abortSignal?.aborted) { ownedStore?.close(); throwIfAborted(request.abortSignal); }
    let activeRequest = request;
    let portError = null;
    // Legacy tools can return Memory OS text. Keep that content out of execution checkpoints.
    // A future durable adapter must rehydrate source-guarded references, not replay these strings.
    const toolResults = new Map();
    const memoryGuards = new Set();
    const tools = (request.tools || []).map(tool => String(tool?.function?.name || '').replace(/\./g, '_')).filter(Boolean);
    const measurement = { modelProfile: { apiPresetName: request.apiPresetName || '', promptPresetName: request.llmPresetName || '' }, tokenCounting: typeof hostContext.getTokenCountAsync === 'function' ? 'host-tokenizer' : 'utf8-bytes-estimate', budgetScope: 'task-messages-and-tools' };
    const runtime = new AgentRuntime({
        eventSink: createRuntimeObserver({ onEvent }),
        store,
        registry: new AgentRegistry([{ id: agentId, tools }]),
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
            return { ...measurement, legacyMessages: activeRequest.taskMessages, modelProfile: { apiPresetName: activeRequest.apiPresetName || '', promptPresetName: activeRequest.llmPresetName || '' }, tools: activeRequest.tools || request.tools };
        } : { ...measurement, legacyMessages: request.taskMessages, tools: request.tools },
        ports: {
            ...createLegacyExecutionPorts({ getMemoryGuard: () => memoryGuards.size ? () => { for (const guard of memoryGuards) guard(); } : null, registerMemoryGuard: guard => memoryGuards.add(guard), hostContext, send, getRequest: () => activeRequest, worker, toolResults, onError: error => { portError = error; } }),
            // No new retrieval: existing world-info assembly owns Memory OS injection here.
            memory: createDelegatedMemoryPort(() => { for (const guard of memoryGuards) guard(); }),
        },
    });
    const cancel = () => runtime.cancelRun(runId);
    ownedStore?.bindCancel(cancel);
    request.abortSignal?.addEventListener('abort', cancel, { once: true });
    try {
        const result = await (resume ? runtime.resumeRun(runId) : runtime.startRun({ runId, agentId, task: 'Legacy Single final guidance', maxSteps: worker?.maxRounds || 1 }));
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
        ownedStore?.close();
        toolResults.clear();
        memoryGuards.clear();
    }
}
