import { hashNativeDocument as hash } from '../repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { assertObject, assertCounter, assertDigest } from '../../../public/shared/native-orchestration-contracts.js';
import { assertResultRecord, resultDependencyDigest } from './result-contracts.js';
import { readSessionSnapshot } from '../session-snapshot.js';
import { readRunControl } from '../run-control.js';
import { inspectComputeEffectClosure } from '../../../public/shared/native-compute-budget.js';
import { effectBudgetClosure, sendAttemptId, localWorkAttemptId } from './budget-port.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';
import { controlCommandId, controlRecordKey, readAttempt } from './controller-common.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { assertOutputTransition } from './output-transition-contracts.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw new TypeError('Invalid original background Task output facts'); };
export const backgroundOutputId = (kind, runId) => (kind === 'result' ? 'oresult_' : kind === 'claim' ? 'oclaim_' : 'oreceipt_')
    + hash({ kind: 'native_background_' + kind, runId }).slice(0, 32);
export const backgroundTaskWorkTarget = (input, kind) => hash({ taskDefinitionHash: input.taskDefinitionHash, variantId: input.variantId,
    sourceBindingDigest: input.sourceBindingDigest, kind });
export const backgroundTaskWorkKinds = input => !input.taskResultBinding ? [] : input.taskResultBinding.kind === 'cognition.appraise'
    ? ['appraisal_parse', 'appraisal_adopt'] : ['task_result_parse', 'task_result_adopt'];

