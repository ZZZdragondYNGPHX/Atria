import express from 'express';
import request from 'supertest';
import { describe, expect, jest, test } from '@jest/globals';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { projectSource, services } from '../agent-intelligence/project-fixture.js';
import { createNativeStudioRouter } from '../../src/endpoints/native-studio.js';
import { ProjectAgentService } from '../../src/native/project-agent.js';
import { AgentExperienceService } from '../../src/native/agent-intelligence/experience-service.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';

// Optional cross-workspace integration: ATRIA_MCP_SOURCE is the independent
// atria-mcp package root. No tool source is copied into the product workspace.
const toolRoot = process.env.ATRIA_MCP_SOURCE ? resolve(process.env.ATRIA_MCP_SOURCE) : null;
const integration = toolRoot ? describe : describe.skip;
integration('real MCP Project Adapter → authenticated Native Router → durable Project authority', () => {
    let h, current, source, baseRevision, executor, writes, approvals, loseCommitReply, driftOnApproval, wake, collect;
    beforeAll(async () => {
        const { registerProjectActions } = await import(pathToFileURL(join(toolRoot, 'src/project-actions.js')).href);
        const { ActionRegistry, PolicyCeiling, RiskExecutor } = await import(pathToFileURL(join(toolRoot, 'src/kernel.js')).href);
        globalThis.__mcpProjectTestModules = { registerProjectActions, ActionRegistry, PolicyCeiling, RiskExecutor };
    });
    beforeEach(async () => {
        h = await makeTempFsEngineHarness(); current = services(h); source = projectSource();
        wake = jest.fn();
        current.agent = new ProjectAgentService({ studio: current.studio, repository: current.repository, maxRepairRounds: 2, collectExperience: true, onExperienceCollected: wake });
        collect = jest.spyOn(AgentExperienceService.prototype, 'collect');
        const created = await current.studio.createProject(h.handle, source);
        baseRevision = created.revision.revision;
        const boot = '12345678-1234-4123-8123-123456789012';
        const app = express(); app.use(express.json({ limit: '4mb' }));
        app.use((req, res, next) => { req.user = { profile: { handle: h.handle } }; res.set('x-atria-server-boot-id', boot); next(); });
        app.use('/api/native/studio', createNativeStudioRouter(() => current));
        const wrap = response => ({ ok: () => response.status < 400, status: () => response.status, headers: () => response.headers,
            body: async () => Buffer.from(response.text), dispose: async () => {} });
        writes = []; approvals = []; loseCommitReply = false; driftOnApproval = null;
        const browser = { config: { url: 'http://localhost', timeout: 1000, maxResponseBytes: 1048576 }, start: async () => {}, runtimeIdentity: async () => ({ serverBootId: boot, mutationGuards: 1 }),
            context: { request: { get: async () => ({ ok: () => true, status: () => 200, headers: () => ({ 'content-type': 'application/json' }), body: async () => Buffer.from('{"token":"fixture"}'), dispose: async () => {} }),
                fetch: async (url, options) => {
                    const pathname = new URL(url).pathname, method = options.method.toLowerCase();
                    const call = request(app)[method](pathname).set(options.headers);
                    if (method !== 'get') writes.push({ pathname, body: structuredClone(options.data) });
                    const result = await (method === 'get' ? call : call.send(options.data));
                    if (loseCommitReply && pathname.endsWith('/commit') && result.status === 200) throw new Error('Commit acknowledgement lost after Native acceptance');
                    return wrap(result);
                },
            } } };
        const { registerProjectActions, ActionRegistry, PolicyCeiling, RiskExecutor } = globalThis.__mcpProjectTestModules;
        const registry = registerProjectActions(new ActionRegistry(), browser);
        executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), { approve: async approval => {
            approvals.push(approval); if (driftOnApproval) await driftOnApproval(); return { action: 'accept', content: { authorize: true, uses: 1 } };
        } });
    });
    afterEach(async () => { jest.restoreAllMocks(); await h.cleanup(); });
    afterAll(() => { delete globalThis.__mcpProjectTestModules; });

    const create = () => executor.execute('MUTATE', { action: 'agent.project.task.create', input: { projectId: source.project.projectId, baseRevision, intent: 'Rename the Native work' } });
    const act = async (suffix, task, extra = {}, risk = 'MUTATE') => executor.execute(risk, { action: 'agent.project.' + suffix,
        input: { projectId: task.projectId, baseRevision: task.baseRevision, taskId: task.taskId, expectedSequence: task.sequence, ...extra } });
    const prepare = async () => {
        let result = await create(); expect(result.receipt.status).toBe('succeeded'); let task = result.result.data;
        result = await act('plan.set', task, { summary: 'Rename safely', steps: [{ id: 'rename', title: 'Rename the work', impact: 'low' }] });
        expect(result.receipt.status).toBe('succeeded'); task = result.result.data;
        const nextSource = structuredClone(source); nextSource.package.name = 'MCP Native reviewed name';
        result = await act('proposal.project.save', task, { source: nextSource, stepId: 'rename' });
        expect(result.receipt.status).toBe('succeeded'); task = result.result.data;
        result = await act('review.prepare', task, {}, 'INTERACT');
        expect(result.receipt.status).toBe('succeeded');
        task = await current.agent.observeTask(h.handle, task.projectId, task.taskId);
        expect(task.status).toBe('review'); expect(task.validation.status).toBe('passed');
        return task;
    };

    test('real create/plan/proposal/review/commit retain Native state and suppress implicit background models', async () => {
        const task = await prepare();
        expect((await current.studio.getRevision(h.handle, task.projectId)).revision).toBe(baseRevision);
        const reviewApprovals = approvals.length;
        const expectedReviewHash = hashNativeDocument({ workspace: task.workspace, review: task.review, validation: task.validation });
        const result = await act('commit', task, { expectedReviewHash });
        expect(result.receipt.status).toBe('succeeded'); expect(approvals).toHaveLength(reviewApprovals + 1);
        expect((await current.agent.observeTask(h.handle, task.projectId, task.taskId)).status).toBe('completed');
        expect((await current.studio.getProject(h.handle, task.projectId)).source.package.name).toBe('MCP Native reviewed name');
        expect(collect).toHaveBeenCalled(); expect(wake).not.toHaveBeenCalled();
        for (const write of writes.filter(write => write.pathname.endsWith('/tool') || write.pathname.endsWith('/commit'))) expect(write.body.effectPolicy).toBe('no-background-model');
    });

    test('same-task sequence drift during trusted approval blocks the adapter write', async () => {
        const made = await create(), task = made.result.data;
        const beforeWrites = writes.length;
        driftOnApproval = () => current.agent.executeTool(h.handle, task.projectId, task.taskId, { name: 'atri_agent_set_plan', args: { summary: 'Concurrent owner edit', steps: [{ id: 'owner', title: 'Keep owner edit' }] }, effectPolicy: 'no-background-model' });
        await expect(act('plan.set', task, { summary: 'Old plan', steps: [{ id: 'stale', title: 'Stale edit' }] })).rejects.toThrow(/sequence conflict/);
        expect(writes).toHaveLength(beforeWrites);
        expect((await current.agent.observeTask(h.handle, task.projectId, task.taskId)).plan.summary).toBe('Concurrent owner edit');
    });

    test('lost formal Commit response leaves one durable Commit and never repeats the request', async () => {
        const task = await prepare(); loseCommitReply = true;
        const expectedReviewHash = hashNativeDocument({ workspace: task.workspace, review: task.review, validation: task.validation });
        const result = await act('commit', task, { expectedReviewHash });
        expect(result.receipt.status).toBe('indeterminate');
        expect(writes.filter(write => write.pathname.endsWith('/commit'))).toHaveLength(1);
        const observed = await current.agent.observeTask(h.handle, task.projectId, task.taskId);
        expect(observed.status).toBe('completed'); expect(observed.changeSets).toHaveLength(1);
        expect((await current.studio.getProject(h.handle, task.projectId)).source.package.name).toBe('MCP Native reviewed name');
        expect(wake).not.toHaveBeenCalled();
    });
});
