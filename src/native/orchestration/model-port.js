import { fields } from '../../../public/shared/native-values.js';
import { normalizeTaskGenerationResult } from '../../../public/shared/native-task-contract.js';
import { inspectNativeRpGenerationIdentity, inspectNativeRpDelegationIdentity } from './native-rp-generation.js';
import { inspectNativeBackgroundGenerationIdentity } from './native-background-generation.js';
import { NativeGenerationHost } from '../adapters/generation-host.js';
import { immutable, checkCancellation } from '../model-prompt-runtime/execution-utils.js';
import { compiledSendIdentity } from '../model-prompt-runtime/compiled-binding.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { BudgetPort, sendAttemptId } from './budget-port.js';
import { EffectController } from './effect-controller.js';
import { readEffect } from './effect-contracts.js';
import { checkedRecord } from './plan-repository.js';
import { controlRecordKey, runGuard, readAttempt } from './controller-common.js';
import { RunRepository, assertChildRunCurrent } from './run-repository.js';
import { resolveNativeNarratorScope } from './native-turn-orchestration.js';
import { assertNativeTurnPermit } from './native-turn-permit.js';
import { SourcePort } from './source-port.js';
import { inspectNativeProjectGenerationIdentity } from './native-project-generation-authority.js';
import { modelCompletionBindingDigest as digest, modelTerminalObservationId, readModelTerminalReceipt } from './model-terminal-contracts.js';
export { readModelTerminalFact, readModelTerminalReceipt, readModelFailureReceipt } from './model-terminal-contracts.js';

const fail = code => { throw Object.assign(new TypeError(code), { code }); };
const key = (handle, intent) => hash({ handle, runId: intent.runId, effectId: intent.effectId });
const resultPayload = (response, outputType) => outputType === 'text' ? response.text : { text: response.text,
    toolCalls: (response.toolCalls ?? []).map(({ id, name, args }) => ({ id, name, args })) };
const CONSUME_DENIALS = new Set(['native_orchestration_source_stale', 'native_orchestration_binding_changed',
    'native_orchestration_parent_stale',
    'native_orchestration_turn_selection_stale', 'native_orchestration_turn_grant_denied', 'native_orchestration_turn_route_mismatch',
    'native_orchestration_project_selection_stale', 'native_orchestration_project_grant_denied', 'native_orchestration_project_route_mismatch',
    'native_orchestration_context_source_stale', 'native_orchestration_context_denied', 'native_orchestration_context_audience_denied',
    'native_orchestration_memory_source_stale',
    'native_orchestration_context_retrieval_denied', 'native_orchestration_context_retrieval_unresolved',
    'native_orchestration_background_source_stale', 'native_orchestration_background_grant_denied',
    'native_run_restore_review_required', 'native_run_terminal', 'native_run_dead', 'native_story_not_started', 'native_run_rewind_denied']);

/** Original immutable Model completion facts; this historical read grants no send or consumption. */
export async function readModelCompletionReceipt(handle, tx, root, intent) {
    if (root.ownerRef.handle !== handle || intent.status !== 'confirmed' || intent.capability !== 'generation.send') return null;
    const observationId = 'model.completed:' + intent.effectId;
    const receiptId = 'oreceipt_' + hash({ effectId: intent.effectId, observationId }).slice(0, 32);
    const receipt = (await checkedRecord(tx, controlRecordKey(handle, root.runId, 'receipt', receiptId)))?.doc;
    if (!receipt || receipt.schemaVersion !== 1 || receipt.receiptId !== receiptId || receipt.runId !== root.runId || receipt.effectId !== intent.effectId
        || receipt.observationId !== observationId || receipt.observedEpoch !== intent.epoch || receipt.outcome !== intent.status
        || receipt.reasonCode !== 'generation_response_validated' || receipt.dispatchEvidence?.kind !== 'original_port_observation'
        || receipt.dispatchEvidence.reference?.protocol !== 'generation'
        || receipt.dispatchEvidence.reference.completionBindingDigest !== digest(intent)) return null;
    const { schemaVersion: _schema, runId: _run, effectId: _effect, receiptId: _receipt, observedAt: _time, ...observation } = receipt;
    return { outcome: receipt.outcome, receiptRef: { runId: root.runId, receiptId }, observation };
}

