import { readSessionReplanHistory } from './session-replan-contracts.js';
import { readSessionDelegationContinuation } from './session-delegation-contracts.js';
import { readSessionPlannerCompletion } from './session-planner-contracts.js';
import { readSessionJudgeCompletion, assertSessionJudgeSelections } from './session-judge-contracts.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';
import { readSessionFanoutCompletion } from './session-fanout-contracts.js';
import { assertAudienceRunCapture } from './audience-source-contracts.js';
import { assertNativeId } from '../identity.js';
import { assertObject, assertCounter, assertDigest } from '../../../public/shared/native-orchestration-contracts.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertResultRecord, resultDependencyDigest } from './result-contracts.js';
import { modelResultId } from './result-publication-contracts.js';
import { controlRecordKey, readAttempt, readAttemptInvalidation } from './controller-common.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';
import { readContextRetrievalCompletions } from './context-retrieval-contracts.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { readSessionReviewCompletion } from './session-review-contracts.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid Session Narrator Result facts'); };
export const sessionNarrationPublicationId = resultId => 'oreceipt_' + hash({ kind: 'session_narration_result', resultId }).slice(0, 32);
export const sessionOutputKey = root => hash({ kind: 'native_session_output', ...root.sourceBinding.sourceRef, slot: 'assistant' });
export const sessionNarrationAudience = (root, grantDigest) => ({ kind: 'session_output', runId: root.runId, nodeId: root.graph.outputContract.ownerNodeId,
    epoch: root.epoch, ...root.sourceBinding.sourceRef, outputKey: sessionOutputKey(root),
    sourceBindingDigest: root.sourceBinding.bindingDigest, grantDigest, taskPurpose: 'original_native_narrator' });

export function sessionNarrationResult({ root, proof, payload, grantDigest, now }) {
    const resultId = modelResultId(root.runId, proof.effectId), resultRef = { runId: root.runId, resultId };
    const envelope = { schemaVersion: 1, runId: root.runId, resultId, producerAttemptId: proof.producerAttemptId,
        outputType: 'text', outputSchemaRef: { kind: 'native_builtin', schema: 'text' },
        payloadRef: { kind: 'orchestration_result_payload', runId: root.runId, resultId, integrity: proof.payloadHash },
        sourceRefs: [{ kind: 'run_source', runId: root.runId, epoch: root.epoch, sourceBindingDigest: root.sourceBinding.bindingDigest,
            sourceAuthority: 'native_session', sourceRef: root.sourceBinding.sourceRef },
        { kind: 'effect_receipt', runId: root.runId, effectId: proof.effectId, receiptId: proof.receiptRef.receiptId, observedEpoch: root.epoch }],
        dependencyDigest: '', audienceConstraint: sessionNarrationAudience(root, grantDigest), disclosureConstraint: { kind: 'same_source_session_output_only' },
        qualityRefs: [], status: 'complete', createdAt: now };
    envelope.dependencyDigest = resultDependencyDigest(envelope);
    return { resultRef, record: assertResultRecord({ schemaVersion: 1, runId: root.runId, resultId, envelope, payload }, { outputContract: root.graph.outputContract }) };
}

