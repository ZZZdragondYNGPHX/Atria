import fetch from 'node-fetch';
import { NativeRetrievalPersistence } from './retrieval-persistence.js';
import { getStorageEngine } from '../storage/index.js';
import { readSecret, SECRET_KEYS } from '../endpoints/secrets.js';
import { assertRetrievalRef, assertRetrievalProfile, NATIVE_RETRIEVAL_SCOPE_ERRORS, NATIVE_RETRIEVAL_COMPUTE_ERRORS } from '../../public/scripts/native/retrieval-contracts.js';
import { assertWritable } from '../storage/read-only-mode.js';
import { prepareRetrievalCompute } from './retrieval-compute.js';
import { getOpenAIBatchVector, supportsOpenAIEmbeddingSource, openAIEmbeddingBody } from '../vectors/openai-vectors.js';
import { rerank } from '../vectors/rerank.js';
import { insertNativeIndex, queryNativeIndexes, nativeRetrievalIndexPath } from './vector-index-work.js';
import { hashNativeDocument } from './repositories/common.js';
import { embeddingBatches } from '../vectors/embedding-batches.js';

/** Original Native protocol/index execution, shared without an HTTP roundtrip.
 * Callers supply their original compute/source authority; this mints no grant. */
export async function executeNativeEmbedding({ directories, profile: value, compute, signal, secret = '', request, embedBatch }, operation, input) {
    const profile = assertRetrievalProfile(value);
    if (profile.mode !== 'embed' || !['list', 'insert', 'query', 'delete'].includes(operation)
        || ['insert', 'query'].includes(operation) && !supportsOpenAIEmbeddingSource(profile.source))
        throw Object.assign(new TypeError('Native embedding execution unavailable'), { code: 'native_retrieval_compute_unavailable' });
    const indexScope = profile.retrievalProfileId + '_' + profile.revision;
    if (request && (!request.nativeRetrieval || hashNativeDocument(request.nativeRetrieval.profile ?? null) !== hashNativeDocument(profile)
        || request.nativeRetrieval.compute !== compute || request.nativeRetrieval.signal !== signal || (request.nativeRetrieval.secret ?? '') !== secret))
        throw Object.assign(new TypeError('Native retrieval carrier mismatch'), { code: 'native_retrieval_send_target_mismatch' });
    const carrier = request ?? { nativeRetrieval: { profile, compute, signal } };
    const settings = { reverseProxy: profile.endpoint, proxyPassword: secret };
    const vectors = async texts => {
        const result = [];
        for (const batch of embeddingBatches(texts)) result.push(...await (embedBatch
            ? embedBatch(batch) : getOpenAIBatchVector(batch, profile.source, directories, profile.model, settings, carrier)));
        return result;
    };
    if (operation === 'list' && input.collectionIds !== undefined) {
        if (!Array.isArray(input.collectionIds) || !input.collectionIds.length || input.collectionIds.length > 16
            || input.collectionIds.some(id => typeof id !== 'string' || !id)) throw new TypeError('Invalid Native index listing');
        return queryNativeIndexes({ indexes: input.collectionIds.map(collectionId => ({ collectionId,
            indexPath: nativeRetrievalIndexPath(directories, collectionId, indexScope) })), mode: 'list-many', compute, signal });
    }
    const indexPath = nativeRetrievalIndexPath(directories, input.collectionId, indexScope);
    if (operation === 'list') return queryNativeIndexes({ indexes: [{ collectionId: input.collectionId, indexPath }], mode: 'list', compute, signal });
    if (operation === 'delete') return insertNativeIndex({ indexPath, deleteHashes: input.hashes, compute, signal });
    if (operation === 'insert') return insertNativeIndex({ indexPath, items: input.items, getVectors: () => vectors(input.items.map(item => item.text)), compute, signal });
    return (await queryNativeIndexes({ indexes: [{ collectionId: input.collectionId, indexPath }], query: input.searchText,
        topK: input.topK, threshold: input.threshold, includeVectors: input.includeVectors === true, compute, signal,
        getVector: async () => (await vectors([input.searchText]))[0] })).single;
}

/** One small real request through the same address and key memory uses.
 * Failures come back as a reason the editor can explain, never as a throw. */
