import { expect, test, jest } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { createServer } from 'node:http';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { makeTempSqliteEngineHarness, makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { projectSource, services as projectServices } from '../agent-intelligence/project-fixture.js';
import { NativeRetrievalPersistence } from '../../src/native/retrieval-persistence.js';
import { createRetrievalMiddleware } from '../../src/native/retrieval-execution.js';
import { prepareRetrievalCompute } from '../../src/native/retrieval-compute.js';
import { createNativeId } from '../../src/native/identity.js';
import { retrievalRef } from '../../public/scripts/native/retrieval-contracts.js';
import { router as vectors } from '../../src/endpoints/vectors.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { rerank } from '../../src/vectors/rerank.js';
import { getOpenAIBatchVector } from '../../src/vectors/openai-vectors.js';
import { emptyProvenance, captureEpisodes } from '../../public/scripts/agents/memory/source-provenance.js';
import { retrieveMemory } from '../../public/scripts/agents/memory/hybrid-retrieval.js';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import vectra from 'vectra';
import { insertNativeIndex, queryNativeIndexes, purgeNativeIndex, withNativeIndexWrite } from '../../src/native/vector-index-work.js';
import { snapshotUser, restoreFromSnapshot } from '../../src/storage/migration/backup.js';
import { RunControl } from '../../src/native/run-control.js';
import { SessionRepo } from '../../src/native/repositories/session-repo.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';
import { assertRunContinuation } from '../../public/shared/native-run-contract.js';

async function fixture(make, maxRequests = 2, localWork) {
    const h = await make(), seen = [];
    let respond = () => ({ results: [{ index: 0, relevance_score: .9 }] });
    let respondEmbedding = body => ({ data: body.input.map((_, index) => ({ index, embedding: [1, 0] })), usage: { prompt_tokens: 3, total_tokens: 3 } });
    const server = createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk;
        seen.push({ path: req.url, body: JSON.parse(raw) });
        const body = req.url.endsWith('/rerank') ? await respond() : req.url.endsWith('/embeddings') ? await respondEmbedding(JSON.parse(raw))
            : { choices: [{ message: { role: 'assistant', content: 'Fresh answer.' } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const endpoint = `http://127.0.0.1:${server.address().port}/v1`;
    const installed = await installFixture(h), base = await installed.core.create(h.handle, installed.start);
    const seeded = await seedGenerationProfiles({ ...h, endpoint: endpoint + '/chat/completions', roles: ['narrator', 'studio'] });
    for (const route of seeded.routes) await seeded.persistence.saveRuntimeRoute(h.handle, { ...route, executionPolicy: { schemaVersion: 1,
        allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: { maxRequests, maxTokens: 64000, ...(localWork ? { localWork } : {}) } } });
    const profile = { retrievalProfileId: createNativeId('retrievalProfile'), revision: createNativeId('revision'), displayName: 'Finite ranker',
        mode: 'rerank', source: 'custom', model: 'test-rank', endpoint, secretRef: { secretId: 'synthetic' }, options: {} };
    const store = new NativeRetrievalPersistence({ engine: h.engine }); await store.commit(h.handle, profile);
    const computeServices = { core: installed.core, persistence: seeded.persistence, ...projectServices(h) };
    const app = express(); app.use(express.json({ limit: '2mb' })); app.use((req, _res, next) => { req.user = { profile: { handle: h.handle }, directories: h.dirs }; next(); });
    app.use(createRetrievalMiddleware(() => store, () => 'synthetic-key', async () => computeServices)); app.use(vectors);
    const computeContext = { kind: 'session', sessionId: base.session.sessionId, revisionId: base.revision.revisionId };
    const body = { nativeRetrievalRef: retrievalRef(profile), query: 'Why Alice?', documents: [{ text: 'Because of the storm', index: 0 }], computeContext };
    return { ...h, ...seeded, ...computeServices, base, profile, body, seen, store, request: supertest(app), respond: fn => { respond = fn; }, respondEmbedding: fn => { respondEmbedding = fn; },
        async cleanup() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.cleanup(); } };
}

async function embeddingBody(f, items = [{ hash: 1, text: 'Current legal evidence', index: 0 }]) {
    const profile = { ...f.profile, retrievalProfileId: createNativeId('retrievalProfile'), mode: 'embed', source: 'openai', model: 'test-embed' };
    await f.store.commit(f.handle, profile);
    return { nativeRetrievalRef: retrievalRef(profile), collectionId: 'g05-embed', items, computeContext: f.body.computeContext };
}

const localLimits = { maxJobs: 3, maxItems: 5, maxInputBytes: 4096 };
const indexFile = (f, body) => path.join(f.dirs.vectors, 'atri-retrieval', body.collectionId, body.nativeRetrievalRef.retrievalProfileId + '_' + body.nativeRetrievalRef.revision, 'index.json');
const readCompute = async f => Object.values((await f.core.runs.status(f.handle, f.base.session.sessionId))?.operations ?? {}).find(row => row.compute)?.compute;
test.each([['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]])('G05 local purge %s shares original allowance and recovery preserves it', async (_kind, make) => {
    const f = await fixture(make, 1, { ...localLimits, maxJobs: 2 });
    try {
        const body = await embeddingBody(f); await f.request.post('/insert').send(body).expect(200);
        const args = { nativeRetrievalRef: body.nativeRetrievalRef, collectionId: body.collectionId, computeContext: body.computeContext };
        await f.request.post('/purge').send(args).expect(200);
        await expect(fs.access(indexFile(f, body))).rejects.toMatchObject({ code: 'ENOENT' });
        expect(await fs.readdir(path.dirname(indexFile(f, body)))).toEqual([]);
        const ledger = await readCompute(f); expect(ledger.localWork.map(row => row.kind)).toEqual(['index_insert', 'index_purge']);
        expect(ledger.localWork[1]).toMatchObject({ estimatedItems: 1, status: 'settled', usage: { outcome: 'completed' } });
        expect(ledger.attempts).toHaveLength(1); expect(f.seen).toHaveLength(1);
        const route = f.routes.find(row => row.role === 'role.narrator');
        await f.persistence.saveRuntimeRoute(f.handle, { ...route, executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [f.model.modelProfileId] } });
        const backupPath = await snapshotUser({ handle: f.handle, userRoot: f.dirs.root, backupRoot: f.backupRoot, engine: f.engine });
        await restoreFromSnapshot({ handle: f.handle, userRoot: f.dirs.root, backupPath, engine: f.engine }); await f.engine.close();
        f.core.runs = new RunControl(new SessionRepo({ engine: f.engine }));
        await f.request.post('/purge').send(args).expect(429); expect(await readCompute(f)).toEqual(ledger); expect(f.seen).toHaveLength(1);
    } finally { await f.cleanup(); }
});
test.each(['cancel', 'task_change', 'head_change', 'unlink_failure'])('G05 local purge %s preserves bytes before commit and retains original cost', async scenario => {
    const f = await fixture(makeTempFsEngine, 1, localLimits), controller = new AbortController(); let spy;
    try {
        const body = await embeddingBody(f); await f.request.post('/insert').send({ ...body, computeContext: undefined }).expect(200);
        const file = indexFile(f, body), saved = await fs.readFile(file), source = projectSource(), project = await f.studio.createProject(f.handle, source);
        const task = await f.agent.createTask(f.handle, source.project.projectId, { intent: 'Clear derived namespace', baseRevision: project.revision.revision });
        const context = scenario === 'head_change' ? body.computeContext : { kind: 'project', projectId: source.project.projectId, taskId: task.taskId, revision: project.revision.revision };
        const compute = await prepareRetrievalCompute({ ...f, context, profile: await f.store.getExact(f.handle, body.nativeRetrievalRef) });
        const original = fs.readFile;
        spy = jest.spyOn(fs, 'readFile').mockImplementation(async (...args) => {
            const result = await original(...args);
            if (args[0] === file) {
                if (scenario === 'cancel') controller.abort();
                if (scenario === 'task_change') await f.agent.setPlan(f.handle, context.projectId, context.taskId, { summary: 'Changed clearing', steps: [{ id: 'read', title: 'Read', impact: 'low' }] });
                if (scenario === 'head_change') await f.core.appendTimeline(f.handle, f.base.session.sessionId, { role: 'user', content: 'New HEAD during clearing' });
            }
            return result;
        });
        let unlink;
        if (scenario === 'unlink_failure') {
            const originalUnlink = fsSync.unlinkSync;
            unlink = jest.spyOn(fsSync, 'unlinkSync').mockImplementation(value => { if (value === file) throw new Error('Synthetic unlink failure'); return originalUnlink(value); });
        }
        try {
            await expect(purgeNativeIndex({ indexPath: path.dirname(file), root: path.join(f.dirs.vectors, 'atri-retrieval'), compute, signal: controller.signal })).rejects.toThrow();
        } finally { unlink?.mockRestore(); spy.mockRestore(); }
        expect((await fs.readFile(file)).equals(saved)).toBe(true); expect(f.seen).toHaveLength(1);
        const observed = scenario === 'head_change' ? (await f.core.runs.status(f.handle, f.base.session.sessionId)).retiredCompute
            : (await f.agent.getTask(f.handle, context.projectId, context.taskId)).compute.localWork[0];
        expect(observed).toMatchObject(scenario === 'head_change' ? { localJobs: 1, localFailedJobs: 1 }
            : { kind: 'index_purge', status: 'settled', usage: { outcome: scenario === 'cancel' ? 'cancelled' : 'failed' } });
    } finally { spy?.mockRestore(); await f.cleanup(); }
});
test.each(['corrupt', 'sidecar', 'metadata_file', 'oversize', 'candidates'])('G05 local purge %s refuses unknown work without modifying files', async scenario => {
    const f = await fixture(makeTempFsEngine, 1, localLimits);
    try {
        const body = await embeddingBody(f); await f.request.post('/insert').send({ ...body, computeContext: undefined }).expect(200);
        const file = indexFile(f, body);
        if (scenario === 'corrupt') await fs.writeFile(file, '{broken');
        if (scenario === 'sidecar') await fs.writeFile(path.join(path.dirname(file), 'private.txt'), 'Keep this fixture sidecar');
        if (scenario === 'oversize') await fs.truncate(file, 16777217);
        if (['metadata_file', 'candidates'].includes(scenario)) {
            const doc = JSON.parse(await fs.readFile(file, 'utf8'));
            if (scenario === 'metadata_file') doc.items[0].metadataFile = 'unknown.json';
            else doc.items = Array(10001).fill(doc.items[0]);
            await fs.writeFile(file, JSON.stringify(doc));
        }
        const saved = await fs.readFile(file);
        await f.request.post('/purge').send({ nativeRetrievalRef: body.nativeRetrievalRef, collectionId: body.collectionId, computeContext: body.computeContext }).expect(scenario === 'corrupt' ? 500 : 503);
        expect((await fs.readFile(file)).equals(saved)).toBe(true);
        const sidecar = scenario === 'sidecar' ? await fs.readFile(path.join(path.dirname(file), 'private.txt'), 'utf8') : null;
        expect(sidecar).toBe(scenario === 'sidecar' ? 'Keep this fixture sidecar' : null);
        expect((await readCompute(f)).localWork[0].usage.outcome).toBe('failed'); expect(f.seen).toHaveLength(1);
    } finally { await f.cleanup(); }
});
test.each(['namespace_link', 'parent_link', 'root_link'])('G05 local purge %s rejects physical aliases within isolated fixture', async scenario => {
    const f = await fixture(makeTempFsEngine, 1, localLimits);
    try {
        const body = await embeddingBody(f); await f.request.post('/insert').send({ ...body, computeContext: undefined }).expect(200);
        const folder = path.dirname(indexFile(f, body)), target = scenario === 'root_link' ? path.join(f.dirs.vectors, 'atri-retrieval')
            : scenario === 'namespace_link' ? folder : path.dirname(folder);
        const moved = path.join(f.dirs.root, 'isolated-alias'); await fs.rename(target, moved);
        await fs.symlink(moved, target, process.platform === 'win32' ? 'junction' : 'dir');
        const actual = path.join(moved, path.relative(target, indexFile(f, body))), saved = await fs.readFile(actual);
        await f.request.post('/purge').send({ nativeRetrievalRef: body.nativeRetrievalRef, collectionId: body.collectionId, computeContext: body.computeContext }).expect(503);
        expect((await fs.readFile(actual)).equals(saved)).toBe(true); expect((await readCompute(f)).localWork[0].usage.outcome).toBe('failed');
    } finally { await f.cleanup(); }
});
test('G05 local purge missing index and unscoped compatibility never create index or invent model sends', async () => {
    const f = await fixture(makeTempFsEngine, 1, localLimits);
    try {
        const body = await embeddingBody(f), args = { nativeRetrievalRef: body.nativeRetrievalRef, collectionId: body.collectionId };
        const before = await f.core.load(f.handle, f.base.session.sessionId);
        await f.request.post('/purge').send({ ...args, computeContext: body.computeContext }).expect(200);
        expect((await readCompute(f)).localWork[0]).toMatchObject({ kind: 'index_purge', usage: { outcome: 'completed' } });
        await expect(fs.access(path.dirname(indexFile(f, body)))).rejects.toMatchObject({ code: 'ENOENT' });
        await f.request.post('/insert').send({ ...body, computeContext: undefined }).expect(200);
        await f.request.post('/purge').send(args).expect(200);
        expect((await readCompute(f)).localWork).toHaveLength(1); expect((await readCompute(f)).attempts).toEqual([]); expect(f.seen).toHaveLength(1);
        expect((await f.core.load(f.handle, f.base.session.sessionId)).timeline).toEqual(before.timeline);
    } finally { await f.cleanup(); }
});
test('G05 local purge readonly and exhausted bytes reject before index IO; queued cancellation starts no work', async () => {
    const f = await fixture(makeTempFsEngine, 1, { ...localLimits, maxInputBytes: 1 }), controller = new AbortController(); let release;
    try {
        const body = await embeddingBody(f); await f.request.post('/insert').send({ ...body, computeContext: undefined }).expect(200);
        const file = indexFile(f, body), saved = await fs.readFile(file), args = { nativeRetrievalRef: body.nativeRetrievalRef, collectionId: body.collectionId, computeContext: body.computeContext };
        setReadOnly(true); await f.request.post('/purge').send(args).expect(503); setReadOnly(false);
        const stat = jest.spyOn(fs, 'lstat'); await f.request.post('/purge').send(args).expect(429);
        expect(stat.mock.calls.some(call => call[0] === path.dirname(file))).toBe(false); stat.mockRestore();
        const compute = await prepareRetrievalCompute({ ...f, context: body.computeContext, profile: await f.store.getExact(f.handle, body.nativeRetrievalRef) });
        let entered; const ready = new Promise(resolve => { entered = resolve; }), waiting = new Promise(resolve => { release = resolve; });
        const blocker = withNativeIndexWrite(path.dirname(file), undefined, async () => { entered(); await waiting; }); await ready;
        const cancelled = purgeNativeIndex({ indexPath: path.dirname(file), root: path.join(f.dirs.vectors, 'atri-retrieval'), compute, signal: controller.signal });
        const rejected = cancelled.catch(error => error); controller.abort(); release(); await blocker; expect(await rejected).toMatchObject({ name: 'AbortError' });
        expect(await readCompute(f)).toBeUndefined(); expect((await fs.readFile(file)).equals(saved)).toBe(true);
        await expect(purgeNativeIndex({ indexPath: path.join(f.dirs.root, 'outside'), root: path.join(f.dirs.vectors, 'atri-retrieval'), compute })).rejects.toThrow();
        expect(await readCompute(f)).toBeUndefined();
    } finally { release?.(); setReadOnly(false); jest.restoreAllMocks(); await f.cleanup(); }
});
test('G05 local purge committed deletion survives failed settlement without falsifying preservation', async () => {
    const f = await fixture(makeTempFsEngine, 1, localLimits);
    try {
        const body = await embeddingBody(f); await f.request.post('/insert').send({ ...body, computeContext: undefined }).expect(200);
        const compute = await prepareRetrievalCompute({ ...f, context: body.computeContext, profile: await f.store.getExact(f.handle, body.nativeRetrievalRef) });
        let ticket, usage;
        const interrupted = { ...compute, async settleLocalWork(t, u) { ticket = t; usage = u; throw new Error('Synthetic settlement interruption'); } };
        await expect(purgeNativeIndex({ indexPath: path.dirname(indexFile(f, body)), root: path.join(f.dirs.vectors, 'atri-retrieval'), compute: interrupted })).rejects.toThrow('Synthetic settlement interruption');
        await expect(fs.access(indexFile(f, body))).rejects.toMatchObject({ code: 'ENOENT' });
        expect((await readCompute(f)).localWork[0]).toMatchObject({ kind: 'index_purge', status: 'charged', usage: null });
        await compute.settleLocalWork(ticket, usage);
        expect((await readCompute(f)).localWork[0]).toMatchObject({ status: 'settled', usage: { outcome: 'completed' } }); expect(f.seen).toHaveLength(1);
    } finally { await f.cleanup(); }
});
test('G05 local purge actual Native client forwards exact ref and original anchor without inventory or inference', async () => {
    jest.unstable_mockModule('../../public/script.js', () => ({ getRequestHeaders: () => ({}) }));
    const { NativeRetrievalService } = await import('../../public/scripts/native/retrieval-client.js');
    const f = await fixture(makeTempFsEngine, 1, localLimits), previousFetch = globalThis.fetch, calls = [];
    try {
        const body = await embeddingBody(f); await f.request.post('/insert').send({ ...body, computeContext: undefined }).expect(200);
        globalThis.fetch = async (url, options) => {
            const payload = JSON.parse(options.body); calls.push({ url, payload });
            const result = await f.request.post(url.replace('/api/vector', '')).send(payload);
            return { ok: result.status < 400, headers: new Headers(), json: async () => result.body };
        };
        await NativeRetrievalService.purgeCollection({ profile: { nativeRetrievalRef: body.nativeRetrievalRef }, collectionId: body.collectionId, computeContext: body.computeContext });
        expect(calls).toEqual([{ url: '/api/vector/purge', payload: { collectionId: body.collectionId, computeContext: body.computeContext, nativeRetrievalRef: body.nativeRetrievalRef } }]);
        await expect(fs.access(indexFile(f, body))).rejects.toMatchObject({ code: 'ENOENT' });
        expect((await readCompute(f)).localWork[0].kind).toBe('index_purge'); expect(f.seen).toHaveLength(1);
    } finally { globalThis.fetch = previousFetch; await f.cleanup(); }
});
test.each([['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]])('G05 local delete %s shares original allowance and retains limits through recovery', async (_kind, make) => {
    const f = await fixture(make, 2, { ...localLimits, maxJobs: 3 });
    try {
        const body = await embeddingBody(f); await f.request.post('/insert').send(body).expect(200);
        const args = { nativeRetrievalRef: body.nativeRetrievalRef, collectionId: body.collectionId, computeContext: body.computeContext };
        await f.request.post('/list').send(args).expect(200);
        await f.request.post('/delete').send({ ...args, hashes: [1] }).expect(200);
        expect((await f.request.post('/list').send({ ...args, computeContext: undefined }).expect(200)).body).toEqual([]);
        const ledger = await readCompute(f); expect(ledger.localWork.map(row => row.kind)).toEqual(['index_insert', 'index_list', 'index_delete']);
        expect(ledger.localWork[2].usage.outcome).toBe('completed'); expect(ledger.attempts).toHaveLength(1); expect(f.seen).toHaveLength(1);
        const route = f.routes.find(row => row.role === 'role.narrator');
        await f.persistence.saveRuntimeRoute(f.handle, { ...route, executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [f.model.modelProfileId] } });
        const backupPath = await snapshotUser({ handle: f.handle, userRoot: f.dirs.root, backupRoot: f.backupRoot, engine: f.engine });
        await restoreFromSnapshot({ handle: f.handle, userRoot: f.dirs.root, backupPath, engine: f.engine }); await f.engine.close();
        f.core.runs = new RunControl(new SessionRepo({ engine: f.engine }));
        await f.request.post('/delete').send({ ...args, hashes: [2] }).expect(429);
        expect(await readCompute(f)).toEqual(ledger); expect(f.seen).toHaveLength(1);
    } finally { await f.cleanup(); }
});
test.each(['cancel', 'task_change', 'head_change', 'delete_failure', 'rename_failure'])('G05 local delete %s preserves original index bytes and settles actual work', async scenario => {
    const f = await fixture(makeTempFsEngine, 2, localLimits), controller = new AbortController(); let spy;
    try {
        const body = await embeddingBody(f, [1, 2].map(hash => ({ hash, text: 'Evidence ' + hash, index: hash })));
        await f.request.post('/insert').send({ ...body, computeContext: undefined }).expect(200); const saved = await fs.readFile(indexFile(f, body));
        const source = projectSource(), project = await f.studio.createProject(f.handle, source);
        const task = await f.agent.createTask(f.handle, source.project.projectId, { intent: 'Delete derived hashes', baseRevision: project.revision.revision });
        const context = scenario === 'head_change' ? body.computeContext : { kind: 'project', projectId: source.project.projectId, taskId: task.taskId, revision: project.revision.revision };
        const compute = await prepareRetrievalCompute({ ...f, context, profile: await f.store.getExact(f.handle, body.nativeRetrievalRef) });
        const original = vectra.LocalIndex.prototype.deleteItem; let removed = 0;
        if (scenario === 'rename_failure') {
            const rename = fsSync.renameSync;
            spy = jest.spyOn(fsSync, 'renameSync').mockImplementation((from, to) => {
                if (to === indexFile(f, body)) throw new Error('Synthetic atomic publication failure'); return rename(from, to);
            });
        } else spy = jest.spyOn(vectra.LocalIndex.prototype, 'deleteItem').mockImplementation(async function (...args) {
            await original.apply(this, args);
            if (++removed === 1) {
                if (scenario === 'cancel') controller.abort();
                else if (scenario === 'task_change') await f.agent.setPlan(f.handle, context.projectId, context.taskId, { summary: 'Changed deletion', steps: [{ id: 'read', title: 'Read', impact: 'low' }] });
                else if (scenario === 'head_change') await f.core.appendTimeline(f.handle, f.base.session.sessionId, { role: 'user', content: 'New HEAD during deletion' });
                else throw new Error('Synthetic partial deletion failure');
            }
        });
        await expect(insertNativeIndex({ indexPath: path.dirname(indexFile(f, body)), deleteHashes: [1, 2], compute, signal: controller.signal })).rejects.toThrow();
        expect((await fs.readFile(indexFile(f, body))).equals(saved)).toBe(true); expect(f.seen).toHaveLength(1);
        if (scenario === 'head_change') expect((await f.core.runs.status(f.handle, f.base.session.sessionId)).retiredCompute).toMatchObject({ localJobs: 1, localFailedJobs: 1 });
        else {
            const ledger = (await f.agent.getTask(f.handle, context.projectId, context.taskId)).compute;
            expect(ledger.attempts).toEqual([]); expect(ledger.localWork[0]).toMatchObject({ kind: 'index_delete', status: 'settled', usage: { outcome: scenario === 'cancel' ? 'cancelled' : 'failed' } });
        }
        expect((await fs.readdir(path.dirname(path.dirname(indexFile(f, body))))).filter(name => name.startsWith('.atri-index-work-'))).toEqual([]);
    } finally { spy?.mockRestore(); await f.cleanup(); }
});
test('G05 local delete empty input does no work; missing index is observed without creating a file; bad hashes reject before admission', async () => {
    const f = await fixture(makeTempFsEngine, 1, localLimits);
    try {
        const body = await embeddingBody(f), args = { nativeRetrievalRef: body.nativeRetrievalRef, collectionId: body.collectionId, computeContext: body.computeContext };
        await f.request.post('/delete').send({ ...args, hashes: [] }).expect(200); expect(await readCompute(f)).toBeUndefined();
        for (const hashes of [[null], ['1'], Array(10001).fill(1)]) await f.request.post('/delete').send({ ...args, hashes }).expect(503);
        expect(await readCompute(f)).toBeUndefined();
        await f.request.post('/delete').send({ ...args, hashes: [1] }).expect(200);
        expect((await readCompute(f)).localWork[0]).toMatchObject({ kind: 'index_delete', usage: { outcome: 'completed' } });
        await expect(fs.access(indexFile(f, body))).rejects.toMatchObject({ code: 'ENOENT' }); expect(f.seen).toHaveLength(0);
    } finally { await f.cleanup(); }
});
test.each(['corrupt', 'sidecar'])('G05 local delete %s index refuses while retaining bytes and costs', async scenario => {
    const f = await fixture(makeTempFsEngine, 1, localLimits);
    try {
        const body = await embeddingBody(f); await f.request.post('/insert').send({ ...body, computeContext: undefined }).expect(200);
        if (scenario === 'corrupt') await fs.writeFile(indexFile(f, body), '{broken');
        else {
            const doc = JSON.parse((await fs.readFile(indexFile(f, body))).toString()); doc.items[0].metadataFile = 'unknown.json';
            await fs.writeFile(indexFile(f, body), JSON.stringify(doc));
        }
        const saved = await fs.readFile(indexFile(f, body));
        await f.request.post('/delete').send({ nativeRetrievalRef: body.nativeRetrievalRef, collectionId: body.collectionId, computeContext: body.computeContext, hashes: [1] }).expect(scenario === 'corrupt' ? 500 : 503);
        expect((await fs.readFile(indexFile(f, body))).equals(saved)).toBe(true); expect((await readCompute(f)).localWork[0].usage.outcome).toBe('failed'); expect(f.seen).toHaveLength(1);
    } finally { await f.cleanup(); }
});
test('G05 local delete queued hashes freeze and cancelled waiters do not start work', async () => {
    const f = await fixture(makeTempFsEngine, 1, localLimits), controller = new AbortController(); let release;
    try {
        const body = await embeddingBody(f, [1, 2].map(hash => ({ hash, text: 'Evidence ' + hash, index: hash })));
        await f.request.post('/insert').send({ ...body, computeContext: undefined }).expect(200);
        const compute = await prepareRetrievalCompute({ ...f, context: body.computeContext, profile: await f.store.getExact(f.handle, body.nativeRetrievalRef) });
        const indexPath = path.dirname(indexFile(f, body)); let entered;
        const ready = new Promise(resolve => { entered = resolve; }), waiting = new Promise(resolve => { release = resolve; });
        const blocker = withNativeIndexWrite(indexPath, undefined, async () => { entered(); await waiting; }); await ready;
        const hashes = [1], valid = insertNativeIndex({ indexPath, deleteHashes: hashes, compute });
        const cancelled = insertNativeIndex({ indexPath, deleteHashes: [2], compute, signal: controller.signal });
        const rejected = expect(cancelled).rejects.toThrow(); hashes[0] = 2; controller.abort();
        expect(await readCompute(f)).toBeUndefined(); release(); await blocker; await rejected; await valid;
        const doc = JSON.parse((await fs.readFile(indexFile(f, body))).toString()); expect(doc.items.map(row => row.metadata.hash)).toEqual([2]);
        expect((await readCompute(f)).localWork).toHaveLength(1); expect(f.seen).toHaveLength(1);
    } finally { release?.(); await f.cleanup(); }
});
test('G05 local delete readonly rejects before any job while retaining index bytes', async () => {
    const f = await fixture(makeTempFsEngine, 1, localLimits);
    try {
        const body = await embeddingBody(f); await f.request.post('/insert').send({ ...body, computeContext: undefined }).expect(200);
        const saved = await fs.readFile(indexFile(f, body)); setReadOnly(true);
        await f.request.post('/delete').send({ nativeRetrievalRef: body.nativeRetrievalRef, collectionId: body.collectionId, computeContext: body.computeContext, hashes: [1] }).expect(503);
        expect((await fs.readFile(indexFile(f, body))).equals(saved)).toBe(true); expect(await readCompute(f)).toBeUndefined(); expect(f.seen).toHaveLength(1);
    } finally { setReadOnly(false); await f.cleanup(); }
});
for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`G05 local list ${kind} concurrent reads share insert allowance and preserve limits through recovery`, async () => {
        const f = await fixture(make, 2, { ...localLimits, maxJobs: 2 });
        try {
            const body = await embeddingBody(f); await f.request.post('/insert').send(body).expect(200);
            const query = { nativeRetrievalRef: body.nativeRetrievalRef, collectionId: body.collectionId, computeContext: body.computeContext };
            const replies = await Promise.all([1, 2].map(() => f.request.post('/list').send(query)));
            expect(replies.map(row => row.status).sort()).toEqual([200, 429]); expect(replies.find(row => row.status === 200).body).toEqual([1]);
            const ledger = await readCompute(f); expect(ledger.localWork.map(row => row.kind)).toEqual(['index_insert', 'index_list']); expect(ledger.attempts).toHaveLength(1);
            const route = f.routes.find(row => row.role === 'role.narrator');
            await f.persistence.saveRuntimeRoute(f.handle, { ...route, executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [f.model.modelProfileId] } });
            const backupPath = await snapshotUser({ handle: f.handle, userRoot: f.dirs.root, backupRoot: f.backupRoot, engine: f.engine });
            await restoreFromSnapshot({ handle: f.handle, userRoot: f.dirs.root, backupPath, engine: f.engine }); await f.engine.close();
            f.core.runs = new RunControl(new SessionRepo({ engine: f.engine }));
            await f.request.post('/list').send(query).expect(429); expect(await readCompute(f)).toEqual(ledger); expect(f.seen).toHaveLength(1);
        } finally { await f.cleanup(); }
    });
}
test.each(['empty', 'corrupt', 'overlimit', 'readonly'])('G05 local list %s keeps original read boundaries without inference or regeneration', async scenario => {
    const f = await fixture(makeTempFsEngine, 2, localLimits);
    try {
        const body = await embeddingBody(f), args = { nativeRetrievalRef: body.nativeRetrievalRef, collectionId: body.collectionId, computeContext: body.computeContext };
        let saved;
        if (scenario !== 'empty') {
            await f.request.post('/insert').send({ ...body, computeContext: undefined }).expect(200);
            if (scenario === 'corrupt') await fs.writeFile(indexFile(f, body), '{broken');
            if (scenario === 'overlimit') {
                const doc = JSON.parse((await fs.readFile(indexFile(f, body))).toString()); doc.items = Array(10001).fill(doc.items[0]);
                await fs.writeFile(indexFile(f, body), JSON.stringify(doc));
            }
            saved = await fs.readFile(indexFile(f, body));
        }
        if (scenario === 'readonly') { setReadOnly(true); delete args.computeContext; }
        const result = await f.request.post('/list').send(args).expect(scenario === 'corrupt' ? 500 : scenario === 'overlimit' ? 503 : 200);
        if (scenario === 'empty') {
            expect(result.body).toEqual([]); await expect(fs.access(indexFile(f, body))).rejects.toMatchObject({ code: 'ENOENT' });
        } else expect((await fs.readFile(indexFile(f, body))).equals(saved)).toBe(true);
        if (scenario === 'readonly') expect(result.body).toEqual([1]);
        else {
            const ledger = await readCompute(f); expect(ledger.attempts).toEqual([]);
            expect(ledger.localWork[0]).toMatchObject({ kind: 'index_list', status: 'settled', usage: { outcome: scenario === 'empty' ? 'completed' : 'failed' } });
        }
        expect(f.seen).toHaveLength(scenario === 'empty' ? 0 : 1);
    } finally { setReadOnly(false); await f.cleanup(); }
});
test.each(['cancel', 'task_change'])('G05 local list %s during cost settlement refuses stale hashes without refunding completed work', async scenario => {
    const f = await fixture(makeTempFsEngine, 1, localLimits), controller = new AbortController();
    try {
        const body = await embeddingBody(f);
        await f.request.post('/insert').send({ ...body, computeContext: undefined }).expect(200);
        const source = projectSource(), project = await f.studio.createProject(f.handle, source);
        const task = await f.agent.createTask(f.handle, source.project.projectId, { intent: 'Read index hashes', baseRevision: project.revision.revision });
        const context = { kind: 'project', projectId: source.project.projectId, taskId: task.taskId, revision: project.revision.revision };
        const compute = await prepareRetrievalCompute({ ...f, context, profile: await f.store.getExact(f.handle, body.nativeRetrievalRef) });
        const wrapped = { ...compute, async settleLocalWork(ticket, usage) {
            await compute.settleLocalWork(ticket, usage);
            if (scenario === 'cancel') controller.abort();
            else await f.agent.setPlan(f.handle, context.projectId, context.taskId, { summary: 'Changed after enumeration', steps: [{ id: 'read', title: 'Read evidence', impact: 'low' }] });
        } };
        await expect(queryNativeIndexes({ indexes: [{ collectionId: body.collectionId, indexPath: path.dirname(indexFile(f, body)) }],
            mode: 'list', compute: wrapped, signal: controller.signal })).rejects.toThrow();
        const ledger = (await f.agent.getTask(f.handle, context.projectId, context.taskId)).compute;
        expect(ledger.attempts).toEqual([]); expect(ledger.localWork[0].usage.outcome).toBe('completed'); expect(f.seen).toHaveLength(1);
    } finally { await f.cleanup(); }
});
for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`G05 retired work ${kind} actual Session HEAD change during Embedding retains both costs and refuses stale index publication`, async () => {
        const f = await fixture(make, 4, localLimits);
        try {
            const body = await embeddingBody(f), { computeContext: _context, ...old } = body;
            await f.request.post('/insert').send(old).expect(200); const saved = await fs.readFile(indexFile(f, body));
            f.respondEmbedding(async () => {
                await f.core.appendTimeline(f.handle, f.base.session.sessionId, { role: 'user', content: 'New current input' }, { expectedRevisionId: f.base.revision.revisionId });
                const pending = Object.values((await f.core.runs.status(f.handle, f.base.session.sessionId)).operations)[0].compute;
                expect(pending.attempts[0].status).toBe('charged'); expect(pending.localWork[0].status).toBe('charged');
                return { data: [{ index: 0, embedding: [1, 0] }], usage: { prompt_tokens: 7, total_tokens: 7 } };
            });
            await f.request.post('/insert').send(body).expect(500);
            expect((await fs.readFile(indexFile(f, body))).equals(saved)).toBe(true); expect(f.seen).toHaveLength(2);
            const control = await f.core.runs.status(f.handle, f.base.session.sessionId);
            expect(control.retiredCompute).toMatchObject({ modelAttempts: 1, knownTotalTokens: 7, unknownAttempts: 0,
                localJobs: 1, localFailedJobs: 1, localUnknownJobs: 0 });
            expect(Object.values(control.operations)).toEqual([]);
        } finally { await f.cleanup(); }
    });
}
test.each(['fork', 'restore'])('G05 retired work actual Session %s during provider HTTP retains usage without publishing', async action => {
    const f = await fixture(makeTempFsEngine, 2, localLimits);
    try {
        const body = await embeddingBody(f), saved = await f.core.createSavePoint(f.handle, f.base.session.sessionId);
        if (action === 'restore') {
            const current = await f.core.appendTimeline(f.handle, f.base.session.sessionId, { role: 'user', content: 'Work after saved history' });
            body.computeContext = { ...body.computeContext, revisionId: current.revision.revisionId };
        }
        f.respondEmbedding(async () => {
            if (action === 'fork') await f.core.forkBranch(f.handle, f.base.session.sessionId, { revisionId: f.base.revision.revisionId, expectedRevisionId: f.base.revision.revisionId });
            else await f.core.restoreSavePoint(f.handle, f.base.session.sessionId, saved.saveId, { expectedRevisionId: body.computeContext.revisionId });
            return { data: [{ index: 0, embedding: [1, 0] }], usage: { total_tokens: 5 } };
        });
        await f.request.post('/insert').send(body).expect(500);
        await expect(fs.access(indexFile(f, body))).rejects.toMatchObject({ code: 'ENOENT' });
        expect((await f.core.runs.status(f.handle, f.base.session.sessionId)).retiredCompute).toMatchObject({ modelAttempts: 1, knownTotalTokens: 5, localJobs: 1, localFailedJobs: 1 });
        expect(f.seen).toHaveLength(1);
    } finally { await f.cleanup(); }
});
for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`G05 retired work ${kind} admitted interrupted receipts survive new HEAD and account recovery before unknown settlement`, async () => {
        const f = await fixture(make, 1, { ...localLimits, maxJobs: 1 });
        try {
            const body = await embeddingBody(f), compute = await prepareRetrievalCompute({ ...f, context: body.computeContext, profile: await f.store.getExact(f.handle, body.nativeRetrievalRef) });
            const local = await compute.beforeLocalWork({ items: 1, inputBytes: 12, indexPath: path.dirname(indexFile(f, body)) });
            const sentBody = { input: ['Frozen request'] }, send = await compute.beforeSend(sentBody);
            await f.core.appendTimeline(f.handle, f.base.session.sessionId, { role: 'user', content: 'Advance interrupted work' });
            const pending = await f.core.runs.status(f.handle, f.base.session.sessionId);
            expect(Object.values(pending.operations)[0].compute.attempts[0].status).toBe('charged');
            const backupPath = await snapshotUser({ handle: f.handle, userRoot: f.dirs.root, backupRoot: f.backupRoot, engine: f.engine });
            await restoreFromSnapshot({ handle: f.handle, userRoot: f.dirs.root, backupPath, engine: f.engine }); await f.engine.close();
            f.core.runs = new RunControl(new SessionRepo({ engine: f.engine }));
            expect(await f.core.runs.status(f.handle, f.base.session.sessionId)).toEqual(pending);
            await expect(compute.beforeSend(sentBody)).rejects.toMatchObject({ code: 'native_generation_revision_conflict' });
            await expect(compute.publishLocalIndex(() => { throw new Error('must never publish'); })).rejects.toMatchObject({ code: 'native_generation_revision_conflict' });
            await compute.settle({ inputTokens: 3, outputTokens: 2 }, send); await compute.settleLocalWork(local, null);
            const control = await f.core.runs.status(f.handle, f.base.session.sessionId);
            expect(control.retiredCompute).toMatchObject({ modelAttempts: 1, knownTotalTokens: 0, unknownAttempts: 1,
                unknownUpperTokens: Buffer.byteLength(JSON.stringify(sentBody)), reportedInputTokens: 3, reportedOutputTokens: 2, localJobs: 1, localUnknownJobs: 1 });
            expect(control.operations).toEqual({}); expect(await f.core.runs.status(f.handle, f.base.session.sessionId)).toEqual(control); expect(f.seen).toHaveLength(0);
        } finally { await f.cleanup(); }
    });
}
test('G05 retired work 130 actual query scopes compact costs without a lifetime turn cap or invented model usage', async () => {
    const f = await fixture(makeTempFsEngine, 1, { ...localLimits, maxJobs: 1 });
    try {
        const body = await embeddingBody(f), { computeContext: _context, ...old } = body;
        await f.request.post('/insert').send(old).expect(200); let current = f.base;
        for (let turn = 0; turn < 130; turn++) {
            await f.request.post('/query-by-vector').send({ nativeRetrievalRef: body.nativeRetrievalRef, collectionId: body.collectionId,
                computeContext: { ...body.computeContext, revisionId: current.revision.revisionId }, vector: [1, 0] }).expect(200);
            current = await f.core.appendTimeline(f.handle, f.base.session.sessionId, { role: 'user', content: 'Input ' + turn });
        }
        const control = await f.core.runs.status(f.handle, f.base.session.sessionId);
        expect(control.operations).toEqual({}); expect(control.retiredCompute).toMatchObject({ localJobs: 130, localCompletedJobs: 130, modelAttempts: 0 });
        expect(control.retiredCompute.localWallMs).toBeGreaterThan(0); expect(JSON.stringify(control).length).toBeLessThan(4096);
        const portable = { operations: control.operations, background: control.background, highWaterTurn: control.highWaterTurn, retiredCompute: control.retiredCompute };
        expect(assertRunContinuation(portable)).toEqual(portable);
        for (const update of [row => row.localJobs++, row => row.unknownAttempts++, row => row.cpuUserMicros = -1, row => row.localWallMs = Infinity, row => row.knownTotalTokens = Number.MAX_SAFE_INTEGER + 1]) {
            const invalid = structuredClone(portable); update(invalid.retiredCompute); expect(() => assertRunContinuation(invalid)).toThrow();
        }
        expect(f.seen).toHaveLength(1);
    } finally { await f.cleanup(); }
}, 60000);
for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`G05 supplied vector ${kind} mixed reads share local work through Route removal and account recovery`, async () => {
        const f = await fixture(make, 4, { ...localLimits, maxJobs: 2 });
        try {
            const body = await embeddingBody(f);
            await f.request.post('/insert').send(body).expect(200);
            const query = { nativeRetrievalRef: body.nativeRetrievalRef, collectionId: body.collectionId,
                computeContext: body.computeContext, vector: [1, 0], includeVectors: true };
            const results = await Promise.all([1, 2].map(() => f.request.post('/query-by-vector').send(query)));
            expect(results.map(row => row.status).sort()).toEqual([200, 429]);
            expect(results.find(row => row.status === 200).body).toEqual({ hashes: [1], metadata: [{ hash: 1, text: body.items[0].text, index: 0, score: 1, vector: [1, 0] }] });
            const ledger = await readCompute(f), saved = await fs.readFile(indexFile(f, body));
            expect(ledger.localWork.map(row => row.kind)).toEqual(['index_insert', 'index_query']);
            expect(ledger.localWork[1]).toMatchObject({ status: 'settled', estimatedItems: 1, usage: { cpuScope: 'process', outcome: 'completed' } });
            expect(ledger.attempts).toHaveLength(1); expect(f.seen).toHaveLength(1);
            const route = f.routes.find(row => row.role === 'role.narrator');
            await f.persistence.saveRuntimeRoute(f.handle, { ...route, executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [f.model.modelProfileId] } });
            const backupPath = await snapshotUser({ handle: f.handle, userRoot: f.dirs.root, backupRoot: f.backupRoot, engine: f.engine });
            await restoreFromSnapshot({ handle: f.handle, userRoot: f.dirs.root, backupPath, engine: f.engine }); await f.engine.close();
            f.core.runs = new RunControl(new SessionRepo({ engine: f.engine }));
            await f.request.post('/query-by-vector').send(query).expect(429);
            await f.request.post('/query').send({ ...query, vector: undefined, searchText: 'Current source' }).expect(429);
            expect(await readCompute(f)).toEqual(ledger); expect((await fs.readFile(indexFile(f, body))).equals(saved)).toBe(true); expect(f.seen).toHaveLength(1);
        } finally { await f.cleanup(); }
    });
}
test('G05 supplied vector invalid inputs reject before reading or charging without coercion', async () => {
    const f = await fixture(makeTempFsEngine, 4, localLimits);
    try {
        const body = await embeddingBody(f);
        for (const extra of [{ vector: [null, 0] }, { vector: ['bad', 0] }, { vector: Array(65537).fill(0) }, { topK: 101 }, { topK: 0 }, { threshold: 'invalid' }]) {
            await f.request.post('/query-by-vector').send({ nativeRetrievalRef: body.nativeRetrievalRef, collectionId: body.collectionId,
                computeContext: body.computeContext, vector: [1, 0], ...extra }).expect(503);
        }
        expect(await readCompute(f)).toBeUndefined(); expect(f.seen).toHaveLength(0);
        await expect(fs.access(path.dirname(indexFile(f, body)))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await f.cleanup(); }
});
test('G05 supplied vector empty index records local work without creating a file or model attempt', async () => {
    const f = await fixture(makeTempFsEngine, 1, localLimits);
    try {
        const body = await embeddingBody(f);
        expect((await f.request.post('/query-by-vector').send({ nativeRetrievalRef: body.nativeRetrievalRef, collectionId: body.collectionId,
            computeContext: body.computeContext, vector: [1, 0], includeVectors: true }).expect(200)).body).toEqual({ hashes: [], metadata: [] });
        const ledger = await readCompute(f); expect(ledger.attempts).toEqual([]);
        expect(ledger.localWork[0]).toMatchObject({ kind: 'index_query', estimatedItems: 1, status: 'settled', usage: { outcome: 'completed' } });
        expect(f.seen).toHaveLength(0); await expect(fs.access(path.dirname(indexFile(f, body)))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await f.cleanup(); }
});
test('G05 supplied vector byte limit refuses before index IO', async () => {
    const f = await fixture(makeTempFsEngine, 1, { ...localLimits, maxInputBytes: 1 }); let spy;
    try {
        const body = await embeddingBody(f), original = fs.stat; let indexReads = 0;
        spy = jest.spyOn(fs, 'stat').mockImplementation((file, ...args) => {
            if (file === indexFile(f, body)) indexReads++; return original(file, ...args);
        });
        await f.request.post('/query-by-vector').send({ nativeRetrievalRef: body.nativeRetrievalRef, collectionId: body.collectionId,
            computeContext: body.computeContext, vector: [1, 0] }).expect(429);
        expect(indexReads).toBe(0); expect(await readCompute(f)).toBeUndefined(); expect(f.seen).toHaveLength(0);
    } finally { spy?.mockRestore(); await f.cleanup(); }
});
test('G05 supplied vector preserves unscoped readonly reads and supports scoped browser profile without inference', async () => {
    const f = await fixture(makeTempFsEngine, 1, localLimits);
    try {
        const body = await embeddingBody(f), { computeContext: _context, ...old } = body;
        await f.request.post('/insert').send(old).expect(200); const saved = await fs.readFile(indexFile(f, body));
        setReadOnly(true);
        expect((await f.request.post('/query-by-vector').send({ nativeRetrievalRef: body.nativeRetrievalRef, collectionId: body.collectionId, vector: [1, 0] }).expect(200)).body.hashes).toEqual([1]);
        setReadOnly(false); expect((await fs.readFile(indexFile(f, body))).equals(saved)).toBe(true);
        const profile = { ...await f.store.getExact(f.handle, body.nativeRetrievalRef), retrievalProfileId: createNativeId('retrievalProfile'), source: 'webllm', endpoint: undefined, secretRef: undefined };
        await f.store.commit(f.handle, profile);
        await f.request.post('/query-by-vector').send({ nativeRetrievalRef: retrievalRef(profile), collectionId: body.collectionId,
            computeContext: body.computeContext, vector: [1, 0] }).expect(200);
        expect((await readCompute(f)).attempts).toEqual([]); expect(f.seen).toHaveLength(1);
    } finally { setReadOnly(false); await f.cleanup(); }
});
test.each(['cancel', 'task_change'])('G05 supplied vector %s during actual index query rejects old results and retains work', async scenario => {
    const f = await fixture(makeTempFsEngine, 1, localLimits), controller = new AbortController(); let spy;
    try {
        const body = await embeddingBody(f), { computeContext: _context, ...old } = body;
        await f.request.post('/insert').send(old).expect(200);
        const source = projectSource(), project = await f.studio.createProject(f.handle, source);
        const task = await f.agent.createTask(f.handle, source.project.projectId, { intent: 'Query existing vector', baseRevision: project.revision.revision });
        const context = { kind: 'project', projectId: source.project.projectId, taskId: task.taskId, revision: project.revision.revision };
        const compute = await prepareRetrievalCompute({ ...f, context, profile: await f.store.getExact(f.handle, body.nativeRetrievalRef) });
        const original = vectra.LocalIndex.prototype.queryItems;
        spy = jest.spyOn(vectra.LocalIndex.prototype, 'queryItems').mockImplementation(async function (...args) {
            const hits = await original.apply(this, args);
            if (scenario === 'cancel') controller.abort();
            else await f.agent.setPlan(f.handle, context.projectId, context.taskId, { summary: 'Changed query', steps: [{ id: 'read', title: 'Read evidence', impact: 'low' }] });
            return hits;
        });
        const supplied = { indexes: [{ collectionId: body.collectionId, indexPath: path.dirname(indexFile(f, body)) }], vector: [1, 0], topK: 1, threshold: 0, compute, signal: controller.signal };
        if (scenario === 'cancel') await expect(queryNativeIndexes(supplied)).rejects.toThrow();
        else expect((await f.request.post('/query-by-vector').send({ nativeRetrievalRef: body.nativeRetrievalRef, collectionId: body.collectionId,
            computeContext: context, vector: [1, 0] }).expect(500)).body.error).toBe('native_generation_task_stopped');
        const ledger = (await f.agent.getTask(f.handle, context.projectId, context.taskId)).compute;
        expect(ledger.attempts).toEqual([]); expect(ledger.localWork[0]).toMatchObject({ status: 'settled', usage: { outcome: scenario === 'cancel' ? 'cancelled' : 'failed' } });
        expect(f.seen).toHaveLength(1);
    } finally { spy?.mockRestore(); await f.cleanup(); }
});
test('G05 supplied vector freezes queued input and cancelled waiter starts neither work nor inference', async () => {
    const f = await fixture(makeTempFsEngine, 1, localLimits), controller = new AbortController(); let release;
    try {
        const body = await embeddingBody(f), { computeContext: _context, ...old } = body;
        await f.request.post('/insert').send(old).expect(200);
        const compute = await prepareRetrievalCompute({ ...f, context: body.computeContext, profile: await f.store.getExact(f.handle, body.nativeRetrievalRef) });
        const indexPath = path.dirname(indexFile(f, body)); let entered;
        const ready = new Promise(resolve => { entered = resolve; }), waiting = new Promise(resolve => { release = resolve; });
        const blocker = withNativeIndexWrite(indexPath, undefined, async () => { entered(); await waiting; }); await ready;
        const vector = [1, 0], args = { indexes: [{ collectionId: body.collectionId, indexPath }], vector, topK: 1, threshold: 0, includeVectors: true, compute };
        const valid = queryNativeIndexes(args), cancelled = queryNativeIndexes({ ...args, signal: controller.signal });
        const rejected = expect(cancelled).rejects.toThrow(); vector[0] = NaN; vector.push(123); controller.abort();
        expect(await readCompute(f)).toBeUndefined(); release(); await blocker; await rejected;
        expect((await valid).single).toMatchObject({ hashes: [1], queryVector: [1, 0] });
        expect((await readCompute(f)).localWork).toHaveLength(1); expect(f.seen).toHaveLength(1);
    } finally { release?.(); await f.cleanup(); }
});
test('G05 supplied vector corrupt index cannot regenerate or drop observed work', async () => {
    const f = await fixture(makeTempFsEngine, 1, localLimits);
    try {
        const body = await embeddingBody(f), { computeContext: _context, ...old } = body;
        await f.request.post('/insert').send(old).expect(200); await fs.writeFile(indexFile(f, body), '{broken');
        await f.request.post('/query-by-vector').send({ nativeRetrievalRef: body.nativeRetrievalRef, collectionId: body.collectionId,
            computeContext: body.computeContext, vector: [1, 0] }).expect(500);
        expect((await fs.readFile(indexFile(f, body))).toString()).toBe('{broken');
        const ledger = await readCompute(f); expect(ledger.attempts).toEqual([]); expect(ledger.localWork[0].usage.outcome).toBe('failed'); expect(f.seen).toHaveLength(1);
    } finally { await f.cleanup(); }
});
for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`G05 local index ${kind} real concurrent inserts share durable work limits through Route removal and account recovery`, async () => {
        const f = await fixture(make, 8, { ...localLimits, maxJobs: 2, maxItems: 2 });
        try {
            const body = await embeddingBody(f);
            await f.request.post('/insert').send(body).expect(200);
            const responses = await Promise.all([2, 3].map(hash => f.request.post('/insert').send({ ...body, items: [{ hash, text: 'Additional evidence ' + hash, index: hash }] })));
            expect(responses.map(row => row.status).sort()).toEqual([200, 429]);
            expect(f.seen).toHaveLength(2);
            const saved = await fs.readFile(indexFile(f, body)), ledger = await readCompute(f);
            expect(JSON.parse(saved.toString()).items).toHaveLength(2);
            expect(ledger.attempts.map(row => row.usage.totalTokens)).toEqual([3, 3]);
            expect(ledger.localWork).toHaveLength(2);
            for (const row of ledger.localWork) {
                expect(row).toMatchObject({ kind: 'index_insert', status: 'settled', estimatedItems: 1, usage: { cpuScope: 'process', outcome: 'completed' } });
                expect(row.usage.wallMs).toBeGreaterThan(0); expect(row.usage.cpuUserMicros).toBeGreaterThanOrEqual(0);
                expect(row.usage).not.toHaveProperty('totalTokens'); expect(row).not.toHaveProperty('estimatedTokens');
            }
            const route = f.routes.find(row => row.role === 'role.narrator');
            await f.persistence.saveRuntimeRoute(f.handle, { ...route, executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [f.model.modelProfileId],
                computeBudget: { maxRequests: 32, maxTokens: 128000, localWork: { maxJobs: 32, maxItems: 10000, maxInputBytes: 16777216 } } } });
            await f.request.post('/insert').send(body).expect(429);
            await f.persistence.saveRuntimeRoute(f.handle, { ...route, executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [f.model.modelProfileId] } });
            const backupPath = await snapshotUser({ handle: f.handle, userRoot: f.dirs.root, backupRoot: f.backupRoot, engine: f.engine });
            await restoreFromSnapshot({ handle: f.handle, userRoot: f.dirs.root, backupPath, engine: f.engine }); await f.engine.close();
            f.core.runs = new RunControl(new SessionRepo({ engine: f.engine }));
            await f.request.post('/insert').send(body).expect(429);
            expect(await readCompute(f)).toEqual(ledger); expect(await fs.readFile(indexFile(f, body))).toEqual(saved); expect(f.seen).toHaveLength(2);
            expect((await fs.readdir(path.dirname(path.dirname(indexFile(f, body))))).filter(name => name.startsWith('.atri-index-work-'))).toEqual([]);
        } finally { await f.cleanup(); }
    });
}
test.each(['items', 'bytes'])('G05 local index %s admission rejects before Embedding and preserves an existing index', async boundary => {
    const f = await fixture(makeTempFsEngine, 4, { ...localLimits, ...(boundary === 'items' ? { maxItems: 1 } : { maxInputBytes: 1 }) });
    try {
        const body = await embeddingBody(f), { computeContext: _context, ...old } = body;
        await f.request.post('/insert').send(old).expect(200);
        const saved = await fs.readFile(indexFile(f, body));
        const items = boundary === 'items' ? [body.items[0], { hash: 2, text: 'Another source', index: 1 }] : body.items;
        await f.request.post('/insert').send({ ...body, items }).expect(429);
        expect(f.seen).toHaveLength(1); expect(await readCompute(f)).toBeUndefined(); expect(await fs.readFile(indexFile(f, body))).toEqual(saved);
    } finally { await f.cleanup(); }
});
test('G05 local index actual Task mutation after Embedding cannot publish stale vectors or lose reported usage', async () => {
    const f = await fixture(makeTempFsEngine, 4, { ...localLimits, maxJobs: 1 });
    try {
        const body = await embeddingBody(f), { computeContext: _context, ...old } = body;
        await f.request.post('/insert').send(old).expect(200); const saved = await fs.readFile(indexFile(f, body));
        const source = projectSource(), project = await f.studio.createProject(f.handle, source);
        const task = await f.agent.createTask(f.handle, source.project.projectId, { intent: 'Index evidence', baseRevision: project.revision.revision });
        const context = { kind: 'project', projectId: source.project.projectId, taskId: task.taskId, revision: project.revision.revision };
        f.respondEmbedding(async () => {
            await f.agent.setPlan(f.handle, context.projectId, context.taskId, { summary: 'Changed task', steps: [{ id: 'read', title: 'Read evidence', impact: 'low' }] });
            return { data: [{ index: 0, embedding: [1, 0] }], usage: { total_tokens: 7 } };
        });
        const failed = await f.request.post('/insert').send({ ...body, computeContext: context });
        expect(failed.status).toBe(500); expect(failed.body.error).toBe('native_generation_task_stopped');
        expect(await fs.readFile(indexFile(f, body))).toEqual(saved);
        const ledger = (await f.agent.getTask(f.handle, context.projectId, context.taskId)).compute;
        expect(ledger.localWork[0]).toMatchObject({ status: 'settled', usage: { outcome: 'failed', cpuScope: 'process' } });
        expect(ledger.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 7 } });
        const route = f.routes.find(row => row.role === 'role.studio');
        await f.persistence.saveRuntimeRoute(f.handle, { ...route, executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [f.model.modelProfileId] } });
        await f.request.post('/insert').send({ ...body, computeContext: context }).expect(429); expect(f.seen).toHaveLength(2);
    } finally { await f.cleanup(); }
});
test.each(['cancel', 'upsert_failure'])('G05 local index %s discards staged changes and observes work without fabricating provider tokens', async scenario => {
    const f = await fixture(makeTempFsEngine, 4, localLimits), controller = new AbortController();
    let spy;
    try {
        const body = await embeddingBody(f), { computeContext: _context, ...old } = body;
        await f.request.post('/insert').send(old).expect(200); const saved = await fs.readFile(indexFile(f, body));
        const profile = await f.store.getExact(f.handle, body.nativeRetrievalRef), compute = await prepareRetrievalCompute({ ...f, context: f.body.computeContext, profile });
        const original = vectra.LocalIndex.prototype.upsertItem;
        let upserts = 0;
        if (scenario === 'upsert_failure') spy = jest.spyOn(vectra.LocalIndex.prototype, 'upsertItem').mockImplementation(function (...args) {
            if (++upserts === 2) throw new Error('Synthetic second upsert failure'); return original.apply(this, args);
        });
        const promise = insertNativeIndex({ indexPath: path.dirname(indexFile(f, body)), items: [body.items[0], { hash: 2, text: 'Second source', index: 1 }], compute, signal: controller.signal,
            getVectors: async () => { if (scenario === 'cancel') controller.abort(); return [[1, 0], [1, 0]]; } });
        await expect(promise).rejects.toThrow();
        expect(await fs.readFile(indexFile(f, body))).toEqual(saved);
        const ledger = await readCompute(f);
        expect(ledger.attempts).toEqual([]); expect(ledger.localWork[0]).toMatchObject({ status: 'settled', usage: { outcome: scenario === 'cancel' ? 'cancelled' : 'failed' } });
        expect(f.seen).toHaveLength(1);
        expect((await fs.readdir(path.dirname(path.dirname(indexFile(f, body))))).filter(name => name.startsWith('.atri-index-work-'))).toEqual([]);
    } finally { spy?.mockRestore(); await f.cleanup(); }
});
test('G05 local index cancelled queued work never charges or starts while the original writer holds its permit', async () => {
    const f = await fixture(makeTempFsEngine, 4, localLimits), controller = new AbortController();
    try {
        const body = await embeddingBody(f), profile = await f.store.getExact(f.handle, body.nativeRetrievalRef), compute = await prepareRetrievalCompute({ ...f, context: f.body.computeContext, profile });
        const indexPath = path.dirname(indexFile(f, body)); let release, entered;
        const ready = new Promise(resolve => { entered = resolve; }), waiting = new Promise(resolve => { release = resolve; });
        const blocker = withNativeIndexWrite(indexPath, undefined, async () => { entered(); await waiting; }); await ready;
        const vectors = jest.fn(async () => [[1, 0]]);
        const queued = insertNativeIndex({ indexPath, items: body.items, compute, signal: controller.signal, getVectors: vectors });
        const rejection = expect(queued).rejects.toMatchObject({ name: 'AbortError' }); controller.abort(); release(); await blocker; await rejection;
        expect(vectors).not.toHaveBeenCalled(); expect(await readCompute(f)).toBeUndefined(); expect(f.seen).toHaveLength(0);
    } finally { await f.cleanup(); }
});
test.each(['cancel', 'task_change'])('G05 local index %s during final publication mkdir cannot publish', async scenario => {
    const f = await fixture(makeTempFsEngine, 4, localLimits), controller = new AbortController(); let spy;
    try {
        const body = await embeddingBody(f), { computeContext: _context, ...old } = body;
        await f.request.post('/insert').send(old).expect(200); const saved = await fs.readFile(indexFile(f, body));
        const source = projectSource(), project = await f.studio.createProject(f.handle, source);
        const task = await f.agent.createTask(f.handle, source.project.projectId, { intent: 'Index evidence', baseRevision: project.revision.revision });
        const context = { kind: 'project', projectId: source.project.projectId, taskId: task.taskId, revision: project.revision.revision };
        const compute = await prepareRetrievalCompute({ ...f, context, profile: await f.store.getExact(f.handle, body.nativeRetrievalRef) });
        const indexPath = path.dirname(indexFile(f, body)), original = fs.mkdir;
        spy = jest.spyOn(fs, 'mkdir').mockImplementation(async (...args) => {
            if (args[0] === indexPath) {
                if (scenario === 'cancel') controller.abort();
                else await f.agent.setPlan(f.handle, context.projectId, context.taskId, { summary: 'Changed while waiting', steps: [{ id: 'read', title: 'Read evidence', impact: 'low' }] });
            }
            return original(...args);
        });
        await expect(insertNativeIndex({ indexPath, items: [{ hash: 2, text: 'New source', index: 1 }], compute, signal: controller.signal, getVectors: async () => [[1, 0]] })).rejects.toThrow();
        expect(await fs.readFile(indexFile(f, body))).toEqual(saved);
        const ledger = (await f.agent.getTask(f.handle, context.projectId, context.taskId)).compute;
        expect(ledger.localWork[0]).toMatchObject({ status: 'settled', usage: { outcome: scenario === 'cancel' ? 'cancelled' : 'failed' } });
        expect(ledger.attempts).toEqual([]);
    } finally { spy?.mockRestore(); await f.cleanup(); }
});
test('G05 local index failed atomic replacement keeps the original bytes and records actual local work', async () => {
    const f = await fixture(makeTempFsEngine, 4, localLimits); let spy;
    try {
        const body = await embeddingBody(f), { computeContext: _context, ...old } = body;
        await f.request.post('/insert').send(old).expect(200); const saved = await fs.readFile(indexFile(f, body));
        const compute = await prepareRetrievalCompute({ ...f, context: f.body.computeContext, profile: await f.store.getExact(f.handle, body.nativeRetrievalRef) });
        const original = fsSync.renameSync;
        spy = jest.spyOn(fsSync, 'renameSync').mockImplementation((from, to) => {
            if (path.resolve(to) === path.resolve(indexFile(f, body))) throw new Error('Synthetic commit rename failure');
            return original(from, to);
        });
        await expect(insertNativeIndex({ indexPath: path.dirname(indexFile(f, body)), items: [{ hash: 2, text: 'New evidence', index: 1 }], compute, getVectors: async () => [[1, 0]] })).rejects.toThrow('Synthetic commit rename failure');
        expect(await fs.readFile(indexFile(f, body))).toEqual(saved);
        const ledger = await readCompute(f); expect(ledger.attempts).toEqual([]); expect(ledger.localWork[0]).toMatchObject({ status: 'settled', usage: { outcome: 'failed' } });
        expect(await fs.readdir(path.dirname(indexFile(f, body)))).toEqual(['index.json']);
    } finally { spy?.mockRestore(); await f.cleanup(); }
});
for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`G05 local index ${kind} interrupted charged work survives account recovery without fake model sends`, async () => {
        const f = await fixture(make, 4, { ...localLimits, maxJobs: 1 });
        try {
            const body = await embeddingBody(f), profile = await f.store.getExact(f.handle, body.nativeRetrievalRef);
            const compute = await prepareRetrievalCompute({ ...f, context: f.body.computeContext, profile });
            await compute.beforeLocalWork({ items: 1, inputBytes: 128, indexPath: path.dirname(indexFile(f, body)) });
            const ledger = await readCompute(f); expect(ledger.localWork[0]).toMatchObject({ status: 'charged', usage: null }); expect(ledger.attempts).toEqual([]);
            const backupPath = await snapshotUser({ handle: f.handle, userRoot: f.dirs.root, backupRoot: f.backupRoot, engine: f.engine });
            await restoreFromSnapshot({ handle: f.handle, userRoot: f.dirs.root, backupPath, engine: f.engine }); await f.engine.close();
            f.core.runs = new RunControl(new SessionRepo({ engine: f.engine }));
            await f.request.post('/insert').send(body).expect(429); expect(await readCompute(f)).toEqual(ledger); expect(f.seen).toHaveLength(0);
        } finally { await f.cleanup(); }
    });
}
test('G05 local index work limits survive a real Narrator charge while model quota remains independent', async () => {
    const f = await fixture(makeTempFsEngine, 3, { ...localLimits, maxJobs: 1 });
    try {
        const body = await embeddingBody(f); await f.request.post('/insert').send(body).expect(200);
        const local = (await readCompute(f)).localWork;
        const host = new NativeGenerationHost({ ...f, sessionCore: f.core,
            providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'synthetic-key' } });
        await host.execute(f.handle, { sessionId: f.base.session.sessionId, revisionId: f.base.revision.revisionId, requestId: 'local-work-narration', role: 'narrator' });
        await f.request.post('/insert').send(body).expect(429);
        const ledger = await readCompute(f); expect(ledger.localWork).toEqual(local); expect(ledger.attempts.map(row => row.usage.totalTokens)).toEqual([3, 15]);
        expect(ledger.limits.localWork.maxJobs).toBe(1); expect(f.seen).toHaveLength(2);
    } finally { await f.cleanup(); }
});
test('G05 local index bounds existing files and returned vectors before indexing while retaining real Embedding usage', async () => {
    const f = await fixture(makeTempFsEngine, 4, localLimits);
    try {
        const body = await embeddingBody(f), { computeContext: _context, ...old } = body;
        await f.request.post('/insert').send(old).expect(200); const saved = await fs.readFile(indexFile(f, body));
        f.respondEmbedding(() => ({ data: [{ index: 0, embedding: Array(65537).fill(1) }], usage: { total_tokens: 7 } }));
        const rejected = await f.request.post('/insert').send(body);
        expect(rejected.status).toBe(503); expect(rejected.body.error).toBe('native_retrieval_compute_unavailable');
        expect(await fs.readFile(indexFile(f, body))).toEqual(saved);
        await fs.appendFile(indexFile(f, body), ' '.repeat(16777216));
        const oversized = await fs.readFile(indexFile(f, body));
        await f.request.post('/insert').send(body).expect(503);
        expect((await fs.readFile(indexFile(f, body))).equals(oversized)).toBe(true);
        const ledger = await readCompute(f); expect(ledger.attempts).toHaveLength(1); expect(ledger.attempts[0].usage.totalTokens).toBe(7);
        expect(ledger.localWork.map(row => row.usage.outcome)).toEqual(['failed', 'failed']); expect(f.seen).toHaveLength(2);
    } finally { await f.cleanup(); }
});

