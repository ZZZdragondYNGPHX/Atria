import { NativeProjectAgentExecutor } from '../project-agent-executor.js';
import { NativeGenerationHost } from '../adapters/generation-host.js';
import { NativeTaskScheduler } from '../task-scheduler.js';
import { ProjectAgentService } from '../project-agent.js';
import { ProjectTaskRepository } from '../agent-intelligence/project-task-repository.js';
import { StudioService } from '../authoring/studio-service.js';
import { immutable } from '../model-prompt-runtime/execution-utils.js';
import { equalNativeDocuments, hashNativeDocument as hash } from '../repositories/common.js';
import { executeProjectSkillWork } from '../skill-invocation.js';
import { prepareRetrievalCompute } from '../retrieval-compute.js';
import { pinSkillEntries, loadAlwaysSkills, boundSkillFile } from '../../../public/shared/skill-invocation.js';
import { ModelPort } from './model-port.js';
import { readFanoutFrame, readFanoutMembership } from './fanout-controller.js';
import { readEffect } from './effect-contracts.js';
import { readAttempt } from './controller-common.js';
import { checkedRecord, readPlanRevision } from './plan-repository.js';
import { NATIVE_RESOURCE_KINDS as K } from '../contracts.js';
import { nodeModelRoutePins } from '../../../public/shared/native-orchestration-contracts.js';
import { readProjectDelegation, readProjectDelegationInputs } from './project-delegation-contracts.js';
import { readOriginalProjectTask } from './project-tool-receipts.js';
import { assertChildRunCurrent } from './run-repository.js';
import { BudgetPort } from './budget-port.js';
import { projectAgentRoundConversation } from '../../../public/shared/project-agent-conversation.js';
import { readProjectRoundReceipt } from './project-round-contracts.js';
import { readAttemptSettlement } from './attempt-settlement.js';
import { assertProjectToolReceipt, readProjectToolDescriptor, projectToolCapability, projectToolAction, projectToolResultPayload, projectReviewSource } from './project-tool-contracts.js';

const operations = new WeakMap(), starts = new WeakMap(), generations = new WeakMap();
const toolPermits = new WeakMap();
const generationPermits = new WeakMap();
const roundCompletions = new WeakMap();
const fanoutControls = new WeakMap(), fanoutChildren = new WeakMap();
const fail = (code = 'native_orchestration_project_producer_denied') => { throw Object.assign(new TypeError(code), { code }); };
const stopped = task => ['review', 'blocked', 'conflict', 'taken_over', 'completed', 'committing', 'cancelled'].includes(task.status);

function frameExpected(state) {
    const { handle, preflight, startInput } = state;
    return { owner: handle, anchor: { projectId: preflight.projectId, taskId: preflight.taskId, requestId: startInput.requestId, runtimeRouteId: startInput.runtimeRouteId },
        kind: 'model_task', executionClass: 'interactive', resources: NativeProjectAgentExecutor.prototype.assertOriginalPreflight.call(state.executor, preflight).resources, key: 'project-agent:' + preflight.taskId,
        fingerprint: hash(startInput) };
}

function schedulerFrame(state) {
    if (!state.fanoutChildPermit) return { boundary: state.boundary, expected: frameExpected(state) };
    const child = fanoutChildren.get(state.fanoutChildPermit);
    if (!child || child.generation.state !== state.fanoutParentState || !fanoutControls.get(child.controlPermit)?.active) fail();
    return { boundary: child.boundary, expected: child.expected };
}

function assertFrame(state, expected = {}, controlPermit = null) {
    const { executor, host, handle, preflight, startInput, boundary } = state;
    if (!(executor instanceof NativeProjectAgentExecutor) || !(executor.host instanceof NativeGenerationHost)
        || !(host instanceof NativeGenerationHost) || Object.getPrototypeOf(host) !== executor.host
        || !(executor.scheduler instanceof NativeTaskScheduler) || !(host.agent instanceof ProjectAgentService)
        || Object.getPrototypeOf(host.agent) !== executor.host.agent || host.agent === executor.host.agent
        || host.studio !== executor.host.studio || !(host.studio instanceof StudioService)
        || host.agent._studio !== host.studio || !(host.agent._repository instanceof ProjectTaskRepository)
        || host.agent._repository !== executor.host.agent._repository
        || host.persistence !== executor.host.persistence || host.persistence._engine !== host.agent._repository.engine
        || host.studio.storageEngine !== host.persistence._engine
        || (expected.host !== undefined && expected.host !== host)
        || (expected.projectAgent !== undefined && expected.projectAgent !== host.agent)
        || (expected.studio !== undefined && expected.studio !== host.studio)
        || expected.handle !== handle) fail();
    const original = NativeProjectAgentExecutor.prototype.assertOriginalPreflight.call(executor, preflight);
    NativeProjectAgentExecutor.prototype.assertOriginalOperation.call(executor, { host, handle, boundary, preflight, startInput });
    if (!original.selection || !Number.isSafeInteger(preflight.maxModelRounds) || preflight.maxModelRounds < 1 || preflight.maxModelRounds > 12
        || startInput.maxModelRounds !== preflight.maxModelRounds
        || preflight.projectId !== state.projectId || preflight.taskId !== state.taskId
        || preflight.runtimeRouteId !== startInput.runtimeRouteId || hash(preflight) !== startInput.expectedPreflightFingerprint) fail();
    let active;
    if (controlPermit && (!fanoutControls.get(controlPermit)?.active || fanoutControls.get(controlPermit).generation.state !== state)) fail();
    if (state.fanoutChildPermit) {
        const child = fanoutChildren.get(state.fanoutChildPermit);
        if (!child || child.generation.state !== state.fanoutParentState || state.fanoutParentState.boundary !== boundary
            || !fanoutControls.get(child.controlPermit)?.active) fail();
        // Validate every original ancestor's suspended control witness; the
        // final leaf still requires the original active send boundary.
        assertFrame(state.fanoutParentState, expected, child.controlPermit);
        const parent = schedulerFrame(state.fanoutParentState);
        active = NativeTaskScheduler.prototype[controlPermit ? 'assertFanoutChildControlBoundary' : 'assertFanoutChildBoundary']
            .call(executor.scheduler, parent.boundary, parent.expected, child.boundary, child.expected);
    } else active = NativeTaskScheduler.prototype[controlPermit ? 'assertFanoutControlBoundary' : 'assertActiveBoundary']
        .call(executor.scheduler, boundary, frameExpected(state));
    if (executor.scheduler.operations.get(active.operationId)?.retry !== false || active.attempt !== 0) fail();
    return active;
}

