import { assertComputeAllocation } from '../../../public/shared/native-compute-budget.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { readSessionFanoutCompletion, readSessionFanoutReviewInput } from './session-fanout-contracts.js';
import { readFanoutReviewScope } from './fanout-controller.js';
import { joinIdForAttempt } from './join-controller.js';
import { assertAudienceRunCapture } from './audience-source-contracts.js';
import { hashNativeDocument as hash, equalNativeDocuments as equal } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { readPlanRevision } from './plan-repository.js';
import { controlRecordKey, readAttempt, readGraphReviewReceipt, readAttemptInvalidation } from './controller-common.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';
import { RP_REVIEW_REASON_CODES } from './rp-review-profile.js';
import { assertNativeId } from '../identity.js';
import { readGraphReviewCompletion, readReviewablePlannerCompletion, readReviewableFanoutCompletion, readReviewableDelegationCompletion } from './graph-review-completion.js';
import { assertSessionControlWork, readSessionPlannerCompletion } from './session-planner-contracts.js';
import { readSessionJudgeCompletion } from './session-judge-contracts.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';

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
    const id = sessionReviewModelReceiptId(root.runId, attemptId), stored = await tx.getResource(controlRecordKey(handle, root.runId, 'receipt', id));
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
    const legacy = await tx.getResource(controlRecordKey(handle, root.runId, 'receipt', sessionReviewModelReceiptId(root.runId, attemptId)));
    if (legacy) {
        if (Object.hasOwn(options, 'recipient')) invalid();
        return readLegacySessionReviewCompletion(tx, handle, root, attemptId);
    }
    const fact = await readGraphReviewCompletion(tx, handle, root, attemptId,
        { verifyControlWork: assertSessionControlWork, reasonCodes: RP_REVIEW_REASON_CODES, readFanoutCompletion: readSessionFanoutCompletion, ...options });
    if (!fact) return null;
    const input = fact.producer.inputRefs[0];
    if (root.sourceBinding.sourceAuthority !== 'native_session'
        || !equal(fact.producer.inputRefs, [input, ...input.acceptedGraphResultRefs, ...(input.acceptedControlRefs ?? [])])
        || fact.targets.some(target => root.graph.nodes.find(node => node.nodeId === target.nodeId)?.kind !== 'agent')) invalid();
    const snapshot = await readTaskGraphRevision(tx, handle, root, fact.producer.graphRevision);
    for (const target of fact.targets) if (target.inputRefs[0]?.kind === 'native_session_delegation') {
        const delegated = fact.review.decision === 'rerun' ? fact.rerunDelegations.find(item => item.producer.attemptId === target.attemptId)
            : await readReviewableDelegationCompletion(tx, handle, root, target.attemptId);
        if (!delegated) invalid();
    }
    if (input.fanoutAttemptId) {
        if (!await readFanoutReviewScope(tx, handle, root, fact.producer, fact.targets, { decisionSeq: fact.review.decisionSeq })) invalid();
        await readSessionFanoutReviewInput(tx, handle, root, fact.producer);
    } else {
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
        const joins = [];
        for (const ref of input.joinReceiptRefs ?? []) {
            const barrier = ref.runId === root.runId ? (await tx.getResource(controlRecordKey(handle, root.runId, 'join', 'barrier:' + ref.joinId)))?.doc : null;
            const joined = barrier ? await readSessionFanoutCompletion(tx, handle, root, barrier.nodeAttemptId) : null;
            if (!joined || joined.joinReceipt.joinId !== ref.joinId || joined.joinReceipt.outcome !== 'completed'
                || joins.some(actual => actual.producer.attemptId === joined.producer.attemptId)
                || !joined.joinReceipt.acceptedResultRefs.every(actual => fact.evidence.some(item => equal(item.receipt.resultRef, actual)))) invalid();
            joins.push(joined);
        }
        const joinedRefs = joins.flatMap(joined => joined.joinReceipt.acceptedResultRefs);
        const sources = [...fact.evidence.filter(item => !joinedRefs.some(ref => equal(ref, item.receipt.resultRef))), ...controls, ...joins];
        const incoming = snapshot.graph.edges.filter(edge => edge.to.nodeId === fact.producer.nodeId && !edge.loopBack);
        if (sources.some(source => !bindings.some(binding => binding.producerAttemptId === source.producer.attemptId))
            || bindings.some(binding => !sources.some(source => source.producer.attemptId === binding.producerAttemptId
                && incoming.some(edge => edge.edgeId === binding.edgeId && edge.from.nodeId === source.producer.nodeId)))
            || incoming.some(edge => snapshot.graph.nodes.find(node => node.nodeId === fact.producer.nodeId).inputs.find(port => port.name === edge.to.port)?.required
                && !bindings.some(binding => binding.edgeId === edge.edgeId))) invalid();
        const ordered = [...bindings].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
        const traversalId = 'oreceipt_' + hash({ runId: root.runId, bindings: ordered, reservedAttemptId: null }).slice(0, 32);
        await assertOutputTransition(tx, handle, root, { published: sources[0], additionalProducers: sources.slice(1), output: fact.producer,
            producerBindings: ordered, receipt: { decisionSeq: fact.receipt.decisionSeq, traversalReceiptRef: { runId: root.runId, receiptId: traversalId } } });
    }
    if (fact.review.decision === 'rerun') for (const item of fact.review.replacements) {
        const target = fact.targets.find(target => target.attemptId === item.targetAttemptId), next = (await readAttempt(tx, handle, root, item.attemptId)).doc;
        const expected = { ...target.inputRefs[0], reviewFeedbackRef: { reviewReceiptRef: fact.receipt.reviewReceiptRef, reasonCode: fact.review.reasonCode } };
        if (!equal(next.inputRefs, [expected, ...target.inputRefs.slice(1)]) || next.effectiveGrantDigest !== target.effectiveGrantDigest) invalid();
    }
    for (const id of fact.review.invalidatedAttemptIds) {
        const attempt = (await readAttempt(tx, handle, root, id)).doc, node = snapshot.graph.nodes.find(node => node.nodeId === attempt.nodeId);
        if (['fanout', 'join'].includes(node?.kind) ? !fact.rerunFanouts.some(group => group.fanout.attemptId === attempt.attemptId || group.producer.attemptId === attempt.attemptId)
            : attempt.inputRefs[0]?.kind === 'native_session_delegation' ? !fact.rerunDelegations.some(item => item.producer.attemptId === attempt.attemptId)
                : (node?.kind === 'planner' || node?.capabilities.includes('graph.patch'))
                && !await readReviewablePlannerCompletion(tx, handle, root, attempt.attemptId, { verifyControlWork: assertSessionControlWork, reviewTargets: fact.targets, readFanoutCompletion: readSessionFanoutCompletion, reviewer: fact.producer, reviewDecisionSeq: fact.review.decisionSeq })) invalid();
    }
    return fact;
}