for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`G05 local query ${kind} single and multi requests share original insert work limits after concurrent admission and recovery`, async () => {
        const f = await fixture(make, 6, { ...localLimits, maxJobs: 3, maxItems: 4 });
        try {
            const body = await embeddingBody(f); await f.request.post('/insert').send(body).expect(200);
            const { items: _items, ...query } = body, saved = await fs.readFile(indexFile(f, body));
            const multi = await f.request.post('/query-multi').send({ ...query, collectionId: undefined, collectionIds: [body.collectionId, 'missing-index'], searchText: 'Current source' }).expect(200);
            expect(multi.body[body.collectionId].hashes).toEqual([1]);
            const responses = await Promise.all([1, 2].map(() => f.request.post('/query').send({ ...query, searchText: 'Current source', includeVectors: true })));
            expect(responses.map(row => row.status).sort()).toEqual([200, 429]);
            expect(responses.find(row => row.status === 200).body).toMatchObject({ hashes: [1], queryVector: [1, 0], metadata: [{ vector: [1, 0] }] });
            const ledger = await readCompute(f);
            expect(ledger.localWork.map(row => row.kind)).toEqual(['index_insert', 'index_query', 'index_query']);
            expect(ledger.localWork.map(row => row.estimatedItems)).toEqual([1, 2, 1]);
            expect(ledger.localWork.every(row => row.status === 'settled' && row.usage.cpuScope === 'process' && row.usage.outcome === 'completed')).toBe(true);
            expect(ledger.attempts.map(row => row.usage.totalTokens)).toEqual([3, 3, 3]); expect(f.seen).toHaveLength(3);
            const route = f.routes.find(row => row.role === 'role.narrator');
            await f.persistence.saveRuntimeRoute(f.handle, { ...route, executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [f.model.modelProfileId] } });
            const backupPath = await snapshotUser({ handle: f.handle, userRoot: f.dirs.root, backupRoot: f.backupRoot, engine: f.engine });
            await restoreFromSnapshot({ handle: f.handle, userRoot: f.dirs.root, backupPath, engine: f.engine }); await f.engine.close();
            f.core.runs = new RunControl(new SessionRepo({ engine: f.engine }));
            await f.request.post('/query').send({ ...query, searchText: 'Current source' }).expect(429);
            expect(await readCompute(f)).toEqual(ledger); expect(await fs.readFile(indexFile(f, body))).toEqual(saved); expect(f.seen).toHaveLength(3);
        } finally { await f.cleanup(); }
    });
}
test('G05 local query empty indexes return no candidates without file creation or invented model usage', async () => {
    const f = await fixture(makeTempFsEngine, 4, localLimits);
    try {
        const body = await embeddingBody(f), { items: _items, ...query } = body;
        expect((await f.request.post('/query').send({ ...query, searchText: 'No evidence' }).expect(200)).body).toEqual({ hashes: [], metadata: [] });
        expect((await f.request.post('/query-multi').send({ ...query, collectionId: undefined, collectionIds: ['empty-a', 'empty-b'], searchText: 'No evidence' }).expect(200)).body).toEqual({});
        const ledger = await readCompute(f); expect(ledger.attempts).toEqual([]); expect(ledger.localWork.map(row => row.estimatedItems)).toEqual([1, 2]);
        expect(ledger.localWork.every(row => row.usage.outcome === 'completed')).toBe(true); expect(f.seen).toHaveLength(0);
        await expect(fs.access(path.dirname(indexFile(f, body)))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await f.cleanup(); }
});
test('G05 local query physical read permit preserves the existing unscoped read-only path', async () => {
    const f = await fixture(makeTempFsEngine);
    try {
        const body = await embeddingBody(f), { computeContext: _context, ...old } = body;
        await f.request.post('/insert').send(old).expect(200); const saved = await fs.readFile(indexFile(f, body));
        setReadOnly(true); const { items: _items, ...query } = old;
        expect((await f.request.post('/query').send({ ...query, searchText: 'Current source' }).expect(200)).body.hashes).toEqual([1]);
        expect(await fs.readFile(indexFile(f, body))).toEqual(saved); expect(f.seen).toHaveLength(2);
    } finally { setReadOnly(false); await f.cleanup(); }
});
test('G05 local query corrupt index is preserved and refuses before Embedding without pretending free CPU', async () => {
    const f = await fixture(makeTempFsEngine, 4, localLimits);
    try {
        const body = await embeddingBody(f), { computeContext: _context, ...old } = body;
        await f.request.post('/insert').send(old).expect(200); await fs.writeFile(indexFile(f, body), '{broken');
        const { items: _items, ...query } = body;
        await f.request.post('/query').send({ ...query, searchText: 'Current source' }).expect(500);
        expect((await fs.readFile(indexFile(f, body))).toString()).toBe('{broken'); expect(f.seen).toHaveLength(1);
        const ledger = await readCompute(f); expect(ledger.attempts).toEqual([]); expect(ledger.localWork[0]).toMatchObject({ kind: 'index_query', status: 'settled', usage: { outcome: 'failed' } });
    } finally { await f.cleanup(); }
});
test('G05 local query bounded collection identities, query bytes and topK reject before either budget lane', async () => {
    const f = await fixture(makeTempFsEngine, 4, localLimits);
    try {
        const body = await embeddingBody(f), { items: _items, collectionId, ...query } = body;
        for (const collectionIds of [[collectionId, collectionId], Array.from({ length: 17 }, (_, i) => 'index-' + i)]) {
            await f.request.post('/query-multi').send({ ...query, collectionIds, searchText: 'Current source' }).expect(503);
        }
        for (const extra of [{ searchText: 'x'.repeat(8193) }, { topK: 101 }]) await f.request.post('/query').send({ ...query, collectionId, searchText: 'Current source', ...extra }).expect(503);
        expect(await readCompute(f)).toBeUndefined(); expect(f.seen).toHaveLength(0);
    } finally { await f.cleanup(); }
});
test('G05 local query actual Task change during Embedding refuses old results and retains actual usage', async () => {
    const f = await fixture(makeTempFsEngine, 4, localLimits);
    try {
        const body = await embeddingBody(f), { computeContext: _context, ...old } = body;
        await f.request.post('/insert').send(old).expect(200); const saved = await fs.readFile(indexFile(f, body));
        const source = projectSource(), project = await f.studio.createProject(f.handle, source);
        const task = await f.agent.createTask(f.handle, source.project.projectId, { intent: 'Query evidence', baseRevision: project.revision.revision });
        const context = { kind: 'project', projectId: source.project.projectId, taskId: task.taskId, revision: project.revision.revision };
        f.respondEmbedding(async () => {
            await f.agent.setPlan(f.handle, context.projectId, context.taskId, { summary: 'Changed query scope', steps: [{ id: 'read', title: 'Read evidence', impact: 'low' }] });
            return { data: [{ index: 0, embedding: [1, 0] }], usage: { total_tokens: 7 } };
        });
        const { items: _items, ...query } = body;
        const rejected = await f.request.post('/query').send({ ...query, computeContext: context, searchText: 'Current source' });
        expect(rejected.status).toBe(500); expect(rejected.body).toEqual({ error: 'native_generation_task_stopped' });
        const ledger = (await f.agent.getTask(f.handle, context.projectId, context.taskId)).compute;
        expect(ledger.attempts[0].usage.totalTokens).toBe(7); expect(ledger.localWork[0].usage.outcome).toBe('failed');
        expect(await fs.readFile(indexFile(f, body))).toEqual(saved);
    } finally { await f.cleanup(); }
});
test.each(['cancel', 'task_change'])('G05 local query %s after cost settlement refuses results without refunding completed work', async scenario => {
    const f = await fixture(makeTempFsEngine, 4, localLimits), controller = new AbortController();
    try {
        const body = await embeddingBody(f), { computeContext: _context, ...old } = body;
        await f.request.post('/insert').send(old).expect(200);
        const source = projectSource(), project = await f.studio.createProject(f.handle, source);
        const task = await f.agent.createTask(f.handle, source.project.projectId, { intent: 'Query evidence', baseRevision: project.revision.revision });
        const context = { kind: 'project', projectId: source.project.projectId, taskId: task.taskId, revision: project.revision.revision };
        const compute = await prepareRetrievalCompute({ ...f, context, profile: await f.store.getExact(f.handle, body.nativeRetrievalRef) });
        const wrapped = { ...compute, async settleLocalWork(ticket, usage) {
            await compute.settleLocalWork(ticket, usage);
            if (scenario === 'cancel') controller.abort();
            else await f.agent.setPlan(f.handle, context.projectId, context.taskId, { summary: 'Changed after settlement', steps: [{ id: 'read', title: 'Read evidence', impact: 'low' }] });
        } };
        await expect(queryNativeIndexes({ indexes: [{ collectionId: body.collectionId, indexPath: path.dirname(indexFile(f, body)) }], query: 'Current source', topK: 1, threshold: 0,
            compute: wrapped, signal: controller.signal, getVector: async () => (await getOpenAIBatchVector(['Current source'], 'openai', f.dirs, 'test-embed',
                { reverseProxy: f.profile.endpoint, proxyPassword: 'synthetic-key' }, { nativeRetrieval: { compute, signal: controller.signal } }))[0] })).rejects.toThrow();
        const ledger = (await f.agent.getTask(f.handle, context.projectId, context.taskId)).compute;
        expect(ledger.attempts[0].usage.totalTokens).toBe(3); expect(ledger.localWork[0].usage.outcome).toBe('completed'); expect(f.seen).toHaveLength(2);
    } finally { await f.cleanup(); }
});
test('G05 local query reversed multi-index requests use one ordered physical permit set without deadlock or double model charge', async () => {
    const f = await fixture(makeTempFsEngine, 2, { ...localLimits, maxJobs: 2, maxItems: 4 });
    try {
        const body = await embeddingBody(f), { computeContext: _context, ...old } = body;
        for (const collectionId of ['left', 'right']) await f.request.post('/insert').send({ ...old, collectionId }).expect(200);
        const { items: _items, collectionId: _collectionId, ...query } = body;
        const results = await Promise.all([['left', 'right'], ['right', 'left']].map(collectionIds => f.request.post('/query-multi').send({ ...query, collectionIds, searchText: 'Current source' })));
        expect(results.map(row => row.status)).toEqual([200, 200]); for (const result of results) expect(Object.keys(result.body).sort()).toEqual(['left', 'right']);
        const ledger = await readCompute(f); expect(ledger.localWork.map(row => row.estimatedItems)).toEqual([2, 2]); expect(ledger.attempts).toHaveLength(2); expect(f.seen).toHaveLength(4);
    } finally { await f.cleanup(); }
});
test('G05 local query cancellation while queued starts neither work nor provider send', async () => {
    const f = await fixture(makeTempFsEngine, 4, localLimits), controller = new AbortController();
    try {
        const body = await embeddingBody(f), indexPath = path.dirname(indexFile(f, body));
        const compute = await prepareRetrievalCompute({ ...f, context: f.body.computeContext, profile: await f.store.getExact(f.handle, body.nativeRetrievalRef) });
        let release, entered;
        const ready = new Promise(resolve => { entered = resolve; }), waiting = new Promise(resolve => { release = resolve; });
        const blocker = withNativeIndexWrite(indexPath, undefined, async () => { entered(); await waiting; }); await ready;
        const vector = jest.fn(async () => [1, 0]);
        const query = queryNativeIndexes({ indexes: [{ collectionId: body.collectionId, indexPath }], query: 'Current source', topK: 1, threshold: 0, compute, signal: controller.signal, getVector: vector });
        const rejected = expect(query).rejects.toMatchObject({ name: 'AbortError' }); controller.abort(); release(); await blocker; await rejected;
        expect(vector).not.toHaveBeenCalled(); expect(await readCompute(f)).toBeUndefined(); expect(f.seen).toHaveLength(0);
    } finally { await f.cleanup(); }
});
test('G05 local query bounded candidate and vector scans reject before Embedding and preserve the original file', async () => {
    const f = await fixture(makeTempFsEngine, 4, localLimits);
    try {
        const body = await embeddingBody(f), { computeContext: _context, ...old } = body;
        await f.request.post('/insert').send(old).expect(200); const original = JSON.parse((await fs.readFile(indexFile(f, body))).toString());
        const { items: _items, ...query } = body;
        const item = original.items[0], long = { ...item, vector: Array(65536).fill(1) };
        for (const items of [Array(10001).fill(item), [{ ...item, vector: Array(65537).fill(1) }], Array(17).fill(long)]) {
            const file = Buffer.from(JSON.stringify({ ...original, items })); await fs.writeFile(indexFile(f, body), file);
            await f.request.post('/query').send({ ...query, searchText: 'Current source' }).expect(503);
            expect((await fs.readFile(indexFile(f, body))).equals(file)).toBe(true);
        }
        const ledger = await readCompute(f); expect(ledger.attempts).toEqual([]); expect(ledger.localWork.map(row => row.usage.outcome)).toEqual(['failed', 'failed', 'failed']); expect(f.seen).toHaveLength(1);
    } finally { await f.cleanup(); }
});
(process.platform === 'win32' ? test : test.skip)('G05 local query Windows collection case aliases cannot duplicate one physical index', async () => {
    const f = await fixture(makeTempFsEngine, 4, localLimits);
    try {
        const body = await embeddingBody(f), { computeContext: _context, ...old } = body;
        await f.request.post('/insert').send(old).expect(200);
        const { items: _items, collectionId, ...query } = body;
        await f.request.post('/query-multi').send({ ...query, collectionIds: [collectionId, collectionId.toUpperCase()], searchText: 'Current source' }).expect(503);
        expect(await readCompute(f)).toBeUndefined(); expect(f.seen).toHaveLength(1);
    } finally { await f.cleanup(); }
});

for (const [kind, make] of [['fs', makeTempFsEngine], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`G05 ${kind} Embedding batches and narration consume the same original Run allowance`, async () => {
        const f = await fixture(make, 3);
        try {
            const body = await embeddingBody(f, Array.from({ length: 11 }, (_, index) => ({ hash: index + 1, text: 'Legal source ' + index, index })));
            await f.request.post('/insert').send(body).expect(200);
            expect(f.seen.map(row => row.body.input.length)).toEqual([10, 1]);
            const host = new NativeGenerationHost({ ...f, sessionCore: f.core,
                providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'synthetic-key' } });
            await host.execute(f.handle, { sessionId: f.base.session.sessionId, revisionId: f.base.revision.revisionId, requestId: 'shared-embedding-narration', role: 'narrator' });
            const { items: _items, ...query } = body;
            await f.request.post('/query').send({ ...query, searchText: 'Legal source' }).expect(429);
            expect(f.seen).toHaveLength(3);
            const ledger = Object.values((await f.core.runs.status(f.handle, f.base.session.sessionId)).operations).find(row => row.compute).compute;
            expect(ledger.attempts.map(row => row.status)).toEqual(['settled', 'settled', 'settled']);
            expect(ledger.attempts.map(row => row.usage.totalTokens)).toEqual([3, 3, 15]);
            expect(new Set(ledger.attempts.map(row => row.attemptId)).size).toBe(3);
            expect(ledger.attempts[0].targetFingerprint).not.toBe(ledger.attempts[2].targetFingerprint);
        } finally { await f.cleanup(); }
    });
}

