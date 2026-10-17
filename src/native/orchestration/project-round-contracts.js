import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { assertObject, assertCounter, assertDigest } from '../../../public/shared/native-orchestration-contracts.js';
import { controlCommandId, controlRecordKey, readAttempt } from './controller-common.js';
import { checkedRecord } from './plan-repository.js';
import { readEffect } from './effect-contracts.js';
import { readModelCompletionReceipt } from './model-port.js';
import { readProjectToolReceipt, readOriginalProjectTask } from './project-tool-receipts.js';
import { assertBudgetAuthorityRef, assertBudgetAttemptRef, sendAttemptId } from './budget-port.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { assertProjectQualityRound } from './project-quality-contracts.js';
import { assertProjectControlRound } from './project-control-input-contracts.js';

const equal = (a, b) => hash(a) === hash(b);
const invalid = () => { throw Object.assign(new TypeError('native_orchestration_project_round_receipt_invalid'), { code: 'native_orchestration_project_round_receipt_invalid' }); };
export const projectRoundReceiptId = (runId, nodeAttemptId) => 'oreceipt_' + hash({ kind: 'project_round', runId, nodeAttemptId }).slice(0, 32);
export const projectRoundCommandId = (runId, nodeAttemptId) => controlCommandId('project.round.finish', { runId, nodeAttemptId });