/** Minimum remaining authored work after the original invalidation closure.
 * Original request, Turn and Attempt authorities still admit each actual unit.
 * This projection neither reserves work nor grants any additional capacity. */
export async function sessionReviewRerunRequirements(tx, handle, root, reviewer, invalidatedAttemptIds) {
    const invalidated = new Set(invalidatedAttemptIds), completed = new Set(), admitted = new Set();
    for (const id of root.attemptRefs) {
        const attempt = (await readAttempt(tx, handle, root, id)).doc;
        if (invalidated.has(id) || id === reviewer.attemptId || await readAttemptInvalidation(tx, handle, root, attempt)) continue;
        if (['completed', 'failed', 'cancelled'].includes(attempt.status)) completed.add(attempt.nodeId);
        else if (['pending', 'reserved', 'running', 'waiting_effect', 'waiting_child'].includes(attempt.status)) admitted.add(attempt.nodeId);
    }
    const remaining = root.graph.nodes.filter(node => !completed.has(node.nodeId) && root.nodeControl[node.nodeId].disposition !== 'cancelled');
    let childRequests = 0;
    if (remaining.some(node => node.policy.allowedPlanPinIds?.length)) {
        const plan = await readPlanRevision(tx, handle, root.planRef);
        for (const node of remaining.filter(node => node.policy.allowedPlanPinIds?.length)) {
            if (node.kind !== 'agent' || node.policy.allowedPlanPinIds.length !== 1 || !node.capabilities.includes('agent.delegate')) invalid();
            const pin = plan.dependencyPins.find(pin => pin.port === 'plan' && pin.pinId === node.policy.allowedPlanPinIds[0] && node.dependencyPinIds.includes(pin.pinId));
            if (!pin) invalid();
            const child = await readPlanRevision(tx, handle, pin.resourceRef);
            if (hash(child) !== pin.integrity) invalid();
            let ceiling = null;
            for (const model of child.dependencyPins.filter(pin => pin.port === 'model' && pin.resourceRef.scope === 'player')) {
                const route = model.resourceRef.scope === 'player' ? (await tx.getResource({ kind: K.runtimeRoute, handle, runtimeRouteId: model.resourceRef.runtimeRouteId }))?.doc : null;
                if (!route || hash(route) !== model.integrity) invalid();
                const budget = assertComputeAllocation(route.executionPolicy.computeBudget);
                if (ceiling && !equal(ceiling, budget)) invalid(); ceiling = budget;
            }
            if (!ceiling) invalid(); childRequests += ceiling.maxRequests;
        }
    }
    return { requests: remaining.filter(node => ['agent', 'review', 'planner', 'judge'].includes(node.kind)).length + childRequests,
        attempts: remaining.filter(node => !admitted.has(node.nodeId)).length,
        reviews: remaining.filter(node => node.kind === 'review').length };
}

