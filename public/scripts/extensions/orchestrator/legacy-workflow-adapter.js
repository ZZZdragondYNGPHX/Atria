import { withRuntimeContext } from '../../lib/agent-runtime/prepared-context.js';
import { AgentRuntime, AgentRegistry } from '../../lib/agent-runtime/index.js';
import { createHostTokenCounter, createDelegatedMemoryPort, guardRequestCallbacks } from '../../lib/agent-runtime/host-ports.js';
import { createAbortError, throwIfAborted } from './abort-utils.js';

let nextRun = 0;
export function createLegacyWorkflowRunId(cryptoApi = globalThis.crypto) {
    return cryptoApi?.randomUUID?.() || `legacy-${Date.now().toString(36)}-${++nextRun}-${Math.random().toString(36).slice(2)}`;
}

/** Legacy policy describes the next operation; only Runtime executes it. */
export function modelIntent(send, request, context = {}) {
    return { kind: 'model', send, request, context };
}

export function toolIntent(name, args, context, execute) {
    return { kind: 'tool', name: String(name), args, context, execute };
}

/** Keep mode-specific streaming, retry and completion policy in an async generator.
 * Live functions/results never enter checkpoints. This transitional continuation cannot
 * be restored after process loss: Runtime rejects resume rather than replaying writes.
 */
export async function runLegacyWorkflow(factory, { context = {}, signal, runId = createLegacyWorkflowRunId(), onEvent, store, maxSteps = 10000 } = {}) {
    throwIfAborted(signal, 'Orchestration aborted.');
    const iterator = factory();
    let pending, output, failure;
    const results = new Map();
    const memoryGuards = new Set();
    const registerMemoryGuard = guard => memoryGuards.add(guard);
    const measure = createHostTokenCounter(context);
    const execute = async (effect, fn) => {
        throwIfAborted(effect.signal, 'Orchestration aborted.');
        try {
            const value = await fn();
            throwIfAborted(effect.signal, 'Orchestration aborted.');
            results.set(effect.effectId, { value });
            return { ok: true, value: { transientResult: effect.effectId } };
        } catch (error) {
            throwIfAborted(effect.signal, 'Orchestration aborted.');
            results.set(effect.effectId, { error });
            return { ok: false, value: { transientResult: effect.effectId } };
        }
    };
    const runtime = new AgentRuntime({
        store, registry: new AgentRegistry([{ id: 'legacy-policy' }]), countTokens: measure,
        contextBudget: Number.MAX_SAFE_INTEGER,
        contextInput: () => ({
            legacyMessages: pending.request.taskMessages ?? pending.request.messages ?? [],
            tools: pending.request.tools || [],
            tokenCounting: typeof context.getTokenCountAsync === 'function' ? 'host-tokenizer' : 'utf8-bytes-estimate',
            budgetScope: 'task-messages-and-tools',
        }),
        ports: {
            memory: createDelegatedMemoryPort(() => { for (const guard of memoryGuards) guard(); }),
            policy: { async advance({ receipt, signal: activeSignal }) {
                throwIfAborted(activeSignal, 'Orchestration aborted.');
                let next;
                try {
                    if (receipt) {
                        const key = receipt.value?.transientResult;
                        if (!results.has(key)) throw new Error('Transient policy result unavailable');
                        const entry = results.get(key);
                        results.delete(key);
                        next = entry.error ? await iterator.throw(entry.error) : await iterator.next(entry.value);
                    } else next = await iterator.next();
                } catch (error) { failure = error; throw error; }
                throwIfAborted(activeSignal, 'Orchestration aborted.');
                if (next.done) {
                    output = next.value;
                    return { type: 'complete', output: { transientOutput: runId } };
                }
                pending = next.value;
                if (pending?.kind === 'model' && typeof pending.send === 'function') return { type: 'model' };
                if (pending?.kind === 'tool' && typeof pending.execute === 'function') return { type: 'tool', toolName: pending.name };
                throw new TypeError('Legacy policy must yield a model or tool intent');
            } },
            model: { request: effect => execute(effect, () => {
                const key = Object.hasOwn(pending.request, 'messages') ? 'messages' : 'taskMessages';
                return pending.send(withRuntimeContext(guardRequestCallbacks({ ...pending.request, [key]: effect.messages, abortSignal: effect.signal }, effect.signal), context, memoryGuards.size ? () => { for (const guard of memoryGuards) guard(); } : null));
            }) },
            tool: { execute: effect => execute(effect, () => {
                const host = pending.context || {};
                Object.assign(host, { signal: effect.signal, abortSignal: effect.signal,
                    runId: effect.runId, stepId: effect.stepId, effectId: effect.effectId, __agentRuntimeMemoryGuard: registerMemoryGuard });
                return pending.execute(pending.name, pending.args, host);
            }) },
        },
    });
    const unsubscribe = onEvent ? runtime.events.subscribe(onEvent) : () => {};
    const cancel = () => runtime.cancelRun(runId);
    signal?.addEventListener('abort', cancel, { once: true });
    try {
        const result = await runtime.startRun({ runId, agentId: 'legacy-policy', task: '', legacyPolicy: true, maxSteps });
        if (result.status === 'cancelled') {
            const error = createAbortError('Orchestration aborted.');
            // Let legacy catch/finally update traces, but never execute a yielded intent.
            // A stalled host await must not pin cancellation to its cleanup.
            await Promise.race([iterator.throw(error).catch(() => {}), new Promise(resolve => setTimeout(resolve, 0))]);
            throw error;
        }
        if (result.status !== 'completed') throw failure || new Error(result.error || 'Legacy workflow failed');
        return output;
    } finally {
        signal?.removeEventListener('abort', cancel);
        unsubscribe();
        results.clear();
        memoryGuards.clear();
        // Do not wait on an uncooperative host await during cancellation.
        Promise.resolve(iterator.return()).catch(() => {});
    }
}