async function currentOperation(state, expected, controlPermit = null) {
    const active = assertFrame(state, expected, controlPermit);
    if (hash(await NativeProjectAgentExecutor.prototype.configuration.call(state.executor, state.handle)) !== state.preflight.configurationFingerprint)
        fail('native_orchestration_source_stale');
    const current = await ProjectAgentService.prototype.observeComputeSource.call(state.host.agent, state.handle, state.projectId, state.taskId);
    if (stopped(current.task) && !projectReviewSource(current.task, state.lastGeneration?.toolReceipts.at(-1))
        || current.task.baseRevision !== state.preflight.baseRevision || current.project.revision.revision !== state.preflight.baseRevision
        || (state.currentSourceFingerprint !== null && current.task.executionFingerprint !== state.currentSourceFingerprint))
        fail('native_orchestration_source_stale');
    assertFrame(state, expected, controlPermit);
    return { active, ...current };
}

/** Original interactive Executor bridge only; this capability is never JSON. */
export async function captureNativeProjectOperation({ executor, host, handle, boundary, preflight, startInput }) {
    const state = { executor, host, handle, boundary, preflight, startInput: immutable(startInput),
        projectId: preflight.projectId, taskId: preflight.taskId, initialSourceFingerprint: null, currentSourceFingerprint: null,
        nextRound: 0, skillWorkRecords: [], repository: null, settingsDigest: null };
    NativeProjectAgentExecutor.prototype.assertOriginalOperation.call(executor, { host, handle, boundary, preflight, startInput }, { claim: true });
    await currentOperation(state, { host, handle });
    // Preflight includes the original stored-integrity projection, while the
    // pure transaction reader intentionally returns the execution source only.
    const originalTask = await ProjectAgentService.prototype.observeTask.call(host.agent, handle, state.projectId, state.taskId);
    if (hash(originalTask) !== preflight.taskFingerprint) fail('native_orchestration_source_stale');
    const requestId = 'project:' + hash({ requestId: state.startInput.requestId, round: 0 });
    if (originalTask.attempts.some(attempt => attempt.kind === 'generation' && attempt.requestId === requestId))
        fail('native_orchestration_project_request_replayed');
    state.initialSourceFingerprint = originalTask.executionFingerprint;
    state.currentSourceFingerprint = originalTask.executionFingerprint;
    const route = (await NativeProjectAgentExecutor.prototype.configuration.call(executor, handle)).routes.find(item => item.runtimeRouteId === startInput.runtimeRouteId);
    if (route?.role !== 'role.studio' || route.scope !== 'player'
        || !NativeProjectAgentExecutor.prototype.assertOriginalPreflight.call(executor, preflight).selection) fail();
    state.repository = host.skillRepository(handle);
    const capture = Object.freeze({}); operations.set(capture, state); return capture;
}

export async function inspectNativeProjectOperation(capture, expected) {
    const state = operations.get(capture); if (!state) fail();
    const current = await currentOperation(state, expected);
    return Object.freeze({ host: state.host, projectAgent: state.host.agent, studio: state.host.studio, handle: state.handle,
        projectId: state.projectId, taskId: state.taskId, revision: state.preflight.baseRevision, signal: current.active.signal,
        operationId: current.active.operationId, selection: NativeProjectAgentExecutor.prototype.assertOriginalPreflight.call(state.executor, state.preflight).selection });
}

/** Calls the existing writer itself; only its actual returned object can mint a round. */
export async function beginNativeProjectGeneration(capture, { expectedSequence }) {
    const state = operations.get(capture); if (!state) fail();
    await currentOperation(state, { host: state.host, handle: state.handle });
    if (state.nextRound >= state.preflight.maxModelRounds) fail();
    if (state.nextRound > 0 && !state.lastGeneration?.continueAllowed) fail('native_orchestration_project_round_not_ready');
    const started = await ProjectAgentService.prototype.beginGeneration.call(state.host.agent, state.handle, state.projectId, state.taskId, { expectedSequence });
    const attempt = started.attempts.at(-1);
    if (attempt?.kind !== 'generation' || attempt.status !== 'started' || attempt.requestId !== null) fail();
    starts.set(started, { state, attemptId: attempt.attemptId, sourceFingerprint: started.executionFingerprint,
        conversationDigest: hash(started.conversation), callsDigest: hash(attempt.calls), used: false });
    return started;
}

export async function captureNativeProjectGeneration(capture, { started, round }) {
    const state = operations.get(capture), original = starts.get(started);
    if (!state || !original || original.state !== state || original.used || round !== state.nextRound
        || !Number.isSafeInteger(round) || round < 0 || round >= state.preflight.maxModelRounds) fail();
    const current = await currentOperation(state, { host: state.host, handle: state.handle });
    const attempt = current.task.attempts.find(item => item.attemptId === original.attemptId);
    if (current.task.executionFingerprint !== original.sourceFingerprint || hash(current.task.conversation) !== original.conversationDigest
        || attempt?.status !== 'started' || attempt.requestId !== null || hash(attempt.calls) !== original.callsDigest) fail('native_orchestration_source_stale');
    // An unknown original write ACK cannot be repeated to mint another permission.
    original.used = true;
    const requestId = 'project:' + hash({ requestId: state.startInput.requestId, round });
    await ProjectAgentService.prototype.recordGenerationRequest.call(state.host.agent, state.handle, state.projectId, state.taskId, original.attemptId, requestId);
    const projectCapture = Object.freeze({});
    const generation = { state, projectAttemptId: original.attemptId, requestId, round,
        sourceFingerprint: original.sourceFingerprint, currentSourceFingerprint: original.sourceFingerprint,
        conversationDigest: original.conversationDigest, callsDigest: original.callsDigest, toolReceipts: [], toolResults: [], finished: false, continueAllowed: false };
    generations.set(projectCapture, generation); state.lastGeneration = generation;
    state.nextRound++;
    await inspectNativeProjectGeneration(projectCapture, { host: state.host, handle: state.handle });
    return projectCapture;
}

/** A read-only model stage of an already active original Task generation.
 * It cannot finish that generation, acquire tools or alter Task state. */
export async function captureNativeProjectWorker(capture, { requestId, task, outputContract = null, routeRef = null, fanoutPermit = null, nodeId = null }) {
    const original = generations.get(capture);
    if (!original || original.workerStage || typeof requestId !== 'string' || !requestId.startsWith('project-quality:')) fail();
    const child = fanoutPermit ? fanoutChildren.get(fanoutPermit) : null;
    if (fanoutPermit && (child?.generation !== original || !child.nodeIds.includes(nodeId))) fail();
    if (child) {
        const route = await original.state.host.persistence.getRuntimeRoute(original.state.handle, routeRef.runtimeRouteId);
        const resources = await original.state.host.executionResources(original.state.handle, route);
        if (resources.some(resource => !child.expected.resources.includes(resource))) fail();
    }
    const state = child ? { ...original.state, fanoutChildPermit: fanoutPermit, fanoutParentState: original.state } : original.state;
    const stage = Object.freeze({});
    generations.set(stage, { ...original, state, requestId, originalRequestId: original.requestId,
        workerStage: immutable({ task, outputContract, ...(nodeId ? { nodeId } : {}), ...(routeRef ? { routeRef } : {}) }), toolReceipts: [], toolResults: [] });
    await inspectNativeProjectGeneration(stage, { host: original.state.host, handle: original.state.handle });
    return stage;
}

