import { ConflictError } from '../../storage/errors.js';
import { hashNativeDocument as hash, equalNativeDocuments as equal } from '../repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { readRunControl } from '../run-control.js';
import { inspectComputeEffectClosure } from '../../../public/shared/native-compute-budget.js';
import { readEffect, effectDecision } from './effect-contracts.js';
import { readPlanRevision } from './plan-repository.js';
import { controlRecordKey, readAttempt, controlCommandId } from './controller-common.js';
import { effectBudgetClosure, localWorkAttemptId } from './budget-port.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { assertOutputTransition } from './output-transition-contracts.js';
import { assertResultRecord, resultDependencyDigest } from './result-contracts.js';
import { nativeToolDecision } from './native-tool-contracts.js';

const fail = () => { throw new ConflictError('native_orchestration_native_tool_output_invalid'); };
export const nativeToolId = (kind, runId) => (kind === 'result' ? 'oresult_' : kind === 'claim' ? 'oclaim_' : 'oreceipt_')
    + hash({ kind: 'native_session_tool_' + kind, runId }).slice(0, 32);

/** Historical facts only. Reading this proof never authorizes another send. */
export async function readNativeToolCompletion(tx, handle, root) {
    if (root.ownerRef.handle !== handle || root.parentRef !== null || root.sourceBinding.sourceAuthority !== 'native_session') fail();
    const plan = await readPlanRevision(tx, handle, root.planRef);
    if (!equal(root.graph, plan.definition)) fail();
    for (const attemptId of root.attemptRefs) {
        const producer = (await readAttempt(tx, handle, root, attemptId)).doc;
        for (const effectId of producer.effectRefs) {
            const intent = (await readEffect(tx, handle, root, effectId)).doc;
            if (intent.inputRef.kind !== 'native_session_tool') continue;
            const node = root.graph.nodes.find(node => node.nodeId === producer.nodeId), logical = intent.inputRef;
            const pin = plan.dependencyPins.find(pin => pin.pinId === node?.policy.actionPinId), descriptor = logical.descriptor;
            if (!pin || pin.port !== 'tool' || pin.resourceRef.kind !== 'native_session_tool' || node.kind !== 'effect'
                || !equal(node.dependencyPinIds, [pin.pinId]) || !equal(node.capabilities, [descriptor.capability])
                || logical.pinId !== pin.pinId || logical.descriptorIntegrity !== pin.integrity || pin.integrity !== hash(descriptor)
                || !equal(pin.resourceRef.input, logical.input) || !equal(pin.resourceRef.source, root.sourceBinding.sourceRequest)
                || descriptor.sourceBindingDigest !== root.sourceBinding.bindingDigest || descriptor.inputHash !== hash(logical.input)
                || !equal(effectDecision(intent), nativeToolDecision({ ownerRef: root.ownerRef, planRef: root.planRef,
                    sourceBinding: root.sourceBinding, nodeId: node.nodeId, pin, descriptor }))
                || !['mcp', 'skill'].includes(intent.actionRef.protocol) || intent.status !== 'confirmed'
                || intent.requiresApproval || intent.approvalRef !== null || intent.epoch !== root.epoch
                || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest || intent.hostBootId !== root.hostBootId || intent.hostGeneration !== root.hostGeneration
                || producer.epoch !== root.epoch || producer.effectiveGrantDigest !== intent.grantDigest
                || producer.sourceBindingDigest !== root.sourceBinding.bindingDigest || !equal(producer.effectRefs, [effectId])
                || !equal(producer.inputRefs, [logical]) || producer.inputDigest !== hash([logical])) fail();
            const receiptId = 'oreceipt_' + hash({ effectId, observationId: 'tool.completed:' + effectId }).slice(0, 32);
            const receipt = (await tx.getResource(controlRecordKey(handle, root.runId, 'receipt', receiptId)))?.doc;
            const completionBindingDigest = hash({ runId: root.runId, effectId, epoch: intent.epoch, hostBootId: intent.hostBootId,
                hostGeneration: intent.hostGeneration, sourceBindingDigest: intent.sourceBindingDigest, decision: effectDecision(intent), budgetAttemptRef: intent.budgetAttemptRef });
            const reference = receipt?.dispatchEvidence?.reference, evidence = reference?.evidence, budget = intent.budgetAttemptRef;
            if (!receipt || receipt.schemaVersion !== 1 || receipt.receiptId !== receiptId || receipt.observationId !== 'tool.completed:' + effectId
                || receipt.outcome !== 'confirmed' || receipt.runId !== root.runId || receipt.effectId !== effectId
                || receipt.observedEpoch !== intent.epoch || reference.completionBindingDigest !== completionBindingDigest
                || receipt.dispatchEvidence.kind !== 'original_port_observation' || receipt.domainReceiptRef !== null || receipt.resultRefs.length
                || !equal(receipt.sourceRefs, [root.sourceBinding.sourceRef])
                || reference.protocol !== intent.actionRef.protocol || reference.operation !== intent.actionRef.operation
                || evidence.protocol !== reference.protocol || evidence.operation !== reference.operation || evidence.inputHash !== intent.inputHash
                || (evidence.protocol === 'skill' ? evidence.version !== logical.input.version || receipt.remoteOperationRef !== null
                    : evidence.endpointBindingDigest !== intent.endpointBindingDigest || !equal(receipt.remoteOperationRef, { protocol: 'mcp', operationId: evidence.operationId }))
                || budget.kind !== 'local_work' || budget.localWorkOrdinal !== 0 || budget.reservationId !== null
                || budget.attemptId !== localWorkAttemptId(effectId, 0) || !equal(budget.authorityRef, root.budgetAuthorityRef)
                || !Array.isArray(reference.localWorkAttemptIds) || !reference.localWorkAttemptIds.length) fail();
            const attemptIds = [budget.attemptId, ...reference.localWorkAttemptIds];
            const bank = (await readRunControl(tx, handle, root.budgetAuthorityRef.sessionId))?.operations[root.budgetAuthorityRef.operationId]?.compute;
            if (!bank || bank.attempts.some(row => row.orchestration?.effectId === effectId)
                || bank.localWork.filter(row => row.orchestration?.effectId === effectId).length !== attemptIds.length
                || attemptIds.some((id, ordinal) => {
                    const row = bank.localWork.find(row => row.attemptId === id);
                    return id !== localWorkAttemptId(effectId, ordinal) || !row || row.status !== 'settled' || row.usage?.outcome !== 'completed'
                        || (row.reservationId ?? null) !== null || !equal(row.orchestration, { kind: 'local_work', effectId, ordinal });
                }) || !equal(receipt.budgetObservationRef, { authorityRef: root.budgetAuthorityRef, attemptIds, completionBindingDigest })) fail();
            const costs = effectBudgetClosure(root.budgetAuthorityRef, inspectComputeEffectClosure({ compute: bank }, [effectId]));
            return { producer, intent, receipt, descriptor, pin, costs, evidence };
        }
    }
    return null;
}

