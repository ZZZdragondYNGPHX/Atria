import { ConflictError } from '../../storage/errors.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { hashNativeDocument as hash, cloneNativeDocument } from '../repositories/common.js';
import { assertObject, assertCounter, assertPlanRef, assertSourceSelector } from '../../../public/shared/native-orchestration-contracts.js';
import { hasRetainedOrchestrationCompute } from '../../../public/shared/native-compute-budget.js';
import { createOrchestrationAuthoringService } from './authoring-service.js';
import { checkedRecord } from './plan-repository.js';
import { createOrchestrationExecutionService } from './execution-service.js';
import { AttemptController } from './attempt-controller.js';
import { ContextPort } from './context-port.js';
import { controlCommandId, runGuard, readAttempt } from './controller-common.js';
import { TransitionController } from './transition-controller.js';
import { validateModelCapability } from './model-capability-authority.js';
import { assertNativeTurnQuota, assertNativeTurnOutputQuota } from './native-turn-quota.js';
import { inspectNativeAuthorityResolver } from './authority-resolver-context.js';
import { ModelPort } from './model-port.js';
import { SourcePort } from './source-port.js';
import { readSessionTurnOutput } from '../session-turn-output.js';
import { RouteResolver } from '../model-prompt-runtime/route-resolver.js';
import { immutable, checkCancellation, effectiveOutputReserve } from '../model-prompt-runtime/execution-utils.js';
import { selectNativeRuntimeRoute } from '../adapters/generation-host.js';
import { authorityTurnProof } from '../authority-turn.js';
import { assertRunAccess, readRunControl } from '../run-control.js';
import { compileNativeContextMetered } from './generation-local-work.js';
import { nativeSessionContextOptions, nativeContextCompilationOptions } from '../adapters/native-session-context.js';
import { NativeProjectOrchestrationAuthority } from './native-project-orchestration.js';
import { NativeRpOrchestrationAuthority } from './native-rp-generation.js';
import { RpRunControl } from '../rp-run-control.js';
import { NativeBackgroundOrchestrationAuthority } from './native-background-generation.js';

const selections = new WeakMap();
const modelScopes = new WeakMap();
const fail = code => { throw new ConflictError(code); };
const equal = (a, b) => hash(a) === hash(b);
const sourceOf = base => ({ domain: 'native_session', sessionId: base.session.sessionId, branchId: base.revision.branchId, revisionId: base.revision.revisionId });
const anchorOf = base => ({ branchId: base.revision.branchId, revisionId: base.revision.revisionId });

/** Only this module's original fixed domain producers can issue a model scope.
 * The body remains in original Source/Prompt services, never the RunLedger. */
export function resolveNativeNarratorScope(scope, host, handle) {
    const value = modelScopes.get(scope);
    if (!value || value.host !== host || value.handle !== handle || value.consumed) fail('native_orchestration_model_scope_invalid');
    modelScopes.delete(scope);
    return value.principal;
}

/** Original fixed Session Turn composition, not a Graph runner or business writer. */
export class NativeNarratorOrchestrationAuthority {
    #execution;
    #ports = new Map();
    #runs = new Map();
    #project;
    #rp;
    #background;
    #narrations = new WeakMap();
    #outputs = new WeakMap();

    constructor({ engine, sessionCore, memoryAuthority = null, projectAgent = null, projectRepository = null, rpControl = new RpRunControl({ engine }), plans = null, modelResolver = null, contextOptions = {} }) {
        if (!engine || !sessionCore) throw new TypeError('Original Native Session/Engine required');
        Object.assign(this, { engine, sessionCore, memoryAuthority, projectAgent, projectRepository, rpControl, plans, modelResolver, contextOptions });
    }

