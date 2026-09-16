import { describe, test, expect, jest } from '@jest/globals';
import { readStateProviders, resolveProviderFields } from '../../public/scripts/extensions/memory-graph/state-providers.js';
import { reconcileProviders, projectProviders } from '../../public/scripts/extensions/memory-graph/provider-provenance.js';
import { createSourceLifecycle } from '../../public/scripts/extensions/memory-graph/source-lifecycle.js';
import { emptyProvenance } from '../../public/scripts/extensions/memory-graph/source-provenance.js';
import { buildMemoryCorpus, rankMemory, retrieveMemory } from '../../public/scripts/extensions/memory-graph/hybrid-retrieval.js';
import { existingStatePrompt, stateClaimAlreadyPresent } from '../../public/scripts/extensions/memory-graph/state-prompt.js';

function fixture() {
    const ctx = { key: 'chat1', chat: [{ mes: 'At the harbor', variables: [{ stat_data: { pilot: { place: 'Harbor', score: 0, empty: null } }, schema: {} }] }],
        getCurrentChatId: () => 'chat1', saveChat: async () => {} };
    const host = { Mvu: { getMvuData: jest.fn(({ message_id }) => structuredClone(ctx.chat[message_id].variables[ctx.chat[message_id].swipe_id || 0])), isDuringExtraAnalysis: () => false } };
    const disk = new Map(); let serial = 0;
    ctx.getChatState = async (_, { target }) => ({ ok: true, state: structuredClone(disk.get(target.key)) });
    ctx.updateChatState = async (_, update, { target }) => { disk.set(target.key, structuredClone(update())); return { ok: true }; };
    const settings = { memoryOsStateMappings: [{ providerId: 'mvu', path: ['pilot', 'place'], key: 'place', label: 'Pilot location', remember: true }] };
    const lifecycle = createSourceLifecycle({ getContext: () => ctx, resolveScope: context => ({ key: context.key, target: { key: context.key } }),
        enabled: () => true, readProviders: context => readStateProviders(context, settings, host), newId: () => `id${++serial}` });
    return { ctx, host, disk, settings, lifecycle };
}
const read = f => readStateProviders(f.ctx, f.settings, f.host);

