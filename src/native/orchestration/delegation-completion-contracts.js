import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject, assertCounter } from '../../../public/shared/native-orchestration-contracts.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { controlCommandId, controlRecordKey, readAttempt } from './controller-common.js';
import { assertRunRoot, childBudgetReceiptId, TREE_LOGICAL_COUNTERS } from './run-repository.js';
import { delegatedRunId } from './delegate-controller.js';
import { handoffReceiptId, readHandoff } from './handoff-contracts.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';
import { readAttemptSettlement, SETTLED_ATTEMPT_STATUSES } from './attempt-settlement.js';

const equal = (left, right) => hash(left) === hash(right);
const invalid = () => { throw new TypeError('Invalid delegation completion facts'); };
const runKey = (handle, runId) => ({ kind: K.orchestrationRun, handle, runId });
const receiptRef = (runId, receipt) => ({ runId, receiptId: receipt.receiptId });

async function storedRoot(tx, handle, supplied) {
    assertRunRoot(supplied, handle);
    const actual = (await checkedRecord(tx, runKey(handle, supplied.runId)))?.doc;
    if (!actual || !equal(actual, supplied)) invalid();
    return actual;
}

async function commandFact(tx, handle, run, operation, identity, detail) {
    const commandId = controlCommandId(operation, identity);
    const command = (await checkedRecord(tx, { kind: K.orchestrationCommand, handle, commandId }))?.doc;
    if (!command) return null;
    assertObject(command, ['schemaVersion', 'commandId', 'operation', 'target', 'payloadHash', 'outcome'], 'Delegation command');
    if (command.schemaVersion !== 1 || command.commandId !== commandId || command.operation !== 'runs.control.' + operation
        || command.target !== run.runId || command.payloadHash !== hash({ operation: command.operation,
        body: { runId: run.runId, operation, detail } })) invalid();
    const versions = command.outcome?.versions;
    assertObject(versions, ['epoch', 'stateVersion', 'graphRevision'], 'Delegation command versions');
    for (const field of Object.keys(versions)) {
        assertCounter(versions[field], field);
        if (versions[field] > run[field]) invalid();
    }
    if (command.outcome.runId !== run.runId) invalid();
    return command;
}

async function eventFact(tx, handle, root, receipt, { type, epoch, graphRevision, reasonCode = null }) {
    assertCounter(receipt.decisionSeq, 'delegation decisionSeq', 1);
    assertCounter(receipt.createdAt, 'delegation createdAt');
    const event = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'event', 'event:' + receipt.decisionSeq)))?.doc;
    if (!event || receipt.decisionSeq > root.eventSeq || !equal(event, { schemaVersion: 1, runId: root.runId,
        eventSeq: receipt.decisionSeq, epoch, graphRevision, type, reasonCode, createdAt: receipt.createdAt })) invalid();
}

