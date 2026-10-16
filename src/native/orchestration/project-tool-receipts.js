import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { ProjectAgentService } from '../project-agent.js';
import { ProjectTaskRepository } from '../agent-intelligence/project-task-repository.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject, assertDigest } from '../../../public/shared/native-orchestration-contracts.js';
import { assertProjectToolReceipt, projectToolCapability, projectToolAction, projectToolReason, projectReviewSource } from './project-tool-contracts.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { controlRecordKey, readAttempt } from './controller-common.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';
import { assertBudgetAttemptRef, localWorkAttemptId, sendAttemptId } from './budget-port.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw Object.assign(new TypeError('native_orchestration_project_tool_receipt_invalid'), { code: 'native_orchestration_project_tool_receipt_invalid' }); };

/** Original durable facts only. No live permit, body, Source advancement or tool grant is returned. */
export async function readProjectToolReceipt(tx, handle, root, effectId, { projectAgent, requireHostReceipt = false } = {}) {
    if (!(projectAgent instanceof ProjectAgentService) || !(projectAgent._repository instanceof ProjectTaskRepository)
        || root.ownerRef.handle !== handle || root.sourceBinding.sourceAuthority !== 'project') invalid();
    await projectAgent._repository.engine.withTransaction(handle, active => { if (active !== tx) invalid(); });
    const saved = (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: root.runId }))?.doc;
    if (!saved || !equal(saved.sourceBinding, root.sourceBinding) || !equal(saved.planRef, root.planRef) || !equal(saved.graph, root.graph)) invalid();
    const tool = (await readEffect(tx, handle, root, effectId)).doc;
    if (!['native_project_read', 'native_project_proposal'].includes(tool.actionRef.kind)) return null;
    const source = root.sourceBinding.sourceRef, bank = root.budgetAuthorityRef;
    const task = await ProjectTaskRepository.prototype.get.call(projectAgent._repository, handle, source.projectId, source.taskId);
    if (!task || task.baseRevision !== source.revision || bank.authority !== 'project_task' || bank.projectId !== source.projectId
        || bank.taskId !== source.taskId || !equal(root.sourceBinding.budgetAuthorityRef, bank)
        || bank.operationId !== hash({ projectId: source.projectId, taskId: source.taskId, revision: source.revision, executionFingerprint: source.executionFingerprint })) invalid();
    const matches = task.attempts.flatMap(attempt => attempt.calls.filter(call => call.nativeReceipt?.runId === root.runId && call.nativeReceipt.effectId === effectId)
        .map(call => ({ attempt, call })));
    if (!matches.length) return null;
    if (matches.length !== 1) invalid();
    const { attempt, call } = matches[0], receipt = assertProjectToolReceipt(call.nativeReceipt);
    assertObject(tool.inputRef, ['kind', 'call', 'modelEffectId', 'modelResultHash'], 'Project tool input');
    assertDigest(tool.inputRef.modelResultHash, 'modelResultHash');
    if (attempt.kind !== 'generation' || receipt.projectAttemptId !== attempt.attemptId || receipt.callId !== call.callId || receipt.name !== call.name
        || receipt.argsHash !== call.argsHash || receipt.toSequence > task.sequence || receipt.sourceBindingDigest !== root.sourceBinding.bindingDigest
        || receipt.nodeAttemptId !== tool.nodeAttemptId || !['dispatching', 'confirmed', 'unknown'].includes(tool.status) || !tool.dispatchToken
        || tool.capability !== projectToolCapability(call.name) || tool.actionRef.kind !== projectToolAction(call.name)
        || tool.risk !== 'R1' || tool.requiresApproval || tool.approvalRef !== null
        || tool.inputRef.kind !== projectToolAction(call.name) || !equal(tool.targetRef, { projectId: source.projectId, taskId: source.taskId, name: call.name })
        || tool.sourceBindingDigest !== root.sourceBinding.bindingDigest || tool.inputHash !== hash(tool.inputRef)
        || !equal(tool.inputRef.call, { name: call.name, args: tool.inputRef.call?.args, attemptId: attempt.attemptId, callId: call.callId })
        || hash(tool.inputRef.call.args) !== receipt.argsHash) invalid();
    const plan = await readPlanRevision(tx, handle, root.planRef), { doc: nodeAttempt } = await readAttempt(tx, handle, root, tool.nodeAttemptId);
    const node = root.graph.nodes.find(item => item.nodeId === nodeAttempt.nodeId);
    const pins = plan.dependencyPins.filter(pin => pin.port === 'tool' && node?.dependencyPinIds.includes(pin.pinId)
        && equal(pin.resourceRef, { kind: 'project_agent_tool', projectId: source.projectId, taskId: source.taskId, name: call.name }));
    if (!node?.capabilities.includes(tool.capability) || !root.graph.capabilityCeiling.includes(tool.capability) || pins.length !== 1
        || nodeAttempt.effectiveGrantDigest !== tool.grantDigest || nodeAttempt.sourceBindingDigest !== receipt.sourceBindingDigest
        || nodeAttempt.epoch !== tool.epoch || !nodeAttempt.effectRefs.includes(effectId)) invalid();
    const model = (await readEffect(tx, handle, root, tool.inputRef.modelEffectId)).doc;
    const modelFact = await readModelCompletionReceipt(handle, tx, root, model);
    if (!modelFact || model.nodeAttemptId !== tool.nodeAttemptId || model.grantDigest !== tool.grantDigest
        || model.inputRef.kind !== 'native_project_intent' || model.inputRef.operationId !== receipt.operationId
        || model.inputRef.projectAttemptId !== attempt.attemptId || model.inputRef.requestId !== attempt.requestId
        || receipt.fromFingerprint !== (model.inputRef.currentSourceFingerprint ?? model.inputRef.sourceRef.executionFingerprint)
        || !equal(model.inputRef.sourceRef, source) || !nodeAttempt.effectRefs.includes(model.effectId)
        || model.sourceBindingDigest !== receipt.sourceBindingDigest || model.epoch !== tool.epoch
        || model.hostBootId !== tool.hostBootId || model.hostGeneration !== tool.hostGeneration) invalid();
    const evidence = modelFact.observation.dispatchEvidence.reference;
    if (attempt.observation?.origin !== 'host' || attempt.observation.snapshotHash !== evidence.finalRequestHash || !evidence.attempts?.length) invalid();
    for (const [ordinal, send] of evidence.attempts.entries()) {
        const ref = assertBudgetAttemptRef(send.budgetAttemptRef), row = task.compute?.attempts.find(item => item.attemptId === ref.attemptId);
        if (!row || ref.kind !== undefined || ref.effectId !== model.effectId || ref.providerSendOrdinal !== ordinal
            || ref.attemptId !== sendAttemptId(model.effectId, ordinal) || !equal(ref.authorityRef, bank)
            || !equal(row.orchestration, { kind: 'provider_send', effectId: model.effectId, ordinal })
            || row.requestId !== send.requestId || row.targetFingerprint !== send.targetFingerprint || row.inputFingerprint !== send.inputFingerprint
            || (row.reservationId ?? null) !== ref.reservationId || !['charged', 'unknown', 'settled'].includes(row.status)
            || send.status === 'settled' && (row.status !== 'settled' || hash(row.usage) !== send.usageHash)) invalid();
    }
    const budget = assertBudgetAttemptRef(tool.budgetAttemptRef), row = task.compute?.localWork?.find(item => item.attemptId === budget.attemptId);
    if (budget.kind !== 'local_work' || budget.effectId !== effectId || budget.localWorkOrdinal !== 0 || budget.attemptId !== localWorkAttemptId(effectId, 0)
        || !equal(budget.authorityRef, bank) || budget.reservationId !== null || !row || row.kind !== 'project_tool' || row.status !== 'settled'
        || row.usage?.outcome !== 'completed' || (row.reservationId ?? null) !== null || row.requestId !== attempt.requestId
        || row.estimatedItems !== 1 || row.estimatedInputBytes !== Buffer.byteLength(JSON.stringify(tool.inputRef))
        || row.targetFingerprint !== tool.endpointBindingDigest || !equal(row.orchestration, { kind: 'local_work', effectId, ordinal: 0 })) invalid();
    const domainReceiptRef = { projectId: source.projectId, taskId: source.taskId, projectAttemptId: attempt.attemptId, callId: call.callId, receiptHash: hash(receipt) };
    const observation = { observationId: 'project.tool:' + effectId, observedEpoch: tool.epoch, outcome: 'confirmed',
        dispatchEvidence: { kind: 'original_domain_receipt', reference: domainReceiptRef }, domainReceiptRef, remoteOperationRef: null,
        budgetObservationRef: { ...budget, status: row.status, usageHash: hash(row.usage) }, resultRefs: [], sourceRefs: [root.sourceBinding.sourceRef], reasonCode: projectToolReason(call.name) };
    const receiptId = 'oreceipt_' + hash({ effectId, observationId: observation.observationId }).slice(0, 32);
    const host = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId)))?.doc;
    if (host && (host.schemaVersion !== 1 || host.receiptId !== receiptId || host.runId !== root.runId || host.effectId !== effectId
        || !Object.entries(observation).every(([key, value]) => equal(host[key], value)))) invalid();
    if (tool.status === 'confirmed' && !host) invalid();
    if (requireHostReceipt && (!host || tool.status !== 'confirmed')) invalid();
    return { receipt, domainReceiptRef, modelReceiptRef: modelFact.receiptRef, budgetAttemptRef: budget, observation,
        hostReceiptRef: host ? { runId: root.runId, receiptId } : null };
}

