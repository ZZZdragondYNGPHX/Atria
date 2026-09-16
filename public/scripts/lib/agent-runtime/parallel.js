import { copy, requireId, validateParallelPlan } from './contracts.js';
import { abortable } from './abort.js';

/** Scheduling only: every child owns its existing Runtime/checkpoint, not a second agent state machine.
 * Resume must use durable child identity to look up/start/resume a child, never blindly rerun a closure.
 */
export class ParallelExecutor {
    #groups = new Map();
    constructor(branchPort) { this.branchPort = branchPort; }

    cancelBranch(effectId, branchId) {
        const controller = this.#groups.get(effectId)?.get(branchId);
        if (!controller || controller.signal.aborted) return false;
        controller.abort();
        return true;
    }

    run = request => this.#execute(request, false);
    resume = request => this.#execute(request, true);

    async #execute(request, recovering) {
        const plan = validateParallelPlan(request);
        requireId(request.effectId, 'parallel effect ID');
        if (this.#groups.has(request.effectId)) throw new Error('Parallel effect already active');
        const method = recovering ? this.branchPort.resume : this.branchPort.execute;
        if (typeof method !== 'function') throw new Error('Parallel continuation unavailable; cannot replay branches');
        const controllers = new Map(plan.branches.map(branch => [branch.id, new AbortController()]));
        this.#groups.set(request.effectId, controllers);
        const cancel = () => { for (const controller of controllers.values()) controller.abort(); };
        request.signal?.addEventListener('abort', cancel, { once: true });
        if (request.signal?.aborted) cancel();
        const results = new Array(plan.branches.length);
        let cursor = 0, failed = false;
        const worker = async () => {
            while (cursor < plan.branches.length) {
                const index = cursor++, branch = plan.branches[index];
                const controller = controllers.get(branch.id);
                const childRunId = `${request.effectId}/branch/${encodeURIComponent(branch.id)}`;
                const emit = type => {
                    try {
                        Promise.resolve(request.onEvent?.({ type: `parallel.branch.${type}`, branchId: branch.id,
                            childRunId, effectId: childRunId, toAgentId: branch.toAgentId, contextPolicy: branch.contextPolicy })).catch(() => {});
                    } catch { /* Observers do not own scheduling. */ }
                };
                const result = { id: branch.id, runId: childRunId, status: 'cancelled' };
                results[index] = result;
                if (controller.signal.aborted || failed) { emit('cancelled'); controllers.delete(branch.id); continue; }
                try {
                    request.assertCurrent?.();
                    emit('started');
                    if (controller.signal.aborted) throw new DOMException('Branch cancelled', 'AbortError');
                    const value = await abortable(Promise.resolve().then(() => {
                        if (controller.signal.aborted) throw new DOMException('Branch cancelled', 'AbortError');
                        request.assertCurrent?.();
                        return method.call(this.branchPort, { ...copy(branch), runId: childRunId,
                            effectId: childRunId, parentRunId: request.runId, signal: controller.signal,
                            assertCurrent: request.assertCurrent,
                            scratch: branch.contextPolicy === 'include_scratch' ? copy(request.scratch || []) : [] });
                    }), controller.signal, () => emit('stale'));
                    if (controller.signal.aborted) throw new DOMException('Branch cancelled', 'AbortError');
                    request.assertCurrent?.();
                    result.value = copy(value ?? null);
                    result.status = 'completed';
                    emit('completed');
                } catch (error) {
                    result.status = controller.signal.aborted ? 'cancelled' : 'failed';
                    result.error = String(error?.message || error);
                    emit(result.status);
                    if (plan.failurePolicy === 'fail_fast') { failed = true; cancel(); }
                } finally { controllers.delete(branch.id); }
            }
        };
        try {
            await Promise.all(Array.from({ length: Math.min(plan.concurrency, plan.branches.length) }, worker));
            if (request.signal?.aborted) throw new DOMException('Parallel run cancelled', 'AbortError');
            return { ok: plan.failurePolicy === 'settled' || results.every(result => result.status === 'completed'), branches: results };
        } finally {
            cancel();
            request.signal?.removeEventListener('abort', cancel);
            this.#groups.delete(request.effectId);
        }
    }
}

/** Factory supplies original definitions, source guards and one correctly scoped child store. */
export function createRuntimeBranchPort(createRuntime) {
    const execute = async (request, recovering) => {
        const { runtime, close = () => {} } = await createRuntime(request);
        const cancel = () => { if (runtime.getState(request.runId)) runtime.cancelRun(request.runId); };
        request.signal?.addEventListener('abort', cancel, { once: true });
        try {
            if (request.signal?.aborted) throw new DOMException('Branch cancelled', 'AbortError');
            request.assertCurrent?.();
            if (recovering && typeof runtime.store.flush !== 'function') throw new Error('Durable child checkpoint required for recovery');
            const saved = runtime.getState(request.runId);
            const state = await (saved ? runtime.resumeRun(request.runId)
                : runtime.startRun({ runId: request.runId, agentId: request.toAgentId, task: request.task,
                    parentRunId: request.parentRunId,
                    payload: request.payload ?? null, scratch: request.contextPolicy === 'include_scratch' ? request.scratch || [] : [],
                    maxSteps: request.maxSteps || 32 }));
            if (state.status !== 'completed') throw new Error(state.error || `Branch ${state.status}`);
            return state.output;
        } finally { request.signal?.removeEventListener('abort', cancel); close(); }
    };
    return { execute: request => execute(request, false), resume: request => execute(request, true) };
}