/** A candidate child id is a locator, never permission. Only this module's
 * actual opaque parent capture and fresh original delegation/Task/bank facts
 * can bind that child to the already allocated private Scheduler scope. */
async function readDelegatedBoundary(capture, { candidateChild = null, candidateParentAttempt = null, bound = null, permit = null }) {
    return readDelegatedGenerationBoundary(generations.get(capture), { candidateChild, candidateParentAttempt, bound, permit });
}

async function readDelegatedGenerationBoundary(original, { candidateChild = null, candidateParentAttempt = null, bound = null, permit = null, controlPermit = null }) {
    if (!original?.workerStage) fail();
    const outer = original.state.fanoutChildPermit ? fanoutChildren.get(original.state.fanoutChildPermit) : null;
    if (original.state.fanoutChildPermit && !outer) fail();
    const inherited = outer?.delegation && bound && equalNativeDocuments(bound, outer.delegation);
    if (inherited && (candidateChild || candidateParentAttempt || permit)) fail();
    // A deeper boundary must come from this actual captured child Node. The
    // parent allocation is re-read recursively; a supplied Run id cannot bind it.
    const parentLineage = outer?.delegation && !inherited ? await readDelegatedGenerationBoundary(outer.generation,
        { bound: outer.delegation, controlPermit: outer.controlPermit }) : null;
    const lineageOwner = inherited ? outer.generation : original;
    const { host, handle } = original.state, engine = host.persistence._engine;
    const scope = permit ? fanoutChildren.get(permit) : null;
    if (permit && scope?.generation !== original) fail();
    const scopeState = scope ? { ...original.state, fanoutChildPermit: permit, fanoutParentState: original.state } : original.state;
    await currentGeneration(original, { host, handle }, scopeState, controlPermit);
    return engine.withTransaction(handle, async tx => {
        const runId = bound?.childRunId ?? candidateChild?.runId;
        const child = runId && (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId }))?.doc;
        if (!child?.parentRef || candidateChild && !equalNativeDocuments(candidateChild, child)) fail();
        const parent = (await checkedRecord(tx, { kind: K.orchestrationRun, handle, runId: child.parentRef.parentRunId }))?.doc;
        if (!parent) fail();
        const lineage = await readProjectDelegation(tx, handle, parent, child.runId), source = child.sourceBinding.sourceRef;
        const task = await readOriginalProjectTask(tx, handle, source), generation = task?.attempts.find(attempt => attempt.attemptId === original.projectAttemptId);
        if (outer && !outer.delegation) {
            const frameId = lineage?.parentInput.fanoutAttemptId;
            const frame = frameId && await readFanoutFrame(tx, handle, parent, frameId);
            const branch = frame?.branches.find(branch => branch.scopeNodeIds.includes(lineage?.parentAttempt.nodeId));
            if (!lineage || !frame || !branch || lineage.parentAttempt.nodeId !== (original.workerStage.nodeId ?? original.workerStage.task.nodeId)
                || !lineage.parentNode.capabilities.includes('agent.delegate')
                || !equalNativeDocuments([...outer.nodeIds].sort(), [...branch.scopeNodeIds].sort())
                || !await readFanoutMembership(tx, handle, parent, frame, lineage.parentAttempt.attemptId)) fail();
        }
        if (parentLineage && (parent.runId !== parentLineage.lineage.child.runId
            || lineage?.parentAttempt.nodeId !== original.workerStage.task.nodeId
            || !parentLineage.lineage.graph.nodes.some(node => node.nodeId === original.workerStage.task.nodeId && node.capabilities.includes('agent.delegate')))) fail();
        if (!lineage || candidateParentAttempt && !equalNativeDocuments(candidateParentAttempt, lineage.parentAttempt)
            || parent.status !== 'running' || parent.cancelRequested || child.cancelRequested || !['admitted', 'running'].includes(child.status)
            || child.parentRef.parentEpoch !== parent.epoch || lineage.parentAttempt.epoch !== parent.epoch
            || lineage.parentAttempt.status !== (lineage.mode === 'handoff' ? 'waiting_child' : 'running')
            || lineage.parentInput.requestId !== lineageOwner.requestId || lineage.parentInput.role !== 'studio'
            || source.projectId !== original.state.projectId || source.taskId !== original.state.taskId || source.revision !== original.state.preflight.baseRevision
            || source.executionFingerprint !== original.state.initialSourceFingerprint
            || generation?.kind !== 'generation' || generation.status !== 'started'
            || generation.requestId !== (original.originalRequestId ?? original.requestId)) fail();
        await assertChildRunCurrent(tx, handle, child);
        await readProjectDelegationInputs(tx, handle, parent, lineage.parentAttempt, { live: true });
        await BudgetPort.prototype.verifyReservation.call(host.turnOrchestration.execution.budgetPort, { handle, tx, root: child, parent });
        const binding = immutable({ childRunId: child.runId, parentRunId: parent.runId, parentAttemptId: lineage.parentAttempt.attemptId,
            childEpoch: child.epoch, parentEpoch: parent.epoch, planRef: child.planRef,
            sourceBindingDigest: child.sourceBinding.bindingDigest, requestId: lineageOwner.requestId, projectAttemptId: original.projectAttemptId });
        if (bound && !equalNativeDocuments(bound, binding)) fail();
        return { lineage, binding };
    });
}

/** Original Task child boundary only. A JSON child id cannot mint this worker. */
export async function captureNativeProjectDelegatedWorker(capture, permit, { requestId, task, outputContract = null, routeRef, nodeId }) {
    const original = generations.get(capture), child = fanoutChildren.get(permit);
    if (!original?.workerStage || child?.generation !== original
        || typeof requestId !== 'string' || !requestId.startsWith('project-quality:')) fail();
    if (!child.nodeIds.includes(nodeId)) {
        if (!child.delegation) fail();
        const { lineage } = await readDelegatedBoundary(capture, { bound: child.delegation, permit });
        const node = lineage.graph.nodes.find(node => node.nodeId === nodeId), pin = node && nodeModelRoutePins(node, lineage.plan.dependencyPins)[0];
        if (!node || !['agent', 'planner', 'review', 'judge'].includes(node.kind) || !node.capabilities.includes('generation.send')
            || !pin || pin.port !== 'model' || !equalNativeDocuments(routeRef, pin.resourceRef)
            || lineage.plan.definition.nodes.some(initial => initial.nodeId === nodeId)) fail();
    }
    const route = await original.state.host.persistence.getRuntimeRoute(original.state.handle, routeRef.runtimeRouteId);
    if ((await original.state.host.executionResources(original.state.handle, route)).some(resource => !child.expected.resources.includes(resource))) fail();
    const state = { ...original.state, fanoutChildPermit: permit, fanoutParentState: original.state };
    const stage = Object.freeze({});
    generations.set(stage, { ...original, state, requestId, originalRequestId: original.originalRequestId ?? original.requestId,
        workerStage: immutable({ task: { ...task, nodeId }, outputContract, routeRef }), toolReceipts: [], toolResults: [] });
    await inspectNativeProjectGeneration(stage, { host: state.host, handle: state.handle });
    return stage;
}

