import { assertOutputTransition } from './output-transition-contracts.js';
import { hashNativeDocument as hash, equalNativeDocuments as equal } from '../repositories/common.js';
import { assertObject, assertCounter, assertDigest } from '../../../public/shared/native-orchestration-contracts.js';
import { inspectComputeEffectClosure } from '../../../public/shared/native-compute-budget.js';
import { assertResultRecord, resultDependencyDigest } from './result-contracts.js';
import { effectBudgetClosure } from './budget-port.js';
import { controlCommandId, controlRecordKey, readAttempt, readAttemptInvalidation } from './controller-common.js';
import { checkedRecord } from './plan-repository.js';
import { readProjectRoundReceipt } from './project-round-contracts.js';
import { readOriginalProjectTask } from './project-tool-receipts.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { readAttemptSettlement, attemptReceiptId } from './attempt-settlement.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { readProjectReplanHistory } from './project-replan-contracts.js';

const invalid = () => { throw new TypeError('Invalid original Project Review output facts'); };
export const projectReviewId = (kind, runId) => (kind === 'result' ? 'oresult_' : kind === 'claim' ? 'oclaim_' : 'oreceipt_')
    + hash({ kind: 'project_review_' + kind, runId }).slice(0, 32);
export const projectReviewAudience = (root, grantDigest) => ({ kind: 'project_review', runId: root.runId,
    nodeId: root.graph.outputContract.ownerNodeId, epoch: root.epoch, projectId: root.sourceBinding.sourceRef.projectId,
    taskId: root.sourceBinding.sourceRef.taskId, sourceBindingDigest: root.sourceBinding.bindingDigest, grantDigest,
    taskPurpose: 'original_native_project_review' });
export const projectReviewPayload = (root, round) => ({ kind: 'native_project_review', projectId: round.projectId, taskId: round.taskId,
    baseRevision: root.sourceBinding.sourceRef.revision, executionFingerprint: round.toFingerprint,
    roundReceiptRef: { runId: root.runId, receiptId: round.receiptId }, modelReceiptRef: round.modelReceiptRef, toolReceiptRefs: round.toolReceiptRefs });

export function projectReviewResult(root, round, producer, now) {
    const resultId = projectReviewId('result', root.runId), payload = projectReviewPayload(root, round);
    const envelope = { schemaVersion: 1, runId: root.runId, resultId, producerAttemptId: producer.attemptId,
        outputType: 'json', outputSchemaRef: { kind: 'native_builtin', schema: 'json' },
        payloadRef: { kind: 'orchestration_result_payload', runId: root.runId, resultId, integrity: hash(payload) },
        sourceRefs: [{ kind: 'run_source', runId: root.runId, epoch: root.epoch, sourceBindingDigest: root.sourceBinding.bindingDigest,
            sourceAuthority: 'project', sourceRef: root.sourceBinding.sourceRef },
        { kind: 'effect_receipt', runId: root.runId, effectId: round.effectId, receiptId: round.modelReceiptRef.receiptId, observedEpoch: root.epoch }],
        dependencyDigest: '', audienceConstraint: projectReviewAudience(root, producer.effectiveGrantDigest),
        disclosureConstraint: { kind: 'same_source_project_review_only' }, qualityRefs: [], status: 'complete', createdAt: now };
    envelope.dependencyDigest = resultDependencyDigest(envelope);
    return assertResultRecord({ schemaVersion: 1, runId: root.runId, resultId, envelope, payload }, { outputContract: root.graph.outputContract });
}

/** Read-only closure over every original Effect of this Run, including earlier rounds. */
export async function projectReviewCosts(tx, handle, root) {
    const effectIds = [];
    for (const id of root.attemptRefs) effectIds.push(...(await readAttempt(tx, handle, root, id)).doc.effectRefs);
    if (new Set(effectIds).size !== effectIds.length) invalid();
    const task = await readOriginalProjectTask(tx, handle, root.sourceBinding.sourceRef);
    if (!task?.compute) invalid();
    const facts = inspectComputeEffectClosure({ compute: task.compute }, effectIds);
    return effectBudgetClosure(root.budgetAuthorityRef, facts);
}

