import { createServer } from 'node:http';
import { backgroundModelFixture } from './background-model-fixture.js';
import { NativeMemoryAuthority } from '../../../src/native/memory-authority.js';
import { NativeRetrievalPersistence } from '../../../src/native/retrieval-persistence.js';
import { SettingsRepo } from '../../../src/storage/repositories/settings-repo.js';
import { SecretManager, SECRET_KEYS } from '../../../src/endpoints/secrets.js';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { retrievalRef } from '../../../public/scripts/native/retrieval-contracts.js';

/** Original queued background Task, Task Information grant, compiler and banks.
 * Only the upstream retrieval and Model HTTP responses are synthetic. */
export async function backgroundContextRetrievalFixture(make, { inputOnly = false, declareRetrieval = !inputOnly, retrievalUsage = { total_tokens: 7 }, reranking = false, competingSources = false,
    prepareReady = async (_fixture, _h, base) => base, ...options } = {}) {
    const calls = []; let onRetrieval = async () => {};
    const server = createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw); calls.push({ endpoint: req.url, body, auth: req.headers.authorization });
        await onRetrieval();
        res.writeHead(200, { 'Content-Type': 'application/json', Connection: 'close' });
        res.end(JSON.stringify({ ...(body.input ? { data: body.input.map((_, index) => ({ index, embedding: [1, 0, 0] })) }
            : { results: body.documents.map((_, index) => ({ index, relevance_score: index })) }),
        usage: typeof retrievalUsage === 'function' ? retrievalUsage(body, calls.length) : retrievalUsage }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const memorySettings = { enabled: true, sourceWritesEnabled: false, memoryOsTokenBudget: 2400 };
        const f = await backgroundModelFixture(make, { ...options, configureSource: ({ contract }) => {
            const view = contract.informationRuntime.views.find(item => item.audience === 'task' && item.taskId === 'summarize');
            view.sources.push('history'); view.memory = true;
            if (inputOnly) {
                contract.taskRuntime.tasks[0].context = ['input'];
                contract.informationRuntime.views = contract.informationRuntime.views.filter(item => item !== view);
            }
        }, prepareReady: async (fixture, h, base) => {
            const ready = await prepareReady(fixture, h, base);
            if (!competingSources) return ready;
            const { core } = fixture, settingsRepo = new SettingsRepo({ engine: h.engine }), sessionId = ready.session.sessionId, messageIds = [];
            await settingsRepo.save(h.handle, { atri_capabilities: { memory_graph: { ...memorySettings, sourceWritesEnabled: true } } });
            for (const content of ['Alice left because of a storm.', 'Alice left because of a promise.']) {
                const snapshot = await core.appendTimeline(h.handle, sessionId, { role: 'assistant', content });
                messageIds.push(snapshot.timeline.at(-1).messageId);
            }
            await core.appendTimeline(h.handle, sessionId, { role: 'user', content: 'Why did Alice leave?' });
            const authority = new NativeMemoryAuthority({ core, settingsRepo }), observed = await authority.observe(h.handle, { sessionId });
            const { sources } = await authority.sources(h.handle, { sessionId, messageIds });
            await authority.apply(h.handle, { sessionId, expectedRevisionId: observed.identity.revisionId, expectedBranchId: observed.identity.branchId,
                expectedLedgerFingerprint: observed.ledgerFingerprint, expectedSettingsFingerprint: observed.settingsFingerprint, commitId: 'background-competing-cause-fixture', messageIds,
                facts: sources.map(source => ({ action: 'create', type: 'inferred', text: source.content, evidence: [{ episodeId: source.episodeId, excerpt: source.content }] })) });
            return core.observe(h.handle, sessionId);
        }, configurePlan: async ({ plan, h, narratorNodeId }) => {
            const manager = new SecretManager(h.dirs), secretId = manager.writeSecret(SECRET_KEYS.ATRIA_RUNTIME,
                'synthetic-background-embedding-secret', 'Background embedding', { activate: false });
            const refs = {}, node = plan.definition.nodes.find(node => node.nodeId === narratorNodeId);
            for (const mode of ['embed', ...reranking ? ['rerank'] : []]) {
                const profile = { retrievalProfileId: createNativeId('retrievalProfile'), revision: createNativeId('revision'), displayName: 'Background scoped ' + mode,
                    mode, source: mode === 'embed' ? 'openai' : 'custom', model: 'scoped-background-' + mode,
                    endpoint: `http://127.0.0.1:${server.address().port}/v1`, secretRef: { secretId }, options: {} };
                await new NativeRetrievalPersistence({ engine: h.engine }).commit(h.handle, profile);
                refs[mode] = retrievalRef(profile);
                if (declareRetrieval) {
                    node.dependencyPinIds.push('memory.' + mode);
                    plan.dependencyPins.push({ pinId: 'memory.' + mode, port: 'context', resourceRef: refs[mode], integrity: hash(profile) });
                }
            }
            if (declareRetrieval) { node.capabilities.push('memory.retrieve'); plan.definition.capabilityCeiling.push('memory.retrieve'); }
            await new SettingsRepo({ engine: h.engine }).save(h.handle, { atri_capabilities: { memory_graph: { ...memorySettings, rerankEnabled: reranking, nativeRetrieval: refs } } });
        } });
        const installMemory = () => { f.authority.memoryAuthority = new NativeMemoryAuthority({ core: f.core,
            settingsRepo: new SettingsRepo({ engine: f.authority.engine }) }); };
        installMemory();
        const originalCleanup = f.cleanup, originalCold = f.cold;
        return Object.assign(f, { calls, onRetrieval: callback => { onRetrieval = callback; }, cold: async () => { await originalCold(); installMemory(); },
            async cleanup() { await originalCleanup(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } });
    } catch (error) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); throw error; }
}
