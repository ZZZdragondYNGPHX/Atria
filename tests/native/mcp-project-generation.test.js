import { describe, expect, test } from '@jest/globals';
import { createServer } from 'node:http';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { projectSource, services } from '../agent-intelligence/project-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { createSkillRepository } from '../../src/skills/repository.js';
import { NativeProjectAgentExecutor } from '../../src/native/project-agent-executor.js';
import { NativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import express from 'express';
import request from 'supertest';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { createNativeStudioRouter } from '../../src/endpoints/native-studio.js';

async function fixture(make, { hold = false, fail = false } = {}) {
    const h = await make(), seen = [];
    let release, entered;
    const waiting = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const source = projectSource(), proposed = structuredClone(source); proposed.project.displayName = 'Generated proposal';
    const calls = [
        ['atri_agent_set_plan', { summary: 'Rename the work', steps: [{ id: 'rename', title: 'Rename the work' }] }],
        ['atri_agent_project_save', { source: proposed, stepId: 'rename' }],
        ['atri_agent_prepare_review', {}],
    ];
    const server = createServer(async (req, res) => {
        let text = ''; for await (const part of req) text += part;
        seen.push(JSON.parse(text)); entered();
        if (hold) await gate;
        if (fail) { res.writeHead(503); res.end('{"error":"synthetic failure"}'); return; }
        const [name, args] = calls[Math.min(seen.length - 1, 2)];
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: 'call-' + seen.length, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }],
            usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const p = services(h), project = await p.studio.createProject(h.handle, source);
    const task = await p.agent.createTask(h.handle, source.project.projectId, { intent: 'Rename the work using a proposal', baseRevision: project.revision.revision });
    const seeded = await seedGenerationProfiles({ ...h, roles: ['studio'], endpoint: `http://127.0.0.1:${server.address().port}/v1/chat/completions` });
    const route = await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], policy: { timeoutMs: 10000, maxRetries: 0, maxFallbackAttempts: 0 },
        executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: { maxRequests: 3, maxTokens: 100000,
            localWork: { maxJobs: 32, maxItems: 10000, maxInputBytes: 16777216 } } } });
    const host = new NativeGenerationHost({ ...seeded, ...p, providers: { 'provider.openai-compatible': createHttpGenerationProvider() },
        skillRepository: () => createSkillRepository(h.dirs.root), extensions: { settings: async () => ({ value: {} }) }, secretPort: { resolveSecret: async () => 'loopback-fixture-only' } });
    const scheduler = new NativeTaskScheduler({ retries: 0 }), executor = new NativeProjectAgentExecutor({ host, scheduler });
    const input = { runtimeRouteId: route.runtimeRouteId, maxModelRounds: 3 };
    const preflight = () => executor.preflight(h.handle, task.projectId, task.taskId, input);
    const start = async view => executor.start(h.handle, task.projectId, task.taskId, { ...input, requestId: 'controlled-fixture', expectedPreflightFingerprint: hashNativeDocument(view) });
    const finish = operation => scheduler.operations.get(operation.operationId).handle.result;
    return { ...h, ...p, ...seeded, route, host, scheduler, executor, task, seen, input, waiting, release, preflight, start, finish,
        async cleanup() { release(); for (const operation of scheduler.operations.values()) scheduler.cancel(h.handle, operation.view.operationId);
            server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.cleanup(); } };
}

