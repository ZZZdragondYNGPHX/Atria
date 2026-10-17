import { ConflictError } from '../../storage/errors.js';
import { fields } from '../../../public/shared/native-values.js';
import { NativeGenerationHost } from '../adapters/generation-host.js';
import { NativeNarratorOrchestrationAuthority } from './native-turn-orchestration.js';
import { ModelPort } from './model-port.js';
import { SourcePort } from './source-port.js';
import { RunRepository, assertChildRunCurrent } from './run-repository.js';
import { inspectNativeRpDelegationIdentity, inspectNativeRpDelegation } from './native-rp-generation.js';
import { hashNativeDocument as hash, putImmutable } from '../repositories/common.js';
import { immutable } from '../model-prompt-runtime/execution-utils.js';
import { controlCommandId, controlRecordKey, readAttempt, runGuard } from './controller-common.js';
import { writeAttemptSettlement } from './attempt-settlement.js';
import { readEffect } from './effect-contracts.js';
import { assertResultRecord, resultDependencyDigest } from './result-contracts.js';
import { modelResultId, resultPublicationReceiptId, assertResultPublicationReceipt, readResultPublication } from './result-publication-contracts.js';
import { assertDelegationDecision } from './delegate-controller.js';
import { graphNodeResult, readGraphNodeResult, graphResultPublicationId } from './graph-result-contracts.js';
import { readContextRetrievalCompletions } from './context-retrieval-contracts.js';
import { readTaskGraphRevision } from './graph-revision-contracts.js';

const fail = code => { throw new ConflictError(code); };
const equal = (a, b) => hash(a) === hash(b);
// Only legitimate authority withdrawal is committed as a denied preflight.
// Unknown storage, corruption, foreign scopes and TypeErrors retain their errors.
const DENIALS = new Set(['native_orchestration_memory_source_stale', 'native_orchestration_source_stale', 'native_orchestration_parent_stale',
    // This fixed RP producer's original context rejects a changed user anchor.
    'native_generation_revision_conflict', 'native_rp_source_missing', 'native_rp_control_relocated',
    'native_orchestration_model_result_completion_stale', 'native_orchestration_result_publication_stale']);

/** Fixed original RP child producer. It publishes no domain output or recipient grant. */
export class ResultController {
    constructor({ host, modelPort }) {
        if (!(host instanceof NativeGenerationHost) || !(host.turnOrchestration instanceof NativeNarratorOrchestrationAuthority)
            || !(modelPort instanceof ModelPort) || modelPort.host !== host) throw new TypeError('Original Model Host required');
        const execution = Object.getOwnPropertyDescriptor(NativeNarratorOrchestrationAuthority.prototype, 'execution').get.call(host.turnOrchestration);
        if (!(execution.runs instanceof RunRepository) || execution.runs !== modelPort.runs || execution.effects !== modelPort.effects
            || execution.budgetPort !== modelPort.budgetPort || execution.sourcePort !== modelPort.sourcePort
            || execution.runs.engine !== host.persistence._engine || execution.sourcePort.rpControl !== host.turnOrchestration.rpControl)
            throw new TypeError('Original shared execution authorities required');
        Object.assign(this, { host, modelPort, execution });
    }

