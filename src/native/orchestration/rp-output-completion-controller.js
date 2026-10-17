import { ConflictError } from '../../storage/errors.js';
import { fields } from '../../../public/shared/native-values.js';
import { NativeGenerationHost } from '../adapters/generation-host.js';
import { NativeNarratorOrchestrationAuthority } from './native-turn-orchestration.js';
import { inspectNativeRpOutputIdentity } from './native-rp-generation.js';
import { hashNativeDocument as hash, putImmutable } from '../repositories/common.js';
import { immutable } from '../model-prompt-runtime/execution-utils.js';
import { BudgetPort } from './budget-port.js';
import { SourcePort } from './source-port.js';
import { controlCommandId, controlRecordKey, readAttempt, runGuard } from './controller-common.js';
import { writeAttemptSettlement, attemptReceiptId } from './attempt-settlement.js';
import { readRpNarrationResult } from './rp-narration-result-contracts.js';
import { rpOutputClaimId, rpOutputReceiptId, rpOutputClosureId, rpOutputKey, rpOutputDomainRef, rpOutputConsumer, readRpOutput } from './rp-output-contracts.js';
import { readRpPlannerCompletion } from './rp-planner-contracts.js';

const fail = code => { throw new ConflictError(code); };
const equal = (a, b) => hash(a) === hash(b);
const DENIALS = new Set(['native_rp_output_stale', 'native_orchestration_source_stale', 'native_generation_revision_conflict',
    'native_rp_source_missing', 'native_rp_control_relocated']);
const pending = () => immutable({ runStatus: 'pending_output', outputClaimRef: null, outputReceiptRef: null });

/** Original Graph metadata completion after the separate domain commit and costs. */
export class RpOutputCompletionController {
    constructor({ host }) {
        if (!(host instanceof NativeGenerationHost) || !(host.turnOrchestration instanceof NativeNarratorOrchestrationAuthority)) throw new TypeError('Original RP Host required');
        const execution = Object.getOwnPropertyDescriptor(NativeNarratorOrchestrationAuthority.prototype, 'execution').get.call(host.turnOrchestration);
        if (execution.runs.engine !== host.persistence._engine || execution.sourcePort.rpControl !== host.turnOrchestration.rpControl) throw new TypeError('Original execution required');
        Object.assign(this, { host, execution });
    }

