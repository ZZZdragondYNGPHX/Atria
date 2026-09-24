// Player-owned retrieval resources. These are never portable Library content.
export const RETRIEVAL_PROVIDERS = Object.freeze({
    embed: ['transformers', 'webllm', 'openai', 'cohere', 'jina', 'mistral', 'nomicai', 'togetherai', 'openrouter', 'electronhub', 'chutes', 'nanogpt', 'siliconflow', 'workers_ai', 'palm', 'vertexai', 'ollama', 'llamacpp', 'vllm', 'koboldcpp', 'extras'],
    rerank: ['cohere', 'jina', 'custom'],
});
const local = new Set(['transformers', 'webllm']);
const optionalAuth = new Set(['ollama', 'llamacpp', 'vllm', 'koboldcpp', 'extras', 'custom']);
function keys(value, allowed) {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]' || Object.keys(value).some(key => !allowed.includes(key))) throw new TypeError('Unsupported retrieval fields');
}
function text(value, field, max = 256) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new TypeError(field + ' is required');
    return value.trim();
}
export function assertRetrievalRef(value) {
    keys(value, ['scope', 'retrievalProfileId', 'revision']);
    if (value.scope !== 'player' || !/^retr_[a-f0-9]{32}$/.test(value.retrievalProfileId) || !/^rev_[a-f0-9]{32}$/.test(value.revision)) throw new TypeError('An exact player retrieval reference is required');
    return { scope: 'player', retrievalProfileId: value.retrievalProfileId, revision: value.revision };
}
export function retrievalRef(value) {
    return assertRetrievalRef({ scope: 'player', retrievalProfileId: value.retrievalProfileId, revision: value.revision });
}
export function assertRetrievalProfile(value) {
    keys(value, ['retrievalProfileId', 'revision', 'displayName', 'mode', 'source', 'model', 'endpoint', 'secretRef', 'options']);
    const ref = retrievalRef(value);
    if (!RETRIEVAL_PROVIDERS[value.mode]?.includes(value.source)) throw new TypeError('Unsupported retrieval provider');
    const displayName = text(value.displayName, 'Display name', 120);
    const model = text(value.model, 'Model');
    let endpoint = '';
    if (!local.has(value.source)) {
        const url = new URL(text(value.endpoint, 'Endpoint', 2048));
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new TypeError('Endpoint must be an HTTP URL without credentials, query or fragment');
        endpoint = url.href.replace(/\/+$/, '');
    } else if (value.endpoint) throw new TypeError('Local provider does not use an endpoint');
    let secretRef;
    if (value.secretRef != null) {
        keys(value.secretRef, ['secretId']);
        secretRef = { secretId: text(value.secretRef.secretId, 'Secret', 256) };
        if (local.has(value.source)) throw new TypeError('Local provider does not use a Secret');
    } else if (!local.has(value.source) && !optionalAuth.has(value.source)) throw new TypeError('Select a stored Secret');
    const options = value.options || {};
    const allowed = value.source === 'jina' && value.mode === 'embed' ? ['dimensions', 'task', 'lateChunking'] : value.source === 'ollama' ? ['keep'] : value.source === 'vertexai' ? ['authMode', 'region', 'projectId'] : [];
    keys(options, allowed);
    for (const key of ['lateChunking', 'keep']) if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new TypeError(key + ' must be boolean');
    if (options.dimensions !== undefined && (!Number.isSafeInteger(options.dimensions) || options.dimensions < 1 || options.dimensions > 65536)) throw new TypeError('Invalid dimensions');
    if (options.task !== undefined && !['retrieval.query', 'retrieval.passage', 'text-matching', 'classification', 'separation'].includes(options.task)) throw new TypeError('Invalid embedding task');
    if (options.authMode !== undefined && !['express', 'full', 'proxy'].includes(options.authMode)) throw new TypeError('Invalid Vertex authentication mode');
    for (const key of ['region', 'projectId']) if (options[key] !== undefined && !/^[a-zA-Z0-9_-]{1,128}$/.test(options[key])) throw new TypeError('Invalid ' + key);
    return { retrievalProfileId: ref.retrievalProfileId, revision: ref.revision, displayName, mode: value.mode, source: value.source, model, endpoint, ...(secretRef ? { secretRef } : {}), options: { ...options } };
}
export function normalizeMemoryRetrieval(value = {}) {
    keys(value, ['embed', 'rerank']);
    return Object.fromEntries(Object.entries(value).filter(([, ref]) => ref != null).map(([mode, ref]) => [mode, assertRetrievalRef(ref)]));
}
