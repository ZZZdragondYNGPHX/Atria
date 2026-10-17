import { assertRetrievalProfile, retrievalRef } from '../../public/scripts/native/retrieval-contracts.js';
import { fields } from '../../public/shared/native-values.js';
import { hashNativeDocument as hash } from './repositories/common.js';
import { supportsOpenAIEmbeddingSource } from '../vectors/openai-vectors.js';

const fail = () => { throw Object.assign(new TypeError('native_retrieval_send_target_mismatch'), { code: 'native_retrieval_send_target_mismatch' }); };

/** Actual POST target and serialized payload, without credentials or body storage. */
export function retrievalSendIdentity(value, body, transport) {
    const profile = assertRetrievalProfile(value);
    fields(transport, ['endpoint', 'method'], 'Retrieval transport');
    if (transport.method !== 'POST' || typeof transport.endpoint !== 'string') fail();
    let endpoint;
    if (profile.mode === 'embed' && supportsOpenAIEmbeddingSource(profile.source)) endpoint = profile.endpoint + '/embeddings';
    else if (profile.mode === 'rerank') {
        const url = new URL(profile.endpoint);
        if (profile.source !== 'custom' || !url.pathname.endsWith('/rerank')) url.pathname = url.pathname.replace(/\/$/, '') + '/rerank';
        endpoint = url.href;
    } else fail();
    if (transport.endpoint !== new URL(endpoint).href) fail();
    const target = { nativeRetrievalRef: retrievalRef(profile), profileIntegrity: hash(profile), endpoint: transport.endpoint, method: transport.method };
    return { targetFingerprint: hash(target), inputFingerprint: hash(body) };
}
