import { NativeProjectAgentExecutor } from '../project-agent-executor.js';
import { NativeGenerationHost } from '../adapters/generation-host.js';
import { NativeTaskScheduler } from '../task-scheduler.js';
import { ProjectAgentService } from '../project-agent.js';
import { ProjectTaskRepository } from '../agent-intelligence/project-task-repository.js';
import { StudioService } from '../authoring/studio-service.js';
import { immutable } from '../model-prompt-runtime/execution-utils.js';
import { hashNativeDocument as hash } from '../repositories/common.js';
import { executeProjectSkillWork } from '../skill-invocation.js';
import { prepareRetrievalCompute } from '../retrieval-compute.js';
import { pinSkillEntries, loadAlwaysSkills, boundSkillFile } from '../../../public/shared/skill-invocation.js';
import { ModelPort } from './model-port.js';
import { readEffect } from './effect-contracts.js';
import { readAttempt } from './controller-common.js';
import { assertProjectToolReceipt, readProjectToolDescriptor } from './project-tool-contracts.js';

const operations = new WeakMap(), starts = new WeakMap(), generations = new WeakMap();
const toolPermits = new WeakMap();
const fail = (code = 'native_orchestration_project_producer_denied') => { throw Object.assign(new TypeError(code), { code }); };
const stopped = task => ['review', 'blocked', 'conflict', 'taken_over', 'completed', 'committing', 'cancelled'].includes(task.status);

function assertFrame(state, expected = {}) {
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
    if (!original.selection || preflight.maxModelRounds !== 1 || startInput.maxModelRounds !== 1
        || preflight.projectId !== state.projectId || preflight.taskId !== state.taskId
        || preflight.runtimeRouteId !== startInput.runtimeRouteId || hash(preflight) !== startInput.expectedPreflightFingerprint) fail();
    const active = NativeTaskScheduler.prototype.assertActiveBoundary.call(executor.scheduler, boundary, {
        owner: handle, anchor: { projectId: preflight.projectId, taskId: preflight.taskId, requestId: startInput.requestId, runtimeRouteId: startInput.runtimeRouteId },
        kind: 'model_task', executionClass: 'interactive', resources: [preflight.projectId, preflight.taskId], key: 'project-agent:' + preflight.taskId,
        fingerprint: hash(startInput),
    });
    if (executor.scheduler.operations.get(active.operationId)?.retry !== false || active.attempt !== 0) fail();
    return active;
}

async function currentOperation(state, expected) {
    const active = assertFrame(state, expected);
    if (hash(await NativeProjectAgentExecutor.prototype.configuration.call(state.executor, state.handle)) !== state.preflight.configurationFingerprint)
        fail('native_orchestration_source_stale');
    const current = await ProjectAgentService.prototype.observeComputeSource.call(state.host.agent, state.handle, state.projectId, state.taskId);
    if (stopped(current.task) || current.task.baseRevision !== state.preflight.baseRevision || current.project.revision.revision !== state.preflight.baseRevision
        || (state.initialSourceFingerprint !== null && current.task.executionFingerprint !== state.initialSourceFingerprint))
        fail('native_orchestration_source_stale');
    assertFrame(state, expected);
    return { active, ...current };
}

/** Original interactive Executor bridge only; this capability is never JSON. */
export async function captureNativeProjectOperation({ executor, host, handle, boundary, preflight, startInput }) {
    const state = { executor, host, handle, boundary, preflight, startInput: immutable(startInput),
        projectId: preflight.projectId, taskId: preflight.taskId, initialSourceFingerprint: null, nextRound: 0, skillWorkRecords: [], repository: null, settingsDigest: null };
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
    const route = (await NativeProjectAgentExecutor.prototype.configuration.call(executor, handle)).routes.find(item => item.runtimeRouteId === startInput.runtimeRouteId);
    if (route?.role !== 'role.studio' || route.scope !== 'player' || route.fallbackRouteRefs.length
        || route.policy.maxRetries !== 0 || route.policy.maxFallbackAttempts !== 0
        || (route.executionPolicy?.continuity ?? 'none') !== 'none' || (route.executionPolicy?.reuse ?? 'disabled') !== 'disabled') fail();
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
    generations.set(projectCapture, { state, projectAttemptId: original.attemptId, requestId, round,
        sourceFingerprint: original.sourceFingerprint, conversationDigest: original.conversationDigest, callsDigest: original.callsDigest, readToolReceipts: [] });
    state.nextRound++;
    await inspectNativeProjectGeneration(projectCapture, { host: state.host, handle: state.handle });
    return projectCapture;
}