describe('Optional state providers', () => {
    test('existing state dedup requires exact scoped values and preserves unknown formats', () => {
        const prompt = '当前有效公共状态：\n<place>Harbor</place>\n在场及本轮取回的完整实体资料\n<EntityRecord id="P1" name="Alice">\n<place>Castle</place>\n</EntityRecord>';
        expect(stateClaimAlreadyPresent({ providerId: 'lorestate', path: ['shared', 'place'], value: 'Harbor' }, prompt)).toBe(true);
        expect(stateClaimAlreadyPresent({ providerId: 'lorestate', path: ['entities', 'P1', 'fields', 'place'], value: 'Harbor' }, prompt)).toBe(false);
        expect(stateClaimAlreadyPresent({ providerId: 'lorestate', path: ['entities', 'P1', 'fields', 'place'], value: 'Castle' }, prompt)).toBe(true);
        expect(stateClaimAlreadyPresent({ providerId: 'mvu', path: ['score'], value: 0 }, '{"stat_data":{"score":0}}')).toBe(true);
        expect(stateClaimAlreadyPresent({ providerId: 'mvu', path: ['score'], value: 0 }, 'arbitrary template 0')).toBe(false);
        expect(existingStatePrompt({ extensionPrompts: { lorestate_world_v3: { value: prompt, position: 1 }, unrelated: { value: 'Keep this', position: 1 } } })).toBe(prompt);
    });
    test('existing prompt reservation admits no extra memory when the owner already exceeds the budget', async () => {
        const f = fixture(); const snapshot = await f.lifecycle.retrievalSnapshot(f.ctx);
        const result = await retrieveMemory(snapshot, 'Pilot location', { corePacket: 'rules'.repeat(100), budget: 100, countTokens: async text => text.length });
        expect(result.text).toBe(''); expect(result.coreOverBudget).toBe(true);
    });
    test('plain text has no providers and invokes no state API', () => {
        expect(readStateProviders({ chat: [] }, {}, {}).map(item => item.status)).toEqual(['absent', 'absent']);
    });
    test('MVU reads explicit message scope; preserves zero/null and arbitrary paths', () => {
        const f = fixture(); const providers = read(f);
        expect(f.host.Mvu.getMvuData).toHaveBeenCalledWith({ type: 'message', message_id: 0 });
        expect(providers[0].status).toBe('ready');
        expect(providers[0].fields.map(field => field.value)).toEqual(expect.arrayContaining([0, null, 'Harbor']));
        expect(providers[0].fields.find(field => field.key === 'place').remember).toBe(true);
        f.ctx.chat.push({ mes: 'Where are we?', is_user: true });
        read(f); expect(f.host.Mvu.getMvuData).toHaveBeenLastCalledWith({ type: 'message', message_id: 0 });
    });
    test('MVU extra model busy, uninitialized and error never return current fields', () => {
        const f = fixture(); f.host.Mvu.isDuringExtraAnalysis = () => true;
        expect(read(f)[0].status).toBe('initializing');
        f.host.Mvu.isDuringExtraAnalysis = () => false; f.ctx.chat[0].variables = [{}];
        expect(read(f)[0].status).toBe('initializing');
        f.host.Mvu.getMvuData = () => { throw new Error('private detail'); };
        expect(read(f)[0]).toMatchObject({ status: 'error', fields: [] });
    });
    test('LoreState uses a fresh scoped prepare request; no private runtime slot', () => {
        const ctx = { chat: [{ mes: 'Arrival' }], getCurrentChatId: () => 'chat', memoryOsGenerationType: 'continue',
            eventSource: { getListenersMeta: () => [{}], emitAndWait: jest.fn((event, request) => {
                expect(event).toBe('prompt_template_prepare');
                expect(request).toMatchObject({ chatId: 'chat', runType: 'generate', generateType: 'continue' });
                request.LoreState = { ready: true, state: { shared: { '天气': '雨' } }, get: () => {} };
            }) } };
        expect(readStateProviders(ctx, {}, {})[1]).toMatchObject({ status: 'ready', fields: [{ value: '雨' }] });
        ctx.eventSource.emitAndWait = (_, request) => { request.LoreState = { ready: false, reason: 'busy', state: {}, get: () => {} }; };
        expect(readStateProviders(ctx, {}, {})[1].status).toBe('initializing');
        ctx.eventSource.emitAndWait = () => {};
        expect(readStateProviders(ctx, {}, {})[1].status).toBe('absent');
    });
    test('same-field conflict has no implicit provider winner; explicit owner resolves it', () => {
        const providers = ['mvu', 'lorestate'].map((providerId, index) => ({ providerId, status: 'ready', fields: [{ key: 'location', value: ['A', 'B'][index] }] }));
        expect(resolveProviderFields(providers)[0].status).toBe('conflict');
        expect(resolveProviderFields(providers, { location: 'mvu' })[0]).toMatchObject({ status: 'ready', claims: [{ value: 'A' }] });
        expect(resolveProviderFields(providers, { location: 'missing' })[0].status).toBe('conflict');
    });
    test('unchanged revisions deduplicate; same-floor manual edit invalidates old evidence', async () => {
        const f = fixture(); const first = await f.lifecycle.retrievalSnapshot(f.ctx);
        await f.lifecycle.retrievalSnapshot(f.ctx);
        expect(Object.keys(f.disk.get('chat1').providerSnapshots)).toHaveLength(1);
        f.ctx.chat[0].variables[0] = { stat_data: { pilot: { place: 'Castle' } }, schema: {} };
        expect(first.assertCurrent).toThrow('changed');
        const updated = await f.lifecycle.retrievalSnapshot(f.ctx);
        expect(Object.values(updated.state.providerSnapshots).map(item => item.status)).toEqual(['stale', 'active']);
        const result = await retrieveMemory(updated, 'Pilot location', { countTokens: async text => text.length, budget: 2000 });
        expect(result.text).toContain('Castle'); expect(result.text).not.toContain('Harbor');
        expect(result.text).toContain('providerSources');
    });
    test('new-floor transition retains only opted-in historical fields, and edits invalidate history', async () => {
        const f = fixture(); await f.lifecycle.retrievalSnapshot(f.ctx);
        f.ctx.chat.push({ mes: 'Now at Castle', variables: [{ stat_data: { pilot: { place: 'Castle' } }, schema: {} }] });
        const next = await f.lifecycle.retrievalSnapshot(f.ctx);
        const corpus = buildMemoryCorpus(next);
        expect(rankMemory('Pilot location before', corpus).candidates.some(doc => doc.text.includes('Harbor'))).toBe(true);
        expect(rankMemory('Pilot location now', corpus).candidates.some(doc => doc.text.includes('Harbor'))).toBe(false);
        expect(corpus.documents.filter(doc => doc.type === 'provider-history')).toHaveLength(1);
        f.ctx.chat[0].mes = 'Edited original history';
        const edited = await f.lifecycle.retrievalSnapshot(f.ctx);
        expect(buildMemoryCorpus(edited).documents.some(doc => doc.text.includes('Harbor'))).toBe(false);
    });
    test('source edit cannot relabel an old MVU variable table as newly committed state', async () => {
        const f = fixture(); await f.lifecycle.retrievalSnapshot(f.ctx);
        f.ctx.chat[0].mes = 'Edited but variables not committed';
        const pending = await f.lifecycle.retrievalSnapshot(f.ctx);
        expect(projectProviders(pending.state, f.ctx.chat)[0].status).toBe('initializing');
        // The provider commits an equivalent value by replacing its persisted table.
        f.ctx.chat[0].variables[0] = structuredClone(f.ctx.chat[0].variables[0]);
        const committed = await f.lifecycle.retrievalSnapshot(f.ctx);
        expect(projectProviders(committed.state, f.ctx.chat)[0].status).toBe('ready');
    });
    test('provider removal, chat switch and delayed tokenizer all reject held snapshots', async () => {
        const f = fixture(); const snapshot = await f.lifecycle.retrievalSnapshot(f.ctx);
        const original = f.host.Mvu; delete f.host.Mvu;
        expect(snapshot.assertCurrent).toThrow('changed');
        const absent = await f.lifecycle.retrievalSnapshot(f.ctx);
        expect(buildMemoryCorpus(absent).documents).toEqual([]);
        f.host.Mvu = original;
        const fresh = await f.lifecycle.retrievalSnapshot(f.ctx);
        f.ctx.key = 'other'; expect(fresh.assertCurrent).toThrow('changed'); f.ctx.key = 'chat1';
        await expect(retrieveMemory(fresh, 'Pilot', { countTokens: async () => { delete f.host.Mvu; return 1; } })).rejects.toThrow('changed');
    });
    test('provider mutation during persistence is rejected at the updater boundary', async () => {
        const f = fixture(); const save = f.ctx.updateChatState;
        f.ctx.updateChatState = (...args) => { f.ctx.chat[0].variables[0].stat_data.pilot.place = 'Late'; return save(...args); };
        await expect(f.lifecycle.retrievalSnapshot(f.ctx)).rejects.toThrow('changed');
        expect(f.disk.size).toBe(0);
    });
    test('mapped current fields suppress obsolete temporal relations and their supporting facts', () => {
        const state = emptyProvenance(); state.scopeId = 's'; let n = 0;
        const chat = [{ mes: 'At harbor' }];
        reconcileProviders(state, [{ providerId: 'mvu', status: 'ready', floor: 0, revision: '1',
            fields: [{ key: 'place', path: ['place'], label: 'Alice location', value: 'Harbor', entityId: 'alice', predicate: 'located_in' }] }], chat, () => `${++n}`);
        const corpus = buildMemoryCorpus({ state, chat });
        corpus.entities = [{ id: 'alice', canonicalName: 'Alice', aliases: [] }];
        corpus.documents.push({ id: 'old-relation', kind: 'relation', status: 'active', sourceEntityId: 'alice', predicate: 'located_in',
            text: 'Alice Castle', episodeIds: [], supports: [{ factId: 'old-fact' }] },
        { id: 'fact:old-fact', factId: 'old-fact', kind: 'fact', status: 'active', text: 'Alice Castle', episodeIds: [] });
        const result = rankMemory('Where is Alice?', corpus);
        expect(result.candidates.map(doc => doc.text)).toEqual(['Alice location: "Harbor"']);
    });
});