/** Historical original Task/Model/tool completion facts, never a replay or next-round grant. */
export async function readProjectRoundReceipt(tx, handle, root, nodeAttemptId, { projectAgent } = {}) {
    if (root.ownerRef.handle !== handle || root.sourceBinding.sourceAuthority !== 'project') invalid();
    const stored = (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: root.runId }))?.doc;
    if (!stored || !equal(stored.sourceBinding, root.sourceBinding) || !equal(stored.planRef, root.planRef) || !equal(stored.graph, root.graph)) invalid();
    const receiptId = projectRoundReceiptId(root.runId, nodeAttemptId), row = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId));
    if (!row) return null;
    const receipt = row.doc;
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'nodeAttemptId', 'effectId', 'modelReceiptRef', 'modelPayloadHash',
        'projectId', 'taskId', 'projectAttemptId', 'requestId', 'operationId', 'round', 'sourceBindingDigest', 'fromFingerprint', 'toFingerprint',
        'taskSequence', 'conversationLength', 'conversationDigest', 'attemptDigest', 'toolReceiptRefs', 'createdAt'], 'Project round receipt');
    if (receipt.schemaVersion !== 1 || receipt.receiptKind !== 'project_round' || receipt.receiptId !== receiptId || receipt.runId !== root.runId
        || receipt.nodeAttemptId !== nodeAttemptId || receipt.sourceBindingDigest !== root.sourceBinding.bindingDigest || receipt.round > 11) invalid();
    for (const field of ['round', 'taskSequence', 'conversationLength', 'createdAt']) assertCounter(receipt[field], field);
    for (const field of ['modelPayloadHash', 'sourceBindingDigest', 'fromFingerprint', 'toFingerprint', 'conversationDigest', 'attemptDigest']) assertDigest(receipt[field], field);
    const { schemaVersion: _schema, receiptKind: _kind, receiptId: _id, createdAt: _at, ...descriptor } = receipt;
    const commandId = projectRoundCommandId(root.runId, nodeAttemptId), command = (await checkedRecord(tx, { kind: K.orchestrationCommand, handle, commandId }))?.doc;
    if (!command || command.schemaVersion !== 1 || command.commandId !== commandId || command.operation !== 'runs.control.project.round.finish'
        || command.target !== root.runId || command.payloadHash !== hash({ operation: command.operation, body: { runId: root.runId, operation: 'project.round.finish', detail: descriptor } })
        || command.outcome?.receiptIntegrity !== row.integrity || !equal(command.outcome.receiptRef, { runId: root.runId, receiptId })) invalid();
    const source = root.sourceBinding.sourceRef;
    if (receipt.projectId !== source.projectId || receipt.taskId !== source.taskId || receipt.round === 0 && receipt.fromFingerprint !== source.executionFingerprint) invalid();
    const task = await readOriginalProjectTask(tx, handle, source, projectAgent);
    const attempt = task?.attempts.find(item => item.attemptId === receipt.projectAttemptId && item.kind === 'generation');
    if (!task || task.baseRevision !== source.revision || task.sequence < receipt.taskSequence || attempt?.status !== 'completed'
        || attempt.requestId !== receipt.requestId || hash(attempt) !== receipt.attemptDigest || task.conversation.length < receipt.conversationLength
        || hash(task.conversation.slice(0, receipt.conversationLength)) !== receipt.conversationDigest) invalid();
    const { doc: nodeAttempt } = await readAttempt(tx, handle, root, nodeAttemptId), model = (await readEffect(tx, handle, root, receipt.effectId)).doc;
    const modelFact = await readModelCompletionReceipt(handle, tx, root, model), evidence = modelFact?.observation.dispatchEvidence.reference;
    if (!modelFact || !equal(modelFact.receiptRef, receipt.modelReceiptRef) || evidence.resultOutputType !== 'json' || evidence.resultPayloadHash !== receipt.modelPayloadHash
        || attempt.observation?.origin !== 'host' || attempt.observation.snapshotHash !== evidence.finalRequestHash || model.nodeAttemptId !== nodeAttemptId
        || model.inputRef.kind !== 'native_project_intent' || model.inputRef.nodeId !== nodeAttempt.nodeId || model.inputRef.projectAttemptId !== receipt.projectAttemptId
        || model.inputRef.requestId !== receipt.requestId || model.inputRef.operationId !== receipt.operationId || !equal(model.inputRef.sourceRef, source)
        || receipt.fromFingerprint !== (model.inputRef.currentSourceFingerprint ?? source.executionFingerprint)
        || model.sourceBindingDigest !== receipt.sourceBindingDigest || nodeAttempt.effectiveGrantDigest !== model.grantDigest
        || !nodeAttempt.effectRefs.includes(model.effectId) || command.outcome.versions?.epoch !== model.epoch) invalid();
    const qualityVerified = await assertProjectQualityRound(tx, handle, root, nodeAttempt, model.inputRef, receipt.round);
    await assertProjectControlRound(tx, handle, root, nodeAttempt, model.inputRef, receipt.round, { qualityVerified });
    if (receipt.round === 0 && nodeAttempt.attemptNumber !== 1) invalid();
    if (receipt.round > 0) {
        // Global operation rounds and per-node attempt numbers differ when
        // the original Task crosses an authored collaboration edge. Resolve
        // the exact prior round from its immutable domain completion receipt.
        const candidates = [];
        for (const ref of root.attemptRefs) {
            if (ref === nodeAttemptId) continue;
            const row = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', projectRoundReceiptId(root.runId, ref)));
            if (row?.doc.round === receipt.round - 1) candidates.push((await readAttempt(tx, handle, root, ref)).doc);
        }
        if (candidates.length !== 1) invalid();
        const previous = candidates[0], prior = await readProjectRoundReceipt(tx, handle, root, previous.attemptId, { projectAgent });
        const loop = root.graph.edges.find(edge => edge.from.nodeId === previous.nodeId && edge.to.nodeId === nodeAttempt.nodeId);
        const nodeRounds = [];
        for (const ref of root.attemptRefs) {
            const item = (await readAttempt(tx, handle, root, ref)).doc;
            if (item.nodeId !== nodeAttempt.nodeId || ref === nodeAttemptId) continue;
            const fact = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', projectRoundReceiptId(root.runId, ref))))?.doc;
            if (fact && fact.round < receipt.round) nodeRounds.push(item);
        }
        if (!prior || !loop || !prior.receipt.toolReceiptRefs.length || prior.receipt.round + 1 !== receipt.round
            || prior.receipt.toFingerprint !== receipt.fromFingerprint || previous.status !== 'completed'
            || nodeAttempt.attemptNumber !== nodeRounds.length + 1) invalid();
        const settlement = await readAttemptSettlement(tx, handle, root, previous);
        const bindings = [{ edgeId: loop.edgeId, producerAttemptId: previous.attemptId }], identity = hash({ runId: root.runId, bindings, reservedAttemptId: null });
        const traversalId = 'oreceipt_' + identity.slice(0, 32), traversal = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', traversalId)))?.doc;
        const transfer = { edgeId: loop.edgeId, producerAttemptId: previous.attemptId, nodeAttemptId },
            edgeReceiptId = 'oreceipt_' + hash({ kind: 'edge_admission', runId: root.runId, ...transfer }).slice(0, 32);
        const edge = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', edgeReceiptId)))?.doc;
        // Loop progress is global to the authored graph. A Planner loop can
        // precede the formal Task loop; retain the exact previous admission
        // baseline rather than equating it with this node's attempt number.
        const previousAdmissionId = 'oreceipt_' + previous.attemptId.slice('oattempt_'.length);
        const previousAdmission = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', previousAdmissionId)))?.doc;
        const previousWasTransitioned = prior.receipt.round > 0 || Boolean(previous.inputRefs[0].controlGraph || previous.inputRefs[0].qualityApproval);
        if (Boolean(previousAdmission) !== previousWasTransitioned || previousAdmission && (previousAdmission.receiptKind !== 'graph_transition'
            || previousAdmission.nodeAttemptId !== previous.attemptId || previousAdmission.runId !== root.runId)) invalid();
        const expectedLoopIterations = (previousAdmission?.loopIterations ?? 0) + Number(loop.loopBack);
        if (nodeAttemptId !== 'oattempt_' + identity.slice(0, 32) || settlement.reasonCode !== 'project_round_ready' || !traversal
            || traversal.receiptKind !== 'graph_transition' || traversal.runId !== root.runId || traversal.nodeAttemptId !== nodeAttemptId
            || traversal.inputDigest !== nodeAttempt.inputDigest || !equal(traversal.bindings, bindings)
            || !equal(traversal.producerReceiptRefs, [settlement.receiptId]) || !equal(traversal.edgeAdmissionRefs, [edgeReceiptId])
            || !edge || edge.receiptKind !== 'edge_admission' || edge.runId !== root.runId || edge.receiptId !== edgeReceiptId
            || Object.entries(transfer).some(([key, value]) => edge[key] !== value) || edge.sourceBindingDigest !== receipt.sourceBindingDigest
            || edge.edgeVisit !== (loop.loopBack ? nodeAttempt.attemptNumber - 1 : 1)
            || edge.loopIteration !== expectedLoopIterations || traversal.loopIterations !== expectedLoopIterations || edge.epoch !== nodeAttempt.epoch
            || edge.edgeVisit > (root.progress.edgeVisitCounts[loop.edgeId] ?? 0) || edge.loopIteration > root.progress.loopIterations
            || edge.edgeVisit > loop.maxVisits || edge.loopIteration > root.limits.maxLoopIterations) invalid();
        const loopCommandId = controlCommandId('loop.advance', identity), loopCommand = (await checkedRecord(tx, { kind: K.orchestrationCommand, handle, commandId: loopCommandId }))?.doc;
        if (!loopCommand || loopCommand.operation !== 'runs.control.loop.advance' || loopCommand.target !== root.runId
            || !equal(loopCommand.outcome?.traversalReceipt, traversal) || loopCommand.outcome.attemptId !== nodeAttemptId
            || !nodeAttempt.inputRefs.some(ref => equal(ref, prior.receiptRef))) invalid();
    }
    const bank = assertBudgetAuthorityRef(root.budgetAuthorityRef);
    if (bank.authority !== 'project_task' || bank.projectId !== source.projectId || bank.taskId !== source.taskId
        || !equal(bank, root.sourceBinding.budgetAuthorityRef) || bank.operationId !== hash({ projectId: source.projectId, taskId: source.taskId,
        revision: source.revision, executionFingerprint: source.executionFingerprint }) || !evidence.attempts?.length) invalid();
    for (const [ordinal, send] of evidence.attempts.entries()) {
        const ref = assertBudgetAttemptRef(send.budgetAttemptRef), row = task.compute?.attempts.find(item => item.attemptId === ref.attemptId);
        if (!row || ref.kind !== undefined || !equal(ref.authorityRef, bank) || ref.effectId !== model.effectId || ref.providerSendOrdinal !== ordinal
            || ref.attemptId !== sendAttemptId(model.effectId, ordinal) || !equal(row.orchestration, { kind: 'provider_send', effectId: model.effectId, ordinal })
            || row.requestId !== send.requestId || row.targetFingerprint !== send.targetFingerprint || row.inputFingerprint !== send.inputFingerprint
            || (row.reservationId ?? null) !== ref.reservationId || !['charged', 'unknown', 'settled'].includes(row.status)
            || send.status === 'settled' && (row.status !== 'settled' || hash(row.usage) !== send.usageHash)) invalid();
    }
    const calls = attempt.calls.filter(call => call.nativeReceipt?.runId === root.runId);
    if (!Array.isArray(receipt.toolReceiptRefs) || calls.length !== receipt.toolReceiptRefs.length || calls.length !== attempt.calls.length) invalid();
    let fingerprint = receipt.fromFingerprint;
    for (const [index, call] of calls.entries()) {
        const ref = receipt.toolReceiptRefs[index]; assertObject(ref, ['effectId', 'receiptHash'], 'Project round tool receipt');
        const fact = await readProjectToolReceipt(tx, handle, root, ref.effectId, { projectAgent, requireHostReceipt: true });
        if (!fact || hash(fact.receipt) !== ref.receiptHash || !equal(fact.receipt, call.nativeReceipt) || fact.receipt.fromFingerprint !== fingerprint
            || fact.receipt.nodeAttemptId !== nodeAttemptId || fact.receipt.projectAttemptId !== receipt.projectAttemptId) invalid();
        fingerprint = fact.receipt.toFingerprint;
    }
    if (fingerprint !== receipt.toFingerprint || nodeAttempt.effectRefs.length !== receipt.toolReceiptRefs.length + 1) invalid();
    return { receipt, receiptRef: { runId: root.runId, receiptId }, integrity: row.integrity };
}
