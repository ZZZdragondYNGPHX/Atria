import { assertNativeId } from '../identity.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { readAttempt, controlCommandId, controlRecordKey, assertAttemptConsumable } from './controller-common.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';
import { readTaskGraphRevision, graphPatchHash } from './graph-revision-contracts.js';
import { assertAudienceRunCapture } from './audience-source-contracts.js';
import { readContextRetrievalCompletions } from './context-retrieval-contracts.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid Graph Planner completion facts'); };
export const graphPlannerReceiptId = (runId, attemptId) => 'oreceipt_' + hash({ kind: 'graph_planner_model', runId, attemptId }).slice(0, 32);
export const graphPlannerControlRef = (runId, attemptId) => ({ kind: 'graph_planner_control', runId, attemptId, receiptId: graphPlannerReceiptId(runId, attemptId) });

/** Cold, domain-independent proof. The original bank supplies a read-only
 * verifier; no fixed graph shape, template, writer or dispatch authority. */
export async function readGraphPlannerCompletion(tx, handle, root, attemptId, { verifyControlWork, recipient = null }) {
    if (typeof verifyControlWork !== 'function') invalid();
    const { doc: producer } = await readAttempt(tx, handle, root, attemptId), receiptId = graphPlannerReceiptId(root.runId, attemptId);
    const receipt = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId)))?.doc;
    if (!receipt) return null;
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'producerAttemptId', 'sourceBindingDigest', 'grantDigest',
        'modelEffectId', 'modelReceiptRef', 'modelPayloadHash', 'responseText', 'patchId', 'patchIntegrity', 'localWork', 'decisionSeq', 'createdAt'], 'Graph Planner receipt');
    const before = await readTaskGraphRevision(tx, handle, root, producer.graphRevision), node = before.graph.nodes.find(node => node.nodeId === producer.nodeId);
    const intent = (await readEffect(tx, handle, root, receipt.modelEffectId)).doc, model = await readModelCompletionReceipt(handle, tx, root, intent);
    const retrieval = await readContextRetrievalCompletions(tx, handle, root, intent, producer), settlement = await readAttemptSettlement(tx, handle, root, producer);
    const patch = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'patch', receipt.patchId)))?.doc;
    let response;
    try { response = JSON.parse(receipt.responseText); } catch { invalid(); }
    assertObject(response, ['operations'], 'Planner response');
    const payload = root.sourceBinding.sourceAuthority === 'project' ? { text: receipt.responseText, toolCalls: [] } : receipt.responseText;
    if (receipt.schemaVersion !== 1 || receipt.receiptKind !== 'graph_planner_model' || receipt.receiptId !== receiptId || receipt.runId !== root.runId
        || receipt.producerAttemptId !== producer.attemptId || receipt.epoch !== producer.epoch || producer.epoch > root.epoch || producer.status !== 'completed'
        || !node?.capabilities.includes('graph.patch') || !['planner', 'agent', 'review'].includes(node.kind)
        || receipt.sourceBindingDigest !== root.sourceBinding.bindingDigest || producer.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || receipt.grantDigest !== producer.effectiveGrantDigest || intent.grantDigest !== receipt.grantDigest || intent.nodeAttemptId !== producer.attemptId
        || !equal(producer.effectRefs, [receipt.modelEffectId, ...retrieval.map(item => item.effectId)]) || producer.resultRefs.length
        || !model || !equal(model.receiptRef, receipt.modelReceiptRef) || hash(payload) !== receipt.modelPayloadHash
        || model.observation.dispatchEvidence.reference.resultPayloadHash !== receipt.modelPayloadHash
        || model.observation.dispatchEvidence.reference.resultOutputType !== (root.sourceBinding.sourceAuthority === 'project' ? 'json' : 'text')
        || !patch?.accepted || hash(patch) !== receipt.patchIntegrity || patch.producerAttemptId !== producer.attemptId || patch.producerInputDigest !== producer.inputDigest
        || patch.previousGraphRevision !== producer.graphRevision || patch.newGraphRevision !== producer.graphRevision + 1 || patch.newGraphRevision > root.graphRevision
        || patch.sourceBindingDigest !== root.sourceBinding.bindingDigest || !equal(response.operations, patch.appliedOperations)
        || settlement.reasonCode !== 'graph_planner_patch_accepted' || settlement.decisionSeq !== receipt.decisionSeq || settlement.createdAt !== receipt.createdAt
        || !equal(settlement.effectReceiptRefs, [receipt.modelReceiptRef.receiptId, ...retrieval.map(item => item.receiptId)])
        || patch.decisionSeq >= receipt.decisionSeq || receipt.decisionSeq > root.eventSeq) invalid();
    const input = intent.inputRef;
    if (root.sourceBinding.sourceAuthority === 'native_session') {
        assertObject(input.sourceRef, ['sessionId', 'branchId', 'revisionId', 'packageId', 'packageVersionId'], 'Native Turn source');
        assertNativeId(input.sourceRef.packageId, 'package'); assertNativeId(input.sourceRef.packageVersionId, 'packageVersion');
    }
    const kinds = { project: 'native_project_intent', rp_chat: 'native_rp_intent', native_session: 'native_turn_intent' };
    if (!Object.hasOwn(kinds, root.sourceBinding.sourceAuthority) || input.kind !== kinds[root.sourceBinding.sourceAuthority]
        || input.nodeId !== producer.nodeId || !equal(input.planRef, root.planRef) || (root.sourceBinding.sourceAuthority === 'native_session'
        ? !equal(Object.fromEntries(['sessionId', 'branchId', 'revisionId'].map(field => [field, input.sourceRef?.[field]])), root.sourceBinding.sourceRef)
        : !equal(input.sourceRef, root.sourceBinding.sourceRef))
        || !equal(producer.inputRefs[0], input) || producer.inputDigest !== hash(producer.inputRefs) || intent.inputHash !== hash(input)
        || intent.epoch !== producer.epoch || intent.graphRevision !== producer.graphRevision || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || (input.acceptedGraphResultRefs ?? []).some(ref => !producer.inputRefs.some(actual => equal(actual, ref)))
        || (input.acceptedControlRefs ?? []).some(ref => !producer.inputRefs.some(actual => equal(actual, ref)))) invalid();
    if (node.policy?.audiencePinId || Object.hasOwn(input, 'audienceCapture')) {
        const plan = await readPlanRevision(tx, handle, root.planRef);
        assertAudienceRunCapture(root, node, plan.dependencyPins, input);
    }
    const proposal = { schemaVersion: 1, patchId: patch.patchId, runId: root.runId, producerAttemptId: producer.attemptId, expectedEpoch: producer.epoch,
        expectedGraphRevision: producer.graphRevision, operations: patch.appliedOperations, reasonRefs: patch.reasonRefs, payloadHash: patch.payloadHash };
    if (graphPatchHash(proposal) !== patch.payloadHash) invalid();
    const commandId = controlCommandId('graph.patch', patch.patchId), command = (await checkedRecord(tx, { kind: K.orchestrationCommand, handle, commandId }))?.doc;
    if (!command || command.operation !== 'runs.control.graph.patch' || command.target !== root.runId
        || command.payloadHash !== hash({ operation: command.operation, body: { runId: root.runId, operation: 'graph.patch', detail: proposal } })
        || !equal(command.outcome?.patchReceipt, patch)) invalid();
    await readTaskGraphRevision(tx, handle, root, patch.newGraphRevision);
    await verifyControlWork(tx, handle, root, receipt.modelEffectId, receipt.localWork);
    const controlRef = graphPlannerControlRef(root.runId, producer.attemptId);
    if (recipient) {
        await assertAttemptConsumable(tx, handle, root, producer);
        const actual = (await readAttempt(tx, handle, root, recipient.attemptId)).doc;
        if (!equal(actual, recipient) || root.status !== 'running' || root.cancelRequested || recipient.epoch !== root.epoch
            || recipient.sourceBindingDigest !== root.sourceBinding.bindingDigest || !['running', 'waiting_effect'].includes(recipient.status)
            || !recipient.inputRefs.some(ref => equal(ref, controlRef))
            || !root.graph.edges.some(edge => edge.from.nodeId === producer.nodeId && edge.to.nodeId === recipient.nodeId)) invalid();
    }
    return { producer, settlement, receipt, patch, controlRef };
}
