import { runtimeRequest } from './runtime-client.js';
import { assertRetrievalRef, retrievalRef } from './retrieval-contracts.js';
import { WebLlmVectorProvider } from '../extensions/vectors/webllm.js';

const webllm = new WebLlmVectorProvider();
export const listRetrievalProfiles = () => runtimeRequest('/retrieval');
export const commitRetrievalProfile = profile => runtimeRequest('/retrieval', { method: 'POST', body: profile });

async function request(operation, { profile, signal, ...body }) {
    const ref = assertRetrievalRef(profile.nativeRetrievalRef);
    // Fetch exact configuration, never a current/latest revision. This lookup
    // is only needed for browser inference; the server remains authoritative.
    if (['insert', 'query', 'query-multi'].includes(operation)) {
        const inventory = await listRetrievalProfiles();
        const selected = inventory.find(item => item.retrievalProfileId === ref.retrievalProfileId && item.revision === ref.revision);
        if (!selected) throw new Error('Native retrieval revision unavailable');
        if (selected.source === 'webllm') {
            const texts = operation === 'insert' ? body.items.map(item => item.text) : [body.searchText];
            const vectors = await webllm.embedTexts(texts, selected.model);
            body.embeddings = Object.fromEntries(texts.map((text, index) => [text, vectors[index]]));
        }
    }
    const response = await fetch('/api/vector/' + operation, { method: 'POST', headers: { ...globalThis.Atria?.getContext?.()?.getRequestHeaders?.(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, nativeRetrievalRef: ref }), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000) });
    if (!response.ok) throw Object.assign(new Error('Native retrieval failed. Check Runtime retrieval resources and the stored Secret.'), { code: (await response.json().catch(() => ({}))).error || 'native_retrieval_execution_failed' });
    return response.headers.get('content-type')?.includes('json') ? response.json() : null;
}
export const NativeRetrievalService = {
    insert: args => request('insert', args), query: args => request('query', args), queryMulti: args => request('query-multi', args),
    queryByVector: args => request('query-by-vector', args), listHashes: args => request('list', args),
    deleteByHashes: args => request('delete', args), purgeCollection: args => request('purge', args), rerank: args => request('rerank', args),
};
export function memoryRetrievalProfile(settings, mode) {
    const ref = settings?.nativeRetrieval?.[mode];
    if (!ref) return null;
    const exact = assertRetrievalRef(ref);
    // Only the exact reference crosses Memory's synchronous index API. These
    // hash-domain fields contain identity, not a copied provider configuration.
    return { nativeRetrievalRef: exact, source: 'native', model: exact.retrievalProfileId + ':' + exact.revision };
}
export { retrievalRef };
