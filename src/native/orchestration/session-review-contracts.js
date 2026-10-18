import { assertAudienceRunCapture } from './audience-source-contracts.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { controlRecordKey, readAttempt, readGraphReviewReceipt, readAttemptInvalidation } from './controller-common.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';
import { RP_REVIEW_REASON_CODES } from './rp-review-profile.js';
import { assertNativeId } from '../identity.js';
import { readGraphReviewCompletion, readReviewablePlannerCompletion } from './graph-review-completion.js';
import { assertSessionControlWork, readSessionPlannerCompletion } from './session-planner-contracts.js';
import { readSessionJudgeCompletion } from './session-judge-contracts.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid Session Review completion facts'); };
export const sessionReviewModelReceiptId = (runId, attemptId) => 'oreceipt_' + hash({ kind: 'session_graph_review_model', runId, attemptId }).slice(0, 32);
export function parseSessionReview(text) {
    const value = JSON.parse(text); assertObject(value, ['decision', 'reasonCode'], 'Session Review');
    if (!['approve', 'rerun'].includes(value.decision) || !RP_REVIEW_REASON_CODES.includes(value.reasonCode)
        || (value.decision === 'approve') !== (value.reasonCode === 'quality_ready')) invalid();
    return value;
}

/** Original Model/Review/Attempt facts only; this grants no current read or redo. */
async function readLegacySessionReviewCompletion(tx, handle, root, attemptId) {
    const id = sessionReviewModelReceiptId(root.runId, attemptId), stored = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', id));
    if (!stored) return null;
    const receipt = stored.doc;
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'producerAttemptId', 'sourceBindingDigest', 'grantDigest',
        'modelEffectId', 'modelReceiptRef', 'modelPayloadHash', 'responseText', 'reviewReceiptRef', 'reviewIntegrity', 'decisionSeq', 'createdAt'], 'Session Review Model receipt');
    const producer = (await readAttempt(tx, handle, root, attemptId)).doc, review = await readGraphReviewReceipt(tx, handle, root, producer);
    const intent = (await readEffect(tx, handle, root, receipt.modelEffectId)).doc, model = await readModelCompletionReceipt(handle, tx, root, intent);
    const settlement = await readAttemptSettlement(tx, handle, root, producer), parsed = parseSessionReview(receipt.responseText);
    const input = intent.inputRef, plan = await readPlanRevision(tx, handle, root.planRef);
    const node = root.graph.nodes.find(node => node.nodeId === producer.nodeId), pin = plan.dependencyPins.find(pin => pin.pinId === node.policy.audiencePinId);
    if (root.sourceBinding.sourceAuthority !== 'native_session' || receipt.schemaVersion !== 1 || receipt.receiptKind !== 'session_graph_review_model'
        || receipt.receiptId !== id || receipt.runId !== root.runId || receipt.epoch !== producer.epoch || receipt.epoch > root.epoch
        || receipt.producerAttemptId !== attemptId || producer.status !== 'completed' || root.graph.nodes.find(node => node.nodeId === producer.nodeId)?.kind !== 'review'
        || receipt.sourceBindingDigest !== root.sourceBinding.bindingDigest || receipt.grantDigest !== producer.effectiveGrantDigest
        || !equal(producer.effectRefs, [receipt.modelEffectId]) || !equal(producer.resultRefs, [])
        || !model || !equal(model.receiptRef, receipt.modelReceiptRef) || intent.nodeAttemptId !== attemptId || intent.grantDigest !== producer.effectiveGrantDigest
        || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest || receipt.modelPayloadHash !== hash(receipt.responseText)
        || model.observation.dispatchEvidence.reference.resultPayloadHash !== receipt.modelPayloadHash
        || !review || review.decision !== parsed.decision || review.reasonCode !== parsed.reasonCode || hash(review) !== receipt.reviewIntegrity
        || !equal(receipt.reviewReceiptRef, { runId: root.runId, receiptId: review.receiptId })
        || settlement.reasonCode !== 'session_graph_review_decided' || !equal(settlement.effectReceiptRefs, [receipt.modelReceiptRef.receiptId])
        || settlement.decisionSeq !== receipt.decisionSeq || settlement.createdAt !== receipt.createdAt || receipt.decisionSeq > root.eventSeq) invalid();
    if (input.kind !== 'native_turn_intent' || input.role !== 'narrator' || input.nodeId !== producer.nodeId || !equal(input.planRef, root.planRef)
        || input.grantDigest !== producer.effectiveGrantDigest || !equal(input.audience, pin?.resourceRef.audience)
        || !equal(input.acceptedGraphResultRefs, review.evidenceRefs) || !equal(producer.inputRefs, [input, ...review.evidenceRefs, ...(input.acceptedControlRefs ?? [])])
        || producer.inputDigest !== hash(producer.inputRefs) || review.targetAttemptIds.length !== 1 || review.evidenceRefs.length !== 1) invalid();
    assertAudienceRunCapture(root, node, plan.dependencyPins, input);
    const target = (await readAttempt(tx, handle, root, review.targetAttemptIds[0])).doc;
    if (root.graph.nodes.find(node => node.nodeId === target.nodeId)?.kind !== 'agent' || !equal(target.resultRefs, review.evidenceRefs)
        || target.sourceBindingDigest !== root.sourceBinding.bindingDigest) invalid();
    if (review.decision === 'rerun') {
        if (!review.invalidatedAttemptIds.includes(target.attemptId) || review.replacements.length !== 1 || review.replacements[0].targetAttemptId !== target.attemptId) invalid();
        for (const id of review.invalidatedAttemptIds) {
            const old = (await readAttempt(tx, handle, root, id)).doc;
            if (id === producer.attemptId || ![target.nodeId, producer.nodeId].includes(old.nodeId) || old.status !== 'completed') invalid();
        }
        const next = (await readAttempt(tx, handle, root, review.replacements[0].attemptId)).doc;
        const expected = { ...target.inputRefs[0], reviewFeedbackRef: { reviewReceiptRef: receipt.reviewReceiptRef, reasonCode: parsed.reasonCode } };
        if (next.nodeId !== target.nodeId || !equal(next.inputRefs, [expected, ...target.inputRefs.slice(1)]) || next.inputDigest !== hash(next.inputRefs)
            || next.effectiveGrantDigest !== target.effectiveGrantDigest || !equal(next.budgetRef, root.budgetAuthorityRef)) invalid();
    }
    return { receipt, review, producer, model, settlement };
}