const adapterSuite = process.env.ATRIA_MCP_SOURCE ? describe : describe.skip;
adapterSuite('optional cross-workspace generation adapter', () => {
    test('real MCP generation approval pins provider/budget, loss of start acknowledgement never resends, and Commit needs new approval', async () => {
        const h = await fixture(makeTempFsEngineHarness);
        try {
            const toolRoot = process.env.ATRIA_MCP_SOURCE;
            const { registerProjectActions } = await import(pathToFileURL(join(toolRoot, 'src/project-actions.js')).href);
            const { ActionRegistry, PolicyCeiling, RiskExecutor } = await import(pathToFileURL(join(toolRoot, 'src/kernel.js')).href);
            const app = express(), boot = '12345678-1234-4123-8123-123456789012';
            app.use(express.json({ limit: '4mb' })); app.use((req, res, next) => { req.user = { profile: { handle: h.handle } }; res.set('x-atria-server-boot-id', boot); next(); });
            app.use('/api/native/studio', createNativeStudioRouter(() => h, undefined, () => h.host));
            const approvals = [], writes = [];
            const response = value => ({ ok: () => value.status < 400, status: () => value.status, headers: () => value.headers,
                body: async () => Buffer.from(value.text), dispose: async () => {} });
            const browser = { config: { url: 'http://localhost', timeout: 1000, maxResponseBytes: 1048576 }, start: async () => {}, runtimeIdentity: async () => ({ mutationGuards: 1, serverBootId: boot }),
                context: { request: { get: async () => ({ ok: () => true, status: () => 200, headers: () => ({ 'content-type': 'application/json' }), body: async () => Buffer.from('{"token":"fixture"}'), dispose: async () => {} }),
                    fetch: async (url, options) => {
                        const path = new URL(url).pathname, method = options.method.toLowerCase();
                        if (path.endsWith('/generation/start')) writes.push(path);
                        const call = request(app)[method](path).set(options.headers), result = await (method === 'get' ? call : call.send(options.data));
                        if (path.endsWith('/generation/start') && result.status === 200) throw new Error('Native accepted; acknowledgement lost');
                        return response(result);
                    } } } };
            const registry = registerProjectActions(new ActionRegistry(), browser);
            const executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), { approve: async approval => { approvals.push(approval); return { action: 'accept', content: { authorize: true, uses: 1 } }; } });
            const base = { projectId: h.task.projectId, taskId: h.task.taskId, runtimeRouteId: h.route.runtimeRouteId, maxModelRounds: 3 };
            const preflight = await executor.execute('READ', { action: 'agent.project.generation.preflight', input: base });
            expect(approvals).toHaveLength(0);
            const result = await executor.execute('MUTATE', { action: 'agent.project.generation.start', input: { ...base, requestId: 'adapter-paid-fixture',
                expectedPreflightFingerprint: preflight.data.preflightFingerprint, acceptModelCharges: true } });
            expect(result.receipt.status).toBe('indeterminate'); expect(writes).toHaveLength(1); expect(approvals).toHaveLength(1);
            expect(approvals[0].before.explicitModelCharges).toBe(true);
            expect(approvals[0].before.preflight.budget.maxRequests).toBe(3);
            const operation = [...h.scheduler.operations.values()][0];
            // HTTP uses the process scheduler, so locate its managed owner operation.
            const { nativeTaskScheduler } = await import('../../src/native/task-scheduler.js');
            const accepted = operation ?? [...nativeTaskScheduler.operations.values()].find(value => value.owner === h.handle && value.view.anchor?.requestId === 'adapter-paid-fixture');
            await accepted.handle.result;
            const status = await executor.execute('READ', { action: 'agent.project.generation.status', input: { projectId: base.projectId, taskId: base.taskId, operationId: accepted.view.operationId } });
            expect(status.data.status).toBe('completed'); expect(h.seen).toHaveLength(3); expect(approvals).toHaveLength(1);
            const task = await h.agent.observeTask(h.handle, base.projectId, base.taskId);
            expect(task.status).toBe('review'); expect(task.changeSets).toHaveLength(0);
            const commit = await executor.execute('MUTATE', { action: 'agent.project.commit', input: { projectId: base.projectId, taskId: base.taskId, baseRevision: task.baseRevision,
                expectedSequence: task.sequence, expectedReviewHash: hashNativeDocument({ workspace: task.workspace, review: task.review, validation: task.validation }) } });
            expect(commit.receipt.status).toBe('succeeded'); expect(approvals).toHaveLength(2);
            expect((await h.studio.getProject(h.handle, base.projectId)).source.project.displayName).toBe('Generated proposal');
        } finally { await h.cleanup(); }
    }, 60000);
});

