import { RpOutputCompletionController } from './rp-output-completion-controller.js';
import { performance } from 'node:perf_hooks';
import { ConflictError } from '../../storage/errors.js';
import { fields } from '../../../public/shared/native-values.js';
import { NativeGenerationHost } from '../adapters/generation-host.js';
import { NativeNarratorOrchestrationAuthority } from './native-turn-orchestration.js';
import { RpRunControl } from '../rp-run-control.js';
import { ChatRepo } from '../../storage/repositories/chat-repo.js';
import { inspectNativeRpOutputIdentity } from './native-rp-generation.js';
import { hashNativeDocument as hash, equalNativeDocuments as equal } from '../repositories/common.js';
import { immutable } from '../model-prompt-runtime/execution-utils.js';
import { localWorkAttemptId, BudgetPort } from './budget-port.js';
import { controlRecordKey, runGuard } from './controller-common.js';

import { SourcePort } from './source-port.js';

const fail = code => { throw new ConflictError(code); };

/** One original RP assistant append, under its original Host Effect and bank. */
export class RpOutputController {
    #prepared = new WeakMap();
    #observations = new Map();

    constructor({ host }) {
        if (!(host instanceof NativeGenerationHost) || !(host.turnOrchestration instanceof NativeNarratorOrchestrationAuthority)) throw new TypeError('Original Narrator Host required');
        const execution = Object.getOwnPropertyDescriptor(NativeNarratorOrchestrationAuthority.prototype, 'execution').get.call(host.turnOrchestration);
        if (execution.runs.engine !== host.persistence._engine || execution.sourcePort.rpControl !== host.turnOrchestration.rpControl) throw new TypeError('Original RP authorities required');
        Object.assign(this, { host, execution, control: host.turnOrchestration.rpControl });
    }

