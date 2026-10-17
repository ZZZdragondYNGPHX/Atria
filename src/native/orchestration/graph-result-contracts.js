import { readSessionFanoutCompletion } from './session-fanout-contracts.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject, assertResultPolicy } from '../../../public/shared/native-orchestration-contracts.js';
import { assertResultRecord, resultDependencyDigest } from './result-contracts.js';
import { modelResultId } from './result-publication-contracts.js';
import { controlCommandId, controlRecordKey, readAttempt, assertAttemptConsumable } from './controller-common.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';
import { assertNativeId } from '../identity.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';
import { readContextRetrievalCompletions } from './context-retrieval-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { readRpFanoutCompletion } from './rp-fanout-contracts.js';
import { readProjectFanoutCompletion } from './project-fanout-contracts.js';
import { graphFanoutModelScope, readGraphFanoutInput } from './graph-fanout-completion.js';
import { audienceContextPin, assertAudienceRunCapture } from './audience-source-contracts.js';
import { readSessionDelegatedModelInput, readSessionDelegationContinuation } from './session-delegation-contracts.js';

const kinds = ['agent', 'planner', 'judge', 'review'];
const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid Graph Result facts'); };
export const graphResultPublicationId = (runId, resultId) => 'oreceipt_' + hash({ kind: 'graph_node_result', runId, resultId }).slice(0, 32);

export function graphResultContract(root, producer, graphSnapshot = null) {
    const graph = graphSnapshot?.graph ?? root.graph, revision = graphSnapshot?.graphRevision ?? 0;
    const node = graph.nodes.find(item => item.nodeId === producer.nodeId), policy = assertResultPolicy(graph.outputContract);
    if (!['rp_chat', 'native_session', 'project'].includes(root.sourceBinding.sourceAuthority)
        || root.parentRef !== null && !(root.sourceBinding.sourceAuthority === 'native_session' && graph.outputContract.kind === 'result' && node?.kind === 'agent')
        || producer.graphRevision !== revision || revision > root.graphRevision
        || root.sourceBinding.sourceAuthority !== root.sourceBinding.sourceRequest?.domain
        || !graphSnapshot && (root.graphRevision !== 0 || root.graph.graphChangePolicy.allowedOperations.length) || !kinds.includes(node?.kind)
        || node.outputs.length !== 1 || !['text', 'json'].includes(node.outputs[0].type)) invalid();
    const direct = graph.edges.filter(edge => edge.from.nodeId === node.nodeId && !edge.loopBack).map(edge => graph.nodes.find(item => item.nodeId === edge.to.nodeId));
    const recipients = direct.flatMap(item => {
        if (item?.kind === 'fanout' && root.sourceBinding.sourceAuthority === 'project') {
            return [item, ...graphFanoutModelScope(graph, item.nodeId).map(id => graph.nodes.find(node => node.nodeId === id))];
        }
        if (item?.kind !== 'join') return [item];
        const successors = graph.edges.filter(edge => edge.from.nodeId === item.nodeId && !edge.loopBack).map(edge => graph.nodes.find(node => node.nodeId === edge.to.nodeId));
        if (!successors.length || successors.some(node => !kinds.includes(node?.kind))
            || root.sourceBinding.sourceAuthority === 'rp_chat' && successors.length !== 1) invalid();
        return [item, ...successors];
    });
    if (!recipients.length || recipients.some(item => !kinds.includes(item?.kind) && item?.kind !== 'join'
        && !(item?.kind === 'fanout' && root.sourceBinding.sourceAuthority === 'project'))) invalid();
    return { output: { kind: 'result', ownerNodeId: node.nodeId, slot: 'graph_result', allowPartial: false,
        resultPolicy: { outputType: node.outputs[0].type, maxBytes: policy.maxBytes } },
    audience: { kind: 'graph_nodes', runId: root.runId, nodeIds: [...new Set(recipients.map(item => item.nodeId))].sort(), epoch: producer.epoch,
        sourceBindingDigest: root.sourceBinding.bindingDigest, grantDigest: producer.effectiveGrantDigest,
        taskPurpose: root.sourceBinding.sourceAuthority === 'rp_chat' ? 'original_rp_graph_result' : root.sourceBinding.sourceAuthority === 'project' ? 'original_native_project_graph_result' : 'original_native_graph_result' } };
}

