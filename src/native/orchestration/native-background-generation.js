import { ConflictError } from '../../storage/errors.js';
import { NativeGenerationHost } from '../adapters/generation-host.js';
import { nativeTaskScheduler } from '../task-scheduler.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { immutable, effectiveOutputReserve } from '../model-prompt-runtime/execution-utils.js';
import { createOrchestrationAuthoringService } from './authoring-service.js';
import { RouteResolver } from '../model-prompt-runtime/route-resolver.js';
import { taskRuntimeRoute } from '../adapters/task-runtime-route.js';
import { getVersionedModelPromptResourceIdentity } from '../model-prompt-runtime/resources.js';
import { assertTaskValue } from '../../../public/shared/native-task-contract.js';
import { ContextPort } from './context-port.js';
import { nativeSessionContextOptions, nativeContextCompilationOptions } from '../adapters/native-session-context.js';
import { compileNativeContextMetered } from './generation-local-work.js';
import { AttemptController } from './attempt-controller.js';
import { controlCommandId, runGuard } from './controller-common.js';
import { mintNativeBackgroundQuota } from './native-turn-quota.js';
import { RunControl } from '../run-control.js';

const captures = new WeakMap();
const fail = code => { throw new ConflictError(code); };
const equal = (a, b) => hash(a) === hash(b);
const configuration = resolved => hash({ route: resolved.route, model: resolved.model, connection: resolved.connection,
    generation: resolved.generation, resources: resolved.resources });

function pendingTask(snapshot, input) {
    const contract = snapshot.manifest.runtime.experienceContract, task = contract.taskRuntime.tasks.find(item => item.id === input.taskId);
    const variant = task?.variants.find(item => item.id === input.variantId), intent = snapshot.states.atri_lifecycle?.outbox.find(item => item.invocationId === input.invocationId);
    const scope = snapshot.states.atri_lifecycle?.scopes[intent?.scopeId];
    if (!task || !variant || !snapshot.states.atri_lifecycle.ready || !intent || intent.status !== 'pending' || intent.kind !== 'task'
        || intent.simulation || intent.appraisalEvent || task.executionClass !== 'background' || variant.resultBinding
        || intent.taskId !== task.id || intent.variantId !== variant.id || scope?.status !== 'active' || scope.epoch !== intent.scopeEpoch
        || !equal(intent.input, input.input) || snapshot.revision.revisionId !== input.revisionId)
        fail('native_orchestration_background_source_stale');
    assertTaskValue(input.input, task.inputSchema);
    return { task, variant, intent, slot: contract.taskRuntime.slots.find(item => item.id === task.bindingSlotId), payload: intent.input };
}

export function inspectNativeBackgroundGenerationIdentity(capture, { host, handle, sessionCore } = {}) {
    const value = captures.get(capture);
    if (!value || value.handle !== handle || host !== undefined && value.host !== host || sessionCore !== undefined && value.host.sessionCore !== sessionCore
        || !(value.host instanceof NativeGenerationHost) || value.host.turnOrchestration !== value.owner
        || value.host.persistence._engine !== value.owner.engine) fail('native_orchestration_background_producer_denied');
    const active = nativeTaskScheduler.assertActiveBoundary(value.boundary, value.expected);
    if (active.attempt !== 0 || nativeTaskScheduler.operations.get(active.operationId)?.retry !== false)
        fail('native_orchestration_background_producer_denied');
    return { ...value, signal: active.signal, operationId: active.operationId };
}

export async function inspectNativeBackgroundGeneration(capture, expected) {
    const value = inspectNativeBackgroundGenerationIdentity(capture, expected);
    const snapshot = await value.host.sessionCore.observe(value.handle, value.input.sessionId);
    pendingTask(snapshot, value.input);
    if (hash(snapshot) !== value.snapshotDigest) fail('native_orchestration_background_source_stale');
    return { ...value, snapshot };
}

