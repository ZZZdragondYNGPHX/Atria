import { randomUUID } from 'node:crypto';
import { listAuthoringReferences, readAuthoringReference } from './authoring-reference.js';

import { ConflictError, NotFoundError } from '../storage/errors.js';
import {
    ATRIA_PROJECT_CONFLICT_CODE,
    assertAuthoringOperation,
} from './authoring-contracts.js';
import { STUDIO_RESOURCE_OPERATION_TYPES } from './authoring/library-authoring.js';
import { STUDIO_SOURCE_OPERATION_TYPES } from './authoring/studio-service.js';
import { AgentExperienceRepository } from './agent-intelligence/experience-repository.js';
import { ProjectTaskRepository, assertProjectTask } from './agent-intelligence/project-task-repository.js';
import { hashNativeDocument, withNativeResourceWrite } from './repositories/common.js';
import { assertWritable, isReadOnly } from '../storage/read-only-mode.js';
import { assertProjectAgentConversation } from '../../public/shared/project-agent-conversation.js';
import { fields as allowedFields } from '../../public/shared/native-values.js';
import { checkProjectStrategyCandidate, updateProjectStrategy } from './agent-intelligence/project-strategy.js';

export const PROJECT_AGENT_MAX_REPAIR_ROUNDS = 3;

const taskViews = new WeakMap();

const TERMINAL_STATES = new Set(['completed', 'taken_over', 'cancelled']);
const WRITE_TOOL_NAMES = new Set([
    'atri_agent_project_save',
    'atri_agent_resource_attach',
    'atri_agent_resource_update',
    'atri_agent_resource_fork',
    'atri_agent_source_write',
    'atri_agent_frontend_patch',
    'atri_agent_source_move',
    'atri_agent_source_delete',
]);

function clone(value) {
    return value == null ? value : structuredClone(value);
}

function taskId(idFactory) {
    return 'agenttask_' + String(idFactory()).replaceAll('-', '').toLowerCase();
}

function operationId(idFactory) {
    return 'operation_' + String(idFactory()).replaceAll('-', '').toLowerCase();
}

function requiredString(value, field) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(field + ' is required');
    return value.trim();
}

function fields(value, keys, label) {
    try { allowedFields(value, keys, label); } catch (error) { throw new TypeError(error.message); }
}

function normalizePlan(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('Project Agent plan must be an object');
    }
    const summary = requiredString(value.summary, 'Project Agent plan.summary');
    if (!Array.isArray(value.steps) || value.steps.length === 0 || value.steps.length > 50) {
        throw new TypeError('Project Agent plan.steps must contain 1-50 steps');
    }
    const seen = new Set();
    const steps = value.steps.map((step, index) => {
        if (!step || typeof step !== 'object' || Array.isArray(step)) {
            throw new TypeError('Project Agent plan step must be an object');
        }
        const id = String(step.id || `step_${index + 1}`).trim();
        if (!id || seen.has(id)) throw new TypeError('Project Agent plan step ids must be unique');
        seen.add(id);
        const impact = ['low', 'medium', 'high'].includes(step.impact) ? step.impact : 'medium';
        return {
            id,
            title: requiredString(step.title, 'Project Agent plan step.title'),
            description: String(step.description || '').trim(),
            impact,
            status: 'pending',
        };
    });
    return { summary, steps };
}

function tool(functionDefinition) {
    return Object.freeze({
        type: 'function',
        function: Object.freeze(functionDefinition),
    });
}

function objectSchema(properties = {}, required = []) {
    return {
        type: 'object',
        properties,
        ...(required.length ? { required } : {}),
        additionalProperties: false,
    };
}

const DOMAIN_RESOURCE_TYPES = Object.freeze({
    attach: new Set(['core.world', 'core.knowledge', 'core.asset']),
    fork: new Set(['core.world', 'core.knowledge', 'core.asset']),
    update: new Set(['core.world', 'core.knowledge']),
});

function currentResourceTypes(registry, capability) {
    const supported = DOMAIN_RESOURCE_TYPES[capability] || new Set();
    return (registry?.descriptors || [])
        .filter(item => item.capabilities?.includes(capability) && supported.has(item.resourceType))
        .map(item => item.resourceType)
        .sort();
}

