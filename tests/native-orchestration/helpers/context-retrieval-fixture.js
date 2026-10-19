import { createServer } from 'node:http';
import { rpModelFixture } from './rp-model-fixture.js';
import { NativeRetrievalPersistence } from '../../../src/native/retrieval-persistence.js';
import { SettingsRepo } from '../../../src/storage/repositories/settings-repo.js';
import { ChatRepo } from '../../../src/storage/repositories/chat-repo.js';
import { SecretManager, SECRET_KEYS } from '../../../src/endpoints/secrets.js';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { retrievalRef } from '../../../public/scripts/native/retrieval-contracts.js';
import { PROVENANCE_NAMESPACE } from '../../../public/scripts/agents/memory/source-lifecycle.js';
import { emptyProvenance, captureEpisodes } from '../../../public/scripts/agents/memory/source-provenance.js';
import { applyFactOperations } from '../../../public/scripts/agents/memory/atomic-facts.js';

export async function contextRetrievalFixture(make, { usage = true, modelUsage = true, singleSource = false, reservePolicy, embedding = false, reranking = !embedding, malformed = false, query = 'Why did Alice leave?', declareRetrieval = true, providerUsage = { total_tokens: 7 }, afterPlan = null, responsePayload } = {}) {
    const calls = [];
    let onRerank = async () => {};
    const server = createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw); calls.push({ body, endpoint: req.url, auth: req.headers.authorization });
        await onRerank();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...(body.input ? { data: body.input.map((_, index) => ({ index, embedding: malformed ? [] : [1, 0, 0] })) }
            : { results: body.documents.map((_, index) => ({ index, relevance_score: index })) }), ...(usage ? { usage: typeof providerUsage === 'function' ? providerUsage(body, calls.length) : providerUsage } : {}) }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const f = await rpModelFixture(make, { responsePayload, usage: modelUsage, seedMemory: true, memorySettings: { enabled: true, memoryOsTokenBudget: 2400 }, configurePlan: async (plan, { h, host, route, seeded }) => {
            if (reservePolicy !== undefined) {
                await host.persistence.saveRuntimeRoute(h.handle, { ...route, executionPolicy: { ...route.executionPolicy,
                    optionalWork: { mode: 'preserve_required', roles: ['rerank'], ...(reservePolicy === null ? {} : { requiredCompute: reservePolicy }) } } });
                plan.dependencyPins[0].integrity = hash(await host.persistence.getRuntimeRoute(h.handle, route.runtimeRouteId));
            }
            const manager = new SecretManager(h.dirs), secretId = manager.writeSecret(SECRET_KEYS.ATRIA_RUNTIME, 'synthetic-rerank-secret', 'Scoped ranker', { activate: false });
            const refs = {};
            for (const mode of [...embedding ? ['embed'] : [], ...reranking ? ['rerank'] : []]) {
                const profile = { retrievalProfileId: createNativeId('retrievalProfile'), revision: createNativeId('revision'), displayName: 'Scoped ' + mode,
                    mode, source: mode === 'embed' ? 'openai' : 'custom', model: 'scoped-' + mode,
                    endpoint: `http://127.0.0.1:${server.address().port}/v1`, secretRef: { secretId }, options: {} };
                await new NativeRetrievalPersistence({ engine: h.engine }).commit(h.handle, profile);
                refs[mode] = retrievalRef(profile);
                if (declareRetrieval) {
                    plan.definition.nodes[0].dependencyPinIds.push('memory.' + mode);
                    plan.dependencyPins.push({ pinId: 'memory.' + mode, port: 'context', resourceRef: retrievalRef(profile), integrity: hash(profile) });
                }
            }
            if (declareRetrieval) { plan.definition.nodes[0].capabilities.push('memory.retrieve'); plan.definition.capabilityCeiling.push('memory.retrieve'); }
            plan.definition.nodes[1].capabilities.push('chat.output'); plan.definition.capabilityCeiling.push('chat.output');
            Object.assign(plan.definition.outputContract, { kind: 'rp_narration', slot: 'assistant', resultPolicy: { outputType: 'text', maxBytes: 16384 } });
            await new SettingsRepo({ engine: h.engine }).save(h.handle, { atri_capabilities: { memory_graph: { enabled: true, memoryOsTokenBudget: 2400,
                sourceWritesEnabled: false, rerankEnabled: reranking, nativeRetrieval: refs } } });
            const chats = new ChatRepo({ engine: h.engine }), chat = await chats.get(h.handle, 'Actor', 'main');
            const before = await chats.getState(h.handle, 'Actor', 'main', PROVENANCE_NAMESPACE);
            chat.body[0].mes = 'Alice left because of a storm.'; chat.body[1].mes = query;
            chat.body.splice(1, 0, { name: 'Actor', is_user: false, mes: 'Alice left because of a promise.', memory_os_source_id: 'rp-cause-second' });
            await chats.save(h.handle, 'Actor', 'main', chat.header, chat.body, chat.integrity);
            const state = emptyProvenance(); state.scopeId = before.scopeId;
            const all = [...chat.body, { mes: 'FUTURE FORBIDDEN MEMORY', memory_os_source_id: 'rp-future' }];
            const episodeIds = captureEpisodes(state, all, singleSource ? [0, 3] : [0, 1, 3], state.scopeId); let serial = 0;
            const facts = applyFactOperations(state, ['Alice left because of a storm.', ...singleSource ? [] : ['Alice left because of a promise.']].map((text, index) => ({ action: 'create', type: 'inferred', text,
                evidence: [{ episodeId: episodeIds[index], excerpt: chat.body[index].mes }] })), { scopeId: state.scopeId, episodeIds }, all, () => 'cause-' + ++serial, 1000);
            await chats.setState(h.handle, 'Actor', 'main', PROVENANCE_NAMESPACE, facts.state);
            await afterPlan?.(plan, { h, host, route, seeded });
        } });
        return { ...f, calls, onRerank: callback => { onRerank = callback; }, async cleanup() { await f.cleanup(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
    } catch (error) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); throw error; }
}