test('G05 query-multi spends one actual Embedding send; concurrent queries cannot exceed the remaining Run allowance', async () => {
    const f = await fixture(makeTempFsEngine, 2);
    try {
        const body = await embeddingBody(f);
        await f.request.post('/insert').send(body).expect(200);
        const { items: _items, collectionId, ...query } = body;
        const responses = await Promise.all([f.request.post('/query-multi').send({ ...query, collectionIds: [collectionId], searchText: 'evidence' }),
            f.request.post('/query').send({ ...query, collectionId, searchText: 'evidence' })]);
        expect(responses.map(row => row.status).sort()).toEqual([200, 429]);
        expect(f.seen).toHaveLength(2);
        const ledger = Object.values((await f.core.runs.status(f.handle, f.base.session.sessionId)).operations).find(row => row.compute).compute;
        expect(ledger.attempts).toHaveLength(2);
    } finally { await f.cleanup(); }
});

test('G05 scoped Embedding retains unknown cancellation and shares the original Project Task budget', async () => {
    const f = await fixture(makeTempFsEngine, 2), controller = new AbortController();
    try {
        const body = await embeddingBody(f), profile = await f.store.getExact(f.handle, body.nativeRetrievalRef);
        const source = projectSource(), project = await f.studio.createProject(f.handle, source);
        const task = await f.agent.createTask(f.handle, source.project.projectId, { intent: 'Read source evidence', baseRevision: project.revision.revision });
        const context = { kind: 'project', projectId: source.project.projectId, taskId: task.taskId, revision: project.revision.revision };
        const stale = await prepareRetrievalCompute({ ...f, context, profile });
        await f.agent.setPlan(f.handle, context.projectId, context.taskId, { summary: 'Changed task', steps: [{ id: 'read', title: 'Read evidence', impact: 'low' }] });
        const send = compute => getOpenAIBatchVector(['Legal evidence'], 'openai', f.dirs, profile.model,
            { reverseProxy: profile.endpoint, proxyPassword: 'synthetic-key' }, { nativeRetrieval: { compute, signal: controller.signal } });
        await expect(send(stale)).rejects.toMatchObject({ code: 'native_generation_task_stopped' });
        expect(f.seen).toHaveLength(0);
        const compute = await prepareRetrievalCompute({ ...f, context, profile });
        f.respondEmbedding(() => { controller.abort(); return { data: [{ index: 0, embedding: [1, 0] }] }; });
        await expect(send(compute)).rejects.toMatchObject({ name: 'AbortError' });
        expect((await f.agent.getTask(f.handle, context.projectId, context.taskId)).compute.attempts[0]).toMatchObject({ status: 'unknown', usage: null });
        await f.request.post('/insert').send({ ...body, computeContext: context }).expect(200);
        await f.request.post('/insert').send({ ...body, computeContext: context }).expect(429);
        expect(f.seen).toHaveLength(2);
        expect((await f.agent.getTask(f.handle, context.projectId, context.taskId)).compute.attempts).toHaveLength(2);
    } finally { await f.cleanup(); }
});