/** Original durable outbox producer; model work only, original Task owns adoption. */
export class NativeBackgroundOrchestrationAuthority {
    #runs = new Map();
    constructor({ owner, execution, port, issueScope }) { Object.assign(this, { owner, execution, port, issueScope }); }
    hasRun(runId) { return this.#runs.has(runId); }
    async #select(host, handle, snapshot, input) {
        if (host.turnOrchestration !== this.owner || host.persistence._engine !== this.owner.engine || host.sessionCore !== this.owner.sessionCore)
            fail('native_orchestration_background_producer_denied');
        this.owner.plans ??= createOrchestrationAuthoringService(this.owner.engine, { sessionCore: this.owner.sessionCore,
            projectAgent: this.owner.projectAgent, rpControl: this.owner.rpControl, modelResolver: this.owner.modelResolver }).plans;
        const selector = { domain: 'native_session', sessionId: snapshot.session.sessionId, entryPointId: null };
        let binding = await this.owner.plans.getBinding(handle, selector);
        if (!binding) binding = await this.owner.plans.getBinding(handle, { ...selector, sessionId: null, entryPointId: snapshot.session.entryPointId });
        if (!binding) return null;
        const taskPlan = pendingTask(snapshot, input);
        if (input.fallbackMode !== undefined && input.fallbackMode !== 'disabled') fail('native_orchestration_background_route_mismatch');
        const plan = await this.owner.plans.getRevision(handle, binding.planRef), graph = plan.definition;
        const node = graph.nodes.find(item => item.kind === 'agent'), output = graph.nodes.find(item => item.kind === 'output');
        if (!node || !output || graph.nodes.length !== 2 || graph.edges.length !== 1 || !equal(graph.entryNodeIds, [node.nodeId])
            || !equal(graph.capabilityCeiling, ['generation.send']) || !equal(node.capabilities, ['generation.send']) || node.inputs.length
            || node.outputs.length !== 1 || node.outputs[0].type !== 'json' || output.inputs.length !== 1 || output.inputs[0].type !== 'json'
            || !output.inputs[0].required || output.capabilities.length || output.outputs.length || output.dependencyPinIds.length
            || node.dependencyPinIds.length !== 1 || plan.dependencyPins.length !== 1 || graph.outputContract.kind !== 'result' || graph.outputContract.allowPartial
            || graph.graphChangePolicy.allowedOperations.length || graph.edges[0].from.nodeId !== node.nodeId || graph.edges[0].to.nodeId !== output.nodeId
            || graph.edges[0].condition !== 'always' || graph.edges[0].loopBack || graph.edges[0].maxVisits !== 1)
            fail('native_orchestration_background_plan_unavailable');
        const pin = plan.dependencyPins.find(item => item.pinId === node.policy.agentPinId && node.dependencyPinIds.includes(item.pinId));
        const routeRef = input.slotBindings?.[taskPlan.task.bindingSlotId];
        const route = await host.persistence.getRuntimeRoute(handle, routeRef?.runtimeRouteId);
        if (!route || routeRef?.scope !== 'player' || pin?.port !== 'model' || !equal(pin.resourceRef, routeRef) || pin.integrity !== hash(route)
            || route.fallbackRouteRefs.length || route.policy.maxRetries !== 0 || route.policy.maxFallbackAttempts !== 0
            || (route.executionPolicy?.continuity ?? 'none') !== 'none' || (route.executionPolicy?.reuse ?? 'disabled') !== 'disabled')
            fail('native_orchestration_background_route_mismatch');
        if (!snapshot.manifest.runtime.experienceContract.generationBudget || !route.executionPolicy?.computeBudget?.localWork)
            fail('native_orchestration_background_budget_unavailable');
        const role = route.role, persistence = Object.create(host.persistence);
        persistence.getRuntimeRoute = async (owner, id) => taskRuntimeRoute(await host.persistence.getRuntimeRoute(owner, id), role, taskPlan, snapshot.session);
        const resolver = new RouteResolver({ persistence, library: host.library, providers: host.providers, getScopedResource: async (owner, ref) => {
            if (ref.scope !== 'package' || ref.packageId !== snapshot.session.packageId || ref.packageVersionId !== snapshot.session.packageVersionId)
                fail('native_orchestration_background_route_mismatch');
            const installed = await host.packageInstaller.open(owner, ref.packageId, ref.packageVersionId);
            const entry = installed.manifest.resources.find(item => {
                const identity = getVersionedModelPromptResourceIdentity(item.resourceType, item.resource);
                return identity.resourceType === ref.resourceType && identity.resourceId === ref.resourceId && identity.revision === ref.revision;
            });
            return entry && { snapshot: entry.resource, origin: entry.origin };
        } });
        const resolved = await resolver.resolve({ handle, routeRef, role,
            requirements: [...taskPlan.slot.requiredCapabilities, ...taskPlan.variant.requiredCapabilities, 'generation.structured-output'] });
        return { binding, plan, node, pin, resolved, taskPlan, configDigest: configuration(resolved) };
    }
    async #current(state) {
        const captured = await inspectNativeBackgroundGeneration(state.capture, { host: state.host, handle: state.handle });
        let selected;
        try { selected = await this.#select(state.host, state.handle, captured.snapshot, state.input); } catch (error) {
            if (['native_orchestration_background_plan_unavailable', 'native_orchestration_background_route_mismatch',
                'native_orchestration_background_budget_unavailable'].includes(error.code)) fail('native_orchestration_background_source_stale');
            throw error;
        }
        if (!selected || !equal(selected.binding, state.selected.binding) || selected.configDigest !== state.selected.configDigest)
            fail('native_orchestration_background_source_stale');
        return captured;
    }
    async authorize({ handle, root, attempt, proposal, intent }) {
        const state = this.#runs.get(root.runId);
        if (!state || state.handle !== handle || !equal(root.planRef, state.selected.binding.planRef)
            || root.sourceBinding.bindingDigest !== state.sourceBinding.bindingDigest) fail('native_orchestration_background_grant_denied');
        await this.#current(state);
        if (attempt && (attempt.nodeId !== state.selected.node.nodeId || attempt.effectiveGrantDigest !== state.decision.grantDigest)) fail('native_orchestration_background_grant_denied');
        if (proposal && !equal(proposal, Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, state.decision[key]])))) fail('native_orchestration_background_grant_denied');
        if (intent && (intent.nodeAttemptId !== state.attemptId || intent.inputHash !== state.decision.inputHash)) fail('native_orchestration_background_grant_denied');
        return structuredClone(state.decision);
    }
    async verifySend(args) {
        await this.authorize(args);
        const state = this.#runs.get(args.root.runId);
        if (configuration(args.resolved) !== state.selected.configDigest || args.snapshot.requestId !== state.request.requestId
            || args.snapshot.runtimeRouteId !== state.selected.pin.resourceRef.runtimeRouteId
            || args.compiledBinding.fingerprint !== args.snapshot.diagnostics.compiledBinding.fingerprint)
            fail('native_orchestration_background_route_mismatch');
        const expected = await state.contextPort.provider(args.handle, { context: state.context }).buildRequestContextPlan(state.request, args.resolved);
        if (!equal(expected, args.snapshot.contextPlan)) fail('native_orchestration_background_context_mismatch');
    }
    async verifyObservation(args) {
        const state = this.#runs.get(args.root.runId);
        if (!state || state.handle !== args.handle) fail('native_orchestration_model_completion_proof_required');
        return this.port(state.host).verifyObservation(args);
    }
    async start(host, handle, { input, snapshot, taskPlan, captured, work }) {
        const selected = await this.#select(host, handle, snapshot, input);
        if (!selected) return null;
        if (!equal(selected.taskPlan.task, taskPlan.task) || !equal(selected.taskPlan.variant, taskPlan.variant)
            || work.owner !== handle || work.executionClass !== 'background' || work.kind !== 'auxiliary_task' || work.retry !== false
            || work.anchor.sessionId !== input.sessionId || work.anchor.revisionId !== input.revisionId)
            fail('native_orchestration_background_producer_denied');
        const expected = immutable(Object.fromEntries(['owner', 'anchor', 'kind', 'executionClass', 'key', 'fingerprint', 'resources'].map(key => [key, work[key]])));
        return nativeTaskScheduler.submit({ ...work, retry: false, run: async boundary => {
            const capture = Object.freeze({}), request = immutable({ sessionId: input.sessionId, revisionId: input.revisionId, requestId: input.invocationId,
                role: selected.resolved.route.role.replace(/^role\./, ''), routeRef: selected.pin.resourceRef,
                fallbackMode: 'disabled', outputContract: { name: 'atria_task', schema: selected.taskPlan.variant.outputSchema } });
            captures.set(capture, { host, owner: this.owner, handle, input: immutable(input), request, taskPlan: immutable(selected.taskPlan), boundary, expected,
                policy: immutable(snapshot.manifest.runtime.experienceContract.generationBudget), policyDigest: hash(snapshot.manifest.runtime.experienceContract.generationBudget),
                snapshotDigest: hash(snapshot), sourceRequest: { domain: 'native_session', sessionId: input.sessionId,
                    branchId: snapshot.revision.branchId, revisionId: input.revisionId } });
            try { return await this.#generate({ host, handle, input, snapshot, selected, capture, request, lanePlan: captured }); } finally { captures.delete(capture); }
        } });
    }
    async #generate({ host, handle, input, snapshot, selected, capture, request, lanePlan }) {
        await inspectNativeBackgroundGeneration(capture, { host, handle });
        await RunControl.prototype.checkGenerationQuota.call(this.owner.sessionCore.runs, handle, snapshot,
            { background: true, role: request.role, anchor: { invocationId: input.invocationId } },
            snapshot.manifest.runtime.experienceContract.generationBudget);
        const service = this.execution(), captured = await service.sourcePort.capture(handle, {
            domain: 'native_session', sessionId: input.sessionId, branchId: snapshot.revision.branchId, revisionId: input.revisionId });
        const logicalInputRef = immutable({ kind: 'native_background_intent', sourceBindingDigest: captured.sourceBinding.bindingDigest,
            invocationId: input.invocationId, requestId: request.requestId, role: request.role, taskId: input.taskId, variantId: input.variantId,
            inputDigest: hash(input.input), intentDigest: hash(selected.taskPlan.intent), configDigest: selected.configDigest,
            planRef: selected.binding.planRef, nodeId: selected.node.nodeId, routePin: selected.pin });
        const grantDigest = hash({ principal: 'original_native_pending_outbox', logicalInputRef });
        const decision = { grantDigest, capability: 'generation.send', risk: 'R1', requiresApproval: false,
            actionRef: { kind: 'native_model_send', runtimeRouteId: selected.resolved.route.runtimeRouteId },
            targetRef: { connectionProfileId: selected.resolved.connection.connectionProfileId, modelProfileId: selected.resolved.model.modelProfileId, pathFingerprint: selected.resolved.pathFingerprint },
            inputRef: logicalInputRef, inputHash: hash(logicalInputRef),
            endpointBindingDigest: hash({ pathFingerprint: selected.resolved.pathFingerprint, configDigest: selected.configDigest }),
            egressDigest: hash({ pathFingerprint: selected.resolved.pathFingerprint, sourceBindingDigest: captured.sourceBinding.bindingDigest, grantDigest, audience: { kind: 'task', id: input.taskId } }),
            budgetEnvelopeDigest: hash(selected.resolved.route.executionPolicy.computeBudget), dispatchPolicy: { idempotency: 'none', operationKey: null, reconcile: 'manual' } };
        const commandIdentity = { sessionId: input.sessionId, invocationId: input.invocationId };
        const root = await service.runs.get(handle, (await service.runs.start(handle, controlCommandId('native.background.start', commandIdentity), {
            planRef: selected.binding.planRef, sourceRequest: captures.get(capture).sourceRequest,
            retentionPolicyRef: { policyId: 'retain_native_background_until_explicit_release' } })).runId);
        if (root.status !== 'admitted' || root.attemptRefs.length || root.pendingEffectRefs.length) fail('native_orchestration_background_request_replayed');
        const state = { host, handle, input, selected, capture, request, sourceBinding: captured.sourceBinding, decision };
        this.#runs.set(root.runId, state);
        try {
            const { attemptId } = await service.runs.beginAttempt(handle, controlCommandId('native.background.attempt', commandIdentity), {
                ...runGuard(root), nodeId: selected.node.nodeId, inputRefs: [logicalInputRef], inputDigest: hash([logicalInputRef]), effectiveGrantDigest: grantDigest, budgetRef: root.budgetAuthorityRef });
            state.attemptId = attemptId;
            await new AttemptController({ runs: service.runs, authorizeAttempt: args => this.authorize(args) }).activate(handle,
                { ...runGuard(await service.runs.get(handle, root.runId)), attemptId });
            const effectId = 'oeffect_' + hash({ runId: root.runId, attemptId, taskId: input.taskId }).slice(0, 32); state.effectId = effectId;
            await service.effects.prepare(handle, { ...runGuard(await service.runs.get(handle, root.runId)), effectId, nodeAttemptId: attemptId,
                proposal: Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, decision[key]])) });
            const quotaProof = mintNativeBackgroundQuota(capture, { host, handle });
            const contextPackage = snapshot.manifest.runtime.experienceContract.contextRuntime || snapshot.manifest.runtime.experienceContract.processingRuntime
                ? await host.packageInstaller.open(handle, snapshot.session.packageId, snapshot.session.packageVersionId) : null;
            const contextOptions = nativeContextCompilationOptions(request, selected.resolved, nativeSessionContextOptions({ handle, snapshot,
                resolver: this.owner.modelResolver, contextPackage, role: selected.resolved.route.role, taskPlan: selected.taskPlan }));
            const port = new ContextPort({ sessionCore: this.owner.sessionCore, memoryAuthority: this.owner.memoryAuthority, taskCapture: capture, contextOptions,
                authorizeContext: async ({ request: contextRequest }) => {
                    await this.#current(state);
                    if (contextRequest.grantDigest !== grantDigest || !equal(contextRequest.audience, { kind: 'task', id: input.taskId })
                        || !equal(contextRequest.sourceBinding, state.sourceBinding) || !equal(contextRequest.inputRefs, [logicalInputRef]))
                        fail('native_orchestration_background_grant_denied');
                    return { allowed: true, grantDigest };
                } });
            const contextRequest = { ownerRef: { handle }, sourceBinding: state.sourceBinding, audience: { kind: 'task', id: input.taskId },
                taskPurpose: 'original-background-task', grantDigest, inputRefs: [logicalInputRef], tokenBudget: {
                    modelContextLimit: selected.resolved.model.limits.contextTokens, responseReserve: effectiveOutputReserve(selected.resolved) } };
            const limits = selected.resolved.route.executionPolicy.computeBudget, send = await service.generationSend(handle, { runId: root.runId, effectId, limits, quotaProof });
            const compiled = await compileNativeContextMetered({ handle, port, request: contextRequest, bank: send.bank, budgetPort: service.budgetPort, root: await service.runs.get(handle, root.runId),
                effectId, limits, workDescriptor: { requestId: request.requestId, pathFingerprint: selected.resolved.pathFingerprint }, assertCurrent: () => this.#current(state), signal: captures.get(capture).boundary.signal });
            state.contextPort = port; state.context = compiled.compiled;
            await send.bindContext({ port, compiled: compiled.compiled, compileProof: compiled.proof });
            const scope = this.issueScope(host, handle, { runId: root.runId, effectId, request, logicalInputRef, logicalInputHash: hash(logicalInputRef), nativeBackgroundCapture: capture,
                options: { scheduled: true, taskPlan: selected.taskPlan, lanePlan, orchestrationSend: send }, revalidateConsume: async ({ tx } = {}) => {
                    await this.#current(state); await service.sourcePort.revalidate(handle, state.sourceBinding, tx ? { tx } : undefined);
                    await port.revalidate(handle, { context: compiled.compiled, phase: 'consume' });
                } });
            return (await this.port(host).generate(handle, scope, { signal: captures.get(capture).boundary.signal })).generated;
        } finally { this.#runs.delete(root.runId); }
    }
}
