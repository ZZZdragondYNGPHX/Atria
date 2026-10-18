import { ConflictError } from '../../storage/errors.js';
import { fields } from '../../../public/shared/native-values.js';
import { NativeGenerationHost } from '../adapters/generation-host.js';
import { NativeNarratorOrchestrationAuthority } from './native-turn-orchestration.js';
import { RunRepository, assertRunTreeConcurrency } from './run-repository.js';
import { SourcePort } from './source-port.js';
import { controlCommandId, controlRecordKey, readAttempt, runGuard } from './controller-common.js';
import { hashNativeDocument as hash, putImmutable, putMutable, equalNativeDocuments as equal } from '../repositories/common.js';
import { immutable } from '../model-prompt-runtime/execution-utils.js';
import { handoffReturnReceiptId, readHandoffReturn } from './handoff-return-contracts.js';


const fail = code => { throw new ConflictError(code); };
const DENIALS = new Set(['native_orchestration_source_stale', 'native_orchestration_parent_stale', 'native_orchestration_return_stale',
    'native_generation_revision_conflict', 'native_rp_source_missing', 'native_rp_control_relocated']);

/** The original parent permit is already active. Persist the distinct logical return. */
export class HandoffReturnController {
    constructor({ host }) {
        if (!(host instanceof NativeGenerationHost) || !(host.turnOrchestration instanceof NativeNarratorOrchestrationAuthority))
            throw new TypeError('Original parent Model Host required');
        const execution = Object.getOwnPropertyDescriptor(NativeNarratorOrchestrationAuthority.prototype, 'execution').get.call(host.turnOrchestration);
        if (!(execution.runs instanceof RunRepository) || !(execution.sourcePort instanceof SourcePort)
            || execution.runs.engine !== host.persistence._engine || execution.sourcePort.rpControl !== host.turnOrchestration.rpControl)
            throw new TypeError('Original parent execution required');
        Object.assign(this, { host, execution });
    }

