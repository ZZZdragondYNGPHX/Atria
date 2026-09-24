import fetch from 'node-fetch';
import { NativeRetrievalPersistence } from './retrieval-persistence.js';
import { getStorageEngine } from '../storage/index.js';
import { readSecret, SECRET_KEYS } from '../endpoints/secrets.js';
import { assertRetrievalRef } from '../../public/scripts/native/retrieval-contracts.js';
import { assertWritable } from '../storage/read-only-mode.js';

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
export function createRetrievalMiddleware(getStore = () => new NativeRetrievalPersistence({ engine: getStorageEngine() }), resolveSecret = resolveRetrievalSecret) {
    return async (req, res, next) => {
        if (req.nativeRetrieval || !Object.hasOwn(req.body || {}, 'nativeRetrievalRef')) return next();
        try {
            const handle = req.user?.profile?.handle;
            if (!handle) return res.sendStatus(401);
            const operations = {
                '/insert': ['collectionId', 'items', 'embeddings'], '/query': ['collectionId', 'searchText', 'topK', 'threshold', 'includeVectors', 'embeddings'],
                '/query-multi': ['collectionIds', 'searchText', 'topK', 'threshold', 'embeddings'], '/query-by-vector': ['collectionId', 'vector', 'topK', 'threshold', 'includeVectors'],
                '/list': ['collectionId'], '/delete': ['collectionId', 'hashes'], '/purge': ['collectionId'], '/rerank': ['query', 'documents', 'topK'],
            };
            const allowed = operations[req.path];
            if (!allowed || Object.keys(req.body).some(key => key !== 'nativeRetrievalRef' && !allowed.includes(key))) throw new TypeError('Unsupported retrieval request');
            if (['/insert', '/delete', '/purge'].includes(req.path)) assertWritable();
            const ref = assertRetrievalRef(req.body.nativeRetrievalRef);
            const profile = await getStore().getExact(handle, ref);
            if (profile.mode !== (req.path === '/rerank' ? 'rerank' : 'embed')) throw new TypeError('Retrieval task mismatch');
            const usesProvider = ['/insert', '/query', '/query-multi', '/rerank'].includes(req.path);
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
                const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(secret ? { Authorization: `Bearer ${secret}` } : {}) }, body: JSON.stringify({ input: texts }), redirect: 'error', signal: AbortSignal.timeout(120000) });
                if (!response.ok) throw new Error('Embedding provider failed');
                const result = await response.json();
                if (!Array.isArray(result.data) || result.data.length !== texts.length || result.data.some(item => !Array.isArray(item.embedding) || !item.embedding.length || item.embedding.some(n => !Number.isFinite(n)))) throw new Error('Invalid embeddings');
                settings.embeddings = Object.fromEntries(texts.map((text, i) => [text, result.data[i].embedding]));
            }
            req.nativeRetrieval = { profile, secret, settings };
            req.body = { ...req.body, source: profile.source, model: profile.model };
            const json = res.json.bind(res);
            res.json = value => json(res.statusCode >= 400 ? { error: 'native_retrieval_execution_failed' } : value);
            next();
        } catch (error) {
            const code = ['native_retrieval_unavailable', 'native_retrieval_secret_unavailable', 'storage_read_only'].includes(error.code) ? error.code : 'native_retrieval_invalid';
            res.status(code === 'storage_read_only' ? 503 : 400).json({ error: code });
        }
    };
}
