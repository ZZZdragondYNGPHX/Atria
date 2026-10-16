import { ConflictError } from '../../storage/errors.js';
import { performance } from 'node:perf_hooks';
import { hashNativeDocument as hash, cloneNativeDocument } from '../repositories/common.js';
import { assertObject } from '../../../public/shared/native-orchestration-contracts.js';
import { createOrchestrationAuthoringService } from './authoring-service.js';
import { validateModelCapability } from './model-capability-authority.js';
import { RouteResolver } from '../model-prompt-runtime/route-resolver.js';
import { projectRuntimeRoute } from '../adapters/project-runtime-route.js';
import { getVersionedModelPromptResourceIdentity } from '../model-prompt-runtime/resources.js';
import { immutable, checkCancellation, effectiveOutputReserve } from '../model-prompt-runtime/execution-utils.js';
import { inspectNativeProjectGeneration, prepareNativeProjectReadTool, executeNativeProjectReadTool } from './native-project-generation-authority.js';
import { readProjectToolDescriptor } from './project-tool-contracts.js';
import { readProjectToolReceipt } from './project-tool-receipts.js';
import { BudgetPort, localWorkAttemptId } from './budget-port.js';
import { readEffect } from './effect-contracts.js';
import { checkedRecord } from './plan-repository.js';
import { ProjectAgentService } from '../project-agent.js';
import { StudioService } from '../authoring/studio-service.js';
import { ContextPort } from './context-port.js';
import { compileNativeContextMetered } from './generation-local-work.js';
import { AttemptController } from './attempt-controller.js';
import { controlCommandId, controlRecordKey, runGuard } from './controller-common.js';

const fail = code => { throw new ConflictError(code); };
const equal = (left, right) => hash(left) === hash(right);
const config = resolved => hash({ route: resolved.route, model: resolved.model, connection: resolved.connection,
    generation: resolved.generation, resources: resolved.resources });

/** Fixed original interactive Project producer. No Task runner or business writer. */
export class NativeProjectOrchestrationAuthority {
    #selections = new WeakMap();
    #rounds = new WeakMap();
    #consumers = new WeakMap();
    #runs = new Map();
    #execution;
    #port;
    #releasePort;
    #issueScope;

    constructor({ owner, projectAgent, projectRepository, execution, port, releasePort, issueScope }) {
        Object.assign(this, { owner, projectAgent, projectRepository });
        this.#execution = execution; this.#port = port; this.#releasePort = releasePort; this.#issueScope = issueScope;
    }

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
        if (maxModelRounds !== 1) fail('native_orchestration_project_scope_unavailable');
        assertObject(routeRef, ['scope', 'runtimeRouteId'], 'Original Project route');
        if (routeRef.scope !== 'player') fail('native_orchestration_project_route_mismatch');
        const plan = await this.#authoring().getRevision(handle, binding.planRef), graph = plan.definition;
        const node = graph.nodes.find(item => item.kind === 'agent'), output = graph.nodes.find(item => item.kind === 'output');
        const toolPins = plan.dependencyPins.filter(item => item.port === 'tool');
        const capabilities = toolPins.length ? ['generation.send', 'project.read'] : ['generation.send'];
        if (graph.nodes.length !== 2 || !node || !output || graph.edges.length !== 1
            || !equal(graph.entryNodeIds, [node.nodeId]) || !equal(graph.capabilityCeiling, capabilities)
            || !equal(node.capabilities, capabilities) || node.inputs.length || node.outputs.length !== 1 || node.outputs[0].type !== 'json'
            || node.dependencyPinIds.length !== 1 + toolPins.length || output.capabilities.length || output.inputs.length !== 1
            || output.inputs[0].type !== 'json' || !output.inputs[0].required || output.outputs.length || output.dependencyPinIds.length
            || plan.dependencyPins.length !== 1 + toolPins.length || graph.outputContract.kind !== 'result' || graph.outputContract.allowPartial
            || graph.graphChangePolicy.allowedOperations.length || graph.edges[0].condition !== 'always'
            || graph.edges[0].loopBack || graph.edges[0].maxVisits !== 1
            || graph.edges[0].from.nodeId !== node.nodeId || graph.edges[0].to.nodeId !== output.nodeId)
            fail('native_orchestration_project_plan_unavailable');
        const pin = plan.dependencyPins.find(item => item.pinId === node.policy.agentPinId && node.dependencyPinIds.includes(item.pinId));
        if (pin?.port !== 'model' || !equal(pin.resourceRef, routeRef)) fail('native_orchestration_project_route_mismatch');
        const names = new Set();
        for (const tool of toolPins) {
            if (!node.dependencyPinIds.includes(tool.pinId) || tool.resourceRef.projectId !== projectId || tool.resourceRef.taskId !== taskId
                || names.has(tool.resourceRef.name) || hash(await readProjectToolDescriptor(handle, tool.resourceRef, host.agent)) !== tool.integrity)
                fail('native_orchestration_project_tool_pin_stale');
            names.add(tool.resourceRef.name);
        }
        const validation = await validateModelCapability({ handle, definition: graph, dependencyPins: plan.dependencyPins, resolver: this.owner.modelResolver });
        if (validation.issues.length) fail('native_orchestration_model_authority_unavailable');
        const raw = await host.persistence.getRuntimeRoute(handle, routeRef.runtimeRouteId);
        if (raw?.role !== 'role.studio' || hash(raw) !== pin.integrity || raw.fallbackRouteRefs.length
            || raw.policy.maxRetries !== 0 || raw.policy.maxFallbackAttempts !== 0
            || (raw.executionPolicy?.continuity ?? 'none') !== 'none' || (raw.executionPolicy?.reuse ?? 'disabled') !== 'disabled')
            fail('native_orchestration_project_route_mismatch');
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
        const resolved = await resolver.resolve({ handle, routeRef, role: 'role.studio', requirements: ['generation.tools',
            ...(project.source.package.runtime?.modelPrompt?.roles.find(item => item.role === 'role.studio')?.requiredCapabilities ?? [])] });
        if (!resolved.route.executionPolicy?.computeBudget?.localWork) fail('native_orchestration_context_budget_unavailable');
        return { binding, plan, node, pin, toolPins, resolved, configDigest: config(resolved) };
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