test('G05 scoped Embedding keeps old unbounded Routes and rejects unsupported budgeted providers before inference', async () => {
    const f = await fixture(makeTempFsEngine);
    try {
        const body = await embeddingBody(f), profile = await f.store.getExact(f.handle, body.nativeRetrievalRef);
        const unsupported = { ...profile, retrievalProfileId: createNativeId('retrievalProfile'), source: 'transformers', endpoint: '', secretRef: undefined };
        await f.store.commit(f.handle, unsupported);
        expect((await f.request.post('/insert').send({ ...body, nativeRetrievalRef: retrievalRef(unsupported) }).expect(400)).body.error)
            .toBe('native_retrieval_compute_unavailable');
        expect(f.seen).toHaveLength(0);
        const route = f.routes.find(row => row.role === 'role.narrator');
        await f.persistence.saveRuntimeRoute(f.handle, { ...route, executionPolicy: undefined });
        await f.request.post('/insert').send(body).expect(200);
        expect(f.seen).toHaveLength(1);
        expect(Object.values((await f.core.runs.status(f.handle, f.base.session.sessionId))?.operations ?? {}).every(row => !row.compute)).toBe(true);
    } finally { await f.cleanup(); }
});

test.each(['session', 'project'])('G05 %s scoped Embedding keeps the durable limit after Route budget removal', async lane => {
    const f = await fixture(makeTempFsEngine, 1);
    try {
        const body = await embeddingBody(f);
        let context = body.computeContext;
        if (lane === 'project') {
            const source = projectSource(), project = await f.studio.createProject(f.handle, source);
            const task = await f.agent.createTask(f.handle, source.project.projectId, { intent: 'Read evidence', baseRevision: project.revision.revision });
            context = { kind: 'project', projectId: source.project.projectId, taskId: task.taskId, revision: project.revision.revision };
        }
        await f.request.post('/insert').send({ ...body, computeContext: context }).expect(200);
        const route = f.routes.find(row => row.role === (lane === 'project' ? 'role.studio' : 'role.narrator'));
        await f.persistence.saveRuntimeRoute(f.handle, { ...route, executionPolicy: undefined });
        const { items: _items, ...query } = body;
        await f.request.post('/query').send({ ...query, computeContext: context, searchText: 'evidence' }).expect(429);
        expect(f.seen).toHaveLength(1);
    } finally { await f.cleanup(); }
});