    get execution() {
        this.#execution ??= createOrchestrationExecutionService({ engine: this.engine, sessionCore: this.sessionCore,
            projectAgent: this.projectAgent, projectRepository: this.projectRepository, rpControl: this.rpControl,
            effectAuthority: {
                authorize: args => args.root.sourceBinding.sourceAuthority === 'rp_chat' ? this.#rpAuthority().authorize(args)
                    : args.root.sourceBinding.sourceAuthority === 'project' ? this.#projectAuthority().authorize(args)
                        : this.#backgroundAuthority().hasRun(args.root.runId) ? this.#backgroundAuthority().authorize(args) : this.#authorize(args),
                verifySend: args => args.root.sourceBinding.sourceAuthority === 'rp_chat' ? this.#rpAuthority().verifySend(args)
                    : args.root.sourceBinding.sourceAuthority === 'project' ? this.#projectAuthority().verifySend(args)
                        : this.#backgroundAuthority().hasRun(args.root.runId) ? this.#backgroundAuthority().verifySend(args) : this.#verifySend(args),
                verifyObservation: args => {
                    if (args.root.sourceBinding.sourceAuthority === 'rp_chat') return this.#rpAuthority().verifyObservation(args);
                    if (args.root.sourceBinding.sourceAuthority === 'project') return this.#projectAuthority().verifyObservation(args);
                    if (this.#backgroundAuthority().hasRun(args.root.runId)) return this.#backgroundAuthority().verifyObservation(args);
                    const state = this.#runs.get(args.root.runId);
                    if (!state) fail('native_orchestration_model_completion_proof_required');
                    return this.#port(state.host).verifyObservation(args);
                },
                verifyApproval: () => fail('native_orchestration_approval_unavailable'),
                authorizeDelegation: args => args.parent.sourceBinding.sourceAuthority === 'rp_chat'
                    ? this.#rpAuthority().authorizeDelegation(args) : fail('native_orchestration_delegation_unavailable'),
            } });
        return this.#execution;
    }

    #projectAuthority() {
        this.#project ??= new NativeProjectOrchestrationAuthority({ owner: this, projectAgent: this.projectAgent, projectRepository: this.projectRepository,
            execution: () => this.execution, port: host => this.#port(host), releasePort: host => this.#ports.delete(host), issueScope: (host, handle, principal) => {
                const scope = Object.freeze({}); modelScopes.set(scope, { host, handle, consumed: false, principal }); return scope;
            } });
        return this.#project;
    }

    preflightProjectBinding(args) { return this.#projectAuthority().preflight(args); }
    projectSelectionDescriptor(selection) { return this.#projectAuthority().descriptor(selection); }
    prepareProjectRound(args) { return this.#projectAuthority().prepare(args); }
    executeProjectRound(args) { return this.#projectAuthority().execute(args); }

    #rpAuthority() {
        this.#rp ??= new NativeRpOrchestrationAuthority({ owner: this, execution: () => this.execution,
            port: host => this.#port(host), issueScope: (host, handle, principal) => {
                const scope = Object.freeze({}); modelScopes.set(scope, { host, handle, consumed: false, principal }); return scope;
            } });
        return this.#rp;
    }

    startRp(host, handle, input, options) { return this.#rpAuthority().start(host, handle, input, options); }
    authorizeTaskLocalOutput(args) { return this.#rpAuthority().authorizeTaskLocalOutput(args); }
    authorizeRpReturn(args) { return this.#rpAuthority().authorizeRpReturn(args); }
    authorizeRpOutputCompletion(args) { return this.#rpAuthority().authorizeRpOutputCompletion(args); }
    prepareRpOutputEffect(args) { return this.#rpAuthority().prepareRpOutputEffect(args); }
    registerRpOutputClaim(args) { return this.#rpAuthority().registerRpOutputClaim(args); }
    authorizeParentResult(args) { return this.#rpAuthority().authorizeParentResult(args); }

    #backgroundAuthority() {
        this.#background ??= new NativeBackgroundOrchestrationAuthority({ owner: this, execution: () => this.execution, port: host => this.#port(host),
            issueScope: (host, handle, principal) => {
                const scope = Object.freeze({}); modelScopes.set(scope, { host, handle, consumed: false, principal }); return scope;
            } });
        return this.#background;
    }
    startBackgroundTask(host, handle, input) { return this.#backgroundAuthority().start(host, handle, input); }

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
        if ((!authority && (transaction || logic)) || !turn || turn.policy !== 'authority-first' || turn.stages.length
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
        this.plans ??= createOrchestrationAuthoringService(this.engine, { sessionCore: this.sessionCore,
            projectAgent: this.projectAgent, studio: this.projectAgent?._studio, rpControl: this.rpControl, modelResolver: this.modelResolver }).plans;
        // getBinding uses the original domain authorization, independently of
        // validating the raw subject/key above and its exact/default priority.
        if (!equal(await this.plans.getBinding(handle, binding.sourceSelector), binding)) fail('native_orchestration_binding_changed');
        const plan = await this.plans.getRevision(handle, binding.planRef), graph = plan.definition;
        const agents = graph.nodes.filter(node => node.kind === 'agent'), outputs = graph.nodes.filter(node => node.kind === 'output');
        const needsResolver = Boolean(base.manifest.runtime.experienceContract.authorityRuntime && !transaction && !base.timeline.at(-1)?.metadata?.atri_authority_retry);
        if (needsResolver && !base.manifest.runtime.experienceContract.generationBudget) fail('native_orchestration_turn_scope_unavailable');
        const count = needsResolver ? 2 : 1;
        if (agents.length !== count || outputs.length !== 1 || graph.nodes.length !== count + 1 || graph.edges.length !== count
            || !equal(graph.capabilityCeiling, ['generation.send'])
            || agents.some(node => !equal(node.capabilities, ['generation.send']) || node.outputs.length !== 1 || node.dependencyPinIds.length !== 1)
            || outputs[0].capabilities.length || outputs[0].inputs.length !== 1 || outputs[0].outputs.length
            || plan.dependencyPins.length !== count || outputs[0].dependencyPinIds.length
            || graph.outputContract.kind !== 'result' || graph.outputContract.allowPartial
            || graph.edges.some(edge => edge.condition !== 'always' || edge.loopBack || edge.maxVisits !== 1)
            || graph.graphChangePolicy.allowedOperations.length) fail('native_orchestration_turn_plan_unavailable');
        const validation = await validateModelCapability({ handle, definition: graph, dependencyPins: plan.dependencyPins, resolver: this.modelResolver });
        if (validation.issues.length) fail('native_orchestration_model_authority_unavailable');
        const profiles = {}, routes = await host.persistence.listRuntimeRoutes(handle);
        for (const node of agents) {
            const pin = plan.dependencyPins.find(pin => pin.pinId === node.policy.agentPinId && node.dependencyPinIds.includes(pin.pinId));
            if (pin?.port !== 'model' || pin.resourceRef.scope !== 'player') fail('native_orchestration_model_authority_unavailable');
            const pinned = routes.find(route => route.runtimeRouteId === pin.resourceRef.runtimeRouteId), role = pinned?.role;
            if (!['role.narrator', ...(needsResolver ? ['role.intent_resolver'] : [])].includes(role) || profiles[role]) fail('native_orchestration_turn_route_mismatch');
            const explicit = role === 'role.narrator' ? input.routeRef : undefined;
            if (explicit !== undefined) {
                assertObject(explicit, ['scope', 'runtimeRouteId'], 'Original narrator route');
                if (explicit.scope !== 'player' || explicit.runtimeRouteId !== pin.resourceRef.runtimeRouteId) fail('native_orchestration_turn_route_mismatch');
            }
            const route = selectNativeRuntimeRoute(routes, role, explicit);
            if (route.runtimeRouteId !== pin.resourceRef.runtimeRouteId || hash(route) !== pin.integrity) fail('native_orchestration_turn_route_mismatch');
            const resolved = await this.modelResolver.resolve({ handle, routeRef: pin.resourceRef, role,
                ...(role === 'role.intent_resolver' ? { requirements: ['generation.tools'] } : {}) });
            if (!resolved.route.executionPolicy?.computeBudget?.localWork) fail('native_orchestration_context_budget_unavailable');
            const configDigest = hash({ route: resolved.route, model: resolved.model, connection: resolved.connection, generation: resolved.generation, resources: resolved.resources });
            profiles[role] = { node, pin, resolved, configDigest };
        }
        const narrator = profiles['role.narrator'], resolver = profiles['role.intent_resolver'];
        if (!narrator || Boolean(resolver) !== needsResolver || !equal(graph.entryNodeIds, [(resolver ?? narrator).node.nodeId])
            || (resolver ?? narrator).node.inputs.length || narrator.node.inputs.length !== (resolver ? 1 : 0)
            || narrator.node.outputs[0].type !== 'text' || outputs[0].inputs[0].type !== 'text'
            || (resolver && (resolver.node.outputs[0].type !== 'json' || narrator.node.inputs[0].type !== 'json' || !narrator.node.inputs[0].required))
            || !graph.edges.some(edge => edge.from.nodeId === narrator.node.nodeId && edge.to.nodeId === outputs[0].nodeId)
            || (resolver && !graph.edges.some(edge => edge.from.nodeId === resolver.node.nodeId && edge.to.nodeId === narrator.node.nodeId))) fail('native_orchestration_turn_plan_unavailable');
        return { binding, plan, ...narrator, resolver, topologyDigest: hash(Object.entries(profiles).map(([role, value]) => ({ role, configDigest: value.configDigest }))) };
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
        if (!current || !equal(current.binding, state.binding) || current.topologyDigest !== state.topologyDigest || current.plan.definitionHash !== state.plan.definitionHash)
            fail('native_orchestration_turn_selection_stale');
        return state;
    }

    async #authorize({ handle, root, attempt, proposal, intent }) {
        const state = this.#runs.get(root.runId);
        if (!state || state.handle !== handle || !equal(root.planRef, state.selectionState.binding.planRef)
            || root.sourceBinding.bindingDigest !== state.sourceBinding.bindingDigest) fail('native_orchestration_turn_grant_denied');
        await this.#current(state.selection);
        assertNativeTurnQuota(state.quotaProof, state.proofExpected);
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

    async prepareNarrator(args) { return this.#prepareRole(args, 'narrator'); }

    async prepareResolver(args) { return this.#prepareRole(args, 'intent_resolver'); }

    async #prepareRole({ host, handle, base, input, lanePlan, request, quotaProof, selection, signal, authorityTurn = null, resolverCapture = null }, role) {
        if (selection === null) return null;
        checkCancellation(signal);
        const selectionState = await this.#current(selection), resolverRole = role === 'intent_resolver';
        if (resolverRole && !selectionState.resolver) fail('native_orchestration_turn_scope_unavailable');
        const selected = resolverRole ? { ...selectionState, ...selectionState.resolver } : selectionState;
        const resolverIdentity = resolverRole ? inspectNativeAuthorityResolver(resolverCapture, { host, sessionCore: this.sessionCore, handle }) : null;
        const { requestId: _requestId, ...turnRequest } = input;
        assertObject(request, ['sessionId', 'revisionId', 'requestId', 'role', ...(!resolverRole ? ['messages'] : []), ...(Object.hasOwn(request, 'routeRef') ? ['routeRef'] : [])], 'Original Turn request');
        const normalizedRequest = Object.fromEntries(Object.entries(request).filter(([, value]) => value !== undefined));
        const requestHash = hash(selected.transaction ? { ...turnRequest, transaction: selected.transaction } : turnRequest), proofExpected = { host, sessionCore: this.sessionCore, handle, sessionId: base.session.sessionId,
            requestId: input.invocationId + (resolverRole ? ':intent' : ''), invocationId: input.invocationId, requestHash, selection, role, anchor: anchorOf(base),
            policy: base.manifest.runtime.experienceContract.generationBudget ?? null };
        const producerIdentity = assertNativeTurnQuota(quotaProof, proofExpected);
        if (resolverIdentity && (!equal(resolverIdentity.base, base) || resolverIdentity.producer.selection !== selection
            || resolverIdentity.producer.requestHash !== requestHash || authorityTurn)) fail('native_orchestration_turn_authority_invalid');
        const originalAuthority = authorityTurn ? authorityTurnProof(this.sessionCore, handle, base, authorityTurn.proof) : null;
        if ((!resolverRole && Boolean(originalAuthority) !== Boolean(base.manifest.runtime.experienceContract.authorityRuntime))
            || (originalAuthority && ((selected.transaction && !equal(originalAuthority.selection, selected.transaction)) || !equal(authorityTurn.base, base)
                || !equal(lanePlan.authorityContext?.snapshot, originalAuthority.prepared.candidate)
                || !equal(lanePlan.authorityContext?.receipt, originalAuthority.prepared.receipt)))) fail('native_orchestration_turn_authority_invalid');
        const authorityRef = originalAuthority ? { kind: 'native_authority_candidate', identity: originalAuthority.prepared.identity,
            candidateDigest: hash(originalAuthority.prepared.candidate), receiptDigest: hash(originalAuthority.prepared.receipt) } : null;
        if (selected.host !== host || selected.handle !== handle || !equal(sourceOf(base), sourceOf(selected.base)) || !equal(input, selected.input)
            || !equal(normalizedRequest, { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, requestId: proofExpected.requestId,
                role, ...(!resolverRole && input.routeRef !== undefined ? { routeRef: input.routeRef } : {}), ...(!resolverRole ? { messages: [] } : {}) })) fail('native_orchestration_turn_input_stale');
        if (originalAuthority && selected.resolver) await this.#originalSelection(handle, base, originalAuthority.selection);
        if (this.#runs.size >= 64) fail('native_orchestration_model_busy');
        const service = this.execution, captured = await service.sourcePort.capture(handle, sourceOf(base));
        const bindingRef = { bindingId: selected.binding.bindingId, version: selected.binding.version };
        const audience = { kind: resolverRole ? 'authority_intent' : 'narrator' }, taskPurpose = 'original_native_' + role;
        const grantDigest = hash({ owner: handle, sourceBindingDigest: captured.sourceBinding.bindingDigest, bindingRef, planRef: selected.binding.planRef,
            nodeId: selected.node.nodeId, principal: taskPurpose, invocationId: input.invocationId, requestHash, configDigest: selected.configDigest, audience, authorityRef });
        const logicalInputRef = { kind: 'native_turn_intent', sourceRef: { ...captured.sourceBinding.sourceRef, packageId: base.session.packageId, packageVersionId: base.session.packageVersionId },
            planRef: selected.binding.planRef, nodeId: selected.node.nodeId, bindingRef, invocationId: input.invocationId, requestHash, role,
            routeRef: selected.pin.resourceRef, routeIntegrity: selected.pin.integrity, promptProgramRef: selected.resolved.route.promptProgramRef,
            generationProfileRef: selected.resolved.route.generationProfileRef, resourceDigest: hash(selected.resolved.resources), audience, authorityRef,
            ...(resolverRole ? { resolverInput: resolverIdentity.logicalDescriptor } : {}), grantDigest };
        const decision = { actionRef: { kind: 'native_model_send', runtimeRouteId: selected.resolved.route.runtimeRouteId },
            targetRef: { connectionProfileId: selected.resolved.connection.connectionProfileId, modelProfileId: selected.resolved.model.modelProfileId, pathFingerprint: selected.resolved.pathFingerprint },
            inputRef: logicalInputRef, inputHash: hash(logicalInputRef), capability: 'generation.send', grantDigest,
            endpointBindingDigest: hash({ pathFingerprint: selected.resolved.pathFingerprint, configDigest: selected.configDigest }), risk: 'R1', requiresApproval: false,
            egressDigest: hash({ pathFingerprint: selected.resolved.pathFingerprint, sourceBindingDigest: captured.sourceBinding.bindingDigest, grantDigest, audience }),
            budgetEnvelopeDigest: hash(selected.resolved.route.executionPolicy.computeBudget), dispatchPolicy: { idempotency: 'none', operationKey: null, reconcile: 'manual' } };
        const commandIdentity = { sessionId: base.session.sessionId, branchId: base.revision.branchId, revisionId: base.revision.revisionId, invocationId: input.invocationId };
        const started = await service.runs.start(handle, controlCommandId('native.turn.start', commandIdentity), { planRef: selected.binding.planRef,
            sourceRequest: sourceOf(base), retentionPolicyRef: { policyId: 'retain_native_turn_until_explicit_release' } });
        const root = await service.runs.get(handle, started.runId);
        const state = { host, handle, selection, selectionState: selected, sourceBinding: captured.sourceBinding, decision, quotaProof, proofExpected, request: immutable(normalizedRequest) };
        this.#runs.set(root.runId, state);
        try {
            const admission = { inputRefs: [logicalInputRef], inputDigest: hash([logicalInputRef]), effectiveGrantDigest: grantDigest, budgetRef: root.budgetAuthorityRef };
            let attemptId;
            if (!resolverRole && selected.resolver) {
                let producerAttemptId = await this.engine.withTransaction(handle, async tx => {
                    const matches = [];
                    for (const ref of root.attemptRefs) {
                        const { doc } = await readAttempt(tx, handle, root, ref);
                        if (doc.nodeId === selected.resolver.node.nodeId && doc.status === 'completed') matches.push(doc.attemptId);
                    }
                    if (!matches.length && root.status === 'admitted' && !root.attemptRefs.length && !root.pendingEffectRefs.length) return null;
                    if (matches.length !== 1) fail('native_orchestration_resolver_completion_required');
                    return matches[0];
                });
                if (producerAttemptId === null) producerAttemptId = await this.#reuseSelection({ host, handle, base, root, selected, selection,
                    quotaProof, proofExpected, authorityTurn, commandIdentity });
                const transitionRoot = await service.runs.get(handle, root.runId);
                const edge = selected.plan.definition.edges.find(edge => edge.from.nodeId === selected.resolver.node.nodeId && edge.to.nodeId === selected.node.nodeId);
                ({ outcome: { attemptId } } = await new TransitionController({ runs: service.runs, authorizeTransition: async ({ handle: owner, root: current, producers }) => {
                    if (owner !== handle || current.runId !== root.runId || producers.length !== 1 || producers[0].attempt.attemptId !== producerAttemptId) fail('native_orchestration_turn_grant_denied');
                    await this.#current(selection); assertNativeTurnQuota(quotaProof, proofExpected);
                    await this.#originalSelection(handle, base, originalAuthority.selection);
                    return admission;
                } }).advance(handle, { ...runGuard(transitionRoot), bindings: [{ edgeId: edge.edgeId, producerAttemptId }], reservedAttemptId: null }));
            } else ({ attemptId } = await service.runs.beginAttempt(handle, controlCommandId('native.turn.attempt', { ...commandIdentity, role }), { ...runGuard(root), nodeId: selected.node.nodeId, ...admission }));
            state.attemptId = attemptId;
            await new AttemptController({ runs: service.runs, authorizeAttempt: args => this.#authorize(args) }).activate(handle, { ...runGuard(await service.runs.get(handle, root.runId)), attemptId });
            const effectId = 'oeffect_' + hash({ runId: root.runId, attemptId, purpose: 'native_' + role }).slice(0, 32);
            state.effectId = effectId;
            await service.effects.prepare(handle, { ...runGuard(await service.runs.get(handle, root.runId)), effectId, nodeAttemptId: attemptId,
                proposal: Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(field => [field, decision[field]])) });
            const contextSnapshot = originalAuthority?.prepared.candidate ?? base;
            const contextPackage = !resolverRole && (contextSnapshot.manifest.runtime.experienceContract.contextRuntime || contextSnapshot.manifest.runtime.experienceContract.processingRuntime)
                ? await host.packageInstaller.open(handle, base.session.packageId, base.session.packageVersionId) : null;
            const nativeOptions = nativeSessionContextOptions({ handle, snapshot: contextSnapshot, resolver: this.modelResolver, contextPackage,
                role: 'role.' + role, lanePlan, authorityContext: lanePlan.authorityContext });
            const contextOptions = nativeContextCompilationOptions(state.request, selected.resolved, { ...this.contextOptions, ...nativeOptions });
            state.contextPort = new ContextPort({ sessionCore: this.sessionCore, memoryAuthority: this.memoryAuthority, contextOptions, authorityTurn, resolverCapture,
                nativeOutputQuota: resolverRole ? null : { proof: quotaProof, expected: proofExpected },
                compilationInputs: contextPackage ? { manifest: contextPackage.manifest, sourceFiles: [...contextPackage.sourceFiles] } : null,
                authorizeContext: async ({ request: contextRequest, phase, finalizationPermit }) => {
                    await this.#current(selection);
                    if (phase === 'output') assertNativeTurnOutputQuota(quotaProof, finalizationPermit, proofExpected);
                    else assertNativeTurnQuota(quotaProof, proofExpected);
                    if (contextRequest.taskPurpose !== taskPurpose || !equal(contextRequest.audience, audience) || contextRequest.grantDigest !== grantDigest
                || !equal(contextRequest.sourceBinding, captured.sourceBinding) || !equal(contextRequest.inputRefs, [logicalInputRef])) fail('native_orchestration_context_denied');
                    return { allowed: true, grantDigest };
                } });
            const contextRequest = { ownerRef: { handle }, sourceBinding: captured.sourceBinding, audience,
                taskPurpose, grantDigest, inputRefs: [logicalInputRef], tokenBudget: {
                    modelContextLimit: selected.resolved.model.limits.contextTokens, responseReserve: effectiveOutputReserve(selected.resolved) } };
            const orchestrationSend = await service.generationSend(handle, { runId: root.runId, effectId, limits: selected.resolved.route.executionPolicy.computeBudget,
                quotaProof });
            const metered = await compileNativeContextMetered({ handle, port: state.contextPort, request: contextRequest, bank: orchestrationSend.bank,
                budgetPort: service.budgetPort, root: await service.runs.get(handle, root.runId), effectId, limits: selected.resolved.route.executionPolicy.computeBudget,
                workDescriptor: { requestId: state.request.requestId, pathFingerprint: selected.resolved.pathFingerprint },
                assertCurrent: async () => {
                    await this.#current(selection); assertNativeTurnQuota(quotaProof, proofExpected);
                    await service.sourcePort.revalidate(handle, captured.sourceBinding);
                }, signal });
            state.context = metered.compiled;
            if (resolverRole) state.request = immutable(state.contextPort.resolverRequest(handle, { context: state.context }));
            await orchestrationSend.bindContext({ port: state.contextPort, compiled: state.context, compileProof: metered.proof });
            const scope = Object.freeze({});
            modelScopes.set(scope, { host, handle, consumed: false, principal: { runId: root.runId, effectId, request: state.request, logicalInputRef: immutable(logicalInputRef), logicalInputHash: decision.inputHash,
                nativeTurnPermit: producerIdentity.permit,
                options: { scheduled: true, lanePlan, orchestrationSend }, revalidateConsume: async ({ tx } = {}) => {
                    await this.#current(selection); assertNativeTurnQuota(quotaProof, proofExpected);
                    await service.sourcePort.revalidate(handle, captured.sourceBinding, tx ? { tx } : undefined);
                    await state.contextPort.revalidate(handle, { context: state.context, phase: 'consume' });
                } } });
            return scope;
        } catch (error) { this.#runs.delete(root.runId); throw error; }
    }

    async #originalSelection(handle, base, expected) {
        return this.engine.withTransaction(handle, async tx => {
            const control = await readRunControl(tx, handle, base.session.sessionId);
            const operation = control.operations[hash({ lane: 'turn', anchor: anchorOf(base) })];
            const user = base.timeline.at(-1);
            if (!operation || operation.fingerprint !== hash({ player: user?.messageId, typed: null, userInput: user?.content })
                || !operation.selection || !equal(operation.selection, expected)) fail('native_orchestration_turn_authority_invalid');
            return { operationId: hash({ lane: 'turn', anchor: anchorOf(base) }), fingerprint: operation.fingerprint,
                selectionDigest: hash(operation.selection), retainedCompute: hasRetainedOrchestrationCompute(operation.compute) };
        });
    }

    async #reuseSelection({ host, handle, base, root, selected, selection, quotaProof, proofExpected, authorityTurn, commandIdentity }) {
        // A fresh Run may reuse the original durable selection. It cannot
        // replace any already attempted/unknown model work in this same Run.
        if (root.status !== 'admitted' || root.attemptRefs.length || root.pendingEffectRefs.length) fail('native_orchestration_resolver_completion_required');
        const original = authorityTurnProof(this.sessionCore, handle, base, authorityTurn.proof);
        const reference = await this.#originalSelection(handle, base, original.selection), profile = selected.resolver;
        if (!reference.retainedCompute) fail('native_orchestration_resolver_retention_unavailable');
        const inputRefs = [{ kind: 'native_authority_selection_reuse', ownerRef: { handle }, sourceBindingDigest: root.sourceBinding.bindingDigest,
            operationRef: reference, planRef: root.planRef, nodeId: profile.node.nodeId, routePin: profile.pin, configDigest: profile.configDigest }];
        const inputDigest = hash(inputRefs), effectiveGrantDigest = hash({ principal: 'original_native_authority_selection_reuse', inputDigest,
            invocationId: proofExpected.invocationId, requestHash: proofExpected.requestHash });
        const verify = async ({ handle: owner, tx, root: current, attempt }) => {
            if (owner !== handle || host !== selected.host || current.runId !== root.runId || attempt.nodeId !== profile.node.nodeId
                || attempt.effectiveGrantDigest !== effectiveGrantDigest || !equal(attempt.inputRefs, inputRefs)
                || !equal(attempt.budgetRef, root.budgetAuthorityRef) || attempt.effectRefs.length) fail('native_orchestration_turn_grant_denied');
            await this.#current(selection); assertNativeTurnQuota(quotaProof, proofExpected);
            await this.execution.sourcePort.revalidate(handle, root.sourceBinding, { tx });
            if (!equal(await this.#originalSelection(handle, base, original.selection), reference)) fail('native_orchestration_turn_authority_invalid');
        };
        const { attemptId } = await this.execution.runs.beginAttempt(handle, controlCommandId('native.turn.reuseSelection', commandIdentity), {
            ...runGuard(root), nodeId: profile.node.nodeId, inputRefs, inputDigest, effectiveGrantDigest, budgetRef: root.budgetAuthorityRef });
        const controller = new AttemptController({ runs: this.execution.runs, authorizeAttempt: verify, verifySettlement: async args => {
            await verify(args);
            if (args.outcome !== 'completed' || args.resultRefs.length || args.receipts.length || args.reasonCode !== 'original_selection_reused') fail('native_orchestration_resolver_completion_required');
        } });
        await controller.activate(handle, { ...runGuard(await this.execution.runs.get(handle, root.runId)), attemptId });
        await controller.settle(handle, { ...runGuard(await this.execution.runs.get(handle, root.runId)), attemptId,
            outcome: 'completed', resultRefs: [], effectReceiptRefs: [], reasonCode: 'original_selection_reused' });
        return attemptId;
    }

    async executeResolver(args) {
        const scope = await this.prepareResolver(args);
        if (scope === null) return null;
        const { runId } = modelScopes.get(scope).principal, state = this.#runs.get(runId);
        try {
            const { generated, receiptRef } = await this.#port(args.host).generate(args.handle, scope, { signal: args.signal });
            // This is the original exposed-transaction selector. It grants no
            // remote Tool or World write, and its body never enters RunLedger.
            const selected = await state.contextPort.selectResolver(args.handle, { context: state.context, response: generated.response });
            await new AttemptController({ runs: this.execution.runs, authorizeAttempt: input => this.#authorize(input),
                verifySettlement: async ({ handle, root, attempt, outcome, resultRefs, receipts }) => {
                    await this.#authorize({ handle, root, attempt });
                    if (attempt.attemptId !== state.attemptId || outcome !== 'completed' || resultRefs.length || receipts.length !== 1
                        || receipts[0].receiptId !== receiptRef.receiptId || receipts[0].outcome !== 'confirmed') fail('native_orchestration_resolver_completion_required');
                    const current = await state.contextPort.selectResolver(handle, { context: state.context, response: generated.response });
                    if (!equal(current, selected)) fail('native_orchestration_turn_input_stale');
                } }).settle(args.handle, { ...runGuard(await this.execution.runs.get(args.handle, runId)), attemptId: state.attemptId,
                outcome: 'completed', resultRefs: [], effectReceiptRefs: [receiptRef.receiptId], reasonCode: null });
            return selected;
        } finally { this.#runs.delete(runId); modelScopes.delete(scope); }
    }

    async executeNarrator(args) {
        const scope = await this.prepareNarrator(args);
        if (scope === null) return null;
        const { runId } = modelScopes.get(scope).principal, state = this.#runs.get(runId), port = this.#port(args.host);
        try {
            const result = await port.generate(args.handle, scope, { signal: args.signal });
            await port.inspectResultCompletion(args.handle, { result, runId, effectId: state.effectId });
            this.#narrations.set(result.generated, { state, port, result, runId });
            return result.generated;
        } finally { this.#runs.delete(runId); modelScopes.delete(scope); }
    }

    bindNarratorOutput({ host, handle, narration, prepared }) {
        const output = this.#narrations.get(narration);
        if (!output || output.state.host !== host || output.state.handle !== handle || this.#outputs.has(prepared)
            || prepared.invocationId !== output.state.proofExpected.invocationId || prepared.envelope.narrative !== narration.response.text
            || prepared.envelope.outcomes.length || prepared.envelope.diagnostics.length) fail('native_orchestration_output_scope_invalid');
        this.#narrations.delete(narration);
        this.#outputs.set(prepared, { ...output, payloadHash: hash({ invocationId: prepared.invocationId, envelope: prepared.envelope, provenance: prepared.provenance }),
            authorityProof: prepared.authorityProof, knowledgeProof: prepared.knowledgeProof });
    }

    async finalizeNarrator({ host, handle, prepared, requestHash, expectedRevisionId, finalizationBoundary }) {
        if (this.engine.hasActiveTransaction(handle)) fail('native_orchestration_output_ambient_transaction');
        const output = this.#outputs.get(prepared);
        if (!output || output.state.host !== host || output.state.handle !== handle
            || requestHash !== output.state.proofExpected.requestHash || expectedRevisionId !== output.state.proofExpected.anchor.revisionId
            || output.payloadHash !== hash({ invocationId: prepared.invocationId, envelope: prepared.envelope, provenance: prepared.provenance })
            || prepared.authorityProof !== output.authorityProof || prepared.knowledgeProof !== output.knowledgeProof) fail('native_orchestration_output_scope_invalid');
        this.#outputs.delete(prepared);
        const { state, port, result, runId } = output, service = this.execution;
        const finalizationPermit = state.contextPort.captureNativeOutputFinalization(handle, { context: state.context, finalizationBoundary });
        const withAuthority = SourcePort.prototype.consumptionBoundary.call(service.sourcePort, handle, state.sourceBinding, { engine: this.engine });
        // Keep the original Run -> Runtime -> Settings -> Session ordering,
        // but close the validation transaction before the domain publication.
        return service.runs.withSourceControl(handle, runId, async () => {
            let rejected;
            try {
                await service.runs.withConsumption(handle, runId, async ({ deny }) => {
                    try {
                        await state.contextPort.revalidateNativeOutput(handle, { context: state.context, finalizationPermit });
                        await port.inspectResultCompletion(handle, { result, runId, effectId: state.effectId });
                        await state.contextPort.revalidateNativeOutput(handle, { context: state.context, finalizationPermit });
                    } catch (error) { rejected = error; return deny(); }
                });
            } catch (error) { throw rejected && error.code === 'native_orchestration_consumption_stale' ? rejected : error; }
            const sessionId = state.proofExpected.sessionId, branchId = state.proofExpected.anchor.branchId;
            let snapshot, uncertain;
            try { snapshot = await this.sessionCore.finalizeTurn(handle, sessionId, { ...prepared, requestHash }, { expectedRevisionId }); } catch (error) {
                if (error.code !== 'storage_commit_unknown') throw error;
                uncertain = error;
            }
            // A lost ACK permits only observation of this exact domain commit.
            // Source advancement alone, or an assistant-shaped return, is no receipt.
            const committed = await readSessionTurnOutput(this.sessionCore._sessions, handle, {
                sessionId, branchId, expectedRevisionId, invocationId: prepared.invocationId, requestHash,
                envelope: prepared.envelope, provenance: prepared.provenance });
            if (!committed) throw uncertain ?? new ConflictError('native_session_turn_receipt_required');
            if (!snapshot) snapshot = await this.sessionCore.observe(handle, sessionId);
            if (snapshot.revision.revisionId !== committed.domainReceiptRef.revisionId || snapshot.revision.branchId !== branchId)
                fail('native_session_turn_receipt_invalid');
            return snapshot;
        }, { withAuthority });
    }
}
