import { createServer } from 'node:http';
import { appraisalModelFixture } from './appraisal-model-fixture.js';
import { NativeRetrievalPersistence } from '../../../src/native/retrieval-persistence.js';
import { SettingsRepo } from '../../../src/storage/repositories/settings-repo.js';
import { SecretManager, SECRET_KEYS } from '../../../src/endpoints/secrets.js';
import { createNativeId } from '../../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../../src/native/repositories/common.js';
import { retrievalRef } from '../../../public/scripts/native/retrieval-contracts.js';

export const ACTOR_MEMORY = '阿岚记得自己借走蓝封面书，听到澄清后想起当初的归还承诺。';
export const OTHER_MEMORY = '沈墨私下断定阿岚故意隐瞒借书经过。';
export const HIDDEN_TRUTH = '未获阿岚视图授权的Truth秘密：实际寄信者另有其人。';

// The authored Task grants one Actor-scoped application source whose exact
// text/sourceMessageIds identify legal Timeline support. No broad history grant.
export async function appraisalContextRetrievalFixture(make, { retrievalUsage = { total_tokens: 7 }, ...options } = {}) {
    const calls = []; let onRetrieval = async () => {}, legalMessageId;
    const server = createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw); calls.push({ endpoint: req.url, body, auth: req.headers.authorization }); await onRetrieval();
        res.writeHead(200, { 'Content-Type': 'application/json', Connection: 'close' });
        res.end(JSON.stringify({ data: body.input.map((_, index) => ({ index, embedding: [1, 0, 0] })), usage: retrievalUsage }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        const memorySettings = { enabled: true, sourceWritesEnabled: false, memoryOsTokenBudget: 2400 };
        const f = await appraisalModelFixture(make, { ...options, memorySettings, configureSource: ({ contract }) => {
            const view = contract.informationRuntime.views.find(item => item.id === 'intent-task'); view.memory = true;
            contract.informationRuntime.views.find(item => item.id === 'player').sources.push('nodes');
            const domain = contract.lifecycleRuntime.domains.find(item => item.id === 'memories');
            const schema = structuredClone(domain.recordSchema);
            schema.properties.sourceMessageIds = { type: 'array', items: { type: 'string', maxLength: 64 }, maxItems: 8 };
            schema.required.push('sourceMessageIds'); domain.recordSchema = schema; domain.initial = { ...domain.initial, sourceMessageIds: [] };
            domain.commands = domain.commands.map(command => ({ ...command, argsSchema: schema,
                assign: { ...command.assign, sourceMessageIds: { formula: 'args.sourceMessageIds' } } }));
            contract.informationRuntime.sources.find(item => item.id === 'memories').fields.push(['sourceMessageIds']);
        }, queueSource: async (product, h) => {
            const sessionId = product.current().session.sessionId, ids = [];
            for (const [content, actorId] of [[ACTOR_MEMORY, product.actorId], [OTHER_MEMORY, product.otherActorId], [HIDDEN_TRUTH, product.otherActorId]]) {
                const snapshot = await product.core.appendTimeline(h.handle, sessionId, { role: 'assistant', content, actorId });
                ids.push(snapshot.timeline.at(-1).messageId);
            }
            legalMessageId = ids[0];
            for (const [recordId, actor, text, messageId] of [['actor-history', product.actorId, ACTOR_MEMORY, ids[0]],
                ['other-history', product.otherActorId, OTHER_MEMORY, ids[1]]]) {
                const snapshot = await product.core.observe(h.handle, sessionId), domain = snapshot.manifest.runtime.experienceContract.lifecycleRuntime.domains.find(item => item.id === 'memories');
                await product.core.applyLifecycleCommand(h.handle, sessionId, { type: 'lifecycle', invocationId: 'seed-memory-' + recordId,
                    action: { kind: 'app.command', domainId: 'memories', recordId, commandId: 'save', args: { ...domain.initial, actor, text, sourceMessageIds: [messageId] } } },
                { expectedRevisionId: snapshot.revision.revisionId });
            }
            const snapshot = await product.core.observe(h.handle, sessionId), truth = snapshot.manifest.runtime.experienceContract.lifecycleRuntime.domains.find(item => item.id === 'nodes');
            await product.core.applyLifecycleCommand(h.handle, sessionId, { type: 'lifecycle', invocationId: 'seed-ungranted-truth',
                action: { kind: 'app.command', domainId: 'nodes', recordId: 'truth-secret', commandId: 'save', args: { ...truth.initial, text: HIDDEN_TRUTH } } },
            { expectedRevisionId: snapshot.revision.revisionId });
            return product.queue();
        }, configurePlan: async ({ plan, h, narratorNodeId }) => {
            plan.definition.limits.deadlineMs = 300000;
            const manager = new SecretManager(h.dirs), secretId = manager.writeSecret(SECRET_KEYS.ATRIA_RUNTIME,
                'synthetic-appraisal-embedding-secret', 'Appraisal embedding', { activate: false });
            const profile = { retrievalProfileId: createNativeId('retrievalProfile'), revision: createNativeId('revision'), displayName: 'Actor appraisal embedding',
                mode: 'embed', source: 'openai', model: 'scoped-appraisal-embed', endpoint: `http://127.0.0.1:${server.address().port}/v1`, secretRef: { secretId }, options: {} };
            await new NativeRetrievalPersistence({ engine: h.engine }).commit(h.handle, profile);
            const ref = retrievalRef(profile), node = plan.definition.nodes.find(item => item.nodeId === narratorNodeId);
            node.dependencyPinIds.push('memory.embed'); node.capabilities.push('memory.retrieve'); plan.definition.capabilityCeiling.push('memory.retrieve');
            plan.dependencyPins.push({ pinId: 'memory.embed', port: 'context', resourceRef: ref, integrity: hash(profile) });
            await new SettingsRepo({ engine: h.engine }).save(h.handle, { atri_capabilities: { memory_graph: { ...memorySettings, nativeRetrieval: { embed: ref } } } });
        } });
        const cleanup = f.cleanup;
        return Object.assign(f, { calls, legalMessageId, onRetrieval: callback => { onRetrieval = callback; }, async cleanup() {
            await cleanup(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
        } });
    } catch (error) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); throw error; }
}