/** Resolve a passive task by its original barrier identity, never the first
 * Join with the same nodeId. The shared reader proves the entire paid group. */
export async function readSessionReviewableFanout(tx, handle, root, attempt, targets) {
    if (root.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind === 'join')
        return readReviewableFanoutCompletion(tx, handle, root, attempt.attemptId, { targets, readCompletion: readSessionFanoutCompletion });
    for (const id of root.attemptRefs) {
        const join = (await readAttempt(tx, handle, root, id)).doc;
        if (root.graph.nodes.find(node => node.nodeId === join.nodeId)?.kind !== 'join') continue;
        const barrier = (await tx.getResource(controlRecordKey(handle, root.runId, 'join', 'barrier:' + joinIdForAttempt(id))))?.doc;
        if (barrier?.fanoutAttemptId !== attempt.attemptId) continue;
        return readReviewableFanoutCompletion(tx, handle, root, id, { targets, readCompletion: readSessionFanoutCompletion });
    }
    return null;
}

/** Exact original Review replacement; it consumes no new incoming edge. */
export async function readSessionReviewReplacement(tx, handle, root, producer, input) {
    const ref = input.reviewFeedbackRef?.reviewReceiptRef;
    const stored = ref?.runId === root.runId ? await tx.getResource(controlRecordKey(handle, root.runId, 'receipt', ref.receiptId)) : null;
    if (!stored || stored.doc.receiptKind !== 'graph_review') invalid();
    const fact = await readSessionReviewCompletion(tx, handle, root, stored.doc.reviewAttemptId);
    const replacement = fact?.review.replacements.find(item => item.attemptId === producer.attemptId);
    const target = fact?.targets.find(item => item.attemptId === replacement?.targetAttemptId);
    if (!target || fact.review.decision !== 'rerun' || !equal(ref, fact.receipt.reviewReceiptRef)
        || input.reviewFeedbackRef.reasonCode !== fact.review.reasonCode || producer.nodeId !== target.nodeId
        || producer.effectiveGrantDigest !== target.effectiveGrantDigest || producer.graphRevision !== fact.review.graphRevision
        || !equal(producer.inputRefs, [{ ...target.inputRefs[0], reviewFeedbackRef: input.reviewFeedbackRef }, ...target.inputRefs.slice(1)])) invalid();
    const invalidation = await readAttemptInvalidation(tx, handle, root, target);
    if (!invalidation || invalidation.reviewReceiptId !== fact.review.receiptId) invalid();
    return { fact, target };
}
