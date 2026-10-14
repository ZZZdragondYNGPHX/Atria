import { afterEach, describe, expect, jest, test } from '@jest/globals';
import http from 'node:http';
import express from 'express';
import request from 'supertest';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { authorityTurnFixture } from './helpers/authority-turn-fixture.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { createNativeSessionRouter } from '../../src/endpoints/native-session.js';
import { CredentialTargetAuthority } from '../../src/native/model-prompt-runtime/credential-targets.js';
import { registerVisualWake } from '../../src/native/visual-events.js';
import { nativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const cleanup = [];
const exec = promisify(execFile);
afterEach(async () => { jest.restoreAllMocks(); for (const fn of cleanup.splice(0)) await fn(); });
async function fixture(make = makeTempFsEngineHarness) {
    const h = await make(); cleanup.push(h.cleanup); const sends = [];
    let response = body => body.tools?.length ? { content: '', tool_calls: [{ id: 'call', type: 'function', function: { name: body.tools[0].function.name,
        arguments: JSON.stringify(f.selection.input) } }] } : { content: 'Controlled Native narrative.' };
    const server = http.createServer(async (req, res) => {
        try { const chunks = []; for await (const bytes of req) chunks.push(bytes); const body = JSON.parse(Buffer.concat(chunks)); sends.push(body);
            const message = await response(body); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message }] })); }
        catch { res.writeHead(503); res.end('{}'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    cleanup.unshift(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    const f = await authorityTurnFixture(h, `http://127.0.0.1:${server.address().port}/v1/chat/completions`);
    const authority = new CredentialTargetAuthority({ persistence: f.seeded.persistence });
    const view = await authority.inspect(h.handle, { connectionProfileId: f.seeded.connection.connectionProfileId });
    await authority.authorize(h.handle, { connectionProfileId: view.connectionProfileId, expectedFingerprint: view.connectionFingerprint,
        expectedTargetFingerprint: view.targetFingerprint, expectedPermitFingerprint: view.permitFingerprint, allowLocal: true });
    const boot = randomUUID(), app = express(); app.use(express.json()); app.use((req, res, next) => { req.user = { profile: { handle: h.handle } }; res.set('x-atria-server-boot-id', boot); next(); });
    app.use('/generation', createNativeGenerationRouter(() => f.host, () => null));
    app.use('/session', createNativeSessionRouter(() => ({ core: f.core, sessionRepo: f.sessionRepo })));
    const input = { sessionId: f.base.session.sessionId, expectedRevisionId: f.base.revision.revisionId,
        commitId: 'reviewed-user-input', invocationId: 'reviewed-turn', userInput: 'Update the note.', slotBindings: {} };
    const resolveSecret = f.host.secretPort.resolveSecret, secrets = jest.fn((...args) => resolveSecret(...args)); f.host.secretPort = { resolveSecret: secrets };
    const simulation = jest.spyOn(f.host, 'queueSimulation');
    const wake = jest.fn(async () => {}); registerVisualWake(h.engine, wake);
    const review = async () => (await request(app).post('/generation/turn/controlled/preflight').send(input).expect(200)).body;
    const append = async () => (await request(app).post('/session/timeline/append').send({ sessionId: input.sessionId,
        expectedRevisionId: input.expectedRevisionId, commitId: input.commitId, draft: { role: 'user', content: input.userInput } }).expect(200)).body;
    const envelope = (review, committed) => ({ input, committedRevisionId: committed.revision.revisionId,
        approvedReview: Object.fromEntries(['turnInputFingerprint', 'configurationFingerprint', 'requestFingerprint'].map(key => [key, review[key]])) });
    return { ...h, ...f, app, boot, input, sends, secrets, simulation, wake, review, append, envelope, setResponse: value => { response = value; } };
}

for (const [kind, make] of [['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]]) test(`${kind}: pure Turn review, exact parent commit and controlled Native runner retain formal output without background work`, async () => {
    const f = await fixture(make), writes = jest.spyOn(f.core._sessions, 'commitSnapshot');
    const observation = await f.review();
    expect(writes).not.toHaveBeenCalled(); expect(f.secrets).not.toHaveBeenCalled(); expect(f.sends).toEqual([]); expect(f.wake).not.toHaveBeenCalled();
    expect(observation.configuration.selectedRouteIds).toHaveLength(2); expect(observation.configuration.credentialTargets[0].authorized).toBe(true);
    const committed = await f.append(); expect(f.wake).not.toHaveBeenCalled();
    const liveLoad = f.core.load.bind(f.core), unsafeLoads = [];
    jest.spyOn(f.core, 'load').mockImplementation((handle, id, options) => { if (!options?.skipPackageEdits) unsafeLoads.push(options); return liveLoad(handle, id, options); });
    const queued = await request(f.app).post('/generation/turn/controlled/start').send(f.envelope(observation, committed)).expect(202);
    const operation = nativeTaskScheduler.operations.get(queued.body.operationId); await operation.handle.result;
    const result = await f.core.observe(f.handle, f.input.sessionId);
    expect(result.timeline.at(-1).content).toBe('Controlled Native narrative.'); expect(f.sends).toHaveLength(2);
    expect(f.simulation).not.toHaveBeenCalled(); expect(f.wake).not.toHaveBeenCalled(); expect(unsafeLoads).toEqual([]);
    expect(result.states.atri_action_receipts.receipts).toHaveLength(1);
}, 30000);

test('changed configuration after input append or missing/mismatched commit receipt rejects before Secret and Provider send', async () => {
    const f = await fixture(), view = await f.review(), committed = await f.append();
    const body = f.envelope(view, committed);
    await request(f.app).post('/generation/turn/controlled/start').send({ ...body, input: { ...body.input, commitId: 'other-commit' },
        approvedReview: { ...body.approvedReview, turnInputFingerprint: hash({ ...body.input, commitId: 'other-commit' }) } }).expect(409);
    await f.seeded.persistence.saveModelProfile(f.handle, { ...f.seeded.model, displayName: 'Changed after approval' });
    await request(f.app).post('/generation/turn/controlled/start').send(body).expect(409);
    expect(f.secrets).not.toHaveBeenCalled(); expect(f.sends).toEqual([]); expect(f.simulation).not.toHaveBeenCalled();
    expect((await f.core.observe(f.handle, f.input.sessionId)).revision.revisionId).toBe(committed.revision.revisionId);
});

test('unknown Provider outcomes cannot resend even when the original Route allows three retries', async () => {
    const f = await fixture();
    await f.seeded.persistence.saveRuntimeRoute(f.handle, { ...f.seeded.routes[1], policy: { ...f.seeded.routes[1].policy, maxRetries: 3 },
        executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [f.seeded.model.modelProfileId], computeBudget: { maxRequests: 3, maxTokens: 100000 } } });
    const review = await f.review(), committed = await f.append();
    f.setResponse(() => { throw new Error('Unknown remote result'); });
    const queued = await request(f.app).post('/generation/turn/controlled/start').send(f.envelope(review, committed)).expect(202);
    const operation = nativeTaskScheduler.operations.get(queued.body.operationId); if (operation.handle) await operation.handle.result.catch(() => {});
    expect(f.sends).toHaveLength(1); expect(f.secrets).toHaveBeenCalledTimes(1); expect(f.simulation).not.toHaveBeenCalled();
    expect((await f.core.observe(f.handle, f.input.sessionId)).revision.revisionId).toBe(committed.revision.revisionId);
    await Promise.allSettled([...f.host.evidenceOperations.values()]);
    await request(f.app).post('/generation/turn/controlled/start').send(f.envelope(review, committed)).expect(409);
    const restarted = new NativeGenerationHost({ ...f.host });
    await expect(restarted.executeControlledTurn(f.handle, f.envelope(review, committed))).rejects.toThrow('native_turn_attempt_already_claimed');
    const moduleUrl = path => new URL(path, import.meta.url).href;
    const script = `
        import { FsEngine } from ${JSON.stringify(moduleUrl('../../src/storage/engines/fs-engine.js'))};
        import { services } from ${JSON.stringify(moduleUrl('./helpers/session-fixture.js'))};
        import { NativeModelPromptPersistence, VersionedJsonResourceHandler } from ${JSON.stringify(moduleUrl('../../src/native/model-prompt-runtime/persistence.js'))};
        import { NativeGenerationHost } from ${JSON.stringify(moduleUrl('../../src/native/adapters/generation-host.js'))};
        const data = JSON.parse(process.argv[1]);
        const engine = new FsEngine({ directoriesByHandle: owner => { if(owner !== data.handle) throw Error('Owner denied'); return data.dirs; } });
        const native = services({ ...data, engine });
        const host = new NativeGenerationHost({ persistence: new NativeModelPromptPersistence({engine}), library: new VersionedJsonResourceHandler({engine}),
            sessionCore: native.core, packageInstaller: native.packageInstaller, providers: {}, secretPort: { resolveSecret:async()=>{throw Error('Forbidden Secret access');} } });
        try { await host.executeControlledTurn(data.handle, data.body); process.stdout.write('UNEXPECTED_SEND'); }
        catch(error) { process.stdout.write(error.code ?? error.message); }
        await engine.close?.();`;
    const child = await exec(process.execPath, ['--input-type=module', '-e', script, JSON.stringify({ handle: f.handle, dirs: f.dirs, body: f.envelope(review, committed) })], { timeout: 10000 });
    expect(child.stdout).toBe('native_turn_attempt_already_claimed');
    const control = await f.core.runs.status(f.handle, f.input.sessionId);
    expect(Object.values(control.operations).flatMap(row => row.compute?.attempts ?? []).some(attempt => attempt.status === 'unknown')).toBe(true);
    expect(f.sends).toHaveLength(1); expect(f.secrets).toHaveBeenCalledTimes(1);
}, 30000);

test('cancelled controlled Turn keeps its durable one-shot claim across a fresh Native Host', async () => {
    const f = await fixture(), review = await f.review(), committed = await f.append();
    let entered, release; const sent = new Promise(resolve => { entered = resolve; }), hold = new Promise(resolve => { release = resolve; });
    f.setResponse(async () => { entered(); await hold; return { content: 'Late response must not publish.' }; });
    const queued = await request(f.app).post('/generation/turn/controlled/start').send(f.envelope(review, committed)).expect(202);
    await sent; await request(f.app).delete('/generation/operations/' + queued.body.operationId).expect(200); release();
    await Promise.allSettled([...f.host.evidenceOperations.values()]);
    const restarted = new NativeGenerationHost({ ...f.host });
    await expect(restarted.executeControlledTurn(f.handle, f.envelope(review, committed))).rejects.toThrow('native_turn_attempt_already_claimed');
    expect(f.sends).toHaveLength(1); expect(f.simulation).not.toHaveBeenCalled();
    expect((await f.core.observe(f.handle, f.input.sessionId)).revision.revisionId).toBe(committed.revision.revisionId);
}, 30000);

test('unapproved Native credential target fails closed even if a caller supplies its exact observed configuration hash', async () => {
    const f = await fixture();
    await f.engine.withTransaction(f.handle, tx => tx.deleteResource(new CredentialTargetAuthority({ persistence: f.seeded.persistence }).key(f.handle, f.seeded.connection.connectionProfileId)));
    const review = await f.review(), committed = await f.append();
    expect(review.configuration.credentialTargets[0].authorized).toBe(false);
    await request(f.app).post('/generation/turn/controlled/start').send(f.envelope(review, committed)).expect(400);
    expect(f.secrets).not.toHaveBeenCalled(); expect(f.sends).toEqual([]);
});

test('configuration changed during Native lowering is rejected at the actual send boundary before Secret access', async () => {
    const f = await fixture(), review = await f.review(), committed = await f.append();
    const provider = f.host.providers['provider.openai-compatible']; let changed = false;
    f.host.providers = { ...f.host.providers, 'provider.openai-compatible': { ...provider, countTokens: async (...args) => {
        if (!changed) { changed = true; await f.seeded.persistence.saveModelProfile(f.handle, { ...f.seeded.model, displayName: 'Late Native drift' }); }
        return provider.countTokens(...args);
    } } };
    const queued = await request(f.app).post('/generation/turn/controlled/start').send(f.envelope(review, committed)).expect(202);
    const operation = nativeTaskScheduler.operations.get(queued.body.operationId); if (operation.handle) await operation.handle.result.catch(() => {});
    expect(changed).toBe(true); expect(f.secrets).not.toHaveBeenCalled(); expect(f.sends).toEqual([]);
    expect(nativeTaskScheduler.project(f.handle, queued.body.operationId).errorCode).toBe('native_generation_review_stale');
});

const integration = process.env.ATRIA_MCP_SOURCE ? describe : describe.skip;
integration('actual MCP controlled Turn bridge', () => {
    test('chat.send reviews configuration once, commits its known input and executes the same controlled Native Turn', async () => {
        const f = await fixture(), root = process.env.ATRIA_MCP_SOURCE;
        const { registerMutationActions } = await import(pathToFileURL(join(root, 'src/mutations.js')).href);
        const { ActionRegistry, PolicyCeiling, RiskExecutor } = await import(pathToFileURL(join(root, 'src/kernel.js')).href);
        const reviews = [], browser = { config: { url: 'http://localhost', timeout: 5000, maxResponseBytes: 1048576 }, start: async () => {},
            runtimeIdentity: async () => ({ serverBootId: f.boot, mutationGuards: 1 }), context: { request: {
                get: async () => ({ ok: () => true, status: () => 200, headers: () => ({ 'content-type': 'application/json' }), body: async () => Buffer.from('{"token":"fixture"}'), dispose: async () => {} }),
                fetch: async (url, options) => {
                    const path = new URL(url).pathname.replace('/api/native/generation', '/generation').replace('/api/native/session', '/session');
                    const response = await request(f.app)[options.method.toLowerCase()](path).set(options.headers).send(options.data);
                    return { ok: () => response.status < 400, status: () => response.status, headers: () => response.headers,
                        body: async () => Buffer.from(response.text), dispose: async () => {} };
                },
            } } };
        const registry = registerMutationActions(new ActionRegistry(), browser), executor = new RiskExecutor(registry, new PolicyCeiling(registry, ['chat.send']),
            { approve: async review => { reviews.push(review); return { action: 'accept', content: { authorize: true, uses: 1 } }; } });
        const result = await executor.execute('MUTATE', { action: 'chat.send', input: f.input });
        expect(result.receipt.status).toBe('succeeded'); expect(reviews).toHaveLength(1);
        const operationId = result.receipt.after.generation.result.operationId;
        const operation = nativeTaskScheduler.operations.get(operationId); if (operation.handle) await operation.handle.result;
        const final = await f.core.observe(f.handle, f.input.sessionId);
        expect(final.timeline.at(-1).content).toBe('Controlled Native narrative.'); expect(f.sends).toHaveLength(2);
        expect(f.simulation).not.toHaveBeenCalled(); expect(f.wake).not.toHaveBeenCalled();
        await expect(executor.execute('MUTATE', { action: 'chat.send', input: f.input })).rejects.toThrow('revision conflict');
        expect(f.sends).toHaveLength(2);
    }, 30000);
});