/** Independent proof of the active original child Scheduler allocation. */
export function inspectNativeProjectDelegatedBoundary(capture, permit, expected, controlPermit = null) {
    const generation = generations.get(capture), child = fanoutChildren.get(permit);
    if (!generation?.workerStage || child?.generation !== generation || !fanoutControls.get(child.controlPermit)?.active
        || expected.handle !== generation.state.handle || expected.host !== generation.state.host) fail();
    if (controlPermit) {
        const control = fanoutControls.get(controlPermit);
        if (!control?.active || control.generation.state.fanoutChildPermit !== permit) fail();
        return assertFrame(control.generation.state, expected, controlPermit);
    }
    assertFrame(generation.state, expected, child.controlPermit);
    const parent = schedulerFrame(generation.state);
    return NativeTaskScheduler.prototype.assertFanoutChildBoundary.call(generation.state.executor.scheduler, parent.boundary,
        parent.expected, child.boundary, child.expected);
}

export function inspectNativeProjectGenerationIdentity(capture, expected) {
    const generation = generations.get(capture); if (!generation) fail();
    const { state, toolReceipts: _reads, toolResults: _results, finished: _finished, continueAllowed: _continue, ...metadata } = generation, active = assertFrame(state, expected);
    const request = immutable({ projectId: state.projectId, taskId: state.taskId, revision: state.preflight.baseRevision,
        projectAttemptId: generation.projectAttemptId, requestId: generation.requestId, role: 'studio',
        routeRef: generation.workerStage?.routeRef ?? { scope: 'player', runtimeRouteId: state.startInput.runtimeRouteId },
        ...(generation.workerStage?.outputContract ? { outputContract: generation.workerStage.outputContract } : {}) });
    return Object.freeze({ ...metadata, ...request, request,
        sourceRequest: immutable({ domain: 'project', projectId: state.projectId, taskId: state.taskId, revision: state.preflight.baseRevision, executionFingerprint: state.initialSourceFingerprint }),
        operationRequestId: state.startInput.requestId,
        host: state.host, projectAgent: state.host.agent, studio: state.host.studio, handle: state.handle,
        signal: active.signal, operationId: state.boundary.operationId,
        selection: NativeProjectAgentExecutor.prototype.assertOriginalPreflight.call(state.executor, state.preflight).selection });
}

async function currentGeneration(generation, expected, scopeState = generation.state, controlPermit = null) {
    const current = await currentOperation(scopeState, expected, controlPermit), attempt = current.task.attempts.find(item => item.attemptId === generation.projectAttemptId);
    if (current.task.executionFingerprint !== generation.currentSourceFingerprint || hash(current.task.conversation) !== generation.conversationDigest
        || attempt?.status !== 'started' || attempt.kind !== 'generation' || attempt.requestId !== (generation.originalRequestId ?? generation.requestId)
        || hash(attempt.calls) !== generation.callsDigest) fail('native_orchestration_source_stale');
    return current;
}

export async function inspectNativeProjectGeneration(capture, expected) {
    const generation = generations.get(capture); if (!generation) fail();
    const identity = inspectNativeProjectGenerationIdentity(capture, expected);
    const current = await currentGeneration(generation, expected);
    return Object.freeze({ ...identity, intent: current.task.intent, conversation: immutable(current.task.conversation), toolReceipts: immutable(generation.toolReceipts),
        skillWorkRecords: immutable(generation.state.skillWorkRecords) });
}

/** Scheduling bridge for pure workers within the existing original Task.
 * Both witnesses are private; the control witness never permits a Model send. */
export async function withNativeProjectFanout(capture, workers, options) {
    return withProjectChildren(capture, workers, options, false);
}

export async function withNativeProjectDelegation(capture, worker) {
    return (await withProjectChildren(capture, [worker], { maxConcurrency: 1 }, true))[0];
}

/** Only an actual bound child capture and its Controller-frozen Frame may
 * split this already held Scheduler allocation. No nested child Run is made. */
export async function withNativeProjectDelegatedFanout(capture, { fanoutAttemptId, workers, ...options }) {
    return withProjectChildren(capture, workers, options, true, fanoutAttemptId);
}

