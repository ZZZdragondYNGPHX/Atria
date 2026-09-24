import { afterEach, expect, test } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { NativeRetrievalPersistence } from '../../src/native/retrieval-persistence.js';
import { createNativeId } from '../../src/native/identity.js';
import { assertRetrievalProfile, retrievalRef, RETRIEVAL_PROVIDERS } from '../../public/scripts/native/retrieval-contracts.js';
import { createRetrievalMiddleware, resolveRetrievalSecret } from '../../src/native/retrieval-execution.js';
import { router as vectors } from '../../src/endpoints/vectors.js';
import { SecretManager, SECRET_KEYS } from '../../src/endpoints/secrets.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';

const cleanups = [];
afterEach(async () => { setReadOnly(false); for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
function profile(overrides = {}) {
    return { retrievalProfileId: createNativeId('retrievalProfile'), revision: createNativeId('revision'), displayName: 'Retrieval', mode: 'embed', source: 'webllm', model: 'exact-local-model', endpoint: '', options: {}, ...overrides };
}
for (const [mode, providers] of Object.entries(RETRIEVAL_PROVIDERS)) for (const source of providers) {
    test(`Native contract retains ${mode}/${source} with explicit ownership`, () => {
        const local = ['webllm', 'transformers'].includes(source);
        const value = profile({ mode, source, ...(local ? {} : { endpoint: 'https://example.invalid/v1', secretRef: { secretId: 'exact-secret' } }) });
        expect(assertRetrievalProfile(value)).toEqual(value);
        expect(() => assertRetrievalProfile({ ...value, 'proxy-password': 'secret' })).toThrow();
        expect(() => assertRetrievalProfile({ ...value, options: { unknown: true } })).toThrow();
    });
}
for (const [kind, create] of [['fs', makeTempFsEngine], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`${kind}: retrieval revisions are immutable, exact and protected during backups`, async () => {
        const h = await create(); cleanups.push(h.cleanup);
        const store = new NativeRetrievalPersistence({ engine: h.engine }); const first = profile();
        await store.commit(h.handle, first);
        await store.commit(h.handle, { ...first, revision: createNativeId('revision'), model: 'new-model' });
        expect(await store.getExact(h.handle, retrievalRef(first))).toEqual(first);
        expect(await store.list(h.handle)).toHaveLength(2);
        await expect(store.commit(h.handle, { ...first, model: 'mutated' })).rejects.toMatchObject({ code: 'native_immutable_conflict' });
        await expect(store.getExact(h.handle, { ...retrievalRef(first), revision: createNativeId('revision') })).rejects.toMatchObject({ code: 'native_retrieval_unavailable' });
        const competing = profile();
        const parallel = await Promise.allSettled([store.commit(h.handle, competing), new NativeRetrievalPersistence({ engine: h.engine }).commit(h.handle, { ...competing, model: 'competitor' })]);
        expect(parallel.map(item => item.status)).toEqual(['fulfilled', 'rejected']);
        expect(await store.getExact(h.handle, retrievalRef(competing))).toEqual(competing);
        setReadOnly(true);
        await expect(store.commit(h.handle, profile())).rejects.toMatchObject({ code: 'storage_read_only' });
    });
}
async function fixture() {
    const h = await makeTempFsEngine(); cleanups.push(h.cleanup);
    const store = new NativeRetrievalPersistence({ engine: h.engine }); const value = profile(); await store.commit(h.handle, value);
    const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { profile: { handle: h.handle }, directories: h.dirs }; next(); });
    app.use(createRetrievalMiddleware(() => store)); app.use(vectors);
    return { ...h, store, value, request: supertest(app) };
}
test('real vector IO isolates exact revisions and Native purge from compatibility caches', async () => {
    const f = await fixture(); const ref = retrievalRef(f.value); const next = { ...f.value, revision: createNativeId('revision') }; await f.store.commit(f.handle, next);
    const body = { nativeRetrievalRef: ref, collectionId: 'memory-1' };
    await f.request.post('/insert').send({ ...body, items: [{ hash: 1, text: 'Alpha', index: 0 }], embeddings: { Alpha: [1, 0] } }).expect(200);
    expect((await f.request.post('/list').send(body).expect(200)).body).toEqual([1]);
    expect((await f.request.post('/list').send({ ...body, nativeRetrievalRef: retrievalRef(next) }).expect(200)).body).toEqual([]);
    const queried = await f.request.post('/query').send({ ...body, searchText: 'Beta', embeddings: { Beta: [1, 0] }, topK: 1, threshold: 0, includeVectors: true }).expect(200);
    expect(queried.body.hashes).toEqual([1]);
    await f.request.post('/purge').send({ collectionId: 'memory-1' }).expect(200);
    expect((await f.request.post('/list').send(body).expect(200)).body).toEqual([1]);
    await f.request.post('/purge').send({ ...body, nativeRetrievalRef: retrievalRef(next) }).expect(200);
    expect((await f.request.post('/list').send(body).expect(200)).body).toEqual([1]);
    await f.request.post('/delete').send({ ...body, hashes: [1] }).expect(200);
    expect((await f.request.post('/list').send(body).expect(200)).body).toEqual([]);
});
test('Native boundary rejects configuration injection, wrong task, unknown refs and readonly mutations', async () => {
    const f = await fixture(); const body = { nativeRetrievalRef: retrievalRef(f.value), collectionId: 'memory' };
    for (const injected of [{ source: 'openai' }, { model: 'other' }, { proxy_password: 'injected' }, { secret_id: 'other' }, { reverse_proxy: 'https://other.invalid' }]) await f.request.post('/list').send({ ...body, ...injected }).expect(400);
    await f.request.post('/rerank').send({ nativeRetrievalRef: body.nativeRetrievalRef, query: 'q', documents: [] }).expect(400);
    await f.request.post('/list').send({ ...body, nativeRetrievalRef: { ...body.nativeRetrievalRef, scope: 'library' } }).expect(400);
    setReadOnly(true); const blocked = await f.request.post('/purge').send(body).expect(503); expect(blocked.body.error).toBe('storage_read_only');
});
test('Secret resolution never reads or changes an active provider key', async () => {
    const f = await fixture(); const manager = new SecretManager(f.dirs);
    manager.writeSecret(SECRET_KEYS.OPENAI, 'old-active-value', 'Old');
    const id = manager.writeSecret(SECRET_KEYS.ATRIA_RUNTIME, 'native-exact-value', 'Native', { activate: false });
    expect(resolveRetrievalSecret(f.dirs, { secretId: id })).toBe('native-exact-value');
    expect(resolveRetrievalSecret(f.dirs)).toBe('');
    expect(() => resolveRetrievalSecret(f.dirs, { secretId: 'missing' })).toThrow();
    expect(manager.readSecret(SECRET_KEYS.OPENAI)).toBe('old-active-value');
});