/** Exact original immutable revision/Task record; references grant no execution. */
export async function readBackgroundTaskDelivery(tx, handle, root, effectId, domainRef) {
    assertObject(domainRef, ['kind', 'sessionId', 'revisionId', 'invocationId', 'taskId', 'variantId', 'recordHash'], 'Task delivery reference');
    const source = root.sourceBinding.sourceRef, intent = (await readEffect(tx, handle, root, effectId)).doc;
    const input = intent.inputRef, model = await readModelCompletionReceipt(handle, tx, root, intent);
    if ((input.taskResultSink === 'app_command') !== Boolean(input.taskResultBinding)) invalid();
    const plan = await readPlanRevision(tx, handle, root.planRef);
    const node = plan.definition.nodes.find(item => item.nodeId === input.nodeId);
    const grantDigest = hash({ principal: 'original_native_pending_outbox', logicalInputRef: input });
    if (root.sourceBinding.sourceAuthority !== 'native_session' || root.parentRef || input.kind !== 'native_background_intent'
        || input.sourceBindingDigest !== root.sourceBinding.bindingDigest || intent.inputHash !== hash(input)
        || !equal(input.planRef, root.planRef) || input.nodeId !== root.graph.entryNodeIds[0]
        || domainRef.kind !== 'native_background_task' || domainRef.sessionId !== source.sessionId
        || ['invocationId', 'taskId', 'variantId'].some(key => input[key] !== domainRef[key]) || !model
        || !node || node.kind !== 'agent' || node.policy.agentPinId !== input.routePin?.pinId
        || !plan.dependencyPins.some(pin => equal(pin, input.routePin)) || input.routePin.port !== 'model'
        || !equal(root.graph, plan.definition) || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || intent.capability !== 'generation.send' || intent.risk !== 'R1' || intent.requiresApproval || intent.approvalRef !== null
        || intent.grantDigest !== grantDigest || intent.actionRef.kind !== 'native_model_send'
        || intent.actionRef.runtimeRouteId !== input.routePin.resourceRef.runtimeRouteId
        || intent.endpointBindingDigest !== hash({ pathFingerprint: intent.targetRef.pathFingerprint, configDigest: input.configDigest })
        || intent.egressDigest !== hash({ pathFingerprint: intent.targetRef.pathFingerprint, sourceBindingDigest: root.sourceBinding.bindingDigest,
            grantDigest, audience: { kind: 'task', id: input.taskId } })) invalid();
    for (const field of ['taskDefinitionHash', 'configDigest', 'intentDigest', 'inputDigest']) assertDigest(input[field], field);
    const session = (await checkedRecord(tx, { kind: K.session, handle, sessionId: source.sessionId }))?.doc;
    const revision = (await checkedRecord(tx, { kind: K.sessionRevision, handle, sessionId: source.sessionId, revisionId: domainRef.revisionId }))?.doc;
    if (!session || !revision) invalid();
    const snapshot = await readSessionSnapshot(tx, handle, session, revision);
    const records = snapshot.states.atri_task_results?.records.filter(item => item.invocationId === input.invocationId) ?? [];
    const record = records[0];
    const queued = snapshot.states.atri_lifecycle?.outbox.find(item => item.invocationId === input.invocationId);
    const evidence = model.observation.dispatchEvidence.reference;
    if (records.length !== 1 || record.kind !== 'task' || !input.taskDefinitionHash
        || record.status !== (input.taskResultSink === 'proposal' ? 'draft' : input.taskResultSink === 'app_command' ? 'applied' : 'completed')
        || record.resultClass !== input.taskResultClass || record.taskId !== input.taskId || record.variantId !== input.variantId
        || snapshot.core.parentRevisionId !== source.revisionId || snapshot.revision.branchId !== source.branchId
        || record.anchorRevisionId !== source.revisionId || record.storedRevisionId !== domainRef.revisionId || record.branchId !== source.branchId
        || record.definitionHash !== input.taskDefinitionHash || record.normalizedResultHash !== hash(record.payload)
        || record.normalizedResultHash !== evidence.taskResultHash
        || record.rawResultHash !== evidence.responseHash || record.requestSnapshotHash !== evidence.finalRequestHash
        || record.deliveryReceipt?.kind !== 'model_delivery' || record.deliveryReceipt.delivered !== true
        || record.deliveryReceipt.operationId !== input.schedulerOperationId
        || !queued || queued.status !== 'completed' || queued.taskId !== input.taskId || queued.variantId !== input.variantId
        || queued.simulation && !input.taskResultBinding || Boolean(queued.appraisalEvent) !== (input.taskResultBinding?.kind === 'cognition.appraise')
        || hash(queued.input) !== input.inputDigest || hash(record) !== domainRef.recordHash) invalid();
    if (input.taskResultBinding?.kind === 'cognition.appraise') {
        const binding = input.taskResultBinding, appraisal = record.appraisalEvidence;
        if (binding.kind !== 'cognition.appraise' || record.authorityReceipt?.decision !== 'cognition.appraise'
            || !appraisal || appraisal.origin !== 'model' || appraisal.invocationId !== input.invocationId || appraisal.taskId !== input.taskId
            || appraisal.variantId !== input.variantId || appraisal.profileId !== binding.profile?.id || appraisal.profileRevision !== binding.profile?.revision
            || appraisal.requestSnapshotHash !== record.requestSnapshotHash || appraisal.modelProfileId !== intent.targetRef.modelProfileId
            || appraisal.promptId !== record.promptProgramRef?.resourceId || appraisal.promptRevision !== record.promptProgramRef?.revision
            || appraisal.generationId !== record.generationProfileRef?.resourceId || appraisal.generationRevision !== record.generationProfileRef?.revision
            || !queued.appraisalEvent.eligible || queued.appraisalEvent.viewId !== binding.viewId || !queued.appraisalEvent.actor) invalid();
    } else if (input.taskResultBinding) {
        const binding = input.taskResultBinding, receipt = record.authorityReceipt;
        if (!['app.command', 'interaction.schedule'].includes(binding.kind) || input.taskResultSink !== 'app_command'
            || receipt?.kind !== 'authority' || receipt.baseRevisionId !== source.revisionId || receipt.committedRevisionId !== domainRef.revisionId) invalid();
        if (binding.kind === 'app.command') {
            if (receipt.decision !== 'app.command' || receipt.domainId !== binding.domainId || receipt.commandId !== binding.commandId
                || receipt.recordId !== (binding.recordId ?? 'task-' + hash(input.invocationId).slice(0, 48))) invalid();
        } else if (receipt.decision !== 'schedule' || receipt.interactionId !== binding.interactionId) invalid();
    }
    // The queued intent was frozen before sending; only its terminal status changes.
    if (hash({ ...queued, status: 'pending' }) !== input.intentDigest) invalid();
    const sourceRevision = (await checkedRecord(tx, { kind: K.sessionRevision, handle, sessionId: source.sessionId, revisionId: source.revisionId }))?.doc;
    if (!sourceRevision) invalid();
    const original = await readSessionSnapshot(tx, handle, session, sourceRevision);
    const pending = original.states.atri_lifecycle?.outbox.find(item => item.invocationId === input.invocationId);
    if (!pending || pending.status !== 'pending' || hash(pending) !== input.intentDigest
        || original.revision.branchId !== source.branchId || original.states.atri_lifecycle.scopes[pending.scopeId]?.status !== 'active'
        || original.states.atri_lifecycle.scopes[pending.scopeId].epoch !== pending.scopeEpoch) invalid();
    const bank = root.budgetAuthorityRef, control = await readRunControl(tx, handle, source.sessionId);
    const compute = control?.operations[bank.operationId]?.compute;
    if (bank.domain !== 'session' || bank.sessionId !== source.sessionId || !compute || !evidence.attempts.length) invalid();
    for (const kind of backgroundTaskWorkKinds(input)) {
        const jobs = compute.localWork?.filter(row => row.orchestration?.effectId === effectId && row.kind === kind) ?? [];
        const job = jobs[0];
        if (jobs.length !== 1 || job.requestId !== input.invocationId || job.orchestration.kind !== 'local_work'
            || job.attemptId !== localWorkAttemptId(effectId, job.orchestration.ordinal) || job.targetFingerprint !== backgroundTaskWorkTarget(input, kind)
            || job.estimatedInputBytes < Buffer.byteLength(JSON.stringify(record.payload))
            || job.status === 'settled' && job.usage?.outcome !== 'completed') invalid();
    }
    for (const [ordinal, send] of evidence.attempts.entries()) {
        const ref = send.budgetAttemptRef, row = compute.attempts.find(item => item.attemptId === ref.attemptId);
        if (!row || ref.effectId !== effectId || ref.providerSendOrdinal !== ordinal || ref.attemptId !== sendAttemptId(effectId, ordinal)
            || !equal(ref.authorityRef, bank) || !equal(row.orchestration, { kind: 'provider_send', effectId, ordinal })
            || row.requestId !== input.invocationId || row.requestId !== send.requestId || row.targetFingerprint !== send.targetFingerprint
            || row.inputFingerprint !== send.inputFingerprint || (row.reservationId ?? null) !== ref.reservationId
            || !['charged', 'unknown', 'settled'].includes(row.status) || send.status === 'settled' && (row.status !== 'settled' || hash(row.usage) !== send.usageHash)) invalid();
    }
    return { snapshot, record, intent, model, domainRef };
}

