import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { controlCommandId, controlRecordKey, readAttempt } from './controller-common.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { readFanoutFrame } from './fanout-controller.js';
import { joinIdForAttempt } from './join-controller.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { rpFanoutProfile } from './rp-fanout-profile.js';

const same = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid original RP Fanout Join facts'); };

async function control(tx, handle, root, kind, identity, detail, field, value) {
    const commandId = controlCommandId(kind, identity), operation = 'runs.control.' + kind;
    const command = (await checkedRecord(tx, { kind: K.orchestrationCommand, handle, commandId }))?.doc;
    if (!command || command.commandId !== commandId || command.operation !== operation || command.target !== root.runId
        || command.payloadHash !== hash({ operation, body: { runId: root.runId, operation: kind, detail } })
        || !same(command.outcome?.[field], value)) invalid();
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
export async function readRpFanoutCompletion(tx, handle, root) {
    if (!root.graph.nodes.some(node => node.kind === 'fanout')) return null;
    const plan = await readPlanRevision(tx, handle, root.planRef), profile = rpFanoutProfile(plan);
    if (!profile || !same(root.graph, plan.definition) || root.graphRevision !== 0 || root.parentRef !== null || root.sourceBinding.sourceAuthority !== 'rp_chat') invalid();
    const attempts = [];
    for (const id of root.attemptRefs) attempts.push((await readAttempt(tx, handle, root, id)).doc);
    const one = nodeId => { const found = attempts.filter(attempt => attempt.nodeId === nodeId); if (found.length !== 1) invalid(); return found[0]; };
    const fanout = one(profile.fanout.nodeId), join = one(profile.join.nodeId), frame = await readFanoutFrame(tx, handle, root, fanout.attemptId);
    const joinId = joinIdForAttempt(join.attemptId), barrierRow = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'join', 'barrier:' + joinId));
    const receipt = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'join', joinId)))?.doc;
    if (!frame || !barrierRow || !receipt) return null;
    const barrier = barrierRow.doc;
    assertObject(receipt, ['schemaVersion', 'joinId', 'runId', 'nodeAttemptId', 'epoch', 'graphRevision', 'memberAttemptIds', 'edgeAdmissionRefs', 'memberReceiptRefs',
        'barrierDigest', 'policy', 'quorum', 'deadlineAt', 'cutoffSeq', 'decisionSeq', 'acceptedResultRefs', 'excluded', 'reasons', 'outcome'], 'RP JoinReceipt');
    const members = [];
    for (const node of profile.branches) {
        const attempt = one(node.nodeId);
        if (attempt.status !== 'completed' || attempt.resultRefs.length !== 1) invalid();
        const result = await readGraphNodeResult(tx, handle, root, attempt.resultRefs[0].resultId);
        if (!result || result.producer.attemptId !== attempt.attemptId) invalid();
        const input = attempt.inputRefs[0], pin = plan.dependencyPins.find(pin => pin.pinId === node.policy.agentPinId);
        if (attempt.inputRefs.length !== 1 || input.kind !== 'native_rp_intent' || input.nodeId !== node.nodeId || input.role !== 'narrator'
            || !same(input.planRef, root.planRef) || !same(input.sourceRef, root.sourceBinding.sourceRef) || !same(input.routeRef, pin.resourceRef)
            || Object.hasOwn(input, 'acceptedGraphResultRefs') || input.fanoutAttemptId !== fanout.attemptId || !same(attempt.budgetRef, root.budgetAuthorityRef)
            || attempt.epoch !== join.epoch || result.settlement.decisionSeq <= barrier.frozenSeq || result.settlement.createdAt > barrier.deadlineAt) invalid();
        members.push(result);
    }
    members.sort((a, b) => a.settlement.decisionSeq - b.settlement.decisionSeq || a.producer.attemptId.localeCompare(b.producer.attemptId));
    const ids = members.map(item => item.producer.attemptId).sort(), refs = members.map(item => item.receipt.resultRef);
    const expectedBranches = members.map(item => ({ entryAttemptId: item.producer.attemptId, memberAttemptIds: [item.producer.attemptId], scopeNodeIds: [item.producer.nodeId] }))
        .sort((a, b) => a.entryAttemptId.localeCompare(b.entryAttemptId));
    if (fanout.status !== 'completed' || join.status !== 'completed' || fanout.epoch !== join.epoch || join.epoch > root.epoch
        || !same(fanout.budgetRef, root.budgetAuthorityRef) || !same(join.budgetRef, root.budgetAuthorityRef)
        || !same(frame.parentBudgetRef, root.budgetAuthorityRef) || !same(frame.branches, expectedBranches)
        || frame.sourceBindingDigest !== root.sourceBinding.bindingDigest || frame.epoch !== join.epoch
        || frame.maxConcurrency !== Math.min(profile.fanout.policy.maxConcurrency, root.limits.maxConcurrency) || frame.failurePolicy !== 'continue'
        || barrier.joinId !== joinId || barrier.runId !== root.runId || barrier.nodeAttemptId !== join.attemptId || barrier.fanoutAttemptId !== fanout.attemptId
        || barrier.sourceBindingDigest !== root.sourceBinding.bindingDigest || !same(barrier.parentBudgetRef, root.budgetAuthorityRef)
        || !same(barrier.fanoutFrameRef, { receiptId: frame.receiptId, integrity: hash(frame) }) || !same(barrier.memberAttemptIds, ids)
        || receipt.schemaVersion !== 1 || receipt.joinId !== joinId || receipt.runId !== root.runId || receipt.nodeAttemptId !== join.attemptId
        || receipt.epoch !== join.epoch || receipt.graphRevision !== 0 || receipt.policy !== 'all-success' || receipt.quorum !== profile.join.policy.quorum
        || receipt.barrierDigest !== barrierRow.integrity || receipt.deadlineAt !== barrier.deadlineAt || receipt.cutoffSeq + 1 !== receipt.decisionSeq
        || receipt.decisionSeq > root.eventSeq || receipt.decisionSeq <= members.at(-1).settlement.decisionSeq || receipt.outcome !== 'completed'
        || !same(receipt.memberAttemptIds, ids) || !same(receipt.memberReceiptRefs, members.map(item => item.settlement.receiptId))
        || !same(receipt.acceptedResultRefs, refs) || !same(join.resultRefs, refs) || receipt.excluded.length || receipt.reasons.length
        || frame.edgeAdmissionRefs.length !== members.length || receipt.edgeAdmissionRefs.length !== members.length) invalid();
    const settlement = await readAttemptSettlement(tx, handle, root, join), fanoutSettlement = await readAttemptSettlement(tx, handle, root, fanout);
    if (settlement.decisionSeq !== receipt.decisionSeq || !same(settlement.resultRefs, refs) || settlement.effectReceiptRefs.length || join.effectRefs.length
        || fanout.effectRefs.length || fanout.resultRefs.length || fanoutSettlement.reasonCode !== 'rp_fanout_join_completed'
        || fanoutSettlement.decisionSeq <= receipt.decisionSeq) invalid();
    for (const item of members) {
        await edgeFact(tx, handle, root, profile.transfers.find(edge => edge.to.nodeId === item.producer.nodeId), fanout, item.producer, frame.decisionSeq, frame.edgeAdmissionRefs);
        await edgeFact(tx, handle, root, profile.members.find(edge => edge.from.nodeId === item.producer.nodeId), item.producer, join, receipt.decisionSeq, receipt.edgeAdmissionRefs);
    }
    await control(tx, handle, root, 'fanout.freeze', frame.receiptId, { fanoutAttemptId: fanout.attemptId, branches: frame.branches }, 'fanoutFrame', frame);
    await control(tx, handle, root, 'join.freeze', joinId, { fanoutAttemptId: fanout.attemptId, nodeAttemptId: join.attemptId, memberAttemptIds: ids }, 'joinBarrier', barrier);
    await control(tx, handle, root, 'join.settle', joinId, { joinId }, 'joinReceipt', receipt);
    return { profile, producer: join, receipt: { ...receipt, receiptId: settlement.receiptId }, settlement, joinReceipt: receipt, fanout, frame, barrier, members };
}