export function nativeToolResult(root, completion, payload, now) {
    const resultId = nativeToolId('result', root.runId), { intent, producer, receipt } = completion;
    const envelope = { schemaVersion: 1, runId: root.runId, resultId, producerAttemptId: producer.attemptId, outputType: 'json',
        outputSchemaRef: { kind: 'native_builtin', schema: 'json' }, payloadRef: { kind: 'orchestration_result_payload', runId: root.runId, resultId, integrity: hash(payload) },
        sourceRefs: [{ kind: 'run_source', runId: root.runId, epoch: root.epoch, sourceBindingDigest: root.sourceBinding.bindingDigest,
            sourceAuthority: 'native_session', sourceRef: root.sourceBinding.sourceRef },
        { kind: 'effect_receipt', runId: root.runId, effectId: intent.effectId, receiptId: receipt.receiptId, observedEpoch: intent.epoch }],
        dependencyDigest: '', audienceConstraint: { kind: 'session_tool', runId: root.runId, nodeId: root.graph.outputContract.ownerNodeId, epoch: root.epoch,
            ...root.sourceBinding.sourceRef, sourceBindingDigest: root.sourceBinding.bindingDigest, grantDigest: intent.grantDigest, taskPurpose: 'original_native_session_tool' },
        disclosureConstraint: { kind: 'same_source_session_tool_only' }, qualityRefs: [], status: 'complete', createdAt: now };
    envelope.dependencyDigest = resultDependencyDigest(envelope);
    return assertResultRecord({ schemaVersion: 1, runId: root.runId, resultId, envelope, payload }, { outputContract: root.graph.outputContract });
}

export function assertNativeToolPayload(completion, payload) {
    const { evidence, intent } = completion;
    if (intent.actionRef.protocol === 'skill' ? hash(payload) !== evidence.resultHash
        : hash(payload) !== evidence.resultHash || evidence.endpointBindingDigest !== intent.endpointBindingDigest || evidence.remoteReportedError) fail();
}