export function parseSessionGraphReview(text) {
    const value = JSON.parse(text);
    assertObject(value, ['decision', 'reasonCode', 'targetAttemptIds'], 'Session Graph Review');
    if (!['approve', 'rerun'].includes(value.decision) || !RP_REVIEW_REASON_CODES.includes(value.reasonCode)
        || (value.decision === 'approve') !== (value.reasonCode === 'quality_ready')
        || !Array.isArray(value.targetAttemptIds) || !value.targetAttemptIds.length
        || new Set(value.targetAttemptIds).size !== value.targetAttemptIds.length) invalid();
    for (const id of value.targetAttemptIds) assertNativeId(id, 'orchestrationAttempt');
    return value;
}

export const sessionGraphReviewOutputContract = Object.freeze({ name: 'atria_session_graph_review', schema: { type: 'object', properties: {
    decision: { type: 'string', enum: ['approve', 'rerun'] }, reasonCode: { type: 'string', enum: RP_REVIEW_REASON_CODES },
    targetAttemptIds: { type: 'array', minItems: 1, items: { type: 'string' } },
}, required: ['decision', 'reasonCode', 'targetAttemptIds'], additionalProperties: false } });

/** Select the original producer namespace from durable facts. A malformed
 * legacy fact never falls through to a different completion protocol. */
