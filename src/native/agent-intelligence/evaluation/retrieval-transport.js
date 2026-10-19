import { fields } from '../../../../public/shared/native-values.js';
import { assertNativeId } from '../../identity.js';
import { NativeRetrievalPersistence } from '../../retrieval-persistence.js';
import { NativeMemoryAuthority } from '../../memory-authority.js';
import { retrievalRef } from '../../../../public/scripts/native/retrieval-contracts.js';
import { hashNativeDocument as hash } from '../../repositories/common.js';
import { retrievalPostTarget, retrievalSendIdentity } from '../../retrieval-send-contracts.js';
import { resolveRetrievalSecret } from '../../retrieval-execution.js';
import { getOpenAIBatchVector, openAIEmbeddingBody, supportsOpenAIEmbeddingSource } from '../../../vectors/openai-vectors.js';
import { rerank } from '../../../vectors/rerank.js';
import { observedGenerationUsage } from '../../adapters/generation-usage.js';

const fail = () => { throw Object.assign(new TypeError('native_orchestration_evaluation_retrieval_denied'), { code: 'native_orchestration_evaluation_retrieval_denied' }); };
const same = (a, b) => hash(a) === hash(b);

/** Public immutable Profile/settings closure only; never source Memory or Secret. */
export async function frozenEvaluationRetrieval(host, handle, nativePlan) {
    const nodes = nativePlan.revision.definition.nodes.filter(node => node.capabilities.includes('memory.retrieve'));
    if (nativePlan.sourceSelector.domain !== 'rp_chat') { if (nodes.length) fail(); return {}; }
    const authority = host.turnOrchestration?.memoryAuthority;
    if (!nodes.length && !(authority instanceof NativeMemoryAuthority)) return {};
    if (!(authority instanceof NativeMemoryAuthority) || authority.settingsRepo._engine !== host.persistence._engine) fail();
    const pins = nativePlan.revision.dependencyPins.filter(pin => pin.port === 'context' && nodes.some(node => node.dependencyPinIds.includes(pin.pinId)));
    const store = new NativeRetrievalPersistence({ engine: host.persistence._engine }), profiles = new Map();
    for (const pin of pins) {
        const profile = await store.getExact(handle, pin.resourceRef);
        if (hash(profile) !== pin.integrity || (profile.mode === 'embed' ? !supportsOpenAIEmbeddingSource(profile.source) : !['cohere', 'jina', 'custom'].includes(profile.source))) fail();
        profiles.set(hash(retrievalRef(profile)), profile);
    }
    if (nodes.length && !profiles.size) fail();
    return { ...(profiles.size ? { retrievalProfiles: [...profiles].sort(([a], [b]) => a.localeCompare(b)).map(([, profile]) => profile) } : {}),
        memorySettings: (await authority._settings(handle)).value };
}

export function evaluationRetrievalTransport(config, send, active) {
    return { async fetch({ profile, endpoint, method, body, signal, effectRef }) {
        const packet = active();
        if (!packet || signal?.aborted || !config.retrievalProfiles?.some(saved => same(saved, profile))) fail();
        const target = retrievalPostTarget(profile);
        if (endpoint !== target.endpoint || method !== target.method) fail();
        const raw = await send({ kind: 'retrieval', trialId: packet.trialId, nativeRetrievalRef: retrievalRef(profile), profileIntegrity: hash(profile),
            endpoint, method, body, effectRef, requestHash: hash({ endpoint, method, body }), snapshotHash: hash({ profile, effectRef }) });
        return { ok: true, status: 200, json: async () => raw };
    } };
}

/** The parent's original evaluator bank pays; original protocols resolve Secret
 * and execute. Child messages can choose neither target nor provider settings. */