    async #preflight(handle, tx, capture) {
        const { runs, budgetPort } = this.execution;
        const authorize = () => NativeNarratorOrchestrationAuthority.prototype.authorizeRpOutputCompletion.call(this.host.turnOrchestration, { handle, tx, capture });
        const first = await authorize(), root = await runs.get(handle, first.runId);
        if (first.allowed !== true || first.rootStamp !== hash(root) || first.sourceBindingDigest !== root.sourceBinding.bindingDigest || root.outputClaims.length) fail('native_rp_output_denied');
        const planner = await readRpPlannerCompletion(tx, handle, root);
        const closure = await BudgetPort.prototype.observeEffectClosure.call(budgetPort, handle, {
            authorityRef: root.budgetAuthorityRef, effectIds: [first.modelEffectId, first.outputEffectId, ...(planner ? [planner.modelEffectId] : [])] }, { tx });
        const current = await authorize();
        if (!equal(current, first) || !equal(root, await runs.get(handle, first.runId))) fail('native_rp_output_stale');
        return { root, authority: current, closure };
    }

    async complete(handle, request) {
        fields(request, ['capture'], 'RP output completion');
        const { capture } = request, { runs, sourcePort } = this.execution;
        if (runs.engine.hasActiveTransaction(handle)) fail('native_rp_output_ambient_transaction');
        const identity = inspectNativeRpOutputIdentity(capture, { host: this.host, handle });
        if (identity.execution !== this.execution) fail('native_rp_output_denied');
        const withAuthority = SourcePort.prototype.consumptionBoundary.call(sourcePort, handle, identity.sourceBinding, { engine: runs.engine });
        let result;
        try {
            result = await runs.withSourceControl(handle, identity.runId, () => runs.engine.withTransaction(handle, async tx => {
                let checked;
                try { checked = await this.#preflight(handle, tx, capture); } catch (error) { if (DENIALS.has(error.code)) return { denied: true }; throw error; }
                if (!checked.closure.closed) return { denied: false, ...pending() };
                const { root: original, authority, closure } = checked;
                const saved = await runs.control(handle, controlCommandId('rp.output.complete', { runId: original.runId, outputKey: rpOutputKey(original) }), {
                    ...runGuard(original), operation: 'output.publish', detail: { outputKey: rpOutputKey(original) } }, async ({ tx, root, now }) => {
                    if (!equal(root, original) || root.cancelRequested || root.status !== 'running' || root.outputClaims.length
                        || root.pendingEffectRefs.length || root.pendingApprovalRefs.length || root.progress.steps >= root.limits.maxSteps || now >= root.progress.deadlineAt)
                        fail('native_rp_output_stale');
                    const published = await readRpNarrationResult(tx, handle, root), record = await readAttempt(tx, handle, root, authority.outputAttemptId);
                    const output = record.doc;
                    if (!published || output.status !== 'running' || !equal(output.inputRefs, [authority.resultRef])
                        || output.effectiveGrantDigest !== authority.grantDigest || !equal(output.effectRefs, [authority.outputEffectId])) fail('native_rp_output_denied');
                    const claimId = rpOutputClaimId(root), claimRef = { runId: root.runId, claimId }, domainRef = rpOutputDomainRef(root);
                    const claim = { schemaVersion: 1, claimId, runId: root.runId, nodeAttemptId: output.attemptId, outputKey: rpOutputKey(root),
                        sourceBindingDigest: root.sourceBinding.bindingDigest, resultRef: authority.resultRef, consumerRef: rpOutputConsumer(root),
                        operationRef: { kind: 'native_rp_output', ...domainRef }, status: 'committed', domainReceiptRef: domainRef };
                    const closed = { schemaVersion: 1, receiptKind: 'rp_output_costs_closed', receiptId: rpOutputClosureId(root.runId), runId: root.runId,
                        epoch: root.epoch, authorityRef: closure.authorityRef, effectIds: closure.effectIds, budgetAttemptRefs: closure.budgetAttemptRefs,
                        snapshotDigest: closure.snapshotDigest, decisionSeq: root.eventSeq + 1, createdAt: now };
                    const edge = root.graph.edges.find(item => item.from.nodeId === published.producer.nodeId && item.to.nodeId === output.nodeId);
                    if (!edge) fail('native_rp_output_denied');
                    const traversalId = 'oreceipt_' + hash({ runId: root.runId, bindings: [{ edgeId: edge.edgeId, producerAttemptId: published.producer.attemptId }], reservedAttemptId: null }).slice(0, 32);
                    const hostReceiptId = 'oreceipt_' + hash({ effectId: authority.outputEffectId, observationId: 'rp.output:' + authority.outputEffectId }).slice(0, 32);
                    const ref = receiptId => ({ runId: root.runId, receiptId });
                    const receipt = { schemaVersion: 1, receiptKind: 'rp_output', receiptId: rpOutputReceiptId(root.runId), runId: root.runId, epoch: root.epoch,
                        graphRevision: root.graphRevision, claimRef, claimIntegrity: hash(claim), publicationReceiptRef: ref(published.receipt.receiptId),
                        producerReceiptRef: ref(published.settlement.receiptId), traversalReceiptRef: ref(traversalId), outputAttemptReceiptRef: ref(attemptReceiptId(root.runId, output.attemptId)),
                        outputEffectId: authority.outputEffectId, outputEffectReceiptRef: ref(hostReceiptId), domainReceiptIntegrity: hash(authority.domainReceipt),
                        budgetClosureReceiptRef: ref(closed.receiptId), decisionSeq: root.eventSeq + 1, createdAt: now };
                    await putImmutable(tx, controlRecordKey(handle, root.runId, 'output', claimId), claim);
                    await putImmutable(tx, controlRecordKey(handle, root.runId, 'receipt', closed.receiptId), closed);
                    await putImmutable(tx, controlRecordKey(handle, root.runId, 'receipt', receipt.receiptId), receipt);
                    await writeAttemptSettlement({ tx, handle, root, record, outcome: 'completed', resultRefs: [authority.resultRef],
                        effectReceiptRefs: [hostReceiptId], reasonCode: 'rp_output_committed', now });
                    root.outputClaims.push(claimRef); root.status = 'completed'; root.progress.steps++;
                    return { root, eventType: 'rp_output_completed', reasonCode: 'rp_output_committed',
                        outcome: { runStatus: 'completed', outputClaimRef: claimRef, outputReceiptRef: ref(receipt.receiptId) } };
                });
                return { denied: false, ...saved.outcome };
            }), { withAuthority });
        } catch (error) {
            if (error.code !== 'storage_commit_unknown') throw error;
            const observed = await runs.engine.withTransaction(handle, async tx => readRpOutput(tx, handle, await runs.get(handle, identity.runId)));
            if (!observed) throw error;
            return immutable({ runStatus: 'completed', outputClaimRef: observed.receipt.claimRef,
                outputReceiptRef: { runId: identity.runId, receiptId: observed.receipt.receiptId } });
        }
        if (result.denied) fail('native_rp_output_stale');
        const { denied: _denied, ...output } = result;
        return immutable(output);
    }
}