    /** Separately durable preparation; this never writes Chat. */
    async prepare(handle, request) {
        fields(request, ['capture'], 'RP Host output');
        const { capture } = request, { runs, effects, budgetPort } = this.execution;
        if (runs.engine.hasActiveTransaction(handle)) fail('native_rp_output_ambient_transaction');
        const identity = inspectNativeRpOutputIdentity(capture, { host: this.host, handle, rpControl: this.control });
        if (identity.execution !== this.execution || this.#prepared.has(capture)) fail('native_rp_output_replayed');
        const receipt = await RpRunControl.prototype.prepareNativeOutput.call(this.control, handle, request);
        const spec = await NativeNarratorOrchestrationAuthority.prototype.prepareRpOutputEffect.call(this.host.turnOrchestration, { handle, capture });
        await effects.prepare(handle, { ...runGuard(await runs.get(handle, identity.runId)), effectId: spec.effectId, nodeAttemptId: spec.attemptId,
            proposal: Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, spec.decision[key]])) });
        const root = await runs.get(handle, identity.runId), attemptId = localWorkAttemptId(spec.effectId, 0);
        const row = await BudgetPort.prototype.chargeLocalWork.call(budgetPort, handle, { authorityRef: root.budgetAuthorityRef, limits: spec.limits,
            effectId: spec.effectId, localWorkOrdinal: 0, attempt: { attemptId, requestId: spec.requestId, kind: 'rp_output', estimatedItems: 1,
                estimatedInputBytes: spec.payloadBytes + Buffer.byteLength(JSON.stringify(spec.decision.inputRef), 'utf8') + Buffer.byteLength(JSON.stringify(receipt), 'utf8'),
                targetFingerprint: hash(spec.decision.targetRef) } });
        if (!row || row.status !== 'charged') fail('native_rp_output_budget_required');
        const budgetAttemptRef = { kind: 'local_work', authorityRef: root.budgetAuthorityRef, effectId: spec.effectId,
            localWorkOrdinal: 0, attemptId, reservationId: null };
        await effects.ready(handle, { ...runGuard(await runs.get(handle, root.runId)), effectId: spec.effectId, budgetAttemptRef });
        const claim = await effects.claim(handle, { ...runGuard(await runs.get(handle, root.runId)), effectId: spec.effectId });
        if (!claim.claimed || !claim.dispatchToken) fail('native_rp_output_replayed');
        await NativeNarratorOrchestrationAuthority.prototype.registerRpOutputClaim.call(this.host.turnOrchestration, { handle, capture, dispatchToken: claim.dispatchToken });
        const prepared = { identity, receipt, spec, budgetAttemptRef, capture, started: performance.now(), cpu: process.cpuUsage(), dispatchToken: claim.dispatchToken };
        this.#prepared.set(capture, prepared);
        return prepared;
    }

    async complete(handle, request) {
        const prepared = await this.prepare(handle, request), { identity, receipt, spec, budgetAttemptRef, capture } = prepared;
        const { runs, budgetPort, effects } = this.execution;
        const domainRef = { controlId: identity.controlId, outputKey: receipt.outputKey, operationId: receipt.operationId };
        let committed, outcome = 'failed';
        try {
            try {
                const begun = await RpRunControl.prototype.beginNativeOutput.call(this.control, handle, { capture });
                if (begun.permit) await ChatRepo.prototype.commitNativeOutput.call(this.control._chatRepo, handle, { permit: begun.permit });
            } catch (error) {
                if (error.code !== 'storage_commit_unknown') throw error;
                // Only reconciliation follows an uncertain physical ACK. It
                // cannot obtain another permit or invoke the writer again.
            }
            try { committed = await RpRunControl.prototype.reconcileNativeOutput.call(this.control, handle, domainRef); } catch (error) {
                if (error.code !== 'storage_commit_unknown') throw error;
                const saved = await RpRunControl.prototype.status.call(this.control, handle, identity.controlId);
                const observed = saved.outputReceipts[receipt.outputKey];
                committed = { status: observed.status === 'committed' ? 'committed' : 'unknown', receipt: observed };
            }
            outcome = committed.status === 'committed' ? 'completed' : 'failed';
        } finally {
            const cpu = process.cpuUsage(prepared.cpu);
            await BudgetPort.prototype.settleLocalWork.call(budgetPort, handle, budgetAttemptRef.authorityRef, budgetAttemptRef.attemptId, {
                wallMs: performance.now() - prepared.started, cpuUserMicros: cpu.user, cpuSystemMicros: cpu.system, cpuScope: 'process', outcome });
        }
        const row = await BudgetPort.prototype.observeAttempt.call(budgetPort, handle, budgetAttemptRef);
        const observation = immutable({ observationId: 'rp.output:' + spec.effectId, observedEpoch: (await runs.get(handle, identity.runId)).epoch,
            outcome: committed.status === 'committed' ? 'confirmed' : 'unknown',
            dispatchEvidence: { kind: committed.status === 'committed' ? 'original_domain_receipt' : 'unknown_dispatch',
                reference: { domain: 'rp_chat', ...domainRef, receiptIntegrity: hash(committed.receipt) } },
            remoteOperationRef: null, domainReceiptRef: committed.status === 'committed' ? { domain: 'rp_chat', ...domainRef } : null,
            budgetObservationRef: { ...budgetAttemptRef, status: row.status, usageHash: hash(row.usage) },
            resultRefs: [], sourceRefs: [identity.sourceBinding.sourceRef], reasonCode: committed.status === 'committed' ? 'rp_output_committed' : 'rp_output_unknown' });
        this.#observations.set(spec.effectId, { prepared, observation, receipt: committed.receipt });
        let effectReceiptRef = null;
        try {
            const saved = await effects.observe(handle, { ...runGuard(await runs.get(handle, identity.runId)), effectId: spec.effectId, observation });
            effectReceiptRef = { runId: identity.runId, receiptId: saved.outcome.receiptId };
        } catch (error) {
            if (error.code !== 'storage_commit_unknown') throw error;
            const receiptId = 'oreceipt_' + hash({ effectId: spec.effectId, observationId: observation.observationId }).slice(0, 32);
            const saved = await runs.engine.withTransaction(handle, tx => tx.getResource(controlRecordKey(handle, identity.runId, 'receipt', receiptId)));
            if (saved && equal(saved.doc.dispatchEvidence, observation.dispatchEvidence)) effectReceiptRef = { runId: identity.runId, receiptId };
        }
        const completed = committed.status === 'committed' && effectReceiptRef
            ? await new RpOutputCompletionController({ host: this.host }).complete(handle, { capture })
            : { runStatus: 'pending_output', outputClaimRef: null, outputReceiptRef: null };
        return immutable({ status: committed.status, outputKey: receipt.outputKey, operationId: receipt.operationId,
            outputEffectId: spec.effectId, effectReceiptRef, domainReceiptRef: observation.domainReceiptRef, ...completed });
    }

    /** Original domain commit and original local-work observation; never caller JSON. */
    async verifyObservation({ handle, tx, root, intent, observation }) {
        const saved = this.#observations.get(intent.effectId);
        if (!saved || !equal(saved.observation, observation) || saved.prepared.identity.runId !== root.runId || intent.dispatchToken !== saved.prepared.dispatchToken
            || intent.capability !== 'chat.output' || intent.inputHash !== saved.prepared.spec.decision.inputHash
            || !equal(intent.budgetAttemptRef, saved.prepared.budgetAttemptRef)) fail('native_rp_output_observation_required');
        inspectNativeRpOutputIdentity(saved.prepared.capture, { handle, host: this.host, rpControl: this.control });
        const fence = await this.execution.runs.engine.nativeHostLifecycle.assertWriter(handle, tx);
        if (root.epoch !== observation.observedEpoch || root.hostBootId !== fence.hostBootId || root.hostGeneration !== fence.generation) fail('native_rp_output_stale');
        const control = await RpRunControl.prototype.status.call(this.control, handle, saved.prepared.identity.controlId, { tx });
        if (!equal(control.outputReceipts[saved.receipt.outputKey], saved.receipt)
            || observation.outcome === 'confirmed' && saved.receipt.status !== 'committed') fail('native_rp_output_observation_required');
        await BudgetPort.prototype.verifyBudgetAttempt.call(this.execution.budgetPort, { handle, tx, root, intent, budgetAttemptRef: saved.prepared.budgetAttemptRef });
        const row = await BudgetPort.prototype.observeAttempt.call(this.execution.budgetPort, handle, saved.prepared.budgetAttemptRef);
        if (row.status !== 'settled' || hash(row.usage) !== observation.budgetObservationRef.usageHash
            || observation.outcome === 'confirmed' && row.usage.outcome !== 'completed') fail('native_rp_output_budget_required');
        await SourcePort.prototype.revalidate.call(this.execution.sourcePort, handle, root.sourceBinding, { tx });
    }
}
