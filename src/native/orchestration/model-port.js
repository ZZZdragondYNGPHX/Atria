import { fields } from '../../../public/shared/native-values.js';
import { inspectNativeRpGenerationIdentity } from './native-rp-generation.js';
import { NativeGenerationHost } from '../adapters/generation-host.js';
import { immutable, checkCancellation } from '../model-prompt-runtime/execution-utils.js';
import { compiledSendIdentity } from '../model-prompt-runtime/compiled-binding.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { BudgetPort, sendAttemptId } from './budget-port.js';
import { EffectController } from './effect-controller.js';
import { readEffect, effectDecision } from './effect-contracts.js';
import { checkedRecord } from './plan-repository.js';
import { controlRecordKey, runGuard } from './controller-common.js';
import { RunRepository, assertChildRunCurrent } from './run-repository.js';
import { resolveNativeNarratorScope } from './native-turn-orchestration.js';
import { assertNativeTurnPermit } from './native-turn-permit.js';
import { SourcePort } from './source-port.js';
import { inspectNativeProjectGenerationIdentity } from './native-project-generation-authority.js';

const fail = code => { throw Object.assign(new TypeError(code), { code }); };
const digest = intent => hash({ runId: intent.runId, effectId: intent.effectId, epoch: intent.epoch,
    hostBootId: intent.hostBootId, hostGeneration: intent.hostGeneration,
    sourceBindingDigest: intent.sourceBindingDigest, decision: effectDecision(intent) });
const key = (handle, intent) => hash({ handle, runId: intent.runId, effectId: intent.effectId });
const CONSUME_DENIALS = new Set(['native_orchestration_source_stale', 'native_orchestration_binding_changed',
    'native_orchestration_turn_selection_stale', 'native_orchestration_turn_grant_denied', 'native_orchestration_turn_route_mismatch',
    'native_orchestration_project_selection_stale', 'native_orchestration_project_grant_denied', 'native_orchestration_project_route_mismatch',
    'native_orchestration_context_source_stale', 'native_orchestration_context_denied', 'native_orchestration_context_audience_denied',
    'native_run_restore_review_required', 'native_run_terminal', 'native_run_dead', 'native_story_not_started', 'native_run_rewind_denied']);

/** Original sealed model consumer; hashes are facts, never another send grant. */
export class ModelPort {
    #active = new Map();
    #responses = new WeakMap();
    #executeNative;

    constructor({ host, runs, effects, budgetPort, sourcePort }) {
        if (!(host instanceof NativeGenerationHost) || !(runs instanceof RunRepository) || !(effects instanceof EffectController) || !(budgetPort instanceof BudgetPort)
            || effects.runs !== runs || host.persistence._engine !== runs.engine || !(sourcePort instanceof SourcePort)
            || sourcePort.budgetPort !== budgetPort || sourcePort.sessionCore !== host.sessionCore || budgetPort.sessionCore !== host.sessionCore
            || sourcePort.sessionCore?._sessions?._engine !== runs.engine) throw new TypeError('ModelPort requires the original Host and execution authorities');
        this.#executeNative = NativeGenerationHost.prototype.execute;
        Object.assign(this, { host, runs, effects, budgetPort, sourcePort });
    }

