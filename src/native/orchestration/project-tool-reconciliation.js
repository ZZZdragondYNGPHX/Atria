import { ConflictError } from '../../storage/errors.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { ProjectAgentService } from '../project-agent.js';
import { readEffect } from './effect-contracts.js';
import { readProjectToolReceipt } from './project-tool-receipts.js';
import { observeReconciledEffect } from './effect-reconciliation.js';

const fail = () => { throw new ConflictError('native_orchestration_project_reconciliation_unavailable'); };

async function facts(execution, projectAgent, handle, tx, root, intent) {
    const { runs, budgetPort } = execution, fence = await runs.engine.nativeHostLifecycle.assertWriter(handle, tx);
    if (!(projectAgent instanceof ProjectAgentService) || projectAgent._repository.engine !== runs.engine || budgetPort.projectAgent !== projectAgent
        || budgetPort.projectRepository !== projectAgent._repository
        || root.sourceBinding.sourceAuthority !== 'project' || root.parentRef !== null
        || root.hostBootId !== fence.hostBootId || root.hostGeneration !== fence.generation
        || !['native_project_read', 'native_project_proposal'].includes(intent.actionRef.kind)
        || !['dispatching', 'unknown', 'confirmed'].includes(intent.status) || !intent.dispatchToken) fail();
    await budgetPort.verifyBudgetAttempt({ handle, tx, root, intent, budgetAttemptRef: intent.budgetAttemptRef });
    const work = await budgetPort.observeAttempt(handle, intent.budgetAttemptRef);
    if (intent.budgetAttemptRef.kind !== 'local_work' || intent.budgetAttemptRef.localWorkOrdinal !== 0
        || intent.budgetAttemptRef.reservationId !== null || work.kind !== 'project_tool') fail();
    // No inferred timing or outcome can replace the original local work fact.
    // Its absence preserves unknown rather than rerunning a Task tool/evaluation.
    if (work.status !== 'settled' || work.usage?.outcome !== 'completed') return null;
    return readProjectToolReceipt(tx, handle, root, intent.effectId, { projectAgent });
}

export async function verifyProjectToolReconciliation(execution, projectAgent, { handle, tx, root, intent, observation }) {
    const fact = await facts(execution, projectAgent, handle, tx, root, intent);
    if (!fact || hash(fact.observation) !== hash(observation)) fail();
}

/** Original Task/call/Model/bank receipts only. No tool result body or writer. */
export async function reconcileProjectToolEffect(execution, projectAgent, handle, request) {
    assertObject(request, ['runId', 'effectId'], 'Project tool Effect reconciliation');
    const { runs, effects } = execution;
    if (effects.runs !== runs || runs.engine.hasActiveTransaction(handle)) fail();
    const current = await runs.engine.withTransaction(handle, async tx => {
        const root = await runs.get(handle, request.runId), intent = (await readEffect(tx, handle, root, request.effectId)).doc;
        const fact = await facts(execution, projectAgent, handle, tx, root, intent);
        return { root, intent, fact };
    });
    if (current.fact?.hostReceiptRef) return current.intent.status === 'confirmed'
        ? { status: 'confirmed', effectId: request.effectId, receiptRef: current.fact.hostReceiptRef, budgetSettled: true, resumed: false }
        : { status: 'unknown', effectId: request.effectId, receiptRef: null, resumed: false };
    return observeReconciledEffect(execution, handle, { root: current.root, effectId: request.effectId, observation: current.fact?.observation ?? null });
}