export function buildProjectAgentTools(registry) {
    const attachTypes = currentResourceTypes(registry, 'attach');
    const forkTypes = currentResourceTypes(registry, 'fork');
    const updateTypes = currentResourceTypes(registry, 'update');
    const resourceTypeProperty = values => ({
        type: 'string',
        ...(values.length ? { enum: values } : {}),
    });

    return Object.freeze([
        tool({ name: 'atri_agent_frontend_graph', description: 'Inspect native@3 Source Graph, semantic IDs, source hashes, diagnostics and feature/permission declarations. Never edit derived IR.', parameters: objectSchema({ ownerId: { type: 'string' } }) }),
        tool({ name: 'atri_agent_frontend_patch', description: 'Propose a format-preserving frontend.patch. First inspect frontend_graph. Component edits address contract JSON path (state/props/uses/interactions); Node edits use field=text or an AUI attribute, null removes an attribute; Binding/View edits use JSON path; style uses string value; message uses locale. Pin contentHash from graph. Human review and formal compiler validation remain required.', parameters: objectSchema({ stepId: { type: 'string' }, ownerId: { type: 'string' }, kind: { type: 'string', enum: ['component', 'node', 'binding', 'view', 'style', 'state', 'interaction', 'message'] }, id: { type: 'string' }, componentId: { type: 'string' }, locale: { type: 'string' }, field: { type: 'string' }, path: { type: 'array', items: { type: 'string' } }, value: {}, contentHash: { type: 'string' } }, ['kind', 'id', 'value', 'contentHash']) }),
        tool({ name: 'atri_agent_api_catalog', description: 'Discover current Atria Native capabilities and authoritative authoring references, including Native Frontend v3, Tasks, Scene, information, continuity, Shared/Realm and Scenario. Read-only.', parameters: objectSchema({ query: { type: 'string' } }) }),
        tool({ name: 'atri_agent_api_read', description: 'Read a paginated current compiler contract or tested example by catalog id. Follow nextOffset for complete reference; never guess unsupported fields.', parameters: objectSchema({ id: { type: 'string' }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 24000 } }, ['id']) }),
        tool({
            name: 'atri_agent_set_plan',
            description: 'Set the semantic Project Task plan before proposing edits. This changes Task state only, never Project state.',
            parameters: objectSchema({
                summary: { type: 'string' },
                steps: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 50,
                    items: objectSchema({
                        id: { type: 'string' },
                        title: { type: 'string' },
                        description: { type: 'string' },
                        impact: { type: 'string', enum: ['low', 'medium', 'high'] },
                    }, ['id', 'title']),
                },
            }, ['summary', 'steps']),
        }),
        tool({
            name: 'atri_agent_get_project',
            description: 'Read the current A1 Native Studio project source and exact revision. Read-only.',
            parameters: objectSchema(),
        }),
        tool({
            name: 'atri_agent_list_sources',
            description: 'List project source files through the A1 Studio boundary. Read-only.',
            parameters: objectSchema(),
        }),
        tool({
            name: 'atri_agent_read_source',
            description: 'Read one project source file through the A1 Studio boundary. Read-only.',
            parameters: objectSchema({ path: { type: 'string' } }, ['path']),
        }),
        tool({
            name: 'atri_agent_query_resources',
            description: 'Query the A2 derived Resource Graph for project/library resources. Read-only.',
            parameters: objectSchema({
                resourceType: { type: 'string' },
                ownership: { type: 'string' },
                search: { type: 'string' },
            }),
        }),
        tool({
            name: 'atri_agent_resource_references',
            description: 'Inspect A2 Resource Graph References or Used By edges. Read-only.',
            parameters: objectSchema({
                resourceType: { type: 'string' },
                resourceId: { type: 'string' },
                revision: { type: 'string' },
                reverse: { type: 'boolean' },
            }, ['resourceType', 'resourceId']),
        }),
        tool({
            name: 'atri_agent_resource_closure',
            description: 'Resolve the exact A2 project dependency closure. Read-only.',
            parameters: objectSchema(),
        }),
        tool({
            name: 'atri_agent_validate_current',
            description: 'Run A1 validation against the currently committed Project revision. Read-only.',
            parameters: objectSchema(),
        }),
        tool({
            name: 'atri_agent_project_save',
            description: 'Preferred domain Authoring Operation for structured project/resource edits. Proposes project.save; it does not write until human Review/Commit.',
            parameters: objectSchema({
                source: { type: 'object' },
                stepId: { type: 'string' },
            }, ['source']),
        }),
        tool({
            name: 'atri_agent_resource_attach',
            description: 'Preferred A2 domain operation: attach an exact immutable Library revision. Proposes resource.attach only.',
            parameters: objectSchema({
                resourceType: resourceTypeProperty(attachTypes),
                resourceId: { type: 'string' },
                revision: { type: 'string' },
                stepId: { type: 'string' },
            }, ['resourceType', 'resourceId', 'revision']),
        }),
        tool({
            name: 'atri_agent_resource_update',
            description: 'Preferred A2 domain operation: explicitly update one pinned Library dependency revision to another. Never resolves latest implicitly.',
            parameters: objectSchema({
                resourceType: resourceTypeProperty(updateTypes),
                resourceId: { type: 'string' },
                fromRevision: { type: 'string' },
                toRevision: { type: 'string' },
                stepId: { type: 'string' },
            }, ['resourceType', 'resourceId', 'fromRevision', 'toRevision']),
        }),
        tool({
            name: 'atri_agent_resource_fork',
            description: 'Preferred A2 domain operation: fork an exact Library resource revision into project ownership. Generated derivative ids remain inside the A1 authoring boundary.',
            parameters: objectSchema({
                resourceType: resourceTypeProperty(forkTypes),
                resourceId: { type: 'string' },
                revision: { type: 'string' },
                displayName: { type: 'string' },
                path: { type: 'string' },
                stepId: { type: 'string' },
            }, ['resourceType', 'resourceId', 'revision']),
        }),
        tool({
            name: 'atri_agent_source_write',
            description: 'Low-level fallback Authoring Operation. Use only when no structured/domain operation represents the change. Proposes source.write only.',
            parameters: objectSchema({
                path: { type: 'string' },
                content: { type: 'string' },
                encoding: { type: 'string', enum: ['utf8', 'base64'] },
                stepId: { type: 'string' },
            }, ['path', 'content']),
        }),
        tool({
            name: 'atri_agent_source_move',
            description: 'Low-level fallback Authoring Operation for source moves. Proposes source.move only.',
            parameters: objectSchema({
                path: { type: 'string' },
                toPath: { type: 'string' },
                stepId: { type: 'string' },
            }, ['path', 'toPath']),
        }),
        tool({
            name: 'atri_agent_source_delete',
            description: 'Low-level fallback Authoring Operation for source deletion. Always treated as high impact and requires human review.',
            parameters: objectSchema({
                path: { type: 'string' },
                stepId: { type: 'string' },
            }, ['path']),
        }),
        tool({
            name: 'atri_agent_reset_operations',
            description: 'Discard the currently proposed operation set before a repair attempt. Task/plan history is retained.',
            parameters: objectSchema(),
        }),
        tool({
            name: 'atri_agent_prepare_review',
            description: 'Finish the current attempt: create an Agent Workspace at the original baseRevision, dry-run operations, validate, run Native Preview and simulation, then stop at the human Review gate. This never commits.',
            parameters: objectSchema({
                entryPointId: { type: 'string' },
                simulationOptions: { type: 'object' },
            }),
        }),
    ]);
}

export class ProjectAgentService {
    constructor({
        studio,
        engine = studio?.storageEngine,
        repository = new ProjectTaskRepository({ engine }),
        idFactory = randomUUID,
        maxRepairRounds = PROJECT_AGENT_MAX_REPAIR_ROUNDS,
    }) {
        if (!studio) throw new TypeError('ProjectAgentService requires StudioService');
        if (typeof idFactory !== 'function') throw new TypeError('ProjectAgentService idFactory must be a function');
        if (!Number.isSafeInteger(maxRepairRounds) || maxRepairRounds < 1 || maxRepairRounds > 10) {
            throw new TypeError('ProjectAgentService maxRepairRounds must be 1-10');
        }
        this._studio = studio;
        this._idFactory = idFactory;
        this._maxRepairRounds = maxRepairRounds;
        this._repository = repository;
        if (!taskViews.has(repository.engine)) taskViews.set(repository.engine, new Map());
        this._tasks = taskViews.get(repository.engine);
        this._integrities = new Map();
    }

