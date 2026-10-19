import { createServer } from 'node:http';
import { rpDelegationFixture } from './rp-delegation-fixture.js';
import { NativeRetrievalPersistence } from '../../../src/native/retrieval-persistence.js';
import { SettingsRepo } from '../../../src/storage/repositories/settings-repo.js';
import { SecretManager, SECRET_KEYS } from '../../../src/endpoints/secrets.js';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { retrievalRef } from '../../../public/scripts/native/retrieval-contracts.js';

// Real immutable parent/child publication, brief-only handoff and original RP
// Memory. A stored or owned Profile is never treated as a child source grant.
export async function delegateContextRetrievalFixture(make, { mode = 'none' } = {}) {
    const calls = []; let profile;
    const server = createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw); calls.push({ endpoint: req.url, body });
        res.writeHead(200, { 'Content-Type': 'application/json', Connection: 'close' });
        res.end(JSON.stringify({ data: body.input.map((_, index) => ({ index, embedding: [1, 0, 0] })), usage: { total_tokens: 7 } }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const ownRetrieval = plan => {
        const node = plan.definition.nodes[0];
        node.dependencyPinIds.push('delegate.memory');
        if (!node.capabilities.includes('memory.retrieve')) node.capabilities.push('memory.retrieve');
        if (!plan.definition.capabilityCeiling.includes('memory.retrieve')) plan.definition.capabilityCeiling.push('memory.retrieve');
        plan.dependencyPins.push({ pinId: 'delegate.memory', port: 'context', resourceRef: retrievalRef(profile), integrity: hash(profile) });
    };
    try {
        const settings = { enabled: true, sourceWritesEnabled: false, memoryOsTokenBudget: 2400 };
        const f = await rpDelegationFixture(make, { memorySettings: settings, seedMemory: true,
            configurePlan: async (_plan, { h }) => {
                const manager = new SecretManager(h.dirs), secretId = manager.writeSecret(SECRET_KEYS.ATRIA_RUNTIME,
                    'synthetic-delegate-embedding-secret', 'Delegate boundary embedding', { activate: false });
                profile = { retrievalProfileId: createNativeId('retrievalProfile'), revision: createNativeId('revision'), displayName: 'Delegate boundary embedding',
                    mode: 'embed', source: 'openai', model: 'delegate-boundary-embed', endpoint: `http://127.0.0.1:${server.address().port}/v1`, secretRef: { secretId }, options: {} };
                await new NativeRetrievalPersistence({ engine: h.engine }).commit(h.handle, profile);
                if (mode !== 'none') await new SettingsRepo({ engine: h.engine }).save(h.handle, { atri_capabilities: {
                    memory_graph: { ...settings, nativeRetrieval: { embed: retrievalRef(profile) } },
                } });
            }, configureChildPlan: plan => {
                plan.definition.limits.deadlineMs = 300000;
                if (mode === 'parent_child') ownRetrieval(plan);
            }, configureParentPlan: plan => {
                plan.definition.limits.deadlineMs = 300000;
                if (['parent', 'parent_child'].includes(mode)) ownRetrieval(plan);
            } });
        const cleanup = f.cleanup;
        return Object.assign(f, { calls, profile, async cleanup() {
            await cleanup(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
        } });
    } catch (error) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); throw error; }
}