export async function testRetrievalProfile(directories, value, signal) {
    const profile = assertRetrievalProfile(value);
    if (['transformers', 'webllm'].includes(profile.source) || profile.mode === 'embed' && !supportsOpenAIEmbeddingSource(profile.source))
        return { ok: false, reason: 'untestable' };
    let secret;
    try { secret = resolveRetrievalSecret(directories, profile.secretRef); } catch { return { ok: false, reason: 'secret' }; }
    const started = Date.now();
    const sample = ['Atria memory search test.', 'An unrelated sentence about the weather.'];
    let url;
    try {
        if (profile.mode === 'embed') {
            url = profile.endpoint + '/embeddings';
            const response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
                headers: { 'Content-Type': 'application/json', ...(secret ? { Authorization: `Bearer ${secret}` } : {}), ...profile.headers },
                body: JSON.stringify(openAIEmbeddingBody(sample.slice(0, 1), profile.source, profile.model)) });
            if (!response.ok) return { ok: false, status: response.status, url, reason: failureReason(response.status) };
            const data = await response.json().catch(() => null);
            const vector = data?.data?.[0]?.embedding;
            if (!Array.isArray(vector) || !vector.length || vector.some(n => !Number.isFinite(n))) return { ok: false, url, reason: 'response' };
            return { ok: true, mode: 'embed', dimensions: vector.length, latencyMs: Date.now() - started };
        }
        url = profile.endpoint;
        const ranked = await rerank(profile.source, { model: profile.model, reverseProxy: profile.endpoint, proxyPassword: secret }, 'memory search',
            sample.map((text, index) => ({ text, index, hash: index })), 2, directories);
        return { ok: true, mode: 'rerank', top: ranked[0]?.index ?? null, latencyMs: Date.now() - started };
    } catch (error) {
        const status = Number(/(\d{3})\b/.exec(error?.message || '')?.[1]) || null;
        return { ok: false, url, ...(status ? { status, reason: failureReason(status) } : { reason: error?.name === 'AbortError' || error?.type === 'aborted' ? 'timeout' : /Invalid rerank/.test(error?.message) ? 'response' : 'unreachable' }) };
    }
}
/** The provider's own model list (OpenAI-style GET /models), so users pick instead of typing IDs. */
export async function listRetrievalModels(directories, { endpoint, secretRef }, signal) {
    const url = new URL(String(endpoint || '').replace(/\/+$/, '') + '/models');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new TypeError('Invalid endpoint');
    let secret;
    try { secret = resolveRetrievalSecret(directories, secretRef ? { secretId: String(secretRef.secretId) } : null); } catch { return { ok: false, reason: 'secret' }; }
    try {
        const response = await fetch(url.href, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]), headers: secret ? { Authorization: `Bearer ${secret}` } : {} });
        if (!response.ok) return { ok: false, status: response.status, url: url.href, reason: failureReason(response.status) };
        const data = await response.json().catch(() => null);
        const ids = (Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : []).map(item => typeof item === 'string' ? item : item?.id ?? item?.name).filter(id => typeof id === 'string' && id.length <= 256);
        return { ok: true, models: [...new Set(ids)].sort().slice(0, 2000) };
    } catch (error) { return { ok: false, url: url.href, reason: error?.name === 'AbortError' ? 'timeout' : 'unreachable' }; }
}
const failureReason = status => [404, 405].includes(status) ? 'address' : [401, 403].includes(status) ? 'key' : status === 429 ? 'busy' : status >= 500 ? 'down' : 'rejected';

export function resolveRetrievalSecret(directories, ref) {
    if (!ref) return '';
    for (const key of Object.values(SECRET_KEYS)) {
        const value = readSecret(directories, key, ref.secretId);
        if (value) return value;
    }
    throw Object.assign(new Error('Stored Secret unavailable'), { code: 'native_retrieval_secret_unavailable' });
}

