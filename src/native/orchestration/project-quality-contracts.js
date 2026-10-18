import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { controlRecordKey, readAttempt, readGraphReviewReceipt } from './controller-common.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { PROJECT_QUALITY_REASONS, projectQualityProfile } from './project-quality-profile.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { readOriginalProjectTask } from './project-tool-receipts.js';
import { localWorkAttemptId } from './budget-port.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid original Project quality facts'); };
export const projectQualityReceiptId = (runId, attemptId) => 'oreceipt_' + hash({ kind: 'project_graph_review_model', runId, attemptId }).slice(0, 32);

export async function readProjectQualityReview(tx, handle, root, attemptId) {
    if (root.sourceBinding.sourceAuthority !== 'project') invalid();
    const { doc: producer } = await readAttempt(tx, handle, root, attemptId), receiptId = projectQualityReceiptId(root.runId, attemptId);
    const receipt = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId)))?.doc;
    if (!receipt) return null;
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'producerAttemptId', 'sourceBindingDigest', 'grantDigest',
        'modelEffectId', 'modelReceiptRef', 'modelPayloadHash', 'responseText', 'reviewReceiptRef', 'reviewIntegrity', 'localWork', 'decisionSeq', 'createdAt'], 'Project quality receipt');
    const review = await readGraphReviewReceipt(tx, handle, root, producer), settlement = await readAttemptSettlement(tx, handle, root, producer);
    const intent = (await readEffect(tx, handle, root, receipt.modelEffectId)).doc, model = await readModelCompletionReceipt(handle, tx, root, intent);
    let response;
    try { response = JSON.parse(receipt.responseText); } catch { invalid(); }
    assertObject(response, ['decision', 'reasonCode'], 'Project quality response');
    if (receipt.schemaVersion !== 1 || receipt.receiptKind !== 'project_graph_review_model' || receipt.receiptId !== receiptId || receipt.runId !== root.runId
        || receipt.producerAttemptId !== attemptId || producer.status !== 'completed' || producer.epoch !== receipt.epoch || receipt.epoch > root.epoch
        || producer.sourceBindingDigest !== root.sourceBinding.bindingDigest || receipt.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || receipt.grantDigest !== producer.effectiveGrantDigest || !equal(producer.effectRefs, [receipt.modelEffectId]) || producer.resultRefs.length
        || !review || hash(review) !== receipt.reviewIntegrity || !equal(receipt.reviewReceiptRef, { runId: root.runId, receiptId: review.receiptId })
        || !equal(response, { decision: review.decision, reasonCode: review.reasonCode }) || review.decisionSeq >= receipt.decisionSeq
        || !PROJECT_QUALITY_REASONS.includes(response.reasonCode) || (response.decision === 'approve') !== (response.reasonCode === 'quality_ready')
        || intent.nodeAttemptId !== attemptId || intent.epoch !== producer.epoch || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest || intent.grantDigest !== receipt.grantDigest
        || !model || !equal(model.receiptRef, receipt.modelReceiptRef) || hash({ text: receipt.responseText, toolCalls: [] }) !== receipt.modelPayloadHash
        || model.observation.dispatchEvidence.reference.resultOutputType !== 'json' || model.observation.dispatchEvidence.reference.resultPayloadHash !== receipt.modelPayloadHash
        || !equal(settlement.effectReceiptRefs, [receipt.modelReceiptRef.receiptId]) || settlement.reasonCode !== 'project_graph_review_decided'
        || settlement.decisionSeq !== receipt.decisionSeq || settlement.createdAt !== receipt.createdAt || receipt.decisionSeq > root.eventSeq
        || review.evidenceRefs.length !== 1 || review.evidenceRefs[0].runId !== root.runId || review.targetAttemptIds.length !== 1
        || !producer.inputRefs.some(ref => equal(ref, review.evidenceRefs[0]))) invalid();
    const draft = await readGraphNodeResult(tx, handle, root, review.evidenceRefs[0].resultId);
    if (!draft || draft.producer.attemptId !== review.targetAttemptIds[0] || !draft.record.envelope.audienceConstraint.nodeIds.includes(producer.nodeId)) invalid();
    const input = intent.inputRef;
    if (input.kind !== 'native_project_intent' || input.nodeId !== producer.nodeId || !equal(input.planRef, root.planRef) || !equal(input.sourceRef, root.sourceBinding.sourceRef)
        || !equal(input.acceptedGraphResultRefs, review.evidenceRefs) || !equal(producer.inputRefs, [input, ...review.evidenceRefs])) invalid();
    const edge = root.graph.edges.find(item => item.from.nodeId === draft.producer.nodeId && item.to.nodeId === producer.nodeId);
    if (!edge) invalid();
    const bindings = [{ edgeId: edge.edgeId, producerAttemptId: draft.producer.attemptId }];
    const traversalId = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: null }).slice(0, 32);
    await assertOutputTransition(tx, handle, root, { published: draft, output: producer,
        receipt: { decisionSeq: receipt.decisionSeq, traversalReceiptRef: { runId: root.runId, receiptId: traversalId } } });
    await assertProjectControlWork(tx, handle, root, receipt.modelEffectId, receipt.localWork);
    return { receipt, review, producer, settlement, draft };
}

