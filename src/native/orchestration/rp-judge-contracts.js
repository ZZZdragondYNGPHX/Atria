import { hashNativeDocument as hash, equalNativeDocuments as equal } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { controlRecordKey, readAttempt, assertAttemptCurrent } from './controller-common.js';
import { readPlanRevision } from './plan-repository.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';
import { assertRpControlWork } from './rp-control-work-contracts.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { rpJudgeProfile } from './rp-judge-profile.js';
import { readContextRetrievalCompletions } from './context-retrieval-contracts.js';
import { assertAudienceRunCapture } from './audience-source-contracts.js';

const invalid = () => { throw new TypeError('Invalid RP Judge completion facts'); };
export const rpJudgeReceiptId = (runId, attemptId) => 'oreceipt_' + hash({ kind: 'rp_graph_judge_model', runId, attemptId }).slice(0, 32);

/** Durable quality selection, never a source, disclosure or Effect grant. */
export async function readRpJudgeCompletion(tx, handle, root, attemptId) {
    const receiptId = rpJudgeReceiptId(root.runId, attemptId), receipt = (await tx.getResource(controlRecordKey(handle, root.runId, 'receipt', receiptId)))?.doc;
    if (!receipt) return null;
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'producerAttemptId', 'sourceBindingDigest', 'grantDigest',
        'modelEffectId', 'modelReceiptRef', 'modelPayloadHash', 'responseText', 'candidateRefs', 'selectedResultRef', 'localWork', 'decisionSeq', 'createdAt'], 'RP Judge receipt');
    const plan = await readPlanRevision(tx, handle, root.planRef), profile = rpJudgeProfile(plan);
    if (root.graphRevision !== 0 || !equal(root.graph, plan.definition)) invalid();
    const producer = (await readAttempt(tx, handle, root, attemptId)).doc, settlement = await readAttemptSettlement(tx, handle, root, producer);
    const intent = (await readEffect(tx, handle, root, receipt.modelEffectId)).doc, model = await readModelCompletionReceipt(handle, tx, root, intent);
    const retrievalCompletions = await readContextRetrievalCompletions(tx, handle, root, intent, producer);
    let parsed;
    try { parsed = JSON.parse(receipt.responseText); } catch { invalid(); }
    assertObject(parsed, ['selectedCandidate', 'reasonCode'], 'Judge response');
    if (!profile || ![0, 1].includes(parsed.selectedCandidate) || parsed.reasonCode !== 'candidate_selected'
        || receipt.schemaVersion !== 1 || receipt.receiptKind !== 'rp_graph_judge_model' || receipt.receiptId !== receiptId || receipt.runId !== root.runId
        || receipt.producerAttemptId !== attemptId || producer.nodeId !== profile.judge.nodeId || producer.status !== 'completed' || receipt.epoch !== producer.epoch || receipt.epoch > root.epoch
        || producer.sourceBindingDigest !== root.sourceBinding.bindingDigest || receipt.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || receipt.grantDigest !== producer.effectiveGrantDigest || !equal(producer.effectRefs, [receipt.modelEffectId, ...retrievalCompletions.map(item => item.effectId)]) || producer.resultRefs.length
        || !Array.isArray(receipt.candidateRefs) || receipt.candidateRefs.length !== 2 || equal(receipt.candidateRefs[0], receipt.candidateRefs[1])
        || !equal(receipt.selectedResultRef, receipt.candidateRefs[parsed.selectedCandidate])
        || intent.nodeAttemptId !== attemptId || intent.epoch !== producer.epoch || intent.grantDigest !== producer.effectiveGrantDigest || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || !model || !equal(model.receiptRef, receipt.modelReceiptRef) || hash(receipt.responseText) !== receipt.modelPayloadHash
        || model.observation.dispatchEvidence.reference.resultPayloadHash !== receipt.modelPayloadHash
        || !equal(settlement.effectReceiptRefs, [receipt.modelReceiptRef.receiptId, ...retrievalCompletions.map(item => item.receiptId)]) || settlement.reasonCode !== 'rp_graph_judge_selected'
        || settlement.decisionSeq !== receipt.decisionSeq || settlement.createdAt !== receipt.createdAt || receipt.decisionSeq > root.eventSeq) invalid();
    const candidates = [];
    for (const [index, ref] of receipt.candidateRefs.entries()) {
        if (ref.runId !== root.runId) invalid();
        const candidate = await readGraphNodeResult(tx, handle, root, ref.resultId);
        if (!candidate || candidate.producer.nodeId !== profile.candidates[index].nodeId
            || !candidate.record.envelope.audienceConstraint.nodeIds.includes(producer.nodeId)) invalid();
        await assertAttemptCurrent(tx, handle, root, candidate.producer); candidates.push(candidate);
    }
    const input = intent.inputRef;
    assertAudienceRunCapture(root, root.graph.nodes.find(node => node.nodeId === producer.nodeId), plan.dependencyPins, input);
    if (input.kind !== 'native_rp_intent' || input.nodeId !== producer.nodeId || !equal(input.planRef, root.planRef) || !equal(input.sourceRef, root.sourceBinding.sourceRef)
        || !equal(input.acceptedGraphResultRefs, receipt.candidateRefs) || !equal(producer.inputRefs, [input, ...receipt.candidateRefs])) invalid();
    const bindings = candidates.map((candidate, index) => ({ edgeId: profile.inputs[index].edgeId, producerAttemptId: candidate.producer.attemptId })).sort((a, b) => a.edgeId.localeCompare(b.edgeId));
    const traversalId = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: null }).slice(0, 32);
    await assertOutputTransition(tx, handle, root, { published: candidates[0], additionalProducers: [candidates[1]], output: producer,
        receipt: { decisionSeq: receipt.decisionSeq, traversalReceiptRef: { runId: root.runId, receiptId: traversalId } } });
    await assertRpControlWork(tx, handle, root, receipt.modelEffectId, receipt.localWork);
    return { receipt, producer, settlement, candidates, retrievalCompletions, modelEffectId: receipt.modelEffectId };
}