export async function readSessionReviewCompletion(tx, handle, root, attemptId, options = {}) {
    assertObject(options, Object.hasOwn(options, 'recipient') ? ['recipient'] : [], 'Session Review read');
    const legacy = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', sessionReviewModelReceiptId(root.runId, attemptId)));
    if (legacy) {
        if (Object.hasOwn(options, 'recipient')) invalid();
        return readLegacySessionReviewCompletion(tx, handle, root, attemptId);
    }
    const fact = await readGraphReviewCompletion(tx, handle, root, attemptId,
        { verifyControlWork: assertSessionControlWork, reasonCodes: RP_REVIEW_REASON_CODES, ...options });
    if (!fact) return null;
    const input = fact.producer.inputRefs[0];
    if (root.sourceBinding.sourceAuthority !== 'native_session'
        || !equal(fact.producer.inputRefs, [input, ...input.acceptedGraphResultRefs, ...(input.acceptedControlRefs ?? [])])
        || fact.targets.some(target => root.graph.nodes.find(node => node.nodeId === target.nodeId)?.kind !== 'agent'
            || root.graph.nodes.find(node => node.nodeId === target.nodeId)?.capabilities.includes('agent.delegate'))) invalid();
    const snapshot = await readTaskGraphRevision(tx, handle, root, fact.producer.graphRevision);
    assertObject(input.controlGraph, ['bindings'], 'Session Review control graph');
    const bindings = input.controlGraph.bindings;
    if (!Array.isArray(bindings) || !bindings.length || new Set(bindings.map(item => item.edgeId)).size !== bindings.length) invalid();
    const controls = [];
    for (const ref of input.acceptedControlRefs ?? []) {
        const control = ref.kind === 'graph_review_control' ? await readSessionReviewCompletion(tx, handle, root, ref.attemptId)
            : ref.kind === 'graph_planner_control' ? await readSessionPlannerCompletion(tx, handle, root, ref.attemptId)
                : ref.kind === 'graph_judge_control' ? await readSessionJudgeCompletion(tx, handle, root, ref.attemptId) : null;
        if (!control || !equal(control.controlRef, ref) || control.receipt.decisionSeq >= fact.receipt.decisionSeq) invalid();
        controls.push(control);
    }
    const sources = [...fact.evidence, ...controls], incoming = snapshot.graph.edges.filter(edge => edge.to.nodeId === fact.producer.nodeId && !edge.loopBack);
    if (sources.some(source => !bindings.some(binding => binding.producerAttemptId === source.producer.attemptId))
        || bindings.some(binding => !sources.some(source => source.producer.attemptId === binding.producerAttemptId
            && incoming.some(edge => edge.edgeId === binding.edgeId && edge.from.nodeId === source.producer.nodeId)))
        || incoming.some(edge => snapshot.graph.nodes.find(node => node.nodeId === fact.producer.nodeId).inputs.find(port => port.name === edge.to.port)?.required
            && !bindings.some(binding => binding.edgeId === edge.edgeId))) invalid();
    const ordered = [...bindings].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
    const traversalId = 'oreceipt_' + hash({ runId: root.runId, bindings: ordered, reservedAttemptId: null }).slice(0, 32);
    await assertOutputTransition(tx, handle, root, { published: sources[0], additionalProducers: sources.slice(1), output: fact.producer,
        producerBindings: ordered, receipt: { decisionSeq: fact.receipt.decisionSeq, traversalReceiptRef: { runId: root.runId, receiptId: traversalId } } });
    if (fact.review.decision === 'rerun') for (const item of fact.review.replacements) {
        const target = fact.targets.find(target => target.attemptId === item.targetAttemptId), next = (await readAttempt(tx, handle, root, item.attemptId)).doc;
        const expected = { ...target.inputRefs[0], reviewFeedbackRef: { reviewReceiptRef: fact.receipt.reviewReceiptRef, reasonCode: fact.review.reasonCode } };
        if (!equal(next.inputRefs, [expected, ...target.inputRefs.slice(1)]) || next.effectiveGrantDigest !== target.effectiveGrantDigest) invalid();
    }
    for (const id of fact.review.invalidatedAttemptIds) {
        const attempt = (await readAttempt(tx, handle, root, id)).doc, node = snapshot.graph.nodes.find(node => node.nodeId === attempt.nodeId);
        if (['fanout', 'join'].includes(node?.kind) || node?.capabilities.includes('agent.delegate')
            || (node?.kind === 'planner' || node?.capabilities.includes('graph.patch'))
                && !await readReviewablePlannerCompletion(tx, handle, root, attempt.attemptId, { verifyControlWork: assertSessionControlWork })) invalid();
    }
    return fact;
}

/** Minimum remaining authored work after the original invalidation closure.
 * Original request, Turn and Attempt authorities still admit each actual unit.
 * This projection neither reserves work nor grants any additional capacity. */
export async function sessionReviewRerunRequirements(tx, handle, root, reviewer, invalidatedAttemptIds) {
    const invalid = new Set(invalidatedAttemptIds), completed = new Set(), admitted = new Set();
    for (const id of root.attemptRefs) {
        const attempt = (await readAttempt(tx, handle, root, id)).doc;
        if (invalid.has(id) || id === reviewer.attemptId || await readAttemptInvalidation(tx, handle, root, attempt)) continue;
        if (['completed', 'failed', 'cancelled'].includes(attempt.status)) completed.add(attempt.nodeId);
        else if (['pending', 'reserved', 'running', 'waiting_effect', 'waiting_child'].includes(attempt.status)) admitted.add(attempt.nodeId);
    }
    const remaining = root.graph.nodes.filter(node => !completed.has(node.nodeId) && root.nodeControl[node.nodeId].disposition !== 'cancelled');
    return { requests: remaining.filter(node => ['agent', 'review', 'planner', 'judge'].includes(node.kind)).length,
        attempts: remaining.filter(node => !admitted.has(node.nodeId)).length,
        reviews: remaining.filter(node => node.kind === 'review').length };
}
