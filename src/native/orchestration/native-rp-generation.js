import { ConflictError } from '../../storage/errors.js';
import { ChatRepo } from '../../storage/repositories/chat-repo.js';
import { RpRunControl, rpOperationInput } from '../rp-run-control.js';
import { NativeGenerationHost } from '../adapters/generation-host.js';
import { NativeTaskScheduler, nativeTaskScheduler } from '../task-scheduler.js';
import { hashNativeDocument as hash, cloneNativeDocument } from '../repositories/common.js';
import { fields } from '../../../public/shared/native-values.js';
import { assertNativeId } from '../identity.js';
import { immutable, checkCancellation, effectiveOutputReserve } from '../model-prompt-runtime/execution-utils.js';
import { createOrchestrationAuthoringService } from './authoring-service.js';
import { validateModelCapability } from './model-capability-authority.js';
import { ContextPort } from './context-port.js';
import { AttemptController } from './attempt-controller.js';
import { controlCommandId, runGuard, readAttempt, controlRecordKey } from './controller-common.js';
import { compileNativeContextMetered } from './generation-local-work.js';
import { assertChildRunCurrent, childBudgetReceiptId } from './run-repository.js';
import { checkedRecord } from './plan-repository.js';
import { readHandoff } from './handoff-contracts.js';
import { BudgetPort } from './budget-port.js';
import { assertObject, assertResultPolicy } from '../../../public/shared/native-orchestration-contracts.js';
import { ResultController } from './result-controller.js';
import { readResultPublication } from './result-publication-contracts.js';
import { TaskLocalOutputController } from './task-local-output-controller.js';
import { readTaskLocalOutput } from './task-local-output-contracts.js';
import { HandoffReturnController } from './handoff-return-controller.js';
import { ResultPort } from './result-port.js';

const captures = new WeakMap();
const delegationCaptures = new WeakMap();
const returnCaptures = new WeakMap();
const fail = (code = 'native_orchestration_rp_producer_denied') => { throw new ConflictError(code); };
const equal = (left, right) => hash(left) === hash(right);
const configuration = resolved => hash({ route: resolved.route, model: resolved.model, connection: resolved.connection,
    generation: resolved.generation, resources: resolved.resources });
const sameSet = (left, right) => left.length === right.length && left.every(value => right.includes(value));

