import { describe, test, expect, jest } from '@jest/globals';
import { webcrypto } from 'node:crypto';
import { emptyProvenance, captureEpisodes } from '../../public/scripts/extensions/memory-graph/source-provenance.js';
import { applyFactOperations } from '../../public/scripts/extensions/memory-graph/atomic-facts.js';
import { applyTemporalOperations } from '../../public/scripts/extensions/memory-graph/temporal-graph.js';
import { buildMemoryCorpus, rankMemory, analyzeMemoryQuery, composeMemory, retrieveMemory, memoryTokenBudget, memoryTokenCounter } from '../../public/scripts/extensions/memory-graph/hybrid-retrieval.js';
import { createSourceLifecycle } from '../../public/scripts/extensions/memory-graph/source-lifecycle.js';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
function fixture() {
    const chat = [{ memory_os_source_id: 'm1', mes: 'Alice lives in Castle. 爱丽丝在城堡。' },
        { memory_os_source_id: 'm2', mes: 'Alice moved to Harbor. 爱丽丝搬到港口。' }];
    let state = emptyProvenance(); state.scopeId = 'chat';
    const episodeIds = captureEpisodes(state, chat, [0, 1], 'chat');
    const ticket = { scopeId: 'chat', episodeIds };
    let serial = 0; const newId = () => `id${++serial}`;
    const evidence = index => [{ episodeId: episodeIds[index], excerpt: chat[index].mes }];
    const facts = applyFactOperations(state, [
        { action: 'create', text: 'Alice lives in Castle', type: 'explicit', evidence: evidence(0) },
        { action: 'create', text: 'Alice moved to Harbor', type: 'explicit', evidence: evidence(1) },
    ], ticket, chat, newId);
    const entities = applyTemporalOperations(facts.state, [
        { action: 'entity', name: 'Alice', type: 'Character', evidence: evidence(0) },
        { action: 'entity', name: 'Castle', type: 'Location', evidence: evidence(0) },
        { action: 'entity', name: 'Harbor', type: 'Location', evidence: evidence(1) },
    ], ticket, chat, facts.results, newId);
    const [alice, castle, harbor] = entities.results.map(item => item.id);
    state = applyTemporalOperations(entities.state, [
        { action: 'alias', targetId: alice, name: '爱丽丝', evidence: evidence(0) },
        { action: 'relation', sourceId: alice, targetId: castle, predicate: 'located_in', factIndex: 0, timeOrder: 1, evidence: evidence(0) },
        { action: 'relation', sourceId: alice, targetId: harbor, predicate: 'located_in', factIndex: 1, timeOrder: 2, evidence: evidence(1) },
    ], ticket, chat, facts.results, newId).state;
    return { state, chat, key: 'chat', assertCurrent: jest.fn(), alice };
}
const countTokens = async text => text.length;