    _key(handle, projectId, id) {
        return JSON.stringify([handle, projectId, id]);
    }

    _task(handle, projectId, id) {
        const task = this._tasks.get(this._key(handle, projectId, id));
        if (!task) throw new NotFoundError('native project agent task', { taskId: id });
        return task;
    }

    async _persist(handle, task, expectedIntegrity = this._integrities.get(this._key(handle, task.projectId, task.taskId))) {
        let next;
        try {
            next = assertProjectTask({ ...task, sequence: expectedIntegrity === null ? 0 : task.sequence + 1 });
            await this._repository.save(handle, next, expectedIntegrity);
        } catch (error) {
            this._tasks.delete(this._key(handle, task.projectId, task.taskId));
            this._integrities.delete(this._key(handle, task.projectId, task.taskId));
            error.atriTaskPersistence = true;
            throw error;
        }
        task.sequence = next.sequence;
        this._tasks.set(this._key(handle, task.projectId, task.taskId), task);
        this._integrities.set(this._key(handle, task.projectId, task.taskId), hashNativeDocument(task));
    }

    _startAttempt(task, kind) {
        const attempt = { attemptId: 'attempt_' + String(this._idFactory()).replaceAll('-', '').toLowerCase(),
            kind, origin: kind === 'generation' ? 'client_observation' : 'host', status: 'started', startedAt: Date.now(), endedAt: null, calls: [], requestId: null, observation: null };
        task.attempts.push(attempt);
        this._event(task, kind + '.attempt.started', { attemptId: attempt.attemptId, origin: attempt.origin });
        return attempt;
    }

    _finishAttempt(task, attempt, status) {
        attempt.status = status;
        attempt.endedAt = Date.now();
        task.updatedAt = attempt.endedAt;
        this._event(task, attempt.kind + '.attempt.' + status, { attemptId: attempt.attemptId, origin: attempt.origin });
    }

    _completeCommit(task, receipt) {
        if (!task.changeSets.some(item => item.changeSetId === receipt.changeSetId)) task.changeSets.push(receipt);
        task.validation = receipt.validation;
        task.status = 'completed';
        for (const step of task.plan.steps) step.status = 'completed';
        task.updatedAt = Date.now();
        this._event(task, 'changeset.committed', { changeSetId: receipt.changeSetId, baseRevision: receipt.baseRevision, resultingRevision: receipt.resultingRevision });
    }

    async _recover(handle, task) {
        if (task.status === 'committing') {
            let receipt;
            try { receipt = await this._studio.inspectWorkspaceReceipt(handle, task.workspace, task.commitIntent.changeSetId); } catch (error) {
                if (error?.name !== 'ConflictError' && !(error instanceof TypeError)) throw error;
                task.status = 'conflict';
                task.recovery = { status: 'conflict', code: 'receipt_unverifiable' };
            }
            if (receipt) {
                this._completeCommit(task, receipt);
                task.recovery = { status: 'recovered', code: 'formal_receipt_reconciled' };
            } else if (task.status !== 'conflict') {
                const revision = await this._studio.getRevision(handle, task.projectId);
                task.status = revision.revision === task.baseRevision ? 'review' : 'conflict';
                task.recovery = { status: task.status === 'review' ? 'awaiting_review' : 'conflict', code: 'commit_receipt_missing' };
            }
            const attempt = task.attempts.findLast(item => item.kind === 'commit' && item.status === 'started');
            if (attempt) this._finishAttempt(task, attempt, receipt ? 'completed' : 'interrupted');
            this._event(task, 'recovery', task.recovery);
        } else if (task.status === 'evaluating') {
            task.repairRound += 1;
            task.status = task.repairRound >= task.maxRepairRounds ? 'blocked' : 'repair';
            task.preview = null;
            task.review = null;
            task.recovery = { status: 'interrupted', code: 'evaluation_interrupted' };
            const attempt = task.attempts.findLast(item => item.kind === 'evaluation' && item.status === 'started');
            if (attempt) this._finishAttempt(task, attempt, 'interrupted');
            this._event(task, 'recovery', task.recovery);
        }
        if (!TERMINAL_STATES.has(task.status) && task.status !== 'conflict') {
            const revision = await this._studio.getRevision(handle, task.projectId);
            if (revision.revision !== task.baseRevision) {
                task.status = 'conflict';
                task.recovery = { status: 'conflict', code: 'base_revision_changed' };
                task.updatedAt = Date.now();
                this._event(task, 'conflict', { expectedRevision: task.baseRevision, actualRevision: revision.revision });
            }
        }
    }

    async _operate(handle, projectId, id, operation, { write = true } = {}) {
        return withNativeResourceWrite(handle, 'project-agent:' + projectId + ':' + id, async () => {
            if (write) assertWritable();
            await this._studio.getProject(handle, projectId);
            const task = await this._repository.get(handle, projectId, id);
            if (!task) throw new NotFoundError('native project agent task', { projectId, taskId: id });
            this._tasks.set(this._key(handle, projectId, id), task);
            this._integrities.set(this._key(handle, projectId, id), hashNativeDocument(task));
            await this._recover(handle, task);
            if (hashNativeDocument(task) !== this._integrities.get(this._key(handle, projectId, id)) && !isReadOnly()) await this._persist(handle, task);
            try {
                const result = await operation(task);
                if (!isReadOnly() && hashNativeDocument(task) !== this._integrities.get(this._key(handle, projectId, id))) await this._persist(handle, task);
                return result?.taskId === id ? this._snapshot(task) : result;
            } catch (error) {
                if (!isReadOnly() && !error.atriTaskPersistence && hashNativeDocument(task) !== this._integrities.get(this._key(handle, projectId, id))) await this._persist(handle, task);
                throw error;
            }
        });
    }

