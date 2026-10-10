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
import { createServer } from 'node:http';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { createNativeMessagesProvider } from '../../src/native/adapters/native-messages-provider.js';

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
    test.each(['reported', 'rejected_body', 'secret_echo', 'partial', 'tokens_exhausted', 'incomplete_native_stream', 'cancelled'])('G05 preserves direct numeric usage on %s without storing rejected content', async kind => {
        const h = await makeTempFsEngine(); let seen = 0; let notifySend;
        const sent = new Promise(resolve => { notifySend = resolve; });
        const server = createServer(async (req, res) => {
            for await (const chunk of req) void chunk;
            if (kind === 'cancelled') { seen++; notifySend(); return; }
            if (kind === 'incomplete_native_stream') {
                seen++; res.writeHead(200, { 'Content-Type': 'text/event-stream' });
                res.end([{ type: 'message_start', message: { usage: { input_tokens: 12 } } },
                    { type: 'message_delta', usage: { output_tokens: 8 }, delta: { stop_reason: 'end_turn' } }]
                    .map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''));
                return;
            }
            seen++; res.writeHead(200, { 'Content-Type': 'application/json' });
            const usage = { prompt_tokens: 12, completion_tokens: 8, ...(kind === 'partial' ? {} : { total_tokens: 20 }) };
            res.end(JSON.stringify({ choices: kind === 'rejected_body' ? [] : [{ message: { role: 'assistant', content: kind === 'secret_echo' ? 'test-credential' : 'Current result.' } }], usage }));
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        try {
            const { studio, agent } = makeServices(h); const source = projectSource();
            const created = await studio.createProject(h.handle, source);
            const task = await plannedTask(agent, h.handle, source, created.revision.revision);
            const format = kind === 'incomplete_native_stream' ? 'anthropic' : 'openai-compatible';
            const seeded = await seedGenerationProfiles({ ...h, format, roles: ['studio'], endpoint: `http://127.0.0.1:${server.address().port}/chat/completions` });
            await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: { schemaVersion: 1,
                allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: { maxRequests: 2, maxTokens: kind === 'tokens_exhausted' ? 1 : 32000 } } });
            const host = new NativeGenerationHost({ ...seeded, studio, agent, providers: { ['provider.' + format]: format === 'anthropic' ? createNativeMessagesProvider({ format }) : createHttpGenerationProvider() },
                secretPort: { resolveSecret: async () => 'test-credential' } });
            const input = { projectId: source.project.projectId, revision: created.revision.revision, taskId: task.taskId, role: 'studio', requestId: 'usage-1', messages: [{ role: 'user', content: 'Use current task evidence.' }] };
            await host.execute(h.handle, input, undefined, undefined, { preview: true });
            expect((await agent.getTask(h.handle, input.projectId, task.taskId)).compute).toBeUndefined(); expect(seen).toBe(0);
            const controller = new AbortController();
            const run = host.execute(h.handle, input, controller.signal);
            if (kind === 'cancelled') {
                const rejection = expect(run).rejects.toMatchObject({ code: 'generation_cancelled' });
                await sent; controller.abort(); await rejection;
            }
            else if (kind === 'tokens_exhausted') await expect(run).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
            else if (['rejected_body', 'secret_echo', 'incomplete_native_stream'].includes(kind)) await expect(run).rejects.toHaveProperty('code'); else await run;
            const current = await agent.getTask(h.handle, input.projectId, task.taskId);
            if (kind === 'tokens_exhausted') { expect(current.compute.attempts).toHaveLength(0); expect(seen).toBe(0); return; }
            expect(current.compute.attempts).toHaveLength(1); expect(seen).toBe(1);
            if (kind === 'cancelled') { expect(current.compute.attempts[0]).toMatchObject({ status: 'unknown', usage: null }); return; }
            expect(current.compute.attempts[0]).toMatchObject({ status: ['partial', 'incomplete_native_stream'].includes(kind) ? 'unknown' : 'settled',
                usage: { inputTokens: 12, outputTokens: 8, totalTokens: ['partial', 'incomplete_native_stream'].includes(kind) ? null : 20 } });
            expect(JSON.stringify(current.compute)).not.toContain('test-credential');
        } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.cleanup(); }
    });
    test('G05 concurrent actual Host sends share durable Task limits; missing usage and reopening never refund', async () => {
        const h = await makeTempFsEngine(); let seen = 0;
        const server = createServer(async (req, res) => {
            for await (const chunk of req) void chunk;
            seen++; res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Current result.' } }] }));
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        try {
            const { studio, agent } = makeServices(h); const source = projectSource();
            const created = await studio.createProject(h.handle, source);
            const task = await plannedTask(agent, h.handle, source, created.revision.revision);
            const seeded = await seedGenerationProfiles({ ...h, roles: ['studio'], endpoint: `http://127.0.0.1:${server.address().port}/chat/completions` });
            await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: { schemaVersion: 1,
                allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: { maxRequests: 1, maxTokens: 16000 } } });
            const host = new NativeGenerationHost({ ...seeded, studio, agent, providers: { 'provider.openai-compatible': createHttpGenerationProvider() },
                secretPort: { resolveSecret: async () => 'test-credential' } });
            const input = { projectId: source.project.projectId, revision: created.revision.revision, taskId: task.taskId, role: 'studio', messages: [{ role: 'user', content: 'Use current task evidence.' }] };
            const results = await Promise.allSettled([host.execute(h.handle, { ...input, requestId: 'concurrent-1' }), host.execute(h.handle, { ...input, requestId: 'concurrent-2' })]);
            expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
            expect(results.find(row => row.status === 'rejected').reason).toMatchObject({ code: 'native_generation_budget_exhausted' });
            expect(seen).toBe(1);
            const restored = new ProjectAgentService({ studio });
            const current = await restored.getTask(h.handle, input.projectId, task.taskId);
            expect(current.compute.attempts).toHaveLength(1);
            expect(current.compute.attempts[0]).toMatchObject({ status: 'unknown', usage: null });
            expect(current.compute.attempts[0].estimatedTokens).toBeGreaterThan(512);
            host.agent = restored;
            await expect(host.execute(h.handle, { ...input, requestId: 'after-reopen' })).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
            expect(seen).toBe(1);
        } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.cleanup(); }
    });
    test('G03 plan reuse copies only current exact intent structure and survives task restore without copying operations or receipts', async () => {
        const h = await makeTempFsEngine();
        try {
            const { studio, agent } = makeServices(h);
            const source = projectSource();
            const created = await studio.createProject(h.handle, source);
            const original = await plannedTask(agent, h.handle, source, created.revision.revision);
            const next = { ...source, project: { ...source.project, displayName: 'Candidate name' } };
            await agent.executeTool(h.handle, source.project.projectId, original.taskId,
                { name: 'atri_agent_project_save', args: { source: next, stepId: 'step_metadata' } });
            const target = await agent.createTask(h.handle, source.project.projectId,
                { intent: original.intent, baseRevision: created.revision.revision });
            const result = await agent.executeTool(h.handle, source.project.projectId, target.taskId,
                { name: 'atri_agent_reuse_plan', args: { sourceTaskId: original.taskId } });
            expect(result.plan.steps.every(step => step.status === 'pending')).toBe(true);
            expect(result.operations).toHaveLength(0);
            expect(result.changeSets).toHaveLength(0);
            expect(result.timeline.at(-1)).toMatchObject({ type: 'plan.reused', sourceTaskId: original.taskId, status: 'reused' });
            const restored = new ProjectAgentService({ studio, maxRepairRounds: 2 });
            expect((await restored.getTask(h.handle, source.project.projectId, target.taskId)).timeline.at(-1)).toEqual(result.timeline.at(-1));
            expect((await studio.getProject(h.handle, source.project.projectId)).source.project.displayName).toBe(source.project.displayName);
            await expect(restored.commit(h.handle, source.project.projectId, target.taskId)).rejects.toThrow();
        } finally { await h.cleanup(); }
    });
    test('G03 plan candidate with a different intent or foreign Project is denied before changing target plan', async () => {
        const h = await makeTempFsEngine();
        try {
            const { studio, agent } = makeServices(h);
            const source = projectSource();
            const created = await studio.createProject(h.handle, source);
            const original = await plannedTask(agent, h.handle, source, created.revision.revision);
            const target = await agent.createTask(h.handle, source.project.projectId,
                { intent: 'Different goal.', baseRevision: created.revision.revision });
            await expect(agent.executeTool(h.handle, source.project.projectId, target.taskId,
                { name: 'atri_agent_reuse_plan', args: { sourceTaskId: original.taskId } })).rejects.toMatchObject({ code: 'project_agent_plan_reuse_denied' });
            const other = projectSource(); const foreign = await studio.createProject(h.handle, other);
            const foreignTask = await plannedTask(agent, h.handle, other, foreign.revision.revision);
            await expect(agent.executeTool(h.handle, source.project.projectId, target.taskId,
                { name: 'atri_agent_reuse_plan', args: { sourceTaskId: foreignTask.taskId } })).rejects.toMatchObject({ code: 'project_agent_plan_reuse_denied' });
            expect((await agent.getTask(h.handle, source.project.projectId, target.taskId)).plan).toBeNull();
        } finally { await h.cleanup(); }
    });
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
                await agent.setPlan(h.handle, source.project.projectId, task.taskId, {
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
            expect((await agent.getTask(h.handle, source.project.projectId, task.taskId)).status).toBe('conflict');
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

            const repairStates = [];
            for (let attempt = 1; attempt <= 2; attempt += 1) {
                task = await agent.executeTool(h.handle, source.project.projectId, task.taskId, {
                    name: 'atri_agent_project_save',
                    args: { source: invalid, stepId: 'step_metadata' },
                });
                task = await agent.prepareReview(h.handle, source.project.projectId, task.taskId);
                repairStates.push({ round: task.repairRound, status: task.status });
                if (attempt === 1) {
                    task = await agent.resetOperations(h.handle, source.project.projectId, task.taskId);
                }
            }

            expect(repairStates).toEqual([
                { round: 1, status: 'repair' },
                { round: 2, status: 'blocked' },
            ]);
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
            task = await agent.takeOver(h.handle, source.project.projectId, task.taskId);
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
