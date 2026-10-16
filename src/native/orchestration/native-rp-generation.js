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
import { controlCommandId, runGuard } from './controller-common.js';
import { compileNativeContextMetered } from './generation-local-work.js';

const captures = new WeakMap();
const fail = (code = 'native_orchestration_rp_producer_denied') => { throw new ConflictError(code); };
const equal = (left, right) => hash(left) === hash(right);
const configuration = resolved => hash({ route: resolved.route, model: resolved.model, connection: resolved.connection,
    generation: resolved.generation, resources: resolved.resources });

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
        const node = graph.nodes.find(item => item.kind === 'agent'), output = graph.nodes.find(item => item.kind === 'output');
        if (graph.nodes.length !== 2 || !node || !output || graph.edges.length !== 1
            || !equal(graph.entryNodeIds, [node.nodeId]) || !equal(graph.capabilityCeiling, ['generation.send'])
            || !equal(node.capabilities, ['generation.send']) || node.inputs.length || node.outputs.length !== 1 || node.outputs[0].type !== 'text'
            || node.dependencyPinIds.length !== 1 || output.capabilities.length || output.inputs.length !== 1
            || output.inputs[0].type !== 'text' || !output.inputs[0].required || output.outputs.length || output.dependencyPinIds.length
            || plan.dependencyPins.length !== 1 || graph.outputContract.kind !== 'result' || graph.outputContract.allowPartial
            || graph.graphChangePolicy.allowedOperations.length || graph.edges[0].condition !== 'always'
            || graph.edges[0].loopBack || graph.edges[0].maxVisits !== 1
            || graph.edges[0].from.nodeId !== node.nodeId || graph.edges[0].to.nodeId !== output.nodeId) fail('native_orchestration_rp_plan_unavailable');
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
        return { binding, plan, node, pin, resolved, configDigest: configuration(resolved) };
    }

    async #current(state) {
        await inspectNativeRpGeneration(state.capture, { host: state.host, handle: state.handle, rpControl: this.owner.rpControl });
        const selected = await this.#selection(state.host, state.handle, state.input);
        if (!equal(selected.binding, state.selected.binding) || selected.configDigest !== state.selected.configDigest)
            fail('native_orchestration_source_stale');
        return selected;
    }

    async authorize({ handle, root, attempt, proposal, intent }) {
        const state = this.#runs.get(root.runId);
        if (!state || state.handle !== handle || !equal(root.planRef, state.selected.binding.planRef)
            || root.sourceBinding.bindingDigest !== state.sourceBinding.bindingDigest) fail();
        await this.#current(state);
        if (attempt && (attempt.nodeId !== state.selected.node.nodeId || attempt.effectiveGrantDigest !== state.decision.grantDigest)) fail();
        if (proposal && !equal(proposal, Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, state.decision[key]])))) fail();
        if (intent && (intent.nodeAttemptId !== state.attemptId || intent.inputHash !== state.decision.inputHash)) fail();
        return cloneNativeDocument(state.decision);
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
        const resources = [...await host.executionResources(handle, selected.resolved.route), 'rp:' + handle + ':' + input.controlId];
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
                try { return await this.#generate({ host, handle, input, selected, capture }); } finally { captures.delete(capture); }
            }, finalize: result => result });
    }

    async #generate(state) {
        if (this.#runs.size >= 64) fail('native_orchestration_model_busy');
        const { host, handle, selected, capture } = state;
        const identity = await inspectNativeRpGeneration(capture, { host, handle }), service = this.#execution();
        const captured = await service.sourcePort.capture(handle, identity.sourceRequest), audience = { kind: 'narrator' };
        state.sourceBinding = captured.sourceBinding; state.request = identity.request;
        const taskPurpose = 'original_rp_narration';
        const logicalInputRef = { kind: 'native_rp_intent', role: 'narrator', requestId: identity.request.requestId,
            sourceRef: captured.sourceBinding.sourceRef, bindingRef: { bindingId: selected.binding.bindingId, version: selected.binding.version },
            planRef: selected.binding.planRef, nodeId: selected.node.nodeId, routeRef: selected.pin.resourceRef, configDigest: selected.configDigest, audience };
        const grantDigest = hash({ owner: handle, logicalInputRef, sourceBindingDigest: captured.sourceBinding.bindingDigest });
        state.decision = { actionRef: { kind: 'native_model_send', runtimeRouteId: selected.resolved.route.runtimeRouteId },
            targetRef: { connectionProfileId: selected.resolved.connection.connectionProfileId, modelProfileId: selected.resolved.model.modelProfileId, pathFingerprint: selected.resolved.pathFingerprint },
            inputRef: logicalInputRef, inputHash: hash(logicalInputRef), capability: 'generation.send', grantDigest,
            endpointBindingDigest: hash({ pathFingerprint: selected.resolved.pathFingerprint, configDigest: selected.configDigest }), risk: 'R1', requiresApproval: false,
            egressDigest: hash({ pathFingerprint: selected.resolved.pathFingerprint, sourceBindingDigest: captured.sourceBinding.bindingDigest, grantDigest, audience }),
            budgetEnvelopeDigest: hash(selected.resolved.route.executionPolicy.computeBudget), dispatchPolicy: { idempotency: 'none', operationKey: null, reconcile: 'manual' } };
        const commandIdentity = { controlId: identity.sourceRequest.controlId, input: identity.sourceRequest.source.input, requestId: state.input.requestId };
        const started = await service.runs.start(handle, controlCommandId('native.rp.start', commandIdentity), { planRef: selected.binding.planRef,
            sourceRequest: identity.sourceRequest, retentionPolicyRef: { policyId: 'retain_native_rp_until_explicit_release' } });
        const root = await service.runs.get(handle, started.runId); this.#runs.set(root.runId, state);
        try {
            if (root.status !== 'admitted' || root.attemptRefs.length) fail('native_orchestration_rp_request_replayed');
            const { attemptId } = await service.runs.beginAttempt(handle, controlCommandId('native.rp.attempt', commandIdentity), {
                ...runGuard(root), nodeId: selected.node.nodeId, inputRefs: [logicalInputRef], inputDigest: hash([logicalInputRef]),
                effectiveGrantDigest: grantDigest, budgetRef: root.budgetAuthorityRef }); state.attemptId = attemptId;
            await new AttemptController({ runs: service.runs, authorizeAttempt: args => this.authorize(args) })
                .activate(handle, { ...runGuard(await service.runs.get(handle, root.runId)), attemptId });
            const effectId = 'oeffect_' + hash({ runId: root.runId, attemptId, taskPurpose }).slice(0, 32); state.effectId = effectId;
            await service.effects.prepare(handle, { ...runGuard(await service.runs.get(handle, root.runId)), effectId, nodeAttemptId: attemptId,
                proposal: Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, state.decision[key]])) });
            state.contextPort = new ContextPort({ rpControl: this.owner.rpControl, rpCapture: capture, authorizeContext: async ({ request }) => {
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
        } finally { this.#runs.delete(root.runId); }
    }
}
