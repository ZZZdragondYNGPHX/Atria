import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { controlCommandId, controlRecordKey, readAttempt } from './controller-common.js';
import { readAttemptSettlement, SETTLED_ATTEMPT_STATUSES } from './attempt-settlement.js';
import { readFanoutFrame } from './fanout-controller.js';
import { joinIdForAttempt, decideJoinOutcome } from './join-controller.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { readEffect } from './effect-contracts.js';
import { readModelTerminalFact } from './model-port.js';
import { sessionAgentGraphProfile } from './session-agent-graph-profile.js';
import { assertAudienceRunCapture } from './audience-source-contracts.js';

const same = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid original Session Fanout Join facts'); };

async function control(tx, handle, root, kind, identity, detail, field, value) {
    const commandId = controlCommandId(kind, identity), operation = 'runs.control.' + kind;
    const command = (await checkedRecord(tx, { kind: K.orchestrationCommand, handle, commandId }))?.doc;
    if (!command || command.commandId !== commandId || command.operation !== operation || command.target !== root.runId
        || command.payloadHash !== hash({ operation, body: { runId: root.runId, operation: kind, detail } })
        || !same(command.outcome?.[field], value)) invalid();
}

async function cancellationFact(tx, handle, root, frame, joinId, item, failedAttemptId) {
    const detail = { fanoutAttemptId: frame.fanoutAttemptId, failedAttemptId, joinId, attemptId: item.attempt.attemptId };
    const commandId = controlCommandId('fanout.cancelPending', { runId: root.runId, ...detail }), operation = 'runs.control.attempt.settle';
    const command = (await checkedRecord(tx, { kind: K.orchestrationCommand, handle, commandId }))?.doc;
    return !!command && command.commandId === commandId && command.operation === operation && command.target === root.runId
        && command.payloadHash === hash({ operation, body: { runId: root.runId, operation: 'attempt.settle', detail } })
        && same(command.outcome?.attemptReceipt, item.completed);
}

async function edgeFact(tx, handle, root, edge, producer, target, decision, refs) {
    const receiptId = 'oreceipt_' + hash({ kind: 'edge_admission', runId: root.runId, edgeId: edge.edgeId,
        producerAttemptId: producer.attemptId, nodeAttemptId: target.attemptId }).slice(0, 32);
    const fact = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId)))?.doc;
    if (!fact || !refs.includes(receiptId) || fact.receiptKind !== 'edge_admission' || fact.runId !== root.runId || fact.epoch !== producer.epoch
        || fact.sourceBindingDigest !== root.sourceBinding.bindingDigest || fact.edgeId !== edge.edgeId || fact.producerAttemptId !== producer.attemptId
        || fact.nodeAttemptId !== target.attemptId || fact.decisionSeq !== decision || fact.edgeVisit !== 1 || fact.loopIteration !== 0
        || root.progress.edgeVisitCounts[edge.edgeId] !== 1) invalid();
}

/** Read original immutable control/Model facts. This grants no Source,
 * recipient, Scheduler or budget permission. */
