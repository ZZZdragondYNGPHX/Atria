import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { emptyProvenance, captureEpisodes } from '../../public/scripts/agents/memory/source-provenance.js';
import { applyFactOperations } from '../../public/scripts/agents/memory/atomic-facts.js';
import { applyTemporalOperations } from '../../public/scripts/agents/memory/temporal-graph.js';
import { createSourceLifecycle } from '../../public/scripts/agents/memory/source-lifecycle.js';
import { informationSnapshot, informationActor, informationOtherActor } from '../native/helpers/information-fixture.js';
import { informationContext } from '../../public/shared/native-information-runtime.js';

export const frozenBytes = fs.readFileSync(new URL('./fixtures/h0-samples.json', import.meta.url));
export const frozen = JSON.parse(frozenBytes);
export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
export const countTokens = async text => Buffer.byteLength(text); // explicitly UTF-8 estimate, never Provider usage

/** Raw archive first, then the existing selected Branch/Variant authority. No query or Actor filtering here. */
export function memoryFixture(sample, { key = sample.id, native = false } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atria-hm1-'));
    const raw = structuredClone(sample.sources);
    fs.writeFileSync(path.join(root, 'raw-sources.json'), JSON.stringify(raw));
    const messages = raw.map(s => ({ mes: s.text, name: '阿岚', is_user: false, memory_os_source_id: s.id, swipe_id: s.variant === 'variant-replaced' ? 0 : 1 }));
    let serial = 0;
    const operations = raw.map((s, i) => ({ action: 'create', type: 'explicit', text: s.text,
        ...(s.validTicks ? { validFrom: s.validTicks[0], ...(s.validTicks[1] === null ? {} : { validUntil: s.validTicks[1] + 1 }) } : {}) }));
    const selected = messages.filter((_, i) => raw[i].branch === 'branch-main' && raw[i].status !== 'stale');
    // Native IDs remain valid when the selected timeline changes floor order.
    for (const message of messages) message.atri_native = { messageId: message.memory_os_source_id };
    // captureEpisodes above used ordinary identity: re-capture exact native messages before use.
    let state = emptyProvenance(); state.scopeId = key;
    const exactIds = captureEpisodes(state, messages, messages.map((_, i) => i), key);
    for (let start = 0; start < operations.length; start += 64) {
        state = applyFactOperations(state, operations.slice(start, start + 64).map((op, i) => ({ ...op, evidence: [{ episodeId: exactIds[start + i], excerpt: raw[start + i].text }] })),
            { scopeId: key, episodeIds: exactIds }, messages, () => key + '-f' + ++serial, 1000).state;
    }
    if (sample.id === 'H0-ZH-03' || sample.id === 'H0-ZH-04') {
        const evidence = index => [{ episodeId: exactIds[index], excerpt: raw[index].text }];
        const ticket = { scopeId: key, episodeIds: exactIds };
        const entityOps = sample.id === 'H0-ZH-03'
            ? [{ name: '阿岚', type: 'Character', evidence: evidence(0) }, { name: '甲城', type: 'Location', evidence: evidence(0) }, { name: '乙城', type: 'Location', evidence: evidence(1) }]
            : [{ name: '甲', type: 'Character', evidence: evidence(0) }, { name: '桥边', type: 'Location', evidence: evidence(1) }];
        const entities = applyTemporalOperations(state, entityOps.map(op => ({ action: 'entity', ...op })), ticket, messages, [], () => key + '-g' + ++serial, 1000);
        state = entities.state;
        const ids = entities.results.map(r => r.id), facts = Object.keys(state.facts).map(id => ({ id }));
        const relations = sample.id === 'H0-ZH-03'
            ? [{ action: 'relation', sourceId: ids[0], targetId: ids[1], predicate: 'located_in', factIndex: 0, timeOrder: 10, evidence: evidence(0) },
                { action: 'relation', sourceId: ids[0], targetId: ids[2], predicate: 'located_in', factIndex: 1, timeOrder: 30, evidence: evidence(1) }]
            : [{ action: 'relation', sourceId: ids[0], targetId: ids[1], predicate: 'visited', factIndex: 1, evidence: evidence(1) }];
        state = applyTemporalOperations(state, relations, ticket, messages, facts, () => key + '-g' + ++serial, 1000).state;
    }
    fs.writeFileSync(path.join(root, 'provenance.json'), JSON.stringify(state));
    const snapshot = informationSnapshot();
    snapshot.manifest = structuredClone(snapshot.manifest);
    snapshot.revision = { revisionId: 'revision-' + key, branchId: 'branch-main' };
    snapshot.timeline = selected.map((m, sequence) => ({ messageId: m.memory_os_source_id, activeVariantId: 'variant-current', sequence, role: 'assistant', content: m.mes }));
    const contract = snapshot.manifest.runtime.experienceContract;
    const domain = contract.lifecycleRuntime.domains.find(d => d.id === 'memories');
    domain.recordSchema = structuredClone(domain.recordSchema);
    domain.recordSchema.properties.sourceMessageIds = { type: 'array', items: { type: 'string', maxLength: 256 }, maxItems: 8 };
    domain.initial.sourceMessageIds = [];
    const source = contract.informationRuntime.sources.find(s => s.id === 'memories');
    source.fields = [['text'], ['sourceMessageIds']];
    snapshot.states.atri_lifecycle.domains.memories.records = raw.map(s => ({ id: s.id, scopeId: 'session', status: 'active', pinned: false,
        value: { ...structuredClone(domain.initial), actor: s.audience.includes('actor-alan') ? informationActor : s.audience.includes('actor-other') ? informationOtherActor : 'narrator',
            text: s.text, sourceMessageIds: [s.id] } }));
    const pov = contract.informationRuntime.views.find(v => v.id === 'pov'); pov.sources = ['memories']; pov.memory = true;
    const actor = contract.informationRuntime.views.find(v => v.id === 'actor'); actor.sources = ['memories']; actor.memory = true;
    const context = { key, enabled: true, chat: selected, nativeSnapshot: native ? snapshot : undefined,
        capabilitySettings: { memory_graph: { enabled: true, memoryOsEnabled: true, recallEnabled: true, memoryOsTokenBudget: 2400, nodeTypeSchema: [] } },
        saveChat: async () => {},
        getChatState: async ns => ({ ok: true, state: ns.includes('provenance') ? JSON.parse(fs.readFileSync(path.join(root, 'provenance.json'))) : null }),
        updateChatState: async (ns, reducer) => { if (context.failSave) return { ok: false }; const file = path.join(root, ns.includes('provenance') ? 'provenance.json' : 'meta.json');
            fs.writeFileSync(file, JSON.stringify(reducer(fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : null))); return { ok: true }; } };
    const lifecycle = createSourceLifecycle({ getContext: () => context, resolveScope: ctx => ({ key: ctx.key, target: { key: ctx.key } }), enabled: ctx => ctx.enabled,
        newId: () => key + '-s' + ++serial });
    return { root, raw, state, context, lifecycle, snapshot, information: () => informationContext(snapshot, { kind: 'actor', id: informationActor }),
        async retrievalSnapshot() { return lifecycle.retrievalSnapshot(context, { readOnly: true }); } };
}