const audienceSource = (root, producer, pins, snapshot = null) => {
    const node = (snapshot?.graph ?? root.graph).nodes.find(item => item.nodeId === producer.nodeId), pin = audienceContextPin(node, pins);
    const capture = assertAudienceRunCapture(root, node, pins, producer.inputRefs?.[0]);
    return pin ? [{ kind: 'native_information_context', pinId: pin.pinId, sourceRef: capture?.sourceRef ?? pin.resourceRef, integrity: pin.integrity }] : [];
};

/** The JSON representation preserves the original generation response, just
 * as the existing Project Result does; control parsing remains separately metered. */
export function graphNodeResult({ root, producer, proof, text, now, graphSnapshot = null, dependencyPins = [] }) {
    if (graphSnapshot && graphSnapshot.graphRevision !== root.graphRevision) invalid();
    const contract = graphResultContract(root, producer, graphSnapshot), outputType = contract.output.resultPolicy.outputType;
    if (proof.runId !== root.runId || proof.receiptRef.runId !== root.runId || proof.producerAttemptId !== producer.attemptId || proof.epoch !== producer.epoch || proof.outputType !== (root.sourceBinding.sourceAuthority === 'project' ? 'json' : 'text')
        || hash(root.sourceBinding.sourceAuthority === 'project' ? { text, toolCalls: [] } : text) !== proof.payloadHash
        || !equal(proof.sourceBinding, root.sourceBinding)) invalid();
    const resultId = modelResultId(root.runId, proof.effectId), payload = outputType === 'text' ? text : { text, toolCalls: [] };
    const envelope = { schemaVersion: 1, runId: root.runId, resultId, producerAttemptId: producer.attemptId, outputType,
        outputSchemaRef: { kind: 'native_builtin', schema: outputType }, payloadRef: { kind: 'orchestration_result_payload', runId: root.runId, resultId, integrity: hash(payload) },
        sourceRefs: [{ kind: 'run_source', runId: root.runId, epoch: producer.epoch, sourceBindingDigest: root.sourceBinding.bindingDigest,
            sourceAuthority: root.sourceBinding.sourceAuthority, sourceRef: root.sourceBinding.sourceRef },
        { kind: 'effect_receipt', runId: root.runId, effectId: proof.effectId, receiptId: proof.receiptRef.receiptId, observedEpoch: producer.epoch },
        ...audienceSource(root, producer, dependencyPins, graphSnapshot)],
        dependencyDigest: '', audienceConstraint: contract.audience, disclosureConstraint: { kind: 'same_source_graph_successors_only' }, qualityRefs: [], status: 'complete', createdAt: now };
    envelope.dependencyDigest = resultDependencyDigest(envelope);
    return assertResultRecord({ schemaVersion: 1, runId: root.runId, resultId, envelope, payload }, { outputContract: contract.output });
}

/** Historical read; the live recipient separately checks Source/grant/epoch and
 * invalidation. A durable Result or its audience list never grants a new read. */
