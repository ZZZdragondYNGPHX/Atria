import { hashNativeDocument as hash, equalNativeDocuments as equal } from '../repositories/common.js';
import { assertComputeLedger } from '../../../public/shared/native-compute-budget.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { checkedRecord } from './plan-repository.js';
import { readAttempt } from './controller-common.js';
import { readEffect } from './effect-contracts.js';
import { readFanoutFrame, readFanoutMembership, readFanoutReplanScope } from './fanout-controller.js';
import { sendAttemptId } from './budget-port.js';

const denied = code => { throw Object.assign(new TypeError(code), { code }); };

/** The frozen branch is a scope boundary. Initial support adopts scheduling
 * proposals only; expanding/repeating/cancelling its frozen work requires a
 * corresponding consumer and cold proof, rather than a new permission. */
export async function assertRpFanoutPlannerPatch(tx, handle, root, producer, patch) {
    const fanoutAttemptId = producer.inputRefs[0]?.fanoutAttemptId;
    const frame = fanoutAttemptId ? await readFanoutFrame(tx, handle, root, fanoutAttemptId) : null;
    const branch = frame?.branches.find(branch => branch.scopeNodeIds.includes(producer.nodeId));
    const fanout = frame ? (await readAttempt(tx, handle, root, fanoutAttemptId)).doc : null;
    if (!frame || !branch || fanout.status !== 'running' || frame.epoch !== root.epoch
        || frame.sourceBindingDigest !== root.sourceBinding.bindingDigest || !equal(frame.parentBudgetRef, root.budgetAuthorityRef)
        || !await readFanoutMembership(tx, handle, root, frame, producer.attemptId)) denied('native_orchestration_fanout_stale');
    assertRpFanoutPlannerOperations(frame, producer, patch.operations);
    const replan = patch.operations.some(operation => operation.op === 'requestReplan')
        ? await readFanoutReplanScope(tx, handle, root, producer) : null;
    if (patch.operations.some(operation => operation.op === 'requestReplan') && !replan) denied('native_orchestration_planner_replan_pending');
    return replan;
}

/** Also used by the cold reader after the original Frame/Model proof. */
export function assertRpFanoutPlannerOperations(frame, producer, operations) {
    const branch = frame.branches.find(branch => branch.scopeNodeIds.includes(producer.nodeId));
    if (!branch || producer.inputRefs[0]?.fanoutAttemptId !== frame.fanoutAttemptId) denied('native_orchestration_fanout_stale');
    for (const operation of operations) {
        if (!['requestFinalize', 'requestReplan', 'setPendingPriority'].includes(operation.op)) denied('native_orchestration_fanout_planner_control_pending');
        if (operation.op === 'setPendingPriority' && !branch.scopeNodeIds.includes(operation.nodeId)) denied('native_orchestration_patch_denied');
    }
}

/** Accounting only: already admitted sends occupy this same original bank,
 * including in-flight/unknown sibling sends whose Result is not published.
 * This never proves a Result, Source permission, or a reusable Model grant. */
export async function readRpFanoutPaidModelNodes(tx, handle, root) {
    const authority = root.budgetAuthorityRef;
    if (authority.domain !== 'rp_chat' || root.sourceBinding.sourceAuthority !== 'rp_chat'
        || root.parentRef && (!root.parentRef.budgetCeiling || !root.parentRef.effectiveGrantDigest) || !equal(root.sourceBinding.budgetAuthorityRef, authority))
        denied('native_orchestration_budget_unavailable');
    const control = (await checkedRecord(tx, { kind: K.rpRunControl, handle, controlId: authority.controlId }))?.doc;
    const bank = assertComputeLedger(control?.operations[authority.operationId]?.compute), paid = new Set();
    if (root.parentRef) {
        const allocation = bank.reservations.find(row => row.reservationId === root.runId);
        if (!allocation || allocation.status !== 'held' || !equal(allocation.limits, root.parentRef.budgetCeiling)
            || allocation.parentReservationId !== (root.parentRef.depth === 1 ? null : root.parentRef.parentRunId))
            denied('native_orchestration_budget_unavailable');
    }
    for (const id of root.attemptRefs) {
        const attempt = (await readAttempt(tx, handle, root, id)).doc;
        for (const effectId of attempt.effectRefs) {
            const effect = (await readEffect(tx, handle, root, effectId)).doc;
            if (effect.capability !== 'generation.send') continue;
            const rows = bank.attempts.filter(row => row.orchestration?.effectId === effectId);
            if (!rows.length) continue;
            const input = attempt.inputRefs[0], delegated = input?.kind === 'native_rp_delegation';
            const expectedInput = delegated ? { ...input, kind: root.parentRef ? 'native_rp_delegated_intent' : 'native_rp_intent',
                acceptedResultRef: effect.inputRef.acceptedResultRef, returnReceiptRef: effect.inputRef.returnReceiptRef,
                parentInputDigest: attempt.inputDigest } : input;
            if (delegated && (!effect.inputRef.acceptedResultRef || !effect.inputRef.returnReceiptRef)) denied('native_orchestration_budget_attempt_invalid');
            if (effect.nodeAttemptId !== attempt.attemptId || effect.epoch !== attempt.epoch
                || effect.sourceBindingDigest !== root.sourceBinding.bindingDigest || effect.grantDigest !== attempt.effectiveGrantDigest
                || effect.inputHash !== hash(effect.inputRef) || !equal(effect.inputRef, expectedInput)
                || !equal(attempt.budgetRef, authority)
                || root.parentRef && (attempt.effectiveGrantDigest !== root.parentRef.effectiveGrantDigest
                    || !['native_rp_delegated_intent', 'native_rp_delegation'].includes(attempt.inputRefs[0]?.kind))) denied('native_orchestration_budget_attempt_invalid');
            for (const [ordinal, row] of rows.entries()) if (row.orchestration.kind !== 'provider_send' || row.orchestration.ordinal !== ordinal
                || row.attemptId !== sendAttemptId(effectId, ordinal) || row.requestId !== effect.inputRef.requestId || (row.reservationId ?? null) !== (root.parentRef ? root.runId : null)
                || !['charged', 'unknown', 'settled'].includes(row.status)) denied('native_orchestration_budget_attempt_invalid');
            paid.add(attempt.nodeId);
        }
    }
    return paid;
}
