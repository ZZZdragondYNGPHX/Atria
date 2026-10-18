import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertComputeLedger } from '../../../public/shared/native-compute-budget.js';
import { readOriginalProjectTask } from './project-tool-receipts.js';
import { readAttempt } from './controller-common.js';
import { readEffect } from './effect-contracts.js';
import { readFanoutFrame, readFanoutMembership } from './fanout-controller.js';
import { sendAttemptId } from './budget-port.js';

const equal = (a, b) => hash(a) === hash(b);
const denied = code => { throw Object.assign(new TypeError(code), { code }); };

/** The frozen branch is a scope boundary. Initial support adopts scheduling
 * proposals only; expanding/repeating/cancelling its frozen work requires a
 * corresponding consumer and cold proof, rather than a new permission. */
export async function assertProjectFanoutPlannerPatch(tx, handle, root, producer, patch) {
    const fanoutAttemptId = producer.inputRefs[0]?.fanoutAttemptId;
    const frame = fanoutAttemptId ? await readFanoutFrame(tx, handle, root, fanoutAttemptId) : null;
    const branch = frame?.branches.find(branch => branch.scopeNodeIds.includes(producer.nodeId));
    const fanout = frame ? (await readAttempt(tx, handle, root, fanoutAttemptId)).doc : null;
    if (!frame || !branch || fanout.status !== 'running' || frame.epoch !== root.epoch
        || frame.sourceBindingDigest !== root.sourceBinding.bindingDigest || !equal(frame.parentBudgetRef, root.budgetAuthorityRef)
        || !await readFanoutMembership(tx, handle, root, frame, producer.attemptId)) denied('native_orchestration_fanout_stale');
    assertProjectFanoutPlannerOperations(frame, producer, patch.operations);
}

/** Also used by the cold reader after the original Frame/Model proof. */
export function assertProjectFanoutPlannerOperations(frame, producer, operations) {
    const branch = frame.branches.find(branch => branch.scopeNodeIds.includes(producer.nodeId));
    if (!branch || producer.inputRefs[0]?.fanoutAttemptId !== frame.fanoutAttemptId) denied('native_orchestration_fanout_stale');
    for (const operation of operations) {
        if (!['requestFinalize', 'setPendingPriority'].includes(operation.op)) denied('native_orchestration_fanout_planner_control_pending');
        if (operation.op === 'setPendingPriority' && !branch.scopeNodeIds.includes(operation.nodeId)) denied('native_orchestration_patch_denied');
    }
}

/** Accounting only: already admitted sends occupy this same original bank,
 * including in-flight/unknown sibling sends whose Result is not published.
 * This never proves a Result, Source permission, or a reusable Model grant. */
export async function readProjectFanoutPaidModelNodes(tx, handle, root) {
    const authority = root.budgetAuthorityRef;
    const source = root.sourceBinding.sourceRef;
    const task = await readOriginalProjectTask(tx, handle, source);
    if (root.sourceBinding.sourceAuthority !== 'project' || authority.authority !== 'project_task' || root.parentRef
        || authority.projectId !== source.projectId || authority.taskId !== source.taskId || task?.baseRevision !== source.revision
        || authority.operationId !== hash({ projectId: source.projectId, taskId: source.taskId, revision: source.revision, executionFingerprint: source.executionFingerprint })
        || !equal(root.sourceBinding.budgetAuthorityRef, authority)) denied('native_orchestration_budget_unavailable');
    const bank = assertComputeLedger(task.compute), paid = new Set();
    for (const id of root.attemptRefs) {
        const attempt = (await readAttempt(tx, handle, root, id)).doc;
        for (const effectId of attempt.effectRefs) {
            const effect = (await readEffect(tx, handle, root, effectId)).doc;
            if (effect.capability !== 'generation.send') continue;
            const rows = bank.attempts.filter(row => row.orchestration?.effectId === effectId);
            if (!rows.length) continue;
            if (effect.nodeAttemptId !== attempt.attemptId || effect.epoch !== attempt.epoch
                || effect.sourceBindingDigest !== root.sourceBinding.bindingDigest || effect.grantDigest !== attempt.effectiveGrantDigest
                || effect.inputHash !== hash(attempt.inputRefs[0]) || !equal(effect.inputRef, attempt.inputRefs[0])
                || !equal(attempt.budgetRef, authority)) denied('native_orchestration_budget_attempt_invalid');
            for (const [ordinal, row] of rows.entries()) if (row.orchestration.kind !== 'provider_send' || row.orchestration.ordinal !== ordinal
                || row.attemptId !== sendAttemptId(effectId, ordinal) || (row.reservationId ?? null) !== null
                || !['charged', 'unknown', 'settled'].includes(row.status)) denied('native_orchestration_budget_attempt_invalid');
            paid.add(attempt.nodeId);
        }
    }
    return paid;
}