/** Original sealed model consumer; hashes are facts, never another send grant. */
export class ModelPort {
    #active = new Map();
    #responses = new WeakMap();
    #resultCompletions = new WeakMap();
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
        if (pending.terminalError) return this.#terminalObservation({ handle, tx, root, intent, pending });
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
        let taskResultHash = null;
        if (pending.backgroundSchema) {
            try { taskResultHash = hash(normalizeTaskGenerationResult(generated.response, pending.backgroundSchema)); } catch (error) {
                if (!(error instanceof TypeError || error instanceof SyntaxError)) throw error;
            }
        }
        return { observationId: 'model.completed:' + intent.effectId, observedEpoch: intent.epoch, outcome: 'confirmed',
            dispatchEvidence: { kind: 'original_port_observation', reference: { protocol: 'generation', completionBindingDigest: binding,
                responseHash, finalRequestHash, attempts, resultOutputType: pending.project ? 'json' : 'text', resultPayloadHash: hash(resultPayload(generated.response, pending.project ? 'json' : 'text')),
                ...(pending.backgroundSchema ? { taskResultHash } : {}) } }, remoteOperationRef: null, domainReceiptRef: null,
            budgetObservationRef: { authorityRef: root.budgetAuthorityRef, attempts: attempts.map(({ budgetAttemptRef, status, usageHash }) => ({ budgetAttemptRef, status, usageHash })) },
            resultRefs: [], sourceRefs: [root.sourceBinding.sourceRef], reasonCode: 'generation_response_validated' };
    }

    async #terminalObservation({ handle, tx, root, intent, pending }) {
        const facts = NativeGenerationHost.prototype.inspectModelTerminalFacts.call(this.host, pending.terminalError, handle);
        if (!facts || facts !== pending.terminalFacts || pending.binding !== digest(intent) || root.ownerRef.handle !== handle
            || intent.capability !== 'generation.send' || intent.risk !== 'R1' || intent.requiresApproval || intent.approvalRef !== null
            || !pending.sends.length || facts.attempts.length !== pending.sends.length
            || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest) fail('native_orchestration_model_completion_proof_invalid');
        const attempts = [];
        for (const [ordinal, send] of pending.sends.entries()) {
            const fact = facts.attempts[ordinal], ref = send.budgetAttemptRef, expectedSend = compiledSendIdentity(send);
            if (ref.effectId !== intent.effectId || ref.providerSendOrdinal !== ordinal || ref.attemptId !== sendAttemptId(intent.effectId, ordinal)
                || hash(ref) !== hash(fact.budgetAttemptRef) || ordinal === 0 && hash(ref) !== hash(intent.budgetAttemptRef)
                || hash(expectedSend) !== hash(Object.fromEntries(['requestId', 'targetFingerprint', 'inputFingerprint'].map(field => [field, fact[field]])))
                || fact.requestId !== facts.requestId || fact.requestSnapshotHash !== hash(send.snapshot)
                || fact.compiledBindingFingerprint !== send.compiledBinding.fingerprint
                || hash(send.compiledBinding) !== hash(send.snapshot.diagnostics.compiledBinding)) fail('native_orchestration_model_send_invalid');
            const row = await this.budgetPort.observeAttempt(handle, ref);
            if (row.status !== fact.status || hash(row.usage) !== fact.usageHash) fail('native_orchestration_model_budget_observation_invalid');
            await this.budgetPort.verifyBudgetAttempt({ handle, tx, root, intent, budgetAttemptRef: ref, expectedSend });
            attempts.push(fact);
        }
        const rejected = facts.kind === 'rejected';
        return { observationId: modelTerminalObservationId(intent.effectId, facts.kind), observedEpoch: intent.epoch,
            outcome: rejected ? 'failed' : 'confirmed', dispatchEvidence: { kind: 'original_port_observation', reference: {
                protocol: 'generation_terminal', kind: facts.kind, completionBindingDigest: pending.binding,
                responseHash: facts.responseHash, finalRequestHash: facts.finalRequestHash, attempts } },
            remoteOperationRef: null, domainReceiptRef: null,
            budgetObservationRef: { authorityRef: root.budgetAuthorityRef, attempts: attempts.map(({ budgetAttemptRef, status, usageHash }) => ({ budgetAttemptRef, status, usageHash })) },
            resultRefs: [], sourceRefs: [root.sourceBinding.sourceRef], reasonCode: rejected ? 'generation_provider_rejected' : 'generation_response_not_consumed' };
    }

    async #saved(handle, tx, root, intent) {
        return readModelCompletionReceipt(handle, tx, root, intent);
    }

    async generate(handle, scope, { signal } = {}) {
        // No raw prompt, audience, callback response or approval Boolean can
        // substitute for the capability minted at an original domain model point.
        const principal = await resolveNativeNarratorScope(scope, this.host, handle);
        const { runId, effectId, request, options, revalidateConsume, logicalInputRef, logicalInputHash, nativeTurnPermit, nativeProjectCapture, nativeRpCapture, nativeRpDelegationCapture, nativeBackgroundCapture } = principal;
        const project = logicalInputRef.kind === 'native_project_intent';
        const rp = logicalInputRef.kind === 'native_rp_intent';
        const delegated = logicalInputRef.kind === 'native_rp_delegated_intent';
        const background = logicalInputRef.kind === 'native_background_intent';
        if (delegated ? logicalInputRef.role !== 'narrator' || request.role !== 'narrator' || request.requestId !== logicalInputRef.requestId
            || logicalInputRef.childRunId !== runId || nativeTurnPermit !== undefined || nativeProjectCapture !== undefined
            || nativeRpCapture !== undefined || nativeBackgroundCapture !== undefined
            : nativeRpDelegationCapture !== undefined || (background ? request.role !== logicalInputRef.role || request.requestId !== logicalInputRef.invocationId
            || nativeTurnPermit !== undefined || nativeProjectCapture !== undefined || nativeRpCapture !== undefined
                : rp ? logicalInputRef.role !== 'narrator' || request.role !== 'narrator' || request.requestId !== logicalInputRef.requestId
            || nativeTurnPermit !== undefined || nativeProjectCapture !== undefined
                    : project ? logicalInputRef.role !== 'studio' || request.role !== 'studio' || request.requestId !== logicalInputRef.requestId
            || request.projectAttemptId !== logicalInputRef.projectAttemptId || nativeTurnPermit !== undefined
                        : !['narrator', 'intent_resolver'].includes(logicalInputRef.role) || request.role !== logicalInputRef.role
            || typeof logicalInputRef.invocationId !== 'string' || !logicalInputRef.invocationId
            || request.requestId !== (logicalInputRef.role === 'narrator' ? logicalInputRef.invocationId : logicalInputRef.invocationId + ':intent')))
            fail('native_orchestration_model_scope_invalid');
        const permitExpected = { host: this.host, handle, sessionId: request.sessionId,
            invocationId: logicalInputRef.invocationId, requestHash: logicalInputRef.requestHash };
        const assertPermit = delegated ? () => {
            const identity = inspectNativeRpDelegationIdentity(nativeRpDelegationCapture, { host: this.host, handle });
            if (identity.childRunId !== runId || identity.parentRunId !== logicalInputRef.parentRunId
                || identity.parentAttemptId !== logicalInputRef.parentAttemptId || hash(identity.request) !== hash(request)
                || hash(identity.sourceBinding.sourceRef) !== hash(logicalInputRef.sourceRef)) fail('native_orchestration_model_scope_invalid');
            return identity;
        } : background ? () => {
            const identity = inspectNativeBackgroundGenerationIdentity(nativeBackgroundCapture, { host: this.host, handle });
            if (hash(identity.request) !== hash(request) || identity.input.invocationId !== logicalInputRef.invocationId
                || identity.input.taskId !== logicalInputRef.taskId) fail('native_orchestration_model_scope_invalid');
            return identity;
        } : rp ? () => {
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
        const pending = { binding: digest(intent), sends: [], generated: null, observation: null, project,
            backgroundSchema: background ? assertPermit().taskPlan.variant.outputSchema : null };
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
            // Keep the original domain lock before the Engine transaction:
            // observing a Session bank also takes its RunControl lock, while
            // a sibling may be settling that same bank. This orders paid-fact
            // observation without treating the lock as a fresh Source grant.
            const current = await this.runs.withSourceControl(handle, runId, () => this.runs.engine.withTransaction(handle, async tx => {
                const root = await this.runs.get(handle, runId), intent = (await readEffect(tx, handle, root, effectId)).doc;
                return { root, observation: await this.#observation({ handle, tx, root, intent, pending }) };
            }), { withAuthority });
            pending.observation = current.observation;
            try {
                await this.runs.withSourceControl(handle, runId, async () => {
                    await this.effects.observe(handle, { ...runGuard(await this.runs.get(handle, runId)), effectId, observation: current.observation });
                }, { withAuthority });
            } catch (error) {
                if (error.code !== 'storage_commit_unknown') throw error;
                const saved = await this.observe(handle, { runId, effectId });
                if (!saved.observation || hash(saved.observation) !== hash(current.observation)) throw error;
            }
            let completion;
            const result = await this.runs.withConsumption(handle, runId, async ({ tx, root, fence, deny }) => {
                assertPermit();
                const intent = (await readEffect(tx, handle, root, effectId)).doc;
                if (root.cancelRequested || root.epoch !== intent.epoch || root.hostBootId !== fence.hostBootId || root.hostGeneration !== fence.generation
                    || pending.binding !== digest(intent)) fail('native_orchestration_model_consume_denied');
                await assertChildRunCurrent(tx, handle, root);
                const saved = await this.#saved(handle, tx, root, intent);
                if (!saved || hash(saved.observation) !== hash(pending.observation)) fail('native_orchestration_model_consume_denied');
                checkCancellation(signal);
                try {
                    await revalidateConsume({ tx });
                    await this.budgetPort.assertCurrent(handle, root.budgetAuthorityRef, { tx });
                    await revalidateConsume({ tx });
                } catch (error) {
                    if (CONSUME_DENIALS.has(error.code) || (rp || delegated) && ['native_generation_revision_conflict', 'native_rp_source_missing',
                        'native_rp_control_relocated', 'native_orchestration_return_stale', 'native_orchestration_consumption_stale',
                        'native_orchestration_result_consume_denied'].includes(error.code)) return deny();
                    throw error;
                }
                const finalIntent = (await readEffect(tx, handle, root, effectId)).doc;
                const finalSaved = await this.#saved(handle, tx, root, finalIntent);
                if (pending.binding !== digest(finalIntent) || !finalSaved || hash(finalSaved.observation) !== hash(pending.observation)) return deny();
                assertPermit();
                checkCancellation(signal);
                if (typeof generated.response.text === 'string' && (generated.response.toolCalls === undefined
                    || Array.isArray(generated.response.toolCalls) && (project ? generated.response.toolCalls.length <= 32 : generated.response.toolCalls.length === 0))) {
                    const outputType = project ? 'json' : 'text';
                    completion = immutable({ handle, hostBootId: root.hostBootId, hostGeneration: root.hostGeneration,
                        binding: pending.binding, observationHash: hash(pending.observation),
                        responseHash: hash(generated.response), snapshotHash: hash(generated.snapshot), providerRowsHash: hash(generated.routing.compute.attempts),
                        descriptor: { runId, effectId, producerAttemptId: finalIntent.nodeAttemptId, epoch: root.epoch,
                            sourceBinding: root.sourceBinding, receiptRef: finalSaved.receiptRef, payloadHash: hash(resultPayload(generated.response, outputType)), outputType } });
                }
                return { generated, receiptRef: saved.receiptRef };
            }, { withAuthority });
            // Only the actual successfully returned wrapper witnesses this completion.
            // A callback value rejected by withConsumption never gets branded.
            if (completion) this.#resultCompletions.set(result, completion);
            return result;
        } catch (error) {
            const facts = NativeGenerationHost.prototype.inspectModelTerminalFacts.call(this.host, error, handle);
            if (facts) {
                pending.terminalError = error; pending.terminalFacts = facts;
                const observation = await this.runs.withSourceControl(handle, runId, () => this.runs.engine.withTransaction(handle, async tx => {
                    const root = await this.runs.get(handle, runId), intent = (await readEffect(tx, handle, root, effectId)).doc;
                    return this.#terminalObservation({ handle, tx, root, intent, pending });
                }), { withAuthority });
                pending.observation = observation;
                try {
                    await this.runs.withSourceControl(handle, runId, async () => this.effects.observe(handle, {
                        ...runGuard(await this.runs.get(handle, runId)), effectId, observation }), { withAuthority });
                } catch (writeError) {
                    if (writeError.code !== 'storage_commit_unknown') throw writeError;
                    const saved = await this.observe(handle, { runId, effectId });
                    if (!saved.observation || hash(saved.observation) !== hash(observation)) throw writeError;
                }
            }
            throw error;
        } finally {
            if (pending.generated) this.#responses.delete(pending.generated);
            this.#active.delete(activeKey);
        }
    }

    #assertResultPayload(completion, result) {
        const descriptor = completion.descriptor, generated = result.generated;
        if (!generated || typeof generated.response?.text !== 'string' || hash(resultPayload(generated.response, descriptor.outputType)) !== descriptor.payloadHash
            || hash(generated.response) !== completion.responseHash || hash(generated.snapshot) !== completion.snapshotHash
            || hash(generated.routing?.compute?.attempts) !== completion.providerRowsHash || hash(result.receiptRef) !== hash(descriptor.receiptRef))
            fail('native_orchestration_model_result_payload_changed');
    }

    /** Completion facts only. A Result writer must separately authorize its recipient. */
    async inspectResultCompletion(handle, request) {
        fields(request, ['result', 'runId', 'effectId'], 'Model Result completion');
        const { result, runId, effectId } = request, completion = this.#resultCompletions.get(result);
        if (!completion || completion.handle !== handle || completion.descriptor.runId !== runId || completion.descriptor.effectId !== effectId)
            fail('native_orchestration_model_result_completion_required');
        const descriptor = completion.descriptor;
        this.#assertResultPayload(completion, result);
        return this.runs.engine.withTransaction(handle, async tx => {
            const root = await this.runs.get(handle, runId), rootStamp = hash(root);
            const fence = await this.runs.engine.nativeHostLifecycle.assertWriter(handle, tx);
            const { doc: intent } = await readEffect(tx, handle, root, effectId);
            const { doc: attempt } = await readAttempt(tx, handle, root, descriptor.producerAttemptId);
            if (root.ownerRef.handle !== handle || root.cancelRequested || root.status !== 'running' || root.epoch !== descriptor.epoch
                || root.hostBootId !== fence.hostBootId || root.hostGeneration !== fence.generation
                || root.hostBootId !== completion.hostBootId || root.hostGeneration !== completion.hostGeneration
                || intent.hostBootId !== root.hostBootId || intent.hostGeneration !== root.hostGeneration
                || hash(root.sourceBinding) !== hash(descriptor.sourceBinding) || intent.nodeAttemptId !== attempt.attemptId
                || attempt.status !== 'running' || attempt.epoch !== root.epoch || attempt.sourceBindingDigest !== root.sourceBinding.bindingDigest
                || attempt.effectiveGrantDigest !== intent.grantDigest || !attempt.effectRefs.includes(effectId)
                || intent.epoch !== root.epoch || intent.status !== 'confirmed' || completion.binding !== digest(intent))
                fail('native_orchestration_model_result_completion_stale');
            const saved = await this.#saved(handle, tx, root, intent);
            if (!saved || hash(saved.receiptRef) !== hash(descriptor.receiptRef) || hash(saved.observation) !== completion.observationHash
                || saved.observation.dispatchEvidence.reference.responseHash !== completion.responseHash
                || saved.observation.dispatchEvidence.reference.finalRequestHash !== completion.snapshotHash)
                fail('native_orchestration_model_result_receipt_changed');
            await SourcePort.prototype.revalidate.call(this.sourcePort, handle, root.sourceBinding, { tx, root });
            await BudgetPort.prototype.assertCurrent.call(this.budgetPort, handle, root.budgetAuthorityRef, { tx });
            for (const send of saved.observation.dispatchEvidence.reference.attempts) {
                const observed = await BudgetPort.prototype.verifyBudgetAttempt.call(this.budgetPort, { handle, tx, root, intent,
                    budgetAttemptRef: send.budgetAttemptRef, expectedSend: Object.fromEntries(['requestId', 'targetFingerprint', 'inputFingerprint'].map(field => [field, send[field]])) });
                // Original late settlement may advance charged/unknown facts;
                // it cannot turn a settled bill back into an unsettled one.
                if (send.status === 'settled' && observed.status !== 'settled' || send.status === 'unknown' && observed.status === 'charged')
                    fail('native_orchestration_model_result_budget_changed');
            }
            await SourcePort.prototype.revalidate.call(this.sourcePort, handle, root.sourceBinding, { tx, root });
            const finalFence = await this.runs.engine.nativeHostLifecycle.assertWriter(handle, tx);
            const currentRoot = await this.runs.get(handle, runId);
            if (hash(currentRoot) !== rootStamp || finalFence.hostBootId !== fence.hostBootId || finalFence.generation !== fence.generation)
                fail('native_orchestration_model_result_completion_stale');
            this.#assertResultPayload(completion, result);
            return immutable(descriptor);
        });
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
            return await this.#saved(handle, tx, root, intent) ?? await readModelTerminalReceipt(handle, tx, root, intent, this.budgetPort);
        });
        return saved ? immutable(saved) : { outcome: 'unknown', receiptRef: null, reason: 'native_orchestration_model_completion_unavailable' };
    }
}