/** A loopback-only synthetic ranking service; observes real network IO, no external embedding/model claim. */
export async function localRetrieval() {
    const collections = new Map(), calls = [];
    let failRerank = false;
    const server = http.createServer(async (request, response) => {
        let bytes = ''; for await (const chunk of request) bytes += chunk;
        const args = JSON.parse(bytes); const operation = request.url.slice(1);
        calls.push({ operation, bytes: Buffer.byteLength(bytes), args: structuredClone(args) });
        const collection = collections.get(args.collectionId) || new Map(); collections.set(args.collectionId, collection);
        let result;
        if (operation === 'listHashes') result = [...collection.keys()];
        if (operation === 'deleteByHashes') { args.hashes.forEach(id => collection.delete(id)); result = null; }
        if (operation === 'insert') { args.items.forEach(item => collection.set(item.hash, item)); result = null; }
        if (operation === 'query') { const chars = [...new Set(args.searchText)]; result = { metadata: [...collection.values()]
            .map(item => ({ item, score: chars.filter(c => item.text.includes(c)).length })).filter(v => v.score)
            .sort((a, b) => b.score - a.score).slice(0, args.topK).map(v => v.item.metadata) }; }
        if (operation === 'rerank') { if (failRerank) { response.writeHead(503); response.end('{}'); return; } result = []; }
        response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(result));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const service = Object.fromEntries(['listHashes', 'deleteByHashes', 'insert', 'query', 'rerank'].map(operation => [operation, async ({ signal, ...args }) => {
        const response = await fetch(base + '/' + operation, { method: 'POST', body: JSON.stringify(args), signal });
        if (!response.ok) throw new Error('controlled local service failure'); return response.json();
    }]));
    return { service, calls, collections, failRerank: () => { failRerank = true; }, close: () => new Promise(resolve => server.close(resolve)) };
}