async function readCompletion(tx, handle, suppliedParent, suppliedChild, seen) {
    const parent = await storedRoot(tx, handle, suppliedParent), child = await storedRoot(tx, handle, suppliedChild);
    if (seen.has(child.runId)) invalid();
    seen.add(child.runId);
    const ref = child.parentRef;
    if (!ref || ref.parentRunId !== parent.runId || child.rootRunId !== parent.rootRunId
        || child.runId !== delegatedRunId(parent.runId, ref.nodeAttemptId, ref.delegationId)
        || ref.parentEpoch > parent.epoch || ref.depth !== (parent.parentRef?.depth ?? 0) + 1
        || !equal(child.ownerRef, parent.ownerRef) || !equal(child.sourceBinding, parent.sourceBinding)
        || !equal(child.budgetAuthorityRef, parent.budgetAuthorityRef) || !equal(child.retentionPolicyRef, parent.retentionPolicyRef)
        || !equal(child.sourceBinding.budgetAuthorityRef, child.budgetAuthorityRef)
        || child.hostBootId !== parent.hostBootId || child.hostGeneration !== parent.hostGeneration) invalid();
    const parentAttempt = (await readAttempt(tx, handle, parent, ref.nodeAttemptId)).doc;
    if (parentAttempt.inputState !== 'prepared' || parentAttempt.epoch !== ref.parentEpoch
        || parentAttempt.sourceBindingDigest !== parent.sourceBinding.bindingDigest || !equal(parentAttempt.budgetRef, parent.budgetAuthorityRef)
        || parentAttempt.startedAt === null || parentAttempt.startedAt > child.createdAt
        || parentAttempt.endedAt !== null && parentAttempt.endedAt < child.createdAt) invalid();
    if (SETTLED_ATTEMPT_STATUSES.includes(parentAttempt.status)) {
        const settlement = await readAttemptSettlement(tx, handle, parent, parentAttempt);
        if (settlement.createdAt < child.createdAt) invalid();
    }
    const detail = { parentAttemptId: ref.nodeAttemptId, delegationId: ref.delegationId, childPlanRef: child.planRef,
        inputRefs: ref.inputRefs, inputDigest: ref.inputDigest, effectiveGrantDigest: ref.effectiveGrantDigest,
        returnContract: ref.returnContract, budgetCeiling: ref.budgetCeiling };
    const delegate = await commandFact(tx, handle, parent, 'run.delegate', child.runId, detail);
    const handedOff = await commandFact(tx, handle, parent, 'run.handoff', child.runId, detail);
    if (Boolean(delegate) === Boolean(handedOff)) invalid();
    const mode = handedOff ? 'handoff' : 'delegate', command = handedOff ?? delegate;
    assertObject(command.outcome, ['runId', 'childRunId', 'delegationReceipt', ...handedOff ? ['handoffReceipt'] : [], 'versions'], 'Delegation outcome');
    const receiptId = 'oreceipt_' + hash({ kind: 'delegation', childRunId: child.runId }).slice(0, 32);
    const delegation = (await checkedRecord(tx, controlRecordKey(handle, parent.runId, 'receipt', receiptId)))?.doc;
    if (!delegation) invalid();
    assertObject(delegation, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'childRunId', 'parentRef', 'budgetCeiling',
        'sourceBindingDigest', 'authorityRef', 'decisionSeq', 'createdAt'], 'Delegation receipt');
    if (delegation.schemaVersion !== 1 || delegation.receiptKind !== 'delegation' || delegation.receiptId !== receiptId
        || delegation.runId !== parent.runId || delegation.childRunId !== child.runId || !equal(delegation.parentRef, ref)
        || !equal(delegation.budgetCeiling, ref.budgetCeiling) || delegation.sourceBindingDigest !== parent.sourceBinding.bindingDigest
        || !equal(delegation.authorityRef, parent.budgetAuthorityRef) || delegation.createdAt !== child.createdAt
        || !equal(command.outcome.delegationReceipt, delegation) || command.outcome.childRunId !== child.runId
        || command.outcome.versions.epoch !== ref.parentEpoch || command.outcome.versions.stateVersion !== delegation.decisionSeq
        || parentAttempt.graphRevision > command.outcome.versions.graphRevision) invalid();
    const parentPlan = await readPlanRevision(tx, handle, parent.planRef), childPlan = await readPlanRevision(tx, handle, child.planRef);
    const snapshot = await readTaskGraphRevision(tx, handle, parent, command.outcome.versions.graphRevision);
    await readTaskGraphRevision(tx, handle, child);
    const node = snapshot.graph.nodes.find(node => node.nodeId === parentAttempt.nodeId), definition = childPlan.definition;
    const allowed = parentPlan.dependencyPins.filter(pin => pin.port === 'plan' && node?.dependencyPinIds.includes(pin.pinId)
        && node.policy.allowedPlanPinIds?.includes(pin.pinId) && equal(pin.resourceRef, child.planRef) && pin.integrity === hash(childPlan));
    if (!node || !['agent', 'router', 'planner', 'judge', 'review'].includes(node.kind) || !node.capabilities.includes('agent.delegate') || !allowed.length
        || definition.outputContract.kind !== 'result' || !equal(ref.returnContract, definition.outputContract)
        || !equal(child.limits, definition.limits) || !equal(child.graph.outputContract, definition.outputContract)
        || !equal(child.graph.capabilityCeiling, definition.capabilityCeiling)
        || definition.capabilityCeiling.some(capability => !snapshot.graph.capabilityCeiling.includes(capability) || !node.capabilities.includes(capability))
        || Object.keys(definition.limits).some(field => definition.limits[field] > parent.limits[field])
        || ref.depth > parent.limits.maxDepth || ref.depth > definition.limits.maxDepth
        || TREE_LOGICAL_COUNTERS.some(field => ref.logicalCeiling[field] > parent.limits['max' + field[0].toUpperCase() + field.slice(1)]
            || parent.parentRef && ref.logicalCeiling[field] > parent.parentRef.logicalCeiling[field])) invalid();
    await eventFact(tx, handle, parent, delegation, { type: handedOff ? 'control_handed_off' : 'child_delegated',
        epoch: ref.parentEpoch, graphRevision: command.outcome.versions.graphRevision });
    const admission = (await checkedRecord(tx, controlRecordKey(handle, child.runId, 'event', 'event:0')))?.doc;
    if (!equal(admission, { schemaVersion: 1, runId: child.runId, eventSeq: 0, epoch: 0, graphRevision: 0,
        type: 'child_admitted_unfunded', reasonCode: 'original_reservation_unconfirmed', createdAt: delegation.createdAt })) invalid();
    let handoff = null;
    if (handedOff) {
        // Only the immutable parentRef supplies the historical epoch. Never
        // reconstruct an old Host from a receipt or treat this as resumption.
        handoff = await readHandoff(tx, handle, { ...parent, epoch: ref.parentEpoch }, parentAttempt, child);
        if (!equal(handoff, command.outcome.handoffReceipt) || handoff.decisionSeq !== delegation.decisionSeq
            || handoff.createdAt !== delegation.createdAt) invalid();
    } else if (await checkedRecord(tx, controlRecordKey(handle, parent.runId, 'receipt', handoffReceiptId(child.runId)))) invalid();
    const budgetId = childBudgetReceiptId(child.runId);
    const budgetReady = (await checkedRecord(tx, controlRecordKey(handle, child.runId, 'receipt', budgetId)))?.doc;
    const budgetCommand = await commandFact(tx, handle, child, 'run.childBudget', budgetId, {});
    if (!budgetReady && !budgetCommand) return null;
    if (!budgetReady || !budgetCommand) invalid();
    assertObject(budgetReady, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'reservationId', 'parentReservationId',
        'authorityRef', 'sourceBindingDigest', 'budgetCeilingDigest', 'decisionSeq', 'createdAt'], 'Child budget ready receipt');
    assertObject(budgetCommand.outcome, ['runId', 'childRunId', 'budgetReceipt', 'versions'], 'Child budget ready outcome');
    if (budgetReady.schemaVersion !== 1 || budgetReady.receiptKind !== 'child_budget_ready' || budgetReady.receiptId !== budgetId
        || budgetReady.runId !== child.runId || budgetReady.epoch !== 0 || budgetReady.epoch > child.epoch
        || budgetReady.reservationId !== child.runId || budgetReady.parentReservationId !== (parent.parentRef ? parent.runId : null)
        || !equal(budgetReady.authorityRef, child.budgetAuthorityRef) || budgetReady.sourceBindingDigest !== child.sourceBinding.bindingDigest
        || budgetReady.budgetCeilingDigest !== hash(ref.budgetCeiling) || budgetReady.createdAt < delegation.createdAt
        || !equal(budgetCommand.outcome.budgetReceipt, budgetReady) || budgetCommand.outcome.childRunId !== child.runId
        || budgetCommand.outcome.versions.epoch !== budgetReady.epoch || budgetCommand.outcome.versions.graphRevision !== 0
        || budgetCommand.outcome.versions.stateVersion !== budgetReady.decisionSeq) invalid();
    await eventFact(tx, handle, child, budgetReady, { type: 'child_budget_confirmed', epoch: budgetReady.epoch, graphRevision: 0 });
    if (parent.parentRef) {
        const ancestor = (await checkedRecord(tx, runKey(handle, parent.parentRef.parentRunId)))?.doc;
        if (!ancestor || !await readCompletion(tx, handle, ancestor, parent, seen)) invalid();
    } else if (parent.runId !== child.rootRunId) invalid();
    return { mode, parentAttempt, delegation, handoff, budgetReady,
        delegationReceiptRef: receiptRef(parent.runId, delegation), handoffReceiptRef: handoff ? receiptRef(parent.runId, handoff) : null,
        budgetReadyReceiptRef: receiptRef(child.runId, budgetReady) };
}

/** Original durable delegation facts only. No Model, Source, reservation,
 * Return, dispatch or parent-resumption authority is supplied by this reader. */
export function readDelegationCompletion(tx, handle, parent, child) {
    return readCompletion(tx, handle, parent, child, new Set());
}