/** Exact Root-owned current Source facts. Historical receipts alone cannot start an operation. */
export async function readProjectOwnedSource(tx, handle, root, { projectAgent } = {}) {
    if (!(projectAgent instanceof ProjectAgentService) || !(projectAgent._repository instanceof ProjectTaskRepository)
        || root.ownerRef.handle !== handle || root.sourceBinding.sourceAuthority !== 'project') invalid();
    await projectAgent._repository.engine.withTransaction(handle, active => { if (active !== tx) invalid(); });
    const stored = (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: root.runId }))?.doc;
    if (!stored || !equal(stored.sourceBinding, root.sourceBinding) || !equal(stored.planRef, root.planRef) || !equal(stored.graph, root.graph)) invalid();
    const source = root.sourceBinding.sourceRef;
    const task = await ProjectTaskRepository.prototype.get.call(projectAgent._repository, handle, source.projectId, source.taskId);
    if (!task || task.baseRevision !== source.revision) invalid();
    const receipts = task.attempts.flatMap(attempt => attempt.calls.map(call => call.nativeReceipt).filter(receipt => receipt?.runId === root.runId))
        .toSorted((a, b) => a.fromSequence - b.fromSequence);
    let fingerprint = source.executionFingerprint, sequence = -1;
    const refs = [], ids = new Set();
    for (const receipt of receipts) {
        if (ids.has(receipt.effectId) || receipt.fromFingerprint !== fingerprint || receipt.fromSequence < sequence) invalid();
        const fact = await readProjectToolReceipt(tx, handle, root, receipt.effectId, { projectAgent, requireHostReceipt: true });
        if (!fact || !equal(fact.receipt, receipt)) invalid();
        ids.add(receipt.effectId); fingerprint = receipt.toFingerprint; sequence = receipt.toSequence;
        refs.push({ effectId: receipt.effectId, domainReceiptRef: fact.domainReceiptRef, hostReceiptRef: fact.hostReceiptRef });
    }
    const current = await ProjectAgentService.prototype.observeComputeSource.call(projectAgent, handle, source.projectId, source.taskId);
    if (current.task.baseRevision !== source.revision || current.project.revision.revision !== source.revision
        || current.task.executionFingerprint !== fingerprint) invalid();
    return { runId: root.runId, sourceBindingDigest: root.sourceBinding.bindingDigest, initialFingerprint: source.executionFingerprint,
        currentFingerprint: fingerprint, reviewSource: projectReviewSource(current.task, receipts.at(-1)), receiptRefs: refs };
}