export function backgroundTaskResult(root, producer, effectId, modelReceiptRef, domainRef, now) {
    const resultId = backgroundOutputId('result', root.runId), input = producer.inputRefs[0], source = root.sourceBinding.sourceRef;
    const envelope = { schemaVersion: 1, runId: root.runId, resultId, producerAttemptId: producer.attemptId, outputType: 'json',
        outputSchemaRef: { kind: 'native_builtin', schema: 'json' }, payloadRef: { kind: 'orchestration_result_payload', runId: root.runId, resultId, integrity: hash(domainRef) },
        sourceRefs: [{ kind: 'run_source', runId: root.runId, epoch: producer.epoch, sourceBindingDigest: root.sourceBinding.bindingDigest,
            sourceAuthority: 'native_session', sourceRef: source },
        { kind: 'effect_receipt', runId: root.runId, effectId, receiptId: modelReceiptRef.receiptId, observedEpoch: producer.epoch }], dependencyDigest: '',
        audienceConstraint: { kind: 'session_task', runId: root.runId, nodeId: root.graph.outputContract.ownerNodeId, epoch: producer.epoch,
            ...source, invocationId: input.invocationId, taskId: input.taskId, variantId: input.variantId,
            sourceBindingDigest: root.sourceBinding.bindingDigest, grantDigest: producer.effectiveGrantDigest, taskPurpose: 'original_native_background_task' },
        disclosureConstraint: { kind: 'same_source_session_task_only' }, qualityRefs: [], status: 'complete', createdAt: now };
    envelope.dependencyDigest = resultDependencyDigest(envelope);
    return assertResultRecord({ schemaVersion: 1, runId: root.runId, resultId, envelope, payload: domainRef }, { outputContract: root.graph.outputContract });
}

