import { describe, test, expect } from '@jest/globals';
import { createSourceLifecycle } from '../../public/scripts/extensions/memory-graph/source-lifecycle.js';
import { createHistoryBuilder, historyFloors, historyHash, rebuildSeed } from '../../public/scripts/extensions/memory-graph/history-build.js';
import { projectTemporalGraph } from '../../public/scripts/extensions/memory-graph/temporal-graph.js';

function fixture(count = 8) {
    let state = null; let serial = 0; let calls = 0;
    const context = { key: 'chat:a', enabled: true, chat: Array.from({ length: count }, (_, i) => ({ mes: `Alice visited Castle ${i}`, is_user: i % 2 === 0 })),
        saveChat: async () => {}, getChatState: async () => ({ ok: true, state: structuredClone(state) }),
        updateChatState: async (_namespace, reducer) => { state = structuredClone(reducer(state)); return { ok: true }; } };
    let live = context;
    const newId = () => `id${++serial}`;
    const lifecycle = createSourceLifecycle({ getContext: () => live, resolveScope: ctx => ({ key: ctx.key, target: { key: ctx.key } }), enabled: ctx => ctx.enabled, newId });
    const extract = async (_context, { ticket }) => {
        calls++;
        const source = ticket.sources[0]; const evidence = [{ episodeId: source.episodeId, excerpt: source.content }];
        return { facts: [{ action: 'create', text: source.content, type: 'explicit', evidence }],
            graph: [{ action: 'entity', ref: 'alice', name: 'Alice', type: 'Character', evidence }, { action: 'entity', ref: 'castle', name: 'Castle', type: 'Location', evidence },
                { action: 'relation', sourceId: 'alice', targetId: 'castle', predicate: 'visited', factIndex: 0, evidence }] };
    };
    const builder = createHistoryBuilder({ lifecycle, extract, newId });
    return { context, lifecycle, builder, extract, newId, get state() { return state; }, get calls() { return calls; },
        switchChat: () => { live = { ...context, key: 'chat:b', chat: [] }; }, options: { floors: context.chat.map((_, i) => i) } };
}

