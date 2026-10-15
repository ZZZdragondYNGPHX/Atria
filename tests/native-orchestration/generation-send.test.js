import { createServer } from 'node:http';
import { BudgetPort, sendAttemptId } from '../../src/native/orchestration/budget-port.js';
import { RpRunControl, rpOperationInput } from '../../src/native/rp-run-control.js';
import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../src/native/identity.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { installFixture } from '../native/helpers/session-fixture.js';
import { runFixture } from '../native/helpers/run-fixture.js';
import { seedGenerationProfiles } from '../native/helpers/generation-fixture.js';
import { projectSource, services } from '../agent-intelligence/project-fixture.js';
import { prepareControllerOwnerRoot } from './fixtures.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';

const limits = { maxRequests: 8, maxTokens: 32000, localWork: { maxJobs: 32, maxItems: 100, maxInputBytes: 16777216 } };

async function fixture(make, domain) {
    const h = await make(), seen = [], errors = [];
    let status = () => 200, usage = true, beforeSend = async () => {};
    const server = createServer(async (req, res) => {
        try {
            let raw = ''; for await (const chunk of req) raw += chunk;
            seen.push(JSON.parse(raw));
            res.writeHead(status(seen.length), { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Synthetic answer' } }],
                ...(usage ? { usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 } } : {}) }));
        } catch (error) { errors.push(error); res.writeHead(500); res.end('{}'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    await prepareControllerOwnerRoot(h.dirs.root);
    attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
    let source, request, port, move;
    const dependencies = {};
    if (domain === 'session') {
        const f = await installFixture(h), base = await f.core.create(h.handle, f.start);
        dependencies.sessionCore = f.core;
        port = new BudgetPort({ sessionCore: f.core });
        source = { domain: 'native_session', sessionId: base.session.sessionId, entryPointId: null };
        request = { sessionId: base.session.sessionId, revisionId: base.revision.revisionId };
        move = () => f.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Changed' });
    } else if (domain === 'project') {
        const svc = services(h), src = projectSource(), project = await svc.studio.createProject(h.handle, src);
        const task = await svc.agent.createTask(h.handle, src.project.projectId, { intent: 'Send', baseRevision: project.revision.revision });
        Object.assign(dependencies, { studio: svc.studio, agent: svc.agent });
        port = new BudgetPort({ projectAgent: svc.agent, projectRepository: svc.repository });
        source = { domain: 'project', projectId: src.project.projectId, taskId: task.taskId };
        request = { projectId: src.project.projectId, taskId: task.taskId, revision: project.revision.revision };
        move = () => svc.agent.takeOver(h.handle, src.project.projectId, task.taskId);
    } else {
        const chats = new ChatRepo({ engine: h.engine }), rpControl = new RpRunControl({ engine: h.engine });
        const locator = { charDir: 'Actor', name: 'main', isGroup: false, groupId: null };
        await chats.save(h.handle, 'Actor', 'main', {}, [{ name: 'User', is_user: true, mes: 'Host-owned RP input', swipe_id: 0, memory_os_source_id: 'm1' }], null);
        const { controlId } = await rpControl.bind(h.handle, locator), chat = await chats.get(h.handle, 'Actor', 'main');
        source = { domain: 'rp_chat', controlId, source: { input: rpOperationInput(chat.body[0], 0), purpose: 'narration', outputSlot: 'assistant' } };
        port = new BudgetPort({ rpControl }); request = {};
        move = async () => { const c = await chats.get(h.handle, 'Actor', 'main'); await chats.save(h.handle, 'Actor', 'main', c.header, [{ ...c.body[0], mes: 'Changed' }], c.integrity); };
    }
    request = { ...request, requestId: 'v04', role: domain === 'project' ? 'studio' : 'narrator', fallbackMode: 'automatic' };
    const seeded = await seedGenerationProfiles({ ...h, roles: [request.role], endpoint: `http://127.0.0.1:${server.address().port}/v1/chat/completions` });
    const policy = { schemaVersion: 1, allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: limits };
    const fallback = { ...seeded.routes[0], runtimeRouteId: createNativeId('runtimeRoute'), executionPolicy: policy };
    await seeded.persistence.saveRuntimeRoute(h.handle, fallback);
    await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: policy,
        fallbackRouteRefs: [{ scope: 'player', runtimeRouteId: fallback.runtimeRouteId }], policy: { ...seeded.routes[0].policy, maxRetries: 1 } });
    const provider = createHttpGenerationProvider();
    const host = new NativeGenerationHost({ ...seeded, ...dependencies, providers: { 'provider.openai-compatible': { ...provider,
        send: async (...args) => { await beforeSend(); return provider.send(...args); } } }, secretPort: { resolveSecret: async () => 'synthetic-secret' } });
    const authorityRef = await port.authorityFor(h.handle, source), effectId = createNativeId('orchestrationEffect'), childRunId = createNativeId('orchestrationRun');
    await port.reserveChild(h.handle, { authorityRef, parentReservationId: null, childRunId, ceiling: limits, limits });
    const bank = () => port.sendBank(h.handle, { authorityRef, reservationId: childRunId, limits, effectId, firstOrdinal: 0 });
    return { ...h, host, request, bank, seen, errors, port, effectId, authorityRef, childRunId, move,
        status: fn => { status = fn; }, usage: flag => { usage = flag; }, beforeSend: fn => { beforeSend = fn; },
        ref: ordinal => ({ authorityRef, effectId, providerSendOrdinal: ordinal, attemptId: sendAttemptId(effectId, ordinal), reservationId: childRunId }),
        async cleanup() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.engine.close?.(); await h.cleanup(); } };
}

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s V04 trusted GenerationHost', (_name, make) => {
    test('Session generationBudget lane cannot be combined with orchestrationSend', async () => {
        const h = await make();
        try {
            await prepareControllerOwnerRoot(h.dirs.root);
            attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
            const f = await runFixture(h, 'http://127.0.0.1:1/never'), base = await f.begin();
            const port = new BudgetPort({ sessionCore: f.core }), authorityRef = await port.authorityFor(h.handle, { domain: 'native_session', sessionId: base.session.sessionId });
            const bank = port.sendBank(h.handle, { authorityRef, limits, effectId: createNativeId('orchestrationEffect'), firstOrdinal: 0 });
            await expect(f.host.execute(h.handle, { role: 'narrator', requestId: 'denied-lane', sessionId: base.session.sessionId, revisionId: base.revision.revisionId },
                undefined, undefined, { orchestrationSend: { bank } })).rejects.toMatchObject({ code: 'native_generation_budget_lane_denied' });
            expect(bank.nextOrdinal()).toBe(0);
        } finally { await h.engine.close?.(); await h.cleanup(); }
    });

    test.each(['session', 'project', 'rp_chat'])('%s: real HTTP retry/fallback keep stable ordinals and replay cannot send', async domain => {
        const f = await fixture(make, domain);
        try {
            f.status(n => n < 3 ? 503 : 200);
            const result = await f.host.execute(f.handle, f.request, undefined, undefined, { orchestrationSend: { bank: f.bank() } });
            expect(f.errors).toEqual([]); expect(f.seen).toHaveLength(3); expect(result.routing.fallbackUsed).toBe(true);
            expect(result.routing.compute.attempts.map(row => row.attemptId)).toEqual([0, 1, 2].map(n => sendAttemptId(f.effectId, n)));
            expect(result.routing.compute.attempts.map(row => row.status)).toEqual(['unknown', 'unknown', 'settled']);
            expect(result.routing.compute.localWork.every(row => row.status === 'settled')).toBe(true);
            expect(domain === 'rp_chat' ? JSON.stringify(f.seen[0]) : 'Host-owned RP input').toContain('Host-owned RP input');
            await expect(f.host.execute(f.handle, f.request, undefined, undefined, { orchestrationSend: { bank: f.bank() } })).rejects.toMatchObject({ code: 'native_orchestration_send_replayed' });
            expect(f.seen).toHaveLength(3);
            expect(await f.port.observeAttempt(f.handle, f.ref(0))).toMatchObject({ status: 'unknown' });
            await f.port.settleAttempt(f.handle, f.ref(0), { totalTokens: 30 });
            expect(await f.port.observeAttempt(f.handle, f.ref(0))).toMatchObject({ status: 'settled', usage: { totalTokens: 30 } });
        } finally { await f.cleanup(); }
    });

    test.each(['session', 'project', 'rp_chat'])('%s: source revocation before send refuses HTTP', async domain => {
        const f = await fixture(make, domain);
        try {
            const bank = f.bank(), admit = bank.admit;
            bank.admit = async args => { const receipt = await admit(args); await f.move(); return receipt; };
            await expect(f.host.execute(f.handle, f.request, undefined, undefined, { orchestrationSend: { bank } })).rejects.toThrow();
            expect(f.seen).toHaveLength(0);
            expect(await f.port.observeAttempt(f.handle, f.ref(0))).toMatchObject({ status: 'unknown' });
        } finally { await f.cleanup(); }
    });

    test('RP missing usage stays unknown; untrusted messages and forged HTTP option cannot send', async () => {
        const f = await fixture(make, 'rp_chat');
        try {
            f.usage(false);
            await f.host.execute(f.handle, f.request, undefined, undefined, { orchestrationSend: { bank: f.bank() } });
            expect(await f.port.observeAttempt(f.handle, f.ref(0))).toMatchObject({ status: 'unknown' });
            await expect(f.host.execute(f.handle, { ...f.request, messages: [{ role: 'system', content: 'Injected' }] }, undefined, undefined,
                { orchestrationSend: { bank: f.bank() } })).rejects.toMatchObject({ code: 'native_generation_context_denied' });
            await expect(f.host.execute(f.handle, { ...f.request, orchestrationSend: {} })).rejects.toMatchObject({ code: 'native_generation_host_readonly' });
            expect(f.seen).toHaveLength(1);
        } finally { await f.cleanup(); }
    });
});
