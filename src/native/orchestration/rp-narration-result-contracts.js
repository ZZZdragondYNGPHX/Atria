import { readHandoffReturn } from './handoff-return-contracts.js';
import { assertNativeId } from '../identity.js';
import { assertObject, assertCounter, assertDigest } from '../../../public/shared/native-orchestration-contracts.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { rpNativeOutputKey } from '../rp-output-protocol.js';
import { assertResultRecord, resultDependencyDigest } from './result-contracts.js';
import { modelResultId } from './result-publication-contracts.js';
import { controlRecordKey, readAttempt, assertAttemptCurrent } from './controller-common.js';
import { checkedRecord } from './plan-repository.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';
import { readRpPlannerCompletion } from './rp-planner-contracts.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { readGraphNodeResult, graphResultPublicationId } from './graph-result-contracts.js';
import { readRpReviewCompletion } from './rp-review-contracts.js';
import { readRpJudgeCompletion } from './rp-judge-contracts.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid RP Narrator Result facts'); };
export const rpNarrationPublicationId = resultId => 'oreceipt_' + hash({ kind: 'rp_narration_result', resultId }).slice(0, 32);
export const rpNarrationAudience = (root, grantDigest) => ({ kind: 'rp_output', runId: root.runId, nodeId: root.graph.outputContract.ownerNodeId,
    epoch: root.epoch, controlId: root.sourceBinding.sourceRequest.controlId,
    outputKey: rpNativeOutputKey(root.sourceBinding.sourceRequest.controlId, root.sourceBinding.sourceRequest.source),
    sourceBindingDigest: root.sourceBinding.bindingDigest, grantDigest, taskPurpose: 'original_rp_narration' });

export function rpNarrationResult({ root, proof, payload, grantDigest, now }) {
    const resultId = modelResultId(root.runId, proof.effectId), resultRef = { runId: root.runId, resultId };
    const envelope = { schemaVersion: 1, runId: root.runId, resultId, producerAttemptId: proof.producerAttemptId,
        outputType: 'text', outputSchemaRef: { kind: 'native_builtin', schema: 'text' },
        payloadRef: { kind: 'orchestration_result_payload', runId: root.runId, resultId, integrity: proof.payloadHash },
        sourceRefs: [{ kind: 'run_source', runId: root.runId, epoch: root.epoch, sourceBindingDigest: root.sourceBinding.bindingDigest,
            sourceAuthority: 'rp_chat', sourceRef: root.sourceBinding.sourceRef },
        { kind: 'effect_receipt', runId: root.runId, effectId: proof.effectId, receiptId: proof.receiptRef.receiptId, observedEpoch: root.epoch }],
        dependencyDigest: '', audienceConstraint: rpNarrationAudience(root, grantDigest), disclosureConstraint: { kind: 'same_source_rp_output_only' },
        qualityRefs: [], status: 'complete', createdAt: now };
    envelope.dependencyDigest = resultDependencyDigest(envelope);
    return { resultRef, record: assertResultRecord({ schemaVersion: 1, runId: root.runId, resultId, envelope, payload }, { outputContract: root.graph.outputContract }) };
}