    async #observation({ handle, tx, root, intent, pending }) {
        const { generated, sends, binding } = pending;
        if (this.#responses.get(generated) !== pending || binding !== digest(intent) || root.ownerRef.handle !== handle
            || intent.capability !== 'generation.send' || intent.risk !== 'R1' || intent.requiresApproval || intent.approvalRef !== null
            || !sends.length || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest) fail('native_orchestration_model_completion_proof_invalid');
        const reported = generated.routing?.compute?.attempts;
        if (!Array.isArray(reported) || reported.length !== sends.length
            || hash(generated.snapshot) !== hash(sends.at(-1).snapshot)
            || !generated.response || typeof generated.response.text !== 'string') fail('native_orchestration_model_response_invalid');
        const attempts = [];
        for (const [ordinal, send] of sends.entries()) {
            const ref = send.budgetAttemptRef, expectedSend = compiledSendIdentity(send);
            if (ref.kind !== undefined || ref.effectId !== intent.effectId || ref.providerSendOrdinal !== ordinal
                || ref.attemptId !== sendAttemptId(intent.effectId, ordinal)
                || hash(ref.authorityRef) !== hash(root.budgetAuthorityRef)
                || hash(send.compiledBinding) !== hash(send.snapshot.diagnostics.compiledBinding)
                || (ordinal === 0 && hash(ref) !== hash(intent.budgetAttemptRef))) fail('native_orchestration_model_send_invalid');
            const row = await this.budgetPort.observeAttempt(handle, ref);
            if (hash(row) !== hash(reported[ordinal]) || !['charged', 'unknown', 'settled'].includes(row.status))
                fail('native_orchestration_model_budget_observation_invalid');
            await this.budgetPort.verifyBudgetAttempt({ handle, tx, root, intent, budgetAttemptRef: ref, expectedSend });
            attempts.push({ budgetAttemptRef: ref, ...expectedSend, status: row.status, usageHash: hash(row.usage),
                compiledBindingFingerprint: send.compiledBinding.fingerprint, requestSnapshotHash: hash(send.snapshot) });
        }
        const responseHash = hash(generated.response), finalRequestHash = hash(generated.snapshot);
        return { observationId: 'model.completed:' + intent.effectId, observedEpoch: intent.epoch, outcome: 'confirmed',
            dispatchEvidence: { kind: 'original_port_observation', reference: { protocol: 'generation', completionBindingDigest: binding,
                responseHash, finalRequestHash, attempts } }, remoteOperationRef: null, domainReceiptRef: null,
            budgetObservationRef: { authorityRef: root.budgetAuthorityRef, attempts: attempts.map(({ budgetAttemptRef, status, usageHash }) => ({ budgetAttemptRef, status, usageHash })) },
            resultRefs: [], sourceRefs: [root.sourceBinding.sourceRef], reasonCode: 'generation_response_validated' };
    }

    async #saved(handle, tx, root, intent) {
        if (root.ownerRef.handle !== handle || intent.status !== 'confirmed' || intent.capability !== 'generation.send') return null;
        const observationId = 'model.completed:' + intent.effectId;
        const receiptId = 'oreceipt_' + hash({ effectId: intent.effectId, observationId }).slice(0, 32);
        const receipt = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId)))?.doc;
        if (!receipt || receipt.schemaVersion !== 1 || receipt.runId !== root.runId || receipt.effectId !== intent.effectId
            || receipt.observationId !== observationId || receipt.observedEpoch !== intent.epoch || receipt.outcome !== intent.status
            || receipt.reasonCode !== 'generation_response_validated' || receipt.dispatchEvidence?.kind !== 'original_port_observation'
            || receipt.dispatchEvidence.reference?.protocol !== 'generation'
            || receipt.dispatchEvidence.reference.completionBindingDigest !== digest(intent)) return null;
        const { schemaVersion: _schema, runId: _run, effectId: _effect, receiptId: _receipt, observedAt: _time, ...observation } = receipt;
        return { outcome: receipt.outcome, receiptRef: { runId: root.runId, receiptId }, observation };
    }

    async generate(handle, scope, { signal } = {}) {
        // No raw prompt, audience, callback response or approval Boolean can
        // substitute for the capability minted at an original domain model point.
        const principal = await resolveNativeNarratorScope(scope, this.host, handle);
        const { runId, effectId, request, options, revalidateConsume, logicalInputRef, logicalInputHash, nativeTurnPermit, nativeProjectCapture, nativeRpCapture } = principal;
        const project = logicalInputRef.kind === 'native_project_intent';
        const rp = logicalInputRef.kind === 'native_rp_intent';
        if (rp ? logicalInputRef.role !== 'narrator' || request.role !== 'narrator' || request.requestId !== logicalInputRef.requestId
            || nativeTurnPermit !== undefined || nativeProjectCapture !== undefined
            : project ? logicalInputRef.role !== 'studio' || request.role !== 'studio' || request.requestId !== logicalInputRef.requestId
            || request.projectAttemptId !== logicalInputRef.projectAttemptId || nativeTurnPermit !== undefined
                : !['narrator', 'intent_resolver'].includes(logicalInputRef.role) || request.role !== logicalInputRef.role
            || typeof logicalInputRef.invocationId !== 'string' || !logicalInputRef.invocationId
            || request.requestId !== (logicalInputRef.role === 'narrator' ? logicalInputRef.invocationId : logicalInputRef.invocationId + ':intent'))
            fail('native_orchestration_model_scope_invalid');
        const permitExpected = { host: this.host, handle, sessionId: request.sessionId,
            invocationId: logicalInputRef.invocationId, requestHash: logicalInputRef.requestHash };
        const assertPermit = rp ? () => {
            const identity = inspectNativeRpGenerationIdentity(nativeRpCapture, { host: this.host, handle });
            if (identity.request.requestId !== request.requestId || identity.sourceRequest.controlId !== logicalInputRef.sourceRef.controlId
                || identity.prefixDigest !== logicalInputRef.sourceRef.prefixDigest || hash(identity.request) !== hash(request))
                fail('native_orchestration_model_scope_invalid');
            return identity;
        } : project ? () => {
            const identity = inspectNativeProjectGenerationIdentity(nativeProjectCapture, { host: this.host, handle });
            if (identity.projectId !== request.projectId || identity.taskId !== request.taskId || identity.revision !== request.revision
                || identity.requestId !== request.requestId || identity.projectAttemptId !== request.projectAttemptId
                || identity.operationId !== logicalInputRef.operationId || hash(identity.request.routeRef) !== hash(request.routeRef))
                fail('native_orchestration_model_scope_invalid');
            return identity;
        } : () => assertNativeTurnPermit(nativeTurnPermit, permitExpected);
        const fixedSignal = assertPermit().signal;
        if (signal !== undefined && signal !== fixedSignal) fail('native_orchestration_model_signal_denied');
        signal = fixedSignal;
        if (typeof revalidateConsume !== 'function' || !options?.orchestrationSend?.context
            || typeof options.orchestrationSend.beforeSend !== 'function' || !options.scheduled)
            fail('native_orchestration_model_scope_invalid');
        const root = await this.runs.get(handle, runId);
        const withAuthority = SourcePort.prototype.consumptionBoundary.call(this.sourcePort, handle, root.sourceBinding, { engine: this.runs.engine });
        permitExpected.anchor = { branchId: root.sourceBinding.sourceRef.branchId, revisionId: root.sourceBinding.sourceRef.revisionId };
        assertPermit();
        const intent = await this.runs.engine.withTransaction(handle, async tx => (await readEffect(tx, handle, root, effectId)).doc);
        if (root.ownerRef.handle !== handle || intent.status !== 'prepared' || root.cancelRequested
            || intent.epoch !== root.epoch || intent.capability !== 'generation.send'
            || intent.risk !== 'R1' || intent.requiresApproval || intent.approvalRef !== null
            || hash(logicalInputRef) !== logicalInputHash || logicalInputHash !== intent.inputHash
            || hash(logicalInputRef) !== hash(intent.inputRef)) fail('native_orchestration_model_scope_invalid');
        const activeKey = key(handle, intent);
        if (this.#active.size >= 64 || this.#active.has(activeKey)) fail('native_orchestration_model_busy');
        const pending = { binding: digest(intent), sends: [], generated: null, observation: null };
        this.#active.set(activeKey, pending);
        try {
            const originalSend = options.orchestrationSend;
            const orchestrationSend = { ...originalSend, beforeSend: async evidence => {
                assertPermit();
                await originalSend.beforeSend(evidence);
                assertPermit();
                // Capture only after original scope, Context, claim and exact
                // original bank admission have all permitted this actual send.
                compiledSendIdentity(evidence);
                pending.sends.push(evidence);
            } };
            assertPermit();
            checkCancellation(signal);
            // Provisional stream text is withheld. Only the original sealed
            // consumer receives the completed, finally revalidated response.
            const generated = await this.#executeNative.call(this.host, handle, request, signal, undefined, { ...options, orchestrationSend });
            pending.generated = generated;
            this.#responses.set(generated, pending);
            const current = await this.runs.engine.withTransaction(handle, async tx => {
                const root = await this.runs.get(handle, runId), intent = (await readEffect(tx, handle, root, effectId)).doc;
                return { root, observation: await this.#observation({ handle, tx, root, intent, pending }) };
            });
            pending.observation = current.observation;
            try { await this.effects.observe(handle, { ...runGuard(current.root), effectId, observation: current.observation }); } catch (error) {
                if (error.code !== 'storage_commit_unknown') throw error;
                const saved = await this.observe(handle, { runId, effectId });
                if (!saved.observation || hash(saved.observation) !== hash(current.observation)) throw error;
            }
            return await this.runs.withConsumption(handle, runId, async ({ tx, root, fence, deny }) => {
                assertPermit();
                const intent = (await readEffect(tx, handle, root, effectId)).doc;
                if (root.cancelRequested || root.epoch !== intent.epoch || root.hostBootId !== fence.hostBootId || root.hostGeneration !== fence.generation
                    || pending.binding !== digest(intent)) fail('native_orchestration_model_consume_denied');
                await assertChildRunCurrent(tx, handle, root);
                const saved = await this.#saved(handle, tx, root, intent);
                if (!saved || hash(saved.observation) !== hash(pending.observation)) fail('native_orchestration_model_consume_denied');
                checkCancellation(signal);
                await revalidateConsume({ tx });
                await this.budgetPort.assertCurrent(handle, root.budgetAuthorityRef, { tx });
                try { await revalidateConsume({ tx }); } catch (error) {
                    if (CONSUME_DENIALS.has(error.code)) return deny();
                    throw error;
                }
                const finalIntent = (await readEffect(tx, handle, root, effectId)).doc;
                const finalSaved = await this.#saved(handle, tx, root, finalIntent);
                if (pending.binding !== digest(finalIntent) || !finalSaved || hash(finalSaved.observation) !== hash(pending.observation)) return deny();
                assertPermit();
                checkCancellation(signal);
                return { generated, receiptRef: saved.receiptRef };
            }, { withAuthority });
        } finally {
            if (pending.generated) this.#responses.delete(pending.generated);
            this.#active.delete(activeKey);
        }
    }

    async verifyObservation({ handle, tx, root, intent, observation }) {
        const persisted = (await readEffect(tx, handle, root, intent.effectId)).doc;
        const pending = this.#active.get(key(handle, intent));
        if (hash(persisted) !== hash(intent) || !pending || hash(pending.observation) !== hash(observation))
            fail('native_orchestration_model_completion_proof_required');
        const expected = await this.#observation({ handle, tx, root, intent, pending });
        if (hash(expected) !== hash(observation)) fail('native_orchestration_model_observation_invalid');
        return expected;
    }

    async observe(handle, request) {
        fields(request, ['runId', 'effectId'], 'Model Effect reference');
        const saved = await this.runs.engine.withTransaction(handle, async tx => {
            const root = await this.runs.get(handle, request.runId), intent = (await readEffect(tx, handle, root, request.effectId)).doc;
            return this.#saved(handle, tx, root, intent);
        });
        return saved ? immutable(saved) : { outcome: 'unknown', receiptRef: null, reason: 'native_orchestration_model_completion_unavailable' };
    }
}
