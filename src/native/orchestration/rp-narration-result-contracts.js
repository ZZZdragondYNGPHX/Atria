import { readHandoffReturn } from './handoff-return-contracts.js';
import { assertNativeId } from '../identity.js';
import { assertObject, assertCounter, assertDigest } from '../../../public/shared/native-orchestration-contracts.js';
import { hashNativeDocument as hash, equalNativeDocuments as equal } from '../repositories/common.js';
import { rpNativeOutputKey } from '../rp-output-protocol.js';
import { assertResultRecord, resultDependencyDigest } from './result-contracts.js';
import { modelResultId } from './result-publication-contracts.js';
import { controlRecordKey, readAttempt, assertAttemptCurrent } from './controller-common.js';
import { readPlanRevision } from './plan-repository.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';
import { readRpPlannerCompletion } from './rp-planner-contracts.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { readGraphNodeResult, graphResultPublicationId } from './graph-result-contracts.js';
import { readRpControlGraphHistory } from './rp-control-input-contracts.js';
import { readRpReviewCompletion } from './rp-review-contracts.js';
import { readRpJudgeCompletion } from './rp-judge-contracts.js';
import { rpAgentGraphProfile, rpAgentGraphOrder } from './rp-agent-graph-profile.js';
import { rpPlannerProfile } from './rp-planner-profile.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';
import { readContextRetrievalCompletions } from './context-retrieval-contracts.js';
import { readRpFanoutCompletion } from './rp-fanout-contracts.js';
import { audienceContextPin, assertAudienceRunCapture } from './audience-source-contracts.js';

const invalid = () => { throw new TypeError('Invalid RP Narrator Result facts'); };
export const rpNarrationPublicationId = resultId => 'oreceipt_' + hash({ kind: 'rp_narration_result', resultId }).slice(0, 32);
export const rpNarrationAudience = (root, grantDigest) => ({ kind: 'rp_output', runId: root.runId, nodeId: root.graph.outputContract.ownerNodeId,
    epoch: root.epoch, controlId: root.sourceBinding.sourceRequest.controlId,
    outputKey: rpNativeOutputKey(root.sourceBinding.sourceRequest.controlId, root.sourceBinding.sourceRequest.source),
    sourceBindingDigest: root.sourceBinding.bindingDigest, grantDigest, taskPurpose: 'original_rp_narration' });

export function rpNarrationResult({ root, proof, payload, grantDigest, now, status = 'complete' }) {
    if (!['complete', 'partial'].includes(status) || status === 'partial' && !root.graph.outputContract.allowPartial) invalid();
    const resultId = modelResultId(root.runId, proof.effectId), resultRef = { runId: root.runId, resultId };
    const envelope = { schemaVersion: 1, runId: root.runId, resultId, producerAttemptId: proof.producerAttemptId,
        outputType: 'text', outputSchemaRef: { kind: 'native_builtin', schema: 'text' },
        payloadRef: { kind: 'orchestration_result_payload', runId: root.runId, resultId, integrity: proof.payloadHash },
        sourceRefs: [{ kind: 'run_source', runId: root.runId, epoch: root.epoch, sourceBindingDigest: root.sourceBinding.bindingDigest,
            sourceAuthority: 'rp_chat', sourceRef: root.sourceBinding.sourceRef },
        { kind: 'effect_receipt', runId: root.runId, effectId: proof.effectId, receiptId: proof.receiptRef.receiptId, observedEpoch: root.epoch }],
        dependencyDigest: '', audienceConstraint: rpNarrationAudience(root, grantDigest), disclosureConstraint: { kind: 'same_source_rp_output_only' },
        qualityRefs: [], status, createdAt: now };
    envelope.dependencyDigest = resultDependencyDigest(envelope);
    return { resultRef, record: assertResultRecord({ schemaVersion: 1, runId: root.runId, resultId, envelope, payload }, { outputContract: root.graph.outputContract }) };
}