/** Historical protected record, not a body-consumption or fresh writer grant. */
export async function readRpNarrationResult(tx, handle, root) {
    if (!root.resultRefs.length) return null;
    if (root.parentRef !== null || root.graph.outputContract.kind !== 'rp_narration' || root.sourceBinding.sourceAuthority !== 'rp_chat'
    ) invalid();
    const candidates = [], graphResults = [];
    for (const ref of root.resultRefs) {
        if (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', rpNarrationPublicationId(ref.resultId)))) candidates.push(ref);
        else if (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', graphResultPublicationId(root.runId, ref.resultId)))) graphResults.push(await readGraphNodeResult(tx, handle, root, ref.resultId));
        else invalid();
    }
    if (candidates.length !== 1) invalid();
    const [resultRef] = candidates;
    const saved = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'result', resultRef.resultId));
    const publication = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', rpNarrationPublicationId(resultRef.resultId)));
    if (!saved || !publication) invalid();
    const record = assertResultRecord(saved.doc, { outputContract: root.graph.outputContract }), receipt = publication.doc;
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'producerAttemptId', 'resultRef', 'resultIntegrity',
        'modelEffectId', 'modelReceiptRef', 'grantDigest', 'sourceBindingDigest', 'audienceDigest', 'decisionSeq', 'createdAt'], 'RP Narrator publication');
    assertCounter(receipt.epoch, 'epoch'); assertCounter(receipt.decisionSeq, 'decisionSeq', 1); assertCounter(receipt.createdAt, 'createdAt');
    for (const field of ['resultIntegrity', 'grantDigest', 'sourceBindingDigest', 'audienceDigest']) assertDigest(receipt[field], field);
    for (const [field, kind] of [['receiptId', 'orchestrationReceipt'], ['runId', 'orchestrationRun'], ['producerAttemptId', 'orchestrationAttempt'], ['modelEffectId', 'orchestrationEffect']]) assertNativeId(receipt[field], kind);
    assertObject(receipt.modelReceiptRef, ['runId', 'receiptId'], 'RP model receipt');
    if (receipt.modelReceiptRef.runId !== root.runId || resultRef.resultId !== modelResultId(root.runId, receipt.modelEffectId)) invalid();
    assertNativeId(receipt.modelReceiptRef.receiptId, 'orchestrationReceipt');
    const producer = (await readAttempt(tx, handle, root, receipt.producerAttemptId)).doc;
    const settlement = await readAttemptSettlement(tx, handle, root, producer);
    const intent = (await readEffect(tx, handle, root, receipt.modelEffectId)).doc;
    const model = await readModelCompletionReceipt(handle, tx, root, intent);
    const source = root.sourceBinding, audience = { ...rpNarrationAudience(root, producer.effectiveGrantDigest), epoch: receipt.epoch };
    if (receipt.schemaVersion !== 1 || receipt.receiptKind !== 'rp_narration_result' || receipt.receiptId !== rpNarrationPublicationId(resultRef.resultId)
        || receipt.runId !== root.runId || receipt.epoch > root.epoch || receipt.epoch !== producer.epoch || producer.status !== 'completed'
        || !equal(resultRef, receipt.resultRef) || !equal(resultRef, { runId: root.runId, resultId: record.resultId })
        || receipt.resultIntegrity !== saved.integrity || receipt.resultIntegrity !== hash(record) || record.envelope.status !== 'complete'
        || record.envelope.producerAttemptId !== producer.attemptId || !equal(record.envelope.audienceConstraint, audience)
        || receipt.audienceDigest !== hash(audience) || receipt.grantDigest !== producer.effectiveGrantDigest
        || receipt.sourceBindingDigest !== source.bindingDigest || !equal(producer.resultRefs, [resultRef]) || !equal(producer.effectRefs, [receipt.modelEffectId])
        || settlement.reasonCode !== 'rp_narration_ready' || settlement.decisionSeq !== receipt.decisionSeq || settlement.createdAt !== receipt.createdAt
        || receipt.decisionSeq > root.eventSeq || !equal(settlement.effectReceiptRefs, [receipt.modelReceiptRef.receiptId])
        || !model || !equal(model.receiptRef, receipt.modelReceiptRef)
        || model.observation.dispatchEvidence.reference.resultPayloadHash !== undefined && model.observation.dispatchEvidence.reference.resultPayloadHash !== hash(record.payload)
        || intent.nodeAttemptId !== producer.attemptId
        || intent.epoch !== receipt.epoch || intent.grantDigest !== receipt.grantDigest || intent.sourceBindingDigest !== source.bindingDigest
        || !equal(record.envelope.sourceRefs, [{ kind: 'run_source', runId: root.runId, epoch: receipt.epoch,
            sourceBindingDigest: source.bindingDigest, sourceAuthority: 'rp_chat', sourceRef: source.sourceRef },
        { kind: 'effect_receipt', runId: root.runId, effectId: receipt.modelEffectId, receiptId: receipt.modelReceiptRef.receiptId, observedEpoch: receipt.epoch }])) invalid();
    const input = intent.inputRef;
    let judgeCompletion = null;
    if (input.kind !== 'native_rp_intent' || input.nodeId !== producer.nodeId || input.role !== 'narrator'
        || !equal(input.planRef, root.planRef) || !equal(input.sourceRef, source.sourceRef)
        || !equal(input.audience, { kind: 'narrator' }) || producer.inputDigest !== hash(producer.inputRefs)) invalid();
    if (producer.inputRefs[0]?.kind === 'native_rp_delegation') {
        if (producer.inputRefs.length !== 1 || input.parentInputDigest !== producer.inputDigest || !input.acceptedResultRef || !input.returnReceiptRef) invalid();
        const returned = await readHandoffReturn(tx, handle, root, input.acceptedResultRef.runId);
        if (!returned || !equal(returned.resultRef, input.acceptedResultRef)
            || !equal(input.returnReceiptRef, { runId: root.runId, receiptId: returned.receiptId })
            || returned.parentAttemptId !== producer.attemptId || returned.parentGrantDigest !== producer.effectiveGrantDigest
            || returned.decisionSeq >= receipt.decisionSeq) invalid();
    } else if (input.acceptedGraphResultRefs) {
        if (input.acceptedGraphResultRefs.length !== 1 || !equal(producer.inputRefs, [input, ...input.acceptedGraphResultRefs])) invalid();
        const draft = graphResults.find(item => equal(item.receipt.resultRef, input.acceptedGraphResultRefs[0]));
        if (!draft || !draft.record.envelope.audienceConstraint.nodeIds.includes(producer.nodeId)) invalid();
        await assertAttemptCurrent(tx, handle, root, draft.producer);
        const additionalProducers = [];
        if (input.judgeReceiptRef) {
            if (input.reviewReceiptRef || input.judgeReceiptRef.runId !== root.runId) invalid();
            const decision = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', input.judgeReceiptRef.receiptId)))?.doc;
            judgeCompletion = decision ? await readRpJudgeCompletion(tx, handle, root, decision.producerAttemptId) : null;
            if (!judgeCompletion || !equal(input.judgeReceiptRef, { runId: root.runId, receiptId: judgeCompletion.receipt.receiptId })
                || !equal(judgeCompletion.receipt.selectedResultRef, draft.receipt.resultRef)
                || !equal(graphResults.map(item => item.receipt.resultRef), judgeCompletion.receipt.candidateRefs)) invalid();
            additionalProducers.push(judgeCompletion);
        } else if (input.reviewReceiptRef) {
            if (input.reviewReceiptRef.runId !== root.runId) invalid();
            const decision = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', input.reviewReceiptRef.receiptId)))?.doc;
            const reviewed = decision ? await readRpReviewCompletion(tx, handle, root, decision.reviewAttemptId) : null;
            if (!reviewed || reviewed.review.decision !== 'approve' || !equal(reviewed.receipt.reviewReceiptRef, input.reviewReceiptRef)
                || !equal(reviewed.review.evidenceRefs, [draft.receipt.resultRef])) invalid();
            additionalProducers.push(reviewed);
        } else if (graphResults.length !== 1) invalid();
        if (!equal(producer.inputRefs, [input, ...input.acceptedGraphResultRefs])) invalid();
        const edges = [draft, ...additionalProducers].map(source => root.graph.edges.find(item => item.from.nodeId === source.producer.nodeId && item.to.nodeId === producer.nodeId));
        if (edges.some(edge => !edge)) invalid();
        const bindings = edges.map((edge, index) => ({ edgeId: edge.edgeId, producerAttemptId: [draft, ...additionalProducers][index].producer.attemptId })).sort((a, b) => a.edgeId.localeCompare(b.edgeId));
        const traversalId = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: null }).slice(0, 32);
        await assertOutputTransition(tx, handle, root, { published: draft, additionalProducers, output: producer,
            receipt: { decisionSeq: receipt.decisionSeq, traversalReceiptRef: { runId: root.runId, receiptId: traversalId } } });
    } else if (!equal(producer.inputRefs, [input]) || graphResults.length) invalid();
    if (root.graph.nodes.some(node => node.kind === 'planner')) {
        const planner = await readRpPlannerCompletion(tx, handle, root);
        if (!planner || !equal(input.controlReceiptRef, { runId: root.runId, receiptId: planner.receipt.receiptId })) invalid();
        const edge = root.graph.edges.find(item => item.from.nodeId === planner.producer.nodeId && item.to.nodeId === producer.nodeId);
        if (!edge) invalid();
        const traversalId = 'oreceipt_' + hash({ runId: root.runId, bindings: [{ edgeId: edge.edgeId, producerAttemptId: planner.producer.attemptId }], reservedAttemptId: null }).slice(0, 32);
        await assertOutputTransition(tx, handle, root, { published: planner, output: producer, receipt: { decisionSeq: receipt.decisionSeq, traversalReceiptRef: { runId: root.runId, receiptId: traversalId } } });
    }
    const reviewCompletions = [];
    for (const id of root.attemptRefs) {
        const { doc: attempt } = await readAttempt(tx, handle, root, id);
        if (root.graph.nodes.find(node => node.nodeId === attempt.nodeId).kind !== 'review') continue;
        const reviewed = await readRpReviewCompletion(tx, handle, root, id);
        if (!reviewed) invalid(); reviewCompletions.push(reviewed);
    }
    if (reviewCompletions.length && !input.reviewReceiptRef || root.graph.nodes.some(node => node.kind === 'judge') && !judgeCompletion) invalid();
    return { record, receipt, settlement, producer, graphResults, reviewCompletions, judgeCompletion };
}
