import { randomUUID } from 'node:crypto';

import { ConflictError, NotFoundError } from '../storage/errors.js';
import {
    ATRIA_PROJECT_CONFLICT_CODE,
    assertAuthoringOperation,
} from './authoring-contracts.js';
import { STUDIO_RESOURCE_OPERATION_TYPES } from './authoring/library-authoring.js';
import { STUDIO_SOURCE_OPERATION_TYPES } from './authoring/studio-service.js';

export const PROJECT_AGENT_MAX_REPAIR_ROUNDS = 3;

const TERMINAL_STATES = new Set(['completed', 'taken_over', 'cancelled']);
const WRITE_TOOL_NAMES = new Set([
    'atri_agent_project_save',
    'atri_agent_resource_attach',
    'atri_agent_resource_update',
    'atri_agent_resource_fork',
    'atri_agent_source_write',
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

function currentResourceTypes(registry, capability) {
    return (registry?.descriptors || [])
        .filter(item => item.capabilities?.includes(capability))
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
        this._tasks = new Map();
    }

    _key(handle, id) {
        return String(handle) + '\0' + String(id);
    }

    _task(handle, id) {
        const task = this._tasks.get(this._key(handle, id));
        if (!task) throw new NotFoundError('native project agent task', { taskId: id });
        return task;
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
            review: task.review,
            changeSets: task.changeSets,
            timeline: task.timeline,
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
            throw new ConflictError(ATRIA_PROJECT_CONFLICT_CODE, {
                taskId: task.taskId,
                expectedRevision: task.baseRevision,
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

    _setStepStatus(task, stepId, status) {
        if (!stepId || !task.plan) return;
        const step = task.plan.steps.find(item => item.id === stepId);
        if (step) step.status = status;
    }

    async createTask(handle, projectId, {
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
            createdAt: now,
            updatedAt: now,
        };
        this._event(task, 'intent', { intent: normalizedIntent, baseRevision: expected });
        this._tasks.set(this._key(handle, task.taskId), task);
        return this._snapshot(task);
    }

    listTasks(handle, projectId) {
        return Object.freeze(
            [...this._tasks.entries()]
                .filter(([key, task]) => key.startsWith(String(handle) + '\0') && task.projectId === projectId)
                .map(([, task]) => this._snapshot(task))
                .sort((left, right) => right.updatedAt - left.updatedAt),
        );
    }

    getTask(handle, projectId, id) {
        const task = this._task(handle, id);
        if (task.projectId !== projectId) throw new NotFoundError('native project agent task', { taskId: id, projectId });
        return this._snapshot(task);
    }

    async getContext(handle, projectId, id) {
        const task = this._task(handle, id);
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
            }),
        });
    }

    setPlan(handle, projectId, id, planValue) {
        const task = this._task(handle, id);
        if (task.projectId !== projectId) throw new NotFoundError('native project agent task', { taskId: id, projectId });
        this._ensureMutable(task);
        const plan = normalizePlan(planValue);
        task.plan = plan;
        task.status = 'planned';
        task.updatedAt = Date.now();
        this._event(task, 'plan', { plan });
        return this._snapshot(task);
    }

    async _propose(handle, task, toolName, args = {}) {
        this._ensureMutable(task);
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
        } else if (toolName === 'atri_agent_source_write') {
            operation = assertAuthoringOperation({
                operationId: operationId(this._idFactory),
                operationType: STUDIO_SOURCE_OPERATION_TYPES.write,
                target: {
                    resourceType: 'core.project-source',
                    resourceId: requiredString(args.path, 'path'),
                    path: requiredString(args.path, 'path'),
                },
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
                target: {
                    resourceType: 'core.project-source',
                    resourceId: requiredString(args.path, 'path'),
                    path: requiredString(args.path, 'path'),
                },
                input: { toPath: requiredString(args.toPath, 'toPath') },
                origin,
            });
        } else if (toolName === 'atri_agent_source_delete') {
            operation = assertAuthoringOperation({
                operationId: operationId(this._idFactory),
                operationType: STUDIO_SOURCE_OPERATION_TYPES.delete,
                target: {
                    resourceType: 'core.project-source',
                    resourceId: requiredString(args.path, 'path'),
                    path: requiredString(args.path, 'path'),
                },
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
        task.updatedAt = Date.now();
        this._setStepStatus(task, stepId, 'working');
        this._event(task, 'operation.proposed', {
            stepId,
            toolName,
            operation,
        });
        return this._snapshot(task);
    }

    async resetOperations(handle, projectId, id) {
        const task = this._task(handle, id);
        if (task.projectId !== projectId) throw new NotFoundError('native project agent task', { taskId: id, projectId });
        this._ensureMutable(task);
        await this._assertTaskBaseRevision(handle, task);
        if (task.preview?.previewId) this._studio.closePreview(handle, task.preview.previewId);
        task.proposals = [];
        task.workspace = null;
        task.inspection = null;
        task.validation = null;
        task.preview = null;
        task.simulation = null;
        task.review = null;
        task.status = task.plan ? 'planned' : 'planning';
        if (task.plan) {
            for (const step of task.plan.steps) step.status = 'pending';
        }
        task.updatedAt = Date.now();
        this._event(task, 'operations.reset', { repairRound: task.repairRound });
        return this._snapshot(task);
    }

    async prepareReview(handle, projectId, id, options = {}) {
        const task = this._task(handle, id);
        if (task.projectId !== projectId) throw new NotFoundError('native project agent task', { taskId: id, projectId });
        this._ensureMutable(task);
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
            return this._snapshot(task);
        } catch (error) {
            if (error?.name === 'ConflictError' || error?.code === ATRIA_PROJECT_CONFLICT_CODE) {
                task.status = 'conflict';
                task.updatedAt = Date.now();
                this._event(task, 'conflict', {
                    expectedRevision: task.baseRevision,
                    details: error?.details,
                });
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
            return this._snapshot(task);
        }
    }

    async commit(handle, projectId, id) {
        const task = this._task(handle, id);
        if (task.projectId !== projectId) throw new NotFoundError('native project agent task', { taskId: id, projectId });
        this._ensureMutable(task);
        if (task.status !== 'review' || !task.workspace || task.review?.required !== true) {
            throw new ConflictError('project_agent_review_required', {
                taskId: id,
                status: task.status,
            });
        }
        await this._assertTaskBaseRevision(handle, task);
        task.status = 'committing';
        task.updatedAt = Date.now();
        try {
            const result = await this._studio.executeWorkspace(handle, task.workspace);
            task.changeSets.push(result.changeSet);
            task.validation = result.changeSet.validation;
            if (result.changeSet.validation.status !== 'passed' || !result.changeSet.resultingRevision) {
                task.repairRound += 1;
                task.status = task.repairRound >= task.maxRepairRounds ? 'blocked' : 'repair';
                this._event(task, 'changeset.failed', {
                    changeSet: result.changeSet,
                    repairRound: task.repairRound,
                });
                task.updatedAt = Date.now();
                return this._snapshot(task);
            }
            task.status = 'completed';
            for (const step of task.plan.steps) step.status = 'completed';
            task.updatedAt = Date.now();
            this._event(task, 'changeset.committed', {
                changeSetId: result.changeSet.changeSetId,
                baseRevision: result.changeSet.baseRevision,
                resultingRevision: result.changeSet.resultingRevision,
            });
            return this._snapshot(task);
        } catch (error) {
            if (error?.name === 'ConflictError' || error?.code === ATRIA_PROJECT_CONFLICT_CODE) {
                task.status = 'conflict';
                task.updatedAt = Date.now();
                this._event(task, 'conflict', {
                    expectedRevision: task.baseRevision,
                    details: error?.details,
                });
            }
            throw error;
        }
    }

    takeOver(handle, projectId, id) {
        const task = this._task(handle, id);
        if (task.projectId !== projectId) throw new NotFoundError('native project agent task', { taskId: id, projectId });
        if (task.status === 'completed') {
            throw new ConflictError('project_agent_task_closed', { taskId: id, status: task.status });
        }
        task.status = 'taken_over';
        task.updatedAt = Date.now();
        this._event(task, 'human.takeover', {
            baseRevision: task.baseRevision,
            operations: task.proposals.map(item => item.operation.operationId),
        });
        return this._snapshot(task);
    }

    async executeTool(handle, projectId, id, { name, args = {} } = {}) {
        const task = this._task(handle, id);
        if (task.projectId !== projectId) throw new NotFoundError('native project agent task', { taskId: id, projectId });
        const toolName = requiredString(name, 'Project Agent tool name');
        if (WRITE_TOOL_NAMES.has(toolName)) {
            return this._propose(handle, task, toolName, args || {});
        }
        if (toolName === 'atri_agent_set_plan') {
            return this.setPlan(handle, projectId, id, args);
        }
        if (toolName === 'atri_agent_reset_operations') {
            return this.resetOperations(handle, projectId, id);
        }
        if (toolName === 'atri_agent_prepare_review') {
            return this.prepareReview(handle, projectId, id, args || {});
        }

        this._ensureMutable(task);
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
