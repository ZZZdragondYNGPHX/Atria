import { describe, expect, test } from '@jest/globals';

import { createGitClient } from '../../src/git/client.js';
import {
    AssetStore,
    KnowledgeRepo,
    ProjectAgentService,
    ProjectStore,
    StudioPreviewHost,
    StudioService,
    WorldRepo,
    createNativeId,
} from '../../src/native/index.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';

function projectSource(overrides = {}) {
    const projectId = overrides.projectId || createNativeId('project');
    const packageId = overrides.packageId || createNativeId('package');
    return {
        format: 'atria-project-source',
        schemaVersion: 1,
        project: {
            projectId,
            packageId,
            displayName: 'A8 Project',
            createdAt: 10,
            updatedAt: 10,
        },
        package: {
            name: 'A8 Work',
            version: '1.0.0',
            actors: [],
            entryPoints: [{
                entryPointId: createNativeId('entryPoint'),
                displayName: 'Main',
                actorIds: [],
                worldIds: [],
                knowledgeBindingIds: [],
            }],
            capabilities: ['narrative'],
            permissions: [],
        },
        worlds: [],
        knowledge: [],
        knowledgeBindings: [],
        dependencies: {
            worlds: [],
            knowledge: [],
            knowledgeBindings: [],
            assets: [],
        },
        assetFiles: [],
        ...overrides,
    };
}

function makeServices(h, options = {}) {
    const projectStore = new ProjectStore({ directoriesByHandle: () => h.dirs });
    const studio = new StudioService({
        projectStore,
        worldRepo: new WorldRepo({ engine: h.engine }),
        knowledgeRepo: new KnowledgeRepo({ engine: h.engine }),
        assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }),
        gitClient: createGitClient({ backend: 'builtin' }),
        previewHost: new StudioPreviewHost(),
        simulationRunner: async ({ source }) => ({
            displayName: source.project.displayName,
            mode: 'dry-run',
        }),
        ...options,
    });
    return {
        studio,
        agent: new ProjectAgentService({ studio, maxRepairRounds: 2 }),
    };
}

async function plannedTask(agent, handle, source, baseRevision, options = {}) {
    const task = await agent.createTask(handle, source.project.projectId, {
        intent: options.intent || 'Rename the work through structured project authoring.',
        baseRevision,
        ...(options.maxRepairRounds == null ? {} : { maxRepairRounds: options.maxRepairRounds }),
    });
    return agent.executeTool(handle, source.project.projectId, task.taskId, {
        name: 'atri_agent_set_plan',
        args: {
            summary: 'Update project metadata safely.',
            steps: [{
                id: 'step_metadata',
                title: 'Update project metadata',
                impact: options.impact || 'low',
            }],
        },
    });
}