/** Historical protected record, not a body-consumption or fresh writer grant. */
export async function readRpNarrationResult(tx, handle, root) {
    if (!root.resultRefs.length) return null;
    if (root.parentRef !== null || root.graph.outputContract.kind !== 'rp_narration' || root.sourceBinding.sourceAuthority !== 'rp_chat'
    ) invalid();
    const candidates = [], graphResults = [], graphResultRefs = [];
    for (const ref of root.resultRefs) {
        if (await tx.getResource(controlRecordKey(handle, root.runId, 'receipt', rpNarrationPublicationId(ref.resultId)))) candidates.push(ref);
        else if (await tx.getResource(controlRecordKey(handle, root.runId, 'receipt', graphResultPublicationId(root.runId, ref.resultId)))) graphResultRefs.push(ref);
        else invalid();
    }
    if (candidates.length !== 1) invalid();
    const [resultRef] = candidates;
    const saved = await tx.getResource(controlRecordKey(handle, root.runId, 'result', resultRef.resultId));
    const publication = await tx.getResource(controlRecordKey(handle, root.runId, 'receipt', rpNarrationPublicationId(resultRef.resultId)));
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
    const retrievalCompletions = await readContextRetrievalCompletions(tx, handle, root, intent, producer);
    const source = root.sourceBinding, audience = { ...rpNarrationAudience(root, producer.effectiveGrantDigest), epoch: receipt.epoch };
    const partial = record.envelope.status === 'partial';
    if (receipt.schemaVersion !== 1 || receipt.receiptKind !== 'rp_narration_result' || receipt.receiptId !== rpNarrationPublicationId(resultRef.resultId)
        || receipt.runId !== root.runId || receipt.epoch > root.epoch || receipt.epoch !== producer.epoch || producer.status !== (partial ? 'partial' : 'completed')
        || !equal(resultRef, receipt.resultRef) || !equal(resultRef, { runId: root.runId, resultId: record.resultId })
        || receipt.resultIntegrity !== saved.integrity || receipt.resultIntegrity !== hash(record) || !['complete', 'partial'].includes(record.envelope.status)
        || record.envelope.producerAttemptId !== producer.attemptId || !equal(record.envelope.audienceConstraint, audience)
        || receipt.audienceDigest !== hash(audience) || receipt.grantDigest !== producer.effectiveGrantDigest
        || receipt.sourceBindingDigest !== source.bindingDigest || !equal(producer.resultRefs, [resultRef]) || !equal(producer.effectRefs, [receipt.modelEffectId, ...retrievalCompletions.map(item => item.effectId)])
        || settlement.reasonCode !== 'rp_narration_ready' || settlement.decisionSeq !== receipt.decisionSeq || settlement.createdAt !== receipt.createdAt
        || receipt.decisionSeq > root.eventSeq || !equal(settlement.effectReceiptRefs, [receipt.modelReceiptRef.receiptId, ...retrievalCompletions.map(item => item.receiptId)])
        || !model || !equal(model.receiptRef, receipt.modelReceiptRef)
        || model.observation.dispatchEvidence.reference.resultPayloadHash !== undefined && model.observation.dispatchEvidence.reference.resultPayloadHash !== hash(record.payload)
        || intent.nodeAttemptId !== producer.attemptId
        || intent.epoch !== receipt.epoch || intent.grantDigest !== receipt.grantDigest || intent.sourceBindingDigest !== source.bindingDigest
        || !equal(record.envelope.sourceRefs, [{ kind: 'run_source', runId: root.runId, epoch: receipt.epoch,
            sourceBindingDigest: source.bindingDigest, sourceAuthority: 'rp_chat', sourceRef: source.sourceRef },
        { kind: 'effect_receipt', runId: root.runId, effectId: receipt.modelEffectId, receiptId: receipt.modelReceiptRef.receiptId, observedEpoch: receipt.epoch }])) invalid();
    const input = intent.inputRef;
    const narratorNode = root.graph.nodes.find(node => node.nodeId === producer.nodeId);
    if (narratorNode.policy?.audiencePinId || Object.hasOwn(input, 'audienceCapture')) {
        const plan = await readPlanRevision(tx, handle, root.planRef);
        assertAudienceRunCapture(root, narratorNode, plan.dependencyPins, input);
    }
    let judgeCompletion = null, fanout = null;
    if (input.kind !== 'native_rp_intent' || input.nodeId !== producer.nodeId || input.role !== 'narrator'
        || !equal(input.planRef, root.planRef) || !equal(input.sourceRef, source.sourceRef)
        || !equal(input.audience, { kind: 'narrator' }) || producer.inputDigest !== hash(producer.inputRefs)) invalid();
    if (input.controlGraph) {
        if (partial) invalid();
        const history = await readRpControlGraphHistory(tx, handle, root, { record, receipt, settlement, producer });
        return { record, receipt, settlement, producer, ...history, judgeCompletion: null,
            retrievalCompletions: [...history.graphResults.flatMap(item => item.retrievalCompletions),
                ...history.plannerCompletions.flatMap(item => item.retrievalCompletions), ...history.reviewCompletions.flatMap(item => item.retrievalCompletions),
                ...history.judgeCompletions.flatMap(item => item.retrievalCompletions), ...retrievalCompletions] };
    }
    // The generic history above already verifies every Result and the exact
    // root.resultRefs list. Legacy consumers perform that full proof here.
    for (const ref of graphResultRefs) graphResults.push(await readGraphNodeResult(tx, handle, root, ref.resultId));
    if (producer.inputRefs[0]?.kind === 'native_rp_delegation') {
        if (producer.inputRefs.length !== 1 || input.parentInputDigest !== producer.inputDigest || !input.acceptedResultRef || !input.returnReceiptRef) invalid();
        const returned = await readHandoffReturn(tx, handle, root, input.acceptedResultRef.runId);
        if (!returned || !equal(returned.resultRef, input.acceptedResultRef)
            || !equal(input.returnReceiptRef, { runId: root.runId, receiptId: returned.receiptId })
            || returned.parentAttemptId !== producer.attemptId || returned.parentGrantDigest !== producer.effectiveGrantDigest
            || returned.decisionSeq >= receipt.decisionSeq) invalid();
    } else if (input.acceptedGraphResultRefs) {
        if (!input.acceptedGraphResultRefs.length || !equal(producer.inputRefs, [input, ...input.acceptedGraphResultRefs])) invalid();
        const accepted = input.acceptedGraphResultRefs.map(ref => graphResults.find(item => equal(item.receipt.resultRef, ref)));
        if (accepted.some(item => !item || !item.record.envelope.audienceConstraint.nodeIds.includes(producer.nodeId))
            || new Set(accepted.map(item => item.record.resultId)).size !== accepted.length) invalid();
        for (const source of accepted) await assertAttemptCurrent(tx, handle, root, source.producer);
        const [draft] = accepted, additionalProducers = [];
        if (input.joinReceiptRef) {
            const joined = await readRpFanoutCompletion(tx, handle, root); fanout = joined;
            if (!joined || input.judgeReceiptRef || input.reviewReceiptRef || input.joinReceiptRef.runId !== root.runId
                || input.joinReceiptRef.joinId !== joined.joinReceipt.joinId || joined.profile.transfer.to.nodeId !== producer.nodeId
                || !equal(input.acceptedGraphResultRefs, joined.joinReceipt.acceptedResultRefs)
                || partial !== (joined.joinReceipt.outcome === 'partial')
                || !equal(graphResults.map(item => hash(item.receipt.resultRef)).sort(), joined.graphResults.map(item => hash(item.receipt.resultRef)).sort())) invalid();
            const bindings = [{ edgeId: joined.profile.transfer.edgeId, producerAttemptId: joined.producer.attemptId }];
            const traversalId = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: null }).slice(0, 32);
            await assertOutputTransition(tx, handle, root, { published: joined, output: producer,
                receipt: { decisionSeq: receipt.decisionSeq, traversalReceiptRef: { runId: root.runId, receiptId: traversalId } } });
        } else if (input.judgeReceiptRef) {
            if (accepted.length !== 1 || input.reviewReceiptRef || input.judgeReceiptRef.runId !== root.runId) invalid();
            const decision = (await tx.getResource(controlRecordKey(handle, root.runId, 'receipt', input.judgeReceiptRef.receiptId)))?.doc;
            judgeCompletion = decision ? await readRpJudgeCompletion(tx, handle, root, decision.producerAttemptId) : null;
            if (!judgeCompletion || !equal(input.judgeReceiptRef, { runId: root.runId, receiptId: judgeCompletion.receipt.receiptId })
                || !equal(judgeCompletion.receipt.selectedResultRef, draft.receipt.resultRef)
                || !equal(graphResults.map(item => item.receipt.resultRef), judgeCompletion.receipt.candidateRefs)) invalid();
            additionalProducers.push(judgeCompletion);
        } else if (input.reviewReceiptRef) {
            if (accepted.length !== 1 || input.reviewReceiptRef.runId !== root.runId) invalid();
            const decision = (await tx.getResource(controlRecordKey(handle, root.runId, 'receipt', input.reviewReceiptRef.receiptId)))?.doc;
            const reviewed = decision ? await readRpReviewCompletion(tx, handle, root, decision.reviewAttemptId) : null;
            if (!reviewed || reviewed.review.decision !== 'approve' || !equal(reviewed.receipt.reviewReceiptRef, input.reviewReceiptRef)
                || !equal(reviewed.review.evidenceRefs, [draft.receipt.resultRef])) invalid();
            additionalProducers.push(reviewed);
        } else {
            const plan = await readPlanRevision(tx, handle, root.planRef), originalPrefix = rpPlannerProfile(plan);
            const activePlan = originalPrefix?.expansion ? { ...plan, definition: (await readTaskGraphRevision(tx, handle, root)).graph } : plan;
            const prefix = originalPrefix?.expansion ? rpPlannerProfile(activePlan) : originalPrefix, graph = prefix?.agentGraph ?? rpAgentGraphProfile(activePlan);
            const planner = prefix ? await readRpPlannerCompletion(tx, handle, root) : null;
            if (!graph || !equal(root.graph, activePlan.definition) || graphResults.length !== graph.drafts.length
                || !equal(graphResults.map(item => item.producer.nodeId), rpAgentGraphOrder(graph, root.nodeControl).slice(0, -1).map(node => node.nodeId))) invalid();
            const direct = nodeId => graph.inputs[nodeId].map(edge => graphResults.find(item => item.producer.nodeId === edge.from.nodeId));
            if (!equal(input.acceptedGraphResultRefs, direct(producer.nodeId).map(item => item.receipt.resultRef))) invalid();
            additionalProducers.push(...accepted.slice(1));
            for (const source of graphResults) {
                await assertAttemptCurrent(tx, handle, root, source.producer);
                const effect = (await readEffect(tx, handle, root, source.receipt.modelEffectId)).doc, input = effect.inputRef;
                const predecessors = direct(source.producer.nodeId), refs = predecessors.map(item => item.receipt.resultRef);
                if (input.kind !== 'native_rp_intent' || input.role !== 'narrator' || input.nodeId !== source.producer.nodeId
                    || !equal(input.planRef, root.planRef) || !equal(input.sourceRef, root.sourceBinding.sourceRef)
                    || !equal(input.audience, audienceContextPin(root.graph.nodes.find(node => node.nodeId === source.producer.nodeId), plan.dependencyPins)?.resourceRef.audience ?? { kind: 'narrator' })
                    || (refs.length ? !equal(input.acceptedGraphResultRefs, refs) : Object.hasOwn(input, 'acceptedGraphResultRefs'))
                    || !equal(source.producer.inputRefs, [input, ...refs])) invalid();
                if (planner && !equal(input.controlReceiptRef, { runId: root.runId, receiptId: planner.receipt.receiptId })) invalid();
                if (!predecessors.length) {
                    if (planner) {
                        const edge = prefix.transfers.find(edge => edge.to.nodeId === source.producer.nodeId);
                        if (!edge || planner.patch.requests.replan) invalid();
                        const bindings = [{ edgeId: edge.edgeId, producerAttemptId: planner.producer.attemptId }];
                        const receiptId = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: null }).slice(0, 32);
                        await assertOutputTransition(tx, handle, root, { published: planner, output: source.producer,
                            receipt: { decisionSeq: source.receipt.decisionSeq, traversalReceiptRef: { runId: root.runId, receiptId } } });
                    }
                    continue;
                }
                if (predecessors.some(item => !item.record.envelope.audienceConstraint.nodeIds.includes(source.producer.nodeId))) invalid();
                const bindings = graph.inputs[source.producer.nodeId].map((edge, index) => ({ edgeId: edge.edgeId, producerAttemptId: predecessors[index].producer.attemptId }));
                const traversalId = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: null }).slice(0, 32);
                await assertOutputTransition(tx, handle, root, { published: predecessors[0], additionalProducers: predecessors.slice(1), output: source.producer,
                    receipt: { decisionSeq: source.receipt.decisionSeq, traversalReceiptRef: { runId: root.runId, receiptId: traversalId } } });
            }
            if (planner && prefix.transfers.some(edge => edge.to.nodeId === producer.nodeId)) additionalProducers.push(planner);
        }
        if (!equal(producer.inputRefs, [input, ...input.acceptedGraphResultRefs])) invalid();
        if (!input.joinReceiptRef) {
            const edges = [draft, ...additionalProducers].map(source => root.graph.edges.find(item => item.from.nodeId === source.producer.nodeId && item.to.nodeId === producer.nodeId));
            if (edges.some(edge => !edge)) invalid();
            const bindings = edges.map((edge, index) => ({ edgeId: edge.edgeId, producerAttemptId: [draft, ...additionalProducers][index].producer.attemptId })).sort((a, b) => a.edgeId.localeCompare(b.edgeId));
            const traversalId = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: null }).slice(0, 32);
            await assertOutputTransition(tx, handle, root, { published: draft, additionalProducers, output: producer,
                receipt: { decisionSeq: receipt.decisionSeq, traversalReceiptRef: { runId: root.runId, receiptId: traversalId } } });
        }
    } else if (!equal(producer.inputRefs, [input]) || graphResults.length) invalid();
    if (partial && !fanout) invalid();
    let plannerCompletions = [];
    if (root.graph.nodes.some(node => node.kind === 'planner')) {
        const planner = await readRpPlannerCompletion(tx, handle, root);
        if (!planner || planner.patch.requests.replan || !equal(input.controlReceiptRef, { runId: root.runId, receiptId: planner.receipt.receiptId })) invalid();
        plannerCompletions = planner.history;
        const edge = root.graph.edges.find(item => item.from.nodeId === planner.producer.nodeId && item.to.nodeId === producer.nodeId);
        if (!graphResults.length) {
            if (!edge) invalid();
            const traversalId = 'oreceipt_' + hash({ runId: root.runId, bindings: [{ edgeId: edge.edgeId, producerAttemptId: planner.producer.attemptId }], reservedAttemptId: null }).slice(0, 32);
            await assertOutputTransition(tx, handle, root, { published: planner, output: producer, receipt: { decisionSeq: receipt.decisionSeq, traversalReceiptRef: { runId: root.runId, receiptId: traversalId } } });
        }
    }
    const reviewCompletions = [];
    for (const id of root.attemptRefs) {
        const { doc: attempt } = await readAttempt(tx, handle, root, id);
        if (root.graph.nodes.find(node => node.nodeId === attempt.nodeId).kind !== 'review') continue;
        const reviewed = await readRpReviewCompletion(tx, handle, root, id);
        if (!reviewed) invalid(); reviewCompletions.push(reviewed);
    }
    if (reviewCompletions.length && !input.reviewReceiptRef || root.graph.nodes.some(node => node.kind === 'judge') && !judgeCompletion) invalid();
    return { record, receipt, settlement, producer, graphResults, plannerCompletions, reviewCompletions, judgeCompletion, fanout, retrievalCompletions: [...graphResults.flatMap(item => item.retrievalCompletions), ...plannerCompletions.flatMap(item => item.retrievalCompletions), ...reviewCompletions.flatMap(item => item.retrievalCompletions), ...(judgeCompletion?.retrievalCompletions ?? []), ...retrievalCompletions] };
}
