import { test, expect, jest } from '@jest/globals';
import { configureSourceLifecycle } from '../../public/scripts/extensions/memory-graph/source-lifecycle.js';

const embeddingService = {
    query: jest.fn(), listHashes: jest.fn(), deleteByHashes: jest.fn(),
    purgeCollection: jest.fn(), insert: jest.fn(),
};
let context;
global.Luker = { getContext: () => context };
jest.unstable_mockModule('../../public/scripts/extensions/connection-manager/embed-rerank.js', () => ({
    getEmbeddingProfileById: () => null, getRerankProfileById: () => null,
}));

test('source edit during vector HTTP removes the hit; subsequent sync deletes its remote hash', async () => {
    let ledger = null;
    let serial = 0;
    context = {
        chat: [{ mes: 'Alice owns the sword', is_user: false }], embeddingService,
        saveChat: async () => {},
        getChatState: async () => ({ ok: true, state: ledger }),
        updateChatState: async (_ns, reducer) => { ledger = structuredClone(reducer()); return { ok: true }; },
    };
    const lifecycle = configureSourceLifecycle({
        getContext: () => context, enabled: () => true,
        resolveScope: () => ({ key: 'chat', target: { id: 'chat' } }),
        newId: () => `id${++serial}`,
    });
    const ticket = await lifecycle.capture(context, [0]);
    const store = {
        nodes: { n_1: { id: 'n_1', type: 'event', fields: { summary: 'Alice owns the sword' } } }, edges: [],
        vectorIndexState: { source: 'openai', model: 'test', collectionId: 'mg_chat', nodeToHash: { n_1: 123 }, hashToNodeId: { 123: 'n_1' } },
    };
    await lifecycle.bind(context, { nodes: {} }, store, ticket);
    const { findSimilarNodes, syncVectorIndex } = await import('../../public/scripts/extensions/memory-graph/vector-index.js');
    let finish;
    embeddingService.query.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const profile = { source: 'openai', model: 'test' };
    const pending = findSimilarNodes('sword', store, profile, 'chat');
    context.chat[0].mes = 'Bob owns the sword';
    finish({ metadata: [{ nodeId: 'n_1', hash: 123, score: 0.99 }] });
    expect(await pending).toEqual([]);
    embeddingService.listHashes.mockResolvedValueOnce([123]);
    await syncVectorIndex(store, profile, 'chat');
    expect(embeddingService.deleteByHashes).toHaveBeenCalledWith(expect.objectContaining({ hashes: [123], collectionId: 'mg_chat' }));
    expect(embeddingService.insert).not.toHaveBeenCalled();
});
