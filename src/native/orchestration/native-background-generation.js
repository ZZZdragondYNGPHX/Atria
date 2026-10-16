import { ConflictError } from '../../storage/errors.js';
import { NativeGenerationHost } from '../adapters/generation-host.js';
import { nativeTaskScheduler } from '../task-scheduler.js';
import { hashNativeDocument as hash, putImmutable } from '../repositories/common.js';
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
import { controlCommandId, controlRecordKey, runGuard } from './controller-common.js';
import { mintNativeBackgroundQuota } from './native-turn-quota.js';
import { RunControl } from '../run-control.js';
import { assertResultPolicy } from '../../../public/shared/native-orchestration-contracts.js';
import { BackgroundTaskOutputController } from './background-task-output-controller.js';
import { backgroundOutputId, backgroundTaskWorkTarget, readBackgroundTaskDelivery, readBackgroundTaskResult, readBackgroundTaskOutput } from './background-task-output-contracts.js';
import { appraisalEventCurrent } from '../appraisal-authority.js';
import { simulationTaskCurrent } from '../simulation-authority.js';
import { createAuthorityPublicationBudget } from '../authority-transaction.js';
import { performance } from 'node:perf_hooks';

const captures = new WeakMap();
const fail = code => { throw new ConflictError(code); };
const equal = (a, b) => hash(a) === hash(b);
const configuration = resolved => hash({ route: resolved.route, model: resolved.model, connection: resolved.connection,
    generation: resolved.generation, resources: resolved.resources });

async function pendingTask(snapshot, input, host, handle) {
    const contract = snapshot.manifest.runtime.experienceContract, task = contract.taskRuntime.tasks.find(item => item.id === input.taskId);
    const variant = task?.variants.find(item => item.id === input.variantId), intent = snapshot.states.atri_lifecycle?.outbox.find(item => item.invocationId === input.invocationId);
    const scope = snapshot.states.atri_lifecycle?.scopes[intent?.scopeId];
    const appraisal = variant?.resultBinding?.kind === 'cognition.appraise';
    if (!task || !variant || !snapshot.states.atri_lifecycle.ready || !intent || intent.status !== 'pending' || intent.kind !== 'task'
        || intent.simulation && !appraisal || Boolean(intent.appraisalEvent) !== appraisal || task.executionClass !== 'background' || variant.resultBinding && !appraisal
        || intent.taskId !== task.id || intent.variantId !== variant.id || scope?.status !== 'active' || scope.epoch !== intent.scopeEpoch
        || !equal(intent.input, input.input) || snapshot.revision.revisionId !== input.revisionId)
        fail('native_orchestration_background_source_stale');
    if (appraisal && appraisalEventCurrent(snapshot, intent, task, variant).status !== 'current') fail('native_orchestration_background_source_stale');
    if (intent.simulation) {
        const installed = await host.sessionCore._openPackage(handle, snapshot.session.packageId, snapshot.session.packageVersionId, snapshot.session.entryPointId);
        const budget = await createAuthorityPublicationBudget(snapshot, installed);
        if (!simulationTaskCurrent(snapshot, intent, budget)) fail('native_orchestration_background_source_stale');
    }
    assertTaskValue(input.input, task.inputSchema);
    return { task, variant, intent, appraisal, slot: contract.taskRuntime.slots.find(item => item.id === task.bindingSlotId), payload: intent.input };
}

export function inspectNativeBackgroundGenerationIdentity(capture, { host, handle, sessionCore, finalizationBoundary } = {}) {
    const value = captures.get(capture);
    if (!value || value.handle !== handle || host !== undefined && value.host !== host || sessionCore !== undefined && value.host.sessionCore !== sessionCore
        || !(value.host instanceof NativeGenerationHost) || value.host.turnOrchestration !== value.owner
        || value.host.persistence._engine !== value.owner.engine) fail('native_orchestration_background_producer_denied');
    const active = finalizationBoundary === undefined ? nativeTaskScheduler.assertActiveBoundary(value.boundary, value.expected)
        : nativeTaskScheduler.assertFinalizationBoundary(finalizationBoundary, value.boundary, value.expected);
    if (active.attempt !== 0 || nativeTaskScheduler.operations.get(active.operationId)?.retry !== false)
        fail('native_orchestration_background_producer_denied');
    return { ...value, signal: active.signal, operationId: active.operationId };
}