describe('Memory OS hybrid retrieval', () => {
    test('current location excludes replaced relation and its still-active Fact', () => {
        const result = rankMemory('Where is Alice now?', buildMemoryCorpus(fixture()));
        expect(result.plan.intent).toBe('location');
        expect(result.candidates[0].text).toContain('Harbor');
        expect(result.candidates.filter(doc => doc.kind !== 'episode').every(doc => !doc.text.includes('Castle'))).toBe(true);
    });
    test('historical query and explicit temporal order retrieve old interval', () => {
        const snapshot = fixture();
        const past = rankMemory('Where was Alice before?', buildMemoryCorpus(snapshot));
        expect(past.candidates.some(doc => doc.kind === 'relation' && doc.text.includes('Castle'))).toBe(true);
        const at = rankMemory('Alice', buildMemoryCorpus(snapshot, 1), [], { at: 1 });
        expect(at.candidates).toHaveLength(1);
        expect(at.candidates[0].text).toContain('Castle');
        const boundary = rankMemory('Alice', buildMemoryCorpus(snapshot, 2), [], { at: 2 });
        expect(boundary.candidates[0].text).toContain('Harbor');
        expect(boundary.candidates).toHaveLength(1);
    });
    test('Chinese aliases match and empty/unrelated queries do not dump the graph', () => {
        const corpus = buildMemoryCorpus(fixture());
        expect(analyzeMemoryQuery('爱丽丝在哪里', corpus.entities).entityIds).toHaveLength(1);
        expect(rankMemory('爱丽丝在哪里', corpus).candidates.some(doc => doc.kind === 'relation')).toBe(true);
        expect(rankMemory('', corpus).candidates).toEqual([]);
        expect(rankMemory('zebra volcano', corpus).candidates).toEqual([]);
        expect(analyzeMemoryQuery('Malice', corpus.entities).entityIds).toEqual([]);
        expect(analyzeMemoryQuery('Where is Alice Smith?', [{ id: 'person', canonicalName: 'Alice Smith', aliases: [] }]).entityIds).toEqual(['person']);
    });
    test('edited source is excluded from all lanes, including forged vector IDs', () => {
        const snapshot = fixture();
        snapshot.chat[0].mes = 'Unrelated replacement';
        const corpus = buildMemoryCorpus(snapshot);
        expect(corpus.documents.some(doc => doc.id === 'episode:m1:1')).toBe(false);
        expect(rankMemory('Castle', corpus, ['episode:m1:1', 'relation:foreign']).candidates).toEqual([]);
    });
    test('adjacency index preserves stable graph lane order for equal relation scores', () => {
        const entities = [
            { id: 'alice', canonicalName: 'Alice', aliases: [] },
            { id: 'b', canonicalName: 'B', aliases: [] },
            { id: 'c', canonicalName: 'C', aliases: [] },
            { id: 'd', canonicalName: 'D', aliases: [] },
        ];
        const documents = [
            { id: 'r-third', kind: 'relation', text: 'connected', status: 'active', sourceEntityId: 'alice', targetEntityId: 'd', episodeIds: [], confidence: 0.5, supports: [] },
            { id: 'r-first', kind: 'relation', text: 'connected', status: 'active', sourceEntityId: 'alice', targetEntityId: 'b', episodeIds: [], confidence: 0.5, supports: [] },
            { id: 'r-second', kind: 'relation', text: 'connected', status: 'active', sourceEntityId: 'alice', targetEntityId: 'c', episodeIds: [], confidence: 0.5, supports: [] },
        ];

        const result = rankMemory('Alice', { documents, entities });

        expect(result.candidates.map(doc => doc.id)).toEqual(['r-third', 'r-first', 'r-second']);
    });

    test('depth, relation and entity bounds prevent graph expansion', () => {
        const entities = Array.from({ length: 100 }, (_, id) => ({ id: String(id), canonicalName: id ? `Person${id}` : 'Alice', aliases: [] }));
        const documents = Array.from({ length: 99 }, (_, id) => ({ id: `r${id}`, kind: 'relation', text: 'knows',
            status: 'active', sourceEntityId: String(id), targetEntityId: String(id + 1), episodeIds: [], confidence: 0.9 }));
        const result = rankMemory('Alice', { documents, entities });
        expect(result.candidates.map(doc => doc.id)).toEqual(['r0', 'r1']);
    });
    test('token budget includes core, headings and source IDs; oversized records are skipped', async () => {
        const candidates = rankMemory('Alice', buildMemoryCorpus(fixture())).candidates;
        const result = await composeMemory(candidates, { countTokens, budget: 500, corePacket: 'core'.repeat(25) });
        expect(result.tokenCount).toBeLessThanOrEqual(500);
        expect(result.selected.length).toBeGreaterThan(0);
        expect(result.text).toContain('sources');
        expect((await composeMemory(candidates, { countTokens, budget: 0 })).text).toBe('');
        expect(memoryTokenBudget({ memoryOsTokenBudget: 0 })).toBe(0);
        expect(await memoryTokenCounter({})('港口')).toBe(6);
    });
    test('vector failure falls back, while late source mutation aborts rather than falling back', async () => {
        const snapshot = fixture();
        const service = { listHashes: jest.fn(async () => { throw new Error('offline'); }) };
        const result = await retrieveMemory(snapshot, 'Alice', { service, profile: { source: 'test' }, countTokens });
        expect(result.selected.length).toBeGreaterThan(0);
        expect(result.diagnostics).toContain('vector_unavailable');
        service.listHashes.mockImplementation(async () => {
            snapshot.assertCurrent.mockImplementation(() => { throw Object.assign(new Error('changed'), { name: 'AbortError' }); });
            return [];
        });
        await expect(retrieveMemory(snapshot, 'Alice', { service, profile: { source: 'test' }, countTokens })).rejects.toThrow('changed');
    });
    test('content-addressed index filters forged metadata, deletes old hashes, and avoids reembedding unchanged data', async () => {
        const remote = new Map();
        remote.set(1, { hash: 1 });
        const service = {
            listHashes: jest.fn(async () => [...remote.keys()]),
            deleteByHashes: jest.fn(async ({ hashes }) => hashes.forEach(hash => remote.delete(hash))),
            insert: jest.fn(async ({ items }) => items.forEach(item => remote.set(item.hash, item))),
            query: jest.fn(async () => ({ metadata: [...remote.values()].map(item => item.metadata).concat({ id: 'fact:foreign', fingerprint: 'bad' }) })),
        };
        const snapshot = fixture(); const options = { service, profile: { source: 'test', model: 'v1' }, countTokens };
        const first = await retrieveMemory(snapshot, 'Alice', options);
        expect(first.diagnostics).toEqual([]);
        expect(service.deleteByHashes).toHaveBeenCalled();
        expect(service.insert).toHaveBeenCalledTimes(1);
        await retrieveMemory(snapshot, 'Alice', options);
        expect(service.insert).toHaveBeenCalledTimes(1);
        const firstCollection = service.query.mock.calls[0][0].collectionId;
        await retrieveMemory({ ...snapshot, key: 'other-chat' }, 'Alice', options);
        expect(service.query.mock.calls[2][0].collectionId).not.toBe(firstCollection);
        await retrieveMemory(snapshot, 'Alice', { ...options, profile: { source: 'test', model: 'v2' } });
        expect(service.query.mock.calls[3][0].collectionId).not.toBe(firstCollection);
    });
    test('rerank failure preserves fusion and abort during tokenizer is rejected', async () => {
        const snapshot = fixture();
        const result = await retrieveMemory(snapshot, 'Alice', { service: { rerank: async () => { throw new Error('offline'); } }, rerankProfile: {}, countTokens });
        expect(result.diagnostics).toContain('rerank_unavailable');
        const controller = new AbortController();
        await expect(retrieveMemory(snapshot, 'Alice', { signal: controller.signal, countTokens: async () => { controller.abort(); return 1; } })).rejects.toThrow('aborted');
    });
    test('production snapshot detects unobserved edit, chat switch, flag off and concurrent ledger write', async () => {
        const disk = new Map();
        let ctx = { key: 'chat', enabled: true, chat: [{ mes: 'Alice is here' }], saveChat: async () => {},
            getChatState: async (_, { target }) => ({ ok: true, state: structuredClone(disk.get(target.key)) }),
            updateChatState: async (_, update, { target }) => { disk.set(target.key, structuredClone(update())); return { ok: true }; } };
        let serial = 0;
        const lifecycle = createSourceLifecycle({ getContext: () => ctx, resolveScope: context => ({ key: context.key, target: { key: context.key } }),
            enabled: context => context.enabled, newId: () => `m${++serial}` });
        const ticket = await lifecycle.capture(ctx, [0]);
        const snapshot = await lifecycle.retrievalSnapshot(ctx);
        snapshot.assertCurrent();
        ctx.chat[0].mes = 'Edited'; expect(snapshot.assertCurrent).toThrow('changed');
        ctx.chat[0].mes = 'Alice is here';
        ctx.enabled = false; expect(snapshot.assertCurrent).toThrow('changed'); ctx.enabled = true;
        const original = ctx; ctx = { ...ctx, key: 'other' }; expect(snapshot.assertCurrent).toThrow('changed'); ctx = original;
        await lifecycle.writeFacts(ctx, [{ action: 'create', type: 'explicit', text: 'Alice is here', evidence: [{ episodeId: ticket.episodeIds[0], excerpt: 'Alice is here' }] }], ticket);
        expect(snapshot.assertCurrent).toThrow('changed');
        const fresh = await lifecycle.retrievalSnapshot(ctx);
        await retrieveMemory(fresh, 'Alice', { countTokens });
        fresh.assertCurrent();
        expect((await lifecycle.listFacts(ctx))[0].accessCount).toBe(1);
        const reread = await lifecycle.retrievalSnapshot(ctx);
        await retrieveMemory(reread, 'Alice', { countTokens, budget: 0 });
        expect((await lifecycle.listFacts(ctx))[0].accessCount).toBe(1);
    });
    test('successful rerank reorders only source-valid candidates', async () => {
        const snapshot = fixture();
        const baseline = rankMemory('Alice', buildMemoryCorpus(snapshot)).candidates;
        const service = { rerank: async ({ documents }) => documents.map((_, index) => ({ index, relevance_score: index })) };
        const result = await retrieveMemory(snapshot, 'Alice', { service, rerankProfile: {}, countTokens, budget: 10000 });
        expect(result.selected[0]).toBe(baseline.at(-1).id);
        expect(result.diagnostics).not.toContain('rerank_unavailable');
    });
});
