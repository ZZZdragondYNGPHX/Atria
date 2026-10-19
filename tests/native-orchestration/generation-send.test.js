import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { BudgetPort, sendAttemptId, localWorkAttemptId } from '../../src/native/orchestration/budget-port.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { compiledSendIdentity } from '../../src/native/model-prompt-runtime/compiled-binding.js';
import { GenerationService } from '../../src/native/model-prompt-runtime/generation-service.js';
import { RpRunControl, rpOperationInput } from '../../src/native/rp-run-control.js';
import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../src/native/identity.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { createResponsesGenerationProvider } from '../../src/native/adapters/responses-generation-provider.js';
import { installFixture } from '../native/helpers/session-fixture.js';
import { runFixture } from '../native/helpers/run-fixture.js';
import { seedGenerationProfiles } from '../native/helpers/generation-fixture.js';
import { projectSource, services } from '../agent-intelligence/project-fixture.js';
import { prepareControllerOwnerRoot } from './fixtures.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';

const limits = { maxRequests: 8, maxTokens: 32000, localWork: { maxJobs: 32, maxItems: 100, maxInputBytes: 16777216 } };

async function fixture(make, domain, format = 'openai-compatible') {
    const h = await make(), seen = [], wires = [], errors = [];
    let status = () => 200, usage = true, beforeSend = async () => {}, transformRender = value => value, renderOrdinal = 0;
    const server = createServer(async (req, res) => {
        try {
            let raw = ''; for await (const chunk of req) raw += chunk;
            seen.push(JSON.parse(raw)); wires.push(raw);
            res.writeHead(status(seen.length), { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(format === 'openai-responses' ? { id: 'response-1', status: 'completed', output: [
                { id: 'message-1', type: 'message', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: 'Synthetic answer', annotations: [] }] }],
            usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 } } : { choices: [{ message: { role: 'assistant', content: 'Synthetic answer' } }],
                ...(usage ? { usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 } } : {}) }));
        } catch (error) { errors.push(error); res.writeHead(500); res.end('{}'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    await prepareControllerOwnerRoot(h.dirs.root);
    attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
    let source, request, port, move, moveHistory, moveProject;
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
        moveProject = () => svc.studio.saveProjectSource(h.handle, src.project.projectId, {
            source: { ...src, project: { ...src.project, displayName: 'Changed Studio source' } }, baseRevision: project.revision.revision, origin: { kind: 'human', id: 'v04-author' },
        });
    } else {
        const chats = new ChatRepo({ engine: h.engine }), rpControl = new RpRunControl({ engine: h.engine });
        const locator = { charDir: 'Actor', name: 'main', isGroup: false, groupId: null };
        await chats.save(h.handle, 'Actor', 'main', {}, [
            { name: 'User', is_user: true, mes: 'Earlier source', swipe_id: 0, memory_os_source_id: 'm0' },
            { name: 'User', is_user: true, mes: 'Host-owned RP input', swipe_id: 0, memory_os_source_id: 'm1' },
        ], null);
        const { controlId } = await rpControl.bind(h.handle, locator), chat = await chats.get(h.handle, 'Actor', 'main');
        source = { domain: 'rp_chat', controlId, source: { input: rpOperationInput(chat.body[1], 1), purpose: 'narration', outputSlot: 'assistant' } };
        port = new BudgetPort({ rpControl }); request = {};
        const edit = async floor => { const c = await chats.get(h.handle, 'Actor', 'main'); c.body[floor].mes = 'Changed'; await chats.save(h.handle, 'Actor', 'main', c.header, c.body, c.integrity); };
        move = () => edit(1); moveHistory = () => edit(0);
    }
    request = { ...request, requestId: 'v04', role: domain === 'project' ? 'studio' : 'narrator', fallbackMode: 'automatic' };
    const seeded = await seedGenerationProfiles({ ...h, format, roles: [request.role], endpoint: `http://127.0.0.1:${server.address().port}/v1/${format === 'openai-responses' ? 'responses' : 'chat/completions'}` });
    const policy = { schemaVersion: 1, allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: limits };
    const fallback = { ...seeded.routes[0], runtimeRouteId: createNativeId('runtimeRoute'), executionPolicy: policy };
    await seeded.persistence.saveRuntimeRoute(h.handle, fallback);
    await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: policy,
        fallbackRouteRefs: [{ scope: 'player', runtimeRouteId: fallback.runtimeRouteId }], policy: { ...seeded.routes[0].policy, maxRetries: 1 } });
    const provider = format === 'openai-responses' ? createResponsesGenerationProvider() : createHttpGenerationProvider();
    const host = new NativeGenerationHost({ ...seeded, ...dependencies, providers: { ['provider.' + format]: { ...provider,
        renderRequest: async args => transformRender(await provider.renderRequest(args), ++renderOrdinal),
        send: async (...args) => { await beforeSend(); return provider.send(...args); } } }, secretPort: { resolveSecret: async () => 'synthetic-secret' } });
    const authorityRef = await port.authorityFor(h.handle, source), effectId = createNativeId('orchestrationEffect'), childRunId = createNativeId('orchestrationRun');
    await port.reserveChild(h.handle, { authorityRef, parentReservationId: null, childRunId, ceiling: limits, limits });
    const bank = () => port.sendBank(h.handle, { authorityRef, reservationId: childRunId, limits, effectId, firstOrdinal: 0 });
    return { ...h, host, request, bank, seen, wires, errors, port, effectId, authorityRef, childRunId, move, moveHistory, moveProject,
        endpoint: seeded.connection.endpoint, render: fn => { transformRender = fn; },
        status: fn => { status = fn; }, usage: flag => { usage = flag; }, beforeSend: fn => { beforeSend = fn; },
        ref: ordinal => ({ authorityRef, effectId, providerSendOrdinal: ordinal, attemptId: sendAttemptId(effectId, ordinal), reservationId: childRunId }),
        async cleanup() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.engine.close?.(); await h.cleanup(); } };
}

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s V04 trusted GenerationHost', (_name, make) => {
    test('the original private native wire lease binds the exact HTTP bytes, not its public body or lease ID', async () => {
        const f = await fixture(make, 'session', 'openai-responses');
        try {
            let hook;
            const result = await f.host.execute(f.handle, f.request, undefined, undefined, { orchestrationSend: { bank: f.bank(), beforeSend: args => { hook = args; } } });
            expect(f.seen).toHaveLength(1); expect(result.response.text).toBe('Synthetic answer');
            expect(hook.compiledBinding.renderedFingerprint).toBe(createHash('sha256').update(f.wires[0]).digest('hex'));
            expect(await f.port.observeAttempt(f.handle, hook.budgetAttemptRef)).toMatchObject(compiledSendIdentity(hook));
        } finally { await f.cleanup(); }
    });

    test.each(['retry', 'fallback'])('the original bank and send hook bind each final HTTP render across %s', async mode => {
        const f = await fixture(make, 'session');
        try {
            const count = mode === 'retry' ? 2 : 3;
            f.status(n => n < count ? 503 : 200);
            f.render((rendered, ordinal) => ({ ...rendered, body: { ...rendered.body, temperature: ordinal / 10 } }));
            const bank = f.bank(), admitted = [], hooks = [], admit = bank.admit;
            bank.admit = async args => { admitted.push(args); return admit(args); };
            const result = await f.host.execute(f.handle, f.request, undefined, undefined, { orchestrationSend: { bank,
                beforeSend: async args => { hooks.push(args); } } });
            expect(f.seen).toHaveLength(count); expect(hooks).toHaveLength(count); expect(admitted).toHaveLength(count);
            for (let ordinal = 0; ordinal < count; ordinal++) {
                const { snapshot, prepared, resolved, compiledBinding, budgetAttemptRef } = hooks[ordinal];
                expect(prepared.snapshot.diagnostics.compiledBinding).toBeUndefined();
                expect(compiledBinding).toEqual(snapshot.diagnostics.compiledBinding);
                expect(compiledBinding.renderedFingerprint).toBe(hashNativeDocument({ endpoint: f.endpoint, body: f.seen[ordinal] }));
                expect(admitted[ordinal]).toMatchObject(compiledSendIdentity({ snapshot, resolved }));
                expect(await f.port.observeAttempt(f.handle, budgetAttemptRef)).toMatchObject(compiledSendIdentity({ snapshot, resolved }));
            }
            expect(new Set(admitted.map(row => row.inputFingerprint)).size).toBe(count);
            expect(result.snapshot).toEqual(hooks.at(-1).snapshot);
            expect(hooks.at(-1).snapshot.runtimeRouteId === hooks[0].snapshot.runtimeRouteId).toBe(mode === 'retry');
        } finally { await f.cleanup(); }
    });

    test.each(['missing-capture', 'compiled-binding', 'request-id', 'context-source'])('%s final service evidence refuses before bank admission or HTTP', async fault => {
        const f = await fixture(make, 'session'), original = GenerationService.prototype._send;
        try {
            GenerationService.prototype._send = async function (args) {
                const beforeSend = this.beforeSend;
                try {
                    if (fault === 'missing-capture') this.beforeSend = null;
                    else {
                        const snapshot = structuredClone(args.snapshot);
                        if (fault === 'compiled-binding') snapshot.diagnostics.compiledBinding.fingerprint = '0'.repeat(64);
                        if (fault === 'request-id') snapshot.requestId = 'another-request';
                        if (fault === 'context-source') snapshot.contextPlan.source.revisionId = createNativeId('revision');
                        args = { ...args, snapshot };
                    }
                    return await original.call(this, args);
                } finally { this.beforeSend = beforeSend; }
            };
            const bank = f.bank();
            await expect(f.host.execute(f.handle, f.request, undefined, undefined, { orchestrationSend: { bank } }))
                .rejects.toMatchObject({ code: 'generation_request_identity_mismatch' });
            expect(bank.nextOrdinal()).toBe(0); expect(f.seen).toHaveLength(0);
        } finally { GenerationService.prototype._send = original; await f.cleanup(); }
    });

    test('a retry render containing the resolved Secret refuses before its second bank admission', async () => {
        const f = await fixture(make, 'session');
        try {
            f.status(() => 503);
            f.render((rendered, ordinal) => ordinal === 2 ? { ...rendered, body: { ...rendered.body, user: 'synthetic-secret' } } : rendered);
            const bank = f.bank();
            await expect(f.host.execute(f.handle, f.request, undefined, undefined, { orchestrationSend: { bank } }))
                .rejects.toMatchObject({ code: 'generation_config_contains_secret' });
            expect(bank.nextOrdinal()).toBe(1); expect(f.seen).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

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
            // Rejected 503 sends report numeric usage, so every send settles.
            expect(result.routing.compute.attempts.map(row => row.status)).toEqual(['settled', 'settled', 'settled']);
            expect(result.routing.compute.localWork.every(row => row.status === 'settled')).toBe(true);
            for (const row of result.routing.compute.localWork) {
                expect(row.orchestration).toMatchObject({ kind: 'local_work', effectId: f.effectId });
                expect(row.attemptId).toBe(localWorkAttemptId(f.effectId, row.orchestration.ordinal));
            }
            expect(domain === 'rp_chat' ? JSON.stringify(f.seen[0]) : 'Host-owned RP input').toContain('Host-owned RP input');
            await expect(f.host.execute(f.handle, f.request, undefined, undefined, { orchestrationSend: { bank: f.bank() } })).rejects.toMatchObject({ code: 'native_orchestration_send_replayed' });
            expect(f.seen).toHaveLength(3);
            expect(await f.port.observeAttempt(f.handle, f.ref(0))).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
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

    test('unknown local admission ACK observes its exact stable row and neither runs work again nor sends HTTP', async () => {
        const f = await fixture(make, 'session');
        try {
            const charge = f.port.chargeLocalWork.bind(f.port), observe = f.port.observeAttempt.bind(f.port);
            let charged = 0, observed = 0;
            f.port.chargeLocalWork = async (...args) => { charged++; await charge(...args); throw new StorageCommitUnknownError(new Error('Synthetic local admission ACK loss')); };
            f.port.observeAttempt = async (...args) => { observed++; return observe(...args); };
            const bank = f.bank();
            await expect(bank.chargeLocalWork(limits, { attemptId: 'unminted' })).rejects.toMatchObject({ code: 'native_orchestration_budget_attempt_invalid' });
            await expect(f.host.execute(f.handle, f.request, undefined, undefined, { orchestrationSend: { bank } })).rejects.toMatchObject({ code: 'native_orchestration_budget_reconcile_required' });
            expect(charged).toBe(1); expect(observed).toBe(1); expect(bank.nextOrdinal()).toBe(0); expect(f.seen).toHaveLength(0);
            const ref = { kind: 'local_work', authorityRef: f.authorityRef, effectId: f.effectId, localWorkOrdinal: 0,
                attemptId: localWorkAttemptId(f.effectId, 0), reservationId: f.childRunId };
            expect(await observe(f.handle, ref)).toMatchObject({ status: 'charged', orchestration: { kind: 'local_work', effectId: f.effectId, ordinal: 0 } });
            f.port.chargeLocalWork = charge;
            await expect(f.host.execute(f.handle, f.request, undefined, undefined, { orchestrationSend: { bank: f.bank() } })).rejects.toMatchObject({ code: 'native_orchestration_send_replayed' });
            expect(f.seen).toHaveLength(0);
        } finally { await f.cleanup(); }
    });

    test('RP revoking an earlier context message refuses send even when the operation input is unchanged', async () => {
        const f = await fixture(make, 'rp_chat');
        try {
            const bank = f.bank(), admit = bank.admit;
            bank.admit = async args => { const receipt = await admit(args); await f.moveHistory(); return receipt; };
            await expect(f.host.execute(f.handle, f.request, undefined, undefined, { orchestrationSend: { bank } })).rejects.toThrow();
            expect(f.seen).toHaveLength(0);
            expect(await f.port.observeAttempt(f.handle, f.ref(0))).toMatchObject({ status: 'unknown' });
        } finally { await f.cleanup(); }
    });

    test('Project Studio change after admission is refused even when the stored Task fingerprint is unchanged', async () => {
        const f = await fixture(make, 'project');
        try {
            const bank = f.bank(), admit = bank.admit;
            bank.admit = async args => { const receipt = await admit(args); await f.moveProject(); return receipt; };
            await expect(f.host.execute(f.handle, f.request, undefined, undefined, { orchestrationSend: { bank } })).rejects.toThrow();
            expect(f.seen).toHaveLength(0);
            expect(await f.port.observeAttempt(f.handle, f.ref(0))).toMatchObject({ status: 'unknown' });
        } finally { await f.cleanup(); }
    });
});