describe('Memory OS historical build', () => {
    test('range selection is explicit, zero-based, bounded and excludes system messages', () => {
        const chat = Array.from({ length: 120 }, (_, i) => ({ mes: 'text', is_system: i === 119 }));
        expect(historyFloors(chat)).toHaveLength(49);
        expect(historyFloors(chat, { range: 'custom', from: 3, to: 5 })).toEqual([3, 4, 5]);
        expect(() => historyFloors(chat, { range: 'custom', from: 5, to: 121 })).toThrow();
        expect(historyFloors(chat, { range: 'all' })).toHaveLength(119);
    });
    test('stages batches, publishes once and deduplicates a repeated build including empty extraction', async () => {
        const f = fixture(); const reports = [];
        const result = await f.builder.run(f.context, { ...f.options, onProgress: report => { reports.push({ ...report, persistedFacts: Object.keys(f.state?.facts || {}).length }); } });
        expect(result.status).toBe('completed'); expect(f.calls).toBe(2);
        expect(Object.keys(f.state.facts)).toHaveLength(2);
        expect(projectTemporalGraph(f.state, f.context.chat).entities).toHaveLength(2);
        expect(reports.at(-1).completed).toBe(2); expect(reports.filter(report => report.status === 'extracting').every(report => report.persistedFacts === 0)).toBe(true);
        const again = await f.builder.run(f.context, f.options);
        expect(again.status).toBe('unchanged'); expect(again.skipped).toBe(8); expect(f.calls).toBe(2);
    });
    test('source revisions are processed again, old evidence becomes stale', async () => {
        const f = fixture(1); await f.builder.run(f.context, f.options);
        f.context.chat[0].mes = 'Alice visited Harbor';
        expect((await f.builder.run(f.context, f.options)).status).toBe('completed');
        expect(f.calls).toBe(2); expect((await f.lifecycle.listFacts(f.context)).map(fact => fact.text)).toEqual(['Alice visited Harbor']);
    });
    test('cancelled late model response cannot publish any derived records', async () => {
        const f = fixture(); const controller = new AbortController();
        const builder = createHistoryBuilder({ lifecycle: f.lifecycle, newId: f.newId, extract: async (...args) => { const result = await f.extract(...args); controller.abort(); return result; } });
        const result = await builder.run(f.context, { ...f.options, signal: controller.signal });
        expect(result.status).toBe('cancelled'); expect(f.state.facts).toBeUndefined(); expect(f.state.historyBuild).toBeUndefined();
    });
    test('an invalid batch reports errors and does not leak successful batches', async () => {
        const f = fixture(); let count = 0;
        const builder = createHistoryBuilder({ lifecycle: f.lifecycle, newId: f.newId, extract: (...args) => ++count === 2 ? { facts: [{ action: 'create', text: 'no evidence', type: 'explicit' }], graph: [] } : f.extract(...args) });
        const result = await builder.run(f.context, f.options);
        expect(result.status).toBe('failed'); expect(result.errors).toHaveLength(1); expect(result.completed).toBe(2);
        expect(f.state.facts).toBeUndefined();
    });
    for (const kind of ['source', 'scope', 'manual']) test(`concurrent ${kind} changes prevent publishing stale staging data`, async () => {
        const f = fixture();
        const builder = createHistoryBuilder({ lifecycle: f.lifecycle, newId: f.newId, extract: async (...args) => {
            const result = await f.extract(...args);
            if (kind === 'source') f.context.chat[0].mes = 'Changed';
            if (kind === 'scope') f.switchChat();
            if (kind === 'manual') await f.lifecycle.correct(f.context, { action: 'entity', name: 'User', type: 'Character', reason: 'During build' }, await f.lifecycle.retrievalSnapshot(f.context));
            return result;
        } });
        expect((await builder.run(f.context, f.options)).status).toBe('cancelled');
        expect(Object.keys(f.state.facts || {})).toHaveLength(0);
        expect(kind !== 'manual' || Object.values(f.state.entities)[0].canonicalName === 'User').toBe(true);
    });
    test('rollback survives reloading, tolerates access counters, and retains source IDs', async () => {
        const f = fixture(); await f.builder.run(f.context, f.options);
        const id = Object.keys(f.state.facts)[0]; const snapshot = await f.lifecycle.retrievalSnapshot(f.context); await snapshot.recordAccess([id]);
        await createHistoryBuilder({ lifecycle: f.lifecycle, extract: f.extract }).rollback(f.context);
        expect(f.state.facts).toEqual({}); expect(f.state.historyBuild.rolledBackAt).toBeTruthy();
        expect(f.context.chat.every(message => message.memory_os_source_id)).toBe(true);
        await expect(f.builder.rollback(f.context)).rejects.toThrow('checkpoint');
    });
    test('rollback refuses to overwrite newer user edits', async () => {
        const f = fixture(); await f.builder.run(f.context, f.options);
        await f.lifecycle.correct(f.context, { action: 'entity', name: 'New user', type: 'Character', reason: 'After build' }, await f.lifecycle.retrievalSnapshot(f.context));
        await expect(f.builder.rollback(f.context)).rejects.toThrow('newer edits');
    });
    test('publication rechecks disk state, not just the local snapshot cache', async () => {
        const f = fixture(1);
        const builder = createHistoryBuilder({ lifecycle: f.lifecycle, newId: f.newId, extract: async (...args) => {
            const result = await f.extract(...args);
            // Simulate another client writing the same chat without touching this lifecycle cache.
            f.state.corrections = { other: { id: 'other', scopeId: f.state.scopeId, actor: 'user' } };
            return result;
        } });
        expect((await builder.run(f.context, f.options)).status).toBe('cancelled');
        expect(f.state.corrections.other.actor).toBe('user'); expect(f.state.facts).toBeUndefined();
    });
    test('publication also rejects another client write inside the persistence updater', async () => {
        const f = fixture(1); const save = f.context.updateChatState;
        const builder = createHistoryBuilder({ lifecycle: f.lifecycle, newId: f.newId, extract: async (...args) => {
            const result = await f.extract(...args);
            f.context.updateChatState = (...args) => { f.state.corrections = { other: { id: 'other', scopeId: f.state.scopeId, actor: 'user' } }; return save(...args); };
            return result;
        } });
        expect((await builder.run(f.context, f.options)).status).toBe('cancelled');
        expect(f.state.corrections.other.actor).toBe('user'); expect(f.state.facts).toBeUndefined();
    });
    test('rebuild does not revive the same explicitly rejected relation', async () => {
        const f = fixture(1); await f.builder.run(f.context, f.options);
        const edge = (await f.lifecycle.listGraph(f.context)).relations[0];
        await f.lifecycle.correct(f.context, { action: 'reject_relation', targetId: edge.id, reason: 'Wrong inference' }, await f.lifecycle.retrievalSnapshot(f.context));
        expect((await f.builder.run(f.context, { ...f.options, mode: 'rebuild' })).status).toBe('completed');
        expect((await f.lifecycle.listGraph(f.context)).relations).toHaveLength(0);
    });
    test('history cannot restore a removed alias or invoke identity correction actions', async () => {
        const f = fixture(1); await f.builder.run(f.context, f.options);
        const entity = (await f.lifecycle.listGraph(f.context)).entities[0];
        for (const action of ['alias', 'remove_alias']) await f.lifecycle.correct(f.context, { action, targetId: entity.id, name: 'Captain', reason: 'User choice' }, await f.lifecycle.retrievalSnapshot(f.context));
        let action = 'alias';
        const builder = createHistoryBuilder({ lifecycle: f.lifecycle, newId: f.newId, extract: async (_ctx, { ticket }) => ({ facts: [], graph: [
            { action, targetId: entity.id, name: 'Captain', evidence: [{ episodeId: ticket.sources[0].episodeId, excerpt: ticket.sources[0].content }] },
        ] }) });
        expect((await builder.run(f.context, { ...f.options, mode: 'rebuild' })).status).toBe('completed');
        expect((await f.lifecycle.listGraph(f.context)).entities[0].aliases).not.toContain('Captain');
        action = 'rename';
        expect((await builder.run(f.context, { ...f.options, mode: 'rebuild' })).status).toBe('failed');
        expect((await f.lifecycle.listGraph(f.context)).entities[0].canonicalName).toBe(entity.canonicalName);
    });
    test('empty valid batches are recorded as processed without inventing facts', async () => {
        const f = fixture(1); let calls = 0;
        const builder = createHistoryBuilder({ lifecycle: f.lifecycle, newId: f.newId, extract: async () => { calls++; return { facts: [], graph: [] }; } });
        expect((await builder.run(f.context, f.options)).status).toBe('completed');
        expect((await builder.run(f.context, f.options)).status).toBe('unchanged');
        expect(calls).toBe(1); expect(f.state.facts).toEqual({});
    });
    test('abort at the persistence reducer prevents publication', async () => {
        const f = fixture(1); const controller = new AbortController(); const save = f.context.updateChatState;
        const builder = createHistoryBuilder({ lifecycle: f.lifecycle, newId: f.newId, extract: async (...args) => {
            const result = await f.extract(...args);
            f.context.updateChatState = (...args) => { controller.abort(); return save(...args); };
            return result;
        } });
        expect((await builder.run(f.context, { ...f.options, signal: controller.signal })).status).toBe('cancelled');
        expect(f.state.historyBuild).toBeUndefined(); expect(f.state.facts).toBeUndefined();
    });
    test('rebuild preserves user-touched records and their dependencies, and can be undone', async () => {
        const f = fixture(); await f.builder.run(f.context, f.options);
        const graph = await f.lifecycle.listGraph(f.context); const alice = graph.entities.find(item => item.canonicalName === 'Alice');
        await f.lifecycle.correct(f.context, { action: 'rename', targetId: alice.id, name: 'Alicia', reason: 'User name' }, await f.lifecycle.retrievalSnapshot(f.context));
        const before = await historyHash(f.state);
        expect(rebuildSeed(f.state).entities[alice.id].names.at(-1).name).toBe('Alicia');
        expect((await f.builder.run(f.context, { ...f.options, mode: 'rebuild' })).status).toBe('completed');
        expect((await f.lifecycle.listGraph(f.context)).entities.find(item => item.id === alice.id).canonicalName).toBe('Alicia');
        await f.builder.rollback(f.context); expect(await historyHash(f.state)).toBe(before);
    });
    test('rebuild seed preserves authoritative Game Event facts', () => {
        const ledger = {
            version: 1,
            scopeId: 'chat:a',
            sources: {},
            episodes: {},
            externalSources: {
                'game-event:event:2': {
                    id: 'game-event:event:2',
                    kind: 'game_event',
                    fingerprint: 'fp',
                    status: 'active',
                },
            },
            dependencies: [],
            facts: {
                authoritative: {
                    id: 'authoritative',
                    scopeId: 'chat:a',
                    text: 'Committed game event DamageDealt: {"amount":3}',
                    type: 'authoritative',
                    supports: [{
                        id: 'support',
                        episodeIds: [],
                        externalSourceIds: ['game-event:event:2'],
                        evidence: [],
                    }],
                    supersededBy: [],
                },
                extracted: {
                    id: 'extracted',
                    scopeId: 'chat:a',
                    text: 'Model-extracted detail',
                    type: 'explicit',
                    supports: [{
                        id: 'support2',
                        episodeIds: ['episode:1'],
                        evidence: [],
                    }],
                    supersededBy: [],
                },
            },
            entities: {},
            relations: {},
            entityPending: {},
        };

        const rebuilt = rebuildSeed(ledger);

        expect(rebuilt.facts.authoritative).toBeDefined();
        expect(rebuilt.facts.extracted).toBeUndefined();
        expect(rebuilt.externalSources['game-event:event:2']).toBeDefined();
    });

    test('only one build per scope runs, and the lock is released after cancellation', async () => {
        const f = fixture(); let release; let entered;
        const started = new Promise(resolve => { entered = resolve; }); const gate = new Promise(resolve => { release = resolve; });
        const controller = new AbortController();
        const builder = createHistoryBuilder({ lifecycle: f.lifecycle, extract: async (...args) => { entered(); await gate; return f.extract(...args); } });
        const first = builder.run(f.context, { ...f.options, signal: controller.signal }); await started;
        await expect(f.builder.run(f.context, f.options)).rejects.toThrow('already running');
        controller.abort(); release(); await first;
        expect((await f.builder.run(f.context, f.options)).status).toBe('completed');
    });
});