export async function backgroundTaskCosts(tx, handle, root, effectId) {
    const bank = root.budgetAuthorityRef, control = await readRunControl(tx, handle, bank.sessionId);
    const compute = control?.operations[bank.operationId]?.compute;
    if (bank.authority !== 'run_control' || bank.domain !== 'session' || !compute) invalid();
    return effectBudgetClosure(bank, inspectComputeEffectClosure({ compute }, [effectId]));
}

async function command(tx, handle, root, kind, operation, detail, outcome, epoch) {
    const id = controlCommandId('native.background.' + kind, root.runId);
    const saved = (await checkedRecord(tx, { kind: K.orchestrationCommand, handle, commandId: id }))?.doc;
    if (!saved || saved.schemaVersion !== 1 || saved.commandId !== id || saved.target !== root.runId
        || saved.operation !== 'runs.control.' + operation || saved.payloadHash !== hash({ operation: saved.operation, body: { runId: root.runId, operation, detail } })
        || saved.outcome?.versions?.epoch !== epoch || Object.entries(outcome).some(([key, value]) => !equal(saved.outcome[key], value))) invalid();
}

export async function readBackgroundTaskResult(tx, handle, root) {
    if (root.sourceBinding.sourceAuthority !== 'native_session' || root.parentRef || root.graph.outputContract.kind !== 'result') return null;
    const resultId = backgroundOutputId('result', root.runId), row = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'result', resultId));
    const publication = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', backgroundOutputId('publication', root.runId)));
    if (!row && !publication && !root.resultRefs.length) return null;
    if (!row || !publication || !equal(root.resultRefs, [{ runId: root.runId, resultId }])) invalid();
    const record = assertResultRecord(row.doc, { outputContract: root.graph.outputContract }), receipt = publication.doc;
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'effectId', 'modelReceiptRef', 'resultRef', 'resultIntegrity', 'decisionSeq', 'createdAt'], 'Task publication');
    for (const key of ['epoch', 'decisionSeq', 'createdAt']) assertCounter(receipt[key], key);
    const producer = (await readAttempt(tx, handle, root, record.envelope.producerAttemptId)).doc;
    const delivery = await readBackgroundTaskDelivery(tx, handle, root, receipt.effectId, record.payload);
    const adopted = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', backgroundOutputId('delivery', root.runId))))?.doc;
    if (!adopted || !equal(adopted, { schemaVersion: 1, receiptKind: 'background_task_delivery', receiptId: backgroundOutputId('delivery', root.runId),
        runId: root.runId, epoch: receipt.epoch, effectId: receipt.effectId, domainRef: delivery.domainRef, modelReceiptRef: delivery.model.receiptRef })) invalid();
    const settlement = await readAttemptSettlement(tx, handle, root, producer);
    if (receipt.schemaVersion !== 1 || receipt.receiptKind !== 'background_task_publication' || receipt.receiptId !== backgroundOutputId('publication', root.runId)
        || receipt.runId !== root.runId || receipt.epoch !== producer.epoch || receipt.epoch > root.epoch || receipt.decisionSeq > root.eventSeq
        || receipt.resultIntegrity !== row.integrity || !equal(receipt.resultRef, root.resultRefs[0]) || !equal(receipt.modelReceiptRef, delivery.model.receiptRef)
        || producer.status !== 'completed' || producer.nodeId !== root.graph.entryNodeIds[0] || producer.inputRefs.length !== 1
        || !equal(producer.inputRefs[0], delivery.intent.inputRef) || producer.inputDigest !== hash(producer.inputRefs)
        || !equal(producer.effectRefs, [receipt.effectId]) || !equal(producer.resultRefs, [receipt.resultRef])
        || producer.epoch !== delivery.intent.epoch || producer.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || producer.effectiveGrantDigest !== delivery.intent.grantDigest || delivery.intent.nodeAttemptId !== producer.attemptId
        || !equal(producer.budgetRef, root.budgetAuthorityRef) || settlement.reasonCode !== 'background_task_adopted'
        || !equal(settlement.effectReceiptRefs, [receipt.modelReceiptRef.receiptId]) || settlement.decisionSeq !== receipt.decisionSeq || settlement.createdAt !== receipt.createdAt
        || !equal(record, backgroundTaskResult(root, producer, receipt.effectId, delivery.model.receiptRef, delivery.domainRef, receipt.createdAt))) invalid();
    await command(tx, handle, root, 'result', 'result.publish', { effectId: receipt.effectId }, { resultRef: receipt.resultRef }, receipt.epoch);
    return { record, receipt, producer, settlement, delivery };
}

