import { NATIVE_RESOURCE_KINDS } from '../contracts.js';
import { assertNativeId } from '../identity.js';
import { assertAuthoringChangeSet, assertAuthoringOperation, assertAuthoringWorkspace } from '../authoring-contracts.js';
import { assertWritable } from '../../storage/read-only-mode.js';
import { ConflictError } from '../../storage/errors.js';
import { cloneNativeDocument, hashNativeDocument, putMutable, withNativeResourceWrite } from '../repositories/common.js';
import { AgentExperienceRepository } from './experience-repository.js';
import { fields, text } from './contracts.js';
import { assertProjectAgentConversation } from '../../../public/shared/project-agent-conversation.js';
import { assertProjectStrategyVersions } from './project-strategy.js';
import { assertComputeLedger } from '../../../public/shared/native-compute-budget.js';

const key = (handle, projectId, taskId) => ({ kind: NATIVE_RESOURCE_KINDS.projectAgentTask, handle, projectId, taskId });
const STATES = new Set(['planning', 'planned', 'working', 'evaluating', 'repair', 'blocked', 'review', 'committing', 'completed', 'conflict', 'taken_over', 'cancelled']);
const TASK_FIELDS = ['schemaVersion', 'sequence', 'taskId', 'projectId', 'intent', 'status', 'baseRevision', 'plan', 'proposals', 'workspace', 'inspection', 'validation', 'preview', 'simulation', 'repairRound', 'maxRepairRounds', 'review', 'changeSets', 'timeline', 'attempts', 'commitIntent', 'conversation', 'recovery', 'createdAt', 'updatedAt'];