export async function readNativeToolOutput(tx, handle, root, { pendingCommand = false } = {}) {
    const claimId = nativeToolId('claim', root.runId), claimRow = await tx.getResource(controlRecordKey(handle, root.runId, 'output', claimId));
    if (!claimRow && !root.outputClaims.length) return null;
    const completion = await readNativeToolCompletion(tx, handle, root), claim = claimRow?.doc;
    const publication = (await tx.getResource(controlRecordKey(handle, root.runId, 'receipt', nativeToolId('publication', root.runId))))?.doc;
    const output = (await tx.getResource(controlRecordKey(handle, root.runId, 'receipt', nativeToolId('output', root.runId))))?.doc;
    const result = await tx.getResource(controlRecordKey(handle, root.runId, 'result', nativeToolId('result', root.runId)));
    if (!completion || !claim || !publication || !output || !result || !completion.costs.closed) fail();
    assertNativeToolPayload(completion, result.doc.payload);
    const attempt = (await readAttempt(tx, handle, root, claim.nodeAttemptId)).doc;
    const settlement = await readAttemptSettlement(tx, handle, root, attempt), producerSettlement = await readAttemptSettlement(tx, handle, root, completion.producer);
    if (root.status !== 'completed' || completion.producer.status !== 'completed' || attempt.status !== 'completed'
        || attempt.nodeId !== root.graph.outputContract.ownerNodeId || attempt.epoch !== root.epoch || attempt.effectRefs.length
        || !equal(root.outputClaims, [{ runId: root.runId, claimId }]) || !equal(root.resultRefs, [{ runId: root.runId, resultId: result.doc.resultId }])
        || !equal(result.doc, nativeToolResult(root, completion, result.doc.payload, result.doc.envelope.createdAt))
        || claim.schemaVersion !== 1 || claim.runId !== root.runId || claim.claimId !== claimId || claim.status !== 'committed'
        || claim.sourceBindingDigest !== root.sourceBinding.bindingDigest || claim.outputKey !== hash({ kind: 'native_session_tool', runId: root.runId, effectId: completion.intent.effectId })
        || !equal(claim.resultRef, root.resultRefs[0]) || !equal(claim.consumerRef, result.doc.envelope.audienceConstraint)
        || !equal(claim.operationRef, { runId: root.runId, effectId: completion.intent.effectId, receiptId: completion.receipt.receiptId })
        || !equal(claim.domainReceiptRef, claim.operationRef) || publication.schemaVersion !== 1 || publication.receiptKind !== 'native_tool_publication'
        || publication.receiptId !== nativeToolId('publication', root.runId) || publication.runId !== root.runId || publication.epoch !== root.epoch
        || publication.resultIntegrity !== result.integrity || !equal(publication.resultRef, root.resultRefs[0])
        || publication.effectId !== completion.intent.effectId || !equal(publication.effectReceiptRef, claim.operationRef)
        || output.schemaVersion !== 1 || output.receiptKind !== 'native_tool_output' || output.receiptId !== nativeToolId('output', root.runId)
        || output.runId !== root.runId || output.epoch !== root.epoch || output.graphRevision !== root.graphRevision || output.claimIntegrity !== claimRow.integrity
        || !equal(output.claimRef, root.outputClaims[0]) || !equal(output.resultRef, root.resultRefs[0]) || !equal(output.costs, completion.costs)
        || !equal(output.publicationReceiptRef, { runId: root.runId, receiptId: publication.receiptId })
        || output.outputAttemptReceiptRef.receiptId !== settlement.receiptId || settlement.decisionSeq !== output.decisionSeq || settlement.createdAt !== output.createdAt
        || producerSettlement.decisionSeq !== publication.decisionSeq || producerSettlement.createdAt !== publication.createdAt
        || !equal(producerSettlement.effectReceiptRefs, [completion.receipt.receiptId]) || settlement.effectReceiptRefs.length
        || settlement.reasonCode !== 'native_tool_completed' || producerSettlement.reasonCode !== 'native_tool_confirmed'
        || !equal(attempt.inputRefs, root.resultRefs) || attempt.inputDigest !== hash(root.resultRefs) || !equal(attempt.resultRefs, root.resultRefs)
        || !equal(completion.producer.resultRefs, root.resultRefs) || root.pendingEffectRefs.length || root.pendingApprovalRefs.length
        || output.decisionSeq > root.eventSeq) fail();
    await assertOutputTransition(tx, handle, root, { published: { producer: completion.producer, receipt: publication, settlement: producerSettlement }, output: attempt, receipt: output });
    for (const [namespace, operation, detail, expected] of [
        ['native.tool.result', 'result.publish', { effectId: completion.intent.effectId }, { resultRef: root.resultRefs[0] }],
        ...pendingCommand ? [] : [['native.tool.output', 'output.publish', { attemptId: attempt.attemptId }, { claimRef: root.outputClaims[0] }]],
    ]) {
        const commandId = controlCommandId(namespace, root.runId), command = (await tx.getResource({ kind: K.orchestrationCommand, handle, commandId }))?.doc;
        if (!command || command.operation !== 'runs.control.' + operation || command.target !== root.runId
            || command.payloadHash !== hash({ operation: command.operation, body: { runId: root.runId, operation, detail } })
            || command.outcome.versions?.epoch !== root.epoch || Object.entries(expected).some(([key, value]) => !equal(command.outcome[key], value))) fail();
    }
    return { claim, output, result: result.doc, completion };
}