    async createTask(handle, projectId, options) {
        assertWritable();
        fields(options, ['intent', 'baseRevision', 'maxRepairRounds'], 'Project Agent task request');
        return withNativeResourceWrite(handle, 'project-agent-create:' + projectId, () => this._createTask(handle, projectId, options));
    }

    async listTasks(handle, projectId) {
        await this._studio.getProject(handle, projectId);
        const tasks = await this._repository.list(handle, projectId);
        const snapshots = await Promise.all(tasks.map(task => this.getTask(handle, projectId, task.taskId)));
        return Object.freeze(snapshots.sort((left, right) => right.updatedAt - left.updatedAt));
    }

    getTask(handle, projectId, id) {
        return this._operate(handle, projectId, id, task => this._snapshot(task), { write: false });
    }

    // Used only immediately after awaited authority reads by the evidence consumer.
    peekTask(handle, projectId, id) {
        const task = this._task(handle, projectId, id);
        if (task.projectId !== projectId) throw new NotFoundError('native project agent task', { projectId, taskId: id });
        return this._snapshot(task);
    }

    getContext(handle, projectId, id) {
        return this._operate(handle, projectId, id, () => this._getContext(handle, projectId, id), { write: false });
    }

    async strategyCandidates(handle, projectId, id, action) {
        fields(action, ['type', 'expectedSequence', 'allowedFields', 'field', 'value', 'candidateId'], 'Project strategy request');
        const reading = ['inspect', 'check'].includes(action.type);
        return this._operate(handle, projectId, id, async task => {
            if (action.type === 'inspect') {
                fields(action, ['type'], 'Project strategy inspect');
                return clone(task.strategyVersions || { schemaVersion: 1, declaration: null, candidates: [], activeVersionId: null });
            }
            const revision = await this._studio.getRevision(handle, projectId);
            if (revision.revision !== task.baseRevision) throw new ConflictError('project_strategy_conflict');
            if (action.type === 'check') {
                fields(action, ['type', 'candidateId'], 'Project strategy check');
                if (!task.strategyVersions) throw new NotFoundError('Project strategy candidate');
                return checkProjectStrategyCandidate(task, action.candidateId, this._maxRepairRounds);
            }
            const next = updateProjectStrategy(task, action, this._maxRepairRounds);
            Object.assign(task, next);
            return task;
        }, { write: !reading });
    }

    setPlan(handle, projectId, id, value) {
        return this._operate(handle, projectId, id, () => this._setPlan(handle, projectId, id, value));
    }

    resetOperations(handle, projectId, id) {
        return this._operate(handle, projectId, id, () => this._resetOperations(handle, projectId, id));
    }

    prepareReview(handle, projectId, id, options) {
        return this._operate(handle, projectId, id, () => this._prepareReview(handle, projectId, id, options));
    }

    commit(handle, projectId, id) {
        return this._operate(handle, projectId, id, () => this._commit(handle, projectId, id));
    }

    takeOver(handle, projectId, id) {
        return this._operate(handle, projectId, id, () => this._takeOver(handle, projectId, id));
    }

    executeTool(handle, projectId, id, input = {}) {
        return this._operate(handle, projectId, id, async task => {
            fields(input, ['name', 'args', 'attemptId', 'callId'], 'Project Agent tool request');
            let attempt;
            if (input.attemptId !== undefined || input.callId !== undefined) {
                attempt = task.attempts.find(item => item.attemptId === input.attemptId && item.kind === 'generation' && item.status === 'started');
                if (!attempt || typeof input.callId !== 'string' || !input.callId) throw new ConflictError('project_agent_attempt_conflict');
                const previous = attempt.calls.find(item => item.callId === input.callId);
                if (previous) {
                    if (previous.name !== input.name || previous.argsHash !== hashNativeDocument(input.args || {})) throw new ConflictError('project_agent_call_conflict');
                    if (WRITE_TOOL_NAMES.has(input.name) || ['atri_agent_set_plan', 'atri_agent_reset_operations', 'atri_agent_prepare_review'].includes(input.name)) return this._snapshot(task);
                }
            }
            const result = await this._executeTool(handle, projectId, id, input);
            if (attempt && !attempt.calls.some(item => item.callId === input.callId)) attempt.calls.push({ callId: input.callId, name: input.name, argsHash: hashNativeDocument(input.args || {}) });
            return result;
        });
    }

    resumeTask(handle, projectId, id) {
        return this._operate(handle, projectId, id, task => {
            for (const attempt of task.attempts.filter(item => item.kind === 'generation' && item.status === 'started')) this._finishAttempt(task, attempt, 'interrupted');
            return this._snapshot(task);
        });
    }

    beginGeneration(handle, projectId, id, input) {
        return this._operate(handle, projectId, id, task => {
            fields(input, ['expectedSequence'], 'Generation start');
            this._ensureDraftMutable(task);
            if (input.expectedSequence !== task.sequence || task.attempts.some(item => item.kind === 'generation' && item.status === 'started')) throw new ConflictError('project_agent_attempt_conflict');
            this._startAttempt(task, 'generation');
            return this._snapshot(task);
        });
    }

    finishGeneration(handle, projectId, id, input) {
        return this._operate(handle, projectId, id, task => {
            fields(input, ['attemptId', 'status', 'conversation'], 'Generation finish');
            if (!['completed', 'failed'].includes(input.status)) throw new TypeError('Invalid generation observation');
            const attempt = task.attempts.find(item => item.attemptId === input.attemptId && item.kind === 'generation');
            if (!attempt || attempt.status === 'interrupted') throw new ConflictError('project_agent_attempt_conflict');
            assertProjectAgentConversation(input.conversation);
            if (hashNativeDocument(input.conversation.slice(0, task.conversation.length)) !== hashNativeDocument(task.conversation)) throw new ConflictError('project_agent_conversation_conflict');
            if (attempt.status !== 'started') {
                if (attempt.status !== input.status || hashNativeDocument(input.conversation) !== hashNativeDocument(task.conversation)) throw new ConflictError('project_agent_attempt_conflict');
                return this._snapshot(task);
            }
            task.conversation = clone(input.conversation);
            this._finishAttempt(task, attempt, input.status);
            return this._snapshot(task);
        });
    }