// Explicit Native request boundary. Only payload fields, never provider settings,
// may come from a caller. The retained vector protocol implementations consume
// this server-resolved configuration without consulting compatibility settings.
async function defaultComputeServices() {
    const [{ getNativeSessionServices }, { getNativeStudioServices }, { NativeModelPromptPersistence }] = await Promise.all([
        import('../endpoints/native-session.js'), import('../endpoints/native-studio.js'), import('./model-prompt-runtime/persistence.js'),
    ]);
    return { ...getNativeSessionServices(), ...getNativeStudioServices(), persistence: new NativeModelPromptPersistence({ engine: getStorageEngine() }) };
}
export function createRetrievalMiddleware(getStore = () => new NativeRetrievalPersistence({ engine: getStorageEngine() }), resolveSecret = resolveRetrievalSecret,
                                          getComputeServices = defaultComputeServices) {
    return async (req, res, next) => {
        if (req.nativeRetrieval) return next();
        try {
            const handle = req.user?.profile?.handle;
            if (!handle) return res.sendStatus(401);
            const operations = {
                '/insert': ['collectionId', 'items', 'embeddings', 'computeContext'], '/query': ['collectionId', 'searchText', 'topK', 'threshold', 'includeVectors', 'embeddings', 'computeContext'],
                '/query-multi': ['collectionIds', 'searchText', 'topK', 'threshold', 'embeddings', 'computeContext'], '/query-by-vector': ['collectionId', 'vector', 'topK', 'threshold', 'includeVectors', 'computeContext'],
                '/list': ['collectionId', 'computeContext'], '/delete': ['collectionId', 'hashes', 'computeContext'], '/purge': ['collectionId', 'computeContext'], '/rerank': ['query', 'documents', 'topK', 'computeContext'],
            };
            const allowed = operations[req.path];
            if (!allowed || Object.keys(req.body || {}).some(key => key !== 'nativeRetrievalRef' && !allowed.includes(key))) throw new TypeError('Unsupported retrieval request');
            if (['/insert', '/delete', '/purge'].includes(req.path)) assertWritable();
            const ref = assertRetrievalRef(req.body.nativeRetrievalRef);
            const profile = await getStore().getExact(handle, ref);
            if (profile.mode !== (req.path === '/rerank' ? 'rerank' : 'embed')) throw new TypeError('Retrieval task mismatch');
            if (req.path === '/rerank' && !req.body.computeContext) throw Object.assign(new Error('Rerank requires original Run/Task budget authority'), { code: 'native_generation_budget_lane_denied' });
            if (req.path === '/rerank' && (typeof req.body.query !== 'string' || !req.body.query.trim() || req.body.query.length > 8192
                || !Array.isArray(req.body.documents) || !req.body.documents.length || req.body.documents.length > 64
                || req.body.documents.some(doc => typeof doc?.text !== 'string' || !doc.text || doc.text.length > 65536)
                || Buffer.byteLength(JSON.stringify(req.body.documents), 'utf8') > 262144)) throw new TypeError('Bounded rerank input required');
            const usesProvider = ['/insert', '/query', '/query-multi', '/rerank'].includes(req.path);
            const compute = req.body.computeContext ? await prepareRetrievalCompute({ handle, context: req.body.computeContext, profile, ...await getComputeServices() }) : null;
            if (compute && usesProvider && profile.mode === 'embed' && profile.source !== 'transformers' && !supportsOpenAIEmbeddingSource(profile.source)) {
                throw Object.assign(new Error('Budgeted Embedding provider unavailable'), { code: 'native_retrieval_compute_unavailable' });
            }
            const secret = usesProvider ? resolveSecret(req.user.directories, profile.secretRef) : '';
            const settings = {
                native: true, model: profile.model, indexScope: ref.retrievalProfileId + '_' + ref.revision,
                reverseProxy: profile.endpoint, proxyPassword: secret, apiUrl: profile.endpoint, apiKey: secret,
                extrasUrl: profile.endpoint, extrasKey: secret, keep: profile.options.keep === true,
                options: { dimensions: profile.options.dimensions, task: profile.options.task, late_chunking: profile.options.lateChunking === true },
                request: req, embeddings: req.body.embeddings || {},
            };
            if (profile.source !== 'webllm' && req.body.embeddings !== undefined) throw new TypeError('Only WebLLM accepts browser embeddings');
            if (profile.source === 'webllm' && ['/insert', '/query', '/query-multi'].includes(req.path)) {
                const texts = req.path === '/insert' ? req.body.items?.map(item => item.text) : [req.body.searchText];
                if (!Array.isArray(texts)) throw new TypeError('Embedding text is required');
                let dimension;
                for (const text of texts) {
                    const vector = settings.embeddings[text];
                    if (!Array.isArray(vector) || !vector.length || vector.length > 65536 || vector.some(n => !Number.isFinite(n)) || (dimension && vector.length !== dimension)) throw new TypeError('Invalid browser embeddings');
                    dimension = vector.length;
                }
            }
            if (profile.source === 'koboldcpp' && ['/insert', '/query', '/query-multi'].includes(req.path)) {
                const texts = req.path === '/insert' ? req.body.items?.map(item => item.text) : [req.body.searchText];
                const url = new URL(profile.endpoint); url.pathname = '/api/extra/embeddings';
                const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(secret ? { Authorization: `Bearer ${secret}` } : {}), ...profile.headers }, body: JSON.stringify({ input: texts }), redirect: 'error', signal: AbortSignal.timeout(120000) });
                if (!response.ok) throw new Error('Embedding provider failed');
                const result = await response.json();
                if (!Array.isArray(result.data) || result.data.length !== texts.length || result.data.some(item => !Array.isArray(item.embedding) || !item.embedding.length || item.embedding.some(n => !Number.isFinite(n)))) throw new Error('Invalid embeddings');
                settings.embeddings = Object.fromEntries(texts.map((text, i) => [text, result.data[i].embedding]));
            }
            const controller = new AbortController();
            res.once('close', () => { if (!res.writableEnded) controller.abort(); });
            req.nativeRetrieval = { profile, secret, settings, compute, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]) };
            req.body = { ...req.body, source: profile.source, model: profile.model };
            const json = res.json.bind(res);
            res.json = value => json(res.statusCode >= 400 ? { error: [...NATIVE_RETRIEVAL_COMPUTE_ERRORS, ...NATIVE_RETRIEVAL_SCOPE_ERRORS].includes(value?.error) ? value.error : 'native_retrieval_execution_failed' } : value);
            next();
        } catch (error) {
            const code = ['native_retrieval_unavailable', 'native_retrieval_compute_unavailable', 'native_retrieval_secret_unavailable', ...NATIVE_RETRIEVAL_SCOPE_ERRORS].includes(error.code) ? error.code : 'native_retrieval_invalid';
            res.status(code === 'storage_read_only' ? 503 : 400).json({ error: code });
        }
    };
}