export async function readBackgroundTaskOutput(tx, handle, root, { pendingCommand = false } = {}) {
    if (root.sourceBinding.sourceAuthority !== 'native_session' || root.parentRef || root.graph.outputContract.kind !== 'result') return null;
    const claimId = backgroundOutputId('claim', root.runId), row = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'output', claimId));
    const saved = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', backgroundOutputId('output', root.runId)));
    if (!row && !saved && !root.outputClaims.length) return null;
    if (!row || !saved || !equal(root.outputClaims, [{ runId: root.runId, claimId }])) invalid();
    const published = await readBackgroundTaskResult(tx, handle, root), claim = row.doc, receipt = saved.doc;
    if (!published) invalid();
    assertObject(claim, ['schemaVersion', 'claimId', 'runId', 'nodeAttemptId', 'outputKey', 'sourceBindingDigest', 'resultRef', 'consumerRef', 'operationRef', 'status', 'domainReceiptRef'], 'Task OutputClaim');
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'graphRevision', 'claimRef', 'claimIntegrity', 'traversalReceiptRef', 'costs', 'decisionSeq', 'createdAt'], 'Task OutputReceipt');
    for (const key of ['epoch', 'graphRevision', 'decisionSeq', 'createdAt']) assertCounter(receipt[key], key);
    const output = (await readAttempt(tx, handle, root, claim.nodeAttemptId)).doc, settlement = await readAttemptSettlement(tx, handle, root, output);
    if (claim.schemaVersion !== 1 || claim.claimId !== claimId || claim.runId !== root.runId || claim.status !== 'committed'
        || claim.outputKey !== hash({ kind: 'native_background_task', runId: root.runId, slot: root.graph.outputContract.slot })
        || claim.sourceBindingDigest !== root.sourceBinding.bindingDigest || !equal(claim.resultRef, published.receipt.resultRef)
        || !equal(claim.consumerRef, published.record.envelope.audienceConstraint) || !equal(claim.operationRef, published.record.payload)
        || !equal(claim.domainReceiptRef, published.delivery.domainRef) || receipt.schemaVersion !== 1 || receipt.receiptKind !== 'background_task_output'
        || receipt.receiptId !== backgroundOutputId('output', root.runId) || receipt.runId !== root.runId || !equal(receipt.claimRef, root.outputClaims[0])
        || receipt.claimIntegrity !== row.integrity || receipt.epoch !== output.epoch || receipt.epoch > root.epoch
        || receipt.graphRevision !== output.graphRevision || receipt.graphRevision > root.graphRevision
        || output.nodeId !== root.graph.outputContract.ownerNodeId || output.status !== 'completed' || output.effectRefs.length
        || output.effectiveGrantDigest !== published.producer.effectiveGrantDigest || !equal(output.budgetRef, root.budgetAuthorityRef)
        || !equal(output.inputRefs, [claim.resultRef]) || output.inputDigest !== hash(output.inputRefs) || !equal(output.resultRefs, [claim.resultRef])
        || settlement.reasonCode !== 'background_task_committed' || settlement.effectReceiptRefs.length || settlement.decisionSeq !== receipt.decisionSeq
        || settlement.createdAt !== receipt.createdAt || receipt.decisionSeq > root.eventSeq
        || !equal(receipt.costs, await backgroundTaskCosts(tx, handle, root, published.receipt.effectId)) || !receipt.costs.closed) invalid();
    await assertOutputTransition(tx, handle, root, { published, output, receipt });
    if (!pendingCommand) await command(tx, handle, root, 'output', 'output.publish', { attemptId: output.attemptId }, { claimRef: receipt.claimRef }, receipt.epoch);
    return { claim, receipt, published };
}