    // Internal Generation Host observations. No HTTP endpoint accepts these fields.
    recordGenerationRequest(handle, projectId, id, attemptId, requestId) {
        return this._operate(handle, projectId, id, task => {
            const attempt = task.attempts.find(item => item.attemptId === attemptId && item.kind === 'generation' && item.status === 'started');
            this._ensureDraftMutable(task);
            if (!attempt || (attempt.requestId !== null && attempt.requestId !== requestId)) throw new ConflictError('project_agent_attempt_conflict');
            if (attempt.requestId === null) {
                attempt.requestId = requiredString(requestId, 'Generation requestId');
                this._event(task, 'generation.request', { attemptId, requestId, origin: 'host' });
            }
            return this._snapshot(task);
        });
    }

    recordGenerationObservation(handle, projectId, id, attemptId, requestId, { snapshot, attempts, usage }) {
        return this._operate(handle, projectId, id, task => {
            const attempt = task.attempts.find(item => item.attemptId === attemptId && item.kind === 'generation' && item.requestId === requestId && item.status === 'started');
            if (!attempt) throw new ConflictError('project_agent_attempt_conflict');
            const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
            const observation = { origin: 'host', snapshotHash: hashNativeDocument(snapshot), attempts: clone(attempts), usage: usage ? {
                inputTokens: count(usage.inputTokens ?? usage.prompt_tokens), outputTokens: count(usage.outputTokens ?? usage.completion_tokens), totalTokens: count(usage.totalTokens ?? usage.total_tokens),
            } : null };
            if (attempt.observation !== null) {
                if (hashNativeDocument(attempt.observation) !== hashNativeDocument(observation)) throw new ConflictError('project_agent_observation_conflict');
            } else {
                attempt.observation = observation;
                this._event(task, 'generation.observed', { attemptId, requestId, origin: 'host', usageStatus: usage ? 'observed' : 'missing' });
            }
            return this._snapshot(task);
        });
    }

    deleteTask(handle, projectId, id, expectedIntegrity = undefined) {
        return withNativeResourceWrite(handle, 'project-agent:' + projectId + ':' + id, async () => {
            const result = await this._repository.delete(handle, projectId, id, expectedIntegrity);
            this._tasks.delete(this._key(handle, projectId, id)); this._integrities.delete(this._key(handle, projectId, id));
            return result;
        });
    }

    async deleteProjectTasks(handle, projectId) {
        await new AgentExperienceRepository({ engine: this._repository.engine }).purgeProject(handle, projectId);
        const tasks = await this._repository.list(handle, projectId);
        for (const task of tasks) await this.deleteTask(handle, projectId, task.taskId);
    }

    _event(task, type, detail = {}) {
        task.timeline.push({
            eventId: 'event_' + String(this._idFactory()).replaceAll('-', '').toLowerCase(),
            type,
            at: Date.now(),
            ...clone(detail),
        });
    }

    _origin(task) {
        return Object.freeze({ kind: 'agent', id: task.taskId });
    }

    _snapshot(task) {
        return Object.freeze(clone({
            schemaVersion: task.schemaVersion,
            sequence: task.sequence,
            taskId: task.taskId,
            projectId: task.projectId,
            intent: task.intent,
            status: task.status,
            baseRevision: task.baseRevision,
            plan: task.plan,
            operations: task.proposals.map(item => ({
                stepId: item.stepId,
                toolName: item.toolName,
                operation: item.operation,
            })),
            workspace: task.workspace,
            inspection: task.inspection,
            validation: task.validation,
            preview: task.preview,
            simulation: task.simulation,
            repairRound: task.repairRound,
            maxRepairRounds: task.maxRepairRounds,
            ...(task.strategyVersions?.activeVersionId ? { strategyVersionId: task.strategyVersions.activeVersionId } : {}),
            review: task.review,
            changeSets: task.changeSets,
            timeline: task.timeline,
            attempts: task.attempts,
            conversation: task.conversation,
            recovery: task.recovery,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
        }));
    }

    async _assertTaskBaseRevision(handle, task) {
        const actual = await this._studio.getRevision(handle, task.projectId);
        if (actual.revision !== task.baseRevision) {
            task.status = 'conflict';
            task.updatedAt = Date.now();
            this._event(task, 'conflict', {
                expectedRevision: task.baseRevision,
                actualRevision: actual.revision,
            });
            throw new ConflictError(ATRIA_PROJECT_CONFLICT_CODE, {
                code: ATRIA_PROJECT_CONFLICT_CODE,
                projectId: task.projectId,
                expectedRevision: task.baseRevision,
                actualRevision: actual.revision,
            });
        }
        return actual;
    }

    _ensureMutable(task) {
        if (TERMINAL_STATES.has(task.status)) {
            throw new ConflictError('project_agent_task_closed', {
                taskId: task.taskId,
                status: task.status,
            });
        }
        if (task.status === 'conflict') {
            const actualRevision = task.timeline.findLast(event => event.type === 'conflict')?.actualRevision;
            throw new ConflictError(ATRIA_PROJECT_CONFLICT_CODE, {
                taskId: task.taskId,
                expectedRevision: task.baseRevision,
                ...(actualRevision ? { actualRevision } : {}),
            });
        }
        if (task.status === 'blocked') {
            throw new ConflictError('project_agent_repair_limit', {
                taskId: task.taskId,
                repairRound: task.repairRound,
                maxRepairRounds: task.maxRepairRounds,
            });
        }
    }

    _ensureDraftMutable(task) {
        this._ensureMutable(task);
        if (task.status === 'review' || task.status === 'committing') {
            throw new ConflictError('project_agent_review_locked', {
                taskId: task.taskId,
                status: task.status,
            });
        }
    }

    _setStepStatus(task, stepId, status) {
        if (!stepId || !task.plan) return;
        const step = task.plan.steps.find(item => item.id === stepId);
        if (step) step.status = status;
    }