async function withProjectChildren(capture, workers, options, delegatedMode, fanoutAttemptId = null) {
    const generation = generations.get(capture);
    if (!generation || Boolean(generation.workerStage) !== delegatedMode || !Array.isArray(workers) || !workers.length
        || generation.state.fanoutChildPermit && !fanoutAttemptId && (!delegatedMode || workers.some(worker => !worker.delegatedChild || !worker.delegatedParentAttempt))) fail();
    const { state } = generation, parentScope = schedulerFrame(state), expected = parentScope.expected;
    await inspectNativeProjectGeneration(capture, { host: state.host, handle: state.handle });
    const delegated = new Map();
    const readResources = async (plan, resources, path = new Set()) => {
        const identity = hash(plan);
        if (path.has(identity)) fail();
        const next = new Set(path); next.add(identity);
        for (const pin of plan.dependencyPins) {
            if (pin.port === 'plan') {
                const child = await state.host.persistence._engine.withTransaction(state.handle, tx => readPlanRevision(tx, state.handle, pin.resourceRef));
                if (hash(child) !== pin.integrity || !plan.definition.nodes.some(node => node.capabilities.includes('agent.delegate')
                    && node.policy.allowedPlanPinIds?.includes(pin.pinId) && node.dependencyPinIds.includes(pin.pinId))) fail();
                await readResources(child, resources, next);
            } else {
                if (pin.port !== 'model' || pin.resourceRef.scope !== 'player') fail();
                const route = await state.host.persistence.getRuntimeRoute(state.handle, pin.resourceRef.runtimeRouteId);
                if (hash(route) !== pin.integrity) fail();
                resources.push(...await state.host.executionResources(state.handle, route));
            }
        }
    };
    if (fanoutAttemptId) {
        const outer = fanoutChildren.get(state.fanoutChildPermit);
        if (!outer?.delegation) fail();
        const { lineage } = await readDelegatedBoundary(capture, { bound: outer.delegation });
        await state.host.persistence._engine.withTransaction(state.handle, async tx => {
            const frame = await readFanoutFrame(tx, state.handle, lineage.child, fanoutAttemptId);
            if (!frame || frame.epoch !== lineage.child.epoch || frame.sourceBindingDigest !== lineage.child.sourceBinding.bindingDigest
                || workers.length !== frame.branches.length) fail();
            for (const worker of workers) {
                const branch = frame.branches.find(branch => branch.entryAttemptId === worker.entryAttemptId);
                if (!branch || !equalNativeDocuments([...worker.nodeIds].sort(), [...branch.scopeNodeIds].sort())) fail();
                const resources = [];
                for (const id of branch.scopeNodeIds) {
                    const node = lineage.graph.nodes.find(node => node.nodeId === id), pin = node && nodeModelRoutePins(node, lineage.plan.dependencyPins)[0];
                    if (!['agent', 'planner', 'review', 'judge'].includes(node?.kind) || !pin
                        || !equalNativeDocuments([...node.capabilities].sort(), ['generation.send', ...node.kind === 'planner' || node.kind === 'agent' && node.capabilities.includes('agent.delegate') && node.capabilities.includes('graph.patch') ? ['graph.patch'] : [], ...node.kind === 'agent' && node.capabilities.includes('agent.delegate') ? ['agent.delegate'] : []].sort())) fail();
                    const route = await state.host.persistence.getRuntimeRoute(state.handle, pin.resourceRef.runtimeRouteId);
                    if (hash(route) !== pin.integrity) fail();
                    resources.push(...await state.host.executionResources(state.handle, route));
                    if (node.capabilities.includes('agent.delegate')) for (const id of node.policy.allowedPlanPinIds ?? []) {
                        const childPin = lineage.plan.dependencyPins.find(pin => pin.pinId === id && pin.port === 'plan' && node.dependencyPinIds.includes(id));
                        if (!childPin) fail();
                        const childPlan = await readPlanRevision(tx, state.handle, childPin.resourceRef);
                        if (hash(childPlan) !== childPin.integrity) fail();
                        await readResources(childPlan, resources);
                    }
                }
                if (!equalNativeDocuments([...new Set(resources)].sort(), [...new Set(worker.resources)].sort())) fail();
            }
        });
    }
    if (delegatedMode && !fanoutAttemptId) for (const worker of workers) {
        if (worker.delegatedChild === undefined && worker.delegatedParentAttempt === undefined) continue;
        const { lineage, binding } = await readDelegatedBoundary(capture, { candidateChild: worker.delegatedChild, candidateParentAttempt: worker.delegatedParentAttempt });
        const ids = lineage.plan.definition.nodes.filter(node => node.capabilities.includes('generation.send')).map(node => node.nodeId).sort();
        if (!equalNativeDocuments([...worker.nodeIds].sort(), ids) || lineage.child.graphRevision !== 0) fail();
        const resources = [];
        await readResources(lineage.plan, resources);
        if (!equalNativeDocuments([...new Set(resources)].sort(), [...new Set(worker.resources)].sort())) fail();
        delegated.set(worker, binding);
    }
    const controlPermit = Object.freeze({}), control = { generation, active: true };
    fanoutControls.set(controlPermit, control);
    const children = workers.map(worker => {
        const childExpected = immutable({ ...expected, resources: worker.resources, key: worker.key, fingerprint: worker.fingerprint });
        return { kind: childExpected.kind, executionClass: childExpected.executionClass, resources: childExpected.resources,
            key: childExpected.key, fingerprint: childExpected.fingerprint, fresh: async () => { await worker.fresh(controlPermit); return true; }, finalize: value => value,
            run: async boundary => {
                NativeTaskScheduler.prototype.assertFanoutChildBoundary.call(state.executor.scheduler, parentScope.boundary, expected, boundary, childExpected);
                const permit = Object.freeze({}); fanoutChildren.set(permit, { generation, controlPermit, boundary, expected: childExpected, nodeIds: immutable(worker.nodeIds), delegation: delegated.get(worker) ?? null });
                try { return await worker.run({ permit, signal: boundary.signal, controlPermit }); } finally { fanoutChildren.delete(permit); }
            } };
    });
    try {
        const result = await NativeTaskScheduler.prototype.withResourceFanout.call(state.executor.scheduler, parentScope.boundary, expected, children, {
            ...options, ...(options.until ? { until: args => options.until(args, controlPermit) } : {}),
            ...(options.onSettled ? { onSettled: (item, group) => options.onSettled(item, group, controlPermit) } : {}) });
        if (!options.until) { control.active = false; return result; }
        return { ...result, wait: async () => { try { return await result.wait(); } finally { control.active = false; } } };
    } catch (error) { control.active = false; throw error; }
}

/** Current Task/Source verification for passive Fanout/Join control only. */
export async function inspectNativeProjectFanoutControl(capture, controlPermit, expected) {
    const generation = generations.get(capture), control = fanoutControls.get(controlPermit);
    if (!generation || control?.generation !== generation || !control.active || generation.workerStage) fail();
    const current = await currentOperation(generation.state, expected, controlPermit), attempt = current.task.attempts.find(item => item.attemptId === generation.projectAttemptId);
    if (current.task.executionFingerprint !== generation.currentSourceFingerprint || hash(current.task.conversation) !== generation.conversationDigest
        || attempt?.status !== 'started' || attempt.kind !== 'generation' || attempt.requestId !== generation.requestId || hash(attempt.calls) !== generation.callsDigest)
        fail('native_orchestration_source_stale');
}

/** Runs the existing Skill service and retains only its real ephemeral results. */
export async function runNativeProjectSkillWork(capture, { context, operation, input }) {
    const state = operations.get(capture); if (!state) fail();
    const current = await currentOperation(state, { host: state.host, handle: state.handle });
    if (context.kind !== 'project' || context.projectId !== state.projectId || context.taskId !== state.taskId || context.revision !== state.preflight.baseRevision) fail();
    const routeRef = { scope: 'player', runtimeRouteId: state.startInput.runtimeRouteId };
    if (context.routeRef && !equalNativeDocuments(context.routeRef, routeRef)) fail();
    const settings = operation === 'list' ? (await state.host.extensions.settings(state.handle)).value : undefined;
    const compute = await prepareRetrievalCompute({ handle: state.handle, context: { ...context, routeRef }, profile: { mode: 'embed', purpose: 'studio.skill.v1' },
        persistence: state.host.persistence, core: state.host.sessionCore, agent: state.host.agent, studio: state.host.studio });
    const result = await executeProjectSkillWork({ operation, input, compute, repository: state.repository, projectId: state.projectId, settings, signal: current.active.signal });
    await currentOperation(state, { host: state.host, handle: state.handle });
    if (operation === 'list') state.settingsDigest = hash(settings);
    state.skillWorkRecords.push(immutable({ operation, input, result }));
    return result;
}

export async function readNativeProjectSkillInventory(capture, expected) {
    const generation = generations.get(capture); if (!generation) fail();
    await inspectNativeProjectGeneration(capture, expected);
    const state = generation.state, records = state.skillWorkRecords;
    if (state.settingsDigest === null || hash((await state.host.extensions.settings(state.handle)).value) !== state.settingsDigest) fail('native_orchestration_source_stale');
    const inventories = records.filter(record => record.operation === 'list');
    if (inventories.length !== 1) fail();
    const resultFor = (operation, input) => {
        const matches = records.filter(record => record.operation === operation && equalNativeDocuments(record.input, input));
        if (matches.length !== 1) fail();
        return matches[0].result;
    };
    const pinned = await pinSkillEntries(inventories[0].result, input => resultFor('pin', input));
    const entries = await loadAlwaysSkills(pinned, input => boundSkillFile(resultFor('read', { ...input, full: true })));
    for (const entry of entries) if ((await state.repository.get(entry.name, entry.scope))?.installedHash !== entry.version) fail('native_orchestration_source_stale');
    await inspectNativeProjectGeneration(capture, expected);
    return immutable(entries);
}

