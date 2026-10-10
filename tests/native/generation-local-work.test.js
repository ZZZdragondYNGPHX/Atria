import { expect, test, jest } from '@jest/globals';
import { createServer } from 'node:http';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { projectSource, services as projectServices } from '../agent-intelligence/project-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { RunControl } from '../../src/native/run-control.js';
import { SessionRepo } from '../../src/native/repositories/session-repo.js';
import { snapshotUser, restoreFromSnapshot } from '../../src/storage/migration/backup.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';

const limits = { maxRequests: 4, maxTokens: 64000, localWork: { maxJobs: 2, maxItems: 2, maxInputBytes: 1048576 } };
async function fixture(make, lane, budget = limits) {
    const h = await make(), seen = []; let status = () => 200;
    const server = createServer(async (req, res) => {
        let raw = ''; for await (const part of req) raw += part; seen.push(JSON.parse(raw));
        res.writeHead(status(seen.length), { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Fresh bounded answer.' } }], usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 } }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const installed = await installFixture(h), base = await installed.core.create(h.handle, installed.start);
    const { studio, agent } = projectServices(h), source = projectSource(), project = await studio.createProject(h.handle, source);
    const task = await agent.createTask(h.handle, source.project.projectId, { intent: 'Read this project', baseRevision: project.revision.revision });
    const role = lane === 'session' ? 'narrator' : 'studio';
    const seeded = await seedGenerationProfiles({ ...h, roles: [role], endpoint: `http://127.0.0.1:${server.address().port}/v1/chat/completions` });
    await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: budget } });
    let transform = value => value;
    const newHost = () => new NativeGenerationHost({ ...seeded, sessionCore: installed.core, studio, agent,
        providers: { 'provider.openai-compatible': transform(createHttpGenerationProvider()) }, secretPort: { resolveSecret: async () => 'local-fixture-secret' } });
    const request = { role, requestId: 'local-first', ...(lane === 'session' ? { sessionId: base.session.sessionId, revisionId: base.revision.revisionId }
        : { projectId: source.project.projectId, taskId: task.taskId, revision: project.revision.revision }) };
    const ledger = async () => lane === 'session' ? Object.values((await installed.core.runs.status(h.handle, request.sessionId))?.operations ?? {}).find(row => row.compute)?.compute
        : (await agent.getTask(h.handle, request.projectId, task.taskId)).compute;
    return { ...h, ...seeded, core: installed.core, studio, agent, base, request, seen, newHost, ledger, transform: value => { transform = value; }, status: value => { status = value; },
        async cleanup() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.cleanup(); } };
}
for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test.each(['session', 'project'])(`G05 lowering ${kind} %s old unbounded failed count does not create a local ledger or mutate its owner`, async lane => {
        const f = await fixture(make, lane, { maxRequests: 4, maxTokens: 64000 });
        try {
            const before = lane === 'session' ? await f.core.runs.status(f.handle, f.request.sessionId) : await f.agent.getTask(f.handle, f.request.projectId, f.request.taskId);
            f.transform(provider => ({ ...provider, countTokens: () => { throw new Error('Synthetic old count failure'); } }));
            await expect(f.newHost().execute(f.handle, f.request)).rejects.toThrow();
            const after = lane === 'session' ? await f.core.runs.status(f.handle, f.request.sessionId) : await f.agent.getTask(f.handle, f.request.projectId, f.request.taskId);
            expect(after).toEqual(before); expect(await f.ledger()).toBeUndefined(); expect(f.seen).toEqual([]);
        } finally { await f.cleanup(); }
    });
    test.each(['session', 'project'])(`G05 lowering ${kind} %s actual count/render share original budget through recovery`, async lane => {
        const f = await fixture(make, lane);
        try {
            const result = await f.newHost().execute(f.handle, f.request);
            const ledger = await f.ledger();
            expect(ledger.localWork?.map(row => row.kind)).toEqual(['generation_count', 'generation_render']);
            expect(ledger.localWork.map(row => row.usage.outcome)).toEqual(['completed', 'completed']); expect(ledger.attempts).toHaveLength(1);
            expect(result.routing.compute.localWork).toEqual(ledger.localWork); expect(f.seen).toHaveLength(1);
            await f.persistence.saveRuntimeRoute(f.handle, { ...f.routes[0], executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [f.model.modelProfileId] } });
            const backupPath = await snapshotUser({ handle: f.handle, userRoot: f.dirs.root, backupRoot: f.backupRoot, engine: f.engine });
            await restoreFromSnapshot({ handle: f.handle, userRoot: f.dirs.root, backupPath, engine: f.engine }); await f.engine.close();
            f.core.runs = new RunControl(new SessionRepo({ engine: f.engine }));
            await expect(f.newHost().execute(f.handle, { ...f.request, requestId: 'local-next' })).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
            expect(await f.ledger()).toEqual(ledger); expect(f.seen).toHaveLength(1);
        } finally { await f.cleanup(); }
    });
}
test.each(['session', 'project'])('G05 lowering %s concurrent preparations cannot double spend original local quota', async lane => {
    const f = await fixture(makeTempFsEngineHarness, lane);
    try {
        const replies = await Promise.allSettled([1, 2].map(n => f.newHost().execute(f.handle, { ...f.request, requestId: 'concurrent-' + n })));
        const ledger = await f.ledger(); expect(ledger.localWork).toHaveLength(2);
        expect(replies.filter(row => row.status === 'fulfilled').length).toBeLessThanOrEqual(1); expect(f.seen.length).toBeLessThanOrEqual(1);
        expect(ledger.attempts).toHaveLength(f.seen.length); expect(ledger.localWork.every(row => row.status === 'settled')).toBe(true);
    } finally { await f.cleanup(); }
});
test.each(['count_failure', 'render_failure', 'cancel', 'head_change', 'task_change'])('G05 lowering %s retains work and refuses stale or failed preparation before HTTP', async scenario => {
    const lane = scenario === 'task_change' ? 'project' : 'session', f = await fixture(makeTempFsEngineHarness, lane), controller = new AbortController();
    let calls = 0;
    try {
        f.transform(provider => ({ ...provider,
            countTokens: async request => {
                calls++;
                if (scenario === 'count_failure') throw new Error('Synthetic tokenizer failure');
                const count = await provider.countTokens(request);
                if (scenario === 'cancel') controller.abort();
                if (scenario === 'head_change') await f.core.appendTimeline(f.handle, f.request.sessionId, { role: 'user', content: 'Changed while counting' });
                if (scenario === 'task_change') await f.agent.setPlan(f.handle, f.request.projectId, f.request.taskId, { summary: 'Changed plan', steps: [{ id: 'read', title: 'Read', impact: 'low' }] });
                return count;
            }, renderRequest: request => { calls++; if (scenario === 'render_failure') throw new Error('Synthetic lowering failure'); return provider.renderRequest(request); },
        }));
        await expect(f.newHost().execute(f.handle, f.request, controller.signal)).rejects.toThrow();
        // The scheduler exposes cancellation while its admitted worker finishes.
        // Observe the same worker's settlement, without inventing a new attempt.
        let ledger;
        for (let n = 0; n < 20; n++) {
            ledger = scenario === 'head_change' ? (await f.core.runs.status(f.handle, f.request.sessionId)).retiredCompute : await f.ledger();
            if (ledger?.localFailedJobs || ledger?.localWork?.every(row => row.status === 'settled')) break;
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        const observed = scenario === 'head_change' ? { jobs: ledger.localJobs, outcome: ledger.localFailedJobs ? 'failed' : 'unknown' }
            : { jobs: ledger.localWork.length, outcome: ledger.localWork.at(-1).usage.outcome };
        expect(observed).toEqual({ jobs: scenario === 'render_failure' ? 2 : 1, outcome: scenario === 'cancel' ? 'cancelled' : 'failed' });
        expect(calls).toBe(scenario === 'render_failure' ? 2 : 1); expect(f.seen).toEqual([]);
    } finally { await f.cleanup(); }
});
test('G05 lowering insufficient public input bytes denies before adapter work', async () => {
    const f = await fixture(makeTempFsEngineHarness, 'session', { ...limits, localWork: { ...limits.localWork, maxInputBytes: 1 } }), count = jest.fn();
    try {
        f.transform(provider => ({ ...provider, countTokens: count }));
        await expect(f.newHost().execute(f.handle, f.request)).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
        expect(count).not.toHaveBeenCalled(); expect(await f.ledger()).toBeUndefined(); expect(f.seen).toEqual([]);
    } finally { await f.cleanup(); }
});
test('G05 lowering readonly preview leaves original ledger empty while actual execution refuses before adapter work', async () => {
    const f = await fixture(makeTempFsEngineHarness, 'session'); let count = 0;
    try {
        f.transform(provider => ({ ...provider, countTokens: request => { count++; return provider.countTokens(request); } })); setReadOnly(true);
        const preview = await f.newHost().execute(f.handle, f.request, undefined, undefined, { preview: true });
        expect(preview.preview).toBe(true); expect(count).toBe(1); expect(await f.ledger()).toBeUndefined(); expect(f.seen).toEqual([]);
        await expect(f.newHost().execute(f.handle, f.request)).rejects.toThrow(); expect(count).toBe(1); expect(await f.ledger()).toBeUndefined();
    } finally { setReadOnly(false); await f.cleanup(); }
});
test.each([2, 3])('G05 lowering retry shares %i jobs and retains unknown first send without hiding render work', async maxJobs => {
    const f = await fixture(makeTempFsEngineHarness, 'session', { ...limits, localWork: { ...limits.localWork, maxJobs, maxItems: maxJobs } });
    try {
        f.status(round => round === 1 ? 503 : 200);
        await f.persistence.saveRuntimeRoute(f.handle, { ...await f.persistence.getRuntimeRoute(f.handle, f.routes[0].runtimeRouteId), policy: { ...f.routes[0].policy, maxRetries: 1 } });
        const result = await f.newHost().execute(f.handle, f.request).then(value => ({ value }), error => ({ error }));
        const ledger = await f.ledger(); expect(ledger.localWork.map(row => row.kind)).toEqual(['generation_count', 'generation_render', ...maxJobs === 3 ? ['generation_render'] : []]);
        expect(ledger.attempts.map(row => row.status)).toEqual(['unknown', ...maxJobs === 3 ? ['settled'] : []]); expect(f.seen).toHaveLength(maxJobs === 3 ? 2 : 1);
        expect(result.error?.code ?? null).toBe(maxJobs === 2 ? 'native_generation_budget_exhausted' : null);
    } finally { await f.cleanup(); }
});
test.each(['session', 'project'])('G05 lowering %s changed after settlement keeps completed cost and never sends', async lane => {
    const f = await fixture(makeTempFsEngineHarness, lane); let jobs = 0;
    const owner = lane === 'session' ? f.core.runs : f.agent, original = owner.settleLocalWork.bind(owner);
    const spy = jest.spyOn(owner, 'settleLocalWork').mockImplementation(async (...args) => {
        const result = await original(...args);
        if (++jobs === 2) {
            if (lane === 'session') await f.core.appendTimeline(f.handle, f.request.sessionId, { role: 'user', content: 'Changed during lowering settlement' });
            else await f.agent.setPlan(f.handle, f.request.projectId, f.request.taskId, { summary: 'Changed after lowering', steps: [{ id: 'read', title: 'Read', impact: 'low' }] });
        }
        return result;
    });
    try {
        await expect(f.newHost().execute(f.handle, f.request)).rejects.toThrow();
        const cost = lane === 'session' ? (await f.core.runs.status(f.handle, f.request.sessionId)).retiredCompute : await f.ledger();
        const completed = lane === 'session' ? cost.localCompletedJobs : cost.localWork.filter(row => row.usage.outcome === 'completed').length;
        expect(completed).toBe(2); expect(f.seen).toEqual([]);
    } finally { spy.mockRestore(); await f.cleanup(); }
});