describe('A8 Project Agent authority', () => {
    test('dry-runs Agent Workspace through validation/preview/simulation and only commits after review', async () => {
        const h = await makeTempFsEngine();
        try {
            const { studio, agent } = makeServices(h);
            const source = projectSource();
            const created = await studio.createProject(h.handle, source);
            let task = await plannedTask(agent, h.handle, source, created.revision.revision);

            const next = structuredClone(source);
            next.project.displayName = 'Agent Authored';
            next.project.updatedAt = 20;
            task = await agent.executeTool(h.handle, source.project.projectId, task.taskId, {
                name: 'atri_agent_project_save',
                args: { source: next, stepId: 'step_metadata' },
            });
            expect(task.operations).toHaveLength(1);
            expect(task.operations[0].operation.origin).toEqual({
                kind: 'agent',
                id: task.taskId,
            });

            task = await agent.executeTool(h.handle, source.project.projectId, task.taskId, {
                name: 'atri_agent_prepare_review',
                args: {},
            });
            expect(task.status).toBe('review');
            expect(task.validation).toEqual({ status: 'passed', diagnostics: [] });
            expect(task.preview).toMatchObject({ projectId: source.project.projectId, persisted: false });
            expect(task.simulation).toMatchObject({
                status: 'completed',
                result: { displayName: 'Agent Authored', mode: 'dry-run' },
            });
            expect((await studio.getProject(h.handle, source.project.projectId)).source.project.displayName)
                .toBe('A8 Project');
            let reviewLockError;
            try {
                agent.setPlan(h.handle, source.project.projectId, task.taskId, {
                    summary: 'Changed after review',
                    steps: [{ id: 'other', title: 'Other change', impact: 'low' }],
                });
            } catch (error) {
                reviewLockError = error;
            }
            expect(reviewLockError).toMatchObject({
                name: 'ConflictError',
                code: 'project_agent_review_locked',
            });

            const committed = await agent.commit(h.handle, source.project.projectId, task.taskId);
            expect(committed.status).toBe('completed');
            expect(committed.changeSets).toHaveLength(1);
            expect(committed.changeSets[0].baseRevision).toBe(created.revision.revision);
            expect(committed.changeSets[0].operations[0].origin).toEqual({
                kind: 'agent',
                id: task.taskId,
            });
            expect(committed.changeSets[0].resultingRevision).not.toBe(created.revision.revision);
            expect((await studio.getProject(h.handle, source.project.projectId)).source.project.displayName)
                .toBe('Agent Authored');
            expect((await studio.history(h.handle, source.project.projectId))[0].message)
                .toContain(`Task ${task.taskId}`);
        } finally {
            await h.cleanup();
        }
    });

    test('never silently rebases when a human advances the pinned baseRevision', async () => {
        const h = await makeTempFsEngine();
        try {
            const { studio, agent } = makeServices(h);
            const source = projectSource();
            const created = await studio.createProject(h.handle, source);
            let task = await plannedTask(agent, h.handle, source, created.revision.revision);

            const agentSource = structuredClone(source);
            agentSource.project.displayName = 'Agent Proposal';
            task = await agent.executeTool(h.handle, source.project.projectId, task.taskId, {
                name: 'atri_agent_project_save',
                args: { source: agentSource, stepId: 'step_metadata' },
            });

            const humanSource = structuredClone(source);
            humanSource.project.displayName = 'Human Change';
            const human = await studio.saveProjectSource(h.handle, source.project.projectId, {
                source: humanSource,
                baseRevision: created.revision.revision,
                origin: { kind: 'human', id: 'human_a8' },
            });

            await expect(agent.prepareReview(h.handle, source.project.projectId, task.taskId))
                .rejects.toMatchObject({
                    name: 'ConflictError',
                    code: 'project_revision_conflict',
                    details: {
                        expectedRevision: created.revision.revision,
                        actualRevision: human.changeSet.resultingRevision,
                    },
                });
            expect(agent.getTask(h.handle, source.project.projectId, task.taskId).status).toBe('conflict');
            expect((await studio.getProject(h.handle, source.project.projectId)).source.project.displayName)
                .toBe('Human Change');
        } finally {
            await h.cleanup();
        }
    });

    test('bounds automatic repair attempts and retains semantic Task history', async () => {
        const h = await makeTempFsEngine();
        try {
            const { studio, agent } = makeServices(h);
            const source = projectSource();
            const created = await studio.createProject(h.handle, source);
            let task = await plannedTask(agent, h.handle, source, created.revision.revision, {
                maxRepairRounds: 2,
            });

            const invalid = structuredClone(source);
            invalid.project.projectId = 'invalid-project-id';

            for (let attempt = 1; attempt <= 2; attempt += 1) {
                task = await agent.executeTool(h.handle, source.project.projectId, task.taskId, {
                    name: 'atri_agent_project_save',
                    args: { source: invalid, stepId: 'step_metadata' },
                });
                task = await agent.prepareReview(h.handle, source.project.projectId, task.taskId);
                expect(task.repairRound).toBe(attempt);
                if (attempt === 1) {
                    expect(task.status).toBe('repair');
                    task = await agent.resetOperations(h.handle, source.project.projectId, task.taskId);
                }
            }

            expect(task.status).toBe('blocked');
            expect(task.timeline.filter(item => item.type === 'evaluation.failed')).toHaveLength(2);
            await expect(agent.executeTool(h.handle, source.project.projectId, task.taskId, {
                name: 'atri_agent_validate_current',
                args: {},
            })).rejects.toMatchObject({
                name: 'ConflictError',
                code: 'project_agent_repair_limit',
            });
        } finally {
            await h.cleanup();
        }
    });

    test('human takeover closes Agent mutation while leaving Studio authority untouched', async () => {
        const h = await makeTempFsEngine();
        try {
            const { studio, agent } = makeServices(h);
            const source = projectSource();
            const created = await studio.createProject(h.handle, source);
            let task = await plannedTask(agent, h.handle, source, created.revision.revision);
            task = agent.takeOver(h.handle, source.project.projectId, task.taskId);
            expect(task.status).toBe('taken_over');
            expect(task.timeline.at(-1).type).toBe('human.takeover');

            await expect(agent.executeTool(h.handle, source.project.projectId, task.taskId, {
                name: 'atri_agent_validate_current',
                args: {},
            })).rejects.toMatchObject({
                name: 'ConflictError',
                code: 'project_agent_task_closed',
            });

            expect((await studio.validateProject(h.handle, source.project.projectId)).status).toBe('passed');
        } finally {
            await h.cleanup();
        }
    });
});