    async _createTask(handle, projectId, {
        intent,
        baseRevision,
        maxRepairRounds = this._maxRepairRounds,
    } = {}) {
        const normalizedIntent = requiredString(intent, 'Project Agent task intent');
        const expected = requiredString(baseRevision, 'Project Agent task baseRevision');
        if (!Number.isSafeInteger(maxRepairRounds) || maxRepairRounds < 1 || maxRepairRounds > this._maxRepairRounds) {
            throw new TypeError(`Project Agent maxRepairRounds must be 1-${this._maxRepairRounds}`);
        }
        const actual = await this._studio.getRevision(handle, projectId);
        if (actual.revision !== expected) {
            throw new ConflictError(ATRIA_PROJECT_CONFLICT_CODE, {
                code: ATRIA_PROJECT_CONFLICT_CODE,
                projectId,
                expectedRevision: expected,
                actualRevision: actual.revision,
            });
        }

        const now = Date.now();
        const task = {
            schemaVersion: 1,
            sequence: 0,
            taskId: taskId(this._idFactory),
            projectId,
            intent: normalizedIntent,
            status: 'planning',
            baseRevision: expected,
            plan: null,
            proposals: [],
            workspace: null,
            inspection: null,
            validation: null,
            preview: null,
            simulation: null,
            repairRound: 0,
            maxRepairRounds,
            review: null,
            changeSets: [],
            timeline: [],
            attempts: [],
            commitIntent: null,
            conversation: [{ role: 'user', content: normalizedIntent }],
            recovery: null,
            createdAt: now,
            updatedAt: now,
        };
        this._event(task, 'intent', { intent: normalizedIntent, baseRevision: expected });
        await this._persist(handle, task, null);
        return this._snapshot(task);
    }

    async _getContext(handle, projectId, id) {
        const task = this._task(handle, projectId, id);
        if (task.projectId !== projectId) throw new NotFoundError('native project agent task', { taskId: id, projectId });
        const [project, resources, registry] = await Promise.all([
            this._studio.getProject(handle, projectId),
            this._studio.queryResources(handle, { projectId }),
            Promise.resolve(this._studio.getResourceRegistry()),
        ]);
        let closure;
        try {
            closure = await this._studio.resolveResourceClosure(handle, projectId);
        } catch (error) {
            closure = { ok: false, error: error?.code || error?.message || String(error) };
        }
        return Object.freeze({
            task: this._snapshot(task),
            project,
            resources,
            registry,
            closure,
            tools: buildProjectAgentTools(registry),
            policy: Object.freeze({
                sequence: Object.freeze([
                    'intent',
                    'plan',
                    'workspace',
                    'operations',
                    'changeset',
                    'validate',
                    'simulate-preview',
                    'review',
                    'commit',
                ]),
                sourceFallbackOnly: true,
                humanReviewRequired: true,
                silentRebase: false,
                maxRepairRounds: task.maxRepairRounds,
                ...(task.strategyVersions?.activeVersionId ? { strategyVersionId: task.strategyVersions.activeVersionId } : {}),
            }),
        });
    }

    _setPlan(handle, projectId, id, planValue) {
        const task = this._task(handle, projectId, id);
        if (task.projectId !== projectId) throw new NotFoundError('native project agent task', { taskId: id, projectId });
        this._ensureDraftMutable(task);
        const plan = normalizePlan(planValue);
        task.plan = plan;
        task.status = 'planned';
        task.updatedAt = Date.now();
        this._event(task, 'plan', { plan });
        return this._snapshot(task);
    }

    async _propose(handle, task, toolName, args = {}) {
        this._ensureDraftMutable(task);
        if (!task.plan) throw new TypeError('Project Agent must set a Plan before proposing operations');
        await this._assertTaskBaseRevision(handle, task);
        const origin = this._origin(task);
        const stepId = args.stepId == null ? null : String(args.stepId);
        if (stepId && !task.plan.steps.some(step => step.id === stepId)) {
            throw new TypeError('Project Agent operation stepId is not present in the current Plan');
        }

        let operation;
        if (toolName === 'atri_agent_project_save') {
            operation = assertAuthoringOperation({
                operationId: operationId(this._idFactory),
                operationType: STUDIO_SOURCE_OPERATION_TYPES.saveProject,
                target: { resourceType: 'core.project', resourceId: task.projectId },
                input: { source: args.source },
                origin,
            });
        } else if (toolName === 'atri_agent_resource_attach') {
            operation = assertAuthoringOperation({
                operationId: operationId(this._idFactory),
                operationType: STUDIO_RESOURCE_OPERATION_TYPES.attach,
                target: {
                    resourceType: requiredString(args.resourceType, 'resourceType'),
                    resourceId: requiredString(args.resourceId, 'resourceId'),
                },
                input: { revision: requiredString(args.revision, 'revision') },
                origin,
            });
        } else if (toolName === 'atri_agent_resource_update') {
            operation = assertAuthoringOperation({
                operationId: operationId(this._idFactory),
                operationType: STUDIO_RESOURCE_OPERATION_TYPES.update,
                target: {
                    resourceType: requiredString(args.resourceType, 'resourceType'),
                    resourceId: requiredString(args.resourceId, 'resourceId'),
                },
                input: {
                    fromRevision: requiredString(args.fromRevision, 'fromRevision'),
                    toRevision: requiredString(args.toRevision, 'toRevision'),
                },
                origin,
            });
        } else if (toolName === 'atri_agent_resource_fork') {
            operation = assertAuthoringOperation({
                operationId: operationId(this._idFactory),
                operationType: STUDIO_RESOURCE_OPERATION_TYPES.fork,
                target: {
                    resourceType: requiredString(args.resourceType, 'resourceType'),
                    resourceId: requiredString(args.resourceId, 'resourceId'),
                },
                input: {
                    revision: requiredString(args.revision, 'revision'),
                    ...(args.displayName == null ? {} : { displayName: String(args.displayName) }),
                    ...(args.path == null ? {} : { path: String(args.path) }),
                },
                origin,
            });
            operation = await this._studio.prepareAuthoringOperation(handle, task.projectId, operation);
        } else if (toolName === 'atri_agent_frontend_patch') {
            const { stepId: _stepId, ...input } = args;
            operation = assertAuthoringOperation({ operationId: operationId(this._idFactory), operationType: STUDIO_SOURCE_OPERATION_TYPES.frontendPatch,
                target: { resourceType: 'core.project', resourceId: task.projectId }, input, origin });
        } else if (toolName === 'atri_agent_source_write') {
            operation = assertAuthoringOperation({
                operationId: operationId(this._idFactory),
                operationType: STUDIO_SOURCE_OPERATION_TYPES.write,
                target: { path: requiredString(args.path, 'path') },
                input: {
                    content: String(args.content ?? ''),
                    encoding: args.encoding == null ? 'utf8' : String(args.encoding),
                },
                origin,
            });
        } else if (toolName === 'atri_agent_source_move') {
            operation = assertAuthoringOperation({
                operationId: operationId(this._idFactory),
                operationType: STUDIO_SOURCE_OPERATION_TYPES.move,
                target: { path: requiredString(args.path, 'path') },
                input: { toPath: requiredString(args.toPath, 'toPath') },
                origin,
            });
        } else if (toolName === 'atri_agent_source_delete') {
            operation = assertAuthoringOperation({
                operationId: operationId(this._idFactory),
                operationType: STUDIO_SOURCE_OPERATION_TYPES.delete,
                target: { path: requiredString(args.path, 'path') },
                input: {},
                origin,
            });
        } else {
            throw new TypeError('Unsupported Project Agent write tool: ' + toolName);
        }

        task.proposals.push({ stepId, toolName, operation });
        task.status = 'working';
        task.workspace = null;
        task.inspection = null;
        task.validation = null;
        task.review = null;
        task.commitIntent = null;
        task.updatedAt = Date.now();
        this._setStepStatus(task, stepId, 'working');
        this._event(task, 'operation.proposed', {
            stepId,
            toolName,
            operation,
        });
        return this._snapshot(task);
    }