async function assertPublicationCommand(tx, handle, root, kind, operation, detail, outcome, epoch) {
    const commandId = controlCommandId('project.review.' + kind, root.runId);
    const command = (await checkedRecord(tx, { kind: K.orchestrationCommand, handle, commandId }))?.doc;
    if (!command || command.schemaVersion !== 1 || command.commandId !== commandId || command.target !== root.runId
        || command.operation !== 'runs.control.' + operation || command.payloadHash !== hash({ operation: command.operation,
        body: { runId: root.runId, operation, detail } }) || command.outcome?.versions?.epoch !== epoch
        || Object.entries(outcome).some(([key, value]) => !equal(command.outcome[key], value))) invalid();
}

/** Historical facts only; payload references do not grant Task access or Commit. */
export async function readProjectReviewResult(tx, handle, root) {
    if (root.graph.outputContract.kind !== 'project_review' || root.sourceBinding.sourceAuthority !== 'project' || root.parentRef) return null;
    const resultId = projectReviewId('result', root.runId), receiptId = projectReviewId('publication', root.runId);
    const saved = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'result', resultId));
    const row = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId));
    for (const ref of root.resultRefs.filter(ref => ref.resultId !== resultId)) {
        if (ref.runId !== root.runId || !await readGraphNodeResult(tx, handle, root, ref.resultId)) invalid();
    }
    if (!saved && !row) { if (root.resultRefs.some(ref => ref.resultId === resultId)) invalid(); return null; }
    if (!saved || !row || root.resultRefs.filter(ref => equal(ref, { runId: root.runId, resultId })).length !== 1) invalid();
    const receipt = row.doc, record = assertResultRecord(saved.doc, { outputContract: root.graph.outputContract });
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'roundReceiptRef', 'resultRef',
        'resultIntegrity', 'grantDigest', 'decisionSeq', 'createdAt'], 'Project Review publication');
    assertDigest(receipt.grantDigest, 'Review grant'); assertDigest(receipt.resultIntegrity, 'Review result integrity');
    for (const key of ['epoch', 'decisionSeq', 'createdAt']) assertCounter(receipt[key], key);
    const producer = (await readAttempt(tx, handle, root, record.envelope.producerAttemptId)).doc;
    const round = await readProjectRoundReceipt(tx, handle, root, producer.attemptId), settlement = await readAttemptSettlement(tx, handle, root, producer);
    const task = await readOriginalProjectTask(tx, handle, root.sourceBinding.sourceRef);
    const original = task?.attempts.find(item => item.attemptId === round?.receipt.projectAttemptId);
    if (!round || original?.calls.at(-1)?.nativeReceipt?.name !== 'atri_agent_prepare_review' || producer.status !== 'completed'
        || settlement.reasonCode !== 'project_round_ready' || producer.resultRefs.length || receipt.schemaVersion !== 1
        || receipt.receiptKind !== 'project_review_publication' || receipt.receiptId !== receiptId || receipt.runId !== root.runId
        || receipt.epoch !== producer.epoch || receipt.epoch > root.epoch || receipt.decisionSeq > root.eventSeq
        || receipt.decisionSeq <= settlement.decisionSeq || receipt.resultIntegrity !== saved.integrity
        || receipt.grantDigest !== producer.effectiveGrantDigest || !equal(receipt.resultRef, { runId: root.runId, resultId })
        || !equal(receipt.roundReceiptRef, round.receiptRef)
        || !equal(record, projectReviewResult({ ...root, epoch: receipt.epoch }, round.receipt, producer, receipt.createdAt))) invalid();
    await assertPublicationCommand(tx, handle, root, 'result', 'result.publish', { roundReceiptId: round.receipt.receiptId },
        { resultRef: receipt.resultRef }, receipt.epoch);
    let replay = root.graph.edges.some(edge => edge.loopBack && edge.from.nodeId !== edge.to.nodeId);
    // A completed Review can safely replace pure Planner work at a later graph
    // revision. Reconstruct that actual invalidation history before accepting
    // the formal output; ordinary graphs need no additional history walk.
    if (!replay && root.progress.reviews) for (const id of root.attemptRefs) {
        const attempt = (await readAttempt(tx, handle, root, id)).doc;
        if (root.graph.nodes.find(node => node.nodeId === attempt.nodeId)?.kind === 'planner'
            && await readAttemptInvalidation(tx, handle, root, attempt)) { replay = true; break; }
    }
    if (replay) await readProjectReplanHistory(tx, handle, root);
    return { record, receipt, producer, round, settlement };
}