function finiteProfile(plan, { delegated = false, explicitResult = false } = {}) {
    const graph = plan.definition, node = graph.nodes.find(item => item.kind === 'agent'), output = graph.nodes.find(item => item.kind === 'output');
    const capabilities = delegated ? ['generation.send', 'agent.delegate'] : ['generation.send'];
    if (graph.nodes.length !== 2 || !node || !output || graph.edges.length !== 1
        || !equal(graph.entryNodeIds, [node.nodeId]) || !sameSet(graph.capabilityCeiling, capabilities)
        || !sameSet(node.capabilities, capabilities) || node.inputs.length || node.outputs.length !== 1 || node.outputs[0].type !== 'text'
        || node.dependencyPinIds.length !== (delegated ? 2 : 1) || output.capabilities.length || output.inputs.length !== 1
        || output.inputs[0].type !== 'text' || !output.inputs[0].required || output.outputs.length || output.dependencyPinIds.length
        || plan.dependencyPins.length !== (delegated ? 2 : 1) || graph.outputContract.kind !== 'result' || graph.outputContract.allowPartial
        || graph.graphChangePolicy.allowedOperations.length || graph.edges[0].condition !== 'always'
        || graph.edges[0].loopBack || graph.edges[0].maxVisits !== 1
        || graph.edges[0].from.nodeId !== node.nodeId || graph.edges[0].to.nodeId !== output.nodeId
        || graph.edges[0].from.port !== node.outputs[0].name || graph.edges[0].to.port !== output.inputs[0].name) fail('native_orchestration_rp_plan_unavailable');
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
                ? equal(attempt.effectRefs, []) || equal(attempt.effectRefs, [state.parentState.continuationEffectId]) : !attempt.effectRefs.length)
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
        const node = finiteProfile(plan, { delegated });
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
        return { binding, plan, node, pin, resolved, child, configDigest: configuration(resolved) };
    }

    async #current(state) {
        if (state.delegationCapture) return inspectNativeRpDelegation(state.delegationCapture, { host: state.host, handle: state.handle });
        if (state.phase === 'resumed' && state.returnCapture) return inspectNativeRpReturn(state.returnCapture, { host: state.host, handle: state.handle });
        return this.#baseCurrent(state);
    }

    async #baseCurrent(state) {
        await inspectNativeRpGeneration(state.capture, { host: state.host, handle: state.handle, rpControl: this.owner.rpControl });
        const selected = await this.#selection(state.host, state.handle, state.input);
        if (!equal(selected.binding, state.selected.binding) || selected.configDigest !== state.selected.configDigest
            || selected.child?.configDigest !== state.selected.child?.configDigest)
            fail('native_orchestration_source_stale');
        return selected;
    }

    async authorize({ handle, root, attempt, proposal, intent }) {
        const state = this.#runs.get(root.runId);
        if (!state || state.handle !== handle || !equal(root.planRef, state.selected.binding.planRef)
            || root.sourceBinding.bindingDigest !== state.sourceBinding.bindingDigest) fail();
        await this.#current(state);
        if (state.parentDelegation && state.phase !== 'resumed') {
            if (attempt && (attempt.nodeId !== state.selected.node.nodeId || attempt.effectiveGrantDigest !== state.parentGrantDigest)
                || proposal || intent) fail('native_orchestration_delegation_denied');
            return { allowed: true, grantDigest: state.parentGrantDigest };
        }
        if (attempt && (attempt.nodeId !== state.selected.node.nodeId || attempt.effectiveGrantDigest !== state.decision.grantDigest)) fail();
        if (proposal && !equal(proposal, Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, state.decision[key]])))) fail();
        if (intent && (intent.nodeAttemptId !== state.attemptId || intent.inputHash !== state.decision.inputHash)) fail();
        return cloneNativeDocument(state.decision);
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
        if (configuration(resolved) !== state.selected.configDigest || snapshot.requestId !== state.request.requestId
            || snapshot.runtimeRouteId !== state.selected.pin.resourceRef.runtimeRouteId
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

    verifyObservation(args) {
        const state = this.#runs.get(args.root.runId); if (!state) fail();
        return this.#port(state.host).verifyObservation(args);
    }

    async start(host, handle, value, { signal } = {}) {
        fields(value, ['controlId', 'floor', 'requestId', 'routeRef'], 'RP generation');
        assertNativeId(value.controlId, 'rpControl');
        fields(value.routeRef, ['scope', 'runtimeRouteId'], 'RP route');
        if (value.routeRef.scope !== 'player' || !Number.isSafeInteger(value.floor) || value.floor < 0
            || typeof value.requestId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(value.requestId)) fail();
        const input = immutable(value), selected = await this.#selection(host, handle, input), control = this.owner.rpControl;
        const current = await RpRunControl.prototype.status.call(control, handle, input.controlId);
        const chat = await ChatRepo.prototype.get.call(control._chatRepo, handle, current.locator.charDir, current.locator.name, current.locator);
        const message = chat?.body[input.floor];
        if (!message?.is_user || message.is_system || input.floor !== chat.body.length - 1) fail('native_orchestration_rp_input_required');
        const sourceRequest = { domain: 'rp_chat', controlId: input.controlId, source: {
            input: rpOperationInput(message, input.floor), purpose: 'narration', outputSlot: 'assistant' } };
        const context = await RpRunControl.prototype.context.call(control, handle, input.controlId, sourceRequest.source);
        const request = immutable({ requestId: input.requestId, role: 'narrator', routeRef: input.routeRef });
        const resources = [...new Set([...await host.executionResources(handle, selected.resolved.route),
            ...(selected.child ? await host.executionResources(handle, selected.child.resolved.route) : []), 'rp:' + handle + ':' + input.controlId])];
        const expected = immutable({ owner: handle, anchor: { controlId: input.controlId, prefixDigest: context.prefixDigest }, kind: 'model_task',
            executionClass: 'interactive', resources, key: 'rp:' + input.controlId + ':' + input.requestId, fingerprint: hash(input) });
        return this.scheduler.submit({ ...expected, retry: false, signal, retainResult: true,
            timeoutMs: selected.resolved.route.policy.timeoutMs, fresh: async () => {
                const now = await RpRunControl.prototype.context.call(control, handle, input.controlId, sourceRequest.source);
                return now.prefixDigest === context.prefixDigest;
            }, run: async boundary => {
                const capture = Object.freeze({});
                captures.set(capture, { host, handle, control, owner: this.owner, scheduler: this.scheduler, boundary, expected,
                    identity: immutable({ sourceRequest, prefixDigest: context.prefixDigest, request }) });
                try {
                    return selected.child ? await this.#delegate({ host, handle, input, selected, capture, boundary, expected })
                        : await this.#generate({ host, handle, input, selected, capture });
                } finally { captures.delete(capture); }
            }, finalize: result => result });
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

    async #generate(state, { continuation = null } = {}) {
        if (this.#runs.size >= 64) fail('native_orchestration_model_busy');
        const { host, handle, selected, capture } = state;
        const identity = await inspectNativeRpGeneration(capture, { host, handle }), service = this.#execution();
        const captured = await service.sourcePort.capture(handle, identity.sourceRequest), audience = { kind: 'narrator' };
        state.sourceBinding = captured.sourceBinding; state.request = identity.request;
        const taskPurpose = 'original_rp_narration';
        const logicalInputRef = { kind: 'native_rp_intent', role: 'narrator', requestId: identity.request.requestId,
            sourceRef: captured.sourceBinding.sourceRef, bindingRef: { bindingId: selected.binding.bindingId, version: selected.binding.version },
            planRef: selected.binding.planRef, nodeId: selected.node.nodeId, routeRef: selected.pin.resourceRef, configDigest: selected.configDigest, audience };
        if (continuation) Object.assign(logicalInputRef, { acceptedResultRef: inspectNativeRpReturnIdentity(state.returnCapture, { host, handle }).resultRef,
            returnReceiptRef: continuation.returnReceiptRef, parentInputDigest: state.parentInputDigest });
        const grantDigest = continuation ? state.parentGrantDigest : hash({ owner: handle, logicalInputRef, sourceBindingDigest: captured.sourceBinding.bindingDigest });
        state.decision = { actionRef: { kind: 'native_model_send', runtimeRouteId: selected.resolved.route.runtimeRouteId },
            targetRef: { connectionProfileId: selected.resolved.connection.connectionProfileId, modelProfileId: selected.resolved.model.modelProfileId, pathFingerprint: selected.resolved.pathFingerprint },
            inputRef: logicalInputRef, inputHash: hash(logicalInputRef), capability: 'generation.send', grantDigest,
            endpointBindingDigest: hash({ pathFingerprint: selected.resolved.pathFingerprint, configDigest: selected.configDigest }), risk: 'R1', requiresApproval: false,
            egressDigest: hash({ pathFingerprint: selected.resolved.pathFingerprint, sourceBindingDigest: captured.sourceBinding.bindingDigest, grantDigest, audience }),
            budgetEnvelopeDigest: hash(selected.resolved.route.executionPolicy.computeBudget), dispatchPolicy: { idempotency: 'none', operationKey: null, reconcile: 'manual' } };
        const commandIdentity = { controlId: identity.sourceRequest.controlId, input: identity.sourceRequest.source.input, requestId: state.input.requestId };
        const started = continuation ? { runId: state.parentRunId } : await service.runs.start(handle, controlCommandId('native.rp.start', commandIdentity), { planRef: selected.binding.planRef,
            sourceRequest: identity.sourceRequest, retentionPolicyRef: { policyId: 'retain_native_rp_until_explicit_release' } });
        const root = await service.runs.get(handle, started.runId); this.#runs.set(root.runId, state);
        try {
            if (!continuation && (root.status !== 'admitted' || root.attemptRefs.length)) fail('native_orchestration_rp_request_replayed');
            if (!continuation) {
                const { attemptId } = await service.runs.beginAttempt(handle, controlCommandId('native.rp.attempt', commandIdentity), {
                    ...runGuard(root), nodeId: selected.node.nodeId, inputRefs: [logicalInputRef], inputDigest: hash([logicalInputRef]),
                    effectiveGrantDigest: grantDigest, budgetRef: root.budgetAuthorityRef }); state.attemptId = attemptId;
                await new AttemptController({ runs: service.runs, authorizeAttempt: args => this.authorize(args) })
                    .activate(handle, { ...runGuard(await service.runs.get(handle, root.runId)), attemptId });
            }
            const effectId = 'oeffect_' + hash({ runId: root.runId, attemptId: state.attemptId, taskPurpose }).slice(0, 32); state.effectId = effectId;
            if (continuation) state.continuationEffectId = effectId;
            await service.effects.prepare(handle, { ...runGuard(await service.runs.get(handle, root.runId)), effectId, nodeAttemptId: state.attemptId,
                proposal: Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, state.decision[key]])) });
            state.contextPort = new ContextPort({ sessionCore: this.owner.sessionCore, memoryAuthority: this.owner.memoryAuthority,
                rpControl: this.owner.rpControl, rpCapture: capture, rpReturnCapture: continuation ? state.returnCapture : null,
                resultPort: continuation ? new ResultPort({ host }) : null, authorizeContext: async ({ request }) => {
                    await this.#current(state);
                    if (request.taskPurpose !== taskPurpose || !equal(request.audience, audience) || request.grantDigest !== grantDigest
                        || !equal(request.sourceBinding, captured.sourceBinding) || !equal(request.inputRefs, [logicalInputRef])) fail('native_orchestration_context_denied');
                    return { allowed: true, grantDigest };
                } });
            const request = { ownerRef: { handle }, sourceBinding: captured.sourceBinding, audience, taskPurpose, grantDigest, inputRefs: [logicalInputRef],
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
            const result = await this.#port(host).generate(handle, scope, { signal: identity.signal });
            return { ...result, runId: root.runId, effectId };
        } finally { if (!continuation) this.#runs.delete(root.runId); }
    }
}