    async _resetOperations(handle, projectId, id) {
        const task = this._task(handle, projectId, id);
        if (task.projectId !== projectId) throw new NotFoundError('native project agent task', { taskId: id, projectId });
        this._ensureDraftMutable(task);
        await this._assertTaskBaseRevision(handle, task);
        if (task.preview?.previewId) this._studio.closePreview(handle, task.preview.previewId);
        task.proposals = [];
        task.workspace = null;
        task.inspection = null;
        task.validation = null;
        task.preview = null;
        task.simulation = null;
        task.review = null;
        task.commitIntent = null;
        task.status = task.plan ? 'planned' : 'planning';
        if (task.plan) {
            for (const step of task.plan.steps) step.status = 'pending';
        }
        task.updatedAt = Date.now();
        this._event(task, 'operations.reset', { repairRound: task.repairRound });
        return this._snapshot(task);
    }

    async _prepareReview(handle, projectId, id, options = {}) {
        const task = this._task(handle, projectId, id);
        if (task.projectId !== projectId) throw new NotFoundError('native project agent task', { taskId: id, projectId });
        this._ensureDraftMutable(task);
        if (!task.plan) throw new TypeError('Project Agent requires a Plan before review');
        if (!task.proposals.length) throw new TypeError('Project Agent requires proposed operations before review');
        await this._assertTaskBaseRevision(handle, task);
        if (task.preview?.previewId) this._studio.closePreview(handle, task.preview.previewId);

        const workspace = this._studio.createWorkspace({
            projectId,
            baseRevision: task.baseRevision,
            origin: this._origin(task),
            operations: task.proposals.map(item => item.operation),
        });
        task.workspace = workspace;
        task.status = 'evaluating';
        task.updatedAt = Date.now();
        this._event(task, 'workspace', { workspace });
        const attempt = this._startAttempt(task, 'evaluation');
        await this._persist(handle, task);

        try {
            const evaluation = await this._studio.evaluateWorkspace(handle, workspace, {
                preview: true,
                simulation: true,
                ...(options.entryPointId == null ? {} : { entryPointId: options.entryPointId }),
                simulationOptions: options.simulationOptions || {},
            });
            task.inspection = {
                workspace: evaluation.workspace,
                changes: evaluation.changes,
            };
            task.validation = evaluation.validation;
            task.preview = evaluation.preview;
            task.simulation = evaluation.simulation;

            if (evaluation.validation.status !== 'passed') {
                task.repairRound += 1;
                task.status = task.repairRound >= task.maxRepairRounds ? 'blocked' : 'repair';
                for (const step of task.plan.steps) {
                    if (step.status === 'working') step.status = 'repair';
                }
                this._event(task, 'validation.failed', {
                    repairRound: task.repairRound,
                    diagnostics: evaluation.validation.diagnostics,
                });
                task.updatedAt = Date.now();
                this._finishAttempt(task, attempt, 'failed');
                return this._snapshot(task);
            }

            for (const step of task.plan.steps) {
                if (step.status === 'working') step.status = 'ready';
            }
            const highImpact = task.plan.steps.some(step => step.impact === 'high')
                || task.proposals.some(item => [
                    STUDIO_SOURCE_OPERATION_TYPES.delete,
                    STUDIO_RESOURCE_OPERATION_TYPES.update,
                    STUDIO_RESOURCE_OPERATION_TYPES.fork,
                ].includes(item.operation.operationType));
            task.review = {
                required: true,
                highImpact,
                preparedAt: Date.now(),
            };
            task.status = 'review';
            task.updatedAt = Date.now();
            this._event(task, 'review.ready', {
                highImpact,
                changes: evaluation.changes,
                validation: evaluation.validation,
                preview: evaluation.preview,
                simulation: evaluation.simulation,
            });
            this._finishAttempt(task, attempt, 'completed');
            return this._snapshot(task);
        } catch (error) {
            if (error?.name === 'ConflictError' || error?.code === ATRIA_PROJECT_CONFLICT_CODE) {
                task.status = 'conflict';
                task.updatedAt = Date.now();
                this._event(task, 'conflict', {
                    expectedRevision: task.baseRevision,
                    details: error?.details,
                });
                this._finishAttempt(task, attempt, 'failed');
                throw error;
            }
            task.repairRound += 1;
            task.status = task.repairRound >= task.maxRepairRounds ? 'blocked' : 'repair';
            task.validation = {
                status: 'failed',
                diagnostics: [{
                    severity: 'error',
                    code: 'agent.evaluation',
                    message: error?.message || String(error),
                }],
            };
            task.updatedAt = Date.now();
            this._event(task, 'evaluation.failed', {
                repairRound: task.repairRound,
                diagnostics: task.validation.diagnostics,
            });
            this._finishAttempt(task, attempt, 'failed');
            return this._snapshot(task);
        }
    }