export async function inspectNativeBackgroundGeneration(capture, expected) {
    const value = inspectNativeBackgroundGenerationIdentity(capture, expected);
    const snapshot = await value.host.sessionCore.observe(value.handle, value.input.sessionId);
    await pendingTask(snapshot, value.input, value.host, value.handle);
    if (hash(snapshot) !== value.snapshotDigest) fail('native_orchestration_background_source_stale');
    return { ...value, snapshot };
}

/** Original durable outbox producer; model work only, original Task owns adoption. */
export class NativeBackgroundOrchestrationAuthority {
    #runs = new Map();
    #finalizations = new WeakMap();
    #taskLanes = new WeakMap();
    constructor({ owner, execution, port, issueScope }) { Object.assign(this, { owner, execution, port, issueScope }); }
    hasRun(runId) { return this.#runs.has(runId); }
    async #select(host, handle, snapshot, input) {
        if (host.turnOrchestration !== this.owner || host.persistence._engine !== this.owner.engine || host.sessionCore !== this.owner.sessionCore)
            fail('native_orchestration_background_producer_denied');
        this.owner.plans ??= createOrchestrationAuthoringService(this.owner.engine, { sessionCore: this.owner.sessionCore,
            projectAgent: this.owner.projectAgent, rpControl: this.owner.rpControl, modelResolver: this.owner.modelResolver }).plans;
        const selector = { domain: 'native_session', sessionId: snapshot.session.sessionId, entryPointId: null };
        const taskRef = { taskId: input.taskId, variantId: input.variantId };
        let binding;
        // A task-specific selection takes precedence over the general Session
        // selection; all scopes still name this exact owned Session.
        const selectors = [taskRef, null].flatMap(task => [snapshot.session.entryPointId, null]
            .map(entryPointId => ({ ...selector, entryPointId, ...task ? { taskRef: task } : {} })));
        for (const sourceSelector of selectors) {
            binding = await this.owner.plans.getBinding(handle, sourceSelector);
            if (binding) break;
        }
        if (!binding) return null;
        const taskPlan = await pendingTask(snapshot, input, host, handle);
        if (input.fallbackMode !== undefined && input.fallbackMode !== 'disabled') fail('native_orchestration_background_route_mismatch');
        const plan = await this.owner.plans.getRevision(handle, binding.planRef), graph = plan.definition;
        if (assertResultPolicy(graph.outputContract).outputType !== 'json') fail('native_orchestration_background_plan_unavailable');
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
    async #current(state, finalizationBoundary) {
        const captured = await inspectNativeBackgroundGeneration(state.capture, { host: state.host, handle: state.handle, finalizationBoundary });
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
        let capture;
        const operation = nativeTaskScheduler.submit({ ...work, retry: false, run: async boundary => {
            capture = Object.freeze({});
            const request = immutable({ sessionId: input.sessionId, revisionId: input.revisionId, requestId: input.invocationId,
                role: selected.resolved.route.role.replace(/^role\./, ''), routeRef: selected.pin.resourceRef,
                fallbackMode: 'disabled', outputContract: { name: 'atria_task', schema: selected.taskPlan.variant.outputSchema } });
            captures.set(capture, { host, owner: this.owner, handle, input: immutable(input), request, taskPlan: immutable(selected.taskPlan), boundary, expected,
                policy: immutable(snapshot.manifest.runtime.experienceContract.generationBudget), policyDigest: hash(snapshot.manifest.runtime.experienceContract.generationBudget),
                snapshotDigest: hash(snapshot), sourceRequest: { domain: 'native_session', sessionId: input.sessionId,
                    branchId: snapshot.revision.branchId, revisionId: input.revisionId, taskRef: { taskId: input.taskId, variantId: input.variantId } } });
            return this.#generate({ host, handle, input, snapshot, selected, capture, request, lanePlan: captured });
        }, finalize: (result, receipt, boundary) => this.#finalize(handle, result, receipt, boundary, work.finalize) });
        const release = () => {
            const runId = captures.get(capture)?.runId;
            if (runId) this.#runs.delete(runId);
            if (capture) captures.delete(capture);
            if (this.#taskLanes.get(captured)?.capture === capture) this.#taskLanes.delete(captured);
        };
        operation.result.then(release, release);
        return operation;
    }
    async #generate({ host, handle, input, snapshot, selected, capture, request, lanePlan }) {
        await inspectNativeBackgroundGeneration(capture, { host, handle });
        await RunControl.prototype.checkGenerationQuota.call(this.owner.sessionCore.runs, handle, snapshot,
            { background: true, role: request.role, anchor: { invocationId: input.invocationId } },
            snapshot.manifest.runtime.experienceContract.generationBudget);
        const service = this.execution(), captured = await service.sourcePort.capture(handle, captures.get(capture).sourceRequest);
        const logicalInputRef = immutable({ kind: 'native_background_intent', sourceBindingDigest: captured.sourceBinding.bindingDigest,
            invocationId: input.invocationId, requestId: request.requestId, role: request.role, taskId: input.taskId, variantId: input.variantId,
            taskDefinitionHash: hash(selected.taskPlan.task), taskResultClass: selected.taskPlan.task.resultPolicy.resultClass,
            taskResultSink: selected.taskPlan.task.resultPolicy.sink, taskResultBinding: selected.taskPlan.variant.resultBinding ?? null,
            schedulerOperationId: captures.get(capture).boundary.operationId,
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
        const state = { host, handle, input, selected, capture, request, lanePlan, sourceBinding: captured.sourceBinding, decision };
        captures.get(capture).runId = root.runId;
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
            state.bank = send.bank; state.limits = limits;
            if (selected.taskPlan.appraisal) { state.taskWorkPhase = 0; this.#taskLanes.set(lanePlan, state); }
            const compiled = await compileNativeContextMetered({ handle, port, request: contextRequest, bank: send.bank, budgetPort: service.budgetPort, root: await service.runs.get(handle, root.runId),
                effectId, limits, workDescriptor: { requestId: request.requestId, pathFingerprint: selected.resolved.pathFingerprint }, assertCurrent: () => this.#current(state), signal: captures.get(capture).boundary.signal });
            state.contextPort = port; state.context = compiled.compiled;
            await send.bindContext({ port, compiled: compiled.compiled, compileProof: compiled.proof });
            const scope = this.issueScope(host, handle, { runId: root.runId, effectId, request, logicalInputRef, logicalInputHash: hash(logicalInputRef), nativeBackgroundCapture: capture,
                options: { scheduled: true, taskPlan: selected.taskPlan, lanePlan, orchestrationSend: send }, revalidateConsume: async ({ tx } = {}) => {
                    await this.#current(state); await service.sourcePort.revalidate(handle, state.sourceBinding, tx ? { tx } : undefined);
                    await port.revalidate(handle, { context: compiled.compiled, phase: 'consume' });
                } });
            const result = await this.port(host).generate(handle, scope, { signal: captures.get(capture).boundary.signal });
            this.#finalizations.set(result, { state, snapshot, root });
            return result;
        } catch (error) { this.#runs.delete(root.runId); throw error; }
    }

    /** Original appraisal parse/adoption work in the real Scheduler finalizer.
     * The lane object is a private identity; JSON cannot register this bridge. */
    async runTaskWork({ host, handle, lanePlan, kind, value, operation }) {
        const state = lanePlan && this.#taskLanes.get(lanePlan);
        if (!state) return { handled: false };
        if (state.host !== host || state.handle !== handle || !state.finalizationBoundary
            || ['appraisal_parse', 'appraisal_adopt'][state.taskWorkPhase] !== kind || typeof operation !== 'function') fail('native_orchestration_background_producer_denied');
        await this.#current(state, state.finalizationBoundary);
        const job = state.taskWorkJobs?.[state.taskWorkPhase++];
        if (!job?.admitted || Buffer.byteLength(JSON.stringify(value)) > job.estimatedInputBytes) fail('native_orchestration_background_producer_denied');
        const started = performance.now(), cpu = process.cpuUsage(); let outcome = 'failed';
        try {
            await this.#current(state, state.finalizationBoundary);
            const result = await operation(); outcome = 'completed'; return { handled: true, value: result };
        } finally {
            const used = process.cpuUsage(cpu);
            job.usage = { wallMs: performance.now() - started, cpuUserMicros: used.user, cpuSystemMicros: used.system, cpuScope: 'process', outcome };
        }
    }

    async #finalize(handle, result, receipt, boundary, finalize) {
        const completion = this.#finalizations.get(result);
        if (!completion || completion.state.handle !== handle) fail('native_orchestration_background_completion_required');
        const { state } = completion;
        state.finalizationBoundary = boundary;
        let delivered, error;
        try {
            try {
                if (state.selected.taskPlan.appraisal) await this.#prepareTaskWork(completion, result, receipt);
                delivered = await this.#deliver(handle, result, receipt, boundary, finalize);
            } catch (cause) { error = cause; }
            for (const job of state.taskWorkJobs ?? []) if (job.admitted) {
                const usage = job.usage ?? { wallMs: 0, cpuUserMicros: 0, cpuSystemMicros: 0, cpuScope: 'process', outcome: 'failed' };
                try { await state.bank.settleLocalWork(job.attemptId, usage); } catch (cause) {
                    let observed = false;
                    if (cause.code === 'storage_commit_unknown') {
                        try {
                            const { runs, budgetPort } = this.execution();
                            observed = await runs.engine.withTransaction(handle, async tx => {
                                const costs = await budgetPort.observeEffectClosure(handle,
                                    { authorityRef: completion.root.budgetAuthorityRef, effectIds: [state.effectId] }, { tx });
                                const ref = costs.budgetAttemptRefs.find(ref => ref.kind === 'local_work' && ref.attemptId === job.attemptId);
                                const row = ref ? await budgetPort.observeAttempt(handle, ref) : null;
                                return row?.status === 'settled' && equal(row.usage, usage);
                            });
                        } catch { /* Missing original settlement stays unknown. */ }
                    }
                    if (!observed) { if (error) error.captureError ??= cause; else error = cause; }
                }
            }
            if (error) throw error;
            if (state.selected.taskPlan.appraisal) await this.#finishTaskMetadata(completion, delivered);
            return delivered.value;
        } finally { state.finalizationBoundary = null; this.#finalizations.delete(result); }
    }

    async #prepareTaskWork({ state, snapshot, root }, result, receipt) {
        if (this.owner.engine.hasActiveTransaction(state.handle)) fail('native_orchestration_background_producer_denied');
        const parseBytes = Buffer.byteLength(JSON.stringify(result.generated.response));
        const adoptBound = Buffer.byteLength(JSON.stringify({ snapshot, generated: result.generated, receipt })) + assertResultPolicy(root.graph.outputContract).maxBytes;
        state.taskWorkJobs = [];
        for (const [kind, estimatedInputBytes] of [['appraisal_parse', parseBytes], ['appraisal_adopt', adoptBound]]) {
            await this.#current(state, state.finalizationBoundary);
            const job = { kind, estimatedInputBytes, attemptId: state.bank.nextLocalWorkAttemptId(), admitted: false };
            state.taskWorkJobs.push(job);
            try {
                await state.bank.chargeLocalWork(state.limits, { attemptId: job.attemptId, requestId: state.input.invocationId, kind, estimatedItems: 1,
                    estimatedInputBytes, targetFingerprint: backgroundTaskWorkTarget(state.decision.inputRef, kind) });
                job.admitted = true;
            } catch (error) {
                if (error.code === 'native_orchestration_budget_reconcile_required' && error.budgetObservation?.status === 'charged') job.admitted = true;
                throw error;
            }
        }
    }

    async #finishTaskMetadata({ state, root: admitted }, delivered) {
        const { handle } = state, { runId } = admitted, service = this.execution(), { runs } = service;
        try {
            const result = await runs.withSourceControl(handle, runId, () => runs.engine.withTransaction(handle, async () => {
                try {
                    await new BackgroundTaskOutputController({ ...service, authorize: delivered.authorize }).complete(handle, runId,
                        { effectId: state.effectId, domainRef: delivered.domainRef });
                    return {};
                } catch (error) {
                    if (error.code === 'native_orchestration_background_completion_stale') return { error };
                    throw error;
                }
            }), { withAuthority: service.sourcePort.consumptionBoundary(handle, state.sourceBinding, { engine: runs.engine }) });
            if (result.error) throw result.error;
        } catch (error) {
            if (error.code !== 'storage_commit_unknown') throw error;
            const saved = await runs.engine.withTransaction(handle, async tx => {
                const root = await runs.get(handle, runId);
                await delivered.authorize({ tx, root });
                return readBackgroundTaskOutput(tx, handle, root);
            });
            if (!saved || !equal(saved.claim.domainReceiptRef, delivered.domainRef)) throw error;
        }
    }

    async #deliver(handle, result, receipt, boundary, finalize) {
        const completion = this.#finalizations.get(result);
        if (!completion || completion.state.handle !== handle) fail('native_orchestration_background_completion_required');
        const { state, snapshot, root: admitted } = completion, service = this.execution(), { runs } = service;
        const { runId } = admitted;
        let finalized, domainRef;
        const authorize = async ({ tx, root }) => {
            inspectNativeBackgroundGenerationIdentity(state.capture, { host: state.host, handle, finalizationBoundary: boundary });
            const fence = await runs.engine.nativeHostLifecycle.assertWriter(handle, tx);
            let selected;
            try { selected = await this.#select(state.host, handle, snapshot, state.input); } catch (error) {
                if (['native_orchestration_background_plan_unavailable', 'native_orchestration_background_route_mismatch',
                    'native_orchestration_background_budget_unavailable'].includes(error.code)) fail('native_orchestration_background_completion_stale');
                throw error;
            }
            await this.owner.sessionCore.runs.assert(handle, state.input.sessionId, 'generate');
            const current = await this.owner.sessionCore.observe(handle, state.input.sessionId);
            if (!selected || !equal(selected.binding, state.selected.binding) || selected.configDigest !== state.selected.configDigest
                || root.runId !== runId || root.epoch !== admitted.epoch || !equal(root.sourceBinding, state.sourceBinding)
                || root.hostBootId !== fence.hostBootId || root.hostGeneration !== fence.generation
                || !finalized || hash(current) !== hash(finalized.snapshot)) fail('native_orchestration_background_completion_stale');
        };
        try {
            const outcome = await runs.withSourceControl(handle, runId, () => runs.engine.withTransaction(handle, async tx => {
                try {
                    await this.#current(state, boundary);
                    const root = await runs.get(handle, runId), stamp = hash(root);
                    const descriptor = await this.port(state.host).inspectResultCompletion(handle, { result, runId, effectId: state.effectId });
                    await this.#current(state, boundary);
                    if (hash(await runs.get(handle, runId)) !== stamp || descriptor.producerAttemptId !== state.attemptId) fail('native_orchestration_background_completion_stale');
                } catch (error) {
                    // Commit reentrant withdrawal before refusing any Task adoption.
                    if (['native_orchestration_background_source_stale', 'native_orchestration_background_completion_stale',
                        'native_orchestration_model_result_completion_stale', 'native_orchestration_source_stale'].includes(error.code)) return { error };
                    throw error;
                }
                finalized = await finalize(result.generated, receipt);
                const record = finalized?.record;
                if (!record || !finalized.snapshot || record.invocationId !== state.input.invocationId) fail('native_orchestration_background_completion_required');
                domainRef = { kind: 'native_background_task', sessionId: state.input.sessionId, revisionId: record.storedRevisionId,
                    invocationId: record.invocationId, taskId: record.taskId, variantId: record.variantId, recordHash: hash(record) };
                const root = await runs.get(handle, runId), delivered = await readBackgroundTaskDelivery(tx, handle, root, state.effectId, domainRef);
                // Historical retention remains even if authority is withdrawn in
                // a later await. This receipt never grants completion or reuse.
                const receiptId = backgroundOutputId('delivery', runId);
                await putImmutable(tx, controlRecordKey(handle, runId, 'receipt', receiptId), {
                    schemaVersion: 1, receiptKind: 'background_task_delivery', receiptId, runId, epoch: root.epoch,
                    effectId: state.effectId, domainRef, modelReceiptRef: delivered.model.receiptRef });
                try {
                    await new BackgroundTaskOutputController({ ...service, authorize }).complete(handle, runId, { effectId: state.effectId, domainRef });
                } catch (error) {
                    if (error.code === 'native_orchestration_background_completion_stale') return { error };
                    throw error;
                }
                return { value: finalized };
            }), { withAuthority: service.sourcePort.consumptionBoundary(handle, state.sourceBinding, { engine: runs.engine }) });
            if (outcome.error) throw outcome.error;
            return { value: outcome.value, domainRef, authorize };
        } catch (error) {
            if (error.code !== 'storage_commit_unknown' || !domainRef) throw error;
            // Observe the exact original adoption/closure after an unknown ACK.
            // No second finalize, Task writer, Provider send or command is issued.
            let saved;
            try {
                saved = await runs.engine.withTransaction(handle, async tx => {
                    const root = await runs.get(handle, runId);
                    await authorize({ tx, root });
                    const delivered = await readBackgroundTaskDelivery(tx, handle, root, state.effectId, domainRef);
                    if (!await readBackgroundTaskResult(tx, handle, root)) throw error;
                    if (root.status === 'completed' && !await readBackgroundTaskOutput(tx, handle, root)) throw error;
                    return equal(delivered.record, finalized.record);
                });
            } catch { throw error; }
            if (!saved) throw error;
            return { value: finalized, domainRef, authorize };
        }
    }
}