/** Historical protected record, not a body-consumption or fresh writer grant. */
export async function readSessionNarrationResult(tx, handle, root) {
    if (!root.resultRefs.length) return null;
    if (root.parentRef !== null || root.graph.outputContract.kind !== 'rp_narration' || root.sourceBinding.sourceAuthority !== 'native_session') invalid();
    const finals = [], graphResults = [];
    for (const ref of root.resultRefs) {
        const receipt = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', sessionNarrationPublicationId(ref.resultId)));
        if (receipt) finals.push(ref);
        else {
            const result = await readGraphNodeResult(tx, handle, root, ref.resultId);
            if (!result) invalid(); graphResults.push(result);
        }
    }
    if (!finals.length) return null;
    if (finals.length !== 1) invalid();
    const [resultRef] = finals;
    const saved = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'result', resultRef.resultId));
    const publication = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', sessionNarrationPublicationId(resultRef.resultId)));
    if (!saved || !publication) invalid();
    const record = assertResultRecord(saved.doc, { outputContract: root.graph.outputContract }), receipt = publication.doc;
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'producerAttemptId', 'resultRef', 'resultIntegrity',
        'modelEffectId', 'modelReceiptRef', 'grantDigest', 'sourceBindingDigest', 'audienceDigest', 'decisionSeq', 'createdAt'], 'Session Narrator publication');
    assertCounter(receipt.epoch, 'epoch'); assertCounter(receipt.decisionSeq, 'decisionSeq', 1); assertCounter(receipt.createdAt, 'createdAt');
    for (const field of ['resultIntegrity', 'grantDigest', 'sourceBindingDigest', 'audienceDigest']) assertDigest(receipt[field], field);
    for (const [field, kind] of [['receiptId', 'orchestrationReceipt'], ['runId', 'orchestrationRun'], ['producerAttemptId', 'orchestrationAttempt'], ['modelEffectId', 'orchestrationEffect']]) assertNativeId(receipt[field], kind);
    assertObject(receipt.modelReceiptRef, ['runId', 'receiptId'], 'Session model receipt');
    if (receipt.modelReceiptRef.runId !== root.runId || resultRef.resultId !== modelResultId(root.runId, receipt.modelEffectId)) invalid();
    assertNativeId(receipt.modelReceiptRef.receiptId, 'orchestrationReceipt');
    const producer = (await readAttempt(tx, handle, root, receipt.producerAttemptId)).doc;
    const settlement = await readAttemptSettlement(tx, handle, root, producer);
    const intent = (await readEffect(tx, handle, root, receipt.modelEffectId)).doc;
    const model = await readModelCompletionReceipt(handle, tx, root, intent);
    const retrievalCompletions = await readContextRetrievalCompletions(tx, handle, root, intent, producer);
    const source = root.sourceBinding, audience = { ...sessionNarrationAudience(root, producer.effectiveGrantDigest), epoch: receipt.epoch };
    if (receipt.schemaVersion !== 1 || receipt.receiptKind !== 'session_narration_result' || receipt.receiptId !== sessionNarrationPublicationId(resultRef.resultId)
        || receipt.runId !== root.runId || receipt.epoch > root.epoch || receipt.epoch !== producer.epoch || producer.status !== 'completed'
        || !equal(resultRef, receipt.resultRef) || !equal(resultRef, { runId: root.runId, resultId: record.resultId })
        || receipt.resultIntegrity !== saved.integrity || receipt.resultIntegrity !== hash(record) || record.envelope.status !== 'complete'
        || record.envelope.producerAttemptId !== producer.attemptId || !equal(record.envelope.audienceConstraint, audience)
        || receipt.audienceDigest !== hash(audience) || receipt.grantDigest !== producer.effectiveGrantDigest
        || receipt.sourceBindingDigest !== source.bindingDigest || !equal(producer.resultRefs, [resultRef]) || !equal(producer.effectRefs, [receipt.modelEffectId, ...retrievalCompletions.map(item => item.effectId)])
        || settlement.reasonCode !== 'session_narration_ready' || settlement.decisionSeq !== receipt.decisionSeq || settlement.createdAt !== receipt.createdAt
        || receipt.decisionSeq > root.eventSeq || !equal(settlement.effectReceiptRefs, [receipt.modelReceiptRef.receiptId, ...retrievalCompletions.map(item => item.receiptId)])
        || !model || !equal(model.receiptRef, receipt.modelReceiptRef) || intent.nodeAttemptId !== producer.attemptId
        || intent.epoch !== receipt.epoch || intent.grantDigest !== receipt.grantDigest || intent.sourceBindingDigest !== source.bindingDigest
        || !equal(record.envelope.sourceRefs, [{ kind: 'run_source', runId: root.runId, epoch: receipt.epoch,
            sourceBindingDigest: source.bindingDigest, sourceAuthority: 'native_session', sourceRef: source.sourceRef },
        { kind: 'effect_receipt', runId: root.runId, effectId: receipt.modelEffectId, receiptId: receipt.modelReceiptRef.receiptId, observedEpoch: receipt.epoch }])) invalid();
    const input = intent.inputRef;
    if (input.kind !== 'native_turn_intent' || input.nodeId !== producer.nodeId || input.role !== 'narrator'
        || !equal(input.planRef, root.planRef) || !equal(producer.inputRefs, [input, ...(input.acceptedGraphResultRefs ?? []), ...(input.acceptedControlRefs ?? [])]) || producer.inputDigest !== hash(producer.inputRefs)
        || !['sessionId', 'branchId', 'revisionId'].every(field => input.sourceRef[field] === source.sourceRef[field])
        || !equal(input.audience, { kind: 'narrator' }) || input.grantDigest !== producer.effectiveGrantDigest) invalid();
    assertNativeId(input.sourceRef.packageId, 'package'); assertNativeId(input.sourceRef.packageVersionId, 'packageVersion');
    const narratorNode = root.graph.nodes.find(node => node.nodeId === producer.nodeId);
    if (narratorNode.policy.audiencePinId !== undefined) {
        const plan = await readPlanRevision(tx, handle, root.planRef);
        assertAudienceRunCapture(root, narratorNode, plan.dependencyPins, input);
    }
    const reviewCompletions = [];
    for (const id of root.attemptRefs) {
        const attempt = (await readAttempt(tx, handle, root, id)).doc;
        if (root.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind !== 'review') continue;
        const reviewed = await readSessionReviewCompletion(tx, handle, root, id);
        if (!reviewed) invalid(); reviewCompletions.push(reviewed);
    }
    const plannerCompletions = [];
    for (const id of root.attemptRefs) {
        const attempt = (await readAttempt(tx, handle, root, id)).doc;
        if (root.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind !== 'planner') continue;
        const completed = await readSessionPlannerCompletion(tx, handle, root, id);
        if (!completed) invalid(); plannerCompletions.push(completed);
    }
    const judgeCompletions = [];
    for (const id of root.attemptRefs) {
        const attempt = (await readAttempt(tx, handle, root, id)).doc;
        if (root.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind !== 'judge') continue;
        const completed = await readSessionJudgeCompletion(tx, handle, root, id);
        if (!completed) invalid(); judgeCompletions.push(completed);
    }
    if (root.graphRevision !== plannerCompletions.length) invalid();
    const fanoutCompletions = [];
    for (const id of root.attemptRefs) {
        const attempt = (await readAttempt(tx, handle, root, id)).doc;
        if (root.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind !== 'join') continue;
        const completion = await readSessionFanoutCompletion(tx, handle, root, id);
        if (!completion) invalid(); fanoutCompletions.push(completion);
    }
    for (const fact of [...graphResults, ...reviewCompletions, ...plannerCompletions, ...judgeCompletions, { producer, receipt }]) {
        const effect = (await readEffect(tx, handle, root, fact.receipt.modelEffectId)).doc, modelInput = effect.inputRef;
        const snapshot = await readTaskGraphRevision(tx, handle, root, fact.producer.graphRevision);
        const incoming = snapshot.graph.edges.filter(edge => edge.to.nodeId === fact.producer.nodeId
            && ['planner', 'judge', 'review'].includes(snapshot.graph.nodes.find(node => node.nodeId === edge.from.nodeId)?.kind)).sort((a, b) => a.edgeId.localeCompare(b.edgeId));
        const available = [...plannerCompletions, ...judgeCompletions, ...reviewCompletions.filter(item => item.controlRef)];
        const controls = incoming.flatMap(edge => {
            const actual = available.filter(item => item.producer.nodeId === edge.from.nodeId
                && (modelInput.acceptedControlRefs ?? []).some(ref => equal(ref, item.controlRef)));
            if (actual.length > 1) invalid();
            if (!actual.length && snapshot.graph.nodes.find(node => node.nodeId === edge.from.nodeId)?.kind === 'review'
                && reviewCompletions.some(item => !item.controlRef && item.producer.nodeId === edge.from.nodeId)) return [];
            if (!actual.length && !snapshot.graph.nodes.find(node => node.nodeId === fact.producer.nodeId).inputs.find(port => port.name === edge.to.port)?.required) return [];
            return actual.length ? actual : [null];
        });
        assertSessionJudgeSelections(root, snapshot.graph.nodes.find(node => node.nodeId === fact.producer.nodeId), modelInput.acceptedGraphResultRefs ?? [], controls.filter(item => item?.candidates));
        const delegated = fact.producer.inputRefs[0]?.kind === 'native_session_delegation';
        if (delegated) await readSessionDelegationContinuation(tx, handle, root, fact.producer, effect);
        if (controls.some(item => !item || item.receipt.decisionSeq >= fact.receipt.decisionSeq)
            || !equal(modelInput.acceptedControlRefs ?? [], controls.map(item => item.controlRef))
            || !delegated && !equal(fact.producer.inputRefs, [modelInput, ...(modelInput.acceptedGraphResultRefs ?? []), ...controls.map(item => item.controlRef)])) invalid();
        if (!delegated && !modelInput.fanoutAttemptId && !modelInput.reviewFeedbackRef && fact.receipt.receiptKind !== 'graph_review_model'
            && controls.some(item => item.controlRef.kind === 'graph_review_control')) {
            const evidence = (modelInput.acceptedGraphResultRefs ?? []).map(ref => graphResults.find(item => equal(item.receipt.resultRef, ref)));
            if (evidence.some(item => !item)) invalid();
            const edges = snapshot.graph.edges.filter(edge => edge.to.nodeId === fact.producer.nodeId && !edge.loopBack).sort((a, b) => a.edgeId.localeCompare(b.edgeId));
            const sources = [], bindings = [];
            for (const edge of edges) {
                const candidates = [...evidence, ...controls, ...fanoutCompletions.filter(item => modelInput.joinReceiptRefs?.some(ref => equal(ref,
                    { runId: root.runId, joinId: item.joinReceipt.joinId })))].filter(item => item.producer.nodeId === edge.from.nodeId);
                if (candidates.length > 1 || !candidates.length && snapshot.graph.nodes.find(node => node.nodeId === fact.producer.nodeId).inputs.find(port => port.name === edge.to.port)?.required) invalid();
                if (!candidates.length) continue;
                if (!sources.includes(candidates[0])) sources.push(candidates[0]);
                bindings.push({ edgeId: edge.edgeId, producerAttemptId: candidates[0].producer.attemptId });
            }
            const traversalId = 'oreceipt_' + hash({ runId: root.runId, bindings, reservedAttemptId: null }).slice(0, 32);
            await assertOutputTransition(tx, handle, root, { published: sources[0], additionalProducers: sources.slice(1), output: fact.producer,
                producerBindings: bindings, receipt: { decisionSeq: fact.receipt.decisionSeq, traversalReceiptRef: { runId: root.runId, receiptId: traversalId } } });
        }
    }
    const reviewedPlanner = plannerCompletions.some(planner => reviewCompletions.some(review => review.review.invalidatedAttemptIds.includes(planner.producer.attemptId)));
    const loopHistory = root.graph.edges.some(edge => edge.loopBack) || reviewedPlanner ? await readSessionReplanHistory(tx, handle, root,
        { graphResults, plannerCompletions, reviewCompletions, judgeCompletions, fanoutCompletions, narrator: { producer, receipt, settlement } }) : null;
    if (graphResults.length) {
        const incoming = root.graph.edges.filter(edge => edge.to.nodeId === producer.nodeId && !['review', 'planner', 'judge'].includes(root.graph.nodes.find(node => node.nodeId === edge.from.nodeId)?.kind)).sort((a, b) => a.edgeId.localeCompare(b.edgeId));
        const current = [];
        for (const result of graphResults) if (loopHistory ? loopHistory.current.get(result.producer.nodeId)?.producer.attemptId === result.producer.attemptId
            : !await readAttemptInvalidation(tx, handle, root, result.producer)) current.push(result);
        if (new Set(current.map(result => result.producer.nodeId)).size !== current.length) invalid();
        const accepted = incoming.flatMap(edge => {
            if (root.graph.nodes.find(node => node.nodeId === edge.from.nodeId)?.kind !== 'join') {
                const result = current.find(result => result.producer.nodeId === edge.from.nodeId);
                const selectors = judgeCompletions.filter(judge => root.graph.edges.some(item => item.from.nodeId === judge.producer.nodeId && item.to.nodeId === producer.nodeId));
                if (result && selectors.some(judge => judge.candidates.some(candidate => equal(candidate.receipt.resultRef, result.receipt.resultRef))
                    && !equal(judge.selectedResultRef, result.receipt.resultRef))) {
                    if (narratorNode.inputs.find(port => port.name === edge.to.port)?.required) invalid();
                    return [];
                }
                return [result];
            }
            const joined = fanoutCompletions.find(item => item.producer.nodeId === edge.from.nodeId);
            if (!joined || joined.joinReceipt.outcome !== 'completed'
                || !input.joinReceiptRefs?.some(ref => equal(ref, { runId: root.runId, joinId: joined.joinReceipt.joinId }))) invalid();
            return joined.members;
        });
        const expectedJoins = incoming.filter(edge => root.graph.nodes.find(node => node.nodeId === edge.from.nodeId)?.kind === 'join')
            .map(edge => fanoutCompletions.find(item => item.producer.nodeId === edge.from.nodeId))
            .map(item => ({ runId: root.runId, joinId: item.joinReceipt.joinId }));
        if (expectedJoins.length ? !equal(input.joinReceiptRefs, expectedJoins) : Object.hasOwn(input, 'joinReceiptRefs')) invalid();
        if (accepted.some(result => !result) || !equal(input.acceptedGraphResultRefs, accepted.map(result => result.receipt.resultRef))
            || accepted.some(result => !result.record.envelope.audienceConstraint.nodeIds.includes(producer.nodeId))) invalid();
        const legacyReviews = reviewCompletions.filter(item => !item.controlRef);
        if (legacyReviews.length) {
            const approved = legacyReviews.at(-1);
            if (approved.review.decision !== 'approve' || !equal(input.reviewReceiptRef, approved.receipt.reviewReceiptRef)
                || !equal(approved.review.evidenceRefs, accepted.map(result => result.receipt.resultRef))
                || !equal(approved.review.targetAttemptIds, accepted.map(result => result.producer.attemptId))) invalid();
        } else if (Object.hasOwn(input, 'reviewReceiptRef')) invalid();
    } else if (Object.hasOwn(input, 'acceptedGraphResultRefs') && (!plannerCompletions.length || !equal(input.acceptedGraphResultRefs, []))) invalid();
    return { record, receipt, settlement, producer, retrievalCompletions, graphResults, reviewCompletions, plannerCompletions, judgeCompletions, fanoutCompletions, loopHistory, modelIntent: intent };
}
