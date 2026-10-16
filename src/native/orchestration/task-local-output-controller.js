import { ConflictError } from '../../storage/errors.js';
import { fields } from '../../../public/shared/native-values.js';
import { NativeGenerationHost } from '../adapters/generation-host.js';
import { NativeNarratorOrchestrationAuthority } from './native-turn-orchestration.js';
import { inspectNativeRpDelegationIdentity, inspectNativeRpDelegation, inspectNativeRpDelegationOutput } from './native-rp-generation.js';
import { RunRepository } from './run-repository.js';
import { SourcePort } from './source-port.js';
import { BudgetPort } from './budget-port.js';
import { TransitionController } from './transition-controller.js';
import { AttemptController } from './attempt-controller.js';
import { readResultPublication } from './result-publication-contracts.js';
import { controlCommandId, controlRecordKey, readAttempt, runGuard } from './controller-common.js';
import { attemptReceiptId, writeAttemptSettlement } from './attempt-settlement.js';
import { hashNativeDocument as hash, putImmutable } from '../repositories/common.js';
import { immutable } from '../model-prompt-runtime/execution-utils.js';
import { assertTaskLocalClaim, taskLocalOutputKey, taskLocalClaimId, taskLocalConsumer,
    taskLocalReceiptId, childClosureReceiptId, readTaskLocalOutput } from './task-local-output-contracts.js';

const fail = code => { throw new ConflictError(code); };
const equal = (a, b) => hash(a) === hash(b);
const DENIALS = new Set(['native_orchestration_source_stale', 'native_orchestration_parent_stale',
    'native_generation_revision_conflict', 'native_rp_source_missing', 'native_rp_control_relocated',
    'native_orchestration_task_output_stale', 'native_orchestration_child_budget_unclosed']);

/** Graph output only. The parent remains waiting; this is not a Chat output writer. */
export class TaskLocalOutputController {
    constructor({ host }) {
        if (!(host instanceof NativeGenerationHost) || !(host.turnOrchestration instanceof NativeNarratorOrchestrationAuthority))
            throw new TypeError('Original RP Model Host required');
        const execution = Object.getOwnPropertyDescriptor(NativeNarratorOrchestrationAuthority.prototype, 'execution').get.call(host.turnOrchestration);
        if (!(execution.runs instanceof RunRepository) || !(execution.sourcePort instanceof SourcePort) || !(execution.budgetPort instanceof BudgetPort)
            || execution.runs.engine !== host.persistence._engine || execution.sourcePort.rpControl !== host.turnOrchestration.rpControl)
            throw new TypeError('Original shared execution required');
        Object.assign(this, { host, execution });
    }