for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`${kind}: controlled runner performs actual model/tool work, charges original Task bank, and stops before formal Commit`, async () => {
        const h = await fixture(make);
        try {
            const view = await h.preflight(); expect(view.providerTargets[0].endpoint).toContain('127.0.0.1');
            const operation = await h.start(view); const done = await h.finish(operation);
            expect(h.seen).toHaveLength(3); expect(done.task.status).toBe('review');
            expect((await h.studio.getProject(h.handle, h.task.projectId)).source.project.displayName).not.toBe('Generated proposal');
            const stored = await h.agent.observeTask(h.handle, h.task.projectId, h.task.taskId);
            expect(stored.compute.attempts).toHaveLength(3);
            expect(stored.compute.attempts.every(value => value.status === 'settled' && value.usage.totalTokens === 30)).toBe(true);
            expect(stored.changeSets).toHaveLength(0); expect(stored.review.required).toBe(true);
            expect((await h.start(view)).operationId).toBe(operation.operationId); expect(h.seen).toHaveLength(3);
            expect(h.executor.status(h.handle, h.task.projectId, h.task.taskId, operation.operationId).status).toBe('completed');
            expect(() => h.executor.status('other-owner', h.task.projectId, h.task.taskId, operation.operationId)).toThrow('operation_not_found');
        } finally { await h.cleanup(); }
    }, 60000);
    test(`${kind}: approved configuration drift blocks execution before any provider request`, async () => {
        const h = await fixture(make);
        try {
            const view = await h.preflight();
            await h.persistence.saveConnectionProfile(h.handle, { ...h.connection, endpoint: 'https://changed.invalid/v1' });
            await expect(h.start(view)).rejects.toThrow('native_generation_preflight_conflict');
            expect(h.seen).toHaveLength(0);
            expect((await h.agent.observeTask(h.handle, h.task.projectId, h.task.taskId)).attempts).toHaveLength(0);
        } finally { await h.cleanup(); }
    });
    test(`${kind}: concurrent Native generation between context and resume is never interrupted or adopted by the approved runner`, async () => {
        const h = await fixture(make);
        try {
            const view = await h.preflight(), getContext = h.agent.getContext.bind(h.agent);
            h.agent.getContext = async (...args) => {
                const context = await getContext(...args);
                await h.agent.beginGeneration(h.handle, h.task.projectId, h.task.taskId, { expectedSequence: context.task.sequence });
                return context;
            };
            const operation = await h.start(view);
            await expect(h.finish(operation)).rejects.toThrow('project_agent_sequence_conflict');
            expect(h.seen).toHaveLength(0);
            const task = await h.agent.observeTask(h.handle, h.task.projectId, h.task.taskId);
            expect(task.attempts).toHaveLength(1); expect(task.attempts[0].status).toBe('started');
            expect(task.compute).toBeUndefined();
        } finally { await h.cleanup(); }
    });
    test(`${kind}: cancellation aborts managed model work without claiming refund or replaying the unknown send`, async () => {
        const h = await fixture(make, { hold: true });
        try {
            const view = await h.preflight(), operation = await h.start(view), completion = h.finish(operation);
            await h.waiting;
            expect(h.executor.cancel(h.handle, h.task.projectId, h.task.taskId, operation.operationId).status).toBe('cancelled');
            await expect(completion).rejects.toThrow('operation_cancelled'); h.release();
            // Cancellation is prompt; wait for the existing worker to settle its
            // original durable usage rather than starting replacement work.
            while (h.scheduler.running.size) await new Promise(resolve => setTimeout(resolve, 10));
            expect(h.seen).toHaveLength(1);
            const task = await h.agent.observeTask(h.handle, h.task.projectId, h.task.taskId);
            expect(task.compute.attempts).toHaveLength(1); expect(task.compute.attempts[0].status).toBe('unknown');
            expect((await h.start(view)).operationId).toBe(operation.operationId); expect(h.seen).toHaveLength(1);
        } finally { await h.cleanup(); }
    }, 60000);
}