    async _commit(handle, projectId, id) {
        const task = this._task(handle, projectId, id);
        if (task.status === 'completed') return this._snapshot(task);
        this._ensureMutable(task);
        if (task.status !== 'review' || !task.workspace || task.review?.required !== true) {
            throw new ConflictError('project_agent_review_required', { taskId: id, status: task.status });
        }
        await this._assertTaskBaseRevision(handle, task);
        const attempt = this._startAttempt(task, 'commit');
        task.commitIntent = { changeSetId: 'changeset_' + String(this._idFactory()).replaceAll('-', '').toLowerCase(), workspaceHash: hashNativeDocument(task.workspace) };
        task.status = 'committing';
        task.updatedAt = Date.now();
        await this._persist(handle, task);
        let result;
        try {
            result = await this._studio.executeWorkspace(handle, task.workspace, { changeSetId: task.commitIntent.changeSetId,
                beforeCommit: receipt => {
                    const candidate = clone(task);
                    // Git SHA-1 IDs have the same length; this placeholder is never stored or consumed.
                    this._completeCommit(candidate, { ...receipt, resultingRevision: task.baseRevision });
                    this._finishAttempt(candidate, candidate.attempts.find(item => item.attemptId === attempt.attemptId), 'completed');
                    assertProjectTask({ ...candidate, sequence: candidate.sequence + 1 });
                    candidate.recovery = { status: 'recovered', code: 'formal_receipt_reconciled' };
                    this._event(candidate, 'recovery', candidate.recovery);
                    assertProjectTask({ ...candidate, sequence: candidate.sequence + 1 });
                } });
        } catch (error) {
            // The intent remains durable. Reconcile against Studio before exposing any retry.
            await this._recover(handle, task);
            if (task.status === 'completed') return this._snapshot(task);
            throw error;
        }
        if (result.changeSet.validation.status !== 'passed' || !result.changeSet.resultingRevision) {
            task.changeSets.push(result.changeSet);
            task.validation = result.changeSet.validation;
            task.repairRound += 1;
            task.status = task.repairRound >= task.maxRepairRounds ? 'blocked' : 'repair';
            task.commitIntent = null;
            this._event(task, 'changeset.failed', { changeSet: result.changeSet, repairRound: task.repairRound });
            this._finishAttempt(task, attempt, 'failed');
        } else {
            this._completeCommit(task, result.changeSet);
            this._finishAttempt(task, attempt, 'completed');
        }
        return this._snapshot(task);
    }

    _takeOver(handle, projectId, id) {
        const task = this._task(handle, projectId, id);
        if (task.projectId !== projectId) throw new NotFoundError('native project agent task', { taskId: id, projectId });
        if (task.status === 'completed') {
            throw new ConflictError('project_agent_task_closed', { taskId: id, status: task.status });
        }
        if (task.status === 'taken_over') return this._snapshot(task);
        task.status = 'taken_over';
        task.updatedAt = Date.now();
        this._event(task, 'human.takeover', {
            baseRevision: task.baseRevision,
            operations: task.proposals.map(item => item.operation.operationId),
        });
        return this._snapshot(task);
    }

    async _executeTool(handle, projectId, id, { name, args = {} } = {}) {
        const task = this._task(handle, projectId, id);
        if (task.projectId !== projectId) throw new NotFoundError('native project agent task', { taskId: id, projectId });
        const toolName = requiredString(name, 'Project Agent tool name');
        if (WRITE_TOOL_NAMES.has(toolName)) {
            return this._propose(handle, task, toolName, args || {});
        }
        if (toolName === 'atri_agent_set_plan') {
            return this._setPlan(handle, projectId, id, args);
        }
        if (toolName === 'atri_agent_reset_operations') {
            return this._resetOperations(handle, projectId, id);
        }
        if (toolName === 'atri_agent_prepare_review') {
            return this._prepareReview(handle, projectId, id, args || {});
        }

        this._ensureMutable(task);
        if (toolName === 'atri_agent_frontend_graph') return this._studio.inspectFrontend(handle, projectId, { ownerId: args.ownerId, baseRevision: task.baseRevision });
        if (toolName === 'atri_agent_api_catalog') return listAuthoringReferences(args.query);
        if (toolName === 'atri_agent_api_read') return readAuthoringReference(args);
        if (toolName === 'atri_agent_get_project') {
            return this._studio.getProject(handle, projectId);
        }
        if (toolName === 'atri_agent_list_sources') {
            return this._studio.listSources(handle, projectId);
        }
        if (toolName === 'atri_agent_read_source') {
            return this._studio.readSource(handle, projectId, requiredString(args.path, 'path'));
        }
        if (toolName === 'atri_agent_query_resources') {
            return this._studio.queryResources(handle, {
                projectId,
                ...(args.resourceType == null ? {} : { resourceType: String(args.resourceType) }),
                ...(args.ownership == null ? {} : { ownership: String(args.ownership) }),
                ...(args.search == null ? {} : { search: String(args.search) }),
            });
        }
        if (toolName === 'atri_agent_resource_references') {
            return this._studio.getResourceReferences(handle, {
                resourceType: requiredString(args.resourceType, 'resourceType'),
                resourceId: requiredString(args.resourceId, 'resourceId'),
                ...(args.revision == null ? {} : { revision: String(args.revision) }),
            }, { reverse: args.reverse === true });
        }
        if (toolName === 'atri_agent_resource_closure') {
            return this._studio.resolveResourceClosure(handle, projectId);
        }
        if (toolName === 'atri_agent_validate_current') {
            return this._studio.validateProject(handle, projectId);
        }
        throw new TypeError('Unsupported Project Agent tool: ' + toolName);
    }
}