    async #preflight(handle, tx, capture, result, effectId) {
        const { runs, sourcePort, delegates } = this.execution;
        const before = await inspectNativeRpDelegation(capture, { host: this.host, handle, tx });
        const rootStamp = hash(before.root), parentStamp = hash(before.parentRoot);
        if (before.root.parentRef?.parentRunId !== before.parentRunId || before.parentRoot.parentRef !== null) fail('native_orchestration_result_publication_stale');
        const childPlan = await this.host.turnOrchestration.plans.getRevision(handle, before.childPlanRef);
        const scope = { handle, tx, parent: before.parentRoot, parentAttempt: before.parentAttempt, childPlan,
            inputRefs: before.inputRefs, effectiveGrantDigest: before.grantDigest, budgetCeiling: before.root.parentRef.budgetCeiling, phase: 'confirm_budget' };
        assertDelegationDecision(await delegates.authorizeDelegation(scope), scope, before.grantDigest);
        const proof = await ModelPort.prototype.inspectResultCompletion.call(this.modelPort, handle, { result, runId: before.childRunId, effectId });
        if (proof.runId !== before.childRunId || proof.epoch !== before.childEpoch || proof.outputType !== 'text'
            || !equal(proof.sourceBinding, before.sourceBinding)) fail('native_orchestration_result_publication_stale');
        await SourcePort.prototype.revalidate.call(sourcePort, handle, before.sourceBinding, { tx });
        const current = await inspectNativeRpDelegation(capture, { host: this.host, handle, tx });
        const fence = await runs.engine.nativeHostLifecycle.assertWriter(handle, tx);
        await assertChildRunCurrent(tx, handle, current.root);
        const finalRoot = await runs.get(handle, before.childRunId), finalParent = await runs.get(handle, before.parentRunId);
        if (rootStamp !== hash(finalRoot) || parentStamp !== hash(finalParent)
            || fence.hostBootId !== finalRoot.hostBootId || fence.generation !== finalRoot.hostGeneration) fail('native_orchestration_result_publication_stale');
        const payload = result.generated?.response?.text;
        if (typeof payload !== 'string' || hash(payload) !== proof.payloadHash) fail('native_orchestration_model_result_payload_changed');
        return { identity: current, root: finalRoot, proof, payload };
    }

    async publishModelResult(handle, request) {
        fields(request, ['capture', 'result', 'effectId'], 'Model Result publication');
        const { capture, result, effectId } = request, { runs, sourcePort } = this.execution;
        const identity = inspectNativeRpDelegationIdentity(capture, { host: this.host, handle });
        const runId = identity.childRunId, resultId = modelResultId(runId, effectId);
        const withAuthority = SourcePort.prototype.consumptionBoundary.call(sourcePort, handle, identity.sourceBinding, { engine: runs.engine });
        let envelope;
        try {
            envelope = await RunRepository.prototype.withSourceControl.call(runs, handle, runId,
                () => runs.engine.withTransaction(handle, async tx => {
                    let checked;
                    try { checked = await this.#preflight(handle, tx, capture, result, effectId); } catch (error) {
                        if (DENIALS.has(error.code)) return { denied: true, reasonCode: error.code };
                        throw error;
                    }
                    // No catch-and-commit after this boundary. All Result,
                    // settlement, Run, ancestor, event and command writes share
                    // this original Engine transaction and its rollback.
                    const { root, proof, payload, identity: current } = checked;
                    const saved = await runs.control(handle, controlCommandId('result.publish', { runId, effectId }), {
                        ...runGuard(root), operation: 'result.publish', detail: { effectId, resultId } }, async ({ tx, root, now }) => {
                        if (hash(root) !== hash(checked.root) || root.cancelRequested || root.status !== 'running') fail('native_orchestration_result_publication_stale');
                        const record = await readAttempt(tx, handle, root, proof.producerAttemptId), intent = (await readEffect(tx, handle, root, effectId)).doc;
                        if (root.resultRefs.length || root.outputClaims.length || record.doc.status !== 'running' || record.doc.epoch !== root.epoch || !equal(record.doc.effectRefs, [effectId])
                            || record.doc.resultRefs.length || intent.status !== 'confirmed' || root.pendingEffectRefs.includes(effectId)
                            || intent.nodeAttemptId !== record.doc.attemptId || intent.grantDigest !== current.grantDigest
                            || root.progress.steps >= root.limits.maxSteps || now >= root.progress.deadlineAt) fail('native_orchestration_result_not_publishable');
                        const resultRef = { runId, resultId }, audience = { kind: 'parent_attempt', parentRunId: current.parentRunId,
                            parentAttemptId: current.parentAttemptId, parentEpoch: current.parentEpoch, sourceBindingDigest: root.sourceBinding.bindingDigest,
                            grantDigest: current.parentGrantDigest, taskPurpose: current.parentTaskPurpose };
                        const resultEnvelope = { schemaVersion: 1, runId, resultId, producerAttemptId: record.doc.attemptId, outputType: 'text',
                            outputSchemaRef: { kind: 'native_builtin', schema: 'text' },
                            payloadRef: { kind: 'orchestration_result_payload', runId, resultId, integrity: proof.payloadHash },
                            sourceRefs: [{ kind: 'run_source', runId, epoch: root.epoch, sourceBindingDigest: root.sourceBinding.bindingDigest,
                                sourceAuthority: 'rp_chat', sourceRef: root.sourceBinding.sourceRef },
                            { kind: 'effect_receipt', runId, effectId, receiptId: proof.receiptRef.receiptId, observedEpoch: root.epoch }],
                            dependencyDigest: '', audienceConstraint: audience, disclosureConstraint: { kind: 'same_source_parent_only' },
                            qualityRefs: [], status: 'complete', createdAt: now };
                        resultEnvelope.dependencyDigest = resultDependencyDigest(resultEnvelope);
                        const published = assertResultRecord({ schemaVersion: 1, runId, resultId, envelope: resultEnvelope, payload }, {
                            outputContract: root.graph.outputContract, expected: { runId, resultId, producerAttemptId: record.doc.attemptId,
                                producerEpoch: root.epoch, sourceBindingDigest: root.sourceBinding.bindingDigest, sourceRef: root.sourceBinding.sourceRef,
                                effectReceiptRef: resultEnvelope.sourceRefs[1], audienceConstraint: audience } });
                        const receipt = assertResultPublicationReceipt({ schemaVersion: 1, receiptKind: 'result_publication',
                            receiptId: resultPublicationReceiptId(runId, resultId), runId, epoch: root.epoch, producerAttemptId: record.doc.attemptId,
                            resultRef, resultIntegrity: hash(published), effectId, effectReceiptRef: proof.receiptRef,
                            handoffReceiptRef: current.handoffReceiptRef, delegationReceiptRef: current.delegationReceiptRef, budgetReadyReceiptRef: current.budgetReadyReceiptRef,
                            sourceBindingDigest: root.sourceBinding.bindingDigest, producerGrantDigest: current.grantDigest, audienceDigest: hash(audience),
                            decisionSeq: root.eventSeq + 1, createdAt: now });
                        await putImmutable(tx, controlRecordKey(handle, runId, 'result', resultId), published);
                        await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receipt.receiptId), receipt);
                        await writeAttemptSettlement({ tx, handle, root, record, outcome: 'completed', resultRefs: [resultRef],
                            effectReceiptRefs: [proof.receiptRef.receiptId], reasonCode: 'task_local_result_published', now });
                        root.resultRefs.push(resultRef); root.progress.steps++;
                        return { root, eventType: 'result_published', reasonCode: 'task_local_result_published',
                            outcome: { resultRef, publicationReceiptRef: { runId, receiptId: receipt.receiptId } } };
                    });
                    return { denied: false, ...saved.outcome };
                }), { withAuthority });
        } catch (error) {
            if (error.code !== 'storage_commit_unknown') throw error;
            // An unknown ACK permits observation of that one durable fact,
            // never another send, publish execution or restored body proof.
            const observed = await this.observe(handle, { runId, resultId });
            if (observed.status !== 'published') throw error;
            return observed;
        }
        if (envelope.denied) fail('native_orchestration_result_publication_stale');
        return immutable({ status: 'published', resultRef: envelope.resultRef, publicationReceiptRef: envelope.publicationReceiptRef });
    }

    /** Metadata-only historical observation. No Source/recipient permission is granted. */
    async observe(handle, request) {
        fields(request, ['runId', 'resultId'], 'Result publication observation');
        return this.execution.runs.engine.withTransaction(handle, async tx => {
            const root = await this.execution.runs.get(handle, request.runId);
            const saved = await readResultPublication(tx, handle, root, request.resultId);
            return saved ? immutable({ status: 'published', resultRef: saved.receipt.resultRef,
                publicationReceiptRef: { runId: root.runId, receiptId: saved.receipt.receiptId } }) : { status: 'unknown', resultRef: null, publicationReceiptRef: null };
        });
    }

    async publishGraphModelResult(handle, request) {
        fields(request, ['capture', 'result', 'runId', 'effectId'], 'Graph Model Result publication');
        const { capture, result, runId, effectId } = request, { runs, sourcePort } = this.execution;
        const initial = await runs.get(handle, runId);
        const withAuthority = sourcePort.consumptionBoundary(handle, initial.sourceBinding, { engine: runs.engine });
        const resultId = modelResultId(runId, effectId);
        try {
            const published = await runs.withSourceControl(handle, runId, () => runs.engine.withTransaction(handle, async tx => {
                let checked;
                try {
                    const root = await runs.get(handle, runId), proof = await ModelPort.prototype.inspectResultCompletion.call(this.modelPort, handle, { result, runId, effectId });
                    const current = await ModelPort.prototype.inspectResultCompletion.call(this.modelPort, handle, { result, runId, effectId });
                    if (!equal(proof, current) || !equal(root.sourceBinding, initial.sourceBinding) || root.cancelRequested || root.status !== 'running') fail('native_orchestration_result_publication_stale');
                    const record = await readAttempt(tx, handle, root, proof.producerAttemptId), intent = (await readEffect(tx, handle, root, effectId)).doc;
                    const authorize = () => NativeNarratorOrchestrationAuthority.prototype.authorizeGraphResult.call(this.host.turnOrchestration,
                        { handle, tx, root, capture, phase: 'publish', effectId, producer: record.doc });
                    const permission = await authorize();
                    const retrieval = await readContextRetrievalCompletions(tx, handle, root, intent, record.doc);
                    if (!equal(permission, { allowed: true, grantDigest: intent.grantDigest }) || record.doc.status !== 'running' || record.doc.resultRefs.length
                        || !equal(record.doc.effectRefs, [effectId, ...retrieval.map(item => item.effectId)]) || record.doc.effectiveGrantDigest !== intent.grantDigest || root.pendingEffectRefs.includes(effectId)) fail('native_orchestration_result_not_publishable');
                    const graphSnapshot = await readTaskGraphRevision(tx, handle, root);
                    await sourcePort.revalidate(handle, root.sourceBinding, { tx, root });
                    if (!equal(await authorize(), permission)) return { denied: true };
                    if (!equal(await runs.get(handle, runId), root)) return { denied: true };
                    checked = { root, record, intent, graphSnapshot, retrieval, proof };
                } catch (error) { if (DENIALS.has(error.code)) return { denied: true }; throw error; }
                const { root, record, intent, graphSnapshot, retrieval, proof } = checked;
                return runs.control(handle, controlCommandId('graph.result.publish', { runId, effectId }), { ...runGuard(root), operation: 'result.publish', detail: { effectId, resultId } }, async ({ tx, root: active, now }) => {
                    if (!equal(active, root) || active.progress.steps >= active.limits.maxSteps || now >= active.progress.deadlineAt) fail('native_orchestration_result_publication_stale');
                    const body = graphNodeResult({ root: active, producer: record.doc, proof, text: result.generated.response.text, now, graphSnapshot });
                    const resultRef = { runId, resultId }, receiptId = graphResultPublicationId(runId, resultId);
                    const receipt = { schemaVersion: 1, receiptKind: 'graph_node_result', receiptId, runId, epoch: active.epoch, producerAttemptId: record.doc.attemptId,
                        resultRef, resultIntegrity: hash(body), modelEffectId: effectId, modelReceiptRef: proof.receiptRef, modelPayloadHash: proof.payloadHash,
                        producerGrantDigest: intent.grantDigest, sourceBindingDigest: active.sourceBinding.bindingDigest,
                        audienceDigest: hash(body.envelope.audienceConstraint), graphRevision: active.graphRevision, decisionSeq: active.eventSeq + 1, createdAt: now };
                    await putImmutable(tx, controlRecordKey(handle, runId, 'result', resultId), body);
                    await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receiptId), receipt);
                    await writeAttemptSettlement({ tx, handle, root: active, record, outcome: 'completed', resultRefs: [resultRef], effectReceiptRefs: [proof.receiptRef.receiptId, ...retrieval.map(item => item.receiptId)], reasonCode: 'graph_result_published', now });
                    active.resultRefs.push(resultRef); active.progress.steps++;
                    return { root: active, eventType: 'result_published', reasonCode: 'graph_result_published', outcome: { status: 'published', resultRef, publicationReceiptRef: { runId, receiptId } } };
                });
            }), { withAuthority });
            if (published.denied) fail('native_orchestration_result_publication_stale');
            return immutable(published.outcome);
        } catch (error) {
            if (error.code !== 'storage_commit_unknown') throw error;
            const saved = await runs.engine.withTransaction(handle, async tx => readGraphNodeResult(tx, handle, await runs.get(handle, runId), resultId));
            if (!saved) throw error;
            return immutable({ status: 'published', resultRef: saved.receipt.resultRef, publicationReceiptRef: { runId, receiptId: saved.receipt.receiptId } });
        }
    }
}