export async function readSessionFanoutCompletion(tx, handle, root, joinAttemptId) {
    if (!root.graph.nodes.some(node => node.kind === 'fanout')) return null;
    const plan = await readPlanRevision(tx, handle, root.planRef), joined = (await readAttempt(tx, handle, root, joinAttemptId)).doc;
    const profile = sessionAgentGraphProfile(plan)?.fanouts.find(group => group.join.nodeId === joined.nodeId);
    if (!profile || !same(root.graph, plan.definition) || root.graphRevision !== 0 || root.parentRef !== null || root.sourceBinding.sourceAuthority !== 'native_session') invalid();
    const attempts = [];
    for (const id of root.attemptRefs) attempts.push((await readAttempt(tx, handle, root, id)).doc);
    const one = nodeId => { const found = attempts.filter(attempt => attempt.nodeId === nodeId); if (found.length !== 1) invalid(); return found[0]; };
    const fanout = one(profile.fanout.nodeId), join = one(profile.join.nodeId), frame = await readFanoutFrame(tx, handle, root, fanout.attemptId);
    const joinId = joinIdForAttempt(join.attemptId), barrierRow = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'join', 'barrier:' + joinId));
    const receipt = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'join', joinId)))?.doc;
    if (!frame || !barrierRow || !receipt) return null;
    const barrier = barrierRow.doc;
    assertObject(receipt, ['schemaVersion', 'joinId', 'runId', 'nodeAttemptId', 'epoch', 'graphRevision', 'memberAttemptIds', 'edgeAdmissionRefs', 'memberReceiptRefs',
        'barrierDigest', 'policy', 'quorum', 'deadlineAt', 'cutoffSeq', 'decisionSeq', 'acceptedResultRefs', 'excluded', 'reasons', 'outcome'], 'Session JoinReceipt');
    const settlement = await readAttemptSettlement(tx, handle, root, join);
    const members = [], graphResults = [], providerEffects = [], cancellations = [];
    for (const node of profile.branches) {
        const attempt = one(node.nodeId);
        const completed = SETTLED_ATTEMPT_STATUSES.includes(attempt.status) ? await readAttemptSettlement(tx, handle, root, attempt) : null;
        let result = null;
        if (attempt.status === 'completed') {
            if (attempt.resultRefs.length !== 1) invalid();
            result = await readGraphNodeResult(tx, handle, root, attempt.resultRefs[0].resultId);
            if (!result || result.producer.attemptId !== attempt.attemptId) invalid();
            graphResults.push(result);
        } else if (attempt.resultRefs.length) invalid();
        if (attempt.effectRefs.length > 1) invalid();
        const intent = attempt.effectRefs.length ? (await readEffect(tx, handle, root, attempt.effectRefs[0])).doc : null;
        let terminal = null;
        if (intent) {
            if (intent.nodeAttemptId !== attempt.attemptId || intent.capability !== 'generation.send' || intent.epoch !== attempt.epoch) invalid();
            providerEffects.push(intent.effectId);
            terminal = await readModelTerminalFact(handle, tx, root, intent);
        }
        if (completed && !result && (completed.outcome === 'failed' ? terminal?.kind !== 'rejected' || terminal.outcome !== 'failed'
            || !same(completed.effectReceiptRefs, [terminal.receiptRef.receiptId])
            : intent ? terminal?.kind !== 'late_response' || !same(completed.effectReceiptRefs, [terminal.receiptRef.receiptId])
                : completed.outcome !== 'cancelled' || (completed.reasonCode === 'fanout_fail_fast' ? frame.failurePolicy !== 'fail_fast'
                    : completed.reasonCode !== 'join_member_excluded' || completed.decisionSeq <= receipt.decisionSeq
                        || !receipt.excluded.some(item => item.nodeAttemptId === attempt.attemptId)))) invalid();
        if (completed?.outcome === 'cancelled' && !intent) cancellations.push({ attempt, completed });
        const input = attempt.inputRefs[0], pin = plan.dependencyPins.find(pin => pin.pinId === node.policy.agentPinId);
        if (attempt.inputRefs.length !== 1 || input.kind !== 'native_turn_intent' || input.nodeId !== node.nodeId || input.role !== 'narrator'
            || !same(input.planRef, root.planRef) || !['sessionId', 'branchId', 'revisionId'].every(field => input.sourceRef[field] === root.sourceBinding.sourceRef[field]) || !same(input.routeRef, pin.resourceRef)
            || !same(input.acceptedGraphResultRefs, []) || input.fanoutAttemptId !== fanout.attemptId || !same(attempt.budgetRef, root.budgetAuthorityRef)
            || attempt.epoch !== join.epoch || completed && completed.decisionSeq <= barrier.frozenSeq) invalid();
        assertAudienceRunCapture(root, node, plan.dependencyPins, input);
        const atCutoff = completed && completed.decisionSeq <= receipt.cutoffSeq ? completed : null;
        members.push({ attempt, receipt: atCutoff, result, terminal,
            valid: !!(atCutoff && result && atCutoff.createdAt <= barrier.deadlineAt) });
    }
    members.sort((a, b) => a.attempt.attemptId.localeCompare(b.attempt.attemptId));
    for (const item of cancellations) {
        let valid = false;
        if (item.completed.reasonCode === 'join_member_excluded') valid = await cancellationFact(tx, handle, root, frame, joinId, item, null);
        else for (const member of members) {
            if (member.receipt?.outcome === 'failed' && member.receipt.decisionSeq < item.completed.decisionSeq
                && await cancellationFact(tx, handle, root, frame, null, item, member.attempt.attemptId)) { valid = true; break; }
        }
        if (!valid) invalid();
    }
    const ids = members.map(item => item.attempt.attemptId), expectedBranches = members.map(item => ({ entryAttemptId: item.attempt.attemptId,
        memberAttemptIds: [item.attempt.attemptId], scopeNodeIds: [item.attempt.nodeId] }))
        .sort((a, b) => a.entryAttemptId.localeCompare(b.entryAttemptId));
    const decision = decideJoinOutcome({ policy: barrier.policy, quorum: barrier.quorum, allowPartial: root.graph.outputContract.allowPartial,
        deadlineAt: barrier.deadlineAt, now: settlement.createdAt, members });
    const refs = decision.selected.flatMap(item => item.receipt.resultRefs);
    const selectedIds = new Set(decision.selected.map(item => item.attempt.attemptId));
    const excluded = members.filter(item => !selectedIds.has(item.attempt.attemptId)).map(item => ({ nodeAttemptId: item.attempt.attemptId,
        reasonCode: !item.receipt ? 'unsettled_at_cutoff' : item.receipt.createdAt > barrier.deadlineAt ? 'after_deadline'
            : !item.valid && ['completed', 'partial'].includes(item.receipt.outcome) ? 'result_unavailable' : item.receipt.outcome === 'completed' ? 'not_selected' : item.receipt.outcome }));
    const receiptRefs = members.filter(item => item.receipt).sort((a, b) => a.receipt.decisionSeq - b.receipt.decisionSeq || a.attempt.attemptId.localeCompare(b.attempt.attemptId)).map(item => item.receipt.receiptId);
    if (fanout.status !== receipt.outcome || join.status !== receipt.outcome || fanout.epoch !== join.epoch || join.epoch > root.epoch
        || !same(fanout.budgetRef, root.budgetAuthorityRef) || !same(join.budgetRef, root.budgetAuthorityRef)
        || !same(frame.parentBudgetRef, root.budgetAuthorityRef) || !same(frame.branches, expectedBranches)
        || frame.sourceBindingDigest !== root.sourceBinding.bindingDigest || frame.epoch !== join.epoch
        || frame.maxConcurrency !== Math.min(profile.fanout.policy.maxConcurrency, root.limits.maxConcurrency) || frame.failurePolicy !== profile.fanout.policy.failurePolicy
        || barrier.joinId !== joinId || barrier.runId !== root.runId || barrier.nodeAttemptId !== join.attemptId || barrier.fanoutAttemptId !== fanout.attemptId
        || barrier.sourceBindingDigest !== root.sourceBinding.bindingDigest || !same(barrier.parentBudgetRef, root.budgetAuthorityRef)
        || !same(barrier.fanoutFrameRef, { receiptId: frame.receiptId, integrity: hash(frame) }) || !same(barrier.memberAttemptIds, ids)
        || receipt.schemaVersion !== 1 || receipt.joinId !== joinId || receipt.runId !== root.runId || receipt.nodeAttemptId !== join.attemptId
        || receipt.epoch !== join.epoch || receipt.graphRevision !== 0 || receipt.policy !== profile.join.policy.strategy || receipt.quorum !== profile.join.policy.quorum
        || receipt.barrierDigest !== barrierRow.integrity || receipt.deadlineAt !== barrier.deadlineAt || receipt.cutoffSeq + 1 !== receipt.decisionSeq
        || receipt.decisionSeq > root.eventSeq || receipt.outcome !== decision.outcome || decision.outcome === null
        || !same(receipt.memberAttemptIds, ids) || !same(receipt.memberReceiptRefs, receiptRefs)
        || !same(receipt.acceptedResultRefs, refs) || !same(join.resultRefs, refs) || !same(receipt.excluded, excluded)
        || !same(receipt.reasons, decision.reason === null ? [] : [decision.reason])
        || frame.edgeAdmissionRefs.length !== members.length || receipt.edgeAdmissionRefs.length !== members.length) invalid();
    for (const attempt of [fanout, join]) {
        const input = attempt.inputRefs[0];
        if (attempt.inputRefs.length !== 1 || input.kind !== 'native_session_graph_control' || input.nodeId !== attempt.nodeId
            || !same(input.planRef, root.planRef) || !same(input.sourceRef, root.sourceBinding.sourceRef)
            || attempt.inputDigest !== hash(attempt.inputRefs) || attempt.effectiveGrantDigest !== hash({ handle, source: root.sourceBinding, inputRefs: attempt.inputRefs })) invalid();
    }
    const fanoutSettlement = await readAttemptSettlement(tx, handle, root, fanout);
    if (settlement.decisionSeq !== receipt.decisionSeq || !same(settlement.resultRefs, refs) || settlement.effectReceiptRefs.length || join.effectRefs.length
        || fanout.effectRefs.length || fanout.resultRefs.length || fanoutSettlement.reasonCode !== 'session_fanout_join_' + receipt.outcome
        || fanoutSettlement.decisionSeq <= receipt.decisionSeq) invalid();
    for (const item of members) {
        await edgeFact(tx, handle, root, profile.transfers.find(edge => edge.to.nodeId === item.attempt.nodeId), fanout, item.attempt, frame.decisionSeq, frame.edgeAdmissionRefs);
        await edgeFact(tx, handle, root, profile.members.find(edge => edge.from.nodeId === item.attempt.nodeId), item.attempt, join, receipt.decisionSeq, receipt.edgeAdmissionRefs);
    }
    await control(tx, handle, root, 'fanout.freeze', frame.receiptId, { fanoutAttemptId: fanout.attemptId, branches: frame.branches }, 'fanoutFrame', frame);
    await control(tx, handle, root, 'join.freeze', joinId, { fanoutAttemptId: fanout.attemptId, nodeAttemptId: join.attemptId, memberAttemptIds: ids }, 'joinBarrier', barrier);
    await control(tx, handle, root, 'join.settle', joinId, { joinId }, 'joinReceipt', receipt);
    return { profile, producer: join, receipt: { ...receipt, receiptId: settlement.receiptId }, settlement, joinReceipt: receipt, fanout, frame, barrier,
        members: decision.selected.map(item => item.result), allMembers: members, graphResults, providerEffects };
}
