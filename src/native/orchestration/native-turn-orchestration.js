import { ConflictError } from '../../storage/errors.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { hashNativeDocument as hash, cloneNativeDocument } from '../repositories/common.js';
import { assertObject, assertCounter, assertPlanRef, assertSourceSelector } from '../../../public/shared/native-orchestration-contracts.js';
import { createOrchestrationAuthoringService } from './authoring-service.js';
import { checkedRecord } from './plan-repository.js';
import { createOrchestrationExecutionService } from './execution-service.js';
import { AttemptController } from './attempt-controller.js';
import { ContextPort } from './context-port.js';
import { controlCommandId, runGuard } from './controller-common.js';
import { validateModelCapability } from './model-capability-authority.js';
import { assertNativeNarratorQuota } from './native-turn-quota.js';
import { ModelPort } from './model-port.js';
import { RouteResolver } from '../model-prompt-runtime/route-resolver.js';
import { immutable, checkCancellation, effectiveOutputReserve } from '../model-prompt-runtime/execution-utils.js';
import { selectNativeRuntimeRoute } from '../adapters/generation-host.js';
import { authorityTurnProof } from '../authority-turn.js';
import { assertRunAccess } from '../run-control.js';
import { compileNativeContextMetered } from './generation-local-work.js';
import { nativeSessionContextOptions, nativeContextCompilationOptions } from '../adapters/native-session-context.js';

const selections = new WeakMap();
const modelScopes = new WeakMap();
const fail = code => { throw new ConflictError(code); };
const equal = (a, b) => hash(a) === hash(b);
const sourceOf = base => ({ domain: 'native_session', sessionId: base.session.sessionId, branchId: base.revision.branchId, revisionId: base.revision.revisionId });
const anchorOf = base => ({ branchId: base.revision.branchId, revisionId: base.revision.revisionId });

/** Only this module's original fixed Turn producer can issue a model scope.
 * The body remains in original Source/Prompt services, never the RunLedger. */
export function resolveNativeNarratorScope(scope, host, handle) {
    const value = modelScopes.get(scope);
    if (!value || value.host !== host || value.handle !== handle || value.consumed) fail('native_orchestration_model_scope_invalid');
    modelScopes.delete(scope);
    return value.principal;
}

/** One original narrator composition, not a Graph runner or business writer. */
export class NativeNarratorOrchestrationAuthority {
    #execution;
    #ports = new Map();
    #runs = new Map();

    constructor({ engine, sessionCore, plans = null, modelResolver = null, contextOptions = {} }) {
        if (!engine || !sessionCore) throw new TypeError('Original Native Session/Engine required');
        Object.assign(this, { engine, sessionCore, plans, modelResolver, contextOptions });
    }

