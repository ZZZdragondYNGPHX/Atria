import { expect, test } from '@jest/globals';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import express from 'express';
import supertest from 'supertest';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { projectSource, services } from '../agent-intelligence/project-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { createSkillRepository } from '../../src/skills/repository.js';
import { GoalContinuationService } from '../../src/native/agent-intelligence/goal-continuation.js';
import { NativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';

async function fixture(make, { invariants = () => [], scheduler = new NativeTaskScheduler(), onRequest = async () => {}, failProvider = false } = {}) {
    const h = await make(), seen = [];
    const server = createServer(async (req, res) => {
        let raw = ''; for await (const part of req) raw += part; seen.push(JSON.parse(raw));
        await onRequest();
        res.setHeader('Content-Type', 'application/json');
        if (failProvider) { res.writeHead(503); res.end(JSON.stringify({ error: 'loopback unavailable' })); return; }
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Still waiting for the desired Project outcome.' } }],
            usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 } }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const p = services(h), source = projectSource(), project = await p.studio.createProject(h.handle, source);
    const intent = 'Reach the desired Project outcome', task = await p.agent.createTask(h.handle, source.project.projectId, { intent, baseRevision: project.revision.revision });
    const seeded = await seedGenerationProfiles({ ...h, roles: ['studio'], endpoint: `http://127.0.0.1:${server.address().port}/v1/chat/completions` });
    const limits = { maxRequests: 2, maxTokens: 64000, localWork: { maxJobs: 32, maxItems: 1000, maxInputBytes: 16777216 } };
    await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: { schemaVersion: 1,
        allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: { ...limits, maxRequests: 32 } } });
    const repo = createSkillRepository(h.dirs.root), host = new NativeGenerationHost({ ...seeded, ...p,
        providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, skillRepository: () => repo,
        extensions: { settings: async () => ({ value: {} }) }, secretPort: { resolveSecret: async () => 'loopback-only' } });
    const service = new GoalContinuationService({ host, scheduler });
    const goal = await service.goals.create(h.handle, { subject: { kind: 'user', actorId: null }, scope: { domain: 'project', projectId: source.project.projectId }, intent,
        criteria: [{ criterionId: 'name', description: 'Actual Project field', selector: { kind: 'project_field', path: ['project', 'displayName'] }, path: ['fieldValue'], equals: 'Desired name' }], invariants: invariants(task), budget: limits });
    const bound = await service.bind(h.handle, { goalId: goal.goalId, expectedSequence: 0, taskId: task.taskId });
    return { ...h, ...p, ...seeded, host, scheduler, service, goal: bound, task, seen,
        async cleanup() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.cleanup(); } };
}