export async function readGraphNodeResult(tx, handle, root, resultId, { recipient = null } = {}) {
    assertNativeId(resultId, 'orchestrationResult');
    const stored = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'result', resultId));
    const publication = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', graphResultPublicationId(root.runId, resultId)));
    if (!stored && !publication) return null;
    if (!stored || !publication) invalid();
    const receipt = publication.doc;
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'producerAttemptId', 'resultRef', 'resultIntegrity', 'modelEffectId',
        'modelReceiptRef', 'modelPayloadHash', 'producerGrantDigest', 'sourceBindingDigest', 'audienceDigest', 'decisionSeq', 'createdAt',
        ...(Object.hasOwn(receipt, 'graphRevision') ? ['graphRevision'] : [])], 'Graph Result publication');
    const snapshot = Object.hasOwn(receipt, 'graphRevision') ? await readTaskGraphRevision(tx, handle, root, receipt.graphRevision) : null;
    if (snapshot) {
        const commandId = controlCommandId('graph.result.publish', { runId: root.runId, effectId: receipt.modelEffectId });
        const command = (await checkedRecord(tx, { kind: K.orchestrationCommand, handle, commandId }))?.doc;
        if (!command || command.schemaVersion !== 1 || command.commandId !== commandId || command.target !== root.runId || command.operation !== 'runs.control.result.publish'
            || command.payloadHash !== hash({ operation: command.operation, body: { runId: root.runId, operation: 'result.publish', detail: { effectId: receipt.modelEffectId, resultId } } })
            || command.outcome?.status !== 'published' || command.outcome.runId !== root.runId || command.outcome.versions?.graphRevision !== receipt.graphRevision
            || command.outcome.versions.epoch !== receipt.epoch || !equal(command.outcome.resultRef, receipt.resultRef)
            || !equal(command.outcome.publicationReceiptRef, { runId: root.runId, receiptId: receipt.receiptId })) invalid();
    }
    const { doc: producer } = await readAttempt(tx, handle, root, receipt.producerAttemptId), contract = graphResultContract(root, producer, snapshot);
    const record = assertResultRecord(stored.doc, { outputContract: contract.output, expected: { runId: root.runId, resultId, producerAttemptId: producer.attemptId,
        producerEpoch: producer.epoch, sourceBindingDigest: root.sourceBinding.bindingDigest, sourceRef: root.sourceBinding.sourceRef, audienceConstraint: contract.audience } });
    const producerNode = (snapshot?.graph ?? root.graph).nodes.find(item => item.nodeId === producer.nodeId);
    // The immutable graph already proves that an unpinned producer has no
    // additional Audience source. Unexpected sources still require the original
    // Plan, so this shortcut cannot hide a forged third SourceRef.
    const plan = producerNode.policy?.audiencePinId !== undefined || record.envelope.sourceRefs.length > 2
        ? await readPlanRevision(tx, handle, root.planRef) : null;
    const intent = (await readEffect(tx, handle, root, receipt.modelEffectId)).doc, model = await readModelCompletionReceipt(handle, tx, root, intent);
    const retrievalCompletions = await readContextRetrievalCompletions(tx, handle, root, intent, producer);
    const settlement = await readAttemptSettlement(tx, handle, root, producer), text = record.envelope.outputType === 'text' ? record.payload : record.payload.text;
    if (record.envelope.outputType === 'json') { assertObject(record.payload, ['text', 'toolCalls'], 'Graph generation result'); if (!equal(record.payload.toolCalls, [])) invalid(); }
    if (receipt.schemaVersion !== 1 || receipt.receiptKind !== 'graph_node_result' || receipt.receiptId !== graphResultPublicationId(root.runId, resultId)
        || receipt.runId !== root.runId || receipt.epoch !== producer.epoch || receipt.epoch > root.epoch || producer.status !== 'completed'
        || producer.sourceBindingDigest !== root.sourceBinding.bindingDigest || record.envelope.status !== 'complete'
        || receipt.resultIntegrity !== stored.integrity || receipt.producerGrantDigest !== producer.effectiveGrantDigest || receipt.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || receipt.audienceDigest !== hash(contract.audience) || !equal(receipt.resultRef, { runId: root.runId, resultId })
        || resultId !== modelResultId(root.runId, receipt.modelEffectId) || !equal(producer.resultRefs, [receipt.resultRef]) || !root.resultRefs.some(ref => equal(ref, receipt.resultRef))
        || !equal(producer.effectRefs, [receipt.modelEffectId, ...retrievalCompletions.map(item => item.effectId)]) || intent.nodeAttemptId !== producer.attemptId || intent.grantDigest !== producer.effectiveGrantDigest
        || intent.epoch !== producer.epoch || intent.graphRevision !== producer.graphRevision || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || !equal(record.envelope.sourceRefs[1], { kind: 'effect_receipt', runId: root.runId, effectId: intent.effectId, receiptId: receipt.modelReceiptRef.receiptId, observedEpoch: producer.epoch })
        || !equal(record.envelope.sourceRefs.slice(2), plan ? audienceSource(root, producer, plan.dependencyPins, snapshot) : [])
        || producer.inputRefs[0]?.audienceCapture && producer.inputRefs[0]?.kind !== 'native_session_delegation'
            && (!equal(intent.inputRef, producer.inputRefs[0]) || intent.inputHash !== hash(producer.inputRefs[0]))
        || !model || !equal(model.receiptRef, receipt.modelReceiptRef) || receipt.modelPayloadHash !== hash(root.sourceBinding.sourceAuthority === 'project' ? { text, toolCalls: [] } : text)
        || model.observation.dispatchEvidence.reference.resultOutputType !== (root.sourceBinding.sourceAuthority === 'project' ? 'json' : 'text')
        || model.observation.dispatchEvidence.reference.resultPayloadHash !== receipt.modelPayloadHash
        || !equal(settlement.effectReceiptRefs, [receipt.modelReceiptRef.receiptId, ...retrievalCompletions.map(item => item.receiptId)]) || settlement.decisionSeq !== receipt.decisionSeq
        || settlement.createdAt !== receipt.createdAt || record.envelope.createdAt !== receipt.createdAt
        || settlement.reasonCode !== 'graph_result_published' || receipt.decisionSeq > root.eventSeq) invalid();
    if (root.sourceBinding.sourceAuthority === 'native_session' && root.parentRef) {
        await readSessionDelegatedModelInput(tx, handle, root, producer, intent, receipt.decisionSeq);
    } else if (producer.inputRefs[0]?.kind === 'native_session_delegation') {
        await readSessionDelegationContinuation(tx, handle, root, producer, intent);
    }
    if (recipient) {
        await assertAttemptConsumable(tx, handle, root, producer);
        const actual = (await readAttempt(tx, handle, root, recipient.attemptId)).doc;
        if (!equal(actual, recipient) || root.cancelRequested || root.status !== 'running' || !['running', 'waiting_effect'].includes(recipient.status)) invalid();
        if (recipient.epoch !== root.epoch || producer.epoch !== root.epoch || !contract.audience.nodeIds.includes(recipient.nodeId)
            || recipient.sourceBindingDigest !== root.sourceBinding.bindingDigest || !recipient.inputRefs.some(ref => equal(ref, receipt.resultRef))) invalid();
        if (!root.graph.edges.some(edge => edge.from.nodeId === producer.nodeId && edge.to.nodeId === recipient.nodeId)) {
            const input = recipient.inputRefs[0];
            if (root.sourceBinding.sourceAuthority === 'native_session') {
                let accepted = false;
                for (const id of root.attemptRefs) {
                    const attempt = (await readAttempt(tx, handle, root, id)).doc;
                    if (root.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind !== 'join'
                        || !root.graph.edges.some(edge => edge.from.nodeId === attempt.nodeId && edge.to.nodeId === recipient.nodeId)) continue;
                    const joined = await readSessionFanoutCompletion(tx, handle, root, id);
                    if (joined && joined.joinReceipt.outcome === 'completed' && joined.joinReceipt.acceptedResultRefs.some(ref => equal(ref, receipt.resultRef))
                        && input.joinReceiptRefs?.some(ref => equal(ref, { runId: root.runId, joinId: joined.joinReceipt.joinId }))
                        && joined.joinReceipt.acceptedResultRefs.every(ref => input.acceptedGraphResultRefs.some(actual => equal(actual, ref)))) accepted = true;
                }
                if (!accepted) invalid();
            } else if (root.sourceBinding.sourceAuthority === 'project') {
                let accepted = false;
                if (input.fanoutAttemptId) {
                    await readGraphFanoutInput(tx, handle, root, input.fanoutAttemptId, recipient, receipt.resultRef, { producer, settlement, receipt });
                    accepted = true;
                }
                for (const ref of input.acceptedControlRefs ?? []) {
                    if (ref.kind !== 'graph_join_control' || ref.runId !== root.runId) continue;
                    const joined = await readProjectFanoutCompletion(tx, handle, root, ref.attemptId, { recipient });
                    if (joined && equal(joined.controlRef, ref) && ['completed', 'partial'].includes(joined.joinReceipt.outcome)
                        && joined.joinReceipt.acceptedResultRefs.some(actual => equal(actual, receipt.resultRef))
                        && joined.joinReceipt.acceptedResultRefs.every(actual => input.acceptedGraphResultRefs?.some(selected => equal(selected, actual)))) accepted = true;
                }
                if (!accepted) invalid();
            } else {
                const joined = await readRpFanoutCompletion(tx, handle, root);
                if (!joined || joined.profile.transfer.to.nodeId !== recipient.nodeId || !joined.joinReceipt.acceptedResultRefs.some(ref => equal(ref, receipt.resultRef))
                    || !equal(input.joinReceiptRef, { runId: root.runId, joinId: joined.joinReceipt.joinId })
                    || !equal(input.acceptedGraphResultRefs, joined.joinReceipt.acceptedResultRefs)) invalid();
            }
        }
    }
    return { record, receipt, producer, settlement, retrievalCompletions };
}