    get execution() {
        this.#execution ??= createOrchestrationExecutionService({ engine: this.engine, sessionCore: this.sessionCore,
            effectAuthority: {
                authorize: args => this.#authorize(args), verifySend: args => this.#verifySend(args),
                verifyObservation: args => {
                    const state = this.#runs.get(args.root.runId);
                    if (!state) fail('native_orchestration_model_completion_proof_required');
                    return this.#port(state.host).verifyObservation(args);
                },
                verifyApproval: () => fail('native_orchestration_approval_unavailable'),
            } });
        return this.#execution;
    }

    setModelPort(port) {
        if (!(port instanceof ModelPort) || port.runs !== this.execution.runs) throw new TypeError('Original ModelPort required');
        this.#ports.set(port.host, port);
    }

    #port(host) {
        let port = this.#ports.get(host);
        if (!port) { port = new ModelPort({ host, ...this.execution }); this.#ports.set(host, port); }
        return port;
    }

    async #binding(handle, base) {
        // No Binding means no V3 lifecycle, Run or ModelPort initialization.
        return this.engine.withTransaction(handle, async tx => {
            for (const entryPointId of [base.session.entryPointId, null]) {
                const selector = { domain: 'native_session', sessionId: base.session.sessionId, entryPointId };
                const bindingId = hash(selector);
                const row = await checkedRecord(tx, { kind: K.orchestrationBinding, handle, bindingId });
                if (!row) continue;
                const binding = row.doc;
                assertObject(binding, ['schemaVersion', 'bindingId', 'sourceSelector', 'planRef', 'version', 'changedBy', 'changedAt'], 'PlanBinding');
                assertSourceSelector(binding.sourceSelector); assertPlanRef(binding.planRef);
                assertCounter(binding.version, 'PlanBinding.version'); assertCounter(binding.changedAt, 'PlanBinding.changedAt');
                assertObject(binding.changedBy, ['handle'], 'PlanBinding.changedBy');
                if (binding.schemaVersion !== 1 || binding.bindingId !== bindingId || binding.changedBy.handle !== handle || !equal(binding.sourceSelector, selector)) fail('native_orchestration_binding_invalid');
                return binding;
            }
            return null;
        });
    }

    #supported(base, input, transaction) {
        const contract = base.manifest.runtime?.experienceContract, turn = contract?.taskRuntime?.turn;
        const logic = base.entryPoint.runtime?.game?.logic ?? base.manifest.runtime?.game?.logic;
        const authority = Boolean(contract?.authorityRuntime);
        if ((authority ? !transaction : transaction || logic) || !turn || turn.policy !== 'authority-first' || turn.stages.length
            || turn.narratorTaskId || turn.interpreterTaskId || contract.processingRuntime?.processors.some(item => item.stage === 'output')
            || (input.hostMemoryEvidence?.length ?? Object.keys(input.hostMemoryEvidence ?? {}).length)
            || Object.keys(input.stageInputs ?? {}).length || Object.keys(input.slotBindings ?? {}).length || Object.keys(input.variants ?? {}).length)
            fail('native_orchestration_turn_scope_unavailable');
        if (!authority && input.userInput !== undefined && (base.timeline.at(-1)?.role !== 'user' || input.userInput !== base.timeline.at(-1).content)) fail('native_orchestration_turn_input_stale');
    }

    async #describe(host, handle, base, input, transaction) {
        const binding = await this.#binding(handle, base);
        if (!binding) return null;
        this.#supported(base, input, transaction);
        const current = await this.sessionCore.observe(handle, base.session.sessionId);
        if (!equal(sourceOf(current), sourceOf(base)) || current.session.packageVersionId !== base.session.packageVersionId) fail('native_orchestration_source_stale');
        // This pure authority read also runs inside Effect/consume Engine
        // transactions. Taking the Session write lock here would invert the
        // original Session -> Engine order against a concurrent publication.
        await this.engine.withTransaction(handle, tx => assertRunAccess(tx, handle, base.session.sessionId, 'generate'));
        if (!(this.modelResolver instanceof RouteResolver) || host.turnOrchestration !== this || host.sessionCore !== this.sessionCore || host.persistence._engine !== this.engine) fail('native_orchestration_model_authority_unavailable');
        this.plans ??= createOrchestrationAuthoringService(this.engine, { sessionCore: this.sessionCore, modelResolver: this.modelResolver }).plans;
        // getBinding uses the original domain authorization, independently of
        // validating the raw subject/key above and its exact/default priority.
        if (!equal(await this.plans.getBinding(handle, binding.sourceSelector), binding)) fail('native_orchestration_binding_changed');
        const plan = await this.plans.getRevision(handle, binding.planRef), graph = plan.definition;
        const agents = graph.nodes.filter(node => node.kind === 'agent'), outputs = graph.nodes.filter(node => node.kind === 'output');
        if (agents.length !== 1 || outputs.length !== 1 || graph.nodes.length !== 2 || graph.edges.length !== 1
            || !equal(graph.entryNodeIds, [agents[0].nodeId]) || !equal(graph.capabilityCeiling, ['generation.send'])
            || !equal(agents[0].capabilities, ['generation.send']) || outputs[0].capabilities.length
            || agents[0].inputs.length || agents[0].outputs.length !== 1 || outputs[0].inputs.length !== 1 || outputs[0].outputs.length
            || plan.dependencyPins.length !== 1 || agents[0].dependencyPinIds.length !== 1 || outputs[0].dependencyPinIds.length
            || graph.outputContract.kind !== 'result' || graph.outputContract.allowPartial
            || graph.edges[0].from.nodeId !== agents[0].nodeId || graph.edges[0].to.nodeId !== outputs[0].nodeId
            || graph.edges[0].condition !== 'always' || graph.edges[0].loopBack || graph.edges[0].maxVisits !== 1
            || graph.graphChangePolicy.allowedOperations.length) fail('native_orchestration_turn_plan_unavailable');
        const node = agents[0], pin = plan.dependencyPins.find(pin => pin.pinId === node.policy.agentPinId && node.dependencyPinIds.includes(pin.pinId));
        const validation = await validateModelCapability({ handle, definition: graph, dependencyPins: plan.dependencyPins, resolver: this.modelResolver });
        if (validation.issues.length || pin?.port !== 'model' || pin.resourceRef.scope !== 'player') fail('native_orchestration_model_authority_unavailable');
        if (input.routeRef !== undefined) {
            assertObject(input.routeRef, ['scope', 'runtimeRouteId'], 'Original narrator route');
            if (input.routeRef.scope !== 'player' || input.routeRef.runtimeRouteId !== pin.resourceRef.runtimeRouteId) fail('native_orchestration_turn_route_mismatch');
        }
        const route = selectNativeRuntimeRoute(await host.persistence.listRuntimeRoutes(handle), 'role.narrator', input.routeRef);
        if (route.runtimeRouteId !== pin.resourceRef.runtimeRouteId || hash(route) !== pin.integrity) fail('native_orchestration_turn_route_mismatch');
        const resolved = await this.modelResolver.resolve({ handle, routeRef: pin.resourceRef, role: 'role.narrator' });
        if (!resolved.route.executionPolicy?.computeBudget?.localWork) fail('native_orchestration_context_budget_unavailable');
        const configDigest = hash({ route: resolved.route, model: resolved.model, connection: resolved.connection, generation: resolved.generation, resources: resolved.resources });
        return { binding, plan, node, pin, resolved, configDigest };
    }

    async preflightBinding({ host, handle, base, input, transaction = null }) {
        const description = await this.#describe(host, handle, base, input, transaction);
        if (!description) return null;
        const selection = Object.freeze({});
        selections.set(selection, { ...description, authority: this, host, handle, base, input: immutable(input), transaction });
        return selection;
    }

    async #current(selection) {
        const state = selections.get(selection);
        if (!state || state.authority !== this) fail('native_orchestration_turn_selection_invalid');
        const current = await this.#describe(state.host, state.handle, state.base, state.input, state.transaction);
        if (!current || !equal(current.binding, state.binding) || current.configDigest !== state.configDigest || current.plan.definitionHash !== state.plan.definitionHash)
            fail('native_orchestration_turn_selection_stale');
        return state;
    }

    async #authorize({ handle, root, attempt, proposal, intent }) {
        const state = this.#runs.get(root.runId);
        if (!state || state.handle !== handle || !equal(root.planRef, state.selectionState.binding.planRef)
            || root.sourceBinding.bindingDigest !== state.sourceBinding.bindingDigest) fail('native_orchestration_turn_grant_denied');
        await this.#current(state.selection);
        assertNativeNarratorQuota(state.quotaProof, state.proofExpected);
        if (attempt && (attempt.nodeId !== state.selectionState.node.nodeId || attempt.effectiveGrantDigest !== state.decision.grantDigest)) fail('native_orchestration_turn_grant_denied');
        if (proposal && !equal(proposal, Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(field => [field, state.decision[field]])))) fail('native_orchestration_turn_input_stale');
        if (intent && (intent.nodeAttemptId !== state.attemptId || intent.inputHash !== state.decision.inputHash)) fail('native_orchestration_turn_grant_denied');
        return cloneNativeDocument(state.decision);
    }

    async #verifySend({ handle, root, intent, resolved, snapshot, compiledBinding }) {
        const state = this.#runs.get(root.runId);
        await this.#authorize({ handle, root, intent });
        if (snapshot.requestId !== state.request.requestId || snapshot.runtimeRouteId !== state.selectionState.resolved.route.runtimeRouteId
            || !equal(snapshot.promptProgramRef, resolved.route.promptProgramRef) || !equal(snapshot.generationProfileRef, resolved.route.generationProfileRef)
            || hash({ route: resolved.route, model: resolved.model, connection: resolved.connection, generation: resolved.generation, resources: resolved.resources }) !== state.selectionState.configDigest
            || compiledBinding.fingerprint !== snapshot.diagnostics.compiledBinding.fingerprint) fail('native_orchestration_turn_input_stale');
        const expected = await state.contextPort.provider(handle, { context: state.context }).buildRequestContextPlan(state.request, resolved);
        if (!equal(expected, snapshot.contextPlan)) fail('native_orchestration_turn_context_mismatch');
    }

    async prepareNarrator({ host, handle, base, input, lanePlan, request, quotaProof, selection, signal, authorityTurn = null }) {
        if (selection === null) return null;
        checkCancellation(signal);
        const selected = await this.#current(selection);
        const { requestId: _requestId, ...turnRequest } = input;
        assertObject(request, ['sessionId', 'revisionId', 'requestId', 'role', 'messages', ...(Object.hasOwn(request, 'routeRef') ? ['routeRef'] : [])], 'Original narrator request');
        const normalizedRequest = Object.fromEntries(Object.entries(request).filter(([, value]) => value !== undefined));
        const requestHash = hash(selected.transaction ? { ...turnRequest, transaction: selected.transaction } : turnRequest), proofExpected = { host, sessionCore: this.sessionCore, handle, sessionId: base.session.sessionId,
            requestId: input.invocationId, invocationId: input.invocationId, requestHash, selection, role: 'narrator', anchor: anchorOf(base),
            policy: base.manifest.runtime.experienceContract.generationBudget ?? null };
        const producerIdentity = assertNativeNarratorQuota(quotaProof, proofExpected);
        const originalAuthority = authorityTurn ? authorityTurnProof(this.sessionCore, handle, base, authorityTurn.proof) : null;
        if (Boolean(originalAuthority) !== Boolean(base.manifest.runtime.experienceContract.authorityRuntime)
            || (originalAuthority && (!equal(originalAuthority.selection, selected.transaction) || !equal(authorityTurn.base, base)
                || !equal(lanePlan.authorityContext?.snapshot, originalAuthority.prepared.candidate)
                || !equal(lanePlan.authorityContext?.receipt, originalAuthority.prepared.receipt)))) fail('native_orchestration_turn_authority_invalid');
        const authorityRef = originalAuthority ? { kind: 'native_authority_candidate', identity: originalAuthority.prepared.identity,
            candidateDigest: hash(originalAuthority.prepared.candidate), receiptDigest: hash(originalAuthority.prepared.receipt) } : null;
        if (selected.host !== host || selected.handle !== handle || !equal(sourceOf(base), sourceOf(selected.base)) || !equal(input, selected.input)
            || !equal(normalizedRequest, { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, requestId: input.invocationId,
                role: 'narrator', ...(input.routeRef === undefined ? {} : { routeRef: input.routeRef }), messages: [] })) fail('native_orchestration_turn_input_stale');
        if (this.#runs.size >= 64) fail('native_orchestration_model_busy');
        const service = this.execution, captured = await service.sourcePort.capture(handle, sourceOf(base));
        const bindingRef = { bindingId: selected.binding.bindingId, version: selected.binding.version };
        const grantDigest = hash({ owner: handle, sourceBindingDigest: captured.sourceBinding.bindingDigest, bindingRef, planRef: selected.binding.planRef,
            nodeId: selected.node.nodeId, principal: 'original_native_narrator', invocationId: input.invocationId, requestHash, configDigest: selected.configDigest, audience: { kind: 'narrator' }, authorityRef });
        const logicalInputRef = { kind: 'native_turn_intent', sourceRef: { ...captured.sourceBinding.sourceRef, packageId: base.session.packageId, packageVersionId: base.session.packageVersionId },
            planRef: selected.binding.planRef, nodeId: selected.node.nodeId, bindingRef, invocationId: input.invocationId, requestHash, role: 'narrator',
            routeRef: selected.pin.resourceRef, routeIntegrity: selected.pin.integrity, promptProgramRef: selected.resolved.route.promptProgramRef,
            generationProfileRef: selected.resolved.route.generationProfileRef, resourceDigest: hash(selected.resolved.resources), audience: { kind: 'narrator' }, authorityRef, grantDigest };
        const decision = { actionRef: { kind: 'native_model_send', runtimeRouteId: selected.resolved.route.runtimeRouteId },
            targetRef: { connectionProfileId: selected.resolved.connection.connectionProfileId, modelProfileId: selected.resolved.model.modelProfileId, pathFingerprint: selected.resolved.pathFingerprint },
            inputRef: logicalInputRef, inputHash: hash(logicalInputRef), capability: 'generation.send', grantDigest,
            endpointBindingDigest: hash({ pathFingerprint: selected.resolved.pathFingerprint, configDigest: selected.configDigest }), risk: 'R1', requiresApproval: false,
            egressDigest: hash({ pathFingerprint: selected.resolved.pathFingerprint, sourceBindingDigest: captured.sourceBinding.bindingDigest, grantDigest, audience: 'narrator' }),
            budgetEnvelopeDigest: hash(selected.resolved.route.executionPolicy.computeBudget), dispatchPolicy: { idempotency: 'none', operationKey: null, reconcile: 'manual' } };
        const commandIdentity = { sessionId: base.session.sessionId, branchId: base.revision.branchId, revisionId: base.revision.revisionId, invocationId: input.invocationId };
        const root = await service.runs.start(handle, controlCommandId('native.turn.start', commandIdentity), { planRef: selected.binding.planRef,
            sourceRequest: sourceOf(base), retentionPolicyRef: { policyId: 'retain_native_turn_until_explicit_release' } });
        const state = { host, handle, selection, selectionState: selected, sourceBinding: captured.sourceBinding, decision, quotaProof, proofExpected, request: immutable(normalizedRequest) };
        this.#runs.set(root.runId, state);
        try {
            const { attemptId } = await service.runs.beginAttempt(handle, controlCommandId('native.turn.attempt', commandIdentity), { ...runGuard(root), nodeId: selected.node.nodeId,
                inputRefs: [logicalInputRef], inputDigest: hash([logicalInputRef]), effectiveGrantDigest: grantDigest, budgetRef: root.budgetAuthorityRef });
            state.attemptId = attemptId;
            await new AttemptController({ runs: service.runs, authorizeAttempt: args => this.#authorize(args) }).activate(handle, { ...runGuard(await service.runs.get(handle, root.runId)), attemptId });
            const effectId = 'oeffect_' + hash({ runId: root.runId, attemptId, purpose: 'native_narrator' }).slice(0, 32);
            await service.effects.prepare(handle, { ...runGuard(await service.runs.get(handle, root.runId)), effectId, nodeAttemptId: attemptId,
                proposal: Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(field => [field, decision[field]])) });
            const contextSnapshot = originalAuthority?.prepared.candidate ?? base;
            const contextPackage = contextSnapshot.manifest.runtime.experienceContract.contextRuntime || contextSnapshot.manifest.runtime.experienceContract.processingRuntime
                ? await host.packageInstaller.open(handle, base.session.packageId, base.session.packageVersionId) : null;
            const nativeOptions = nativeSessionContextOptions({ handle, snapshot: contextSnapshot, resolver: this.modelResolver, contextPackage,
                role: 'role.narrator', lanePlan, authorityContext: lanePlan.authorityContext });
            const contextOptions = nativeContextCompilationOptions(state.request, selected.resolved, { ...this.contextOptions, ...nativeOptions });
            state.contextPort = new ContextPort({ sessionCore: this.sessionCore, contextOptions, authorityTurn,
                compilationInputs: contextPackage ? { manifest: contextPackage.manifest, sourceFiles: [...contextPackage.sourceFiles] } : null,
                authorizeContext: async ({ request: contextRequest }) => {
                    await this.#current(selection); assertNativeNarratorQuota(quotaProof, proofExpected);
                    if (contextRequest.taskPurpose !== 'original_native_narrator' || !equal(contextRequest.audience, { kind: 'narrator' }) || contextRequest.grantDigest !== grantDigest
                || !equal(contextRequest.sourceBinding, captured.sourceBinding) || !equal(contextRequest.inputRefs, [logicalInputRef])) fail('native_orchestration_context_denied');
                    return { allowed: true, grantDigest };
                } });
            const contextRequest = { ownerRef: { handle }, sourceBinding: captured.sourceBinding, audience: { kind: 'narrator' },
                taskPurpose: 'original_native_narrator', grantDigest, inputRefs: [logicalInputRef], tokenBudget: {
                    modelContextLimit: selected.resolved.model.limits.contextTokens, responseReserve: effectiveOutputReserve(selected.resolved) } };
            const orchestrationSend = await service.generationSend(handle, { runId: root.runId, effectId, limits: selected.resolved.route.executionPolicy.computeBudget,
                quotaProof });
            const metered = await compileNativeContextMetered({ handle, port: state.contextPort, request: contextRequest, bank: orchestrationSend.bank,
                budgetPort: service.budgetPort, root: await service.runs.get(handle, root.runId), effectId, limits: selected.resolved.route.executionPolicy.computeBudget,
                workDescriptor: { requestId: state.request.requestId, pathFingerprint: selected.resolved.pathFingerprint },
                assertCurrent: async () => {
                    await this.#current(selection); assertNativeNarratorQuota(quotaProof, proofExpected);
                    await service.sourcePort.revalidate(handle, captured.sourceBinding);
                }, signal });
            state.context = metered.compiled;
            await orchestrationSend.bindContext({ port: state.contextPort, compiled: state.context, compileProof: metered.proof });
            const scope = Object.freeze({});
            modelScopes.set(scope, { host, handle, consumed: false, principal: { runId: root.runId, effectId, request: state.request, logicalInputRef: immutable(logicalInputRef), logicalInputHash: decision.inputHash,
                nativeTurnPermit: producerIdentity.permit,
                options: { scheduled: true, lanePlan, orchestrationSend }, revalidateConsume: async ({ tx } = {}) => {
                    await this.#current(selection); assertNativeNarratorQuota(quotaProof, proofExpected);
                    await service.sourcePort.revalidate(handle, captured.sourceBinding, tx ? { tx } : undefined);
                    await state.contextPort.revalidate(handle, { context: state.context, phase: 'consume' });
                } } });
            return scope;
        } catch (error) { this.#runs.delete(root.runId); throw error; }
    }

    async executeNarrator(args) {
        const scope = await this.prepareNarrator(args);
        if (scope === null) return null;
        const { runId } = modelScopes.get(scope).principal;
        try {
            const { generated } = await this.#port(args.host).generate(args.handle, scope, { signal: args.signal });
            return generated;
        } finally { this.#runs.delete(runId); modelScopes.delete(scope); }
    }
}