export function inspectNativeProjectGenerationIdentity(capture, expected) {
    const generation = generations.get(capture); if (!generation) fail();
    const { state, readToolReceipts: _reads, ...metadata } = generation, active = assertFrame(state, expected);
    const request = immutable({ projectId: state.projectId, taskId: state.taskId, revision: state.preflight.baseRevision,
        projectAttemptId: generation.projectAttemptId, requestId: generation.requestId, role: 'studio',
        routeRef: { scope: 'player', runtimeRouteId: state.startInput.runtimeRouteId } });
    return Object.freeze({ ...metadata, ...request, request,
        sourceRequest: immutable({ domain: 'project', projectId: state.projectId, taskId: state.taskId, revision: state.preflight.baseRevision, executionFingerprint: generation.sourceFingerprint }),
        host: state.host, projectAgent: state.host.agent, studio: state.host.studio, handle: state.handle,
        signal: active.signal, operationId: active.operationId,
        selection: NativeProjectAgentExecutor.prototype.assertOriginalPreflight.call(state.executor, state.preflight).selection });
}

export async function inspectNativeProjectGeneration(capture, expected) {
    const generation = generations.get(capture); if (!generation) fail();
    const identity = inspectNativeProjectGenerationIdentity(capture, expected);
    const current = await currentOperation(generation.state, expected), attempt = current.task.attempts.find(item => item.attemptId === generation.projectAttemptId);
    if (current.task.executionFingerprint !== generation.sourceFingerprint || hash(current.task.conversation) !== generation.conversationDigest
        || attempt?.status !== 'started' || attempt.kind !== 'generation' || attempt.requestId !== generation.requestId
        || hash(attempt.calls) !== generation.callsDigest) fail('native_orchestration_source_stale');
    return Object.freeze({ ...identity, conversation: immutable(current.task.conversation), readToolReceipts: immutable(generation.readToolReceipts),
        skillWorkRecords: immutable(generation.state.skillWorkRecords) });
}