export async function readProjectReviewOutput(tx, handle, root, { pendingCommand = false } = {}) {
    const claimId = projectReviewId('claim', root.runId), receiptId = projectReviewId('output', root.runId);
    const claimRow = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'output', claimId));
    const outputRow = await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId));
    if (!claimRow && !outputRow && !root.outputClaims.length) return null;
    if (!claimRow || !outputRow || !equal(root.outputClaims, [{ runId: root.runId, claimId }])) invalid();
    const published = await readProjectReviewResult(tx, handle, root), claim = claimRow.doc, receipt = outputRow.doc;
    if (!published) invalid();
    assertObject(claim, ['schemaVersion', 'claimId', 'runId', 'nodeAttemptId', 'outputKey', 'sourceBindingDigest', 'resultRef',
        'consumerRef', 'operationRef', 'status', 'domainReceiptRef'], 'Project Review OutputClaim');
    assertObject(receipt, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'epoch', 'graphRevision', 'claimRef', 'claimIntegrity',
        'publicationReceiptRef', 'traversalReceiptRef', 'outputAttemptReceiptRef', 'costs', 'decisionSeq', 'createdAt'], 'Project Review OutputReceipt');
    for (const key of ['epoch', 'graphRevision', 'decisionSeq', 'createdAt']) assertCounter(receipt[key], key);
    const output = (await readAttempt(tx, handle, root, claim.nodeAttemptId)).doc, settled = await readAttemptSettlement(tx, handle, root, output);
    if (claim.schemaVersion !== 1 || claim.claimId !== claimId || claim.runId !== root.runId || claim.status !== 'committed'
        || claim.outputKey !== hash({ kind: 'native_project_review', runId: root.runId, slot: root.graph.outputContract.slot })
        || claim.sourceBindingDigest !== root.sourceBinding.bindingDigest || !equal(claim.resultRef, published.receipt.resultRef)
        || !equal(claim.consumerRef, published.record.envelope.audienceConstraint) || !equal(claim.operationRef, published.record.payload)
        || !equal(claim.domainReceiptRef, published.round.receiptRef) || receipt.schemaVersion !== 1 || receipt.receiptKind !== 'project_review_output'
        || receipt.receiptId !== receiptId || receipt.runId !== root.runId || receipt.epoch !== output.epoch || receipt.epoch > root.epoch
        || receipt.graphRevision !== output.graphRevision || receipt.graphRevision > root.graphRevision
        || !equal(receipt.claimRef, root.outputClaims[0]) || receipt.claimIntegrity !== claimRow.integrity
        || !equal(receipt.publicationReceiptRef, { runId: root.runId, receiptId: published.receipt.receiptId })
        || !equal(receipt.outputAttemptReceiptRef, { runId: root.runId, receiptId: attemptReceiptId(root.runId, output.attemptId) })
        || output.nodeId !== root.graph.outputContract.ownerNodeId || output.status !== 'completed' || output.effectRefs.length
        || output.effectiveGrantDigest !== published.producer.effectiveGrantDigest || !equal(output.budgetRef, root.budgetAuthorityRef)
        || !equal(output.inputRefs, [claim.resultRef]) || output.inputDigest !== hash(output.inputRefs) || !equal(output.resultRefs, [claim.resultRef])
        || settled.reasonCode !== 'project_review_committed' || settled.effectReceiptRefs.length || settled.decisionSeq !== receipt.decisionSeq
        || settled.createdAt !== receipt.createdAt || receipt.decisionSeq > root.eventSeq || receipt.decisionSeq <= published.receipt.decisionSeq
        || !equal(receipt.costs, await projectReviewCosts(tx, handle, root)) || receipt.costs.closed !== true) invalid();
    await assertOutputTransition(tx, handle, root, { published, output, receipt });
    // RunRepository validates the output before saving its command in the same
    // transaction. Every subsequent historical read requires that command too.
    if (!pendingCommand) await assertPublicationCommand(tx, handle, root, 'output', 'output.publish', { attemptId: output.attemptId },
        { claimRef: receipt.claimRef }, receipt.epoch);
    return { claim, receipt, published };
}
