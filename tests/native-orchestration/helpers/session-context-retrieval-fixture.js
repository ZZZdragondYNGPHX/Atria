import { createServer } from 'node:http';
import { modelPortFixture } from './model-port-fixture.js';
import { resolverTurnFixture } from './resolver-turn-fixture.js';
import { configureSessionOutput } from './session-output-fixture.js';
import { NativeMemoryAuthority } from '../../../src/native/memory-authority.js';
import { NativeRetrievalPersistence } from '../../../src/native/retrieval-persistence.js';
import { SettingsRepo } from '../../../src/storage/repositories/settings-repo.js';
import { SecretManager, SECRET_KEYS } from '../../../src/endpoints/secrets.js';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { retrievalRef } from '../../../public/scripts/native/retrieval-contracts.js';

export async function sessionContextRetrievalFixture(make, { quota = false, retrievalUsage = { total_tokens: 7 }, reranking = false, competingSources = false, declareRetrieval = true, retrievalOwner = 'narrator', beforeBase = async () => {}, ...options } = {}) {
    const calls = []; let onRetrieval = async () => {};
    const server = createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw); calls.push({ endpoint: req.url, body, auth: req.headers.authorization }); await onRetrieval();
        const usage = typeof retrievalUsage === 'function' ? retrievalUsage(body, calls.length) : retrievalUsage;
        res.writeHead(200, { 'Content-Type': 'application/json', Connection: 'close' });
        res.end(JSON.stringify({ ...(body.input ? { data: body.input.map((_, index) => ({ index, embedding: [1, 0, 0] })) }
            : { results: body.documents.map((_, index) => ({ index, relevance_score: index })) }), usage }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const memorySettings = { enabled: true, sourceWritesEnabled: false, memoryOsTokenBudget: 2400 };
        const f = await (quota ? resolverTurnFixture : modelPortFixture)(make, { ...options, memorySettings, beforeBase: async args => {
            await beforeBase(args);
            if (!competingSources) return;
            const { core, handle, fixture } = args, settingsRepo = new SettingsRepo({ engine: core._sessions._engine });
            await settingsRepo.save(handle, { atri_capabilities: { memory_graph: { ...memorySettings, sourceWritesEnabled: true } } });
            const authority = new NativeMemoryAuthority({ core, settingsRepo }), messageIds = [];
            for (const content of ['Alice left because of a storm.', 'Alice left because of a promise.']) {
                const snapshot = await core.appendTimeline(handle, fixture.snapshot.session.sessionId, { role: 'assistant', content });
                messageIds.push(snapshot.timeline.at(-1).messageId);
            }
            await core.appendTimeline(handle, fixture.snapshot.session.sessionId, { role: 'user', content: 'Why did Alice leave?' });
            const sessionId = fixture.snapshot.session.sessionId, observed = await authority.observe(handle, { sessionId });
            const { sources } = await authority.sources(handle, { sessionId, messageIds });
            await authority.apply(handle, { sessionId, expectedRevisionId: observed.identity.revisionId, expectedBranchId: observed.identity.branchId,
                expectedLedgerFingerprint: observed.ledgerFingerprint, expectedSettingsFingerprint: observed.settingsFingerprint, commitId: 'session-competing-cause-fixture', messageIds,
                facts: sources.map(source => ({ action: 'create', type: 'inferred', text: source.content, evidence: [{ episodeId: source.episodeId, excerpt: source.content }] })) });
        },
        changeContract: contract => {
            const view = contract.informationRuntime.views.find(item => item.id === 'pov'); view.sources.push('history'); view.memory = true;
        }, changeSource: source => {
            const info = source.contract.informationRuntime, view = info.views.find(item => item.audience === 'narrator');
            view.memory = true; view.sources.push('session-history');
            info.sources.push({ id: 'session-history', kind: 'timeline', semantic: 'narrative', scopeId: 'session', fields: [['content'], ['role']] });
        }, configurePlan: async args => {
            const { plan, h, narratorNodeId } = args; configureSessionOutput(args);
            const manager = new SecretManager(h.dirs), secretId = manager.writeSecret(SECRET_KEYS.ATRIA_RUNTIME, 'synthetic-session-embedding-secret', 'Session embedding', { activate: false });
            const refs = {}, node = plan.definition.nodes.find(node => node.nodeId === (retrievalOwner === 'resolver' ? args.resolverNodeId : narratorNodeId));
            for (const mode of ['embed', ...reranking ? ['rerank'] : []]) {
                const profile = { retrievalProfileId: createNativeId('retrievalProfile'), revision: createNativeId('revision'), displayName: 'Session scoped ' + mode,
                    mode, source: mode === 'embed' ? 'openai' : 'custom', model: 'scoped-session-' + mode, endpoint: `http://127.0.0.1:${server.address().port}/v1`, secretRef: { secretId }, options: {} };
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
        const originalCleanup = f.cleanup;
        return Object.assign(f, { calls, onRetrieval: callback => { onRetrieval = callback; }, async cleanup() { await originalCleanup(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } });
    } catch (error) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); throw error; }
}