/** Runs the existing Skill service and retains only its real ephemeral results. */
export async function runNativeProjectSkillWork(capture, { context, operation, input }) {
    const state = operations.get(capture); if (!state) fail();
    const current = await currentOperation(state, { host: state.host, handle: state.handle });
    if (context.kind !== 'project' || context.projectId !== state.projectId || context.taskId !== state.taskId || context.revision !== state.preflight.baseRevision) fail();
    const settings = operation === 'list' ? (await state.host.extensions.settings(state.handle)).value : undefined;
    const compute = await prepareRetrievalCompute({ handle: state.handle, context, profile: { mode: 'embed', purpose: 'studio.skill.v1' },
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
        const matches = records.filter(record => record.operation === operation && hash(record.input) === hash(input));
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
export async function prepareNativeProjectReadTool(capture, { port, result, modelEffectId, input, toolEffectId }) {
    const generation = generations.get(capture); if (!generation || !(port instanceof ModelPort)) fail();
    const { state } = generation, identity = await inspectNativeProjectGeneration(capture, { host: port.host, handle: state.handle });
    const root = await port.runs.get(state.handle, result.receiptRef?.runId);
    const proof = await ModelPort.prototype.inspectResultCompletion.call(port, state.handle, { result, runId: root.runId, effectId: modelEffectId });
    const calls = result.generated.response.toolCalls ?? [], matches = calls.filter(call => (call.raw?.id || call.id) === input.callId);
    if (proof.outputType !== 'json' || proof.sourceBinding.sourceAuthority !== 'project' || input.attemptId !== identity.projectAttemptId
        || matches.length !== 1 || matches[0].name !== input.name || hash(matches[0].args) !== hash(input.args)
        || root.sourceBinding.sourceRef.executionFingerprint !== identity.sourceFingerprint) fail();
    const attempt = await port.runs.engine.withTransaction(state.handle, async tx => (await readAttempt(tx, state.handle, root, proof.producerAttemptId)).doc);
    const node = root.graph.nodes.find(item => item.nodeId === attempt.nodeId);
    const pins = (await state.host.turnOrchestration.plans.getRevision(state.handle, root.planRef)).dependencyPins;
    const pin = pins.find(item => item.port === 'tool' && node?.dependencyPinIds.includes(item.pinId) && item.resourceRef.name === input.name);
    if (!node?.capabilities.includes('project.read') || !root.graph.capabilityCeiling.includes('project.read') || !pin
        || pin.resourceRef.projectId !== identity.projectId || pin.resourceRef.taskId !== identity.taskId) fail();
    if (hash(await readProjectToolDescriptor(state.handle, pin.resourceRef, state.host.agent)) !== pin.integrity) fail();
    const permit = Object.freeze({});
    toolPermits.set(permit, { generation, capture, port, input: immutable(input), root, result, resultHash: hash(result), pin,
        modelEffectId, nodeAttemptId: proof.producerAttemptId, operationId: identity.operationId, toolEffectId, used: false, completed: null });
    return permit;
}

/** Invoked by the original Task writer while it owns its Task lock. */
export async function consumeNativeProjectReadPermit(permit, { agent, handle, projectId, taskId, task, input }) {
    const value = toolPermits.get(permit), state = value?.generation.state;
    if (!value || value.used || state.host.agent !== agent || state.handle !== handle || state.projectId !== projectId || state.taskId !== taskId
        || hash(value.input) !== hash(input) || hash(value.result) !== value.resultHash) fail();
    await inspectNativeProjectGeneration(value.capture, { host: state.host, handle });
    await value.port.runs.engine.withTransaction(handle, async tx => {
        const root = await value.port.runs.get(handle, value.root.runId);
        const fence = await value.port.runs.engine.nativeHostLifecycle.assertWriter(handle, tx);
        const intent = (await readEffect(tx, handle, root, value.toolEffectId)).doc;
        const model = (await readEffect(tx, handle, root, value.modelEffectId)).doc;
        if (root.cancelRequested || root.status !== 'running' || root.epoch !== value.root.epoch || root.hostBootId !== fence.hostBootId
            || root.hostGeneration !== fence.generation || intent.status !== 'dispatching' || !intent.dispatchToken || intent.nodeAttemptId !== value.nodeAttemptId
            || intent.actionRef.kind !== 'native_project_read' || intent.capability !== 'project.read'
            || intent.inputHash !== hash(intent.inputRef) || hash(intent.inputRef.call) !== hash(input)
            || intent.inputRef.modelEffectId !== value.modelEffectId || intent.inputRef.modelResultHash !== value.resultHash
            || intent.grantDigest !== model.grantDigest || intent.risk !== 'R1' || intent.requiresApproval || intent.approvalRef !== null
            || hash(intent.targetRef) !== hash({ projectId, taskId, name: input.name })
            || intent.sourceBindingDigest !== root.sourceBinding.bindingDigest
            || hash(intent.budgetAttemptRef?.authorityRef) !== hash(root.budgetAuthorityRef)
            || root.sourceBinding.bindingDigest !== value.root.sourceBinding.bindingDigest) fail();
        await value.port.budgetPort.verifyBudgetAttempt({ handle, tx, root, intent, budgetAttemptRef: intent.budgetAttemptRef });
        await inspectNativeProjectGeneration(value.capture, { host: state.host, handle });
        if (hash(value.result) !== value.resultHash) fail();
    });
    value.used = true;
    return immutable({ schemaVersion: 1, runId: value.root.runId, effectId: value.toolEffectId, nodeAttemptId: value.nodeAttemptId,
        sourceBindingDigest: value.root.sourceBinding.bindingDigest, operationId: value.operationId,
        projectAttemptId: input.attemptId, callId: input.callId, name: input.name, argsHash: hash(input.args),
        fromFingerprint: task.executionFingerprint, fromSequence: task.sequence });
}

/** Captures the original writer's actual body before its persistence ACK. No caller can mint this permit. */
export function completeNativeProjectReadPermit(permit, { receipt, result }) {
    const value = toolPermits.get(permit);
    if (!value?.used || value.completed) fail();
    assertProjectToolReceipt(receipt);
    if (receipt.runId !== value.root.runId || receipt.effectId !== value.toolEffectId || receipt.resultHash !== hash(result)) fail();
    value.completed = immutable({ receipt, result });
}

export async function executeNativeProjectReadTool(permit) {
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
            if (hash(saved ?? null) !== hash(value.completed.receipt)) throw error;
            result = value.completed.result;
        }
        const current = await currentOperation(state, { host: state.host, handle: state.handle });
        const attempt = current.task.attempts.find(item => item.attemptId === value.input.attemptId);
        const call = attempt?.calls.find(item => item.callId === value.input.callId), receipt = call?.nativeReceipt;
        assertProjectToolReceipt(receipt);
        if (!value.completed || hash(receipt) !== hash(value.completed.receipt) || receipt.runId !== value.root.runId || receipt.effectId !== value.toolEffectId || receipt.resultHash !== hash(result)
            || receipt.toFingerprint !== current.task.executionFingerprint || receipt.fromFingerprint !== value.generation.sourceFingerprint) fail();
        value.generation.callsDigest = hash(attempt.calls);
        value.generation.readToolReceipts.push(immutable(receipt));
        await inspectNativeProjectGeneration(value.capture, { host: state.host, handle: state.handle });
        return { result, receipt };
    } finally { toolPermits.delete(permit); }
}
