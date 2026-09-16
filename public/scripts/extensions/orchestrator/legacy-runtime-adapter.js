import { AgentRuntime, AgentRegistry } from '../../lib/agent-runtime/index.js';
import { throwIfAborted, createAbortError } from './abort-utils.js';

/** Pilot for explicitly tool-free Single nodes. Default Single may inherit extension tools. */
export async function runLegacySingleRequest({ runId, request, send, onEvent = null }) {
    throwIfAborted(request.abortSignal, 'Orchestration aborted.');
    const runtime = new AgentRuntime({
        registry: new AgentRegistry([{ id: 'single_agent' }]),
        // Compatibility measurement only. Phase 3 installs the host tokenizer and layer diagnostics.
        countTokens: message => String(message.content || '').length,
        contextBudget: Number.MAX_SAFE_INTEGER,
        contextInput: { legacyMessages: request.taskMessages },
        ports: {
            model: { async request({ messages, signal }) {
                const detailed = await send({ ...request, taskMessages: messages, abortSignal: signal });
                return { type: 'complete', output: detailed };
            } },
            tool: { async execute() { throw new Error('Single adapter does not execute tools'); } },
            // No new retrieval: existing world-info assembly owns Memory OS injection here.
            memory: { async recall() { return { references: [], content: '', assertCurrent() {} }; } },
        },
    });
    const unsubscribe = onEvent ? runtime.events.subscribe(onEvent) : () => {};
    const cancel = () => runtime.cancelRun(runId);
    request.abortSignal?.addEventListener('abort', cancel, { once: true });
    try {
        const result = await runtime.startRun({ runId, agentId: 'single_agent', task: 'Legacy Single final guidance', maxSteps: 1 });
        if (result.status === 'cancelled') throw createAbortError('Orchestration aborted.');
        if (result.status !== 'completed') throw new Error(result.error || 'Single runtime failed');
        return result.output;
    } finally {
        request.abortSignal?.removeEventListener('abort', cancel);
        unsubscribe();
    }
}
