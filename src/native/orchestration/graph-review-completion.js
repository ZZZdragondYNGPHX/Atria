import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { readAttempt, controlCommandId, controlRecordKey, readGraphReviewReceipt, readAttemptInvalidation,
    assertAttemptConsumable, graphReachable, readReviewAdmission } from './controller-common.js';
import { readAttemptSettlement, SETTLED_ATTEMPT_STATUSES } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';
import { readContextRetrievalCompletions } from './context-retrieval-contracts.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { audienceContextPin, assertAudienceRunCapture } from './audience-source-contracts.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid Graph Review completion facts'); };
export const graphReviewModelReceiptId = (runId, attemptId) => 'oreceipt_' + hash({ kind: 'graph_review_model', runId, attemptId }).slice(0, 32);
export const graphReviewControlRef = (runId, attemptId) => ({ kind: 'graph_review_control', runId, attemptId,
    receiptId: graphReviewModelReceiptId(runId, attemptId) });

/** Historical Model/Review facts without a graph-shape assumption. The
 * original domain verifies its bank work and fixed quality vocabulary.
 * This reader never grants a Source, replacement, Effect or domain write. */
export async function readGraphReviewCompletion(tx, handle, root, attemptId, { verifyControlWork, reasonCodes, recipient = null }) {
    if (typeof verifyControlWork !== 'function' || !Array.isArray(reasonCodes) || !reasonCodes.length) invalid();
    const producer = (await readAttempt(tx, handle, root, attemptId)).doc, receiptId = graphReviewModelReceiptId(root.runId, attemptId);
    const receipt = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId)))?.doc;
    if (!receipt) return null;
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'producerAttemptId', 'sourceBindingDigest', 'grantDigest',
        'modelEffectId', 'modelReceiptRef', 'modelPayloadHash', 'responseText', 'reviewReceiptRef', 'reviewIntegrity', 'localWork', 'decisionSeq', 'createdAt'], 'Graph Review Model receipt');
    const before = await readTaskGraphRevision(tx, handle, root, producer.graphRevision), node = before.graph.nodes.find(node => node.nodeId === producer.nodeId);
    const admission = await readReviewAdmission(tx, handle, root, producer);
    const review = await readGraphReviewReceipt(tx, handle, root, producer), settlement = await readAttemptSettlement(tx, handle, root, producer);
    const intent = (await readEffect(tx, handle, root, receipt.modelEffectId)).doc, model = await readModelCompletionReceipt(handle, tx, root, intent);
    const retrieval = await readContextRetrievalCompletions(tx, handle, root, intent, producer);
    let response;
    try { response = JSON.parse(receipt.responseText); } catch { invalid(); }
    assertObject(response, ['decision', 'reasonCode', 'targetAttemptIds'], 'Graph Review response');
    if (!Array.isArray(response.targetAttemptIds) || !response.targetAttemptIds.length
        || new Set(response.targetAttemptIds).size !== response.targetAttemptIds.length) invalid();
    const project = root.sourceBinding.sourceAuthority === 'project';
    const payload = project ? { text: receipt.responseText, toolCalls: [] } : receipt.responseText;
    if (receipt.schemaVersion !== 1 || receipt.receiptKind !== 'graph_review_model' || receipt.receiptId !== receiptId || receipt.runId !== root.runId
        || receipt.producerAttemptId !== attemptId || producer.status !== 'completed' || producer.epoch !== receipt.epoch || receipt.epoch > root.epoch
        || node?.kind !== 'review' || !node.capabilities.includes('generation.send') || !admission || admission.round > node.policy.maxRounds
        || producer.sourceBindingDigest !== root.sourceBinding.bindingDigest || receipt.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || receipt.grantDigest !== producer.effectiveGrantDigest || !equal(producer.effectRefs, [receipt.modelEffectId, ...retrieval.map(item => item.effectId)]) || producer.resultRefs.length
        || !review || hash(review) !== receipt.reviewIntegrity || !equal(receipt.reviewReceiptRef, { runId: root.runId, receiptId: review.receiptId })
        || response.decision !== review.decision || response.reasonCode !== review.reasonCode
        || !equal([...response.targetAttemptIds].sort(), [...review.targetAttemptIds].sort()) || review.decisionSeq >= receipt.decisionSeq
        || !reasonCodes.includes(response.reasonCode) || (response.decision === 'approve') !== (response.reasonCode === 'quality_ready')
        || intent.nodeAttemptId !== attemptId || intent.epoch !== producer.epoch || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest || intent.grantDigest !== receipt.grantDigest
        || !model || !equal(model.receiptRef, receipt.modelReceiptRef) || hash(payload) !== receipt.modelPayloadHash
        || model.observation.dispatchEvidence.reference.resultOutputType !== (project ? 'json' : 'text')
        || model.observation.dispatchEvidence.reference.resultPayloadHash !== receipt.modelPayloadHash
        || !equal(settlement.effectReceiptRefs, [receipt.modelReceiptRef.receiptId, ...retrieval.map(item => item.receiptId)]) || settlement.reasonCode !== 'graph_review_decided'
        || settlement.decisionSeq !== receipt.decisionSeq || settlement.createdAt !== receipt.createdAt || receipt.decisionSeq > root.eventSeq) invalid();
    const input = intent.inputRef;
    const kinds = { project: 'native_project_intent', rp_chat: 'native_rp_intent', native_session: 'native_turn_intent' };
    if (!Object.hasOwn(kinds, root.sourceBinding.sourceAuthority) || input.kind !== kinds[root.sourceBinding.sourceAuthority]
        || input.nodeId !== producer.nodeId || !equal(input.planRef, root.planRef)
        || input.role !== (project ? 'studio' : 'narrator')
        || !equal(input.sourceRef, root.sourceBinding.sourceRef) || !equal(input.acceptedGraphResultRefs, review.evidenceRefs)
        || !equal(producer.inputRefs[0], input) || producer.inputDigest !== hash(producer.inputRefs)
        || new Set(review.evidenceRefs.map(hash)).size !== review.evidenceRefs.length
        || new Set(review.targetAttemptIds).size !== review.targetAttemptIds.length) invalid();
    if (node.policy?.audiencePinId || Object.hasOwn(input, 'audienceCapture')) {
        const plan = await readPlanRevision(tx, handle, root.planRef);
        assertAudienceRunCapture(root, node, plan.dependencyPins, input);
        if (!equal(input.audience, audienceContextPin(node, plan.dependencyPins)?.resourceRef.audience ?? { kind: 'narrator' })) invalid();
    } else if (!equal(input.audience, project ? { kind: 'project_task', id: root.sourceBinding.sourceRef.taskId } : { kind: 'narrator' })) invalid();
    const evidence = [];
    for (const ref of review.evidenceRefs) {
        if (ref.runId !== root.runId || !producer.inputRefs.some(input => equal(input, ref))) invalid();
        const fact = await readGraphNodeResult(tx, handle, root, ref.resultId);
        if (!fact || !fact.record.envelope.audienceConstraint.nodeIds.includes(producer.nodeId)
            || fact.receipt.decisionSeq >= review.decisionSeq) invalid();
        evidence.push(fact);
    }
    const targets = [...review.targetAttemptIds].sort();
    const targetEvidence = evidence.filter(fact => targets.includes(fact.producer.attemptId));
    if (!equal([...new Set(targetEvidence.map(fact => fact.producer.attemptId))].sort(), targets)) invalid();
    const commandId = controlCommandId('review.decide', review.receiptId);
    const command = (await checkedRecord(tx, { kind: K.orchestrationCommand, handle, commandId }))?.doc;
    const detail = { reviewAttemptId: attemptId, decision: review.decision, targetAttemptIds: [...targets], reasonCode: review.reasonCode, evidenceRefs: review.evidenceRefs };
    if (!command || command.schemaVersion !== 1 || command.commandId !== commandId || command.operation !== 'runs.control.review.decide' || command.target !== root.runId
        || command.payloadHash !== hash({ operation: command.operation, body: { runId: root.runId, operation: 'review.decide', detail } })
        || !equal(command.outcome?.reviewReceipt, review)) invalid();
    if (review.decision === 'rerun') await readReplacements(tx, handle, root, review, targetEvidence);
    await verifyControlWork(tx, handle, root, receipt.modelEffectId, receipt.localWork);
    const controlRef = graphReviewControlRef(root.runId, attemptId);
    if (recipient) {
        await assertAttemptConsumable(tx, handle, root, producer);
        const actual = (await readAttempt(tx, handle, root, recipient.attemptId)).doc;
        if (!equal(actual, recipient) || root.status !== 'running' || root.cancelRequested || recipient.epoch !== root.epoch
            || recipient.sourceBindingDigest !== root.sourceBinding.bindingDigest || !['running', 'waiting_effect'].includes(recipient.status)
            || !recipient.inputRefs.some(ref => equal(ref, controlRef))
            || !root.graph.edges.some(edge => edge.from.nodeId === producer.nodeId && edge.to.nodeId === recipient.nodeId)) invalid();
    }
    return { producer, settlement, receipt, review, evidence, targets: targetEvidence.map(fact => fact.producer), controlRef, retrievalCompletions: retrieval };
}