test('remote embedding and rerank execute Native models, options and exact Secret across protocols', async () => {
    const f = await fixture(); const calls = []; const provider = express(); provider.use(express.json());
    provider.use((req, res) => {
        calls.push({ path: req.path, body: req.body, authorization: req.headers.authorization, key: req.headers['x-goog-api-key'] });
        if (req.path.endsWith('/rerank')) return res.json({ results: [{ index: 0, relevance_score: 0.9 }] });
        if (req.path.includes('batchEmbedContents')) return res.json({ embeddings: [{ values: [1, 0] }] });
        if (req.path.includes('predict')) return res.json({ predictions: [{ embeddings: { values: [1, 0] } }] });
        if (req.path === '/cohere/embed') return res.json({ embeddings: { float: [[1, 0]] } });
        if (req.path === '/api/embed' || req.path === '/nomic') return res.json({ embeddings: [[1, 0]] });
        return res.json({ data: [{ embedding: [1, 0] }] });
    });
    const server = await new Promise(resolve => { const server = provider.listen(0, '127.0.0.1', () => resolve(server)); });
    cleanups.push(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const manager = new SecretManager(f.dirs);
    manager.writeSecret(SECRET_KEYS.OPENAI, 'wrong-active-key', 'Legacy');
    const secretId = manager.writeSecret(SECRET_KEYS.ATRIA_RUNTIME, 'exact-runtime-key', 'Runtime', { activate: false });
    for (const source of ['openai', 'cohere', 'jina', 'nomicai', 'ollama', 'palm', 'vertexai', 'koboldcpp']) {
        const value = profile({ source, endpoint: base + '/' + (source === 'nomicai' ? 'nomic' : source), secretRef: { secretId }, options: source === 'jina' ? { dimensions: 2, lateChunking: true, task: 'retrieval.passage' } : source === 'vertexai' ? { authMode: 'express', projectId: 'test-project', region: 'us-central1' } : {} });
        await f.store.commit(f.handle, value);
        await f.request.post('/insert').send({ nativeRetrievalRef: retrievalRef(value), collectionId: 'remote', items: [{ hash: 1, text: 'Text', index: 0 }] }).expect(200);
        const wire = calls.at(-1);
        expect(wire.authorization || wire.key).toContain('exact-runtime-key');
        expect(source === 'koboldcpp' || ['palm', 'vertexai'].includes(source) ? true : wire.body.model === value.model).toBe(true);
    }
    expect(calls.find(call => call.path === '/jina/embeddings').body).toMatchObject({ dimensions: 2, late_chunking: true, task: 'retrieval.passage' });
    expect(calls.find(call => call.path.startsWith('/vertexai/')).path).toContain('/projects/test-project/locations/us-central1/publishers/google/models/');
    for (const source of ['cohere', 'jina', 'custom']) {
        const value = profile({ mode: 'rerank', source, endpoint: base + '/' + source, secretRef: { secretId } }); await f.store.commit(f.handle, value);
        const result = await f.request.post('/rerank').send({ nativeRetrievalRef: retrievalRef(value), query: 'Q', documents: [{ text: 'Doc', index: 0 }], topK: 1 }).expect(200);
        expect(result.body[0]).toMatchObject({ text: 'Doc', relevance_score: 0.9 });
        expect(calls.at(-1).authorization).toBe('Bearer exact-runtime-key');
        expect(calls.at(-1).body.model).toBe(value.model);
    }
    const anonymous = profile({ source: 'ollama', endpoint: base }); await f.store.commit(f.handle, anonymous);
    await f.request.post('/insert').send({ nativeRetrievalRef: retrievalRef(anonymous), collectionId: 'anonymous', items: [{ hash: 1, text: 'Text', index: 0 }] }).expect(200);
    expect(calls.at(-1).authorization).toBeUndefined();
});