test('G05 denied later Embedding batch keeps the prior index and charged first send', async () => {
    const f = await fixture(makeTempFsEngine, 1);
    try {
        const body = await embeddingBody(f);
        await f.request.post('/insert').send({ ...body, computeContext: undefined }).expect(200);
        const replacements = Array.from({ length: 11 }, (_, index) => ({ hash: index + 100, text: 'New source ' + index, index }));
        expect((await f.request.post('/insert').send({ ...body, items: replacements }).expect(429)).body.error)
            .toBe('native_generation_budget_exhausted');
        const found = await f.request.post('/query-by-vector').send({ nativeRetrievalRef: body.nativeRetrievalRef,
            collectionId: body.collectionId, vector: [1, 0] }).expect(200);
        expect(found.body.hashes).toEqual([1]); expect(f.seen).toHaveLength(2);
        const ledger = Object.values((await f.core.runs.status(f.handle, f.base.session.sessionId)).operations).find(row => row.compute).compute;
        expect(ledger.attempts).toHaveLength(1);
        expect(ledger.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 3 } });
    } finally { await f.cleanup(); }
});

test.each([3, 1])('G05 local list actual Memory consumer forwards its original anchor and shares %i work jobs', async jobs => {
    jest.unstable_mockModule('../../public/script.js', () => ({ getRequestHeaders: () => ({}) }));
    const { NativeRetrievalService } = await import('../../public/scripts/native/retrieval-client.js');
    const f = await fixture(makeTempFsEngine, 2, { maxJobs: jobs, maxItems: 64, maxInputBytes: 65536 }), previousFetch = globalThis.fetch, previousAtria = globalThis.Atria, calls = [];
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    try {
        const body = await embeddingBody(f);
        globalThis.Atria = { getContext: () => ({ getRequestHeaders: () => ({}) }) };
        globalThis.fetch = async (url, options) => {
            if (url.endsWith('/retrieval')) return { ok: true, json: async () => f.store.list(f.handle) };
            const payload = JSON.parse(options.body); calls.push({ url, payload });
            const result = await f.request.post(url.replace('/api/vector', '')).send(payload);
            return { ok: result.status < 400, headers: new Headers({ 'content-type': 'application/json' }), json: async () => result.body };
        };
        const chat = [{ memory_os_source_id: 'source-a', mes: 'Alice lives by the harbor.' }];
        const state = emptyProvenance(); state.scopeId = 'chat'; captureEpisodes(state, chat, [0], state.scopeId);
        const snapshot = { state, chat, key: state.scopeId, assertCurrent: jest.fn() };
        const result = await retrieveMemory(snapshot, 'Alice harbor', { service: NativeRetrievalService,
            profile: { nativeRetrievalRef: body.nativeRetrievalRef, source: 'native', model: 'exact-fixture' },
            countTokens: async text => text.length, computeContext: body.computeContext });
        expect(calls[0]).toMatchObject({ url: '/api/vector/list', payload: { computeContext: body.computeContext } });
        if (jobs === 3) {
            expect(result.diagnostics).not.toContain('vector_unavailable');
            expect(calls.filter(row => /\/(insert|query)$/.test(row.url)).map(row => row.payload.computeContext)).toEqual([body.computeContext, body.computeContext]);
        } else expect(result.diagnostics).toContain('vector_unavailable');
        expect(result.sourceMessageIds).toEqual(['source-a']); expect(f.seen).toHaveLength(jobs === 3 ? 2 : 0);
        const ledger = Object.values((await f.core.runs.status(f.handle, f.base.session.sessionId)).operations).find(row => row.compute).compute;
        expect(ledger.attempts.map(row => row.status)).toEqual(jobs === 3 ? ['settled', 'settled'] : []);
        expect(ledger.localWork.map(row => row.kind)).toEqual(jobs === 3 ? ['index_list', 'index_insert', 'index_query'] : ['index_list']);
    } finally { globalThis.fetch = previousFetch; globalThis.Atria = previousAtria; await f.cleanup(); }
});
test('G05 local delete actual Hybrid delta forwards computeContext and removes only stale derived hashes', async () => {
    jest.unstable_mockModule('../../public/script.js', () => ({ getRequestHeaders: () => ({}) }));
    const { NativeRetrievalService } = await import('../../public/scripts/native/retrieval-client.js');
    const f = await fixture(makeTempFsEngine, 4, { maxJobs: 7, maxItems: 64, maxInputBytes: 65536 });
    const previousFetch = globalThis.fetch, previousAtria = globalThis.Atria, calls = [];
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    try {
        const body = await embeddingBody(f); globalThis.Atria = { getContext: () => ({ getRequestHeaders: () => ({}) }) };
        globalThis.fetch = async (url, options) => {
            if (url.endsWith('/retrieval')) return { ok: true, json: async () => f.store.list(f.handle) };
            const payload = JSON.parse(options.body); calls.push({ url, payload });
            const result = await f.request.post(url.replace('/api/vector', '')).send(payload);
            return { ok: result.status < 400, headers: new Headers({ 'content-type': 'application/json' }), json: async () => result.body };
        };
        const chat = [{ memory_os_source_id: 'source-a', mes: 'Alice lives by the harbor.' }], state = emptyProvenance(); state.scopeId = 'chat';
        const snapshot = { state, chat, key: state.scopeId, assertCurrent: jest.fn() };
        const options = { service: NativeRetrievalService, profile: { nativeRetrievalRef: body.nativeRetrievalRef, source: 'native', model: 'exact-fixture' },
            countTokens: async text => text.length, computeContext: body.computeContext };
        captureEpisodes(state, chat, [0], state.scopeId);
        expect((await retrieveMemory(snapshot, 'Alice', options)).diagnostics).not.toContain('vector_unavailable');
        const initialHash = calls.find(row => row.url.endsWith('/insert')).payload.items[0].hash;
        chat[0].mes = 'Alice now lives in the mountains.'; captureEpisodes(state, chat, [0], state.scopeId);
        const result = await retrieveMemory(snapshot, 'Alice', options);
        expect(result.diagnostics).not.toContain('vector_unavailable'); expect(result.sourceMessageIds).toEqual(['source-a']);
        const deleted = calls.filter(row => row.url.endsWith('/delete'));
        expect(deleted).toHaveLength(1); expect(deleted[0].payload).toMatchObject({ computeContext: body.computeContext, hashes: [initialHash] });
        const actual = JSON.parse((await fs.readFile(indexFile(f, { ...body, collectionId: deleted[0].payload.collectionId }))).toString());
        const retained = actual.items.map(item => item.metadata.hash), replacement = calls.filter(row => row.url.endsWith('/insert')).at(-1).payload.items.map(item => item.hash);
        expect(retained).not.toContain(initialHash); expect(retained.sort()).toEqual(replacement.sort());
        const ledger = await readCompute(f);
        expect(ledger.localWork.map(row => row.kind)).toEqual(['index_list', 'index_insert', 'index_query', 'index_list', 'index_delete', 'index_insert', 'index_query']);
        expect(ledger.attempts).toHaveLength(4); expect(f.seen).toHaveLength(4);
        expect(chat[0].mes).toBe('Alice now lives in the mountains.'); expect((await f.core.load(f.handle, f.base.session.sessionId)).timeline).toEqual(f.base.timeline);
    } finally { globalThis.fetch = previousFetch; globalThis.Atria = previousAtria; await f.cleanup(); }
});