    async #preflight(handle, tx, capture) {
        const current = await NativeNarratorOrchestrationAuthority.prototype.inspectReturn.call(this.host.turnOrchestration, capture, { host: this.host, handle, tx });
        await assertRunTreeConcurrency(tx, handle, current.parent, { additionalSlots: 1 });
        const decision = await NativeNarratorOrchestrationAuthority.prototype.authorizeHandoffReturn.call(this.host.turnOrchestration, { handle, tx, capture });
        if (!equal(decision, { allowed: true, parentGrantDigest: current.parentGrantDigest, childGrantDigest: current.childGrantDigest,
            sourceBindingDigest: current.sourceBinding.bindingDigest, parentInputDigest: current.parentInputDigest,
            resultRef: current.resultRef, outputReceiptRef: current.outputReceiptRef, controlToken: current.handoff.controlToken }))
            fail('native_orchestration_return_denied');
        const parent = await this.execution.runs.get(handle, current.parentRunId), child = await this.execution.runs.get(handle, current.childRunId);
        if (!equal(parent, current.parent) || !equal(child, current.child) || current.attempt.status !== 'waiting_child') fail('native_orchestration_return_stale');
        return current;
    }

    async returnChild(handle, request) {
        fields(request, ['capture'], 'Handoff return');
        const { capture } = request, { runs, sourcePort } = this.execution, engine = runs.engine;
        if (typeof engine.hasActiveTransaction !== 'function' || engine.hasActiveTransaction(handle)) fail('native_orchestration_return_transaction_required');
        const identity = NativeNarratorOrchestrationAuthority.prototype.inspectReturnIdentity.call(this.host.turnOrchestration, capture, { host: this.host, handle });
        const withAuthority = SourcePort.prototype.consumptionBoundary.call(sourcePort, handle, identity.sourceBinding, { engine });
        let outcome;
        try {
            // Lock the complete child lineage before entering the original
            // Source boundary, including when the command itself targets parent.
            outcome = await RunRepository.prototype.withSourceControl.call(runs, handle, identity.childRunId,
                () => engine.withTransaction(handle, async tx => {
                    let checked;
                    try { checked = await this.#preflight(handle, tx, capture); } catch (error) {
                        if (DENIALS.has(error.code)) return { denied: true };
                        throw error;
                    }
                    const receiptId = handoffReturnReceiptId(identity.childRunId);
                    // No external authority await after this write boundary.
                    const saved = await runs.control(handle, controlCommandId('run.returnHandoff', identity.childRunId), {
                        ...runGuard(checked.parent), operation: 'run.returnHandoff', detail: { childRunId: identity.childRunId,
                            resultRef: checked.resultRef, outputReceiptRef: checked.outputReceiptRef } }, async ({ tx, root, now }) => {
                        if (!equal(root, checked.parent) || root.cancelRequested || root.status !== 'running' || now >= root.progress.deadlineAt
                            || root.progress.steps >= root.limits.maxSteps) fail('native_orchestration_return_stale');
                        const record = await readAttempt(tx, handle, root, checked.parentAttemptId);
                        if (!equal(record.doc, checked.attempt)) fail('native_orchestration_return_stale');
                        const result = await tx.getResource(controlRecordKey(handle, checked.childRunId, 'result', checked.resultRef.resultId));
                        const receipt = { schemaVersion: 1, receiptKind: 'handoff_return', receiptId, runId: root.runId, epoch: root.epoch,
                            parentAttemptId: record.doc.attemptId, parentInputDigest: record.doc.inputDigest, parentGrantDigest: record.doc.effectiveGrantDigest,
                            childRunId: checked.childRunId, childEpoch: checked.childEpoch, childGrantDigest: checked.childGrantDigest,
                            sourceBindingDigest: root.sourceBinding.bindingDigest, controlToken: checked.handoff.controlToken,
                            handoffReceiptRef: { runId: root.runId, receiptId: checked.handoff.receiptId }, outputReceiptRef: checked.outputReceiptRef,
                            budgetClosureReceiptRef: { runId: checked.childRunId, receiptId: checked.output.closure.receiptId },
                            resultRef: checked.resultRef, resultIntegrity: result.integrity, audienceDigest: hash(result.doc.envelope.audienceConstraint),
                            decisionSeq: root.eventSeq + 1, createdAt: now };
                        await putImmutable(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId), receipt);
                        await putMutable(tx, controlRecordKey(handle, root.runId, 'attempt', record.doc.attemptId), { ...record.doc, status: 'running' },
                            { expectedIntegrity: record.integrity });
                        root.progress.steps++;
                        await readHandoffReturn(tx, handle, { ...root, eventSeq: root.eventSeq + 1 }, checked.childRunId);
                        return { root, eventType: 'handoff_returned', reasonCode: null,
                            outcome: { returnReceiptRef: { runId: root.runId, receiptId } } };
                    }, { resourceIds: [identity.childRunId] });
                    return { denied: false, returnReceiptRef: saved.outcome.returnReceiptRef };
                }), { withAuthority });
        } catch (error) {
            if (error.code !== 'storage_commit_unknown') throw error;
            const saved = await this.observe(handle, { parentRunId: identity.parentRunId, childRunId: identity.childRunId });
            if (saved.status !== 'returned') throw error;
            return saved;
        }
        if (outcome.denied) fail('native_orchestration_return_stale');
        return immutable({ status: 'returned', returnReceiptRef: outcome.returnReceiptRef });
    }

    async observe(handle, request) {
        fields(request, ['parentRunId', 'childRunId'], 'Handoff return observation');
        return this.execution.runs.engine.withTransaction(handle, async tx => {
            const parent = await this.execution.runs.get(handle, request.parentRunId), receipt = await readHandoffReturn(tx, handle, parent, request.childRunId);
            return receipt ? immutable({ status: 'returned', returnReceiptRef: { runId: parent.runId, receiptId: receipt.receiptId } })
                : { status: 'unknown', returnReceiptRef: null };
        });
    }
}
