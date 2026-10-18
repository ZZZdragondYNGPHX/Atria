import { ProjectDelegationAuthority } from './project-delegation-authority.js';
import { ConflictError } from '../../storage/errors.js';
import { performance } from 'node:perf_hooks';
import { hashNativeDocument as hash, cloneNativeDocument, putImmutable, equalNativeDocuments as equal } from '../repositories/common.js';
import { assertObject, assertResultPolicy, nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';
import { createOrchestrationAuthoringService } from './authoring-service.js';
import { inspectModelCapabilities, resolveModelFailurePlan } from './model-capability-authority.js';
import { prepareExecutionPlan } from '../model-prompt-runtime/execution-evidence.js';
import { RouteResolver } from '../model-prompt-runtime/route-resolver.js';
import { projectRuntimeRoute } from '../adapters/project-runtime-route.js';
import { getVersionedModelPromptResourceIdentity } from '../model-prompt-runtime/resources.js';
import { immutable, checkCancellation, effectiveOutputReserve } from '../model-prompt-runtime/execution-utils.js';
import { inspectNativeProjectGeneration, inspectNativeProjectFanoutControl, prepareNativeProjectTaskTool, executeNativeProjectTaskTool,
    finishNativeProjectGeneration, inspectNativeProjectRoundCompletion, confirmNativeProjectRoundSettlement,
    inspectNativeProjectReviewCompletion } from './native-project-generation-authority.js';
import { ProjectReviewOutputController } from './project-review-output-controller.js';
import { projectReviewCosts } from './project-review-output-contracts.js';
import { readProjectToolDescriptor, projectToolCapability, projectToolAction, projectToolReason, projectToolResultPayload, projectToolBatchAllowed } from './project-tool-contracts.js';
import { readProjectToolReceipt } from './project-tool-receipts.js';
import { reconcileProjectToolEffect, verifyProjectToolReconciliation } from './project-tool-reconciliation.js';
import { readProjectRoundReceipt, projectRoundReceiptId, projectRoundCommandId } from './project-round-contracts.js';
import { inspectComputeEffectClosure } from '../../../public/shared/native-compute-budget.js';
import { readAttempt } from './controller-common.js';
import { TransitionController } from './transition-controller.js';
import { BudgetPort, localWorkAttemptId } from './budget-port.js';
import { readEffect } from './effect-contracts.js';
import { checkedRecord } from './plan-repository.js';
import { ProjectAgentService } from '../project-agent.js';
import { StudioService } from '../authoring/studio-service.js';
import { ContextPort } from './context-port.js';
import { compileNativeContextMetered } from './generation-local-work.js';
import { AttemptController } from './attempt-controller.js';
import { controlCommandId, controlRecordKey, runGuard } from './controller-common.js';
import { projectAgentGraphProfile } from './project-agent-graph-profile.js';
import { projectQualityProfile } from './project-quality-profile.js';
import { ProjectQualityWork } from './project-quality-work.js';
import { projectControlGraph } from './project-control-graph.js';
import { ProjectControlGraphWork } from './project-control-graph-work.js';
import { readProjectControlInputs, projectControlItems } from './project-control-input-contracts.js';
import { readGraphNodeResult } from './graph-result-contracts.js';
import { readProjectQualityApproval } from './project-quality-contracts.js';

const fail = code => { throw new ConflictError(code); };
const config = resolved => hash({ route: resolved.route, model: resolved.model, connection: resolved.connection,
    generation: resolved.generation, resources: resolved.resources });

/** Fixed original interactive Project producer. No Task runner or business writer. */
export class NativeProjectOrchestrationAuthority {
    #delegation;
    #selections = new WeakMap();
    #rounds = new WeakMap();
    #consumers = new WeakMap();
    #operations = new Map();
    #runs = new Map();
    #stages = new Map();
    #execution;
    #port;
    #releasePort;
    #issueScope;

    constructor({ owner, projectAgent, projectRepository, execution, port, releasePort, issueScope }) {
        Object.assign(this, { owner, projectAgent, projectRepository });
        this.#execution = execution; this.#port = port; this.#releasePort = releasePort; this.#issueScope = issueScope;
    }

    #delegate() {
        this.#delegation ??= new ProjectDelegationAuthority({ owner: this.owner, execution: this.#execution, port: this.#port,
            issueScope: this.#issueScope, assertSelection: selection => this.#current(selection) });
        return this.#delegation;
    }
    ownsDelegationCapture(capture) { return this.#delegation?.ownsDelegationCapture(capture) ?? false; }
    ownsReturnCapture(capture) { return this.#delegation?.ownsReturnCapture(capture) ?? false; }
    ownsGraphCapture(capture) { return this.#delegation?.ownsGraphCapture(capture) ?? false; }
    hasDelegatedRun(runId) { return this.#delegation?.hasRun(runId) ?? false; }
    authorizeDelegation(args) { return this.#delegate().authorizeDelegation(args); }
    authorizeChildAttempt(args) { return this.#delegate().authorizeChildAttempt(args); }
    inspectDelegationIdentity(capture, expected) { return this.#delegate().inspectDelegationIdentity(capture, expected); }
    inspectDelegation(capture, expected) { return this.#delegate().inspectDelegation(capture, expected); }
    inspectDelegationOutput(capture, expected) { return this.#delegate().inspectDelegationOutput(capture, expected); }
    inspectReturnIdentity(capture, expected) { return this.#delegate().inspectReturnIdentity(capture, expected); }
    inspectReturn(capture, expected) { return this.#delegate().inspectReturn(capture, expected); }
    authorizeTaskLocalOutput(args) { return this.#delegate().authorizeTaskLocalOutput(args); }
    authorizeHandoffReturn(args) { return this.#delegate().authorizeHandoffReturn(args); }
    inspectParentResult(capture, expected) { return this.#delegate().inspectParentResult(capture, expected); }
    authorizeParentResult(args) { return this.#delegate().authorizeParentResult(args); }
    authorizeGraphResult(args) { return this.#delegate().authorizeGraphResult(args); }
    runDelegation(args) { return this.#delegate().run(args); }

    #authoring() {
        return this.owner.plans ??= createOrchestrationAuthoringService(this.owner.engine, { sessionCore: this.owner.sessionCore,
            projectAgent: this.projectAgent, studio: this.projectAgent?._studio, rpControl: this.owner.rpControl, modelResolver: this.owner.modelResolver }).plans;
    }

    async #describe({ host, handle, projectId, taskId, routeRef, maxModelRounds }) {
        // Exact Task selection precedes Project default; an invalid exact row
        // cannot fall through to a different plan.
        let binding = await this.#authoring().getBinding(handle, { domain: 'project', projectId, taskId });
        binding ??= await this.#authoring().getBinding(handle, { domain: 'project', projectId, taskId: null });
        if (!binding) return null;
        if (!(this.projectAgent instanceof ProjectAgentService) || host.turnOrchestration !== this.owner
            || host.persistence._engine !== this.owner.engine || host.studio !== this.projectAgent._studio
            || !(host.studio instanceof StudioService) || host.agent._repository !== this.projectRepository
            || host.agent._studio !== host.studio || host.sessionCore !== this.owner.sessionCore
            || (host.agent !== this.projectAgent && Object.getPrototypeOf(host.agent) !== this.projectAgent)
            || !(this.owner.modelResolver instanceof RouteResolver)) fail('native_orchestration_project_authority_unavailable');
        if (!Number.isSafeInteger(maxModelRounds) || maxModelRounds < 1 || maxModelRounds > 12) fail('native_orchestration_project_scope_unavailable');
        assertObject(routeRef, ['scope', 'runtimeRouteId'], 'Original Project route');
        if (routeRef.scope !== 'player') fail('native_orchestration_project_route_mismatch');
        const plan = await this.#authoring().getRevision(handle, binding.planRef), graph = plan.definition;
        let quality = null, controlGraph = null;
        if (graph.nodes.some(node => ['planner', 'fanout', 'join', 'judge'].includes(node.kind))) controlGraph = projectControlGraph(plan);
        else if (graph.nodes.some(node => node.kind === 'review')) {
            try { quality = projectQualityProfile(plan); } catch (error) {
                if (error.code !== 'native_orchestration_project_quality_plan_unavailable') throw error;
                controlGraph = projectControlGraph(plan);
            }
        } else if (graph.nodes.some(node => node.kind === 'agent' && node.outputs[0]?.type === 'text')) controlGraph = projectControlGraph(plan);
        if (quality && [quality.draft, quality.review].some(control => {
            const { maxRounds: _maxRounds, ...policy } = control.policy;
            return !equal(nodeModelRoutePins(control, plan.dependencyPins), nodeModelRoutePins(quality.worker, plan.dependencyPins)) || !equal(policy, quality.worker.policy);
        })) { controlGraph = projectControlGraph(plan); quality = null; }
        const collaboration = projectAgentGraphProfile(controlGraph?.executionPlan ?? quality?.executionPlan ?? plan, maxModelRounds);
        const { node, modelPins } = collaboration.profiles[0], { loop } = collaboration;
        const toolPins = plan.dependencyPins.filter(item => item.port === 'tool');
        // Every worker uses the original operation's pinned Studio route and
        // failure policy. Its own tool intersection is enforced per round.
        for (const profile of collaboration.profiles) {
            if (!equal(profile.modelPins, modelPins) || !equal(profile.node.policy, node.policy))
                fail('native_orchestration_project_route_mismatch');
        }
        for (const control of quality ? [quality.draft, quality.review] : []) {
            const { maxRounds: _maxRounds, ...policy } = control.policy;
            if (!equal(nodeModelRoutePins(control, plan.dependencyPins), modelPins) || !equal(policy, node.policy))
                fail('native_orchestration_project_route_mismatch');
        }
        if (graph.outputContract.kind === 'project_review') {
            assertResultPolicy(graph.outputContract);
            if (!toolPins.some(tool => tool.resourceRef.name === 'atri_agent_prepare_review')) fail('native_orchestration_project_plan_unavailable');
        }
        const pin = plan.dependencyPins.find(item => item.pinId === node.policy.agentPinId && node.dependencyPinIds.includes(item.pinId));
        if (pin?.port !== 'model' || !equal(pin.resourceRef, routeRef)) fail('native_orchestration_project_route_mismatch');
        const names = new Set();
        for (const tool of toolPins) {
            if (tool.resourceRef.projectId !== projectId || tool.resourceRef.taskId !== taskId
                || names.has(tool.resourceRef.name) || hash(await readProjectToolDescriptor(handle, tool.resourceRef, host.agent)) !== tool.integrity)
                fail('native_orchestration_project_tool_pin_stale');
            names.add(tool.resourceRef.name);
        }
        const validation = await inspectModelCapabilities({ handle, definition: graph, dependencyPins: plan.dependencyPins, resolver: this.owner.modelResolver });
        if (validation.issues.length) fail('native_orchestration_model_authority_unavailable');
        let currentModels = validation.models;
        const inspectedModel = (target, required) => {
            const inspected = currentModels?.get(target.nodeId);
            return inspected && equal(inspected.node, target) && inspected.resolved.route.role === 'role.studio'
                && required.every(capability => inspected.resolved.requirements.includes(capability)) ? inspected : null;
        };
        const raw = await host.persistence.getRuntimeRoute(handle, routeRef.runtimeRouteId);
        if (raw?.role !== 'role.studio' || hash(raw) !== pin.integrity)
            fail('native_orchestration_project_route_mismatch');
        // First prove original owned Route pins. Project prompt composition is
        // derived below from the same original Studio revision, never by
        // pretending a composed Route is the author's raw pinned document.
        const frozenFailure = inspectedModel(node, ['generation.tools'])?.failurePlan
            ?? await resolveModelFailurePlan({ handle, node, dependencyPins: plan.dependencyPins,
                resolver: this.owner.modelResolver, routeRef, role: 'role.studio', requirements: ['generation.tools'] });
        const project = await StudioService.prototype.observeProject.call(host.studio, handle, projectId);
        const persistence = Object.create(host.persistence);
        persistence.getRuntimeRoute = async (owner, id) => projectRuntimeRoute(await host.persistence.getRuntimeRoute(owner, id), projectId);
        const resolver = new RouteResolver({ persistence, library: host.library, providers: host.providers,
            getScopedResource: async (_owner, ref) => {
                if (ref.scope !== 'project' || ref.projectId !== projectId) fail('native_orchestration_project_route_mismatch');
                const entry = project.source.resources.find(item => {
                    const identity = getVersionedModelPromptResourceIdentity(item.resourceType, item.resource);
                    return identity.resourceId === ref.resourceId && identity.resourceType === ref.resourceType && identity.revision === ref.revision;
                });
                return entry && { snapshot: entry.resource, origin: { scope: 'project', projectId } };
            } });
        const requirements = ['generation.tools', ...(quality || controlGraph ? ['generation.structured-output'] : []), ...(project.source.package.runtime?.modelPrompt?.roles.find(item => item.role === 'role.studio')?.requiredCapabilities ?? [])];
        let resolved;
        const routes = [];
        for (const candidate of frozenFailure.routes) {
            const current = await resolver.resolve({ handle, routeRef: candidate.routeRef, role: 'role.studio', requirements });
            resolved ??= current;
            if (!equal(current.route.promptProgramRef, resolved.route.promptProgramRef)) fail('generation_semantic_authority_changed');
            prepareExecutionPlan(current, resolved.route.executionPolicy, resolver.provider(current.connection.providerAdapter));
            routes.push({ routeRef: candidate.routeRef, configDigest: config(current) });
        }
        if (!resolved.route.executionPolicy?.computeBudget?.localWork) fail('native_orchestration_context_budget_unavailable');
        const resolveControlModel = async (control, controlPlan = plan) => {
            const controlPin = controlPlan.dependencyPins.find(item => item.pinId === control.policy.agentPinId && control.dependencyPinIds.includes(item.pinId));
            if (controlPin?.port !== 'model' || controlPin.resourceRef.scope !== 'player') fail('native_orchestration_project_route_mismatch');
            const controlRequirements = [...(['planner', 'review', 'judge'].includes(control.kind) ? ['generation.structured-output'] : []),
                ...(project.source.package.runtime?.modelPrompt?.roles.find(item => item.role === 'role.studio')?.requiredCapabilities ?? [])];
            const inspected = controlPlan === plan ? inspectedModel(control, controlRequirements) : null;
            const failure = inspected?.failurePlan ?? await resolveModelFailurePlan({ handle, node: control, dependencyPins: controlPlan.dependencyPins, resolver: this.owner.modelResolver,
                routeRef: controlPin.resourceRef, role: 'role.studio', requirements: controlRequirements });
            let primary; const candidates = [];
            for (const candidate of failure.routes) {
                const current = await resolver.resolve({ handle, routeRef: candidate.routeRef, role: 'role.studio', requirements: controlRequirements });
                primary ??= current;
                if (!equal(current.route.promptProgramRef, primary.route.promptProgramRef)) fail('generation_semantic_authority_changed');
                prepareExecutionPlan(current, primary.route.executionPolicy, resolver.provider(current.connection.providerAdapter));
                candidates.push({ routeRef: candidate.routeRef, configDigest: config(current) });
            }
            if (!primary.route.executionPolicy?.computeBudget?.localWork) fail('native_orchestration_context_budget_unavailable');
            return { pin: controlPin, resolved: primary, failurePlan: { routes: candidates }, configDigest: candidates.length === 1 ? config(primary) : hash(candidates) };
        };
        const controlModelDigests = [], delegations = new Map(), delegationPlans = new Map(), delegationDigests = [];
        for (const control of (controlGraph?.pure ?? []).filter(node => node.capabilities.includes('generation.send'))) controlModelDigests.push([control.nodeId, (await resolveControlModel(control)).configDigest]);
        for (const control of controlGraph?.pure ?? []) {
            if (!control.capabilities.includes('agent.delegate')) continue;
            for (const pinId of control.policy.allowedPlanPinIds) {
                if (!control.dependencyPinIds.includes(pinId)) fail('native_orchestration_delegation_denied');
                if (!delegationPlans.has(pinId)) {
                    const child = await this.#delegate().planSelection(handle, plan, pinId, resolveControlModel);
                    delegationPlans.set(pinId, child);
                    delegationDigests.push([pinId, { pin: child.pin, closureDigest: child.closureDigest, models: child.profiles.map(model => ({ nodeId: model.node.nodeId, configDigest: model.configDigest })),
                        pool: child.poolProfiles.map(model => ({ pinId: model.pin.pinId, configDigest: model.configDigest })) }]);
                }
            }
            if (control.kind === 'agent') delegations.set(control.nodeId, delegationPlans.get(control.policy.allowedPlanPinIds[0]));
        }
        const resolveDelegation = control => {
            if (!control.capabilities.includes('agent.delegate') || control.kind === 'planner') return null;
            const ids = control.policy.allowedPlanPinIds ?? [], child = ids.length === 1 && delegationPlans.get(ids[0]);
            if (control.kind !== 'agent' || !child || !control.dependencyPinIds.includes(child.pin.pinId)) fail('native_orchestration_delegation_denied');
            return child;
        };
        // Later stages call the returned resolver again. They must obtain
        // fresh owned routes instead of retaining this invocation's facts.
        currentModels = null;
        return { binding, plan, node, pin, loop, toolPins, collaboration, quality, controlGraph, resolveControlModel, resolveDelegation, controlModelDigests, delegations, delegationPlans, delegationDigests, resolved,
            failurePlan: { routes }, configDigest: routes.length === 1 ? config(resolved) : hash(routes) };
    }

    async preflight(args) {
        const description = await this.#describe(args);
        if (!description) return null;
        const selection = Object.freeze({});
        this.#selections.set(selection, { args, ...description }); return selection;
    }

    descriptor(selection) {
        const state = this.#selections.get(selection);
        if (!state) fail('native_orchestration_project_selection_invalid');
        return immutable({ bindingRef: { bindingId: state.binding.bindingId, version: state.binding.version },
            planRef: state.binding.planRef, definitionHash: state.plan.definitionHash });
    }

    async executionResources(selection) {
        const state = await this.#current(selection), { host, handle } = state.args;
        const resources = [];
        for (const pin of state.plan.dependencyPins.filter(pin => pin.port === 'model')) {
            const route = await host.persistence.getRuntimeRoute(handle, pin.resourceRef.runtimeRouteId);
            if (!route || hash(route) !== pin.integrity) fail('native_orchestration_project_route_mismatch');
            resources.push(...await host.executionResources(handle, route));
        }
        for (const child of state.delegationPlans.values()) for (const model of child.resourceProfiles ?? child.poolProfiles) resources.push(...await host.executionResources(handle, model.resolved.route));
        return [...new Set(resources)].sort();
    }

    async #current(selection) {
        const state = this.#selections.get(selection);
        if (!state) fail('native_orchestration_project_selection_invalid');
        const current = await this.#describe(state.args);
        if (!current || !equal(current.binding, state.binding) || current.plan.definitionHash !== state.plan.definitionHash
            || current.configDigest !== state.configDigest || !equal(current.controlModelDigests, state.controlModelDigests) || !equal(current.delegationDigests, state.delegationDigests)) fail('native_orchestration_project_selection_stale');
        return state;
    }

    #stage(root, { attempt, intent, proposal } = {}) {
        const matches = [...(this.#stages.get(root.runId) ?? [])].filter(stage =>
            (attempt || intent) ? stage.attemptId === (attempt?.attemptId ?? intent.nodeAttemptId)
                : proposal ? equal(stage.decision.inputRef, proposal.inputRef) : false);
        if (matches.length > 1) fail('native_orchestration_project_grant_denied');
        return matches[0] ?? this.#runs.get(root.runId);
    }

    #installStage(runId, stage) {
        const stages = this.#stages.get(runId) ?? new Set(); this.#stages.set(runId, stages); stages.add(stage);
        return () => { stages.delete(stage); if (!stages.size) this.#stages.delete(runId); };
    }

    async authorize({ handle, root, attempt, proposal, intent }) {
        if (this.hasDelegatedRun(root.runId)) return this.#delegate().authorize(arguments[0]);
        const state = this.#stage(root, { attempt, proposal, intent });
        if (!state || state.handle !== handle || !equal(root.planRef, state.selected.binding.planRef)
            || root.sourceBinding.bindingDigest !== state.sourceBinding.bindingDigest) fail('native_orchestration_project_grant_denied');
        await this.#current(state.selection);
        await inspectNativeProjectGeneration(state.projectCapture, { host: state.host, handle });
        const tool = intent ? state.tools?.get(intent.effectId) : proposal ? [...(state.tools?.values() ?? [])].find(item => equal(item.decision.inputRef, proposal.inputRef)) : null;
        if (tool) {
            if (attempt && (attempt.attemptId !== state.attemptId || attempt.nodeId !== state.selected.node.nodeId || attempt.effectiveGrantDigest !== state.decision.grantDigest)
                || intent && (intent.nodeAttemptId !== state.attemptId || intent.inputHash !== tool.decision.inputHash)
                || proposal && !equal(proposal, Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, tool.decision[key]]))))
                fail('native_orchestration_project_tool_denied');
            if (hash(state.modelResult) !== state.modelResultHash) fail('native_orchestration_project_input_stale');
            return cloneNativeDocument(tool.decision);
        }
        if (attempt && (attempt.nodeId !== state.selected.node.nodeId || attempt.effectiveGrantDigest !== state.decision.grantDigest)) fail('native_orchestration_project_grant_denied');
        if (proposal && !equal(proposal, Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, state.decision[key]])))) fail('native_orchestration_project_input_stale');
        if (intent && (intent.nodeAttemptId !== state.attemptId || intent.inputHash !== state.decision.inputHash)) fail('native_orchestration_project_grant_denied');
        return cloneNativeDocument(state.decision);
    }

    async verifySend({ handle, root, intent, resolved, snapshot, compiledBinding }) {
        if (this.hasDelegatedRun(root.runId)) return this.#delegate().verifySend(arguments[0]);
        await this.authorize({ handle, root, intent });
        const state = this.#stage(root, { intent });
        const candidate = state.selected.failurePlan.routes.find(item => equal(item.routeRef, { scope: 'player', runtimeRouteId: resolved.route.runtimeRouteId }));
        if (!candidate || snapshot.requestId !== state.request.requestId || snapshot.runtimeRouteId !== resolved.route.runtimeRouteId
            || config(resolved) !== candidate.configDigest || !equal(snapshot.promptProgramRef, resolved.route.promptProgramRef)
            || !equal(snapshot.generationProfileRef, resolved.route.generationProfileRef)
            || !equal(snapshot.diagnostics.executionPlan.policy, state.selected.resolved.route.executionPolicy)
            || compiledBinding.fingerprint !== snapshot.diagnostics.compiledBinding.fingerprint)
            fail('native_orchestration_project_input_stale');
        const expected = await state.contextPort.provider(handle, { context: state.context }).buildRequestContextPlan(state.request, resolved);
        if (!equal(expected, snapshot.contextPlan)) fail('native_orchestration_project_context_mismatch');
    }

    async verifyObservation(args) {
        if (this.hasDelegatedRun(args.root.runId)) return this.#delegate().verifyObservation(args);
        const state = this.#stage(args.root, args);
        if (!state && ['native_project_read', 'native_project_proposal'].includes(args.intent.actionRef.kind))
            return verifyProjectToolReconciliation(this.#execution(), this.projectAgent, args);
        if (!state) fail('native_orchestration_model_completion_proof_required');
        if (['native_project_read', 'native_project_proposal'].includes(args.intent.actionRef.kind)) {
            const tool = state.tools?.get(args.intent.effectId);
            if (!tool?.receipt || !equal(tool.observation, args.observation)) fail('native_orchestration_project_tool_proof_required');
            const fact = await readProjectToolReceipt(args.tx, args.handle, args.root, args.intent.effectId, { projectAgent: state.host.agent });
            if (!fact || !equal(fact.receipt, tool.receipt) || !equal(fact.observation, args.observation)) fail('native_orchestration_project_tool_receipt_changed');
            return args.observation;
        }
        return this.#port(state.host).verifyObservation(args);
    }

    reconcileTool(handle, request) { return reconcileProjectToolEffect(this.#execution(), this.projectAgent, handle, request); }

    async prepare({ host, handle, projectCapture, selection, previousSystem }) {
        const selectionState = await this.#current(selection), identity = await inspectNativeProjectGeneration(projectCapture, { host, handle });
        const profile = selectionState.collaboration.profiles[Math.min(identity.round, selectionState.collaboration.profiles.length - 1)];
        const selected = { ...selectionState, node: profile.node, toolPins: profile.toolPins, incoming: profile.incoming, loop: profile.loop };
        const operationKey = hash({ handle, operationId: identity.operationId }), operation = this.#operations.get(operationKey);
        if (identity.selection !== selection || identity.projectAgent !== host.agent || selected.args.host.agent !== this.projectAgent
            || selected.args.handle !== handle || previousSystem !== operation?.previous?.state.system
            || identity.projectId !== selected.args.projectId || identity.taskId !== selected.args.taskId
            || !equal(identity.request.routeRef, selected.pin.resourceRef) || this.#runs.size >= 64
            || operation && (operation.host !== host || operation.selection !== selection || operation.nextRound !== identity.round)
            || !operation && (identity.round !== 0 || this.#operations.size >= 64)) fail('native_orchestration_project_producer_denied');
        checkCancellation(identity.signal);
        const service = this.#execution(), captured = operation ? { sourceBinding: operation.sourceBinding }
            : await service.sourcePort.capture(handle, identity.sourceRequest);
        if (operation) await service.sourcePort.revalidate(handle, captured.sourceBinding, { root: await service.runs.get(handle, operation.runId) });
        const audience = { kind: 'project_task', id: identity.taskId }, taskPurpose = 'original_native_project_studio';
        const bindingRef = { bindingId: selected.binding.bindingId, version: selected.binding.version };
        let grantDigest = hash({ owner: handle, sourceBindingDigest: captured.sourceBinding.bindingDigest, bindingRef,
            planRef: selected.binding.planRef, nodeId: selected.node.nodeId, taskPurpose, operationId: identity.operationId,
            request: identity.request, configDigest: selected.configDigest, audience });
        const logicalInputRef = { kind: 'native_project_intent', sourceRef: captured.sourceBinding.sourceRef, bindingRef,
            planRef: selected.binding.planRef, nodeId: selected.node.nodeId, role: 'studio', requestId: identity.requestId,
            projectAttemptId: identity.projectAttemptId, operationId: identity.operationId, conversationDigest: identity.conversationDigest,
            currentSourceFingerprint: identity.sourceFingerprint,
            routeRef: selected.pin.resourceRef, routeIntegrity: selected.pin.integrity, configDigest: selected.configDigest, audience, grantDigest };
        let decision = { actionRef: { kind: 'native_model_send', runtimeRouteId: selected.resolved.route.runtimeRouteId },
            targetRef: { connectionProfileId: selected.resolved.connection.connectionProfileId, modelProfileId: selected.resolved.model.modelProfileId, pathFingerprint: selected.resolved.pathFingerprint },
            inputRef: logicalInputRef, inputHash: hash(logicalInputRef), capability: 'generation.send', grantDigest,
            endpointBindingDigest: hash({ pathFingerprint: selected.resolved.pathFingerprint, configDigest: selected.configDigest }), risk: 'R1', requiresApproval: false,
            egressDigest: hash({ pathFingerprint: selected.resolved.pathFingerprint, sourceBindingDigest: captured.sourceBinding.bindingDigest, grantDigest, audience }),
            budgetEnvelopeDigest: hash(selected.resolved.route.executionPolicy.computeBudget), dispatchPolicy: { idempotency: 'none', operationKey: null, reconcile: 'manual' } };
        // Scheduler operations are ephemeral. A repeated original request must
        // reach the same durable command, never a fresh budget after a restart.
        const commandIdentity = { projectId: identity.projectId, taskId: identity.taskId, requestId: identity.operationRequestId };
        const started = operation ?? await service.runs.start(handle, controlCommandId('native.project.start', commandIdentity), { planRef: selected.binding.planRef,
            sourceRequest: identity.sourceRequest, retentionPolicyRef: { policyId: 'retain_native_project_until_explicit_release' } });
        const activeOperation = operation ?? { host, selection, runId: started.runId, sourceBinding: captured.sourceBinding, nextRound: 0, previous: null };
        this.#operations.set(operationKey, activeOperation);
        const root = await service.runs.get(handle, started.runId), state = { host, handle, projectCapture, selected, selection,
            sourceBinding: captured.sourceBinding, decision, operation: activeOperation, operationKey };
        this.#runs.set(root.runId, state);
        try {
            if (selected.controlGraph) {
                activeOperation.controlGraph ??= await new ProjectControlGraphWork({ service, state, identity, logicalInputRef, port: this.#port(host),
                    issueScope: this.#issueScope, delegation: this.#delegate(), install: active => this.#installStage(root.runId, active), current: async ({ capture = projectCapture, controlPermit = null } = {}) => {
                        await this.#current(selection);
                        if (controlPermit) await inspectNativeProjectFanoutControl(projectCapture, controlPermit, { host, handle });
                        else await inspectNativeProjectGeneration(capture, { host, handle });
                        const active = await service.runs.get(handle, root.runId);
                        if (active.cancelRequested || !['admitted', 'running'].includes(active.status)) fail('native_orchestration_project_control_stale');
                        await service.sourcePort.revalidate(handle, captured.sourceBinding, { root: active });
                    } }).run();
                state.controlGraph = activeOperation.controlGraph; logicalInputRef.controlGraph = state.controlGraph;
                logicalInputRef.acceptedGraphResultRefs = state.controlGraph.evidenceRefs;
                logicalInputRef.acceptedControlRefs = state.controlGraph.controlRefs;
                grantDigest = hash({ grantDigest, controlGraph: state.controlGraph }); logicalInputRef.grantDigest = grantDigest;
                decision = { ...decision, inputRef: logicalInputRef, inputHash: hash(logicalInputRef), grantDigest,
                    egressDigest: hash({ sourceBinding: captured.sourceBinding, input: logicalInputRef }) }; state.decision = decision;
            }
            if (selected.quality) {
                activeOperation.qualityApproval ??= await new ProjectQualityWork({ service, state, identity, logicalInputRef, port: this.#port(host),
                    issueScope: this.#issueScope, delegation: this.#delegate(), install: active => this.#installStage(root.runId, active), current: async ({ capture = projectCapture, controlPermit = null } = {}) => {
                        await this.#current(selection);
                        if (controlPermit) await inspectNativeProjectFanoutControl(projectCapture, controlPermit, { host, handle });
                        else await inspectNativeProjectGeneration(capture, { host, handle });
                        const active = await service.runs.get(handle, root.runId);
                        if (active.cancelRequested || !['admitted', 'running'].includes(active.status)) fail('native_orchestration_project_quality_stale');
                        await service.sourcePort.revalidate(handle, captured.sourceBinding, { root: active });
                    } }).run();
                state.qualityApproval = activeOperation.qualityApproval;
                logicalInputRef.qualityApproval = state.qualityApproval;
                grantDigest = hash({ grantDigest, qualityApproval: state.qualityApproval }); logicalInputRef.grantDigest = grantDigest;
                decision = { ...decision, inputRef: logicalInputRef, inputHash: hash(logicalInputRef), grantDigest,
                    egressDigest: hash({ sourceBinding: captured.sourceBinding, input: logicalInputRef }) };
                state.decision = decision;
            }
            const qualityRefs = state.qualityApproval ? [state.qualityApproval.draftResultRef, state.qualityApproval.modelReviewReceiptRef]
                : state.controlGraph ? [...state.controlGraph.evidenceRefs, ...state.controlGraph.controlRefs] : [];
            let attemptId;
            if (!operation && selected.controlGraph) {
                const inputRefs = [logicalInputRef, ...qualityRefs];
                const advanced = await new TransitionController({ runs: service.runs, authorizeTransition: async ({ tx, root: current, target, producers }) => {
                    await this.#current(selection); await inspectNativeProjectGeneration(projectCapture, { host, handle });
                    const facts = await readProjectControlInputs(tx, handle, current, null, state.controlGraph, { targetNodeId: target.nodeId });
                    if (target.nodeId !== selected.node.nodeId || producers.length !== state.controlGraph.bindings.length
                        || producers.some(item => !facts.some(fact => fact.producer.attemptId === item.attempt.attemptId))) fail('native_orchestration_project_control_stale');
                    for (const fact of facts.filter(fact => fact.record)) {
                        if (!fact.record.envelope.audienceConstraint.nodeIds.includes(target.nodeId)) fail('native_orchestration_project_control_audience_denied');
                    }
                    return { inputRefs, inputDigest: hash(inputRefs), effectiveGrantDigest: grantDigest, budgetRef: current.budgetAuthorityRef };
                } }).advance(handle, { ...runGuard(await service.runs.get(handle, root.runId)), reservedAttemptId: null, bindings: state.controlGraph.bindings });
                attemptId = advanced.outcome.attemptId;
            } else if (!operation && selected.quality) {
                const inputRefs = [logicalInputRef, ...qualityRefs];
                const advanced = await new TransitionController({ runs: service.runs, authorizeTransition: async ({ tx, root: current, target, producers }) => {
                    await this.#current(selection); await inspectNativeProjectGeneration(projectCapture, { host, handle });
                    const approved = await readProjectQualityApproval(tx, handle, current, state.qualityApproval);
                    if (target.nodeId !== selected.node.nodeId || producers.length !== 2
                        || !producers.some(item => item.attempt.attemptId === approved.draft.producer.attemptId)
                        || !producers.some(item => item.attempt.attemptId === approved.producer.attemptId)) fail('native_orchestration_project_quality_stale');
                    return { inputRefs, inputDigest: hash(inputRefs), effectiveGrantDigest: grantDigest, budgetRef: current.budgetAuthorityRef };
                } }).advance(handle, { ...runGuard(await service.runs.get(handle, root.runId)), reservedAttemptId: null, bindings: [
                    { edgeId: selected.quality.transfer.edgeId, producerAttemptId: (await service.runs.engine.withTransaction(handle,
                        async tx => readProjectQualityApproval(tx, handle, await service.runs.get(handle, root.runId), state.qualityApproval))).draft.producer.attemptId },
                    { edgeId: selected.quality.gate.edgeId, producerAttemptId: state.qualityApproval.reviewAttemptId }] });
                attemptId = advanced.outcome.attemptId;
            } else if (!operation) ({ attemptId } = await service.runs.beginAttempt(handle, controlCommandId('native.project.attempt', commandIdentity), { ...runGuard(root), nodeId: selected.node.nodeId,
                inputRefs: [logicalInputRef], inputDigest: hash([logicalInputRef]), effectiveGrantDigest: grantDigest, budgetRef: root.budgetAuthorityRef }));
            else {
                const previous = operation.previous;
                const edge = previous?.state.selected.node.nodeId === selected.node.nodeId ? selected.loop : selected.incoming;
                if (!previous?.roundReceiptRef || !edge || edge.from.nodeId !== previous.state.selected.node.nodeId
                    || previous.identity.round + 1 !== identity.round) fail('native_orchestration_project_round_not_ready');
                const requiredBindings = selected.controlGraph ? state.controlGraph.bindings.filter(binding => {
                    const incoming = root.graph.edges.find(candidate => candidate.edgeId === binding.edgeId);
                    return root.graph.nodes.find(node => node.nodeId === selected.node.nodeId).inputs.some(port => port.required && port.name === incoming.to.port);
                }) : [];
                const continuationBindings = [...requiredBindings, { edgeId: edge.edgeId, producerAttemptId: previous.state.attemptId }];
                const traversed = await new TransitionController({ runs: service.runs, authorizeTransition: async ({ tx, root: current, target, producers }) => {
                    await this.#current(selection); await inspectNativeProjectGeneration(projectCapture, { host, handle });
                    await service.sourcePort.revalidate(handle, current.sourceBinding, { tx, root: current });
                    const fact = await readProjectRoundReceipt(tx, handle, current, previous.state.attemptId, { projectAgent: host.agent });
                    if (!fact || !equal(fact.receiptRef, previous.roundReceiptRef) || !fact.receipt.toolReceiptRefs.length
                        || target.nodeId !== selected.node.nodeId || producers.length !== continuationBindings.length
                        || producers.some(item => !continuationBindings.some(binding => binding.edgeId === item.edge.edgeId && binding.producerAttemptId === item.attempt.attemptId)))
                        fail('native_orchestration_project_round_not_ready');
                    if (requiredBindings.length) {
                        const facts = await readProjectControlInputs(tx, handle, current, null, state.controlGraph, { targetNodeId: target.nodeId });
                        if (requiredBindings.some(binding => !facts.some(input => input.producer.attemptId === binding.producerAttemptId)))
                            fail('native_orchestration_project_control_stale');
                    }
                    return { inputRefs: [logicalInputRef, fact.receiptRef, ...qualityRefs], inputDigest: hash([logicalInputRef, fact.receiptRef, ...qualityRefs]),
                        effectiveGrantDigest: grantDigest, budgetRef: current.budgetAuthorityRef };
                } }).advance(handle, { ...runGuard(root), bindings: continuationBindings, reservedAttemptId: null });
                attemptId = traversed.outcome.attemptId;
            }
            state.attemptId = attemptId;
            await new AttemptController({ runs: service.runs, authorizeAttempt: args => this.authorize(args) }).activate(handle, { ...runGuard(await service.runs.get(handle, root.runId)), attemptId });
            const effectId = 'oeffect_' + hash({ runId: root.runId, attemptId, purpose: taskPurpose }).slice(0, 32); state.effectId = effectId;
            await service.effects.prepare(handle, { ...runGuard(await service.runs.get(handle, root.runId)), effectId, nodeAttemptId: attemptId,
                proposal: Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, decision[key]])) });
            state.contextPort = new ContextPort({ projectAgent: host.agent, projectCapture, projectRoundPreviousSystem: previousSystem,
                projectModelPolicy: { fallbackMode: selected.failurePlan.routes.length > 1 ? 'automatic' : 'disabled', routes: selected.failurePlan.routes },
                authorizeContext: async ({ request }) => {
                    await this.#current(selection); await inspectNativeProjectGeneration(projectCapture, { host, handle });
                    if (request.taskPurpose !== taskPurpose || !equal(request.audience, audience) || request.grantDigest !== grantDigest
                    || !equal(request.sourceBinding, captured.sourceBinding) || !equal(request.inputRefs, [logicalInputRef])) fail('native_orchestration_context_denied');
                    return { allowed: true, grantDigest, projectToolPins: selected.toolPins,
                        ...(state.qualityApproval ? { projectGraphItems: await this.#qualityItems(state) }
                            : state.controlGraph ? { projectGraphItems: await this.#controlItems(state) } : {}),
                        ...(selected.collaboration.profiles.length > 1 ? { projectGraphTask: { nodeId: selected.node.nodeId, instruction: selected.node.label } } : {}) };
                } });
            const request = { ownerRef: { handle }, sourceBinding: captured.sourceBinding, audience, taskPurpose, grantDigest, inputRefs: [logicalInputRef],
                tokenBudget: { modelContextLimit: selected.resolved.model.limits.contextTokens, responseReserve: effectiveOutputReserve(selected.resolved) } };
            const send = await service.generationSend(handle, { runId: root.runId, effectId, limits: selected.resolved.route.executionPolicy.computeBudget });
            const metered = await compileNativeContextMetered({ handle, port: state.contextPort, request, bank: send.bank,
                budgetPort: service.budgetPort, root: await service.runs.get(handle, root.runId), effectId, limits: selected.resolved.route.executionPolicy.computeBudget,
                workDescriptor: { requestId: identity.requestId, pathFingerprint: selected.resolved.pathFingerprint },
                assertCurrent: async () => {
                    await this.#current(selection); await inspectNativeProjectGeneration(projectCapture, { host, handle });
                    await service.sourcePort.revalidate(handle, captured.sourceBinding, { root: await service.runs.get(handle, root.runId) });
                }, signal: identity.signal });
            state.context = metered.compiled; state.request = state.contextPort.projectRequest(handle, { context: state.context });
            await send.bindContext({ port: state.contextPort, compiled: state.context, compileProof: metered.proof });
            const round = state.contextPort.projectRound(handle, { context: state.context });
            const actualRound = immutable(round);
            state.system = actualRound.system; activeOperation.nextRound++;
            const roundToken = Object.freeze({});
            this.#rounds.set(roundToken, { state, runId: root.runId, logicalInputRef, identity, send, round: actualRound });
            return { ...structuredClone(actualRound), roundToken };
        } catch (error) {
            await this.#captureFailure(state, error);
            this.#runs.delete(root.runId); this.#stages.delete(root.runId); this.#operations.delete(operationKey); throw error;
        }
    }

    async #controlItems(state) {
        const service = this.#execution(), { handle, operation: { runId } } = state;
        return service.runs.withConsumption(handle, runId, async ({ tx, root }) => {
            await this.#current(state.selection); await service.sourcePort.revalidate(handle, root.sourceBinding, { tx, root });
            const recipient = (await readAttempt(tx, handle, root, state.attemptId)).doc;
            return projectControlItems(tx, handle, root, recipient, state.controlGraph);
        });
    }

    async #qualityItems(state) {
        const { handle, host, selection, projectCapture, operation: { runId } } = state, service = this.#execution();
        return service.runs.withConsumption(handle, runId, async ({ tx, root }) => {
            await this.#current(selection); await inspectNativeProjectGeneration(projectCapture, { host, handle });
            const recipient = (await readAttempt(tx, handle, root, state.attemptId)).doc;
            const approved = await readProjectQualityApproval(tx, handle, root, state.qualityApproval, recipient);
            return [{ kind: 'context.history', id: 'project-advisory:' + state.qualityApproval.draftResultRef.resultId,
                content: { role: 'user', content: 'Reviewed advisory proposal (not a formal change, permission or Commit):\n' + approved.draft.record.payload },
                provenance: [{ source: 'native.project-quality-result', ref: hash(state.qualityApproval) }] }];
        });
    }

    async execute({ host, handle, roundToken, source, role, messages, tools }) {
        const prepared = this.#rounds.get(roundToken);
        if (!prepared || prepared.state.host !== host || prepared.state.handle !== handle) fail('native_orchestration_project_producer_denied');
        this.#rounds.delete(roundToken);
        const { state, identity, runId, logicalInputRef, send, round } = prepared;
        try {
            if (role !== 'studio' || !equal(messages, round.messages) || !equal(tools, round.tools)
                || !equal(source, { projectId: identity.projectId, taskId: identity.taskId, revision: identity.revision, projectAttemptId: identity.projectAttemptId }))
                fail('native_orchestration_project_request_mismatch');
            await this.#current(state.selection); await inspectNativeProjectGeneration(state.projectCapture, { host, handle });
            const scope = this.#issueScope(host, handle, { runId, effectId: state.effectId, request: state.request,
                logicalInputRef: immutable(logicalInputRef), logicalInputHash: state.decision.inputHash, nativeProjectCapture: state.projectCapture,
                options: { scheduled: true, orchestrationSend: send }, revalidateConsume: async ({ tx } = {}) => {
                    await this.#current(state.selection); await inspectNativeProjectGeneration(state.projectCapture, { host, handle });
                    await this.#execution().sourcePort.revalidate(handle, state.sourceBinding, { tx, root: await this.#execution().runs.get(handle, runId) });
                    await state.contextPort.revalidate(handle, { context: state.context, phase: 'consume' });
                } });
            const result = await this.#port(host).generate(handle, scope, { signal: identity.signal }), { generated } = result;
            if (generated.response.toolCalls?.length) {
                if (generated.response.toolCalls.some(call => !state.selected.toolPins.some(pin => pin.resourceRef.name === call.name)))
                    fail('native_orchestration_project_tool_scope_unavailable');
                if (!projectToolBatchAllowed(generated.response.toolCalls)) fail('native_orchestration_project_tool_batch_unavailable');
            }
            state.modelResult = result; state.modelResultHash = hash(result); state.tools = new Map();
            this.#consumers.set(roundToken, { state, identity, runId });
            return generated;
        } catch (error) {
            await this.#captureFailure(state, error); throw error;
        } finally {
            if (!this.#consumers.has(roundToken)) { this.#runs.delete(runId); this.#stages.delete(runId); this.#operations.delete(state.operationKey); this.#releasePort(host); }
        }
    }

    closeRound({ host, handle, roundToken }) {
        const consumer = this.#consumers.get(roundToken);
        if (!consumer) return;
        if (consumer.state.host !== host || consumer.state.handle !== handle) fail('native_orchestration_project_producer_denied');
        this.#consumers.delete(roundToken); this.#runs.delete(consumer.runId); this.#stages.delete(consumer.runId); this.#releasePort(host);
        this.#operations.delete(consumer.state.operationKey);
    }

    async #consumeTool(consumer, operation) {
        const { state, runId } = consumer, { handle, host } = state, service = this.#execution();
        let rejected;
        try {
            return await service.runs.withConsumption(handle, runId, async ({ deny }) => {
                try {
                    await this.#current(state.selection); await inspectNativeProjectGeneration(state.projectCapture, { host, handle });
                    await ContextPort.prototype.revalidateProjectTool.call(state.contextPort, handle, { context: state.context });
                    if (hash(state.modelResult) !== state.modelResultHash) fail('native_orchestration_project_input_stale');
                    return await operation();
                } catch (error) {
                    if (!['native_orchestration_project_selection_stale', 'native_orchestration_project_input_stale', 'native_orchestration_source_stale',
                        'native_orchestration_project_producer_denied', 'native_orchestration_project_tool_result_changed', 'native_orchestration_context_source_stale'].includes(error.code)) throw error;
                    rejected = error; return deny();
                }
            }, { withAuthority: service.sourcePort.consumptionBoundary(handle, state.sourceBinding, { engine: service.runs.engine }) });
        } catch (error) { throw rejected && error.code === 'native_orchestration_consumption_stale' ? rejected : error; }
    }

    async finishRound({ host, handle, roundToken, input }) {
        try { return await this.#finishRound({ host, handle, roundToken, input }); } catch (error) {
            const consumer = this.#consumers.get(roundToken);
            if (consumer?.state.host === host && consumer.state.handle === handle) await this.#captureFailure(consumer.state, error);
            throw error;
        }
    }

    async #captureFailure(state, error, stage = 'execution') {
        // An unknown metadata ACK keeps its original recovery boundary. It is
        // never replaced by a second command claiming a different outcome.
        if (error.code === 'storage_commit_unknown') return;
        try { await this.#recordFailure(state, error, stage); } catch (captureError) { error.captureError ??= captureError; }
    }

    async #recordFailure(state, error, stage) {
        const { handle, operation: { runId } } = state, { runs, budgetPort } = this.#execution();
        if (state.selected.plan.definition.outputContract.kind !== 'project_review' || this.#runs.get(runId) !== state) return;
        const reasons = { native_generation_budget_exhausted: 'project_budget_exhausted',
            native_generation_required_budget_reserved: 'project_budget_reserved', native_generation_required_budget_unknown: 'project_budget_unknown',
            native_orchestration_limit_exhausted: 'project_graph_limit', native_orchestration_tree_limit_exhausted: 'project_graph_limit',
            generation_context_budget_exceeded: 'project_context_limit', generation_response_invalid: 'project_response_invalid',
            generation_cancelled: 'project_operation_cancelled', project_agent_plan_proposals_conflict: 'project_plan_proposals_conflict' };
        const reasonCode = reasons[error.code] ?? (stage === 'tool' ? 'project_tool_failed' : 'project_execution_failed');
        const receiptId = 'oreceipt_' + hash({ kind: 'project_failure', runId }).slice(0, 32), key = controlRecordKey(handle, runId, 'receipt', receiptId);
        const commandId = controlCommandId('project.execution.fail', runId);
        let expected;
        try {
            const observed = await runs.get(handle, runId);
            if (observed.cancelRequested || !['admitted', 'running', 'waiting_approval', 'reconciling'].includes(observed.status)) return;
            await runs.control(handle, commandId, { ...runGuard(observed), operation: 'project.execution.fail', detail: { reasonCode } }, async ({ tx, root, now, deny }) => {
                if (!equal(root.planRef, state.selected.binding.planRef) || !equal(root.sourceBinding, state.sourceBinding)
                    || root.sourceBinding.sourceAuthority !== 'project' || root.parentRef || root.outputClaims.length)
                    fail('native_orchestration_project_producer_denied');
                const effectIds = [];
                for (const attemptId of root.attemptRefs) effectIds.push(...(await readAttempt(tx, handle, root, attemptId)).doc.effectRefs);
                let costs = null;
                if (effectIds.length) {
                    try { costs = await budgetPort.observeEffectClosure(handle, { authorityRef: root.budgetAuthorityRef, effectIds }, { tx }); } catch (error) {
                        if (error.code !== 'native_orchestration_budget_unavailable') throw error;
                    }
                }
                // Classification is conservative. Never discharge a pending
                // Effect, settle a bill, release a permit or create a Result.
                if (!equal(root, await runs.get(handle, runId))) return deny(new ConflictError('native_orchestration_project_round_completion_stale'));
                const status = root.pendingEffectRefs.length || effectIds.length && !costs?.closed ? 'reconciling' : 'blocked';
                expected = { schemaVersion: 1, receiptKind: 'project_failure', receiptId, runId, epoch: root.epoch, reasonCode,
                    status, effectIds, costs, decisionSeq: root.eventSeq + 1, createdAt: now };
                await putImmutable(tx, key, expected); root.status = status;
                return { root, eventType: 'project_execution_failed', reasonCode, outcome: { receiptRef: { runId, receiptId }, status, reasonCode } };
            });
        } catch (error) {
            if (error.code !== 'storage_commit_unknown' || !expected) throw error;
            const saved = await runs.engine.withTransaction(handle, tx => checkedRecord(tx, key));
            if (!saved || !equal(saved.doc, expected)) throw error;
        }
    }

    async #finishRound({ host, handle, roundToken, input }) {
        assertObject(input, ['attemptId', 'status', 'conversation'], 'Original Project round finish');
        const consumer = this.#consumers.get(roundToken);
        if (!consumer || consumer.state.host !== host || consumer.state.handle !== handle || consumer.finished)
            fail('native_orchestration_project_round_finish_denied');
        const { state, runId } = consumer, { runs } = this.#execution();
        await this.#consumeTool(consumer, async () => {
            if (input.attemptId !== consumer.identity.projectAttemptId || input.status !== 'completed') fail('native_orchestration_project_round_finish_denied');
        });
        consumer.finished = true;
        const finished = await finishNativeProjectGeneration(state.projectCapture, { port: this.#port(host), result: state.modelResult, effectId: state.effectId, input });
        consumer.completion = finished.completion;
        const descriptor = await inspectNativeProjectRoundCompletion(finished.completion, { host, handle, runId });
        const receiptId = projectRoundReceiptId(runId, descriptor.nodeAttemptId);
        try {
            await runs.control(handle, projectRoundCommandId(runId, descriptor.nodeAttemptId), {
                ...runGuard(await runs.get(handle, runId)), operation: 'project.round.finish', detail: descriptor,
            }, async ({ tx, root, now }) => {
                if (root.cancelRequested || root.status !== 'running' || root.progress.steps >= root.limits.maxSteps || now >= root.progress.deadlineAt)
                    fail('native_orchestration_project_round_completion_stale');
                await this.#current(state.selection);
                const current = await inspectNativeProjectRoundCompletion(finished.completion, { host, handle, runId });
                if (!equal(current, descriptor) || root.sourceBinding.bindingDigest !== descriptor.sourceBindingDigest) fail('native_orchestration_project_round_completion_stale');
                const receipt = { schemaVersion: 1, receiptKind: 'project_round', receiptId, ...descriptor, createdAt: now };
                await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receiptId), receipt);
                root.progress.steps++;
                return { root, eventType: 'project_round_finished', reasonCode: null, outcome: { receiptRef: { runId, receiptId }, receiptIntegrity: hash(receipt) } };
            });
        } catch (error) {
            if (error.code !== 'storage_commit_unknown') throw error;
            const saved = await runs.engine.withTransaction(handle, async tx => readProjectRoundReceipt(tx, handle, await runs.get(handle, runId),
                descriptor.nodeAttemptId, { projectAgent: host.agent }));
            if (!saved || Object.entries(descriptor).some(([key, value]) => !equal(saved.receipt[key], value))) throw error;
        }
        const closure = await runs.withConsumption(handle, runId, async ({ tx, deny }) => {
            try {
                const costs = await this.#execution().budgetPort.observeEffectClosure(handle,
                    { authorityRef: (await runs.get(handle, runId)).budgetAuthorityRef,
                        effectIds: (await readAttempt(tx, handle, await runs.get(handle, runId), descriptor.nodeAttemptId)).doc.effectRefs }, { tx });
                await this.#current(state.selection);
                await inspectNativeProjectRoundCompletion(finished.completion, { host, handle, runId });
                return costs;
            } catch (error) {
                if (['native_orchestration_source_stale', 'native_orchestration_project_selection_stale', 'native_orchestration_project_round_completion_stale'].includes(error.code)) return deny();
                throw error;
            }
        }, { withAuthority: this.#execution().sourcePort.consumptionBoundary(handle, state.sourceBinding, { engine: runs.engine }) });
        let disposition;
        if (closure.closed) {
            const effects = [state.modelResult.receiptRef.receiptId, ...[...state.tools].map(([effectId, tool]) =>
                'oreceipt_' + hash({ effectId, observationId: tool.observation.observationId }).slice(0, 32))];
            await new AttemptController({ runs, authorizeAttempt: args => this.authorize(args), verifySettlement: async ({ tx, root, attempt, outcome, resultRefs }) => {
                if (attempt.attemptId !== descriptor.nodeAttemptId || outcome !== 'completed' || resultRefs.length) fail('native_orchestration_project_round_completion_stale');
                const fact = await readProjectRoundReceipt(tx, handle, root, attempt.attemptId, { projectAgent: host.agent });
                const task = await host.agent._repository.get(handle, descriptor.projectId, descriptor.taskId);
                const current = inspectComputeEffectClosure({ compute: task.compute }, attempt.effectRefs);
                const digest = hash({ authorityRef: root.budgetAuthorityRef, effectIds: current.effectIds,
                    modelAttempts: current.modelAttempts.toSorted((a, b) => a.attemptId.localeCompare(b.attemptId)),
                    localWork: current.localWork.toSorted((a, b) => a.attemptId.localeCompare(b.attemptId)), overrun: current.overrun });
                if (!fact || digest !== closure.snapshotDigest || !equal(fact.receipt.toolReceiptRefs, descriptor.toolReceiptRefs)) fail('native_orchestration_project_round_completion_stale');
            } }).settle(handle, { ...runGuard(await runs.get(handle, runId)), attemptId: descriptor.nodeAttemptId,
                outcome: 'completed', resultRefs: [], effectReceiptRefs: effects, reasonCode: 'project_round_ready' });
            disposition = await confirmNativeProjectRoundSettlement(finished.completion);
        }
        consumer.roundReceiptRef = { runId, receiptId };
        if (state.operation) state.operation.previous = consumer;
        if (closure.closed && finished.task.status === 'review' && (await runs.get(handle, runId)).graph.outputContract.kind === 'project_review') {
            const { sourcePort, budgetPort } = this.#execution();
            await new ProjectReviewOutputController({ runs, sourcePort, budgetPort, authorize: async ({ tx, root }) => {
                await this.#current(state.selection);
                const current = await inspectNativeProjectReviewCompletion(finished.completion, { host, handle });
                const fact = await readProjectRoundReceipt(tx, handle, root, descriptor.nodeAttemptId, { projectAgent: host.agent });
                if (!fact || root.runId !== runId || Object.entries(current.descriptor).some(([key, value]) => !equal(fact.receipt[key], value)))
                    fail('native_orchestration_project_review_stale');
                return fact.receipt;
            } }).complete(handle, await runs.get(handle, runId));
        } else if (closure.closed && disposition?.stopReason && (await runs.get(handle, runId)).graph.outputContract.kind === 'project_review') {
            await this.#stopRound(consumer, descriptor, disposition.stopReason);
        }
        return finished.task;
    }

    async #stopRound(consumer, descriptor, stopReason) {
        const { state, runId, completion } = consumer, { handle } = state;
        const { runs, sourcePort, budgetPort } = this.#execution();
        const receiptId = 'oreceipt_' + hash({ kind: 'project_stop', runId, nodeAttemptId: descriptor.nodeAttemptId }).slice(0, 32);
        const receiptKey = controlRecordKey(handle, runId, 'receipt', receiptId);
        const detail = { nodeAttemptId: descriptor.nodeAttemptId, stopReason };
        const commandId = controlCommandId('project.round.stop', { runId, nodeAttemptId: descriptor.nodeAttemptId });
        let expected;
        try {
            const result = await runs.withSourceControl(handle, runId, () => runs.engine.withTransaction(handle, async tx => {
                try {
                    const root = await runs.get(handle, runId);
                    if (root.status !== 'running' || root.cancelRequested || root.parentRef || root.pendingEffectRefs.length
                        || root.pendingApprovalRefs.length || root.outputClaims.length) fail('native_orchestration_project_round_completion_stale');
                    await this.#current(state.selection);
                    for (const ref of root.resultRefs) if (!await readGraphNodeResult(tx, handle, root, ref.resultId)) fail('native_orchestration_project_round_completion_stale');
                    const disposition = await confirmNativeProjectRoundSettlement(completion);
                    if (!equal(disposition.descriptor, descriptor) || disposition.continueAllowed || disposition.stopReason !== stopReason)
                        fail('native_orchestration_project_round_completion_stale');
                    const costs = await projectReviewCosts(tx, handle, root);
                    if (!costs.closed || !equal(costs, await budgetPort.observeEffectClosure(handle,
                        { authorityRef: root.budgetAuthorityRef, effectIds: costs.effectIds }, { tx }))) fail('native_orchestration_project_round_completion_stale');
                    await this.#current(state.selection);
                    if (!equal(descriptor, (await confirmNativeProjectRoundSettlement(completion)).descriptor)
                        || !equal(root, await runs.get(handle, runId))) fail('native_orchestration_project_round_completion_stale');
                    for (const attemptId of root.attemptRefs) if ((await readAttempt(tx, handle, root, attemptId)).doc.status !== 'completed')
                        fail('native_orchestration_project_round_completion_stale');
                    return { value: await runs.control(handle, commandId, { ...runGuard(root), operation: 'project.round.stop', detail }, async ({ root, tx, now }) => {
                        expected = { schemaVersion: 1, receiptKind: 'project_stop', receiptId, runId, epoch: root.epoch,
                            roundReceiptRef: { runId, receiptId: projectRoundReceiptId(runId, descriptor.nodeAttemptId) },
                            stopReason, costs, decisionSeq: root.eventSeq + 1, createdAt: now };
                        await putImmutable(tx, receiptKey, expected);
                        root.status = 'blocked';
                        return { root, eventType: 'project_generation_stopped', reasonCode: stopReason,
                            outcome: { receiptRef: { runId, receiptId }, status: 'blocked', stopReason } };
                    }) };
                } catch (error) {
                    if (['native_orchestration_project_round_completion_stale', 'native_orchestration_project_round_not_ready', 'native_orchestration_project_selection_stale',
                        'native_orchestration_source_stale', 'native_orchestration_project_producer_denied'].includes(error.code)) return { error };
                    throw error;
                }
            }), { withAuthority: sourcePort.consumptionBoundary(handle, state.sourceBinding, { engine: runs.engine }) });
            if (result.error) throw result.error;
        } catch (error) {
            if (error.code !== 'storage_commit_unknown' || !expected) throw error;
            const saved = await runs.engine.withTransaction(handle, tx => checkedRecord(tx, receiptKey));
            if (!saved || !equal(saved.doc, expected)) throw error;
        }
    }

    async executeTool({ host, handle, roundToken, input }) {
        try { return await this.#executeTool({ host, handle, roundToken, input }); } catch (error) {
            const consumer = this.#consumers.get(roundToken);
            if (consumer?.state.host === host && consumer.state.handle === handle) await this.#captureFailure(consumer.state, error, 'tool');
            throw error;
        }
    }

    async #executeTool({ host, handle, roundToken, input }) {
        assertObject(input, ['name', 'args', 'attemptId', 'callId'], 'Original Project tool input');
        const consumer = this.#consumers.get(roundToken);
        if (!consumer || consumer.state.host !== host || consumer.state.handle !== handle) fail('native_orchestration_project_tool_scope_unavailable');
        const { state, identity, runId } = consumer, service = this.#execution(), { runs, effects, budgetPort } = service;
        if (runs.engine.hasActiveTransaction(handle)) fail('native_orchestration_project_tool_ambient_transaction');
        const effectId = 'oeffect_' + hash({ runId, projectAttemptId: identity.projectAttemptId, callId: input.callId }).slice(0, 32);
        if (state.tools.has(effectId)) fail('native_orchestration_project_tool_replayed');
        const permit = await prepareNativeProjectTaskTool(state.projectCapture, { port: this.#port(host), result: state.modelResult,
            modelEffectId: state.effectId, input, toolEffectId: effectId });
        const root = await runs.get(handle, runId), inputRef = { kind: projectToolAction(input.name), call: input, modelEffectId: state.effectId, modelResultHash: state.modelResultHash };
        const decision = immutable({ ...state.decision, actionRef: { kind: projectToolAction(input.name) },
            targetRef: { projectId: identity.projectId, taskId: identity.taskId, name: input.name }, inputRef, inputHash: hash(inputRef), capability: projectToolCapability(input.name),
            endpointBindingDigest: hash({ projectId: identity.projectId, taskId: identity.taskId, name: input.name }) });
        const tool = { input: immutable(input), decision }; state.tools.set(effectId, tool);
        await effects.prepare(handle, { ...runGuard(root), effectId, nodeAttemptId: state.attemptId,
            proposal: Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, decision[key]])) });
        const attemptId = localWorkAttemptId(effectId, 0), limits = state.selected.resolved.route.executionPolicy.computeBudget;
        const row = await BudgetPort.prototype.chargeLocalWork.call(budgetPort, handle, { authorityRef: root.budgetAuthorityRef, limits, effectId, localWorkOrdinal: 0,
            attempt: { attemptId, requestId: identity.requestId, kind: 'project_tool', estimatedItems: 1,
                estimatedInputBytes: Buffer.byteLength(JSON.stringify(inputRef)), targetFingerprint: decision.endpointBindingDigest } });
        if (row?.status !== 'charged') fail('native_orchestration_project_tool_budget_required');
        const budgetAttemptRef = { kind: 'local_work', authorityRef: root.budgetAuthorityRef, effectId, localWorkOrdinal: 0, attemptId, reservationId: null };
        await effects.ready(handle, { ...runGuard(await runs.get(handle, runId)), effectId, budgetAttemptRef });
        const claim = await effects.claim(handle, { ...runGuard(await runs.get(handle, runId)), effectId });
        if (!claim.claimed || !claim.dispatchToken) fail('native_orchestration_project_tool_denied');
        const started = performance.now(), cpu = process.cpuUsage(); let completed, outcome = 'failed';
        try {
            await this.#consumeTool(consumer, async () => {
                if (hash(state.modelResult) !== state.modelResultHash) fail('native_orchestration_project_input_stale');
            });
            completed = await executeNativeProjectTaskTool(permit); outcome = 'completed'; tool.receipt = completed.receipt;
        } finally {
            const used = process.cpuUsage(cpu);
            await BudgetPort.prototype.settleLocalWork.call(budgetPort, handle, root.budgetAuthorityRef, attemptId,
                { wallMs: performance.now() - started, cpuUserMicros: used.user, cpuSystemMicros: used.system, cpuScope: 'process', outcome });
        }
        const observed = await BudgetPort.prototype.observeAttempt.call(budgetPort, handle, budgetAttemptRef);
        const receiptRef = { projectId: identity.projectId, taskId: identity.taskId, projectAttemptId: input.attemptId, callId: input.callId,
            receiptHash: hash(completed.receipt) };
        tool.observation = immutable({ observationId: 'project.tool:' + effectId, observedEpoch: root.epoch, outcome: 'confirmed',
            dispatchEvidence: { kind: 'original_domain_receipt', reference: receiptRef }, domainReceiptRef: receiptRef, remoteOperationRef: null,
            budgetObservationRef: { ...budgetAttemptRef, status: observed.status, usageHash: hash(observed.usage) }, resultRefs: [], sourceRefs: [root.sourceBinding.sourceRef],
            reasonCode: projectToolReason(input.name) });
        try { await effects.observe(handle, { ...runGuard(await runs.get(handle, runId)), effectId, observation: tool.observation }); } catch (error) {
            if (error.code !== 'storage_commit_unknown') throw error;
            const saved = await runs.engine.withTransaction(handle, async tx => {
                const active = await runs.get(handle, runId), intent = (await readEffect(tx, handle, active, effectId)).doc;
                const receiptId = 'oreceipt_' + hash({ effectId, observationId: tool.observation.observationId }).slice(0, 32);
                const receipt = (await checkedRecord(tx, controlRecordKey(handle, runId, 'receipt', receiptId)))?.doc;
                return intent.status === 'confirmed' && receipt && Object.entries(tool.observation).every(([key, value]) => equal(receipt[key], value));
            });
            if (!saved) throw error;
        }
        return this.#consumeTool(consumer, async () => {
            if (hash(projectToolResultPayload(input.name, completed.result)) !== completed.receipt.resultHash) fail('native_orchestration_project_tool_result_changed');
            return completed.result;
        });
    }
}