export async function sendEvaluationRetrieval({ host, repository, handle, job, config, payload, signal, fresh }) {
    payload = structuredClone(payload);
    const memorySettingsDigest = hash(config.memorySettings ?? null);
    if (!['baseline', 'candidate'].includes(payload.arm) || payload.kind !== 'retrieval') fail();
    const profile = structuredClone(config.retrievalProfiles?.find(profile => same(retrievalRef(profile), payload.nativeRetrievalRef)) ?? null);
    if (!profile || hash(profile) !== payload.profileIntegrity || payload.snapshotHash !== hash({ profile, effectRef: payload.effectRef })) fail();
    fields(payload.effectRef, ['runId', 'effectId', 'nodeAttemptId', 'modelEffectId'], 'Worker retrieval Effect');
    for (const key of ['runId', 'effectId', 'nodeAttemptId', 'modelEffectId']) assertNativeId(payload.effectRef?.[key], key === 'runId' ? 'orchestrationRun' : key === 'nodeAttemptId' ? 'orchestrationAttempt' : 'orchestrationEffect');
    const { body, endpoint, method } = payload, target = retrievalPostTarget(profile);
    if (endpoint !== target.endpoint || method !== target.method || payload.requestHash !== hash({ endpoint, method, body })) fail();
    const texts = profile.mode === 'embed' ? body?.input : body?.documents;
    if (!Array.isArray(texts) || !texts.length || texts.length > (profile.mode === 'embed' ? 10 : 64)
        || texts.some(text => typeof text !== 'string' || !text || text.length > 65536)) fail();
    if (profile.mode === 'embed' ? !same(body, openAIEmbeddingBody(texts, profile.source, profile.model))
        : typeof body.query !== 'string' || !body.query || body.query.length > 8192 || body.top_n !== texts.length
            || !same(body, { model: profile.model, query: body.query, documents: texts, top_n: body.top_n })) fail();
    const upperBound = Buffer.byteLength(JSON.stringify(body), 'utf8');
    if (!upperBound || upperBound > 1048576) fail();
    const assertCurrent = async () => {
        signal.throwIfAborted(); await fresh();
        if (host.persistence._engine.hasActiveTransaction(handle)) fail();
        const exact = await new NativeRetrievalPersistence({ engine: host.persistence._engine }).getExact(handle, retrievalRef(profile));
        const settings = (await host.turnOrchestration.memoryAuthority._settings(handle)).value;
        if (!same(exact, profile) || hash(settings) !== memorySettingsDigest) fail();
        signal.throwIfAborted();
    };
    await assertCurrent();
    const id = hash({ jobId: job.id, scopeId: job.scopeId, effectId: payload.effectRef.effectId }), reservation = await repository.reserve(handle, { id, scopeId: job.scopeId, jobId: job.id, kind: payload.arm, upperBound,
        trialId: payload.trialId, requestHash: payload.requestHash, snapshotHash: payload.snapshotHash });
    let usage = null, admitted = false, answer;
    try {
        const delay = reservation.createdAt - Date.now();
        if (delay > 0) await new Promise((resolve, reject) => {
            const cancel = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); reject(new Error('evolution_cancelled')); };
            const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, delay);
            signal.addEventListener('abort', cancel, { once: true }); if (signal.aborted) cancel();
        });
        const expected = retrievalSendIdentity(profile, body, { endpoint, method });
        const ticket = Object.freeze({}), compute = { beforeSend: async (actual, transport) => {
            if (admitted || !same(retrievalSendIdentity(profile, actual, transport), expected)) fail();
            await assertCurrent(); admitted = true; return ticket;
        }, settle: async (value, actualTicket) => {
            if (actualTicket === undefined) return;
            if (actualTicket !== ticket || !admitted) fail();
            const observed = observedGenerationUsage(value, { inputTokens: 'prompt_tokens', outputTokens: 'completion_tokens', totalTokens: 'total_tokens' });
            usage = observed?.totalTokens !== undefined ? observed : null;
        } };
        await assertCurrent();
        const directories = host.persistence._engine._directoriesByHandle(handle), secret = resolveRetrievalSecret(directories, profile.secretRef);
        const request = { nativeRetrieval: { profile, compute, signal } };
        const result = profile.mode === 'embed' ? await getOpenAIBatchVector(texts, profile.source, directories, profile.model,
            { reverseProxy: profile.endpoint, proxyPassword: secret }, request)
            : await rerank(profile.source, { model: profile.model, reverseProxy: profile.endpoint, proxyPassword: secret,
                apiUrl: profile.endpoint, apiKey: secret }, body.query, texts.map((text, index) => ({ text, index })), body.top_n, directories, request);
        await assertCurrent();
        if (profile.mode === 'embed' && (!Array.isArray(result) || result.length !== texts.length
            || result.some(vector => !Array.isArray(vector) || !vector.length || vector.length > 65536
                || vector.length !== result[0].length || vector.some(value => !Number.isFinite(value))))) fail();
        const reportedUsage = usage ? { total_tokens: usage.totalTokens, ...(usage.inputTokens !== undefined ? { prompt_tokens: usage.inputTokens } : {}),
            ...(usage.outputTokens !== undefined ? { completion_tokens: usage.outputTokens } : {}) } : null;
        const raw = { ...(profile.mode === 'embed' ? { data: result.map((embedding, index) => ({ index, embedding })) }
            : { results: result.map(({ index, relevance_score }) => ({ index, relevance_score })) }), usage: reportedUsage };
        answer = { raw, charge: { id, trialId: payload.trialId, kind: payload.arm, requestHash: payload.requestHash, snapshotHash: payload.snapshotHash,
            status: usage?.totalTokens !== undefined ? 'reported' : 'unknown', tokens: usage?.totalTokens ?? upperBound, usage,
            // A confirmed Model price does not price Embedding/Rerank work.
            cost: null } };
    } finally { await repository.settle(handle, id, usage?.totalTokens ?? null, { usage, cost: null }); }
    await assertCurrent(); return answer;
}