test('G05 rejected Embedding vectors preserve usage and stale source never reaches provider HTTP', async () => {
    const f = await fixture(makeTempFsEngine);
    try {
        const body = await embeddingBody(f);
        await f.request.post('/insert').send({ ...body, computeContext: { ...body.computeContext, revisionId: createNativeId('revision') } }).expect(400);
        expect(f.seen).toHaveLength(0);
        f.respondEmbedding(() => ({ data: null, usage: { total_tokens: 7, prompt_tokens: 7 } }));
        await f.request.post('/insert').send(body).expect(500);
        expect(f.seen).toHaveLength(1);
        const ledger = Object.values((await f.core.runs.status(f.handle, f.base.session.sessionId)).operations).find(row => row.compute).compute;
        expect(ledger.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 7, inputTokens: 7, outputTokens: null } });
    } finally { await f.cleanup(); }
});

for (const [kind, make] of [['fs', makeTempFsEngine], ['sqlite', makeTempSqliteEngineHarness]]) {
    test.each(['session', 'project'])(`G06 ${kind} %s effective limits survive Route relaxation/removal and diagnostics match durable receipts`, async lane => {
        const f = await fixture(make, 2);
        try {
            let context;
            if (lane === 'project') {
                const source = projectSource(), project = await f.studio.createProject(f.handle, source);
                const task = await f.agent.createTask(f.handle, source.project.projectId, { intent: 'Inspect current evidence', baseRevision: project.revision.revision });
                context = { projectId: source.project.projectId, taskId: task.taskId, revision: project.revision.revision, role: 'studio' };
            } else context = { sessionId: f.base.session.sessionId, revisionId: f.base.revision.revisionId, role: 'narrator' };
            const host = new NativeGenerationHost({ ...f, sessionCore: f.core,
                providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'synthetic-key' } });
            const readLedger = async () => lane === 'project'
                ? (await f.agent.getTask(f.handle, context.projectId, context.taskId)).compute
                : Object.values((await f.core.runs.status(f.handle, context.sessionId)).operations).find(row => row.compute).compute;
            const send = requestId => host.execute(f.handle, { ...context, requestId });
            const first = await send('g06-first');
            expect(first.routing.compute).toMatchObject({ limits: { maxRequests: 2, maxTokens: 64000 }, observationScope: 'current_request', currencyStatus: 'unavailable' });
            expect(first.routing.compute.attempts).toEqual((await readLedger()).attempts);
            const route = f.routes.find(row => row.role === 'role.' + context.role);
            const executionPolicy = { schemaVersion: 1, allowedModelProfileIds: [f.model.modelProfileId], computeBudget: { maxRequests: 32, maxTokens: 128000 } };
            await f.persistence.saveRuntimeRoute(f.handle, { ...route, executionPolicy });
            const second = await send('g06-relaxed');
            expect(second.routing.compute.limits).toEqual({ maxRequests: 2, maxTokens: 64000 });
            expect(second.routing.compute.attempts).toEqual((await readLedger()).attempts.slice(1));
            delete executionPolicy.computeBudget;
            await f.persistence.saveRuntimeRoute(f.handle, { ...route, executionPolicy });
            await expect(send('g06-disabled')).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
            expect(f.seen).toHaveLength(2); expect((await readLedger()).attempts).toHaveLength(2);
        } finally { await f.cleanup(); }
    });
    test(`G05 ${kind} actual rerank and Narrator sends share one durable operation allowance`, async () => {
        const f = await fixture(make);
        try {
            await f.request.post('/rerank').send(f.body).expect(200);
            const host = new NativeGenerationHost({ persistence: f.persistence, library: f.library, sessionCore: f.core,
                providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'synthetic-key' } });
            await host.execute(f.handle, { sessionId: f.base.session.sessionId, revisionId: f.base.revision.revisionId, requestId: 'fresh-narration', role: 'narrator' });
            await f.request.post('/rerank').send(f.body).expect(429);
            const op = Object.values((await f.core.runs.status(f.handle, f.base.session.sessionId)).operations).find(row => row.compute);
            expect(f.seen).toHaveLength(2); expect(op.compute.attempts).toHaveLength(2);
            expect(op.compute.attempts.map(row => row.status)).toEqual(['unknown', 'settled']);
            expect(op.compute.attempts[0].estimatedTokens).toBeGreaterThan(0);
            expect(op.compute.attempts[1].usage.totalTokens).toBe(15);
        } finally { await f.cleanup(); }
    });
    test(`G05 ${kind} concurrent rerank requests cannot spend the same remaining request`, async () => {
        const f = await fixture(make, 1);
        try {
            const results = await Promise.all([f.request.post('/rerank').send(f.body), f.request.post('/rerank').send(f.body)]);
            expect(results.map(result => result.status).sort()).toEqual([200, 429]); expect(f.seen).toHaveLength(1);
            await f.request.post('/rerank').send(f.body).expect(429);
            const op = Object.values((await f.core.runs.status(f.handle, f.base.session.sessionId)).operations).find(row => row.compute);
            expect(op.compute.attempts).toHaveLength(1); expect(op.compute.attempts[0].status).toBe('unknown');
        } finally { await f.cleanup(); }
    });
}
test('G05 rejected rerank output retains directly reported usage; stale and malformed input never sends', async () => {
    const f = await fixture(makeTempFsEngine);
    try {
        await f.request.post('/rerank').send({ ...f.body, query: '' }).expect(400);
        const { computeContext: _omitted, ...unbudgeted } = f.body;
        expect((await f.request.post('/rerank').send(unbudgeted).expect(400)).body.error).toBe('native_generation_budget_lane_denied');
        await f.request.post('/rerank').send({ ...f.body, computeContext: { ...f.body.computeContext, revisionId: createNativeId('revision') } }).expect(400);
        expect(f.seen).toHaveLength(0);
        f.respond(() => ({ usage: { total_tokens: 17, prompt_tokens: 12 }, results: null }));
        await f.request.post('/rerank').send(f.body).expect(500);
        const op = Object.values((await f.core.runs.status(f.handle, f.base.session.sessionId)).operations).find(row => row.compute);
        expect(op.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 17, inputTokens: 12, outputTokens: null } });
    } finally { await f.cleanup(); }
});
test('G05 Project rerank consumes the original Task allowance and rejects changed Task authority before HTTP', async () => {
    const f = await fixture(makeTempFsEngine, 1);
    try {
        const source = projectSource(), project = await f.studio.createProject(f.handle, source);
        const task = await f.agent.createTask(f.handle, source.project.projectId, { intent: 'Resolve causal evidence', baseRevision: project.revision.revision });
        const context = { kind: 'project', projectId: source.project.projectId, taskId: task.taskId, revision: project.revision.revision };
        const stale = await prepareRetrievalCompute({ ...f, handle: f.handle, context, profile: f.profile });
        await f.agent.setPlan(f.handle, context.projectId, context.taskId, { summary: 'New plan', steps: [{ id: 'fresh', title: 'Read current evidence', impact: 'low' }] });
        await expect(rerank('custom', { reverseProxy: f.profile.endpoint, proxyPassword: 'synthetic-key' }, 'Why?', [{ text: 'because', index: 0 }], 1, f.dirs,
            { nativeRetrieval: { compute: stale, signal: new AbortController().signal } })).rejects.toMatchObject({ code: 'native_generation_task_stopped' });
        expect(f.seen).toHaveLength(0);
        await f.request.post('/rerank').send({ ...f.body, computeContext: context }).expect(200);
        await f.request.post('/rerank').send({ ...f.body, computeContext: context }).expect(429);
        expect((await f.agent.getContext(f.handle, context.projectId, context.taskId)).task.compute.attempts).toHaveLength(1);
    } finally { await f.cleanup(); }
});
test('G05 Hybrid rules execute Native client/middleware/HTTP only for competing causal sources, with source guard after denial', async () => {
    jest.unstable_mockModule('../../public/script.js', () => ({ getRequestHeaders: () => ({}) }));
    const { NativeRetrievalService } = await import('../../public/scripts/native/retrieval-client.js');
    const f = await fixture(makeTempFsEngine, 1), previousFetch = globalThis.fetch, previousAtria = globalThis.Atria;
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    try {
        globalThis.Atria = { getContext: () => ({ getRequestHeaders: () => ({}) }) };
        globalThis.fetch = async (url, options) => {
            const result = await f.request.post(url.replace('/api/vector', '')).send(JSON.parse(options.body));
            return { ok: result.status < 400, headers: new Headers({ 'content-type': 'application/json' }), json: async () => result.body };
        };
        const chat = [{ memory_os_source_id: 'cause-a', mes: 'Alice left because of the storm.' }, { memory_os_source_id: 'cause-b', mes: 'Alice left because of the promise.' }];
        const state = emptyProvenance(); state.scopeId = 'causal-chat'; captureEpisodes(state, chat, [0, 1], state.scopeId);
        let current = true;
        const snapshot = { state, chat, key: state.scopeId, assertCurrent: () => { if (!current) throw Object.assign(new Error('Source revoked'), { name: 'AbortError' }); } };
        const options = { service: NativeRetrievalService, rerankProfile: { nativeRetrievalRef: retrievalRef(f.profile) }, countTokens: async text => text.length,
            computeContext: f.body.computeContext, budget: 2400 };
        const ordinary = await retrieveMemory(snapshot, 'Alice', options);
        expect(ordinary.invocation.action).toBe('skip'); expect(f.seen).toHaveLength(0);
        const hard = await retrieveMemory(snapshot, 'Why did Alice leave?', options);
        expect(hard.invocation).toMatchObject({ action: 'rerank', outcome: 'completed' }); expect(f.seen).toHaveLength(1);
        const denied = await retrieveMemory(snapshot, 'Why did Alice leave?', options);
        expect(denied.invocation).toMatchObject({ outcome: 'unavailable', stop: 'native_generation_budget_exhausted' });
        expect(denied.sourceMessageIds.sort()).toEqual(['cause-a', 'cause-b']); expect(f.seen).toHaveLength(1);
        current = false; expect(() => denied.assertCurrent()).toThrow('Source revoked');
    } finally { globalThis.fetch = previousFetch; globalThis.Atria = previousAtria; await f.cleanup(); }
});
test('G05 actual cancelled rerank retains its unknown send; excessive optional inputs cannot charge', async () => {
    const f = await fixture(makeTempFsEngine), controller = new AbortController();
    try {
        await f.request.post('/rerank').send({ ...f.body, documents: Array.from({ length: 65 }, (_, index) => ({ text: 'because', index })) }).expect(400);
        expect(f.seen).toHaveLength(0);
        const compute = await prepareRetrievalCompute({ ...f, handle: f.handle, context: f.body.computeContext, profile: f.profile });
        f.respond(async () => { controller.abort(); return { results: [{ index: 0, relevance_score: .9 }] }; });
        await expect(rerank('custom', { reverseProxy: f.profile.endpoint, proxyPassword: 'synthetic-key' }, 'Why?', [{ text: 'because', index: 0 }], 1, f.dirs,
            { nativeRetrieval: { compute, signal: controller.signal } })).rejects.toMatchObject({ name: 'AbortError' });
        const op = Object.values((await f.core.runs.status(f.handle, f.base.session.sessionId)).operations).find(row => row.compute);
        expect(f.seen).toHaveLength(1); expect(op.compute.attempts).toHaveLength(1);
        expect(op.compute.attempts[0]).toMatchObject({ status: 'unknown', usage: null });
    } finally { await f.cleanup(); }
});