/** Original Task-bank facts shared by pure Project control producers. */
export async function assertProjectControlWork(tx, handle, root, effectId, jobs) {
    const task = await readOriginalProjectTask(tx, handle, root.sourceBinding.sourceRef);
    if (!Array.isArray(jobs) || jobs.length !== 2) invalid();
    for (const [index, job] of jobs.entries()) {
        const row = task?.compute?.localWork.find(item => item.attemptId === job.attemptId);
        if (job.kind !== ['graph_control_parse', 'graph_control_adopt'][index] || !row || hash(row) !== job.rowHash || row.kind !== job.kind
            || (row.reservationId ?? null) !== (root.parentRef ? root.runId : null)
            || row.targetFingerprint !== job.targetFingerprint || row.attemptId !== localWorkAttemptId(effectId, job.ordinal)
            || !equal(row.orchestration, { kind: 'local_work', effectId: effectId, ordinal: job.ordinal }) || row.status !== 'settled' || row.usage?.outcome !== 'completed') invalid();
    }
}

/** Exact live graph recipients reprove the approved draft before compiling it.
 * Approval remains advisory quality evidence, never a domain Effect approval. */
export async function readProjectQualityApproval(tx, handle, root, approval, recipient = null) {
    assertObject(approval, ['draftResultRef', 'reviewAttemptId', 'reviewReceiptRef', 'modelReviewReceiptRef'], 'Project quality approval');
    const reviewed = await readProjectQualityReview(tx, handle, root, approval.reviewAttemptId);
    if (!reviewed || reviewed.review.decision !== 'approve' || !equal(approval.draftResultRef, reviewed.draft.receipt.resultRef)
        || !equal(approval.reviewReceiptRef, reviewed.receipt.reviewReceiptRef)
        || !equal(approval.modelReviewReceiptRef, { runId: root.runId, receiptId: reviewed.receipt.receiptId })) invalid();
    if (recipient) await readGraphNodeResult(tx, handle, root, approval.draftResultRef.resultId, { recipient });
    return reviewed;
}

export async function assertProjectQualityRound(tx, handle, root, attempt, input, round) {
    if (input.controlGraph) return false;
    const profile = !root.graph.nodes.some(node => node.kind === 'planner') && root.graph.nodes.some(node => node.kind === 'review') ? projectQualityProfile(await readPlanRevision(tx, handle, root.planRef)) : null;
    if (!profile) return false;
    const reviewed = await readProjectQualityApproval(tx, handle, root, input.qualityApproval);
    if (attempt.nodeId !== profile.worker.nodeId || !attempt.inputRefs.some(ref => equal(ref, input.qualityApproval.draftResultRef))
        || !attempt.inputRefs.some(ref => equal(ref, input.qualityApproval.modelReviewReceiptRef))) invalid();
    if (round === 0) {
        const bindings = [{ edgeId: profile.transfer.edgeId, producerAttemptId: reviewed.draft.producer.attemptId },
            { edgeId: profile.gate.edgeId, producerAttemptId: reviewed.producer.attemptId }].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
        const traversalId = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: null }).slice(0, 32);
        await assertOutputTransition(tx, handle, root, { published: reviewed.draft, output: attempt, additionalProducers: [reviewed],
            receipt: { decisionSeq: root.eventSeq + 1, traversalReceiptRef: { runId: root.runId, receiptId: traversalId } } });
    }
    return true;
}
