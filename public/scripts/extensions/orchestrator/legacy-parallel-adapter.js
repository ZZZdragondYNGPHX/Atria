import { ParallelExecutor } from '../../lib/agent-runtime/parallel.js';
import { runLegacyWorkflow, toolIntent, createLegacyWorkflowRunId } from './legacy-workflow-adapter.js';
import { throwIfAborted } from './abort-utils.js';

/** Compatibility batch: parent tool receipt and stable child run IDs, with live results kept out of storage.
 * Lost legacy continuations still fail closed. This does not replay closures to reconstruct a mode.
 */
export async function runLegacyParallel(items, execute, { context, signal, panelRunId,
    concurrency = Math.max(1, items.length), runId = `${panelRunId || 'legacy'}/parallel/${createLegacyWorkflowRunId()}` } = {}) {
    const values = new Map(), errors = new Map();
    const executor = new ParallelExecutor({ async execute(request) {
        const index = Number(request.id);
        try {
            const value = await execute(items[index], index, request);
            throwIfAborted(request.signal, 'Parallel branch cancelled');
            values.set(request.runId, value);
            return { transientBranchResult: request.runId };
        } catch (error) { errors.set(request.id, error); throw error; }
    } });
    try {
        return await runLegacyWorkflow(async function* () {
            const toolContext = {};
            const outcome = yield toolIntent('parallel.fanout', {}, toolContext, () => executor.run({
                effectId: toolContext.effectId, signal: toolContext.signal,
                branches: items.map((_, index) => ({ id: String(index) })), concurrency, failurePolicy: 'fail_fast',
            }));
            if (!outcome.ok) {
                const failed = outcome.branches.find(branch => branch.status === 'failed');
                throw errors.get(failed?.id) || new Error('Parallel branch failed or cancelled');
            }
            return outcome.branches.map(branch => {
                const key = branch.value?.transientBranchResult;
                if (!values.has(key)) throw new Error('Transient parallel result unavailable');
                return values.get(key);
            });
        }, { context, signal, panelRunId, runId });
    } finally { values.clear(); errors.clear(); }
}