/** Captures the actual Model wrapper before a subsequent tool Effect changes its producer state. */
export async function prepareNativeProjectTaskTool(capture, { port, result, modelEffectId, input, toolEffectId }) {
    const generation = generations.get(capture); if (!generation || generation.workerStage || !(port instanceof ModelPort)) fail();
    const { state } = generation, identity = await inspectNativeProjectGeneration(capture, { host: port.host, handle: state.handle });
    const root = await port.runs.get(state.handle, result.receiptRef?.runId);
    const proof = await ModelPort.prototype.inspectResultCompletion.call(port, state.handle, { result, runId: root.runId, effectId: modelEffectId });
    const calls = result.generated.response.toolCalls ?? [], matches = calls.filter(call => (call.raw?.id || call.id) === input.callId);
    if (proof.outputType !== 'json' || proof.sourceBinding.sourceAuthority !== 'project' || input.attemptId !== identity.projectAttemptId
        || matches.length !== 1 || matches[0].name !== input.name || !equalNativeDocuments(matches[0].args, input.args)
        || root.sourceBinding.sourceRef.executionFingerprint !== identity.sourceRequest.executionFingerprint) fail();
    const attempt = await port.runs.engine.withTransaction(state.handle, async tx => (await readAttempt(tx, state.handle, root, proof.producerAttemptId)).doc);
    const node = root.graph.nodes.find(item => item.nodeId === attempt.nodeId);
    const pins = (await state.host.turnOrchestration.plans.getRevision(state.handle, root.planRef)).dependencyPins;
    const pin = pins.find(item => item.port === 'tool' && node?.dependencyPinIds.includes(item.pinId) && item.resourceRef.name === input.name);
    const capability = projectToolCapability(input.name);
    if (!capability || !node?.capabilities.includes(capability) || !root.graph.capabilityCeiling.includes(capability) || !pin
        || pin.resourceRef.projectId !== identity.projectId || pin.resourceRef.taskId !== identity.taskId) fail();
    if (hash(await readProjectToolDescriptor(state.handle, pin.resourceRef, state.host.agent)) !== pin.integrity) fail();
    const permit = Object.freeze({});
    toolPermits.set(permit, { generation, capture, port, input: immutable(input), root, result, resultHash: hash(result), pin,
        modelEffectId, nodeAttemptId: proof.producerAttemptId, operationId: identity.operationId, toolEffectId, used: false, completed: null });
    return permit;
}

/** Invoked by the original Task writer while it owns its Task lock. */
export async function consumeNativeProjectToolPermit(permit, { agent, handle, projectId, taskId, task, input }) {
    const value = toolPermits.get(permit), state = value?.generation.state;
    if (!value || value.used || state.host.agent !== agent || state.handle !== handle || state.projectId !== projectId || state.taskId !== taskId
        || !equalNativeDocuments(value.input, input) || hash(value.result) !== value.resultHash) fail();
    await inspectNativeProjectGeneration(value.capture, { host: state.host, handle });
    const rejected = await value.port.runs.engine.withTransaction(handle, async tx => {
        try {
            const root = await value.port.runs.get(handle, value.root.runId);
            const fence = await value.port.runs.engine.nativeHostLifecycle.assertWriter(handle, tx);
            const intent = (await readEffect(tx, handle, root, value.toolEffectId)).doc;
            const model = (await readEffect(tx, handle, root, value.modelEffectId)).doc;
            if (root.cancelRequested || root.status !== 'running' || root.epoch !== value.root.epoch || root.hostBootId !== fence.hostBootId
            || root.hostGeneration !== fence.generation || intent.status !== 'dispatching' || !intent.dispatchToken || intent.nodeAttemptId !== value.nodeAttemptId
            || intent.actionRef.kind !== projectToolAction(input.name) || intent.capability !== projectToolCapability(input.name)
            || intent.inputRef.kind !== projectToolAction(input.name) || model.status !== 'confirmed' || model.capability !== 'generation.send'
            || intent.inputHash !== hash(intent.inputRef) || !equalNativeDocuments(intent.inputRef.call, input)
            || intent.inputRef.modelEffectId !== value.modelEffectId || intent.inputRef.modelResultHash !== value.resultHash
            || intent.grantDigest !== model.grantDigest || intent.risk !== 'R1' || intent.requiresApproval || intent.approvalRef !== null
            || !equalNativeDocuments(intent.targetRef, { projectId, taskId, name: input.name })
            || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest
            || !equalNativeDocuments(intent.budgetAttemptRef?.authorityRef, root.budgetAuthorityRef)
            || root.sourceBinding.bindingDigest !== value.root.sourceBinding.bindingDigest) fail();
            await value.port.budgetPort.verifyBudgetAttempt({ handle, tx, root, intent, budgetAttemptRef: intent.budgetAttemptRef });
            await inspectNativeProjectGeneration(value.capture, { host: state.host, handle });
            if (hash(value.result) !== value.resultHash) fail();
            const currentFence = await value.port.runs.engine.nativeHostLifecycle.assertWriter(handle, tx);
            const current = await value.port.runs.get(handle, root.runId);
            if (current.cancelRequested || current.status !== 'running' || !equalNativeDocuments(current, root)
            || currentFence.hostBootId !== fence.hostBootId || currentFence.generation !== fence.generation)
                fail('native_orchestration_project_tool_denied');
            return null;
        } catch (error) {
            if (!['native_orchestration_source_stale', 'native_orchestration_project_tool_denied', 'native_orchestration_project_producer_denied'].includes(error.code)) throw error;
            return error;
        }
    });
    if (rejected) throw rejected;
    value.used = true;
    return immutable({ schemaVersion: 1, runId: value.root.runId, effectId: value.toolEffectId, nodeAttemptId: value.nodeAttemptId,
        sourceBindingDigest: value.root.sourceBinding.bindingDigest, operationId: value.operationId,
        projectAttemptId: input.attemptId, callId: input.callId, name: input.name, argsHash: hash(input.args),
        fromFingerprint: task.executionFingerprint, fromSequence: task.sequence });
}

/** Captures the original writer's actual body before its persistence ACK. No caller can mint this permit. */
export function completeNativeProjectToolPermit(permit, { receipt, result }) {
    const value = toolPermits.get(permit);
    if (!value?.used || value.completed) fail();
    assertProjectToolReceipt(receipt);
    if (receipt.runId !== value.root.runId || receipt.effectId !== value.toolEffectId || receipt.resultHash !== hash(projectToolResultPayload(value.input.name, result))) fail();
    value.completed = immutable({ receipt, result });
}

