import { jest, describe, test, expect } from '@jest/globals';

const legacy = {
    syncVectorIndex: jest.fn(),
    findSimilarNodes: jest.fn(),
    deleteVectorItems: jest.fn(),
    purgeVectorCollection: jest.fn(),
};
jest.unstable_mockModule('../../public/scripts/agents/memory/vector-index.js', () => legacy);
const { createMemoryVectorAdapter, getMemoryVectorStore, isMemoryOsEnabled, MEMORY_OS_DEFAULT_ENABLED } =
    await import('../../public/scripts/agents/memory/memory-os.js');

describe('Memory OS Phase 1 vector boundary', () => {
    test('only explicit true opts in; missing and malformed legacy settings stay off', () => {
        expect(MEMORY_OS_DEFAULT_ENABLED).toBe(false);
        for (const value of [undefined, null, false, 0, 1, 'true', {}, []]) {
            expect(isMemoryOsEnabled({ memoryOsEnabled: value })).toBe(false);
        }
        expect(isMemoryOsEnabled()).toBe(false);
        expect(isMemoryOsEnabled({ memoryOsEnabled: true })).toBe(true);
        const settings = {};
        expect(getMemoryVectorStore(settings).search).toBe(legacy.findSimilarNodes);
        settings.memoryOsEnabled = true;
        expect(getMemoryVectorStore(settings).search).not.toBe(legacy.findSimilarNodes);
        settings.memoryOsEnabled = false;
        expect(getMemoryVectorStore(settings).search).toBe(legacy.findSimilarNodes);
    });

    test('both modes preserve results, options, signals and scope across pending calls', async () => {
        for (const enabled of [false, true]) {
            const vectors = getMemoryVectorStore({ memoryOsEnabled: enabled });
            const signal = new AbortController().signal;
            const options = { signal, schema: [{ id: 'event' }], tolerateErrors: true, onProgress: jest.fn() };
            const storeA = { nodes: {} };
            const storeB = { nodes: {} };
            const profileA = { source: 'openai', model: 'a' };
            const profileB = { source: 'transformers', model: 'b' };
            let finishA;
            const pending = new Promise(resolve => { finishA = resolve; });
            const syncResult = { insertedCount: 1, deletedCount: 2, failedNodeIds: ['n3'] };
            legacy.syncVectorIndex.mockReturnValueOnce(pending).mockResolvedValueOnce(syncResult);
            const runA = vectors.sync(storeA, profileA, 'char:a:chat', options);
            const runB = vectors.sync(storeB, profileB, 'group:b', { signal });
            expect(await runB).toBe(syncResult);
            finishA(syncResult);
            expect(await runA).toBe(syncResult);
            expect(legacy.syncVectorIndex).toHaveBeenCalledWith(storeA, profileA, 'char:a:chat', options);
            expect(legacy.syncVectorIndex).toHaveBeenCalledWith(storeB, profileB, 'group:b', { signal });

            const hits = [{ nodeId: 'n1', score: 0.9, vector: [1, 0] }];
            hits.__queryVector = [1, 0];
            legacy.findSimilarNodes.mockResolvedValueOnce(hits);
            const searchOptions = { signal, topK: 7, threshold: 0.3, includeVectors: true };
            expect(await vectors.search('query', storeA, profileA, 'char:a:chat', searchOptions)).toBe(hits);
            expect(legacy.findSimilarNodes).toHaveBeenLastCalledWith('query', storeA, profileA, 'char:a:chat', searchOptions);
        }
    });

    test('adapter preserves cancellation/errors and delegates exact removal without retry', async () => {
        const backend = {
            syncVectorIndex: jest.fn(), findSimilarNodes: jest.fn(),
            deleteVectorItems: jest.fn(), purgeVectorCollection: jest.fn(),
        };
        const vectors = createMemoryVectorAdapter(backend);
        const controller = new AbortController();
        controller.abort();
        const error = Object.assign(new Error('cancelled'), { name: 'AbortError' });
        backend.findSimilarNodes.mockRejectedValueOnce(error);
        await expect(vectors.search('q', {}, {}, 'chat', { signal: controller.signal })).rejects.toBe(error);
        expect(backend.findSimilarNodes).toHaveBeenCalledTimes(1);
        const failure = new Error('disk unavailable');
        backend.syncVectorIndex.mockRejectedValueOnce(failure);
        await expect(vectors.sync({}, {}, 'chat', {})).rejects.toBe(failure);
        const hashes = [123, 456];
        const profile = { source: 'openai' };
        await vectors.removeByHashes('mg_chat', profile, hashes, controller.signal);
        expect(backend.deleteVectorItems).toHaveBeenCalledWith('mg_chat', profile, hashes, controller.signal);
        await vectors.purge('mg_chat', controller.signal, profile);
        expect(backend.purgeVectorCollection).toHaveBeenCalledWith('mg_chat', controller.signal, profile);
    });
});