async function readReplacements(tx, handle, root, review, evidence) {
    const snapshot = await readTaskGraphRevision(tx, handle, root, review.graphRevision);
    if (review.replacements.length !== review.targetAttemptIds.length || new Set(review.invalidatedAttemptIds).size !== review.invalidatedAttemptIds.length
        || new Set(review.replacements.map(item => item.targetAttemptId)).size !== review.replacements.length
        || !review.targetAttemptIds.every(id => review.invalidatedAttemptIds.includes(id))) invalid();
    const staleRefs = new Set();
    for (const id of review.invalidatedAttemptIds) {
        const attempt = (await readAttempt(tx, handle, root, id)).doc;
        const node = snapshot.graph.nodes.find(node => node.nodeId === attempt.nodeId);
        const invalidation = await readAttemptInvalidation(tx, handle, root, attempt);
        if (id === review.reviewAttemptId || !SETTLED_ATTEMPT_STATUSES.includes(attempt.status)
            || node?.kind === 'planner' || node?.capabilities.includes('graph.patch')
            || !invalidation || invalidation.reviewReceiptId !== review.receiptId
            || !evidence.some(fact => graphReachable(snapshot.graph, fact.producer.nodeId, attempt.nodeId))) invalid();
        for (const ref of attempt.resultRefs) staleRefs.add(hash(ref));
        const effects = [];
        for (const id of attempt.effectRefs) effects.push((await readEffect(tx, handle, root, id)).doc);
        const retrieval = effects.some(effect => effect.capability === 'memory.retrieve')
            ? await readContextRetrievalCompletions(tx, handle, root, effects[0], attempt) : [];
        for (const effect of effects) {
            if (root.pendingEffectRefs.includes(effect.effectId) || !['confirmed', 'failed', 'not_dispatched'].includes(effect.status)
                || effect.status !== 'not_dispatched' && (effect.capability !== 'generation.send' && !retrieval.some(item => item.effectId === effect.effectId)
                    || effect.risk !== 'R1' || effect.requiresApproval)) invalid();
        }
    }
    for (const replacement of review.replacements) {
        const target = evidence.find(fact => fact.producer.attemptId === replacement.targetAttemptId)?.producer;
        const next = (await readAttempt(tx, handle, root, replacement.attemptId)).doc;
        if (!target || replacement.attemptId !== 'oattempt_' + hash({ receiptId: review.receiptId, targetAttemptId: target.attemptId }).slice(0, 32)
            || next.nodeId !== target.nodeId || next.attemptNumber <= target.attemptNumber || next.epoch !== review.epoch || next.graphRevision !== review.graphRevision
            || next.sourceBindingDigest !== root.sourceBinding.bindingDigest || !equal(next.budgetRef, root.budgetAuthorityRef)
            || next.inputDigest !== hash(next.inputRefs) || [...next.inputRefs, ...(next.inputRefs[0]?.acceptedGraphResultRefs ?? [])].some(ref => staleRefs.has(hash(ref)))) invalid();
    }
}
