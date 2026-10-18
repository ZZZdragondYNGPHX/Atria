import { hashNativeDocument as hash, equalNativeDocuments as equal } from '../repositories/common.js';
import { assertComputeLedger } from '../../../public/shared/native-compute-budget.js';
import { readRunControl } from '../run-control.js';
import { readAttempt } from './controller-common.js';
import { readEffect } from './effect-contracts.js';
import { readFanoutFrame, readFanoutMembership } from './fanout-controller.js';
import { sendAttemptId } from './budget-port.js';

const denied = code => { throw Object.assign(new TypeError(code), { code }); };

/** Original frozen membership bounds scheduling advice. This does not grant
 * Source access, new members, another Attempt, Model budget or a writer. */
export async function assertSessionFanoutPlannerPatch(tx, handle, root, producer, patch) {
    const fanoutAttemptId = producer.inputRefs[0]?.fanoutAttemptId;
    const frame = fanoutAttemptId ? await readFanoutFrame(tx, handle, root, fanoutAttemptId) : null;
    const fanout = frame ? (await readAttempt(tx, handle, root, fanoutAttemptId)).doc : null;
    if (!frame || fanout.status !== 'running' || frame.epoch !== root.epoch || frame.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || !equal(frame.parentBudgetRef, root.budgetAuthorityRef) || !await readFanoutMembership(tx, handle, root, frame, producer.attemptId))
        denied('native_orchestration_fanout_stale');
    assertSessionFanoutPlannerOperations(frame, producer, patch.operations);
}

/** Historical control bounds after the original Frame/Model proof. */
export function assertSessionFanoutPlannerOperations(frame, producer, operations) {
    const branch = frame.branches.find(branch => branch.scopeNodeIds.includes(producer.nodeId));
    if (!branch || producer.inputRefs[0]?.fanoutAttemptId !== frame.fanoutAttemptId) denied('native_orchestration_fanout_stale');
    for (const operation of operations) {
        if (!['requestFinalize', 'setPendingPriority'].includes(operation.op)) denied('native_orchestration_fanout_planner_control_pending');
        if (operation.op === 'setPendingPriority' && !branch.scopeNodeIds.includes(operation.nodeId)) denied('native_orchestration_patch_denied');
    }
}

/** Accounting only: charged and unknown sibling sends already occupy this
 * same original bank. They never supply a Result or reusable send grant. */
export async function readSessionFanoutPaidModelNodes(tx, handle, root, fanoutAttemptId) {
    const authority = root.budgetAuthorityRef;
    if (authority.domain !== 'session' || root.parentRef && (!root.parentRef.budgetCeiling || !root.parentRef.effectiveGrantDigest) || root.sourceBinding.sourceAuthority !== 'native_session'
        || !equal(root.sourceBinding.budgetAuthorityRef, authority)) denied('native_orchestration_budget_unavailable');
    const frame = await readFanoutFrame(tx, handle, root, fanoutAttemptId);
    if (!frame || frame.epoch !== root.epoch || frame.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || !equal(frame.parentBudgetRef, authority)) denied('native_orchestration_fanout_stale');
    const control = await readRunControl(tx, handle, authority.sessionId);
    const bank = assertComputeLedger(control?.operations[authority.operationId]?.compute), paid = new Set();
    if (root.parentRef) {
        const allocation = bank.reservations.find(row => row.reservationId === root.runId);
        if (!allocation || allocation.status !== 'held' || !equal(allocation.limits, root.parentRef.budgetCeiling)
            || allocation.parentReservationId !== (root.parentRef.depth === 1 ? null : root.parentRef.parentRunId))
            denied('native_orchestration_budget_unavailable');
    }
    for (const id of frame.branches.flatMap(branch => branch.memberAttemptIds)) {
        const attempt = (await readAttempt(tx, handle, root, id)).doc;
        if (!await readFanoutMembership(tx, handle, root, frame, id)
            || attempt.inputState !== 'reserved' && attempt.inputRefs[0]?.fanoutAttemptId !== fanoutAttemptId) denied('native_orchestration_fanout_stale');
        for (const effectId of attempt.effectRefs) {
            const effect = (await readEffect(tx, handle, root, effectId)).doc;
            if (effect.capability !== 'generation.send') continue;
            const rows = bank.attempts.filter(row => row.orchestration?.effectId === effectId);
            if (!rows.length) continue;
            if (effect.nodeAttemptId !== attempt.attemptId || effect.epoch !== attempt.epoch || effect.sourceBindingDigest !== root.sourceBinding.bindingDigest
                || effect.grantDigest !== attempt.effectiveGrantDigest || effect.inputHash !== hash(attempt.inputRefs[0]) || !equal(effect.inputRef, attempt.inputRefs[0])
                || !equal(attempt.budgetRef, authority)) denied('native_orchestration_budget_attempt_invalid');
            for (const [ordinal, row] of rows.entries()) if (row.orchestration.kind !== 'provider_send' || row.orchestration.ordinal !== ordinal
                || row.attemptId !== sendAttemptId(effectId, ordinal) || row.requestId !== effect.inputRef.invocationId || (row.reservationId ?? null) !== (root.parentRef ? root.runId : null)
                || !['charged', 'unknown', 'settled'].includes(row.status)) denied('native_orchestration_budget_attempt_invalid');
            paid.add(attempt.nodeId);
        }
    }
    return paid;
}