export async function executeNativeProjectTaskTool(permit) {
    const value = toolPermits.get(permit), state = value?.generation.state;
    if (!value || value.used) fail();
    if (value.port.runs.engine.hasActiveTransaction(state.handle)) fail('native_orchestration_project_tool_ambient_transaction');
    try {
        let result;
        try {
            // The original writer acquires Task then its own Studio queues.
            // Keep the preceding validation transaction physically closed;
            // enclosing this writer in the Studio queue would self-deadlock.
            result = await ProjectAgentService.prototype.executeTool.call(state.host.agent, state.handle, state.projectId, state.taskId,
                { ...value.input, nativeEffectPermit: permit, effectPolicy: 'no-background-model' });
        } catch (error) {
            if (error.code !== 'storage_commit_unknown' || !value.completed) throw error;
            const task = await state.host.agent._repository.get(state.handle, state.projectId, state.taskId);
            const saved = task?.attempts.find(item => item.attemptId === value.input.attemptId)?.calls.find(item => item.callId === value.input.callId)?.nativeReceipt;
            if (!equalNativeDocuments(saved ?? null, value.completed.receipt)) throw error;
            result = value.completed.result;
        }
        const current = await ProjectAgentService.prototype.observeComputeSource.call(state.host.agent, state.handle, state.projectId, state.taskId);
        const attempt = current.task.attempts.find(item => item.attemptId === value.input.attemptId);
        const call = attempt?.calls.find(item => item.callId === value.input.callId), receipt = call?.nativeReceipt;
        assertProjectToolReceipt(receipt);
        if (!value.completed || !equalNativeDocuments(receipt, value.completed.receipt) || receipt.runId !== value.root.runId || receipt.effectId !== value.toolEffectId
            || receipt.resultHash !== hash(projectToolResultPayload(value.input.name, result)) || receipt.toFingerprint !== current.task.executionFingerprint
            || receipt.fromFingerprint !== value.generation.currentSourceFingerprint || receipt.fromFingerprint !== state.currentSourceFingerprint
            || current.project.revision.revision !== state.preflight.baseRevision) fail();
        state.currentSourceFingerprint = receipt.toFingerprint;
        value.generation.currentSourceFingerprint = receipt.toFingerprint;
        value.generation.callsDigest = hash(attempt.calls);
        value.generation.toolReceipts.push(immutable(receipt));
        value.generation.toolResults.push(immutable({ callId: value.input.callId, result }));
        await inspectNativeProjectGeneration(value.capture, { host: state.host, handle: state.handle });
        return { result, receipt };
    } finally { toolPermits.delete(permit); }
}

/** Calls the original generation writer once with the transcript of actual Model and tool returns. */
export async function finishNativeProjectGeneration(capture, { port, result, effectId, input }) {
    const generation = generations.get(capture);
    if (!generation || generation.workerStage || generation.finished || !(port instanceof ModelPort)) fail('native_orchestration_project_round_finish_denied');
    const { state } = generation, identity = await inspectNativeProjectGeneration(capture, { host: port.host, handle: state.handle });
    const runId = result.receiptRef?.runId;
    const proof = await ModelPort.prototype.inspectResultCompletion.call(port, state.handle, { result, runId, effectId });
    const conversation = projectAgentRoundConversation({ conversation: identity.conversation, intent: identity.intent,
        response: result.generated.response, results: generation.toolResults });
    if (proof.outputType !== 'json' || proof.sourceBinding.sourceAuthority !== 'project' || input.attemptId !== generation.projectAttemptId
        || input.status !== 'completed' || !equalNativeDocuments(input.conversation, conversation)) fail('native_orchestration_project_round_conversation_changed');
    const root = await port.runs.get(state.handle, runId), model = await port.runs.engine.withTransaction(state.handle,
        async tx => (await readEffect(tx, state.handle, root, effectId)).doc);
    await port.effects.authorizeEffect({ handle: state.handle, root, intent: model, phase: 'consume' });
    const nativeCompletionPermit = Object.freeze({});
    generationPermits.set(nativeCompletionPermit, { generation, capture, port, result, resultHash: hash(result), proof, effectId,
        input: immutable(input), used: false, applied: false });
    generation.finished = true;
    let task;
    try {
        task = await ProjectAgentService.prototype.finishGeneration.call(state.host.agent, state.handle, state.projectId, state.taskId,
            { ...input, nativeCompletionPermit });
    } catch (error) {
        if (error.code !== 'storage_commit_unknown') throw error;
        const observed = await ProjectAgentService.prototype.observeComputeSource.call(state.host.agent, state.handle, state.projectId, state.taskId);
        const attempt = observed.task.attempts.find(item => item.attemptId === generation.projectAttemptId);
        if (attempt?.status !== 'completed' || observed.task.executionFingerprint !== generation.currentSourceFingerprint
            || !equalNativeDocuments(observed.task.conversation, conversation) || hash(attempt.calls) !== generation.callsDigest) throw error;
        task = observed.task;
    }
    const attempt = task.attempts.find(item => item.attemptId === generation.projectAttemptId), completion = Object.freeze({});
    if (attempt?.status !== 'completed' || task.executionFingerprint !== generation.currentSourceFingerprint || !equalNativeDocuments(task.conversation, conversation)
        || hash(attempt.calls) !== generation.callsDigest) fail('native_orchestration_project_round_finish_denied');
    roundCompletions.set(completion, { generation, port, result, resultHash: hash(result), proof, task,
        descriptor: immutable({ runId, nodeAttemptId: proof.producerAttemptId, effectId, modelReceiptRef: proof.receiptRef, modelPayloadHash: proof.payloadHash,
            projectId: state.projectId, taskId: state.taskId, projectAttemptId: generation.projectAttemptId, requestId: generation.requestId,
            operationId: identity.operationId, round: generation.round, sourceBindingDigest: root.sourceBinding.bindingDigest,
            fromFingerprint: generation.sourceFingerprint, toFingerprint: generation.currentSourceFingerprint, taskSequence: task.sequence,
            conversationLength: conversation.length, conversationDigest: hash(conversation), attemptDigest: hash(attempt),
            toolReceiptRefs: generation.toolReceipts.map(receipt => ({ effectId: receipt.effectId, receiptHash: hash(receipt) })) }) });
    return { task, completion };
}

/** Original Task writer only, before loading its mutable Task/cache. */
export async function consumeNativeProjectGenerationPermit(permit, expected) {
    const value = generationPermits.get(permit), state = value?.generation.state;
    if (!value || value.used || state.host.agent !== expected.agent || state.handle !== expected.handle
        || state.projectId !== expected.projectId || state.taskId !== expected.taskId || !equalNativeDocuments(expected.input, value.input))
        fail('native_orchestration_project_round_finish_denied');
    value.used = true;
    const proof = await ModelPort.prototype.inspectResultCompletion.call(value.port, state.handle,
        { result: value.result, runId: value.proof.runId, effectId: value.effectId });
    if (hash(value.result) !== value.resultHash || !equalNativeDocuments(proof, value.proof)) fail('native_orchestration_project_round_finish_denied');
    // This includes the real producer, Source, Route and installed Skills.
    // A rejection happens before the writer has cached an older mutable Task.
    await readNativeProjectSkillInventory(value.capture, { host: value.port.host, handle: state.handle });
}