export function assertProjectTask(value) {
    const task = cloneNativeDocument(value);
    fields(task, [...TASK_FIELDS, ...(Object.hasOwn(task, 'compute') ? ['compute'] : []), ...(Object.hasOwn(task, 'strategyVersions') ? ['strategyVersions'] : [])], 'Project Agent task');
    if (task.compute !== undefined) assertComputeLedger(task.compute);
    if (TASK_FIELDS.some(field => task[field] === undefined) || task.schemaVersion !== 1 || !STATES.has(task.status)) throw new TypeError('Invalid Project Agent task schema');
    if (!/^agenttask_[a-z0-9]+$/.test(task.taskId)) throw new TypeError('Invalid Project Agent task identity');
    assertNativeId(task.projectId, 'project');
    if (typeof task.intent !== 'string' || !task.intent.trim()) throw new TypeError('Invalid task intent');
    text(task.baseRevision, 'Task baseRevision');
    for (const field of ['sequence', 'repairRound', 'createdAt', 'updatedAt']) {
        if (!Number.isSafeInteger(task[field]) || task[field] < 0) throw new TypeError('Invalid Project Agent ' + field);
    }
    if (!Number.isSafeInteger(task.maxRepairRounds) || task.maxRepairRounds < 1 || task.maxRepairRounds > 10 || task.repairRound > task.maxRepairRounds) throw new TypeError('Invalid Project Agent repair limit');
    if (task.plan !== null) {
        fields(task.plan, ['summary', 'steps'], 'Task plan');
        if (typeof task.plan.summary !== 'string' || !task.plan.summary.trim()) throw new TypeError('Invalid plan summary');
        if (!Array.isArray(task.plan.steps) || !task.plan.steps.length || task.plan.steps.length > 50) throw new TypeError('Invalid task plan');
        const ids = new Set();
        for (const step of task.plan.steps) {
            fields(step, ['id', 'title', 'description', 'impact', 'status'], 'Plan step');
            text(step.id, 'Step id');
            if (typeof step.title !== 'string' || !step.title.trim()) throw new TypeError('Invalid step title');
            if (ids.has(step.id) || typeof step.description !== 'string' || !['low', 'medium', 'high'].includes(step.impact)
                || !['pending', 'working', 'ready', 'repair', 'completed'].includes(step.status)) throw new TypeError('Invalid task plan step');
            ids.add(step.id);
        }
    }
    if (!Array.isArray(task.proposals) || task.proposals.length > 256 || !Array.isArray(task.changeSets)) throw new TypeError('Invalid Project Agent operations');
    const operationIds = new Set();
    for (const proposal of task.proposals) {
        fields(proposal, ['stepId', 'toolName', 'operation'], 'Task proposal');
        const operation = assertAuthoringOperation(proposal.operation);
        if (!task.plan || (proposal.stepId !== null && !task.plan.steps.some(step => step.id === proposal.stepId))
            || operation.origin.kind !== 'agent' || operation.origin.id !== task.taskId || operationIds.has(operation.operationId)) throw new TypeError('Invalid task proposal authority');
        text(proposal.toolName, 'Proposal tool'); operationIds.add(operation.operationId);
    }
    if (task.workspace !== null) {
        const workspace = assertAuthoringWorkspace(task.workspace);
        if (workspace.projectId !== task.projectId || workspace.baseRevision !== task.baseRevision
            || workspace.origin.kind !== 'agent' || workspace.origin.id !== task.taskId
            || hashNativeDocument(workspace.operations) !== hashNativeDocument(task.proposals.map(item => item.operation))) throw new TypeError('Task Workspace mismatch');
    }
    for (const value of task.changeSets) {
        const receipt = assertAuthoringChangeSet(value);
        if (receipt.projectId !== task.projectId || receipt.baseRevision !== task.baseRevision
            || receipt.operations.some(operation => operation.origin.kind !== 'agent' || operation.origin.id !== task.taskId)) throw new TypeError('Task changeset mismatch');
    }
    if (task.commitIntent !== null) {
        fields(task.commitIntent, ['changeSetId', 'workspaceHash'], 'Task commit intent');
        text(task.commitIntent.changeSetId, 'Changeset identity');
        if (!task.workspace || task.commitIntent.workspaceHash !== hashNativeDocument(task.workspace)) throw new TypeError('Task commit intent mismatch');
    }
    if ((task.status === 'committing' && !task.commitIntent) || (task.status === 'review' && (!task.workspace || task.review?.required !== true))
        || (task.status === 'completed' && !task.changeSets.at(-1)?.resultingRevision)) throw new TypeError('Task state authority mismatch');
    for (const [field, limit] of [['timeline', 1024], ['attempts', 128]]) {
        if (!Array.isArray(task[field]) || task[field].length > limit) throw new TypeError('Project Agent ' + field + ' limit');
    }
    if (new Set(task.timeline.map(event => event.eventId)).size !== task.timeline.length) throw new TypeError('Duplicate task event');
    for (const event of task.timeline) {
        text(event.eventId, 'Event id'); text(event.type, 'Event type');
        if (!Number.isSafeInteger(event.at) || event.at < 0) throw new TypeError('Invalid task event time');
    }
    const attemptIds = new Set();
    for (const attempt of task.attempts) {
        fields(attempt, ['attemptId', 'kind', 'origin', 'status', 'startedAt', 'endedAt', 'calls', 'requestId', 'observation'], 'Task attempt');
        text(attempt.attemptId, 'Attempt identity');
        if (attemptIds.has(attempt.attemptId) || !['generation', 'evaluation', 'commit'].includes(attempt.kind)
            || attempt.origin !== (attempt.kind === 'generation' ? 'client_observation' : 'host')
            || !['started', 'completed', 'failed', 'interrupted'].includes(attempt.status)
            || !Number.isSafeInteger(attempt.startedAt) || attempt.startedAt < 0
            || (attempt.endedAt !== null && (!Number.isSafeInteger(attempt.endedAt) || attempt.endedAt < attempt.startedAt))
            || !Array.isArray(attempt.calls) || attempt.calls.length > 32) throw new TypeError('Invalid task attempt');
        attemptIds.add(attempt.attemptId);
        if (attempt.requestId !== null) {
            if (attempt.kind !== 'generation') throw new TypeError('Only generation has a request');
            text(attempt.requestId, 'Request identity');
        }
        if (attempt.observation !== null) {
            const observation = attempt.observation;
            fields(observation, ['origin', 'snapshotHash', 'attempts', 'usage'], 'Host generation observation');
            if (observation.origin !== 'host' || !attempt.requestId || !/^[a-f0-9]{64}$/.test(observation.snapshotHash)
                || !Array.isArray(observation.attempts) || observation.attempts.length > 128) throw new TypeError('Invalid host generation observation');
            for (const send of observation.attempts) {
                fields(send, ['runtimeRouteId', 'retry', 'status'], 'Provider send');
                text(send.runtimeRouteId, 'Route identity');
                if (!Number.isSafeInteger(send.retry) || send.retry < 0 || !['pending', 'success', 'failed'].includes(send.status)) throw new TypeError('Invalid observed provider send');
            }
            if (observation.usage !== null) {
                fields(observation.usage, ['inputTokens', 'outputTokens', 'totalTokens'], 'Direct provider usage');
                for (const count of Object.values(observation.usage)) if (count !== null && (!Number.isSafeInteger(count) || count < 0)) throw new TypeError('Invalid observed usage');
            }
        }
        const calls = new Set();
        for (const call of attempt.calls) {
            fields(call, ['callId', 'name', 'argsHash'], 'Attempt tool call'); text(call.callId, 'Call identity'); text(call.name, 'Call name');
            if (calls.has(call.callId) || !/^[a-f0-9]{64}$/.test(call.argsHash)) throw new TypeError('Invalid attempt call');
            calls.add(call.callId);
        }
    }
    if (task.recovery !== null) {
        fields(task.recovery, ['status', 'code'], 'Task recovery');
        if (!['recovered', 'interrupted', 'awaiting_review', 'conflict'].includes(task.recovery.status)) throw new TypeError('Invalid task recovery');
        text(task.recovery.code, 'Recovery reason');
    }
    assertProjectAgentConversation(task.conversation);
    if (task.strategyVersions !== undefined) {
        const versions = assertProjectStrategyVersions(task);
        const bases = [...versions.candidates.flatMap(c => [c.base, c.desired]), ...(versions.declaration ? [versions.declaration.base] : [])];
        for (const base of bases) {
            if (Object.hasOwn(base, 'strategyVersions') || Object.hasOwn(base, 'sequence')) throw new TypeError('Invalid Project strategy base');
            assertProjectTask({ ...base, sequence: 0 });
        }
    }
    if (Buffer.byteLength(JSON.stringify(task)) > 2 * 1024 * 1024) throw new TypeError('Project Agent task byte limit');
    return task;
}

