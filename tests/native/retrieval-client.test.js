import { afterEach, beforeAll, expect, jest, test } from '@jest/globals';

let service; let memoryProfile; const originalFetch = globalThis.fetch; const originalAtria = globalThis.Atria;
const ref = { scope: 'player', retrievalProfileId: 'retr_' + 'a'.repeat(32), revision: 'rev_' + 'b'.repeat(32) };
beforeAll(async () => {
    jest.unstable_mockModule('../../public/script.js', () => ({ getRequestHeaders: () => ({ 'X-CSRF-Token': 'test' }) }));
    jest.unstable_mockModule('../../public/scripts/extensions.js', () => ({ extension_settings: { get connectionManager() { throw new Error('Native must never read Connection Manager'); } } }));
    service = (await import('../../public/scripts/embedding-service.js')).EmbeddingService;
    memoryProfile = (await import('../../public/scripts/native/retrieval-client.js')).memoryRetrievalProfile;
});
afterEach(() => { globalThis.fetch = originalFetch; globalThis.Atria = originalAtria; });
function response(body) { return { ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body }; }
test('Memory and Hybrid shared service send only exact refs without resolving compatibility profiles', async () => {
    globalThis.Atria = { getContext: () => ({ getRequestHeaders: () => ({ 'X-CSRF-Token': 'native-test' }) }) };
    const calls = [];
    globalThis.fetch = jest.fn(async (url, options) => {
        calls.push({ url, options });
        return response(url.endsWith('/retrieval') ? [{ ...ref, mode: 'embed', source: 'openai' }] : { hashes: [1], metadata: [] });
    });
    const profile = memoryProfile({ nativeRetrieval: { embed: ref }, embeddingProfileId: 'legacy-ignored' }, 'embed');
    await service.query({ profile, collectionId: 'memory', searchText: 'question', extraBody: { reverse_proxy: 'ignored-legacy-url' } });
    const body = JSON.parse(calls.at(-1).options.body);
    expect(body).toMatchObject({ nativeRetrievalRef: ref, collectionId: 'memory', searchText: 'question' });
    expect(body).not.toHaveProperty('reverse_proxy'); expect(body).not.toHaveProperty('source');
    expect(calls.at(-1).options.headers['X-CSRF-Token']).toBe('native-test');
    await service.rerank({ profile, query: 'q', documents: [{ text: 'doc' }] });
    expect(JSON.parse(calls.at(-1).options.body)).toMatchObject({ nativeRetrievalRef: ref });
    await service.purgeCollection({ profile, collectionId: 'memory' });
    expect(JSON.parse(calls.at(-1).options.body)).toEqual({ collectionId: 'memory', nativeRetrievalRef: ref });
    expect(memoryProfile({ embeddingProfileId: 'legacy-only' }, 'embed')).toBeNull();
});
test('missing exact revisions fail without using another revision or sending inference', async () => {
    globalThis.fetch = jest.fn(async () => response([{ ...ref, revision: 'rev_' + 'c'.repeat(32) }]));
    await expect(service.query({ profile: memoryProfile({ nativeRetrieval: { embed: ref } }, 'embed'), searchText: 'question', collectionId: 'memory' })).rejects.toThrow('revision unavailable');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
});
