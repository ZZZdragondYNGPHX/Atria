import { rpNarrationResult, rpNarrationPublicationId, readRpNarrationResult } from './rp-narration-result-contracts.js';
import { writeAttemptSettlement, readAttemptSettlement } from './attempt-settlement.js';
import { TransitionController } from './transition-controller.js';
import { ModelPort, readModelCompletionReceipt } from './model-port.js';
import { RpOutputController } from './rp-output-controller.js';
import { reconcileRpOutputEffect, verifyRpOutputReconciliation } from './rp-output-reconciliation.js';
import { readEffect, effectDecision } from './effect-contracts.js';
import { rpNativeOutputKey, rpNativeOutputOperationId, rpNarrationPayload } from '../rp-output-protocol.js';
import { ConflictError } from '../../storage/errors.js';
import { ChatRepo } from '../../storage/repositories/chat-repo.js';
import { RpRunControl, rpOperationInput } from '../rp-run-control.js';
import { NativeGenerationHost } from '../adapters/generation-host.js';
import { NativeTaskScheduler, nativeTaskScheduler } from '../task-scheduler.js';
import { hashNativeDocument as hash, cloneNativeDocument, putImmutable } from '../repositories/common.js';
import { fields } from '../../../public/shared/native-values.js';
import { assertNativeId } from '../identity.js';
import { immutable, checkCancellation, effectiveOutputReserve } from '../model-prompt-runtime/execution-utils.js';
import { createOrchestrationAuthoringService } from './authoring-service.js';
import { validateModelCapability } from './model-capability-authority.js';
import { ContextPort } from './context-port.js';
import { AttemptController } from './attempt-controller.js';
import { controlCommandId, runGuard, readAttempt, controlRecordKey } from './controller-common.js';
import { compileNativeContextMetered, runGenerationLocalWork } from './generation-local-work.js';
import { assertChildRunCurrent, childBudgetReceiptId } from './run-repository.js';
import { checkedRecord } from './plan-repository.js';
import { readHandoff } from './handoff-contracts.js';
import { BudgetPort } from './budget-port.js';
import { assertObject, assertResultPolicy, nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';
import { ResultController } from './result-controller.js';
import { readResultPublication } from './result-publication-contracts.js';
import { TaskLocalOutputController } from './task-local-output-controller.js';
import { readTaskLocalOutput } from './task-local-output-contracts.js';
import { HandoffReturnController } from './handoff-return-controller.js';
import { ResultPort } from './result-port.js';
import { rpPlannerProfile, rpPlannerTask, rpPlannerOutputContract } from './rp-planner-profile.js';
import { GraphController } from './graph-controller.js';
import { graphPatchHash } from './graph-revision-contracts.js';
import { rpResultChainProfile } from './rp-result-chain-profile.js';
import { rpReviewProfile, rpReviewOutputContract, RP_REVIEW_REASON_CODES } from './rp-review-profile.js';
import { ReviewController, reviewReceiptId } from './review-controller.js';
import { readRpReviewCompletion, rpReviewModelReceiptId } from './rp-review-contracts.js';
import { rpJudgeProfile, rpJudgeOutputContract } from './rp-judge-profile.js';
import { readRpJudgeCompletion, rpJudgeReceiptId } from './rp-judge-contracts.js';
import { readGraphNodeResult } from './graph-result-contracts.js';

const outputCaptures = new WeakMap();
const captures = new WeakMap();
const delegationCaptures = new WeakMap();
const returnCaptures = new WeakMap();
const fail = (code = 'native_orchestration_rp_producer_denied') => { throw new ConflictError(code); };
const equal = (left, right) => hash(left) === hash(right);
const configuration = resolved => hash({ route: resolved.route, model: resolved.model, connection: resolved.connection,
    generation: resolved.generation, resources: resolved.resources });
const sameSet = (left, right) => left.length === right.length && left.every(value => right.includes(value));
const rpModelInput = (request, sourceBinding, selected) => ({ kind: 'native_rp_intent', role: 'narrator', requestId: request.requestId,
    sourceRef: sourceBinding.sourceRef, bindingRef: { bindingId: selected.binding.bindingId, version: selected.binding.version },
    planRef: selected.binding.planRef, nodeId: selected.node.nodeId, routeRef: selected.pin.resourceRef, configDigest: selected.configDigest, audience: { kind: 'narrator' } });
const rpModelGrant = (handle, sourceBinding, logicalInputRef) => hash({ owner: handle, logicalInputRef, sourceBindingDigest: sourceBinding.bindingDigest });

function finiteProfile(plan, { delegated = false, explicitResult = false } = {}) {
    const graph = plan.definition, node = graph.nodes.find(item => item.kind === 'agent'), output = graph.nodes.find(item => item.kind === 'output');
    const modelPins = nodeModelRoutePins(node, plan.dependencyPins);
    const capabilities = ['generation.send', ...(delegated ? ['agent.delegate'] : [])], outputCapabilities = graph.outputContract.kind === 'rp_narration' ? ['chat.output'] : [];
    if (graph.nodes.length !== 2 || !node || !output || graph.edges.length !== 1
        || !equal(graph.entryNodeIds, [node.nodeId]) || !sameSet(graph.capabilityCeiling, [...capabilities, ...outputCapabilities])
        || !sameSet(node.capabilities, capabilities) || node.inputs.length || node.outputs.length !== 1 || node.outputs[0].type !== 'text'
        || !modelPins.length || node.dependencyPinIds.length !== modelPins.length + (delegated ? 1 : 0)
        || plan.dependencyPins.some(pin => !node.dependencyPinIds.includes(pin.pinId)) || !sameSet(output.capabilities, outputCapabilities) || output.inputs.length !== 1
        || output.inputs[0].type !== 'text' || !output.inputs[0].required || output.outputs.length || output.dependencyPinIds.length
        || plan.dependencyPins.length !== modelPins.length + (delegated ? 1 : 0) || !['result', 'rp_narration'].includes(graph.outputContract.kind) || graph.outputContract.allowPartial
        || graph.graphChangePolicy.allowedOperations.length || graph.edges[0].condition !== 'always'
        || graph.edges[0].loopBack || graph.edges[0].maxVisits !== 1
        || graph.edges[0].from.nodeId !== node.nodeId || graph.edges[0].to.nodeId !== output.nodeId
        || graph.edges[0].from.port !== node.outputs[0].name || graph.edges[0].to.port !== output.inputs[0].name) fail('native_orchestration_rp_plan_unavailable');
    if (graph.outputContract.kind === 'rp_narration' && (explicitResult || graph.outputContract.slot !== 'assistant'
        || assertResultPolicy(graph.outputContract).outputType !== 'text')) fail('native_orchestration_rp_plan_unavailable');
    if (explicitResult && assertResultPolicy(graph.outputContract).outputType !== 'text') fail('native_orchestration_rp_plan_unavailable');
    return node;
}

// Capabilities only originate inside the real Scheduler callback below.
// JSON, a caller-supplied boundary or another Host cannot mint a producer.
export function inspectNativeRpGenerationIdentity(capture, { host, handle, rpControl } = {}) {
    const state = captures.get(capture);
    if (!state || state.handle !== handle || (host !== undefined && state.host !== host)
        || (rpControl !== undefined && state.control !== rpControl)
        || !(state.host instanceof NativeGenerationHost) || state.host.turnOrchestration !== state.owner
        || !(state.control instanceof RpRunControl) || state.owner.rpControl !== state.control
        || state.host.persistence._engine !== state.control._engine || !(state.scheduler instanceof NativeTaskScheduler)) fail();
    const active = NativeTaskScheduler.prototype.assertActiveBoundary.call(state.scheduler, state.boundary, state.expected);
    if (active.attempt !== 0 || state.scheduler.operations.get(active.operationId)?.retry !== false) fail();
    return Object.freeze({ ...state.identity, host: state.host, rpControl: state.control, signal: active.signal, operationId: active.operationId });
}

export async function inspectNativeRpGeneration(capture, expected) {
    const identity = inspectNativeRpGenerationIdentity(capture, expected);
    const context = await identity.rpControl._engine.withTransaction(expected.handle, async tx => {
        const current = await RpRunControl.prototype.status.call(identity.rpControl, expected.handle, identity.sourceRequest.controlId, { tx });
        const chat = await tx.getResource({ kind: 'chat', handle: expected.handle, ...current.locator });
        if (chat?.body.length !== identity.sourceRequest.source.input.floor + 1) fail('native_orchestration_source_stale');
        return RpRunControl.prototype.context.call(identity.rpControl, expected.handle,
            identity.sourceRequest.controlId, identity.sourceRequest.source, { tx });
    });
    if (context.prefixDigest !== identity.prefixDigest) fail('native_orchestration_source_stale');
    inspectNativeRpGenerationIdentity(capture, expected);
    return { ...identity, context };
}

/** Only the actual child Scheduler callback can witness this producer. */
export function inspectNativeRpDelegationIdentity(capture, { host, handle, rpControl } = {}) {
    const state = delegationCaptures.get(capture);
    if (!state || state.handle !== handle || host !== undefined && state.host !== host
        || rpControl !== undefined && state.control !== rpControl
        || !(state.host instanceof NativeGenerationHost) || state.host.turnOrchestration !== state.owner
        || state.owner.rpControl !== state.control || !(state.control instanceof RpRunControl)
        || state.host.persistence._engine !== state.control._engine || !(state.scheduler instanceof NativeTaskScheduler)) fail();
    const active = NativeTaskScheduler.prototype.assertActiveBoundary.call(state.scheduler, state.boundary, state.expected);
    if (active.attempt !== 0 || state.scheduler.operations.get(active.operationId)?.retry !== false) fail();
    return Object.freeze({ ...state.identity, host: state.host, rpControl: state.control, signal: active.signal, operationId: active.operationId });
}

export async function inspectNativeRpDelegation(capture, expected = {}) {
    return inspectDelegation(capture, expected, false);
}

/** Output closure has a separate bank predicate; sending still requires held. */
export async function inspectNativeRpDelegationOutput(capture, expected = {}) {
    return inspectDelegation(capture, expected, true);
}

async function inspectDelegation(capture, expected, output) {
    const identity = inspectNativeRpDelegationIdentity(capture, expected), state = delegationCaptures.get(capture);
    const read = async tx => {
        await state.assertSelection();
        const root = await state.service.runs.get(expected.handle, identity.childRunId);
        const fence = await state.control._engine.nativeHostLifecycle.assertWriter(expected.handle, tx);
        await assertChildRunCurrent(tx, expected.handle, root);
        if (root.cancelRequested || !['admitted', 'running'].includes(root.status) || root.epoch !== identity.childEpoch
            || root.hostBootId !== fence.hostBootId || root.hostGeneration !== fence.generation || !equal(root.graph, state.expectedGraph)
            || !equal(root.sourceBinding, identity.sourceBinding) || !equal(root.planRef, identity.childPlanRef)
            || root.parentRef?.parentRunId !== identity.parentRunId || root.parentRef.nodeAttemptId !== identity.parentAttemptId
            || root.parentRef.parentEpoch !== identity.parentEpoch || root.parentRef.effectiveGrantDigest !== identity.grantDigest
            || !equal(root.parentRef.inputRefs, identity.inputRefs)) fail('native_orchestration_parent_stale');
        const parentRoot = await state.service.runs.get(expected.handle, identity.parentRunId);
        const parentAttempt = (await readAttempt(tx, expected.handle, parentRoot, identity.parentAttemptId)).doc;
        if (parentAttempt.status !== 'waiting_child' || parentAttempt.effectRefs.length || parentAttempt.resultRefs.length) fail('native_orchestration_parent_stale');
        const handoff = await readHandoff(tx, expected.handle, parentRoot, parentAttempt, root);
        const delegationId = 'oreceipt_' + hash({ kind: 'delegation', childRunId: root.runId }).slice(0, 32);
        const delegation = (await checkedRecord(tx, controlRecordKey(expected.handle, parentRoot.runId, 'receipt', delegationId)))?.doc;
        if (!delegation) fail('native_orchestration_handoff_unconfirmed');
        assertObject(delegation, ['schemaVersion', 'receiptKind', 'receiptId', 'runId', 'childRunId', 'parentRef', 'budgetCeiling',
            'sourceBindingDigest', 'authorityRef', 'decisionSeq', 'createdAt'], 'delegation receipt');
        if (delegation.schemaVersion !== 1 || delegation.receiptKind !== 'delegation' || delegation.receiptId !== delegationId
            || delegation.runId !== parentRoot.runId || delegation.childRunId !== root.runId || !equal(delegation.parentRef, root.parentRef)
            || !equal(delegation.budgetCeiling, root.parentRef.budgetCeiling) || delegation.sourceBindingDigest !== root.sourceBinding.bindingDigest
            || !equal(delegation.authorityRef, root.budgetAuthorityRef) || delegation.decisionSeq !== handoff.decisionSeq
            || delegation.createdAt !== handoff.createdAt) fail('native_orchestration_handoff_unconfirmed');
        let closure;
        if (output) {
            closure = await BudgetPort.prototype.observeChildClosure.call(state.service.budgetPort, expected.handle, {
                authorityRef: root.budgetAuthorityRef, reservationId: root.runId,
                expectedParentReservationId: parentRoot.parentRef ? parentRoot.runId : null, expectedCeiling: root.parentRef.budgetCeiling }, { tx });
            if (!closure.closed) fail('native_orchestration_child_budget_unclosed');
        } else await BudgetPort.prototype.verifyReservation.call(state.service.budgetPort, { handle: expected.handle, tx, root, parent: parentRoot });
        const readyId = childBudgetReceiptId(root.runId);
        const current = await RpRunControl.prototype.status.call(identity.rpControl, expected.handle, identity.sourceRequest.controlId, { tx });
        const chat = await tx.getResource({ kind: 'chat', handle: expected.handle, ...current.locator });
        const floor = identity.sourceRequest.source.input.floor, last = chat?.body[floor];
        if (chat?.body.length !== floor + 1 || !last?.is_user || last.is_system || typeof last.mes !== 'string') fail('native_orchestration_source_stale');
        const original = await RpRunControl.prototype.context.call(identity.rpControl, expected.handle,
            identity.sourceRequest.controlId, identity.sourceRequest.source, { tx });
        if (original.prefixDigest !== identity.prefixDigest) fail('native_orchestration_source_stale');
        // Resolve original source withdrawal before the Binding authorizer's
        // generic missing-resource error, so lawful writes can commit as deny.
        await state.assertSelection();
        inspectNativeRpDelegationIdentity(capture, expected);
        return { ...identity, root, parentRoot, parentAttempt, parentGrantDigest: parentAttempt.effectiveGrantDigest,
            parentTaskPurpose: 'original_rp_delegation',
            handoffReceiptRef: { runId: parentRoot.runId, receiptId: handoff.receiptId },
            delegationReceiptRef: { runId: parentRoot.runId, receiptId: delegationId },
            budgetReadyReceiptRef: { runId: root.runId, receiptId: readyId },
            ...(output ? { closure } : { context: { messages: [{ role: 'user', content: last.mes }] } }) };
    };
    return state.control._engine.withTransaction(expected.handle, tx => {
        if (expected.tx !== undefined && expected.tx !== tx) fail('native_orchestration_rp_producer_denied');
        return read(tx);
    });
}

/** Issued only after the actual parent Scheduler permit has been reacquired. */
export function inspectNativeRpReturnIdentity(capture, { host, handle, rpControl } = {}) {
    const state = returnCaptures.get(capture);
    if (!state || state.handle !== handle || host !== undefined && state.host !== host || rpControl !== undefined && state.control !== rpControl
        || state.parentState.returnCapture !== capture || !['waiting_child', 'resumed'].includes(state.parentState.phase)) fail('native_orchestration_return_denied');
    const original = inspectNativeRpGenerationIdentity(state.parentState.capture, { host: state.host, handle, rpControl: state.control });
    if (!equal(original.sourceRequest, state.identity.sourceRequest) || original.prefixDigest !== state.identity.prefixDigest
        || original.request.requestId !== state.parentState.input.requestId) fail('native_orchestration_return_denied');
    return Object.freeze({ ...state.identity, host: state.host, rpControl: state.control, signal: original.signal, operationId: original.operationId });
}

export async function inspectNativeRpReturn(capture, expected = {}) {
    const identity = inspectNativeRpReturnIdentity(capture, expected), state = returnCaptures.get(capture), service = state.service;
    return state.control._engine.withTransaction(expected.handle, async tx => {
        if (expected.tx !== undefined && expected.tx !== tx) fail('native_orchestration_return_denied');
        await state.assertCurrent();
        const parent = await service.runs.get(expected.handle, identity.parentRunId), child = await service.runs.get(expected.handle, identity.childRunId);
        const fence = await state.control._engine.nativeHostLifecycle.assertWriter(expected.handle, tx);
        await assertChildRunCurrent(tx, expected.handle, child);
        const attempt = (await readAttempt(tx, expected.handle, parent, identity.parentAttemptId)).doc;
        if (parent.cancelRequested || parent.status !== 'running' || parent.epoch !== identity.parentEpoch
            || child.cancelRequested || child.status !== 'completed' || child.epoch !== identity.childEpoch
            || parent.hostBootId !== fence.hostBootId || parent.hostGeneration !== fence.generation
            || child.hostBootId !== fence.hostBootId || child.hostGeneration !== fence.generation
            || !equal(parent.planRef, identity.parentPlanRef) || !equal(child.planRef, identity.childPlanRef)
            || child.parentRef?.parentRunId !== parent.runId || child.parentRef.nodeAttemptId !== attempt.attemptId
            || child.parentRef.parentEpoch !== parent.epoch || !equal(parent.sourceBinding, identity.sourceBinding) || !equal(child.sourceBinding, identity.sourceBinding)
            || attempt.epoch !== parent.epoch || !(state.parentState.phase === 'waiting_child' ? ['waiting_child'] : ['running', 'waiting_effect']).includes(attempt.status)
            || attempt.inputDigest !== identity.parentInputDigest || !equal(attempt.inputRefs, identity.parentInputRefs)
            || attempt.effectiveGrantDigest !== identity.parentGrantDigest || attempt.resultRefs.length
            || !(state.parentState.phase === 'resumed' && state.parentState.continuationEffectId
                ? equal(attempt.effectRefs, []) || equal(attempt.effectRefs, [state.parentState.continuationEffectId])
                    || state.parentState.outputEffectId && equal(attempt.effectRefs, [state.parentState.continuationEffectId, state.parentState.outputEffectId]) : !attempt.effectRefs.length)
            || !equal(attempt.budgetRef, parent.budgetAuthorityRef) || child.parentRef.effectiveGrantDigest !== identity.childGrantDigest)
            fail('native_orchestration_return_stale');
        const handoff = await readHandoff(tx, expected.handle, parent, attempt, child);
        const output = await readTaskLocalOutput(tx, expected.handle, child);
        if (!output || !equal(output.receipt.claimRef, identity.outputClaimRef) || !equal(output.claim.resultRef, identity.resultRef)
            || !equal({ runId: child.runId, receiptId: output.receipt.receiptId }, identity.outputReceiptRef)) fail('native_orchestration_return_stale');
        const closure = await BudgetPort.prototype.observeChildClosure.call(service.budgetPort, expected.handle, {
            authorityRef: child.budgetAuthorityRef, reservationId: child.runId, expectedParentReservationId: null,
            expectedCeiling: child.parentRef.budgetCeiling }, { tx });
        if (!closure.closed || closure.snapshotDigest !== output.closure.snapshotDigest
            || !equal(closure.budgetAttemptRefs, output.closure.budgetAttemptRefs) || !equal(closure.reservationRefs, output.closure.reservationRefs))
            fail('native_orchestration_return_stale');
        await state.assertCurrent();
        inspectNativeRpReturnIdentity(capture, expected);
        return { ...identity, parent, child, attempt, handoff, output };
    });
}

/** A live final Narrator completion can prepare one original-domain output. */
export function inspectNativeRpOutputIdentity(capture, { handle, rpControl, host } = {}) {
    const saved = outputCaptures.get(capture);
    if (!saved || saved.state.handle !== handle || rpControl !== undefined && saved.control !== rpControl
        || host !== undefined && saved.state.host !== host || saved.state.outputCapture !== capture) fail('native_rp_output_scope_required');
    const identity = inspectNativeRpGenerationIdentity(saved.state.capture, { handle, host: saved.state.host, rpControl: saved.control });
    return { ...identity, controlId: identity.sourceRequest.controlId, runId: saved.runId, sourceBinding: saved.state.sourceBinding,
        execution: saved.execution };
}

export async function inspectNativeRpOutput(capture, expected = {}) {
    const identity = inspectNativeRpOutputIdentity(capture, expected), saved = outputCaptures.get(capture), { state, execution, port, result } = saved;
    return saved.control._engine.withTransaction(expected.handle, async tx => {
        if (expected.tx !== undefined && expected.tx !== tx) fail('native_rp_output_scope_required');
        await saved.assertCurrent();
        if (!saved.proof) {
            saved.proof = await ModelPort.prototype.inspectResultCompletion.call(port, expected.handle, { result, runId: saved.runId, effectId: state.effectId });
            saved.resultHash = hash(result);
        }
        const proof = saved.proof;
        if (hash(result) !== saved.resultHash) fail('native_rp_output_payload_changed');
        const root = await execution.runs.get(expected.handle, saved.runId), policy = assertResultPolicy(root.graph.outputContract);
        if (root.graph.outputContract.kind !== 'rp_narration' || root.graph.outputContract.slot !== 'assistant'
            || proof.outputType !== 'text' || proof.producerAttemptId !== state.attemptId || proof.epoch !== root.epoch
            || root.cancelRequested || root.status !== 'running' || root.parentRef !== null || !equal(root.planRef, state.selected.binding.planRef)
            || !equal(proof.sourceBinding, state.sourceBinding) || Buffer.byteLength(result.generated.response.text, 'utf8') > policy.maxBytes)
            fail('native_rp_output_denied');
        const modelIntent = (await readEffect(tx, expected.handle, root, state.effectId)).doc;
        const completion = await readModelCompletionReceipt(expected.handle, tx, root, modelIntent);
        if (!completion || !equal(completion.receiptRef, proof.receiptRef)) fail('native_rp_output_denied');
        const completionHash = hash(completion);
        if (saved.completionHash && saved.completionHash !== completionHash) fail('native_rp_output_denied');
        saved.completionHash = completionHash;
        const attempt = (await readAttempt(tx, expected.handle, root, state.attemptId)).doc;
        if (attempt.epoch !== root.epoch || attempt.effectiveGrantDigest !== state.decision.grantDigest
            || !equal(attempt.effectRefs, [state.effectId])) fail('native_rp_output_denied');
        if (state.outputPublishing) {
            if (attempt.status !== 'completed') fail('native_rp_output_denied');
            const settlement = await readAttemptSettlement(tx, expected.handle, root, attempt);
            const published = await readRpNarrationResult(tx, expected.handle, root);
            if (!published || settlement.reasonCode !== 'rp_narration_ready' || !equal(settlement.resultRefs, [state.narrationResultRef])
                || hash(published.record.payload) !== proof.payloadHash || published.record.payload !== result.generated.response.text
                || !equal(settlement.effectReceiptRefs, [proof.receiptRef.receiptId])) fail('native_rp_output_denied');
        } else if (attempt.status !== 'running') fail('native_rp_output_denied');
        let outputDispatch = false;
        if (state.outputAttemptId) {
            const output = (await readAttempt(tx, expected.handle, root, state.outputAttemptId)).doc;
            if (output.nodeId !== root.graph.outputContract.ownerNodeId || output.epoch !== root.epoch
                || !['running', 'waiting_effect'].includes(output.status) || !equal(output.inputRefs, state.outputInputRefs)
                || output.effectiveGrantDigest !== state.decision.grantDigest || output.inputDigest !== hash(state.outputInputRefs)
                || !equal(output.effectRefs, state.outputEffectId ? [state.outputEffectId] : [])) fail('native_rp_output_denied');
            if (state.outputEffectId) {
                const outputIntent = (await readEffect(tx, expected.handle, root, state.outputEffectId)).doc;
                if (!equal(effectDecision(outputIntent), state.outputDecision) || outputIntent.nodeAttemptId !== output.attemptId) fail('native_rp_output_denied');
                outputDispatch = outputIntent.status === 'dispatching' && outputIntent.dispatchToken === state.outputDispatchToken && !!state.outputDispatchToken;
                if (outputDispatch) await execution.budgetPort.verifyBudgetAttempt({ handle: expected.handle, tx, root, intent: outputIntent, budgetAttemptRef: outputIntent.budgetAttemptRef });
            }
        }

        await BudgetPort.prototype.assertCurrent.call(execution.budgetPort, expected.handle, root.budgetAuthorityRef, { tx });
        await saved.assertCurrent();
        if (!equal(root, await execution.runs.get(expected.handle, root.runId))) fail('native_rp_output_stale');
        const fence = await saved.control._engine.nativeHostLifecycle.assertWriter(expected.handle, tx);
        const control = await RpRunControl.prototype.status.call(saved.control, expected.handle, identity.controlId, { tx });
        const chat = await tx.getResource({ kind: 'chat', handle: expected.handle, ...control.locator });
        inspectNativeRpOutputIdentity(capture, expected);
        return { ...identity, proof, outputDispatch, rootStamp: hash(root), payload: immutable(rpNarrationPayload({ controlId: identity.controlId, source: identity.sourceRequest.source, text: result.generated.response.text })),
            chatIntegrity: chat.integrity, locator: control.locator, prefixDigest: identity.prefixDigest,
            hostFence: { hostBootId: fence.hostBootId, generation: fence.generation } };
    });
}

/** Original RP chat/RunControl/Scheduler producer. It does not write dialogue. */
export class NativeRpOrchestrationAuthority {
    #runs = new Map();
    #execution;
    #port;
    #issueScope;

    constructor({ owner, execution, port, issueScope, scheduler = nativeTaskScheduler }) {
        Object.assign(this, { owner, scheduler });
        this.#execution = execution; this.#port = port; this.#issueScope = issueScope;
    }

    #plans() {
        return this.owner.plans ??= createOrchestrationAuthoringService(this.owner.engine, {
            sessionCore: this.owner.sessionCore, projectAgent: this.owner.projectAgent, studio: this.owner.projectAgent?._studio,
            rpControl: this.owner.rpControl, modelResolver: this.owner.modelResolver }).plans;
    }

    async #selection(host, handle, input) {
        if (!(host instanceof NativeGenerationHost) || host.turnOrchestration !== this.owner
            || host.persistence._engine !== this.owner.engine || !(this.owner.rpControl instanceof RpRunControl)
            || this.owner.rpControl._engine !== this.owner.engine) fail();
        const binding = await this.#plans().getBinding(handle, { domain: 'rp_chat', controlId: input.controlId });
        if (!binding) fail('native_orchestration_rp_binding_required');
        const plan = await this.#plans().getRevision(handle, binding.planRef), graph = plan.definition;
        const delegated = graph.nodes.some(item => item.capabilities.includes('agent.delegate'));
        const judgeProfile = rpJudgeProfile(plan), reviewProfile = judgeProfile ? null : rpReviewProfile(plan);
        const plannerProfile = judgeProfile || reviewProfile ? null : rpPlannerProfile(plan), chainProfile = reviewProfile ?? (judgeProfile ? null : rpResultChainProfile(plan));
        const node = finiteProfile(judgeProfile?.narration ?? plannerProfile?.narration ?? chainProfile?.narration ?? plan, { delegated });
        const pin = plan.dependencyPins.find(item => item.pinId === node.policy.agentPinId && node.dependencyPinIds.includes(item.pinId));
        if (pin?.port !== 'model' || !equal(pin.resourceRef, input.routeRef)) fail('native_orchestration_rp_route_mismatch');
        const validation = await validateModelCapability({ handle, definition: graph, dependencyPins: plan.dependencyPins, resolver: this.owner.modelResolver });
        if (validation.issues.length) fail('native_orchestration_model_authority_unavailable');
        const resolved = await this.owner.modelResolver.resolve({ handle, routeRef: input.routeRef, role: 'role.narrator' });
        const route = resolved.route;
        if (hash(route) !== pin.integrity || route.role !== 'role.narrator' || route.fallbackRouteRefs.length || route.policy.maxRetries !== 0
            || (route.executionPolicy?.continuity ?? 'none') !== 'none' || (route.executionPolicy?.reuse ?? 'disabled') !== 'disabled')
            fail('native_orchestration_rp_route_mismatch');
        if (!route.executionPolicy?.computeBudget?.localWork) fail('native_orchestration_context_budget_unavailable');
        let child = null;
        if (delegated) {
            const childPin = plan.dependencyPins.find(item => item.port === 'plan' && node.dependencyPinIds.includes(item.pinId));
            if (!childPin || !equal(node.policy.allowedPlanPinIds, [childPin.pinId])) fail('native_orchestration_child_plan_not_allowed');
            const childPlan = await this.#plans().getRevision(handle, childPin.resourceRef);
            if (hash(childPlan) !== childPin.integrity) fail('native_orchestration_child_plan_pin_stale');
            const childNode = finiteProfile(childPlan, { explicitResult: true });
            const modelPin = childPlan.dependencyPins[0];
            if (modelPin.port !== 'model' || modelPin.pinId !== childNode.policy.agentPinId
                || childNode.dependencyPinIds[0] !== modelPin.pinId) fail('native_orchestration_rp_route_mismatch');
            const validated = await validateModelCapability({ handle, definition: childPlan.definition, dependencyPins: childPlan.dependencyPins, resolver: this.owner.modelResolver });
            if (validated.issues.length) fail('native_orchestration_model_authority_unavailable');
            const childResolved = await this.owner.modelResolver.resolve({ handle, routeRef: modelPin.resourceRef, role: 'role.narrator' });
            const childRoute = childResolved.route;
            if (hash(childRoute) !== modelPin.integrity || childRoute.role !== 'role.narrator' || childRoute.fallbackRouteRefs.length
                || childRoute.policy.maxRetries !== 0 || childRoute.executionPolicy?.continuity !== 'none' || childRoute.executionPolicy?.reuse !== 'disabled'
                || childRoute.executionPolicy?.computeBudget?.maxRequests !== 1 || !childRoute.executionPolicy.computeBudget.localWork)
                fail('native_orchestration_rp_route_mismatch');
            child = { plan: childPlan, planRef: childPin.resourceRef, node: childNode, pin: modelPin, resolved: childResolved,
                configDigest: configuration(childResolved) };
        }
        const prologue = async (node, transfer, structured) => {
            if (delegated) fail('native_orchestration_rp_planner_plan_unavailable');
            const pin = plan.dependencyPins.find(item => item.pinId === node.policy.agentPinId);
            const next = await this.owner.modelResolver.resolve({ handle, routeRef: pin.resourceRef, role: 'role.narrator', requirements: structured ? ['generation.structured-output'] : [] });
            if (hash(next.route) !== pin.integrity || next.route.fallbackRouteRefs.length || next.route.policy.maxRetries !== 0
                || (next.route.executionPolicy?.continuity ?? 'none') !== 'none' || (next.route.executionPolicy?.reuse ?? 'disabled') !== 'disabled'
                || !equal(next.route.executionPolicy.computeBudget, resolved.route.executionPolicy.computeBudget)) fail('native_orchestration_rp_route_mismatch');
            return { binding, plan, node, pin, resolved: next, configDigest: configuration(next), transfer };
        };
        const planner = plannerProfile ? await prologue(plannerProfile.planner, plannerProfile.transfer, true) : null;
        const candidates = judgeProfile ? await Promise.all(judgeProfile.candidates.map((node, i) => prologue(node, judgeProfile.transfers[i], false))) : [];
        const chain = candidates[0] ?? (chainProfile ? await prologue(chainProfile.draft, chainProfile.transfer, false) : null);
        const judge = judgeProfile ? { ...await prologue(judgeProfile.judge, judgeProfile.gate, true), inputs: judgeProfile.inputs, candidates } : null;
        if (judge && resolved.route.executionPolicy.computeBudget.maxRequests < 4) fail('native_orchestration_judge_budget_unavailable');
        const review = reviewProfile ? { ...await prologue(reviewProfile.review, reviewProfile.reviewInput, true), gate: reviewProfile.reviewGate } : null;
        if (review && resolved.route.executionPolicy.computeBudget.maxRequests < 3) fail('native_orchestration_review_budget_unavailable');
        return { binding, plan, node, pin, resolved, child, planner, chain, review, judge, configDigest: configuration(resolved) };
    }

    async #current(state) {
        if (state.outputPublishing) return this.#baseCurrent(state);
        if (state.delegationCapture) return inspectNativeRpDelegation(state.delegationCapture, { host: state.host, handle: state.handle });
        if (state.phase === 'resumed' && state.returnCapture) return inspectNativeRpReturn(state.returnCapture, { host: state.host, handle: state.handle });
        return this.#baseCurrent(state);
    }

    async #baseCurrent(state) {
        await inspectNativeRpGeneration(state.capture, { host: state.host, handle: state.handle, rpControl: this.owner.rpControl });
        const selected = await this.#selection(state.host, state.handle, state.input);
        if (!equal(selected.binding, state.selected.binding) || selected.configDigest !== state.selected.configDigest
            || selected.child?.configDigest !== state.selected.child?.configDigest || selected.planner?.configDigest !== state.selected.planner?.configDigest
            || selected.chain?.configDigest !== state.selected.chain?.configDigest || selected.review?.configDigest !== state.selected.review?.configDigest
            || selected.judge?.configDigest !== state.selected.judge?.configDigest
            || !equal(selected.judge?.candidates.map(item => item.configDigest) ?? [], state.selected.judge?.candidates.map(item => item.configDigest) ?? []))
            fail('native_orchestration_source_stale');
        return selected;
    }

    async authorize({ handle, root, attempt, proposal, intent }) {
        const state = this.#runs.get(root.runId);
        if (!state || state.handle !== handle || !equal(root.planRef, state.selected.binding.planRef)
            || root.sourceBinding.bindingDigest !== state.sourceBinding.bindingDigest) fail();
        await this.#current(state);
        if (state.outputPublishing && attempt?.attemptId === state.outputAttemptId && !proposal && !intent) {
            if (attempt.nodeId !== root.graph.outputContract.ownerNodeId || !equal(attempt.inputRefs, state.outputInputRefs)
                || attempt.inputDigest !== hash(state.outputInputRefs) || attempt.effectiveGrantDigest !== state.decision.grantDigest
                || !equal(attempt.budgetRef, root.budgetAuthorityRef)) fail('native_rp_output_denied');
            return { allowed: true, grantDigest: state.decision.grantDigest };
        }
        if (state.parentDelegation && state.phase !== 'resumed') {
            if (attempt && (attempt.nodeId !== state.selected.node.nodeId || attempt.effectiveGrantDigest !== state.parentGrantDigest)
                || proposal || intent) fail('native_orchestration_delegation_denied');
            return { allowed: true, grantDigest: state.parentGrantDigest };
        }
        const decision = (proposal?.actionRef.kind ?? intent?.actionRef.kind) === 'native_rp_output' ? state.outputDecision : state.decision;
        if (!decision) fail();
        const outputAction = decision === state.outputDecision;
        if (attempt && (attempt.nodeId !== (outputAction ? root.graph.outputContract.ownerNodeId : (state.activeSelection ?? state.selected).node.nodeId)
            || attempt.effectiveGrantDigest !== decision.grantDigest)) fail();
        if (proposal && !equal(proposal, Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, decision[key]])))) fail();
        if (intent && (intent.nodeAttemptId !== (outputAction ? state.outputAttemptId : state.attemptId) || intent.inputHash !== decision.inputHash)) fail();
        return cloneNativeDocument(decision);
    }

    async #prepareOutputGraph(handle, capture, saved, identity) {
        const { state, execution } = saved, { runs, sourcePort } = execution;
        const withAuthority = sourcePort.consumptionBoundary(handle, identity.sourceBinding, { engine: runs.engine });
        return runs.withSourceControl(handle, identity.runId, async () => {
            const checked = await runs.engine.withTransaction(handle, async tx => {
                try { return { current: await inspectNativeRpOutput(capture, { handle, rpControl: this.owner.rpControl, tx }) }; } catch (error) {
                    if (['native_rp_output_stale', 'native_orchestration_source_stale', 'native_orchestration_return_stale',
                        'native_generation_revision_conflict', 'native_rp_source_missing', 'native_rp_control_relocated',
                        'native_orchestration_model_result_completion_stale'].includes(error.code)) return { denied: true };
                    throw error;
                }
            });
            if (checked.denied) fail('native_rp_output_stale');
            const current = checked.current;
            const published = await runs.control(handle, controlCommandId('rp.narrator.settle', { runId: identity.runId, attemptId: state.attemptId }), {
                ...runGuard(await runs.get(handle, identity.runId)), operation: 'attempt.settle', detail: { reason: 'rp_narration_ready' } }, async ({ tx, root, now }) => {
                const record = await readAttempt(tx, handle, root, state.attemptId);
                if (root.cancelRequested || root.status !== 'running' || root.pendingEffectRefs.length || record.doc.status !== 'running'
                    || root.progress.steps >= root.limits.maxSteps || now >= root.progress.deadlineAt
                    || !equal(record.doc.effectRefs, [state.effectId]) || record.doc.resultRefs.length) fail('native_rp_output_denied');
                const result = rpNarrationResult({ root, proof: current.proof, payload: saved.result.generated.response.text, grantDigest: state.decision.grantDigest, now });
                const publication = { schemaVersion: 1, receiptKind: 'rp_narration_result', receiptId: rpNarrationPublicationId(result.resultRef.resultId),
                    runId: root.runId, epoch: root.epoch, producerAttemptId: state.attemptId, resultRef: result.resultRef, resultIntegrity: hash(result.record),
                    modelEffectId: state.effectId, modelReceiptRef: current.proof.receiptRef, grantDigest: state.decision.grantDigest,
                    sourceBindingDigest: root.sourceBinding.bindingDigest, audienceDigest: hash(result.record.envelope.audienceConstraint), decisionSeq: root.eventSeq + 1, createdAt: now };
                await putImmutable(tx, controlRecordKey(handle, root.runId, 'result', result.resultRef.resultId), result.record);
                await putImmutable(tx, controlRecordKey(handle, root.runId, 'receipt', publication.receiptId), publication);
                await writeAttemptSettlement({ tx, handle, root, record, outcome: 'completed', resultRefs: [result.resultRef],
                    effectReceiptRefs: [current.proof.receiptRef.receiptId], reasonCode: 'rp_narration_ready', now });
                root.resultRefs.push(result.resultRef); root.progress.steps++;
                return { root, eventType: 'rp_narration_ready', reasonCode: 'rp_narration_ready', outcome: { resultRef: result.resultRef } };
            });
            state.outputPublishing = true; state.narrationResultRef = immutable(published.outcome.resultRef);
            state.outputInputRefs = immutable([state.narrationResultRef]);
            const root = await runs.get(handle, identity.runId), edge = root.graph.edges.find(item => item.from.nodeId === state.selected.node.nodeId && item.to.nodeId === root.graph.outputContract.ownerNodeId);
            const traversal = await new TransitionController({ runs, authorizeTransition: async ({ tx, root: active, target, producers }) => {
                await this.#baseCurrent(state);
                if (target.nodeId !== active.graph.outputContract.ownerNodeId || producers.length !== 1
                    || producers[0].attempt.attemptId !== state.attemptId || producers[0].receipt.reasonCode !== 'rp_narration_ready'
                    || !equal(producers[0].receipt.effectReceiptRefs, [current.proof.receiptRef.receiptId])
                    || !equal(producers[0].receipt.resultRefs, [state.narrationResultRef]) || !await readRpNarrationResult(tx, handle, active)) fail('native_rp_output_denied');
                await BudgetPort.prototype.assertCurrent.call(execution.budgetPort, handle, active.budgetAuthorityRef, { tx });
                return { inputRefs: state.outputInputRefs, inputDigest: hash(state.outputInputRefs),
                    effectiveGrantDigest: state.decision.grantDigest, budgetRef: active.budgetAuthorityRef };
            } }).advance(handle, { ...runGuard(root), bindings: [{ edgeId: edge.edgeId, producerAttemptId: state.attemptId }], reservedAttemptId: null });
            state.outputAttemptId = traversal.outcome.attemptId;
            await new AttemptController({ runs, authorizeAttempt: args => this.authorize(args) }).activate(handle,
                { ...runGuard(await runs.get(handle, identity.runId)), attemptId: state.outputAttemptId });
            return current;
        }, { withAuthority });
    }

    async prepareRpOutputEffect({ handle, capture }) {
        const saved = outputCaptures.get(capture), identity = inspectNativeRpOutputIdentity(capture, { handle, rpControl: this.owner.rpControl });
        if (!saved || this.#runs.get(identity.runId) !== saved.state || saved.state.outputEffectId) fail('native_rp_output_denied');
        const current = await this.#prepareOutputGraph(handle, capture, saved, identity);
        const { state } = saved, outputKey = rpNativeOutputKey(identity.controlId, identity.sourceRequest.source);
        const operationId = rpNativeOutputOperationId(outputKey);
        const inputRef = { kind: 'native_rp_narration', resultRef: state.narrationResultRef, modelEffectId: state.effectId, modelReceiptRef: current.proof.receiptRef,
            controlId: identity.controlId, outputKey, operationId, payloadHash: hash(current.payload), sourceDigest: identity.prefixDigest,
            inputAnchor: identity.sourceRequest.source.input };
        state.outputEffectId = 'oeffect_' + hash({ runId: identity.runId, outputKey, operationId }).slice(0, 32);
        state.outputDecision = immutable({ actionRef: { kind: 'native_rp_output', controlId: identity.controlId },
            targetRef: { kind: 'rp_chat', controlId: identity.controlId, outputKey }, inputRef, inputHash: hash(inputRef),
            capability: 'chat.output', grantDigest: state.decision.grantDigest, endpointBindingDigest: hash({ domain: 'rp_chat', controlId: identity.controlId }),
            risk: 'R2', requiresApproval: false, egressDigest: hash({ domain: 'local_chat', controlId: identity.controlId, outputKey }),
            budgetEnvelopeDigest: hash(state.selected.resolved.route.executionPolicy.computeBudget),
            dispatchPolicy: { idempotency: 'domain_key', operationKey: operationId, reconcile: 'domain_status' } });
        return immutable({ runId: identity.runId, attemptId: state.outputAttemptId, effectId: state.outputEffectId, decision: state.outputDecision,
            limits: state.selected.resolved.route.executionPolicy.computeBudget, requestId: state.request.requestId, payloadBytes: Buffer.byteLength(JSON.stringify(current.payload), 'utf8') });
    }

    async registerRpOutputClaim({ handle, capture, dispatchToken }) {
        const identity = inspectNativeRpOutputIdentity(capture, { handle, rpControl: this.owner.rpControl }), saved = outputCaptures.get(capture), { state } = saved;
        const root = await saved.execution.runs.get(handle, identity.runId);
        const intent = await saved.execution.runs.engine.withTransaction(handle, tx => readEffect(tx, handle, root, state.outputEffectId));
        if (!dispatchToken || intent.doc.dispatchToken !== dispatchToken || intent.doc.status !== 'dispatching'
            || !equal(effectDecision(intent.doc), state.outputDecision)) fail('native_rp_output_denied');
        state.outputDispatchToken = dispatchToken;
    }

    async authorizeRpOutputCompletion({ handle, tx, capture }) {
        const identity = inspectNativeRpOutputIdentity(capture, { handle, rpControl: this.owner.rpControl }), saved = outputCaptures.get(capture);
        const { state, execution } = saved;
        if (this.#runs.get(identity.runId) !== state || !state.outputPublishing || !state.outputAttemptId || !state.outputEffectId
            || hash(saved.result) !== saved.resultHash) fail('native_rp_output_denied');
        const root = await execution.runs.get(handle, identity.runId), fence = await execution.runs.engine.nativeHostLifecycle.assertWriter(handle, tx);
        if (root.cancelRequested || root.status !== 'running' || root.epoch !== saved.proof.epoch
            || root.hostBootId !== fence.hostBootId || root.hostGeneration !== fence.generation
            || !equal(root.sourceBinding, state.sourceBinding) || !equal(root.planRef, state.selected.binding.planRef)
            || root.pendingEffectRefs.length || root.pendingApprovalRefs.length) fail('native_rp_output_stale');
        const published = await readRpNarrationResult(tx, handle, root);
        const output = (await readAttempt(tx, handle, root, state.outputAttemptId)).doc;
        const effect = (await readEffect(tx, handle, root, state.outputEffectId)).doc;
        if (!published || published.record.payload !== saved.result.generated.response.text || published.producer.attemptId !== state.attemptId
            || output.status !== 'running' || output.epoch !== root.epoch || output.nodeId !== root.graph.outputContract.ownerNodeId
            || output.effectiveGrantDigest !== state.decision.grantDigest || !equal(output.inputRefs, [state.narrationResultRef])
            || output.inputDigest !== hash([state.narrationResultRef]) || !equal(output.effectRefs, [state.outputEffectId]) || output.resultRefs.length
            || effect.status !== 'confirmed' || effect.nodeAttemptId !== output.attemptId || effect.epoch !== root.epoch
            || !equal(effectDecision(effect), state.outputDecision) || effect.dispatchToken !== state.outputDispatchToken) fail('native_rp_output_denied');
        // Before consulting Binding, resolve original source removal explicitly.
        const context = await RpRunControl.prototype.context.call(this.owner.rpControl, handle, identity.controlId, identity.sourceRequest.source, { tx });
        if (context.prefixDigest !== identity.prefixDigest) fail('native_rp_output_stale');
        const control = await RpRunControl.prototype.status.call(this.owner.rpControl, handle, identity.controlId, { tx });
        const chat = await tx.getResource({ kind: 'chat', handle, ...control.locator });
        if (chat?.body.length !== identity.sourceRequest.source.input.floor + 2) fail('native_rp_output_stale');
        const outputKey = rpNativeOutputKey(identity.controlId, identity.sourceRequest.source), operationId = rpNativeOutputOperationId(outputKey);
        const observed = await ChatRepo.prototype.observeNativeOutput.call(this.owner.rpControl._chatRepo, handle,
            { controlId: identity.controlId, outputKey, operationId }, { tx });
        const original = control.outputReceipts[outputKey];
        if (original?.status !== 'committed' || observed.status !== 'committed' || hash(original.domainReceipt) !== hash(observed.receipt)) fail('native_rp_output_stale');
        const selected = await this.#selection(state.host, handle, state.input);
        if (!equal(selected.binding, state.selected.binding) || selected.configDigest !== state.selected.configDigest
            || selected.child?.configDigest !== state.selected.child?.configDigest || selected.planner?.configDigest !== state.selected.planner?.configDigest
            || selected.chain?.configDigest !== state.selected.chain?.configDigest || selected.review?.configDigest !== state.selected.review?.configDigest
            || selected.judge?.configDigest !== state.selected.judge?.configDigest
            || !equal(selected.judge?.candidates.map(item => item.configDigest) ?? [], state.selected.judge?.candidates.map(item => item.configDigest) ?? [])) fail('native_orchestration_source_stale');
        inspectNativeRpOutputIdentity(capture, { handle, host: state.host, rpControl: this.owner.rpControl });
        return { allowed: true, runId: root.runId, epoch: root.epoch, rootStamp: hash(root), resultRef: state.narrationResultRef,
            grantDigest: state.decision.grantDigest, sourceBindingDigest: root.sourceBinding.bindingDigest, outputAttemptId: state.outputAttemptId,
            modelEffectId: state.effectId, outputEffectId: state.outputEffectId, domainReceipt: original.domainReceipt };
    }

    async authorizeDelegation({ handle, tx, parent, parentAttempt, childPlan, inputRefs, effectiveGrantDigest, budgetCeiling, phase }) {
        const state = this.#runs.get(parent.runId);
        if (!state?.parentDelegation || state.handle !== handle || !['handoff', 'confirm_budget'].includes(phase)
            || parent.cancelRequested || parent.status !== 'running' || parent.epoch !== state.parentEpoch
            || parentAttempt.attemptId !== state.attemptId || parentAttempt.epoch !== parent.epoch
            || parentAttempt.effectiveGrantDigest !== state.parentGrantDigest || parentAttempt.effectRefs.length || parentAttempt.resultRefs.length
            || parentAttempt.status !== (phase === 'handoff' ? 'running' : 'waiting_child')
            || !equal(parent.planRef, state.selected.binding.planRef) || !equal(parent.sourceBinding, state.sourceBinding)
            || !equal(childPlan, state.selected.child.plan) || !equal(inputRefs, state.childInputRefs)
            || effectiveGrantDigest !== state.childGrantDigest || !equal(budgetCeiling, state.selected.child.resolved.route.executionPolicy.computeBudget))
            fail('native_orchestration_delegation_denied');
        if (phase === 'confirm_budget' && state.activeChildCapture)
            await inspectNativeRpDelegation(state.activeChildCapture, { host: state.host, handle, tx });
        else await this.#current(state);
        await BudgetPort.prototype.assertCurrent.call(this.#execution().budgetPort, handle, parent.budgetAuthorityRef, { tx });
        return { allowed: true, effectiveGrantDigest: state.childGrantDigest, parentGrantDigest: state.parentGrantDigest,
            budgetCeilingDigest: hash(budgetCeiling), sourceBindingDigest: parent.sourceBinding.bindingDigest };
    }

    async verifySend({ handle, root, intent, resolved, snapshot, compiledBinding }) {
        await this.authorize({ handle, root, intent });
        const state = this.#runs.get(root.runId);
        const selected = state.activeSelection ?? state.selected;
        if (configuration(resolved) !== selected.configDigest || snapshot.requestId !== state.request.requestId
            || snapshot.runtimeRouteId !== selected.pin.resourceRef.runtimeRouteId
            || compiledBinding.fingerprint !== snapshot.diagnostics.compiledBinding.fingerprint) fail();
        const expected = await state.contextPort.provider(handle, { context: state.context }).buildRequestContextPlan(state.request, resolved);
        if (!equal(expected, snapshot.contextPlan)) fail('native_orchestration_rp_context_mismatch');
    }

    async authorizeTaskLocalOutput({ handle, tx, capture, phase, identity, publication }) {
        if (!['prepare', 'publish'].includes(phase)) fail();
        const current = await (phase === 'prepare' ? inspectNativeRpDelegation : inspectNativeRpDelegationOutput)(capture,
            { host: this.#ownerHost(capture), handle, rpControl: this.owner.rpControl, tx });
        const state = this.#runs.get(current.parentRunId);
        if (!state?.parentDelegation || state.activeChildCapture !== capture || state.handle !== handle
            || state.attemptId !== current.parentAttemptId || state.parentEpoch !== current.parentEpoch
            || state.childGrantDigest !== current.grantDigest || state.parentGrantDigest !== current.parentGrantDigest
            || !equal(identity, { childRunId: current.childRunId, parentRunId: current.parentRunId,
                parentAttemptId: current.parentAttemptId, childEpoch: current.childEpoch, parentEpoch: current.parentEpoch })) fail();
        const selected = await this.#selection(state.host, handle, state.input);
        if (!equal(selected.binding, state.selected.binding) || selected.configDigest !== state.selected.configDigest
            || selected.child?.configDigest !== state.selected.child?.configDigest) fail('native_orchestration_source_stale');
        const saved = await readResultPublication(tx, handle, current.root, publication.resultRef.resultId);
        if (!saved || !equal(publication, { status: 'published', resultRef: saved.receipt.resultRef,
            publicationReceiptRef: { runId: current.childRunId, receiptId: saved.receipt.receiptId } })
            || saved.receipt.epoch !== current.childEpoch || saved.receipt.producerGrantDigest !== current.grantDigest
            || saved.record.envelope.audienceConstraint.grantDigest !== state.parentGrantDigest) fail();
        // Re-read original source and lineage after the last bank/Plan awaits.
        const final = await (phase === 'prepare' ? inspectNativeRpDelegation : inspectNativeRpDelegationOutput)(capture,
            { host: state.host, handle, rpControl: this.owner.rpControl, tx });
        if (!equal(final.root, current.root) || !equal(final.parentRoot, current.parentRoot)) fail('native_orchestration_parent_stale');
        const inputRefs = [saved.receipt.resultRef];
        return { inputRefs, inputDigest: hash(inputRefs), effectiveGrantDigest: state.childGrantDigest, budgetRef: current.root.budgetAuthorityRef };
    }

    #ownerHost(capture) {
        const state = delegationCaptures.get(capture);
        if (!state || state.owner !== this.owner) fail();
        return state.host;
    }

    async authorizeRpReturn({ handle, tx, capture }) {
        const state = returnCaptures.get(capture);
        if (!state || state.owner !== this.owner || state.parentState.phase !== 'waiting_child'
            || this.#runs.get(state.identity.parentRunId) !== state.parentState) fail('native_orchestration_return_denied');
        const current = await inspectNativeRpReturn(capture, { host: state.host, handle, rpControl: this.owner.rpControl, tx });
        return { allowed: true, parentGrantDigest: current.parentGrantDigest, childGrantDigest: current.childGrantDigest,
            sourceBindingDigest: current.sourceBinding.bindingDigest, parentInputDigest: current.parentInputDigest,
            resultRef: current.resultRef, outputReceiptRef: current.outputReceiptRef, controlToken: current.handoff.controlToken };
    }

    async authorizeParentResult({ handle, tx, capture }) {
        const state = returnCaptures.get(capture);
        if (!state || state.owner !== this.owner || state.parentState.phase !== 'resumed'
            || this.#runs.get(state.identity.parentRunId) !== state.parentState) fail('native_orchestration_result_consume_denied');
        const current = await inspectNativeRpReturn(capture, { host: state.host, handle, rpControl: this.owner.rpControl, tx });
        return { allowed: true, grantDigest: current.parentGrantDigest, inputDigest: current.parentInputDigest,
            resultRef: current.resultRef, sourceBindingDigest: current.sourceBinding.bindingDigest };
    }

    async authorizeGraphResult({ handle, tx, capture, root, phase, effectId, producer, resultRef }) {
        const state = this.#runs.get(root.runId);
        const identity = inspectNativeRpGenerationIdentity(capture, { host: state?.host, handle, rpControl: this.owner.rpControl });
        if (!state?.selected.chain || state.capture !== capture || state.handle !== handle || state.graphRunId !== root.runId
            || !equal(root.planRef, state.selected.binding.planRef) || !equal(root.sourceBinding, state.sourceBinding)) fail('native_orchestration_result_consume_denied');
        checkCancellation(identity.signal); await this.#current(state);
        if (phase === 'publish') {
            if (!(state.selected.judge?.candidates ?? [state.selected.chain]).includes(state.activeSelection) || producer.attemptId !== state.attemptId || effectId !== state.effectId
                || producer.nodeId !== state.activeSelection.node.nodeId || producer.effectiveGrantDigest !== state.decision.grantDigest) fail('native_orchestration_result_not_publishable');
            return { allowed: true, grantDigest: state.decision.grantDigest };
        }
        const accepted = state.activeSelection === state.selected.judge ? state.candidateResults?.map(item => item.resultRef) : [state.graphResultRef];
        if (phase !== 'consume' || state.activeSelection && ![state.selected.review, state.selected.judge].includes(state.activeSelection)
            || !accepted?.some(ref => ref && equal(ref, resultRef))) fail('native_orchestration_result_consume_denied');
        const recipient = (await readAttempt(tx, handle, root, state.attemptId)).doc;
        const intent = (await readEffect(tx, handle, root, state.effectId)).doc;
        if (recipient.nodeId !== (state.activeSelection ?? state.selected).node.nodeId || recipient.effectiveGrantDigest !== state.decision.grantDigest
            || !['running', 'waiting_effect'].includes(recipient.status) || !recipient.inputRefs.some(ref => equal(ref, resultRef))
            || intent.nodeAttemptId !== recipient.attemptId || intent.capability !== 'generation.send' || intent.epoch !== root.epoch
            || !['prepared', 'ready', 'dispatching', 'confirmed'].includes(intent.status) || !equal(effectDecision(intent), state.decision)) fail('native_orchestration_result_consume_denied');
        checkCancellation(identity.signal);
        return { allowed: true, recipient };
    }

    verifyObservation(args) {
        if (args.observation.reasonCode === 'rp_output_reconciled')
            return verifyRpOutputReconciliation(this.#execution(), this.owner.rpControl, args);
        const state = this.#runs.get(args.root.runId); if (!state) fail();
        return args.intent.effectId === state.outputEffectId ? state.outputPort.verifyObservation(args) : this.#port(state.host).verifyObservation(args);
    }

    reconcileOutput(handle, request) { return reconcileRpOutputEffect(this.#execution(), this.owner.rpControl, handle, request); }

    #input(value) {
        fields(value, ['controlId', 'floor', 'requestId', 'routeRef'], 'RP generation');
        assertNativeId(value.controlId, 'rpControl');
        fields(value.routeRef, ['scope', 'runtimeRouteId'], 'RP route');
        if (value.routeRef.scope !== 'player' || !Number.isSafeInteger(value.floor) || value.floor < 0
            || typeof value.requestId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(value.requestId)) fail();
        return immutable(value);
    }

    async #review(host, handle, input, { requireOutput = false } = {}) {
        const selected = await this.#selection(host, handle, input), control = this.owner.rpControl;
        if (requireOutput && selected.plan.definition.outputContract.kind !== 'rp_narration') fail('native_orchestration_rp_output_unavailable');
        const current = await RpRunControl.prototype.status.call(control, handle, input.controlId);
        const chat = await ChatRepo.prototype.get.call(control._chatRepo, handle, current.locator.charDir, current.locator.name, current.locator);
        const message = chat?.body[input.floor];
        if (!message?.is_user || message.is_system || input.floor !== chat.body.length - 1) fail('native_orchestration_rp_input_required');
        const sourceRequest = { domain: 'rp_chat', controlId: input.controlId, source: {
            input: rpOperationInput(message, input.floor), purpose: 'narration', outputSlot: 'assistant' } };
        const context = await RpRunControl.prototype.context.call(control, handle, input.controlId, sourceRequest.source);
        const review = immutable({ schemaVersion: 1, hostBootId: this.owner.engine.nativeHostLifecycle.hostBootId,
            input, sourceDigest: context.prefixDigest, bindingRef: { bindingId: selected.binding.bindingId, version: selected.binding.version },
            planRef: selected.binding.planRef, configurationFingerprint: hash({ parent: selected.configDigest, child: selected.child?.configDigest ?? null,
                ...(selected.planner ? { planner: selected.planner.configDigest } : {}), ...(selected.chain ? { draft: selected.chain.configDigest } : {}), ...(selected.review ? { review: selected.review.configDigest } : {}),
                ...(selected.judge ? { judge: selected.judge.configDigest, candidates: selected.judge.candidates.map(item => item.configDigest) } : {}) }),
            budget: selected.resolved.route.executionPolicy.computeBudget,
            childBudget: selected.child?.resolved.route.executionPolicy.computeBudget ?? null,
            effects: ['explicit_paid_model_generation', ...(selected.planner ? ['explicit_paid_planner_generation', 'bounded_graph_patch_proposal'] : []),
                ...(selected.chain ? ['explicit_paid_graph_draft_generation', 'same_source_result_reference'] : []),
                ...(selected.judge ? ['explicit_paid_candidate_generation', 'explicit_paid_quality_selection'] : []),
                ...(selected.review ? ['explicit_paid_quality_review_generation', 'bounded_local_rerun'] : []), 'original_rp_assistant_output'], outputContract: selected.plan.definition.outputContract });
        return { selected, control, sourceRequest, context, review };
    }

    async preflight(host, handle, value) {
        return (await this.#review(host, handle, this.#input(value), { requireOutput: true })).review;
    }

    async start(host, handle, value, { signal, expectedPreflightFingerprint } = {}) {
        const input = this.#input(value), key = 'rp:' + input.controlId + ':' + input.requestId;
        if (expectedPreflightFingerprint !== undefined) {
            if (typeof expectedPreflightFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(expectedPreflightFingerprint)) fail('native_orchestration_rp_review_required');
            // A known original operation is observation-only, including after
            // output has advanced the chat. It cannot mint another send scope.
            for (const operation of this.scheduler.operations.values()) if (operation.owner === handle && operation.key === key) {
                await this.#plans().getBinding(handle, { domain: 'rp_chat', controlId: input.controlId });
                if (operation.fingerprint !== hash(input) || operation.rpReviewFingerprint !== expectedPreflightFingerprint) fail('native_orchestration_rp_request_conflict');
                return operation.handle ?? Object.freeze({ operationId: operation.view.operationId });
            }
        }
        const { selected, control, sourceRequest, context, review } = await this.#review(host, handle, input, { requireOutput: expectedPreflightFingerprint !== undefined });
        if (expectedPreflightFingerprint !== undefined && expectedPreflightFingerprint !== hash(review)) fail('native_orchestration_rp_review_stale');
        const request = immutable({ requestId: input.requestId, role: 'narrator', routeRef: input.routeRef });
        const resources = [...new Set([...await host.executionResources(handle, selected.resolved.route),
            ...(selected.planner ? await host.executionResources(handle, selected.planner.resolved.route) : []),
            ...(selected.chain ? await host.executionResources(handle, selected.chain.resolved.route) : []),
            ...(selected.review ? await host.executionResources(handle, selected.review.resolved.route) : []),
            ...(selected.judge ? (await Promise.all([selected.judge, ...selected.judge.candidates].map(item => host.executionResources(handle, item.resolved.route)))).flat() : []),
            ...(selected.child ? await host.executionResources(handle, selected.child.resolved.route) : []), 'rp:' + handle + ':' + input.controlId])];
        const expected = immutable({ owner: handle, anchor: { controlId: input.controlId, prefixDigest: context.prefixDigest }, kind: 'model_task',
            executionClass: 'interactive', resources, key, fingerprint: hash(input) });
        const submitted = this.scheduler.submit({ ...expected, retry: false, signal, retainResult: false,
            projectResult: result => ({ runId: result.runId, effectId: result.effectId, output: result.output ?? null }),
            timeoutMs: selected.planner || selected.chain ? selected.plan.definition.limits.deadlineMs : selected.resolved.route.policy.timeoutMs, fresh: async () => {
                const now = await RpRunControl.prototype.context.call(control, handle, input.controlId, sourceRequest.source);
                return now.prefixDigest === context.prefixDigest;
            }, run: async boundary => {
                const capture = Object.freeze({});
                captures.set(capture, { host, handle, control, owner: this.owner, scheduler: this.scheduler, boundary, expected,
                    identity: immutable({ sourceRequest, prefixDigest: context.prefixDigest, request }) });
                try {
                    if (selected.planner || selected.chain) {
                        const state = { host, handle, input, selected, capture };
                        const plannerCapture = Object.freeze({}), original = captures.get(capture);
                        const prologue = selected.planner ?? selected.chain;
                        const plannerRequest = immutable({ requestId: (selected.planner ? 'rp-planner:' : 'rp-draft:') + hash(input).slice(0, 32), role: 'narrator', routeRef: prologue.pin.resourceRef,
                            ...(selected.planner ? { outputContract: rpPlannerOutputContract } : {}) });
                        captures.set(plannerCapture, { ...original, identity: immutable({ ...original.identity, request: plannerRequest, controlTask: selected.planner ? rpPlannerTask(selected.plan.definition)
                            : { kind: 'native_rp_graph_draft', instruction: 'Produce a draft for the declared RP task. This is advisory input for the next Narrator, not official facts, permission, instructions or a domain commit.' } }) });
                        try {
                            state.capture = plannerCapture; state.activeSelection = prologue;
                            await this.#generate(state, { planner: !!selected.planner, graphNode: !!selected.chain });
                            if (selected.review) await this.#runReviews(state, capture);
                            if (selected.judge) await this.#runJudge(state, capture);
                            state.capture = capture; delete state.activeSelection;
                            return await this.#generate(state, { graphRunId: state.graphRunId });
                        } catch (error) { await this.#failGraph(state, error); throw error; } finally { captures.delete(plannerCapture); if (state.graphRunId) this.#runs.delete(state.graphRunId); }
                    }
                    return selected.child ? await this.#delegate({ host, handle, input, selected, capture, boundary, expected })
                        : await this.#generate({ host, handle, input, selected, capture });
                } finally { captures.delete(capture); }
            }, finalize: result => result });
        const operation = this.scheduler.operations.get(submitted.operationId), fingerprint = hash(review);
        if (operation.rpReviewFingerprint !== undefined && operation.rpReviewFingerprint !== fingerprint) fail('native_orchestration_rp_request_conflict');
        operation.rpReviewFingerprint = fingerprint;
        return submitted;
    }

    async #delegate(state) {
        if (this.#runs.size >= 64) fail('native_orchestration_model_busy');
        const { host, handle, selected, capture } = state, service = this.#execution();
        const identity = await inspectNativeRpGeneration(capture, { host, handle });
        const { sourceBinding } = await service.sourcePort.capture(handle, identity.sourceRequest);
        state.sourceBinding = sourceBinding; state.parentDelegation = true; state.phase = 'delegating';
        const parentInput = { kind: 'native_rp_delegation', sourceRef: sourceBinding.sourceRef, requestId: state.input.requestId,
            bindingRef: { bindingId: selected.binding.bindingId, version: selected.binding.version }, planRef: selected.binding.planRef,
            nodeId: selected.node.nodeId, childPlanRef: selected.child.planRef };
        state.parentGrantDigest = hash({ owner: handle, parentInput, sourceBindingDigest: sourceBinding.bindingDigest });
        state.parentInputRefs = immutable([parentInput]); state.parentInputDigest = hash(state.parentInputRefs);
        state.childInputRefs = [immutable({ kind: 'rp_delegated_user_input', sourceRef: sourceBinding.sourceRef,
            input: identity.sourceRequest.source.input, taskPurpose: 'original_rp_delegated_text' })];
        state.childGrantDigest = hash({ parentGrantDigest: state.parentGrantDigest, childPlanRef: selected.child.planRef,
            inputRefs: state.childInputRefs, sourceBindingDigest: sourceBinding.bindingDigest });
        const commandIdentity = { controlId: identity.sourceRequest.controlId, input: identity.sourceRequest.source.input, requestId: state.input.requestId };
        const started = await service.runs.start(handle, controlCommandId('native.rp.start', commandIdentity), {
            planRef: selected.binding.planRef, sourceRequest: identity.sourceRequest, retentionPolicyRef: { policyId: 'retain_native_rp_until_explicit_release' } });
        let root = await service.runs.get(handle, started.runId);
        state.parentRunId = root.runId;
        if (root.status !== 'admitted' || root.attemptRefs.length) fail('native_orchestration_rp_request_replayed');
        state.parentEpoch = root.epoch; this.#runs.set(root.runId, state);
        try {
            const { attemptId } = await service.runs.beginAttempt(handle, controlCommandId('native.rp.attempt', commandIdentity), {
                ...runGuard(root), nodeId: selected.node.nodeId, inputRefs: [parentInput], inputDigest: hash([parentInput]),
                effectiveGrantDigest: state.parentGrantDigest, budgetRef: root.budgetAuthorityRef });
            state.attemptId = attemptId;
            await new AttemptController({ runs: service.runs, authorizeAttempt: args => this.authorize(args) })
                .activate(handle, { ...runGuard(await service.runs.get(handle, root.runId)), attemptId });
            root = await service.runs.get(handle, root.runId);
            const delegated = await service.delegates.handoff(handle, { ...runGuard(root), parentAttemptId: attemptId,
                delegationId: 'original_rp_text_child', childPlanRef: selected.child.planRef, inputRefs: state.childInputRefs,
                inputDigest: hash(state.childInputRefs), effectiveGrantDigest: state.childGrantDigest,
                returnContract: selected.child.plan.definition.outputContract, budgetCeiling: selected.child.resolved.route.executionPolicy.computeBudget });
            const { childRunId } = delegated.outcome;
            await service.reserveChild(handle, { parentRunId: root.runId, childRunId,
                ceiling: selected.child.resolved.route.executionPolicy.computeBudget, limits: selected.resolved.route.executionPolicy.computeBudget });
            await service.delegates.confirmBudget(handle, runGuard(await service.runs.get(handle, childRunId)));
            const childResources = [...await host.executionResources(handle, selected.child.resolved.route), 'rp:' + handle + ':' + identity.sourceRequest.controlId];
            const childExpected = { owner: handle, anchor: state.expected.anchor, kind: 'model_task', executionClass: 'interactive',
                resources: childResources, key: 'rp-child:' + childRunId, fingerprint: hash({ childRunId, childPlanRef: selected.child.planRef }) };
            state.phase = 'waiting_child';
            const childResult = await NativeTaskScheduler.prototype.withResourceHandoff.call(this.scheduler, state.boundary, state.expected, {
                ...Object.fromEntries(['kind', 'executionClass', 'resources', 'key', 'fingerprint'].map(key => [key, childExpected[key]])),
                fresh: async () => {
                    const current = await RpRunControl.prototype.context.call(this.owner.rpControl, handle, identity.sourceRequest.controlId, identity.sourceRequest.source);
                    return current.prefixDigest === identity.prefixDigest;
                }, run: boundary => this.#generateChild(state, { childRunId, childExpected, boundary, identity, parentRunId: root.runId }), finalize: value => value });
            if (childResult.status !== 'pending_return') return childResult;
            const child = await service.runs.get(handle, childRunId), returnCapture = Object.freeze({});
            state.returnCapture = returnCapture;
            returnCaptures.set(returnCapture, { owner: this.owner, host, handle, control: this.owner.rpControl, service, parentState: state,
                assertCurrent: () => this.#baseCurrent(state), identity: immutable({ sourceRequest: identity.sourceRequest,
                    prefixDigest: identity.prefixDigest, sourceBinding, parentRunId: root.runId, parentAttemptId: attemptId,
                    parentPlanRef: selected.binding.planRef, childPlanRef: selected.child.planRef,
                    parentEpoch: state.parentEpoch, childRunId, childEpoch: child.epoch, parentGrantDigest: state.parentGrantDigest,
                    childGrantDigest: state.childGrantDigest, parentInputRefs: state.parentInputRefs, parentInputDigest: state.parentInputDigest,
                    resultRef: childResult.resultRef, outputClaimRef: childResult.outputClaimRef, outputReceiptRef: childResult.outputReceiptRef }) });
            try {
                const returned = await new HandoffReturnController({ host }).returnChild(handle, { capture: returnCapture });
                state.phase = 'resumed';
                const generated = await this.#generate(state, { continuation: returned });
                return { ...generated, delegation: { ...childResult, status: 'returned', returnReceiptRef: returned.returnReceiptRef } };
            } finally { returnCaptures.delete(returnCapture); delete state.returnCapture; }
        } finally { this.#runs.delete(root.runId); }
    }

    async #generateChild(parentState, { childRunId, childExpected, boundary, identity, parentRunId }) {
        const { host, handle } = parentState, service = this.#execution(), child = parentState.selected.child;
        const root = await service.runs.get(handle, childRunId), taskPurpose = 'original_rp_delegated_text';
        const request = immutable({ requestId: 'rp-child:' + hash({ parentRunId, childRunId }), role: 'narrator', routeRef: child.pin.resourceRef });
        const capture = Object.freeze({}), audience = { kind: 'task', id: childRunId };
        const logicalInputRef = { kind: 'native_rp_delegated_intent', role: 'narrator', requestId: request.requestId,
            sourceRef: root.sourceBinding.sourceRef, parentRunId, parentAttemptId: parentState.attemptId, childRunId,
            planRef: child.planRef, nodeId: child.node.nodeId, routeRef: child.pin.resourceRef, configDigest: child.configDigest, audience };
        const state = { host, handle, delegationCapture: capture, request, sourceBinding: root.sourceBinding,
            selected: { ...child, binding: { ...parentState.selected.binding, planRef: child.planRef } } };
        delegationCaptures.set(capture, { host, handle, control: this.owner.rpControl, owner: this.owner, scheduler: this.scheduler,
            boundary, expected: childExpected, service, expectedGraph: child.plan.definition, assertSelection: async () => {
                const current = await this.#selection(host, handle, parentState.input);
                if (!equal(current.binding, parentState.selected.binding) || current.configDigest !== parentState.selected.configDigest
                    || current.child?.configDigest !== child.configDigest) fail('native_orchestration_source_stale');
            }, identity: immutable({ sourceRequest: identity.sourceRequest, prefixDigest: identity.prefixDigest, request,
                parentRunId, parentAttemptId: parentState.attemptId, parentEpoch: parentState.parentEpoch, childRunId, childEpoch: root.epoch,
                sourceBinding: root.sourceBinding, grantDigest: root.parentRef.effectiveGrantDigest, inputRefs: root.parentRef.inputRefs,
                taskPurpose, childPlanRef: root.planRef }) });
        parentState.activeChildCapture = capture;
        state.decision = { actionRef: { kind: 'native_model_send', runtimeRouteId: child.resolved.route.runtimeRouteId },
            targetRef: { connectionProfileId: child.resolved.connection.connectionProfileId, modelProfileId: child.resolved.model.modelProfileId, pathFingerprint: child.resolved.pathFingerprint },
            inputRef: logicalInputRef, inputHash: hash(logicalInputRef), capability: 'generation.send', grantDigest: root.parentRef.effectiveGrantDigest,
            endpointBindingDigest: hash({ pathFingerprint: child.resolved.pathFingerprint, configDigest: child.configDigest }), risk: 'R1', requiresApproval: false,
            egressDigest: hash({ pathFingerprint: child.resolved.pathFingerprint, sourceBindingDigest: root.sourceBinding.bindingDigest, grantDigest: root.parentRef.effectiveGrantDigest, audience }),
            budgetEnvelopeDigest: hash(child.resolved.route.executionPolicy.computeBudget), dispatchPolicy: { idempotency: 'none', operationKey: null, reconcile: 'manual' } };
        this.#runs.set(childRunId, state);
        try {
            await this.#current(state);
            const { attemptId } = await service.runs.beginAttempt(handle, controlCommandId('native.rp.child.attempt', { childRunId }), {
                ...runGuard(root), nodeId: child.node.nodeId, inputRefs: root.parentRef.inputRefs, inputDigest: root.parentRef.inputDigest,
                effectiveGrantDigest: state.decision.grantDigest, budgetRef: root.budgetAuthorityRef });
            state.attemptId = attemptId;
            await new AttemptController({ runs: service.runs, authorizeAttempt: args => this.authorize(args) })
                .activate(handle, { ...runGuard(await service.runs.get(handle, childRunId)), attemptId });
            const effectId = 'oeffect_' + hash({ runId: childRunId, attemptId, taskPurpose }).slice(0, 32); state.effectId = effectId;
            await service.effects.prepare(handle, { ...runGuard(await service.runs.get(handle, childRunId)), effectId, nodeAttemptId: state.attemptId,
                proposal: Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, state.decision[key]])) });
            state.contextPort = new ContextPort({ rpControl: this.owner.rpControl, rpDelegationCapture: capture, authorizeContext: async ({ request }) => {
                await this.#current(state);
                if (request.taskPurpose !== taskPurpose || !equal(request.audience, audience) || request.grantDigest !== state.decision.grantDigest
                    || !equal(request.sourceBinding, root.sourceBinding) || !equal(request.inputRefs, root.parentRef.inputRefs)) fail('native_orchestration_context_denied');
                return { allowed: true, grantDigest: state.decision.grantDigest };
            } });
            const contextRequest = { ownerRef: { handle }, sourceBinding: root.sourceBinding, audience, taskPurpose, grantDigest: state.decision.grantDigest,
                inputRefs: root.parentRef.inputRefs, tokenBudget: { modelContextLimit: child.resolved.model.limits.contextTokens, responseReserve: effectiveOutputReserve(child.resolved) } };
            // The original operation retains its parent bank ceiling. The exact
            // child Route allocation is enforced by its held reservation.
            const limits = parentState.selected.resolved.route.executionPolicy.computeBudget;
            const send = await service.generationSend(handle, { runId: childRunId, effectId, reservationId: childRunId, limits });
            const compiled = await compileNativeContextMetered({ handle, port: state.contextPort, request: contextRequest, bank: send.bank,
                budgetPort: service.budgetPort, root: await service.runs.get(handle, childRunId), effectId, limits,
                workDescriptor: { requestId: request.requestId, pathFingerprint: child.resolved.pathFingerprint }, assertCurrent: () => this.#current(state), signal: boundary.signal });
            state.context = compiled.compiled; await send.bindContext({ port: state.contextPort, compiled: state.context, compileProof: compiled.proof });
            const scope = this.#issueScope(host, handle, { runId: childRunId, effectId, request, logicalInputRef, logicalInputHash: state.decision.inputHash,
                nativeRpDelegationCapture: capture, options: { scheduled: true, orchestrationSend: send }, revalidateConsume: async ({ tx } = {}) => {
                    await inspectNativeRpDelegation(capture, { host, handle, ...(tx ? { tx } : {}) });
                    await service.sourcePort.revalidate(handle, root.sourceBinding, tx ? { tx } : undefined);
                    await state.contextPort.revalidate(handle, { context: state.context, phase: 'consume' });
                } });
            const port = this.#port(host), result = await port.generate(handle, scope, { signal: boundary.signal });
            const published = await new ResultController({ host, modelPort: port }).publishModelResult(handle, { capture, result, effectId });
            const output = await new TaskLocalOutputController({ host }).complete(handle, { capture, publication: published });
            return { ...output, status: output.status === 'completed' ? 'pending_return' : output.status,
                parentRunId, parentAttemptId: parentState.attemptId, childRunId, effectId,
                receiptRef: result.receiptRef, resultRef: published.resultRef, publicationReceiptRef: published.publicationReceiptRef };
        } finally { this.#runs.delete(childRunId); delegationCaptures.delete(capture); delete parentState.activeChildCapture; }
    }

    async #failGraph(state, error) {
        if (!state.graphRunId) return;
        const { runs, budgetPort } = this.#execution(), { handle } = state, runId = state.graphRunId;
        const root = await runs.get(handle, runId);
        if (root.cancelRequested || !['admitted', 'running', 'waiting_approval'].includes(root.status) || root.outputClaims.length) return;
        const reasonCode = /^native_[a-z0-9_]+$/.test(error.code ?? '') ? error.code : 'native_orchestration_graph_execution_failed';
        await runs.control(handle, controlCommandId('graph.execution.fail', runId), { ...runGuard(root), operation: 'graph.execution.fail', detail: { reasonCode } }, async ({ tx, root: active, now }) => {
            const effectIds = [];
            for (const id of active.attemptRefs) effectIds.push(...(await readAttempt(tx, handle, active, id)).doc.effectRefs);
            const costs = effectIds.length ? await budgetPort.observeEffectClosure(handle, { authorityRef: active.budgetAuthorityRef, effectIds }, { tx }) : null;
            active.status = active.pendingEffectRefs.length || effectIds.length && !costs?.closed ? 'reconciling' : 'blocked';
            const receiptId = 'oreceipt_' + hash({ kind: 'rp_graph_failure', runId }).slice(0, 32);
            const receipt = { schemaVersion: 1, receiptKind: 'rp_graph_failure', receiptId, runId, epoch: active.epoch, reasonCode,
                status: active.status, effectIds, costs, decisionSeq: active.eventSeq + 1, createdAt: now };
            await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receiptId), receipt);
            return { root: active, eventType: 'graph_execution_failed', reasonCode, outcome: { status: active.status, receiptRef: { runId, receiptId } } };
        });
    }

    #controlWork(state, { root, send, limits, signal }, workRows) {
        const { handle } = state, service = this.#execution(), runId = root.runId;
        const assertCurrent = async () => {
            await this.#current(state);
            const current = await service.runs.get(handle, runId);
            if (current.cancelRequested || current.status !== 'running' || current.epoch !== root.epoch || current.hostBootId !== root.hostBootId
                || current.hostGeneration !== root.hostGeneration) fail('native_orchestration_control_stale');
        };
        return async (kind, value, operation) => {
            const attempt = { attemptId: send.bank.nextLocalWorkAttemptId(), requestId: state.request.requestId, kind, estimatedItems: 1,
                estimatedInputBytes: Buffer.byteLength(JSON.stringify(value)), targetFingerprint: hash({ runId, effectId: state.effectId, kind, inputHash: hash(value) }) };
            let row;
            const output = await runGenerationLocalWork({ signal, attempt, requireAdmission: true, assertCurrent,
                admit: item => send.bank.chargeLocalWork(limits, item), settle: ({ attempt, usage }) => send.bank.settleLocalWork(attempt.attemptId, usage), onAdmitted: entry => { row = entry; } }, operation);
            const observed = await service.budgetPort.observeAttempt(handle, { kind: 'local_work', authorityRef: root.budgetAuthorityRef, effectId: state.effectId,
                localWorkOrdinal: row.orchestration.ordinal, attemptId: row.attemptId, reservationId: null });
            if (observed.status !== 'settled' || observed.usage?.outcome !== 'completed') fail('native_orchestration_control_work_unsettled');
            workRows.push({ kind, attemptId: observed.attemptId, ordinal: observed.orchestration.ordinal, targetFingerprint: attempt.targetFingerprint, rowHash: hash(observed) });
            return output;
        };
    }

    async #completePlanner(state, { root, port, result, send, limits, signal }) {
        const { handle } = state, service = this.#execution(), runId = root.runId;
        const proof = await port.inspectResultCompletion(handle, { result, runId, effectId: state.effectId });
        const workRows = [];
        const work = this.#controlWork(state, { root, send, limits, signal }, workRows);
        const parsed = await work('graph_control_parse', result.generated.response.text, async () => {
            const value = JSON.parse(result.generated.response.text); assertObject(value, ['operations'], 'Planner response');
            if (!Array.isArray(value.operations) || !value.operations.length) fail('native_orchestration_planner_response_invalid');
            return immutable(value);
        });
        const current = await service.runs.get(handle, runId);
        const patch = { schemaVersion: 1, patchId: 'opatch_' + hash({ runId, attemptId: state.attemptId }).slice(0, 32), runId,
            producerAttemptId: state.attemptId, expectedEpoch: current.epoch, expectedGraphRevision: current.graphRevision, operations: parsed.operations,
            reasonRefs: [{ kind: 'source', bindingDigest: current.sourceBinding.bindingDigest }], payloadHash: '' };
        patch.payloadHash = graphPatchHash(patch);
        const withAuthority = service.sourcePort.consumptionBoundary(handle, root.sourceBinding, { engine: service.runs.engine });
        const proposed = await work('graph_control_adopt', patch, () => service.runs.withSourceControl(handle, runId, () => new GraphController({ runs: service.runs,
            authorizePatch: async ({ root: active, producer, patch: requested }) => {
                await this.#current(state);
                const actual = await port.inspectResultCompletion(handle, { result, runId, effectId: state.effectId });
                if (actual.payloadHash !== proof.payloadHash || actual.producerAttemptId !== producer.attemptId || !equal(requested, patch)
                    || !equal(active.sourceBinding, state.sourceBinding)) fail('native_orchestration_planner_producer_denied');
            } }).propose(handle, { expectedStateVersion: current.stateVersion, patch }), { withAuthority }));
        const patchReceipt = proposed.outcome.patchReceipt;
        if (!patchReceipt.accepted) fail('native_orchestration_planner_patch_rejected');
        if (patchReceipt.requests.replan) fail('native_orchestration_planner_replan_pending');
        const receiptId = 'oreceipt_' + hash({ kind: 'rp_planner', runId, attemptId: state.attemptId }).slice(0, 32);
        await service.runs.withSourceControl(handle, runId, () => service.runs.control(handle, controlCommandId('rp.planner.settle', state.attemptId), {
            ...runGuard(current), expectedGraphRevision: patchReceipt.newGraphRevision, expectedStateVersion: proposed.outcome.versions.stateVersion,
            operation: 'attempt.settle', detail: { attemptId: state.attemptId, patchId: patch.patchId } }, async ({ tx, root: active, now }) => {
            await this.#current(state);
            const actual = await port.inspectResultCompletion(handle, { result, runId, effectId: state.effectId });
            const record = await readAttempt(tx, handle, active, state.attemptId);
            if (record.doc.status !== 'running' || actual.payloadHash !== proof.payloadHash || !equal(record.doc.effectRefs, [state.effectId])) fail('native_orchestration_planner_producer_denied');
            const receipt = { schemaVersion: 1, receiptKind: 'rp_planner', receiptId, runId, epoch: active.epoch, producerAttemptId: state.attemptId,
                sourceBindingDigest: active.sourceBinding.bindingDigest, modelEffectId: state.effectId, modelReceiptRef: proof.receiptRef,
                payloadHash: proof.payloadHash, patchId: patch.patchId, patchIntegrity: hash(patchReceipt), localWork: workRows, decisionSeq: active.eventSeq + 1, createdAt: now };
            await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receiptId), receipt);
            await writeAttemptSettlement({ tx, handle, root: active, record, outcome: 'completed', resultRefs: [], effectReceiptRefs: [proof.receiptRef.receiptId], reasonCode: 'rp_planner_patch_accepted', now });
            active.progress.steps++;
            return { root: active, eventType: 'rp_planner_patch_applied', reasonCode: 'rp_planner_patch_accepted', outcome: { receiptRef: { runId, receiptId } } };
        }), { withAuthority });
        state.plannerAttemptId = state.attemptId; state.prologueAttemptId = state.attemptId;
        return { runId, effectId: state.effectId, patchId: patch.patchId };
    }

    async #graphStepTransition(state, root, selected, inputRefs, grantDigest, { review = false, judge = false } = {}) {
        const service = this.#execution(), { handle } = state;
        const primary = review ? state.selected.review : state.selected.planner ?? state.selected.chain;
        const bindings = state.selected.judge ? judge
            ? state.candidateResults.map((item, index) => ({ edgeId: state.selected.judge.inputs[index].edgeId, producerAttemptId: item.attemptId }))
            : [{ edgeId: state.selected.judge.candidates[state.selectedCandidate].transfer.edgeId, producerAttemptId: state.prologueAttemptId },
                { edgeId: state.selected.judge.transfer.edgeId, producerAttemptId: state.judgeAttemptId }]
            : [{ edgeId: primary.transfer.edgeId, producerAttemptId: state.prologueAttemptId },
                ...(!review && state.selected.review ? [{ edgeId: state.selected.review.gate.edgeId, producerAttemptId: state.reviewAttemptId }] : [])];
        const traversed = await new TransitionController({ runs: service.runs, authorizeTransition: async ({ tx, root: active, target, producers }) => {
            await this.#current(state);
            if (state.selected.judge) {
                if (target.nodeId !== selected.node.nodeId || producers.length !== 2) fail('native_orchestration_graph_transition_denied');
                if (judge) {
                    for (const candidate of state.candidateResults) {
                        const producer = producers.find(item => item.attempt.attemptId === candidate.attemptId);
                        if (!producer || producer.receipt.reasonCode !== 'graph_result_published' || !equal(producer.receipt.resultRefs, [candidate.resultRef])) fail('native_orchestration_graph_transition_denied');
                    }
                } else {
                    const choice = await readRpJudgeCompletion(tx, handle, active, state.judgeAttemptId);
                    if (!choice || !equal(choice.receipt.selectedResultRef, state.graphResultRef)
                        || !equal(state.judgeReceiptRef, { runId: root.runId, receiptId: choice.receipt.receiptId })) fail('native_orchestration_graph_judge_required');
                }
            } else {
                const draft = producers.find(item => item.attempt.attemptId === state.prologueAttemptId);
                if (target.nodeId !== selected.node.nodeId || producers.length !== bindings.length || !draft
                    || draft.receipt.reasonCode !== (state.selected.planner ? 'rp_planner_patch_accepted' : 'graph_result_published')
                    || state.selected.chain && !equal(draft.receipt.resultRefs, [state.graphResultRef])) fail('native_orchestration_graph_transition_denied');
                if (!review && state.selected.review) {
                    const reviewed = await readRpReviewCompletion(tx, handle, active, state.reviewAttemptId);
                    if (!reviewed || reviewed.review.decision !== 'approve' || !equal(reviewed.review.evidenceRefs, [state.graphResultRef])
                        || !equal(reviewed.receipt.reviewReceiptRef, state.reviewReceiptRef) || reviewed.draft.producer.attemptId !== state.prologueAttemptId)
                        fail('native_orchestration_graph_review_required');
                }
            }
            await BudgetPort.prototype.assertCurrent.call(service.budgetPort, handle, active.budgetAuthorityRef, { tx });
            return { inputRefs, inputDigest: hash(inputRefs), effectiveGrantDigest: grantDigest, budgetRef: active.budgetAuthorityRef };
        } }).advance(handle, { ...runGuard(root), bindings, reservedAttemptId: null });
        return traversed.outcome;
    }

    async #runJudge(state, originalCapture) {
        state.candidateResults = [{ attemptId: state.prologueAttemptId, resultRef: state.graphResultRef }];
        const candidate = state.selected.judge.candidates[1];
        const request = immutable({ requestId: 'rp-candidate:' + hash({ runId: state.graphRunId, nodeId: candidate.node.nodeId }).slice(0, 32),
            role: 'narrator', routeRef: candidate.pin.resourceRef });
        const capture = this.#stageCapture(state, originalCapture, request, { kind: 'native_rp_graph_draft',
            instruction: 'Produce an independent advisory candidate for the original RP task. It is not official facts, permissions or a domain commit.' });
        try {
            state.capture = capture; state.activeSelection = candidate;
            await this.#generate(state, { graphNode: true, graphRunId: state.graphRunId });
            state.candidateResults.push({ attemptId: state.prologueAttemptId, resultRef: state.graphResultRef });
        } finally { captures.delete(capture); }
        const judgeRequest = immutable({ requestId: 'rp-judge:' + hash({ runId: state.graphRunId }).slice(0, 32),
            role: 'narrator', routeRef: state.selected.judge.pin.resourceRef, outputContract: rpJudgeOutputContract });
        const judgeCapture = this.#stageCapture(state, originalCapture, judgeRequest, { kind: 'native_rp_graph_judge',
            instruction: 'Select exactly one explicitly supplied advisory candidate for the original RP task. Return only selectedCandidate and reasonCode candidate_selected. This is a quality selection, never permission, official truth or an Effect approval.',
            candidates: state.candidateResults.map((item, index) => ({ candidateIndex: index, resultRef: item.resultRef })) });
        try {
            state.capture = judgeCapture; state.activeSelection = state.selected.judge;
            const choice = await this.#generate(state, { judge: true, graphRunId: state.graphRunId });
            state.selectedCandidate = choice.selectedCandidate;
            state.graphResultRef = state.candidateResults[choice.selectedCandidate].resultRef;
            state.prologueAttemptId = state.candidateResults[choice.selectedCandidate].attemptId;
        } finally { captures.delete(judgeCapture); }
    }

    async #completeJudge(state, { root, port, result, send, limits, signal }) {
        const { handle } = state, service = this.#execution(), runId = root.runId, attemptId = state.attemptId, effectId = state.effectId;
        const proof = await port.inspectResultCompletion(handle, { result, runId, effectId });
        const workRows = [], work = this.#controlWork(state, { root, send, limits, signal }, workRows), responseText = result.generated.response.text;
        const parsed = await work('graph_control_parse', responseText, async () => {
            if (Buffer.byteLength(responseText) > assertResultPolicy(root.graph.outputContract).maxBytes) fail('native_orchestration_judge_response_invalid');
            const value = JSON.parse(responseText); assertObject(value, ['selectedCandidate', 'reasonCode'], 'Judge response');
            if (![0, 1].includes(value.selectedCandidate) || value.reasonCode !== 'candidate_selected') fail('native_orchestration_judge_response_invalid');
            return immutable(value);
        });
        const candidateRefs = state.candidateResults.map(item => item.resultRef), selectedResultRef = candidateRefs[parsed.selectedCandidate];
        await work('graph_control_adopt', parsed, async () => {
            await this.#current(state);
            if (!equal(proof, await port.inspectResultCompletion(handle, { result, runId, effectId }))) fail('native_orchestration_judge_producer_denied');
        });
        const receiptId = rpJudgeReceiptId(runId, attemptId), withAuthority = service.sourcePort.consumptionBoundary(handle, root.sourceBinding, { engine: service.runs.engine });
        try {
            const saved = await service.runs.withSourceControl(handle, runId, () => service.runs.engine.withTransaction(handle, async tx => {
                let active, record;
                try {
                    active = await service.runs.get(handle, runId); record = await readAttempt(tx, handle, active, attemptId);
                    await this.#current(state);
                    if (active.cancelRequested || active.status !== 'running' || active.epoch !== proof.epoch || active.pendingEffectRefs.length
                        || record.doc.status !== 'running' || !equal(record.doc.effectRefs, [effectId]) || record.doc.resultRefs.length
                        || record.doc.nodeId !== state.selected.judge.node.nodeId || record.doc.effectiveGrantDigest !== state.decision.grantDigest
                        || !equal(proof, await port.inspectResultCompletion(handle, { result, runId, effectId }))) fail('native_orchestration_judge_producer_denied');
                    for (const ref of candidateRefs) if (!await readGraphNodeResult(tx, handle, active, ref.resultId, { recipient: record.doc })) fail('native_orchestration_judge_producer_denied');
                    await service.sourcePort.revalidate(handle, active.sourceBinding, { tx, root: active });
                    await service.budgetPort.assertCurrent(handle, active.budgetAuthorityRef, { tx });
                    await this.#current(state);
                    if (!equal(active, await service.runs.get(handle, runId))) return { denied: true };
                } catch (error) {
                    if (error instanceof ConflictError || error.code === 'native_rp_source_missing') return { denied: true };
                    throw error;
                }
                return service.runs.control(handle, controlCommandId('rp.judge.settle', attemptId), { ...runGuard(active), operation: 'attempt.settle', detail: { attemptId, selectedResultRef } }, async ({ tx, root: current, now }) => {
                    if (!equal(current, active) || current.progress.steps >= current.limits.maxSteps || now >= current.progress.deadlineAt) fail('native_orchestration_judge_producer_denied');
                    const receipt = { schemaVersion: 1, receiptKind: 'rp_graph_judge_model', receiptId, runId, epoch: current.epoch, producerAttemptId: attemptId,
                        sourceBindingDigest: current.sourceBinding.bindingDigest, grantDigest: record.doc.effectiveGrantDigest, modelEffectId: effectId,
                        modelReceiptRef: proof.receiptRef, modelPayloadHash: proof.payloadHash, responseText, candidateRefs, selectedResultRef,
                        localWork: workRows, decisionSeq: current.eventSeq + 1, createdAt: now };
                    await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receiptId), receipt);
                    await writeAttemptSettlement({ tx, handle, root: current, record, outcome: 'completed', resultRefs: [], effectReceiptRefs: [proof.receiptRef.receiptId], reasonCode: 'rp_graph_judge_selected', now });
                    current.progress.steps++;
                    return { root: current, eventType: 'rp_graph_judge_completed', reasonCode: 'candidate_selected', outcome: { judgeReceiptRef: { runId, receiptId } } };
                });
            }), { withAuthority });
            if (saved.denied) fail('native_orchestration_judge_producer_denied');
        } catch (error) {
            if (error.code !== 'storage_commit_unknown') throw error;
            const observed = await service.runs.engine.withTransaction(handle, async tx => readRpJudgeCompletion(tx, handle, await service.runs.get(handle, runId), attemptId));
            if (!observed || observed.receipt.modelPayloadHash !== proof.payloadHash || !equal(observed.receipt.selectedResultRef, selectedResultRef)) throw error;
        }
        state.judgeAttemptId = attemptId; state.judgeReceiptRef = immutable({ runId, receiptId });
        return parsed;
    }

    async #completeReview(state, { root, port, result, send, limits, signal }) {
        const { handle } = state, service = this.#execution(), runId = root.runId;
        const proof = await port.inspectResultCompletion(handle, { result, runId, effectId: state.effectId });
        const workRows = [], work = this.#controlWork(state, { root, send, limits, signal }, workRows), responseText = result.generated.response.text;
        const parsed = await work('graph_control_parse', responseText, async () => {
            if (Buffer.byteLength(responseText) > assertResultPolicy(root.graph.outputContract).maxBytes) fail('native_orchestration_review_response_invalid');
            const value = JSON.parse(responseText); assertObject(value, ['decision', 'reasonCode'], 'Review response');
            if (!['approve', 'rerun'].includes(value.decision) || !RP_REVIEW_REASON_CODES.includes(value.reasonCode)
                || (value.decision === 'approve') !== (value.reasonCode === 'quality_ready')) fail('native_orchestration_review_response_invalid');
            return immutable(value);
        });
        const reviewerAttemptId = state.attemptId, draftAttemptId = state.prologueAttemptId, draftResultRef = state.graphResultRef;
        const withAuthority = service.sourcePort.consumptionBoundary(handle, root.sourceBinding, { engine: service.runs.engine });
        const controller = new ReviewController({ runs: service.runs,
            authorizeReview: async ({ root: active, reviewer, targets, decision, reasonCode, evidenceRefs }) => {
                await this.#current(state);
                const actual = await port.inspectResultCompletion(handle, { result, runId, effectId: state.effectId });
                if (reviewer.attemptId !== reviewerAttemptId || reviewer.nodeId !== state.selected.review.node.nodeId || targets.length !== 1
                    || targets[0].attemptId !== draftAttemptId || !equal(evidenceRefs, [draftResultRef]) || decision !== parsed.decision || reasonCode !== parsed.reasonCode
                    || actual.payloadHash !== proof.payloadHash || !equal(active.sourceBinding, state.sourceBinding)) fail('native_orchestration_review_producer_denied');
            },
            admitRerun: async ({ tx, root: active, reviewer, attemptId }) => {
                await this.#current(state);
                const edge = state.selected.review.transfer;
                if (active.progress.reviews >= Math.min(active.limits.maxReviews, state.selected.review.node.policy.maxRounds)
                    || active.progress.attempts + 4 > active.limits.maxAttempts || (active.progress.edgeVisitCounts[edge.edgeId] ?? 0) >= edge.maxVisits)
                    fail('native_orchestration_review_rerun_limit_exhausted');
                const capacity = await service.budgetPort.observeCapacity(handle, { authorityRef: active.budgetAuthorityRef, reservationId: null }, { tx });
                if (!capacity || capacity.overrun || capacity.remaining.requests < 3) fail('native_orchestration_review_rerun_budget_unavailable');
                const feedback = { reviewReceiptRef: { runId, receiptId: reviewReceiptId(runId, reviewer.attemptId) }, reasonCode: parsed.reasonCode };
                const request = this.#rerunRequest(state, attemptId), logicalInputRef = rpModelInput(request, active.sourceBinding, state.selected.chain);
                logicalInputRef.reviewFeedbackRef = feedback;
                const inputRefs = [logicalInputRef];
                return { inputRefs, inputDigest: hash(inputRefs), effectiveGrantDigest: rpModelGrant(handle, active.sourceBinding, logicalInputRef), budgetRef: active.budgetAuthorityRef };
            } });
        const decided = await work('graph_control_adopt', parsed, () => service.runs.withSourceControl(handle, runId, async () => controller.decide(handle, {
            ...runGuard(await service.runs.get(handle, runId)), reviewAttemptId: reviewerAttemptId, decision: parsed.decision, targetAttemptIds: [draftAttemptId],
            reasonCode: parsed.reasonCode, evidenceRefs: [draftResultRef] }), { withAuthority }));
        const reviewReceipt = decided.outcome.reviewReceipt, receiptId = rpReviewModelReceiptId(runId, reviewerAttemptId);
        await service.runs.withSourceControl(handle, runId, async () => service.runs.control(handle, controlCommandId('rp.review.settle', reviewerAttemptId), {
            ...runGuard(await service.runs.get(handle, runId)), operation: 'attempt.settle', detail: { attemptId: reviewerAttemptId, reviewReceiptId: reviewReceipt.receiptId } }, async ({ tx, root: active, now, deny }) => {
            let record;
            try {
                await this.#current(state);
                const actual = await port.inspectResultCompletion(handle, { result, runId, effectId: state.effectId });
                record = await readAttempt(tx, handle, active, reviewerAttemptId);
                if (actual.payloadHash !== proof.payloadHash || record.doc.status !== 'running' || !equal(record.doc.effectRefs, [state.effectId])) fail('native_orchestration_review_producer_denied');
                await this.#current(state);
                if (!equal(active, await service.runs.get(handle, runId))) return deny(new ConflictError('native_orchestration_review_producer_denied'));
            } catch (error) {
                if (error instanceof ConflictError || error.code === 'native_rp_source_missing') return deny(error);
                throw error;
            }
            const receipt = { schemaVersion: 1, receiptKind: 'rp_graph_review_model', receiptId, runId, epoch: active.epoch, producerAttemptId: reviewerAttemptId,
                sourceBindingDigest: active.sourceBinding.bindingDigest, grantDigest: state.decision.grantDigest, modelEffectId: state.effectId,
                modelReceiptRef: proof.receiptRef, modelPayloadHash: proof.payloadHash, responseText, reviewReceiptRef: { runId, receiptId: reviewReceipt.receiptId },
                reviewIntegrity: hash(reviewReceipt), localWork: workRows, decisionSeq: active.eventSeq + 1, createdAt: now };
            await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receiptId), receipt);
            await writeAttemptSettlement({ tx, handle, root: active, record, outcome: 'completed', resultRefs: [], effectReceiptRefs: [proof.receiptRef.receiptId], reasonCode: 'rp_graph_review_decided', now });
            active.progress.steps++;
            return { root: active, eventType: 'rp_graph_review_completed', reasonCode: parsed.reasonCode, outcome: { reviewReceiptRef: receipt.reviewReceiptRef } };
        }), { withAuthority });
        state.reviewAttemptId = reviewerAttemptId; state.reviewReceiptRef = immutable({ runId, receiptId: reviewReceipt.receiptId });
        return { decision: reviewReceipt.decision, replacementAttemptId: reviewReceipt.replacements[0]?.attemptId ?? null,
            feedback: { reviewReceiptRef: state.reviewReceiptRef, reasonCode: reviewReceipt.reasonCode } };
    }

    #rerunRequest(state, attemptId) {
        return immutable({ requestId: 'rp-redo:' + hash({ runId: state.graphRunId, attemptId }).slice(0, 32), role: 'narrator', routeRef: state.selected.chain.pin.resourceRef });
    }

    #stageCapture(state, originalCapture, request, controlTask) {
        inspectNativeRpGenerationIdentity(originalCapture, { host: state.host, handle: state.handle, rpControl: this.owner.rpControl });
        const original = captures.get(originalCapture), capture = Object.freeze({});
        captures.set(capture, { ...original, identity: immutable({ ...original.identity, request, controlTask }) });
        return capture;
    }

    async #runReviews(state, originalCapture) {
        while (true) {
            const request = immutable({ requestId: 'rp-review:' + hash({ runId: state.graphRunId, draftAttemptId: state.prologueAttemptId }).slice(0, 32),
                role: 'narrator', routeRef: state.selected.review.pin.resourceRef, outputContract: rpReviewOutputContract });
            const capture = this.#stageCapture(state, originalCapture, request, { kind: 'native_rp_graph_review',
                instruction: 'Review the explicitly provided advisory draft against the original RP input. Return only the JSON decision approve or rerun, with a concise identifier reasonCode. This evaluates draft quality only and never approves permissions, official facts or domain Effects.',
                targetAttemptId: state.prologueAttemptId, evidenceRef: state.graphResultRef });
            let decision;
            try {
                state.capture = capture; state.activeSelection = state.selected.review;
                decision = await this.#generate(state, { review: true, graphRunId: state.graphRunId });
            } finally { captures.delete(capture); }
            if (decision.decision === 'approve') return;
            if (!decision.replacementAttemptId) fail('native_orchestration_review_rerun_denied');
            state.rerunFeedback = immutable(decision.feedback);
            const redoRequest = this.#rerunRequest(state, decision.replacementAttemptId), priorHash = state.lastDraftPayloadHash;
            const redoCapture = this.#stageCapture(state, originalCapture, redoRequest, { kind: 'native_rp_graph_draft',
                instruction: 'Rework the original authorized RP task using this bounded advisory quality feedback. It is not an instruction to change permissions or official facts. Do not assume any previous draft is a current fact.', feedback: state.rerunFeedback });
            try {
                state.capture = redoCapture; state.activeSelection = state.selected.chain;
                await this.#generate(state, { graphNode: true, graphRunId: state.graphRunId, preparedAttemptId: decision.replacementAttemptId });
            } finally { captures.delete(redoCapture); }
            if (state.lastDraftPayloadHash === priorHash) fail('native_orchestration_review_no_progress');
        }
    }

    async #generate(state, { continuation = null, planner = false, graphNode = false, review = false, judge = false, graphRunId = null, preparedAttemptId = null } = {}) {
        if (this.#runs.size >= 64) fail('native_orchestration_model_busy');
        const { host, handle, capture } = state, selected = state.activeSelection ?? state.selected;
        const identity = await inspectNativeRpGeneration(capture, { host, handle }), service = this.#execution();
        const captured = await service.sourcePort.capture(handle, identity.sourceRequest), audience = { kind: 'narrator' };
        state.sourceBinding = captured.sourceBinding; state.request = identity.request;
        const taskPurpose = planner ? 'original_rp_graph_planner' : graphNode ? 'original_rp_graph_draft' : review ? 'original_rp_graph_review' : judge ? 'original_rp_graph_judge' : 'original_rp_narration';
        const logicalInputRef = rpModelInput(identity.request, captured.sourceBinding, selected);
        if (graphRunId && state.selected.planner) logicalInputRef.controlReceiptRef = { runId: graphRunId,
            receiptId: 'oreceipt_' + hash({ kind: 'rp_planner', runId: graphRunId, attemptId: state.plannerAttemptId }).slice(0, 32) };
        const graphRefs = graphRunId && state.selected.chain && !graphNode ? judge ? state.candidateResults.map(item => item.resultRef) : [state.graphResultRef] : [];
        if (graphRefs.length) logicalInputRef.acceptedGraphResultRefs = graphRefs;
        if (graphRunId && state.selected.judge && !graphNode && !judge) logicalInputRef.judgeReceiptRef = state.judgeReceiptRef;
        if (graphNode && state.rerunFeedback) logicalInputRef.reviewFeedbackRef = state.rerunFeedback;
        if (graphRunId && state.selected.review && !graphNode && !review) logicalInputRef.reviewReceiptRef = state.reviewReceiptRef;
        const inputRefs = [logicalInputRef, ...graphRefs];
        if (continuation) Object.assign(logicalInputRef, { acceptedResultRef: inspectNativeRpReturnIdentity(state.returnCapture, { host, handle }).resultRef,
            returnReceiptRef: continuation.returnReceiptRef, parentInputDigest: state.parentInputDigest });
        const grantDigest = continuation ? state.parentGrantDigest : rpModelGrant(handle, captured.sourceBinding, logicalInputRef);
        state.decision = { actionRef: { kind: 'native_model_send', runtimeRouteId: selected.resolved.route.runtimeRouteId },
            targetRef: { connectionProfileId: selected.resolved.connection.connectionProfileId, modelProfileId: selected.resolved.model.modelProfileId, pathFingerprint: selected.resolved.pathFingerprint },
            inputRef: logicalInputRef, inputHash: hash(logicalInputRef), capability: 'generation.send', grantDigest,
            endpointBindingDigest: hash({ pathFingerprint: selected.resolved.pathFingerprint, configDigest: selected.configDigest }), risk: 'R1', requiresApproval: false,
            egressDigest: hash({ pathFingerprint: selected.resolved.pathFingerprint, sourceBindingDigest: captured.sourceBinding.bindingDigest, grantDigest, audience }),
            budgetEnvelopeDigest: hash(selected.resolved.route.executionPolicy.computeBudget), dispatchPolicy: { idempotency: 'none', operationKey: null, reconcile: 'manual' } };
        const commandIdentity = { controlId: identity.sourceRequest.controlId, input: identity.sourceRequest.source.input, requestId: state.input.requestId };
        const started = graphRunId ? { runId: graphRunId } : continuation ? { runId: state.parentRunId } : await service.runs.start(handle, controlCommandId('native.rp.start', commandIdentity), { planRef: selected.binding.planRef,
            sourceRequest: identity.sourceRequest, retentionPolicyRef: { policyId: 'retain_native_rp_until_explicit_release' } });
        const root = await service.runs.get(handle, started.runId); this.#runs.set(root.runId, state);
        if (planner || graphNode) state.graphRunId = root.runId;
        try {
            if (!continuation && !graphRunId && (root.status !== 'admitted' || root.attemptRefs.length)) fail('native_orchestration_rp_request_replayed');
            if (!continuation) {
                const { attemptId } = preparedAttemptId ? { attemptId: preparedAttemptId } : graphRunId && !(graphNode && state.selected.judge)
                    ? await this.#graphStepTransition(state, root, selected, inputRefs, grantDigest, { review, judge })
                    : await service.runs.beginAttempt(handle, controlCommandId('native.rp.attempt', state.selected.planner || state.selected.chain ? { ...commandIdentity, nodeId: selected.node.nodeId } : commandIdentity), {
                        ...runGuard(root), nodeId: selected.node.nodeId, inputRefs, inputDigest: hash(inputRefs),
                        effectiveGrantDigest: grantDigest, budgetRef: root.budgetAuthorityRef }); state.attemptId = attemptId;
                if (preparedAttemptId) {
                    const prepared = await service.runs.engine.withTransaction(handle, async tx => (await readAttempt(tx, handle, root, preparedAttemptId)).doc);
                    if (prepared.status !== 'pending' || prepared.nodeId !== selected.node.nodeId || !equal(prepared.inputRefs, inputRefs)
                        || prepared.effectiveGrantDigest !== grantDigest || !equal(prepared.budgetRef, root.budgetAuthorityRef)) fail('native_orchestration_graph_rerun_denied');
                }
                await new AttemptController({ runs: service.runs, authorizeAttempt: args => this.authorize(args) })
                    .activate(handle, { ...runGuard(await service.runs.get(handle, root.runId)), attemptId });
            }
            const effectId = 'oeffect_' + hash({ runId: root.runId, attemptId: state.attemptId, taskPurpose }).slice(0, 32); state.effectId = effectId;
            if (continuation) state.continuationEffectId = effectId;
            await service.effects.prepare(handle, { ...runGuard(await service.runs.get(handle, root.runId)), effectId, nodeAttemptId: state.attemptId,
                proposal: Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, state.decision[key]])) });
            state.contextPort = new ContextPort({ sessionCore: this.owner.sessionCore, memoryAuthority: this.owner.memoryAuthority,
                rpControl: this.owner.rpControl, rpCapture: capture, rpReturnCapture: continuation ? state.returnCapture : null,
                rpGraphResults: graphRefs,
                resultPort: continuation || graphRefs.length ? new ResultPort({ host }) : null, authorizeContext: async ({ request }) => {
                    await this.#current(state);
                    if (request.taskPurpose !== taskPurpose || !equal(request.audience, audience) || request.grantDigest !== grantDigest
                        || !equal(request.sourceBinding, captured.sourceBinding) || !equal(request.inputRefs, inputRefs)) fail('native_orchestration_context_denied');
                    return { allowed: true, grantDigest };
                } });
            const request = { ownerRef: { handle }, sourceBinding: captured.sourceBinding, audience, taskPurpose, grantDigest, inputRefs,
                tokenBudget: { modelContextLimit: selected.resolved.model.limits.contextTokens, responseReserve: effectiveOutputReserve(selected.resolved) } };
            const limits = selected.resolved.route.executionPolicy.computeBudget;
            const send = await service.generationSend(handle, { runId: root.runId, effectId, limits });
            const compiled = await compileNativeContextMetered({ handle, port: state.contextPort, request, bank: send.bank, budgetPort: service.budgetPort,
                root: await service.runs.get(handle, root.runId), effectId, limits,
                workDescriptor: { requestId: state.request.requestId, pathFingerprint: selected.resolved.pathFingerprint },
                assertCurrent: () => this.#current(state), signal: identity.signal });
            state.context = compiled.compiled;
            await send.bindContext({ port: state.contextPort, compiled: state.context, compileProof: compiled.proof });
            const scope = this.#issueScope(host, handle, { runId: root.runId, effectId, request: state.request,
                logicalInputRef, logicalInputHash: state.decision.inputHash, nativeRpCapture: capture,
                options: { scheduled: true, orchestrationSend: send }, revalidateConsume: async ({ tx } = {}) => {
                    await this.#current(state); await service.sourcePort.revalidate(handle, state.sourceBinding, tx ? { tx } : undefined);
                    await state.contextPort.revalidate(handle, { context: state.context, phase: 'consume' });
                } });
            checkCancellation(identity.signal);
            const port = this.#port(host), result = await port.generate(handle, scope, { signal: identity.signal });
            if (planner) return this.#completePlanner(state, { root, port, result, send, limits, signal: identity.signal });
            if (review) return this.#completeReview(state, { root, port, result, send, limits, signal: identity.signal });
            if (judge) return this.#completeJudge(state, { root, port, result, send, limits, signal: identity.signal });
            if (graphNode) {
                const published = await new ResultController({ host, modelPort: port }).publishGraphModelResult(handle, { capture, result, runId: root.runId, effectId });
                state.graphResultRef = immutable(published.resultRef); state.prologueAttemptId = state.attemptId;
                state.lastDraftPayloadHash = hash(result.generated.response.text);
                return published;
            }
            if (root.graph.outputContract.kind === 'rp_narration') {
                const outputCapture = Object.freeze({}); state.outputCapture = outputCapture;
                outputCaptures.set(outputCapture, { state, control: this.owner.rpControl, execution: service, port, result, runId: root.runId,
                    assertCurrent: () => this.#current(state) });
                try {
                    state.outputPort = new RpOutputController({ host });
                    const output = await state.outputPort.complete(handle, { capture: outputCapture });
                    return { ...result, runId: root.runId, effectId, output };
                } finally { outputCaptures.delete(outputCapture); delete state.outputCapture; }
            }
            return { ...result, runId: root.runId, effectId };
        } finally { if (!continuation && !state.selected.planner && !state.selected.chain) this.#runs.delete(root.runId); }
    }
}