/** No await between this actual Task assertion and the original mutation. */
export function assertNativeProjectGenerationWrite(permit, { agent, handle, projectId, taskId, task, writerTask, input }) {
    const value = generationPermits.get(permit), generation = value?.generation, state = generation?.state;
    if (!value || !value.used || value.applied || state.host.agent !== agent || state.handle !== handle
        || state.projectId !== projectId || state.taskId !== taskId || !equalNativeDocuments(input, value.input))
        fail('native_orchestration_project_round_finish_denied');
    assertFrame(state, { host: state.host, handle });
    const attempt = task.attempts.find(item => item.attemptId === generation.projectAttemptId);
    if (agent._tasks.get(ProjectAgentService.prototype._key.call(agent, handle, projectId, taskId)) !== writerTask
        || task.executionFingerprint !== generation.currentSourceFingerprint || task.baseRevision !== state.preflight.baseRevision
        || hash(task.conversation) !== generation.conversationDigest || attempt?.status !== 'started'
        || attempt.kind !== 'generation' || attempt.requestId !== generation.requestId || hash(attempt.calls) !== generation.callsDigest)
        fail('native_orchestration_source_stale');
    value.applied = true;
}

/** Actual finished writer/reader result only; serialized descriptors do not mint this completion. */
export async function inspectNativeProjectRoundCompletion(completion, { host, handle, runId }) {
    const value = roundCompletions.get(completion), state = value?.generation.state;
    if (!value || state.host !== host || state.handle !== handle || value.descriptor.runId !== runId) fail('native_orchestration_project_round_completion_required');
    const current = await currentOperation(state, { host, handle });
    const attempt = current.task.attempts.find(item => item.attemptId === value.generation.projectAttemptId);
    if (current.task.sequence < value.descriptor.taskSequence || current.task.executionFingerprint !== value.descriptor.toFingerprint
        || hash(attempt) !== value.descriptor.attemptDigest || hash(current.task.conversation) !== value.descriptor.conversationDigest)
        fail('native_orchestration_project_round_completion_stale');
    const proof = await ModelPort.prototype.inspectResultCompletion.call(value.port, handle, { result: value.result, runId, effectId: value.descriptor.effectId });
    if (!equalNativeDocuments(proof, value.proof)) fail('native_orchestration_project_round_completion_stale');
    return value.descriptor;
}

/** Original durable settlement plus closed original costs, never a caller's continue flag. */
export async function confirmNativeProjectRoundSettlement(completion) {
    const value = roundCompletions.get(completion); if (!value) fail('native_orchestration_project_round_completion_required');
    const { generation, port, descriptor } = value, { state } = generation;
    const current = async () => {
        const original = await currentOperation(state, { host: state.host, handle: state.handle });
        const attempt = original.task.attempts.find(item => item.attemptId === descriptor.projectAttemptId);
        if (hash(value.result) !== value.resultHash || hash(attempt) !== descriptor.attemptDigest
            || hash(original.task.conversation) !== descriptor.conversationDigest || original.task.executionFingerprint !== descriptor.toFingerprint)
            fail('native_orchestration_project_round_completion_stale');
    };
    const checked = await port.runs.engine.withTransaction(state.handle, async tx => {
        try {
            await current();
            const root = await port.runs.get(state.handle, descriptor.runId), { doc: attempt } = await readAttempt(tx, state.handle, root, descriptor.nodeAttemptId);
            const round = await readProjectRoundReceipt(tx, state.handle, root, descriptor.nodeAttemptId, { projectAgent: state.host.agent });
            if (!round || Object.entries(descriptor).some(([key, field]) => !equalNativeDocuments(round.receipt[key], field)) || attempt.status !== 'completed')
                fail('native_orchestration_project_round_not_ready');
            const settlement = await readAttemptSettlement(tx, state.handle, root, attempt);
            const costs = await port.budgetPort.observeEffectClosure(state.handle, { authorityRef: root.budgetAuthorityRef, effectIds: attempt.effectRefs }, { tx });
            await current();
            if (settlement.reasonCode !== 'project_round_ready' || !costs.closed || root.cancelRequested || root.status !== 'running'
                || !equalNativeDocuments(await port.runs.get(state.handle, descriptor.runId), root)) fail('native_orchestration_project_round_not_ready');
            return {};
        } catch (error) {
            if (['native_orchestration_project_round_not_ready', 'native_orchestration_project_round_completion_stale',
                'native_orchestration_source_stale', 'native_orchestration_project_producer_denied'].includes(error.code)) return { error };
            throw error;
        }
    });
    if (checked.error) throw checked.error;
    generation.continueAllowed = !stopped(value.task) && descriptor.toolReceiptRefs.length > 0 && generation.round + 1 < state.preflight.maxModelRounds;
    return { descriptor, continueAllowed: generation.continueAllowed, stopReason: value.task.status === 'review' ? null
        : stopped(value.task) ? 'project_task_stopped' : descriptor.toolReceiptRefs.length === 0 ? 'project_model_stopped'
            : generation.round + 1 >= state.preflight.maxModelRounds ? 'project_round_limit' : null };
}

/** Final Review is an original Task fact in this live operation, never a caller-supplied result. */
export async function inspectNativeProjectReviewCompletion(completion, { host, handle }) {
    const value = roundCompletions.get(completion), state = value?.generation.state;
    if (!value || state.host !== host || state.handle !== handle || hash(value.result) !== value.resultHash)
        fail('native_orchestration_project_review_completion_required');
    const current = await currentOperation(state, { host, handle }), { descriptor } = value;
    const task = current.task, attempt = task.attempts.find(item => item.attemptId === descriptor.projectAttemptId);
    if (task.status !== 'review' || task.validation?.status !== 'passed' || task.review?.required !== true || !task.workspace
        || !projectReviewSource(task, value.generation.toolReceipts.at(-1)) || task.executionFingerprint !== descriptor.toFingerprint
        || hash(attempt) !== descriptor.attemptDigest || hash(task.conversation) !== descriptor.conversationDigest
        || hash((await host.extensions.settings(handle)).value) !== state.settingsDigest) fail('native_orchestration_project_review_stale');
    for (const record of state.skillWorkRecords.filter(item => item.operation === 'pin')) {
        if ((await state.repository.get(record.input.name, record.input.scope))?.installedHash !== record.result.version)
            fail('native_orchestration_project_review_stale');
    }
    await currentOperation(state, { host, handle });
    if (hash(value.result) !== value.resultHash) fail('native_orchestration_project_review_stale');
    return { descriptor, task, port: value.port };
}