for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`S14 ${kind} Project continuation consumes Goal criteria as user data; formal Commit completes across wakes`, async () => {
        const h = await fixture(make);
        try {
            const first = await h.service.wake(h.handle, { goalId: h.goal.goalId, eventId: 'start-work' });
            await first.completion;
            const userMessages = h.seen[0].messages.filter(message => message.role === 'user');
            expect(JSON.stringify(userMessages)).toContain('Persistent user goals (data)');
            expect(JSON.stringify(h.seen[0].messages.filter(message => message.role === 'system'))).not.toContain(h.goal.goalId);
            const current = await h.studio.getProject(h.handle, h.goal.scope.projectId);
            const source = structuredClone(current.source); source.project.displayName = 'Desired name';
            await h.agent.setPlan(h.handle, h.goal.scope.projectId, h.task.taskId, { summary: 'Formal rename', steps: [{ id: 'rename', title: 'Rename', impact: 'low' }] });
            await h.agent.executeTool(h.handle, h.goal.scope.projectId, h.task.taskId, { name: 'atri_agent_project_save', args: { source, stepId: 'rename' } });
            await h.agent.prepareReview(h.handle, h.goal.scope.projectId, h.task.taskId);
            expect((await h.service.goals.get(h.handle, { goalId: h.goal.goalId })).status).toBe('waiting');
            await h.agent.commit(h.handle, h.goal.scope.projectId, h.task.taskId);
            const complete = await h.service.wake(h.handle, { goalId: h.goal.goalId, eventId: 'formal-commit' });
            expect(complete.status).toBe('completed'); expect(h.seen).toHaveLength(1);
            const last = await h.agent.getTask(h.handle, h.goal.scope.projectId, h.task.taskId);
            expect(last.compute.attempts).toHaveLength(1); expect(last.compute.attempts[0].usage.totalTokens).toBe(20);
        } finally { await h.cleanup(); }
    }, 60000);
    test(`S13 ${kind} concurrent schedulers cannot claim the same durable wake twice`, async () => {
        const h = await fixture(make);
        try {
            await h.agent.queueGoalWake(h.handle, h.goal.scope.projectId, h.task.taskId, h.goal.goalId, 'same-event');
            const other = new GoalContinuationService({ host: h.host, scheduler: new NativeTaskScheduler() });
            const outcomes = await Promise.allSettled([h.service, other].map(service => service.pump(h.handle, { goalId: h.goal.goalId })
                .then(async result => { if (result.completion) await result.completion; return result; })));
            expect(outcomes.some(row => row.status === 'fulfilled')).toBe(true);
            expect(h.seen).toHaveLength(1);
            const task = await h.agent.getTask(h.handle, h.goal.scope.projectId, h.task.taskId);
            expect(task.compute.attempts).toHaveLength(1);
            expect(task.goalBinding.wakes).toHaveLength(1);
            expect(task.goalBinding.wakes[0].status).toBe('done');
        } finally { await h.cleanup(); }
    }, 60000);

    test(`S13 ${kind} independent Node preserves a claimed wake and original bank without resending`, async () => {
        const h = await fixture(make);
        try {
            await h.agent.queueGoalWake(h.handle, h.goal.scope.projectId, h.task.taskId, h.goal.goalId, 'interrupted-event');
            await h.agent.claimGoalWake(h.handle, h.goal.scope.projectId, h.task.taskId, h.goal.goalId, 'interrupted-event', 'old-operation');
            const original = await h.agent.getTask(h.handle, h.goal.scope.projectId, h.task.taskId);
            const child = `import './tests/util/config.js';
                import { FsEngine } from './src/storage/engines/fs-engine.js';
                import { SqliteEngine } from './src/storage/engines/sqlite-engine.js';
                import { services } from './tests/agent-intelligence/project-fixture.js';
                import { GoalContinuationService } from './src/native/agent-intelligence/goal-continuation.js';
                const input = JSON.parse(process.env.ATRIA_GOAL_COLD);
                const engine = new (input.kind === 'fs' ? FsEngine : SqliteEngine)({ directoriesByHandle: () => input.dirs });
                try {
                    const host = { persistence: { _engine: engine }, ...services({ engine, dirs: input.dirs }) };
                    const service = new GoalContinuationService({ host });
                    const result = await service.pump(input.handle, { goalId: input.goalId });
                    console.log(JSON.stringify({ continuation: result.continuation, task: result.task }));
                } finally { await engine.close(); }`;
            const cold = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', child], {
                cwd: new URL('../../', import.meta.url), encoding: 'utf8', env: { ...process.env, ATRIA_GOAL_COLD: JSON.stringify({ kind, dirs: h.dirs, handle: h.handle, goalId: h.goal.goalId }) },
            }).trim());
            expect(cold.continuation).toBe('unknown');
            expect(cold.task.goalBinding).toEqual(original.goalBinding);
            expect(cold.task.compute.limits).toEqual(original.compute.limits);
            expect(cold.task.compute.attempts).toEqual(original.compute.attempts);
            expect(h.seen).toHaveLength(0);
        } finally { await h.cleanup(); }
    }, 60000);

    test(`S13 ${kind} HTTP acknowledgement observes background failure and never retries its unknown wake`, async () => {
        const h = await fixture(make, { failProvider: true });
        const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
        app.use(createNativeGenerationRouter(() => h.host, () => null));
        const apiServer = app.listen(0, '127.0.0.1');
        try {
            const ack = await supertest(apiServer).post('/goals/wake').send({ goalId: h.goal.goalId, eventId: 'failed-event' });
            expect(ack.status).toBe(200); expect(typeof ack.body.operationId).toBe('string');
            while (h.service.scheduler.running.size) await new Promise(resolve => setTimeout(resolve, 5));
            // The HTTP router uses the shared scheduler, inspect durable authority instead.
            let state;
            for (let count = 0; count < 400; count++) {
                state = await h.service.inspect(h.handle, { goalId: h.goal.goalId });
                if (state.wakes[0]?.status === 'unknown') break;
                await new Promise(resolve => setTimeout(resolve, 5));
            }
            expect(state.wakes[0].status).toBe('unknown');
            // Unknown Provider outcomes retain one charged attempt without automatic resend.
            // Pumping the durable unknown wake must not start another Host request.
            expect(state.compute.attempts).toHaveLength(1);
            expect(state.compute.attempts.every(row => row.status === 'unknown')).toBe(true);
            await supertest(apiServer).post('/goals/pump').send({ goalId: h.goal.goalId }).expect(200);
            expect(h.seen).toHaveLength(1);
            expect(state.goal.status).toBe('waiting');
        } finally { apiServer.closeAllConnections(); await new Promise(resolve => apiServer.close(resolve)); await h.cleanup(); }
    }, 60000);

    test(`S13 ${kind} pause aborts original in-flight Task and keeps the charged cost`, async () => {
        let entered, release;
        const received = new Promise(resolve => { entered = resolve; });
        const hold = new Promise(resolve => { release = resolve; });
        const h = await fixture(make, { onRequest: async () => { entered(); await hold; } });
        try {
            const running = await h.service.wake(h.handle, { goalId: h.goal.goalId, eventId: 'pause-event' });
            await received;
            const goal = await h.service.goals.get(h.handle, { goalId: h.goal.goalId });
            await h.service.control(h.handle, { goalId: goal.goalId, expectedSequence: goal.sequence, action: 'pause' });
            await expect(running.completion).rejects.toMatchObject({ code: 'operation_cancelled' });
            release();
            while (h.scheduler.running.size) await new Promise(resolve => setTimeout(resolve, 5));
            const task = await h.agent.getTask(h.handle, h.goal.scope.projectId, h.task.taskId);
            expect(h.seen).toHaveLength(1);
            expect(task.compute.attempts).toHaveLength(1);
            expect(task.compute.attempts[0].status).toBe('unknown');
            expect(task.compute.attempts[0].estimatedTokens).toBeGreaterThan(0);
            expect(task.compute.attempts[0].usage).toBeNull();
            expect(task.goalBinding.wakes[0].status).toBe('cancelled');
            expect((await h.service.goals.get(h.handle, { goalId: goal.goalId })).status).toBe('paused');
        } finally { release?.(); await h.cleanup(); }
    }, 60000);

    test(`S13 ${kind} queued Task source mutation revalidates the invariant before any model send`, async () => {
        const scheduler = new NativeTaskScheduler({ concurrency: 1 });
        const h = await fixture(make, { scheduler, invariants: task => [{ criterionId: 'state', description: 'Frozen Task state',
            selector: { kind: 'task', taskId: task.taskId }, path: ['status'], equals: 'planning' }] });
        let release;
        const blocker = scheduler.submit({ owner: h.handle, anchor: {}, kind: 'auxiliary_task', executionClass: 'background', resources: [],
            key: 'blocker', fingerprint: 'blocker', fresh: async () => true, run: () => new Promise(resolve => { release = resolve; }), finalize: async value => value });
        try {
            while (!release) await new Promise(resolve => setTimeout(resolve, 1));
            const queued = await h.service.wake(h.handle, { goalId: h.goal.goalId, eventId: 'queued-source' });
            await h.agent.setPlan(h.handle, h.goal.scope.projectId, h.task.taskId, { summary: 'Source state changed', steps: [{ id: 'one', title: 'New plan', impact: 'low' }] });
            release(null); await blocker.result;
            await expect(queued.completion).rejects.toMatchObject({ code: 'operation_stale' });
            expect(h.seen).toHaveLength(0);
            const goal = await h.service.goals.get(h.handle, { goalId: h.goal.goalId });
            expect(goal.status).toBe('blocked'); expect(goal.blockers.some(row => row.code === 'goal_invariants_unmet')).toBe(true);
            expect((await h.agent.getTask(h.handle, h.goal.scope.projectId, h.task.taskId)).compute.localWork.every(row => row.kind === 'goal_validate')).toBe(true);
        } finally { release?.(null); await h.cleanup(); }
    }, 60000);

    test(`S13 ${kind} original Studio loop shares one Task bank; repeated wake and restore never reset it`, async () => {
        const h = await fixture(make);
        try {
            const first = await h.service.wake(h.handle, { goalId: h.goal.goalId, eventId: 'user-event-1' });
            await first.completion;
            expect(h.seen).toHaveLength(1);
            const before = await h.agent.getTask(h.handle, h.goal.scope.projectId, h.task.taskId);
            expect(before.compute.limits.maxRequests).toBe(2);
            expect(before.compute.attempts).toHaveLength(1);
            expect(before.goalBinding.wakes[0].status).toBe('done');
            const restored = new GoalContinuationService({ host: h.host, scheduler: new NativeTaskScheduler() });
            await restored.wake(h.handle, { goalId: h.goal.goalId, eventId: 'user-event-1' });
            expect(h.seen).toHaveLength(1);
            const second = await restored.wake(h.handle, { goalId: h.goal.goalId, eventId: 'user-event-2' });
            await second.completion;
            expect(h.seen).toHaveLength(2);
            const last = await h.agent.getTask(h.handle, h.goal.scope.projectId, h.task.taskId);
            expect(last.compute.attempts).toHaveLength(2);
            expect(last.compute.attempts.map(row => row.usage.totalTokens)).toEqual([20, 20]);
            expect(last.compute.localWork.some(row => row.kind === 'goal_validate' && row.status === 'unknown')).toBe(true);
            expect(last.compute.limits.maxRequests).toBe(2);
            const third = await restored.wake(h.handle, { goalId: h.goal.goalId, eventId: 'user-event-3' });
            await expect(third.completion).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
            expect(h.seen).toHaveLength(2);
            expect((await h.agent.getTask(h.handle, h.goal.scope.projectId, h.task.taskId)).compute.attempts).toHaveLength(2);
        } finally { await h.cleanup(); }
    }, 60000);
}