    async #preflight(handle, tx, capture, publication, phase) {
        const inspect = phase === 'prepare' ? inspectNativeRpDelegation : inspectNativeRpDelegationOutput;
        const current = await inspect(capture, { host: this.host, handle, tx });
        const identity = { childRunId: current.childRunId, parentRunId: current.parentRunId, parentAttemptId: current.parentAttemptId,
            childEpoch: current.childEpoch, parentEpoch: current.parentEpoch };
        const admission = await NativeNarratorOrchestrationAuthority.prototype.authorizeTaskLocalOutput.call(this.host.turnOrchestration,
            { handle, tx, capture, phase, identity, publication });
        const root = await this.execution.runs.get(handle, current.childRunId), parent = await this.execution.runs.get(handle, current.parentRunId);
        if (!equal(root, current.root) || !equal(parent, current.parentRoot) || root.status !== 'running' || root.cancelRequested
            || root.pendingEffectRefs.length || root.pendingApprovalRefs.length || root.outputClaims.length) fail('native_orchestration_task_output_stale');
        const published = await readResultPublication(tx, handle, root, publication.resultRef.resultId);
        const inputRefs = [publication.resultRef];
        if (!published || !equal(admission, { inputRefs, inputDigest: hash(inputRefs), effectiveGrantDigest: current.grantDigest, budgetRef: root.budgetAuthorityRef })
            || !equal(root.resultRefs, inputRefs) || published.receipt.epoch !== root.epoch || published.receipt.producerGrantDigest !== current.grantDigest)
            fail('native_orchestration_task_output_denied');
        const fence = await this.execution.runs.engine.nativeHostLifecycle.assertWriter(handle, tx);
        if (fence.hostBootId !== root.hostBootId || fence.generation !== root.hostGeneration) fail('native_orchestration_task_output_stale');
        return { current, root, published, admission };
    }

    async complete(handle, request) {
        fields(request, ['capture', 'publication'], 'Task-local output');
        const { capture } = request, publication = immutable(request.publication), { runs, sourcePort, budgetPort } = this.execution, engine = runs.engine;
        // A nested ALS transaction would collapse the reservation saga. Refuse
        // before any Graph or bank change, including on FS's shared root scope.
        if (typeof engine.hasActiveTransaction !== 'function' || engine.hasActiveTransaction(handle)) fail('native_orchestration_output_transaction_required');
        const identity = inspectNativeRpDelegationIdentity(capture, { host: this.host, handle });
        const runId = identity.childRunId, withAuthority = SourcePort.prototype.consumptionBoundary.call(sourcePort, handle, identity.sourceBinding, { engine });
        const pending = () => immutable({ status: 'pending_output', outputClaimRef: null, outputReceiptRef: null });
        const transaction = operation => engine.withTransaction(handle, operation);
        // Catch only preflight denials, before any metadata write. Lawful same-
        // transaction source/cancel writes must commit before the caller rejects.
        const preflight = async (tx, phase) => {
            try { return await this.#preflight(handle, tx, capture, publication, phase); } catch (error) { if (DENIALS.has(error.code)) return { denied: true }; throw error; }
        };
        try {
            return await RunRepository.prototype.withSourceControl.call(runs, handle, runId, async () => {
                const prepared = await transaction(async tx => {
                    const checked = await preflight(tx, 'prepare');
                    if (checked.denied) return checked;
                    const { root, admission, published } = checked, edge = root.graph.edges[0];
                    const traversal = await new TransitionController({ runs, authorizeTransition: async ({ producers, target }) => {
                        if (producers.length !== 1 || producers[0].attempt.attemptId !== published.receipt.producerAttemptId
                            || target.nodeId !== root.graph.outputContract.ownerNodeId) fail('native_orchestration_task_output_denied');
                        return admission;
                    } }).advance(handle, { ...runGuard(root), bindings: [{ edgeId: edge.edgeId, producerAttemptId: published.receipt.producerAttemptId }], reservedAttemptId: null });
                    const attemptId = traversal.outcome.attemptId;
                    await new AttemptController({ runs, authorizeAttempt: async ({ attempt }) => {
                        if (attempt.attemptId !== attemptId || !equal(attempt.inputRefs, admission.inputRefs)
                            || attempt.effectiveGrantDigest !== admission.effectiveGrantDigest || !equal(attempt.budgetRef, admission.budgetRef))
                            fail('native_orchestration_task_output_denied');
                    } }).activate(handle, { ...runGuard(await runs.get(handle, runId)), attemptId });
                    return { denied: false, attemptId, root, producerReceiptRef: { runId, receiptId: published.attemptReceipt.receiptId },
                        traversalReceiptRef: { runId, receiptId: traversal.outcome.traversalReceipt.receiptId } };
                });
                if (prepared.denied) fail('native_orchestration_task_output_stale');
                // Graph output has no send capability. The original active
                // producer remains scoped, but no new Model Attempt can enter.
                let releaseError;
                try { await BudgetPort.prototype.releaseUnused.call(budgetPort, handle, { authorityRef: identity.sourceBinding.budgetAuthorityRef, reservationId: runId }); } catch (error) {
                    if (!['storage_commit_unknown', 'native_generation_reservation_unsettled'].includes(error.code)) throw error;
                    releaseError = error;
                }
                // Release ACK uncertainty is resolved only by observing this
                // exact bank. No second release or Model send is performed.
                const closure = await transaction(tx => BudgetPort.prototype.observeChildClosure.call(budgetPort, handle, {
                    authorityRef: identity.sourceBinding.budgetAuthorityRef, reservationId: runId,
                    expectedParentReservationId: prepared.root.parentRef.depth === 1 ? null : prepared.root.parentRef.parentRunId,
                    expectedCeiling: prepared.root.parentRef.budgetCeiling }, { tx }));
                if (!closure.closed) return pending();
                if (releaseError && releaseError.code !== 'storage_commit_unknown') throw releaseError;
                const publishedOutput = await transaction(async tx => {
                    const checked = await preflight(tx, 'publish');
                    if (checked.denied) return checked;
                    if (!equal(checked.current.closure, closure)) fail('native_orchestration_task_output_stale');
                    const saved = await runs.control(handle, controlCommandId('output.publish', { runId }), {
                        ...runGuard(checked.root), operation: 'output.publish', detail: { publicationReceiptRef: publication.publicationReceiptRef,
                            attemptId: prepared.attemptId } }, async ({ tx, root, now }) => {
                        if (!equal(root, checked.root) || root.status !== 'running' || root.cancelRequested
                            || root.progress.steps >= root.limits.maxSteps || now >= root.progress.deadlineAt) fail('native_orchestration_task_output_stale');
                        const record = await readAttempt(tx, handle, root, prepared.attemptId), attempt = record.doc;
                        if (attempt.status !== 'running' || attempt.epoch !== root.epoch || attempt.effectRefs.length || attempt.resultRefs.length
                            || attempt.nodeId !== root.graph.outputContract.ownerNodeId || !equal(attempt.inputRefs, checked.admission.inputRefs)
                            || attempt.inputDigest !== checked.admission.inputDigest || attempt.effectiveGrantDigest !== checked.admission.effectiveGrantDigest
                            || !equal(attempt.budgetRef, checked.admission.budgetRef) || root.attemptRefs.length !== 2)
                            fail('native_orchestration_task_output_denied');
                        const claimId = taskLocalClaimId(root), claimRef = { runId, claimId };
                        const claim = assertTaskLocalClaim({ schemaVersion: 1, runId, claimId, nodeAttemptId: attempt.attemptId,
                            outputKey: taskLocalOutputKey(root), sourceBindingDigest: root.sourceBinding.bindingDigest,
                            resultRef: publication.resultRef, consumerRef: taskLocalConsumer(root),
                            operationRef: { kind: 'task_local_output', runId, outputKey: taskLocalOutputKey(root) },
                            status: 'committed', domainReceiptRef: null }, root);
                        const budgetClosureReceiptRef = { runId, receiptId: childClosureReceiptId(runId) };
                        const closed = { schemaVersion: 1, receiptKind: 'child_budget_closed', receiptId: budgetClosureReceiptRef.receiptId,
                            runId, epoch: root.epoch, authorityRef: closure.authorityRef, reservationId: closure.reservationId,
                            parentReservationId: closure.parentReservationId, budgetCeilingDigest: hash(root.parentRef.budgetCeiling),
                            reservationRefs: closure.reservationRefs, budgetAttemptRefs: closure.budgetAttemptRefs,
                            snapshotDigest: closure.snapshotDigest, decisionSeq: root.eventSeq + 1, createdAt: now };
                        const receipt = { schemaVersion: 1, receiptKind: 'task_local_output', receiptId: taskLocalReceiptId(runId), runId,
                            epoch: root.epoch, graphRevision: root.graphRevision, claimRef, claimIntegrity: hash(claim),
                            publicationReceiptRef: publication.publicationReceiptRef, traversalReceiptRef: prepared.traversalReceiptRef,
                            producerReceiptRef: prepared.producerReceiptRef,
                            outputAttemptReceiptRef: { runId, receiptId: attemptReceiptId(runId, attempt.attemptId) }, budgetClosureReceiptRef,
                            decisionSeq: root.eventSeq + 1, createdAt: now };
                        await putImmutable(tx, controlRecordKey(handle, runId, 'output', claimId), claim);
                        await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', closed.receiptId), closed);
                        await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receipt.receiptId), receipt);
                        await writeAttemptSettlement({ tx, handle, root, record, outcome: 'completed', resultRefs: [publication.resultRef],
                            effectReceiptRefs: [], reasonCode: 'task_local_output_committed', now });
                        root.outputClaims.push(claimRef); root.status = 'completed'; root.progress.steps++;
                        return { root, eventType: 'task_local_output_committed', reasonCode: 'task_local_output_committed',
                            outcome: { outputClaimRef: claimRef, outputReceiptRef: { runId, receiptId: receipt.receiptId } } };
                    });
                    return { denied: false, status: 'completed', outputClaimRef: saved.outcome.outputClaimRef, outputReceiptRef: saved.outcome.outputReceiptRef };
                });
                if (publishedOutput.denied) fail('native_orchestration_task_output_stale');
                return immutable({ status: publishedOutput.status, outputClaimRef: publishedOutput.outputClaimRef, outputReceiptRef: publishedOutput.outputReceiptRef });
            }, { withAuthority });
        } catch (error) {
            if (error.code !== 'storage_commit_unknown') throw error;
            const saved = await this.observe(handle, { runId });
            if (saved.status !== 'completed') throw error;
            return saved;
        }
    }

    async observe(handle, request) {
        fields(request, ['runId'], 'Task-local output observation');
        return this.execution.runs.engine.withTransaction(handle, async tx => {
            const root = await this.execution.runs.get(handle, request.runId), facts = await readTaskLocalOutput(tx, handle, root);
            return facts ? immutable({ status: 'completed', outputClaimRef: facts.receipt.claimRef,
                outputReceiptRef: { runId: root.runId, receiptId: facts.receipt.receiptId } })
                : { status: 'unknown', outputClaimRef: null, outputReceiptRef: null };
        });
    }
}
