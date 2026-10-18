import { hashNativeDocument as hash, equalNativeDocuments as equal } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { assertNativeId } from '../identity.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { readPlanRevision } from './plan-repository.js';
import { readAttempt, controlCommandId, controlRecordKey, assertAttemptConsumable } from './controller-common.js';
import { readAttemptSettlement, assertResultRefs } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';
import { readContextRetrievalCompletions } from './context-retrieval-contracts.js';
import { readGraphNodeResults } from './graph-result-contracts.js';
import { assertAudienceRunCapture } from './audience-source-contracts.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { readGraphFanoutInput } from './graph-fanout-completion.js';

const invalid = () => { throw new TypeError('Invalid Graph Judge completion facts'); };
export const graphJudgeModelReceiptId = (runId, attemptId) => 'oreceipt_' + hash({ kind: 'graph_judge_model', runId, attemptId }).slice(0, 32);
export const graphJudgeControlRef = (runId, attemptId) => ({ kind: 'graph_judge_control', runId, attemptId,
    receiptId: graphJudgeModelReceiptId(runId, attemptId) });

/** Original Model, typed candidates, control command and bank facts only.
 * Selection is advisory. It never declassifies a candidate, widens an audience,
 * creates a Result or grants a Source, provider send or domain write. */
export async function readGraphJudgeCompletion(tx, handle, root, attemptId, { verifyControlWork, readControlInputs = null, recipient = null }) {
    if (typeof verifyControlWork !== 'function') invalid();
    const producer = (await readAttempt(tx, handle, root, attemptId)).doc, receiptId = graphJudgeModelReceiptId(root.runId, attemptId);
    const receipt = (await tx.getResource(controlRecordKey(handle, root.runId, 'receipt', receiptId)))?.doc;
    if (!receipt) return null;
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'producerAttemptId', 'sourceBindingDigest', 'grantDigest',
        'modelEffectId', 'modelReceiptRef', 'modelPayloadHash', 'responseText', 'candidateRefs', 'selectedResultRef', 'localWork', 'decisionSeq', 'createdAt'], 'Graph Judge Model receipt');
    assertResultRefs(receipt.candidateRefs);
    const snapshot = await readTaskGraphRevision(tx, handle, root, producer.graphRevision);
    const node = snapshot.graph.nodes.find(node => node.nodeId === producer.nodeId);
    const settlement = await readAttemptSettlement(tx, handle, root, producer);
    const intent = (await readEffect(tx, handle, root, receipt.modelEffectId)).doc, model = await readModelCompletionReceipt(handle, tx, root, intent);
    const retrieval = await readContextRetrievalCompletions(tx, handle, root, intent, producer);
    let response;
    try { response = JSON.parse(receipt.responseText); } catch { invalid(); }
    assertObject(response, ['selectedResultRef', 'reasonCode'], 'Graph Judge response');
    assertResultRefs([response.selectedResultRef]);
    const project = root.sourceBinding.sourceAuthority === 'project', payload = project ? { text: receipt.responseText, toolCalls: [] } : receipt.responseText;
    if (receipt.schemaVersion !== 1 || receipt.receiptKind !== 'graph_judge_model' || receipt.receiptId !== receiptId || receipt.runId !== root.runId
        || receipt.producerAttemptId !== attemptId || producer.status !== 'completed' || producer.epoch !== receipt.epoch || receipt.epoch > root.epoch
        || node?.kind !== 'judge' || !node.capabilities.includes('generation.send') || producer.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || receipt.sourceBindingDigest !== root.sourceBinding.bindingDigest || receipt.grantDigest !== producer.effectiveGrantDigest
        || !equal(producer.effectRefs, [receipt.modelEffectId, ...retrieval.map(item => item.effectId)]) || producer.resultRefs.length
        || !receipt.candidateRefs.length || !receipt.candidateRefs.some(ref => equal(ref, receipt.selectedResultRef))
        || !equal(receipt.selectedResultRef, response.selectedResultRef) || response.reasonCode !== 'candidate_selected'
        || intent.nodeAttemptId !== attemptId || intent.epoch !== producer.epoch || intent.graphRevision !== producer.graphRevision
        || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest || intent.grantDigest !== producer.effectiveGrantDigest
        || !model || !equal(model.receiptRef, receipt.modelReceiptRef) || hash(payload) !== receipt.modelPayloadHash
        || model.observation.dispatchEvidence.reference.resultPayloadHash !== receipt.modelPayloadHash
        || model.observation.dispatchEvidence.reference.resultOutputType !== (project ? 'json' : 'text')
        || !equal(settlement.effectReceiptRefs, [receipt.modelReceiptRef.receiptId, ...retrieval.map(item => item.receiptId)])
        || settlement.reasonCode !== 'graph_judge_selected' || settlement.decisionSeq !== receipt.decisionSeq
        || settlement.createdAt !== receipt.createdAt || receipt.decisionSeq > root.eventSeq) invalid();
    const delegatedProject = root.sourceBinding.sourceAuthority === 'project' && root.parentRef !== null;
    const delegatedSession = root.sourceBinding.sourceAuthority === 'native_session' && root.parentRef !== null;
    const delegatedRp = root.sourceBinding.sourceAuthority === 'rp_chat' && root.parentRef !== null;
    const input = intent.inputRef, kinds = { project: delegatedProject ? 'native_project_delegated_intent' : 'native_project_intent', rp_chat: delegatedRp ? 'native_rp_delegated_intent' : 'native_rp_intent',
        native_session: delegatedSession ? 'native_session_delegated_intent' : 'native_turn_intent' };
    if (root.sourceBinding.sourceAuthority === 'native_session') {
        assertObject(input.sourceRef, delegatedSession ? ['sessionId', 'branchId', 'revisionId']
            : ['sessionId', 'branchId', 'revisionId', 'packageId', 'packageVersionId'], 'Session Judge Source');
        if (!delegatedSession) { assertNativeId(input.sourceRef.packageId, 'package'); assertNativeId(input.sourceRef.packageVersionId, 'packageVersion'); }
    }
    const sourceRef = root.sourceBinding.sourceAuthority === 'native_session'
        ? Object.fromEntries(['sessionId', 'branchId', 'revisionId'].map(field => [field, input.sourceRef[field]])) : input.sourceRef;
    if (!Object.hasOwn(kinds, root.sourceBinding.sourceAuthority) || input.kind !== kinds[root.sourceBinding.sourceAuthority]
        || input.nodeId !== producer.nodeId || input.role !== (project ? 'studio' : 'narrator') || !equal(input.planRef, root.planRef)
        || !equal(sourceRef, root.sourceBinding.sourceRef) || !equal(input.acceptedGraphResultRefs, receipt.candidateRefs)
        || !equal(input, producer.inputRefs[0]) || producer.inputDigest !== hash(producer.inputRefs) || intent.inputHash !== hash(input)
        || receipt.candidateRefs.some(ref => !producer.inputRefs.some(actual => equal(actual, ref)))) invalid();
    if (delegatedRp && (input.parentRunId !== root.parentRef.parentRunId || input.parentAttemptId !== root.parentRef.nodeAttemptId
        || input.childRunId !== root.runId || producer.effectiveGrantDigest !== root.parentRef.effectiveGrantDigest
        || !node.policy?.audiencePinId && !equal(input.audience, { kind: 'task', id: root.runId }))) invalid();
    if ((delegatedSession || delegatedProject) && (input.parentRunId !== root.parentRef.parentRunId || input.parentAttemptId !== root.parentRef.nodeAttemptId
        || input.parentEpoch !== root.parentRef.parentEpoch || input.childRunId !== root.runId || input.childEpoch !== producer.epoch
        || input.delegationInputDigest !== root.parentRef.inputDigest || producer.effectiveGrantDigest !== root.parentRef.effectiveGrantDigest)) invalid();
    if (node.policy?.audiencePinId || Object.hasOwn(input, 'audienceCapture')) {
        const plan = await readPlanRevision(tx, handle, root.planRef);
        assertAudienceRunCapture(root, node, plan.dependencyPins, input);
    }
    const candidates = [], bindings = []; let inheritedFrame = null;
    const candidateFacts = await readGraphNodeResults(tx, handle, root, receipt.candidateRefs.map(ref => ref.resultId));
    for (const ref of receipt.candidateRefs) {
        if (ref.runId !== root.runId) invalid();
        const fact = candidateFacts.get(ref.resultId);
        const edges = snapshot.graph.edges.filter(edge => edge.from.nodeId === fact?.producer.nodeId && edge.to.nodeId === producer.nodeId && !edge.loopBack);
        if (!fact || !equal(fact.receipt.resultRef, ref) || !fact.record.envelope.audienceConstraint.nodeIds.includes(producer.nodeId)
            || fact.receipt.decisionSeq >= receipt.decisionSeq) invalid();
        if (!edges.length) {
            if (!input.fanoutAttemptId) invalid();
            inheritedFrame = (await readGraphFanoutInput(tx, handle, root, input.fanoutAttemptId, producer, ref, fact, { historical: true })).frame;
        }
        bindings.push(...edges.map(edge => ({ edgeId: edge.edgeId, producerAttemptId: fact.producer.attemptId })));
        candidates.push(fact);
    }
    // Domain controls retain their original typed readers and bank verifier;
    // all sources still need the exact original admitted Transition.
    const allBindings = [...(input.controlGraph?.bindings ?? (delegatedSession || delegatedProject ? input.graphBindings : bindings))].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
    if (bindings.some(binding => !allBindings.some(actual => equal(actual, binding)))) invalid();
    const sources = [...candidates];
    if (allBindings.length !== bindings.length) {
        if (typeof readControlInputs !== 'function') invalid();
        const controls = await readControlInputs(tx, handle, root, producer, input);
        if (!Array.isArray(controls)) invalid();
        for (const fact of controls) if (!sources.some(source => source.producer.attemptId === fact.producer.attemptId)) sources.push(fact);
    }
    const reservedAttemptId = producer.reservationRef ? producer.attemptId : null;
    const traversalId = 'oreceipt_' + hash({ runId: root.runId, bindings: allBindings, reservedAttemptId }).slice(0, 32);
    const directSources = sources.filter(fact => allBindings.some(binding => binding.producerAttemptId === fact.producer.attemptId));
    if (allBindings.length) await assertOutputTransition(tx, handle, root, { published: directSources[0], additionalProducers: directSources.slice(1), output: producer,
        receipt: { decisionSeq: receipt.decisionSeq, traversalReceiptRef: { runId: root.runId, receiptId: traversalId } },
        producerBindings: allBindings, reservedAttemptId });
    else if (!inheritedFrame?.branches.some(branch => branch.entryAttemptId === producer.attemptId)) invalid();
    const commandId = controlCommandId('graph.judge.settle', attemptId), command = (await tx.getResource({ kind: K.orchestrationCommand, handle, commandId }))?.doc;
    if (!command || command.schemaVersion !== 1 || command.commandId !== commandId || command.operation !== 'runs.control.attempt.settle' || command.target !== root.runId
        || command.payloadHash !== hash({ operation: command.operation, body: { runId: root.runId, operation: 'attempt.settle',
            detail: { attemptId, selectedResultRef: receipt.selectedResultRef } } })
        || !equal(command.outcome?.judgeReceiptRef, { runId: root.runId, receiptId }) || command.outcome.versions?.epoch !== producer.epoch
        || command.outcome.versions?.graphRevision !== producer.graphRevision) invalid();
    await verifyControlWork(tx, handle, root, receipt.modelEffectId, receipt.localWork);
    const controlRef = graphJudgeControlRef(root.runId, attemptId);
    if (recipient) {
        await assertAttemptConsumable(tx, handle, root, producer);
        for (const fact of candidates) await assertAttemptConsumable(tx, handle, root, fact.producer);
        const actual = (await readAttempt(tx, handle, root, recipient.attemptId)).doc;
        if (!equal(actual, recipient) || root.status !== 'running' || root.cancelRequested || producer.epoch !== root.epoch || recipient.epoch !== root.epoch
            || recipient.sourceBindingDigest !== root.sourceBinding.bindingDigest || !['running', 'waiting_effect'].includes(recipient.status)
            || !recipient.inputRefs.some(ref => equal(ref, controlRef))
            || !root.graph.edges.some(edge => edge.from.nodeId === producer.nodeId && edge.to.nodeId === recipient.nodeId)) invalid();
    }
    return { producer, receipt, settlement, candidates, selectedResultRef: receipt.selectedResultRef, controlRef, retrievalCompletions: retrieval };
}