export class ProjectTaskRepository {
    constructor({ engine }) {
        if (!engine) throw new TypeError('ProjectTaskRepository requires StorageEngine');
        this.engine = engine;
    }

    _document(record, projectId, taskId) {
        if (record.integrity !== hashNativeDocument(record.doc)) throw new TypeError('Project task integrity mismatch');
        const doc = assertProjectTask(record.doc);
        if (doc.projectId !== projectId || doc.taskId !== taskId) throw new TypeError('Project task key mismatch');
        return doc;
    }

    async get(handle, projectId, taskId) {
        const record = await this.engine.withTransaction(handle, tx => tx.getResource(key(handle, projectId, taskId)));
        return record ? this._document(record, projectId, taskId) : null;
    }

    async list(handle, projectId) {
        const records = await this.engine.withTransaction(handle, tx => tx.listResources({ kind: NATIVE_RESOURCE_KINDS.projectAgentTask, handle, projectId }));
        return records.map(record => this._document(record, record.key.projectId, record.key.taskId));
    }

    async save(handle, value, expectedIntegrity) {
        assertWritable();
        const doc = assertProjectTask(value);
        if (expectedIntegrity !== null && (typeof expectedIntegrity !== 'string' || !/^[a-f0-9]{64}$/.test(expectedIntegrity))) throw new TypeError('Project task requires integrity CAS');
        return withNativeResourceWrite(handle, 'project-task-store:' + doc.projectId + ':' + doc.taskId, () => this.engine.withTransaction(handle, async tx => {
            const resourceKey = key(handle, doc.projectId, doc.taskId);
            const record = await tx.getResource(resourceKey);
            if (record && record.integrity !== expectedIntegrity) throw new ConflictError('native_write_conflict');
            const previous = record ? this._document(record, doc.projectId, doc.taskId) : null;
            if (doc.sequence !== (previous ? previous.sequence + 1 : 0)) throw new ConflictError('project_agent_sequence_conflict');
            return putMutable(tx, resourceKey, doc, { expectedIntegrity });
        }));
    }

    async delete(handle, projectId, taskId, expectedIntegrity = undefined) {
        assertWritable();
        return withNativeResourceWrite(handle, 'project-task-store:' + projectId + ':' + taskId, async () => {
            if (expectedIntegrity !== undefined) {
                const current = await this.get(handle, projectId, taskId);
                if (!current || hashNativeDocument(current) !== expectedIntegrity) throw new ConflictError('project_task_retention_conflict');
            }
            await new AgentExperienceRepository({ engine: this.engine }).purgeSource(handle, 'project_task', taskId, { domain: 'project', projectId });
            return this.engine.withTransaction(handle, tx => tx.deleteResource(key(handle, projectId, taskId)));
        });
    }
}