    async #current(selection) {
        const state = this.#selections.get(selection);
        if (!state) fail('native_orchestration_project_selection_invalid');
        const current = await this.#describe(state.args);
        if (!current || !equal(current.binding, state.binding) || current.plan.definitionHash !== state.plan.definitionHash
            || current.configDigest !== state.configDigest) fail('native_orchestration_project_selection_stale');
        return state;
    }

    async authorize({ handle, root, attempt, proposal, intent }) {
        const state = this.#runs.get(root.runId);
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
        await this.authorize({ handle, root, intent });
        const state = this.#runs.get(root.runId);
        if (snapshot.requestId !== state.request.requestId || snapshot.runtimeRouteId !== state.selected.pin.resourceRef.runtimeRouteId
            || config(resolved) !== state.selected.configDigest || compiledBinding.fingerprint !== snapshot.diagnostics.compiledBinding.fingerprint)
            fail('native_orchestration_project_input_stale');
        const expected = await state.contextPort.provider(handle, { context: state.context }).buildRequestContextPlan(state.request, resolved);
        if (!equal(expected, snapshot.contextPlan)) fail('native_orchestration_project_context_mismatch');
    }

    async verifyObservation(args) {
        const state = this.#runs.get(args.root.runId);
        if (!state) fail('native_orchestration_model_completion_proof_required');
        if (args.intent.actionRef.kind === 'native_project_read') {
            const tool = state.tools?.get(args.intent.effectId);
            if (!tool?.receipt || !equal(tool.observation, args.observation)) fail('native_orchestration_project_tool_proof_required');
            const fact = await readProjectToolReceipt(args.tx, args.handle, args.root, args.intent.effectId, { projectAgent: state.host.agent });
            if (!fact || !equal(fact.receipt, tool.receipt) || !equal(fact.observation, args.observation)) fail('native_orchestration_project_tool_receipt_changed');
            return args.observation;
        }
        return this.#port(state.host).verifyObservation(args);
    }

    async prepare({ host, handle, projectCapture, selection, previousSystem }) {
        const selected = await this.#current(selection), identity = await inspectNativeProjectGeneration(projectCapture, { host, handle });
        if (identity.selection !== selection || identity.projectAgent !== host.agent || selected.args.host.agent !== this.projectAgent
            || selected.args.handle !== handle || previousSystem !== undefined
            || identity.projectId !== selected.args.projectId || identity.taskId !== selected.args.taskId
            || !equal(identity.request.routeRef, selected.pin.resourceRef) || this.#runs.size >= 64) fail('native_orchestration_project_producer_denied');
        checkCancellation(identity.signal);
        const service = this.#execution(), captured = await service.sourcePort.capture(handle, identity.sourceRequest);
        const audience = { kind: 'project_task', id: identity.taskId }, taskPurpose = 'original_native_project_studio';
        const bindingRef = { bindingId: selected.binding.bindingId, version: selected.binding.version };
        const grantDigest = hash({ owner: handle, sourceBindingDigest: captured.sourceBinding.bindingDigest, bindingRef,
            planRef: selected.binding.planRef, nodeId: selected.node.nodeId, taskPurpose, operationId: identity.operationId,
            request: identity.request, configDigest: selected.configDigest, audience });
        const logicalInputRef = { kind: 'native_project_intent', sourceRef: captured.sourceBinding.sourceRef, bindingRef,
            planRef: selected.binding.planRef, nodeId: selected.node.nodeId, role: 'studio', requestId: identity.requestId,
            projectAttemptId: identity.projectAttemptId, operationId: identity.operationId, conversationDigest: identity.conversationDigest,
            routeRef: selected.pin.resourceRef, routeIntegrity: selected.pin.integrity, configDigest: selected.configDigest, audience, grantDigest };
        const decision = { actionRef: { kind: 'native_model_send', runtimeRouteId: selected.resolved.route.runtimeRouteId },
            targetRef: { connectionProfileId: selected.resolved.connection.connectionProfileId, modelProfileId: selected.resolved.model.modelProfileId, pathFingerprint: selected.resolved.pathFingerprint },
            inputRef: logicalInputRef, inputHash: hash(logicalInputRef), capability: 'generation.send', grantDigest,
            endpointBindingDigest: hash({ pathFingerprint: selected.resolved.pathFingerprint, configDigest: selected.configDigest }), risk: 'R1', requiresApproval: false,
            egressDigest: hash({ pathFingerprint: selected.resolved.pathFingerprint, sourceBindingDigest: captured.sourceBinding.bindingDigest, grantDigest, audience }),
            budgetEnvelopeDigest: hash(selected.resolved.route.executionPolicy.computeBudget), dispatchPolicy: { idempotency: 'none', operationKey: null, reconcile: 'manual' } };
        // Scheduler operations are ephemeral. A repeated original request must
        // reach the same durable command, never a fresh budget after a restart.
        const commandIdentity = { projectId: identity.projectId, taskId: identity.taskId, requestId: identity.requestId };
        const started = await service.runs.start(handle, controlCommandId('native.project.start', commandIdentity), { planRef: selected.binding.planRef,
            sourceRequest: identity.sourceRequest, retentionPolicyRef: { policyId: 'retain_native_project_until_explicit_release' } });
        const root = await service.runs.get(handle, started.runId), state = { host, handle, projectCapture, selected, selection, sourceBinding: captured.sourceBinding, decision };
        this.#runs.set(root.runId, state);
        try {
            const { attemptId } = await service.runs.beginAttempt(handle, controlCommandId('native.project.attempt', commandIdentity), { ...runGuard(root), nodeId: selected.node.nodeId,
                inputRefs: [logicalInputRef], inputDigest: hash([logicalInputRef]), effectiveGrantDigest: grantDigest, budgetRef: root.budgetAuthorityRef });
            state.attemptId = attemptId;
            await new AttemptController({ runs: service.runs, authorizeAttempt: args => this.authorize(args) }).activate(handle, { ...runGuard(await service.runs.get(handle, root.runId)), attemptId });
            const effectId = 'oeffect_' + hash({ runId: root.runId, attemptId, purpose: taskPurpose }).slice(0, 32); state.effectId = effectId;
            await service.effects.prepare(handle, { ...runGuard(await service.runs.get(handle, root.runId)), effectId, nodeAttemptId: attemptId,
                proposal: Object.fromEntries(['actionRef', 'targetRef', 'inputRef', 'inputHash'].map(key => [key, decision[key]])) });
            state.contextPort = new ContextPort({ projectAgent: host.agent, projectCapture, authorizeContext: async ({ request }) => {
                await this.#current(selection); await inspectNativeProjectGeneration(projectCapture, { host, handle });
                if (request.taskPurpose !== taskPurpose || !equal(request.audience, audience) || request.grantDigest !== grantDigest
                    || !equal(request.sourceBinding, captured.sourceBinding) || !equal(request.inputRefs, [logicalInputRef])) fail('native_orchestration_context_denied');
                return { allowed: true, grantDigest };
            } });
            const request = { ownerRef: { handle }, sourceBinding: captured.sourceBinding, audience, taskPurpose, grantDigest, inputRefs: [logicalInputRef],
                tokenBudget: { modelContextLimit: selected.resolved.model.limits.contextTokens, responseReserve: effectiveOutputReserve(selected.resolved) } };
            const send = await service.generationSend(handle, { runId: root.runId, effectId, limits: selected.resolved.route.executionPolicy.computeBudget });
            const metered = await compileNativeContextMetered({ handle, port: state.contextPort, request, bank: send.bank,
                budgetPort: service.budgetPort, root: await service.runs.get(handle, root.runId), effectId, limits: selected.resolved.route.executionPolicy.computeBudget,
                workDescriptor: { requestId: identity.requestId, pathFingerprint: selected.resolved.pathFingerprint },
                assertCurrent: async () => {
                    await this.#current(selection); await inspectNativeProjectGeneration(projectCapture, { host, handle });
                    await service.sourcePort.revalidate(handle, captured.sourceBinding);
                }, signal: identity.signal });
            state.context = metered.compiled; state.request = state.contextPort.projectRequest(handle, { context: state.context });
            await send.bindContext({ port: state.contextPort, compiled: state.context, compileProof: metered.proof });
            const round = state.contextPort.projectRound(handle, { context: state.context });
            const actualRound = immutable(round);
            const roundToken = Object.freeze({});
            this.#rounds.set(roundToken, { state, runId: root.runId, logicalInputRef, identity, send, round: actualRound });
            return { ...structuredClone(actualRound), roundToken };
        } catch (error) { this.#runs.delete(root.runId); throw error; }
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
                    await this.#execution().sourcePort.revalidate(handle, state.sourceBinding, tx ? { tx } : undefined);
                    await state.contextPort.revalidate(handle, { context: state.context, phase: 'consume' });
                } });
            const result = await this.#port(host).generate(handle, scope, { signal: identity.signal }), { generated } = result;
            if (generated.response.toolCalls?.length) {
                if (generated.response.toolCalls.some(call => !state.selected.toolPins.some(pin => pin.resourceRef.name === call.name)))
                    fail('native_orchestration_project_tool_scope_unavailable');
                state.modelResult = result; state.modelResultHash = hash(result); state.tools = new Map();
                this.#consumers.set(roundToken, { state, identity, runId });
            }
            return generated;
        } finally {
            if (!this.#consumers.has(roundToken)) { this.#runs.delete(runId); this.#releasePort(host); }
        }
    }

    closeRound({ host, handle, roundToken }) {
        const consumer = this.#consumers.get(roundToken);
        if (!consumer) return;
        if (consumer.state.host !== host || consumer.state.handle !== handle) fail('native_orchestration_project_producer_denied');
        this.#consumers.delete(roundToken); this.#runs.delete(consumer.runId); this.#releasePort(host);
    }

    async #consumeTool(consumer, operation) {
        const { state, runId } = consumer, { handle, host } = state, service = this.#execution();
        let rejected;
        try {
            return await service.runs.withConsumption(handle, runId, async ({ deny }) => {
                try {
                    await this.#current(state.selection); await inspectNativeProjectGeneration(state.projectCapture, { host, handle });
                    await ContextPort.prototype.revalidateProjectRead.call(state.contextPort, handle, { context: state.context });
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

    async executeTool({ host, handle, roundToken, input }) {
        assertObject(input, ['name', 'args', 'attemptId', 'callId'], 'Original Project tool input');
        const consumer = this.#consumers.get(roundToken);
        if (!consumer || consumer.state.host !== host || consumer.state.handle !== handle) fail('native_orchestration_project_tool_scope_unavailable');
        const { state, identity, runId } = consumer, service = this.#execution(), { runs, effects, budgetPort } = service;
        if (runs.engine.hasActiveTransaction(handle)) fail('native_orchestration_project_tool_ambient_transaction');
        const effectId = 'oeffect_' + hash({ runId, projectAttemptId: identity.projectAttemptId, callId: input.callId }).slice(0, 32);
        if (state.tools.has(effectId)) fail('native_orchestration_project_tool_replayed');
        const permit = await prepareNativeProjectReadTool(state.projectCapture, { port: this.#port(host), result: state.modelResult,
            modelEffectId: state.effectId, input, toolEffectId: effectId });
        const root = await runs.get(handle, runId), inputRef = { kind: 'native_project_read', call: input, modelEffectId: state.effectId, modelResultHash: state.modelResultHash };
        const decision = immutable({ ...state.decision, actionRef: { kind: 'native_project_read' },
            targetRef: { projectId: identity.projectId, taskId: identity.taskId, name: input.name }, inputRef, inputHash: hash(inputRef), capability: 'project.read',
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
            completed = await executeNativeProjectReadTool(permit); outcome = 'completed'; tool.receipt = completed.receipt;
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
            reasonCode: 'project_read_completed' });
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
            if (hash(completed.result) !== completed.receipt.resultHash) fail('native_orchestration_project_tool_result_changed');
            return completed.result;
        });
    }
}
