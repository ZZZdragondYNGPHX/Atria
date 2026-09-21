import { describe, test, expect, jest } from '@jest/globals';
import { createSourceLifecycle, PROVENANCE_NAMESPACE } from '../../public/scripts/extensions/memory-graph/source-lifecycle.js';
import { sourceContent } from '../../public/scripts/extensions/memory-graph/source-provenance.js';

function fixture() {
    const disk = new Map();
    let serial = 0;
    let externalSources = [];
    let context = {
        key: 'char:a:chat', enabled: true,
        chat: [{ mes: 'Where is Alice?', is_user: true }, { mes: 'At home', is_user: false }],
        saveChat: jest.fn(async () => {}),
        getChatState: jest.fn(async (_ns, { target }) => ({ ok: true, state: structuredClone(disk.get(target.key) || null) })),
        updateChatState: jest.fn(async (_ns, reducer, { target }) => {
            disk.set(target.key, structuredClone(reducer(disk.get(target.key))));
            return { ok: true };
        }),
    };
    const lifecycle = createSourceLifecycle({
        getContext: () => context,
        resolveScope: (ctx, target = null) => ({ key: target?.key || ctx.key, target: target || { key: ctx.key } }),
        enabled: ctx => ctx.enabled,
        newId: () => `id${++serial}`,
        readExternalSources: () => structuredClone(externalSources),
    });
    const store = { nodes: { n_1: { id: 'n_1', seqTo: 1, fields: { summary: 'Alice is at home' } } }, edges: [] };
    return {
        lifecycle,
        disk,
        store,
        get context() { return context; },
        switchChat(next) { context = next; },
        setExternalSources(next) { externalSources = structuredClone(next); },
    };
}

describe('Memory OS production source lifecycle', () => {
    test('manual corrections persist atomically and reject an outdated inspector', async () => {
        const f = fixture();
        const snapshot = await f.lifecycle.retrievalSnapshot(f.context);
        await f.lifecycle.correct(f.context, { action: 'entity', name: 'Alice', type: 'Character', reason: 'User named entity' }, snapshot);
        expect((await f.lifecycle.listGraph(f.context)).entities[0].canonicalName).toBe('Alice');
        expect(Object.keys(f.disk.get(f.context.key).corrections)).toHaveLength(1);
        await expect(f.lifecycle.correct(f.context, { action: 'entity', name: 'Old window', type: 'Concept', reason: 'test' }, snapshot)).rejects.toThrow('changed');
    });
    test('manual correction refuses source mutation at the persistence boundary', async () => {
        const f = fixture(); const snapshot = await f.lifecycle.retrievalSnapshot(f.context);
        const update = f.context.updateChatState;
        f.context.updateChatState = async (...args) => { f.context.chat[1].mes = 'Changed'; return update(...args); };
        await expect(f.lifecycle.correct(f.context, { action: 'entity', name: 'No write', type: 'Concept', reason: 'test' }, snapshot)).rejects.toThrow('changed');
        expect(f.disk.get(f.context.key)?.corrections).toBeUndefined();
    });
    test('manual correction refuses chat switching and feature disable', async () => {
        const f = fixture(); const context = f.context; const snapshot = await f.lifecycle.retrievalSnapshot(context);
        const command = { action: 'entity', name: 'No write', type: 'Concept', reason: 'test' };
        f.switchChat({ ...context, key: 'other', chat: [] });
        await expect(f.lifecycle.correct(context, command, snapshot)).rejects.toThrow('changed');
        f.switchChat(context); context.enabled = false;
        await expect(f.lifecycle.correct(context, command, snapshot)).rejects.toThrow('disabled');
    });
    test('fact writes persist through the same ledger and source edits invalidate rereads', async () => {
        const f = fixture();
        const ticket = await f.lifecycle.capture(f.context, [1]);
        const [result] = await f.lifecycle.writeFacts(f.context, [{ action: 'create', type: 'explicit', text: 'Alice is at home',
            evidence: [{ episodeId: ticket.episodeIds[0], excerpt: 'At home' }] }], ticket);
        expect(f.disk.get(f.context.key).facts[result.id].status).toBe('active');
        expect(await f.lifecycle.listFacts(f.context)).toHaveLength(1);
        f.context.chat[1].mes = 'At work';
        expect(await f.lifecycle.listFacts(f.context)).toHaveLength(0);
        expect(f.disk.get(f.context.key).facts[result.id].status).toBe('stale');
    });
    test('authoritative external facts stay active only while their game Event source is current', async () => {
        const f = fixture();
        const source = {
            id: 'game-event:event:7',
            kind: 'game_event',
            eventId: 'event:7',
            branchId: 'swipes:0.1',
            fingerprint: 'event-7-fingerprint',
            content: '{"eventId":"event:7","type":"DamageDealt","payload":{"amount":3}}',
        };
        f.setExternalSources([source]);

        const [result] = await f.lifecycle.writeAuthoritativeFacts(
            f.context,
            [{
                action: 'create',
                type: 'authoritative',
                text: 'Committed game event DamageDealt: {"amount":3}',
                confidence: 1,
                evidence: [{
                    externalSourceId: source.id,
                    excerpt: source.content,
                }],
            }],
            [source.id],
        );

        const active = await f.lifecycle.listFacts(f.context);
        expect(active).toHaveLength(1);
        expect(active[0]).toMatchObject({
            id: result.id,
            type: 'authoritative',
            status: 'active',
            confidence: 1,
        });
        expect(active[0].supports[0]).toMatchObject({
            episodeIds: [],
            externalSourceIds: [source.id],
        });
        expect(f.disk.get(f.context.key).externalSources[source.id]).toMatchObject({
            status: 'active',
            eventId: 'event:7',
        });

        f.setExternalSources([]);
        expect(await f.lifecycle.listFacts(f.context)).toEqual([]);
        expect(f.disk.get(f.context.key).facts[result.id].status).toBe('stale');
        expect(f.disk.get(f.context.key).externalSources[source.id].status).toBe('stale');
    });

    test('authoritative API rejects non-authoritative fact shapes', async () => {
        const f = fixture();
        const source = {
            id: 'game-event:event:8',
            kind: 'game_event',
            eventId: 'event:8',
            branchId: 'swipes:0.1',
            fingerprint: 'event-8-fingerprint',
            content: '{"eventId":"event:8","type":"Moved","payload":{"location":"gate"}}',
        };
        f.setExternalSources([source]);

        await expect(f.lifecycle.writeAuthoritativeFacts(
            f.context,
            [{
                action: 'create',
                type: 'explicit',
                text: 'This must be rejected',
                evidence: [{
                    externalSourceId: source.id,
                    excerpt: source.content,
                }],
            }],
            [source.id],
        )).rejects.toThrow(/only accepts authoritative create operations/);
    });

    test('fact persistence rejects mutations at the async state updater boundary', async () => {
        const f = fixture();
        const ticket = await f.lifecycle.capture(f.context, [1]);
        const update = f.context.updateChatState;
        f.context.updateChatState = async (...args) => {
            f.context.chat[1].mes = 'Changed during save';
            return update(...args);
        };
        await expect(f.lifecycle.writeFacts(f.context, [{ action: 'create', type: 'explicit', text: 'Alice is home',
            evidence: [{ episodeId: ticket.episodeIds[0], excerpt: 'At home' }] }], ticket)).rejects.toThrow('changed');
        expect(f.disk.get(f.context.key).facts).toBeUndefined();
    });
    test('fact writes are disabled by the opt-in flag and require original ticket', async () => {
        const f = fixture();
        await expect(f.lifecycle.writeFacts(f.context, [], null)).rejects.toThrow('ticket');
        const ticket = await f.lifecycle.capture(f.context, [1]);
        f.context.enabled = false;
        await expect(f.lifecycle.writeFacts(f.context, [], ticket)).rejects.toThrow('disabled');
    });
    test('flag off does no I/O and does not assign message identities', async () => {
        const f = fixture();
        f.context.enabled = false;
        expect(await f.lifecycle.capture(f.context, [0, 1])).toBeNull();
        await f.lifecycle.refresh(f.store, f.context);
        expect(f.context.saveChat).not.toHaveBeenCalled();
        expect(f.context.getChatState).not.toHaveBeenCalled();
        expect(f.context.chat[0].memory_os_source_id).toBeUndefined();
    });
    test('capture persists IDs once and ledger through existing explicit-target state API', async () => {
        const f = fixture();
        const ticket = await f.lifecycle.capture(f.context, [0, 1]);
        const again = await f.lifecycle.capture(f.context, [0, 1]);
        expect(again.episodeIds).toEqual(ticket.episodeIds);
        expect(f.context.saveChat).toHaveBeenCalledTimes(1);
        expect(f.context.getChatState).toHaveBeenCalledWith(PROVENANCE_NAMESPACE, { target: { key: f.context.key } });
        await f.lifecycle.bind(f.context, { nodes: {} }, f.store, ticket);
        expect(f.store.nodes.n_1.memoryOsEvidence.episodeIds).toEqual(ticket.episodeIds);
    });
    test('concurrent capture operations retain both episode sets in one chat ledger', async () => {
        const f = fixture();
        const tickets = await Promise.all([f.lifecycle.capture(f.context, [0]), f.lifecycle.capture(f.context, [1])]);
        const episodeIds = Object.keys(f.disk.get(f.context.key).episodes);
        expect(episodeIds.sort()).toEqual(tickets.flatMap(ticket => ticket.episodeIds).sort());
    });
    test('edit while extraction is pending rejects its ticket and graph write', async () => {
        const f = fixture();
        const ticket = await f.lifecycle.capture(f.context, [0, 1]);
        f.context.chat[0].mes = 'Where is Bob?';
        expect(() => f.lifecycle.assertTicket(ticket, f.context)).toThrow('source or chat changed');
        await expect(f.lifecycle.bind(f.context, { nodes: {} }, f.store, ticket)).rejects.toMatchObject({ name: 'AbortError' });
        expect(f.store.nodes.n_1.memoryOsEvidence).toBeUndefined();
    });
    test('commit guard rechecks captured evidence on every retry, even after read projection archives it', async () => {
        const f = fixture();
        const ticket = await f.lifecycle.capture(f.context, [1]);
        await f.lifecycle.bind(f.context, { nodes: {} }, f.store, ticket);
        const guard = f.lifecycle.commitGuard(f.context, f.store);
        f.context.chat[1].mes = 'At school';
        expect(guard).toThrow('source or chat changed');
        f.lifecycle.project(f.store, f.context);
        expect(guard).toThrow('source or chat changed');
    });
    test('rapid swipe away/back is remembered; duplicate notifications do not create new revisions', async () => {
        const f = fixture();
        const ticket = await f.lifecycle.capture(f.context, [1]);
        await f.lifecycle.bind(f.context, { nodes: {} }, f.store, ticket);
        f.context.chat[1].swipe_id = 1;
        f.lifecycle.observeMutation(f.context, 1);
        f.context.chat[1].swipe_id = 0;
        f.lifecycle.observeMutation(f.context, 1);
        f.lifecycle.observeMutation(f.context, 1);
        expect(() => f.lifecycle.assertTicket(ticket, f.context)).toThrow();
        await f.lifecycle.refresh(f.store, f.context);
        expect(f.store.nodes.n_1.archived).toBe(true);
        const fresh = await f.lifecycle.capture(f.context, [1]);
        expect(fresh.episodeIds[0]).not.toBe(ticket.episodeIds[0]);
        f.lifecycle.observeMutation(f.context, 1);
        expect((await f.lifecycle.capture(f.context, [1])).episodeIds).toEqual(fresh.episodeIds);
    });
    test('mutation during ID save cannot capture a new source for an old extraction snapshot', async () => {
        const f = fixture();
        const expected = f.context.chat.map(sourceContent);
        f.context.saveChat.mockImplementation(async () => { f.context.chat[1].mes = 'At school'; });
        await expect(f.lifecycle.capture(f.context, [1], expected)).rejects.toMatchObject({ name: 'AbortError' });
        expect(f.disk.size).toBe(0);
    });
    test('chat switch during read does not write into either new scope or stale cache', async () => {
        const f = fixture();
        const old = f.context;
        old.getChatState.mockImplementation(async () => {
            f.switchChat({ ...old, key: 'group:b', chat: [] });
            return { ok: true, state: null };
        });
        await expect(f.lifecycle.capture(old, [0])).rejects.toMatchObject({ name: 'AbortError' });
        expect(old.updateChatState).not.toHaveBeenCalled();
    });
    test('deleted source stays in ledger; active node/edge projection is removed', async () => {
        const f = fixture();
        const ticket = await f.lifecycle.capture(f.context, [0, 1]);
        await f.lifecycle.bind(f.context, { nodes: {} }, f.store, ticket);
        f.store.edges = [{ from: 'n_1', to: 'other', type: 'located_in' }];
        f.context.chat.pop();
        const invalid = await f.lifecycle.refresh(f.store, f.context);
        expect(invalid.has('n_1')).toBe(true);
        expect(f.store.nodes.n_1.archived).toBe(true);
        expect(f.store.edges).toEqual([]);
        expect(f.disk.get(f.context.key).episodes[ticket.episodeIds[1]].status).toBe('deleted');
    });
    test('switching the flag off does not resurrect old derived evidence', async () => {
        const f = fixture();
        const ticket = await f.lifecycle.capture(f.context, [1]);
        await f.lifecycle.bind(f.context, { nodes: {} }, f.store, ticket);
        f.context.enabled = false;
        f.context.chat[1].swipe_id = 1;
        await f.lifecycle.refresh(f.store, f.context);
        expect(f.store.nodes.n_1.archived).toBe(true);
    });
    test('failed persistence rejects capture, and next operation can retry', async () => {
        const f = fixture();
        f.context.updateChatState.mockResolvedValueOnce({ ok: false });
        await expect(f.lifecycle.capture(f.context, [0])).rejects.toThrow('write failed');
        const ticket = await f.lifecycle.capture(f.context, [0]);
        expect(ticket.episodeIds).toHaveLength(1);
    });
    test('read failure excludes derived nodes but does not destroy legacy graph nodes', async () => {
        const f = fixture();
        const ticket = await f.lifecycle.capture(f.context, [0]);
        await f.lifecycle.bind(f.context, { nodes: {} }, f.store, ticket);
        f.store.nodes.legacy = { id: 'legacy' };
        f.context.getChatState.mockResolvedValueOnce({ ok: false });
        await expect(f.lifecycle.refresh(f.store, f.context)).rejects.toThrow('read failed');
        expect(f.store.nodes.n_1.archived).toBe(true);
        expect(f.store.nodes.legacy.archived).toBeUndefined();
    });
    test('explicit branch inheritance preserves evidence and validates against branch messages', async () => {
        const f = fixture();
        const ticket = await f.lifecycle.capture(f.context, [0, 1]);
        await f.lifecycle.bind(f.context, { nodes: {} }, f.store, ticket);
        await f.lifecycle.inherit(f.context, { sourceTarget: { key: f.context.key }, targetTarget: { key: 'branch' } });
        f.switchChat({ ...f.context, key: 'branch', chat: structuredClone(f.context.chat) });
        await f.lifecycle.refresh(f.store, f.context);
        expect(f.store.nodes.n_1.archived).toBeUndefined();
        f.context.chat[1].mes = 'At school';
        await f.lifecycle.refresh(f.store, f.context);
        expect(f.store.nodes.n_1.archived).toBe(true);
        expect(f.disk.get('char:a:chat').episodes[ticket.episodeIds[1]].status).toBe('active');
    });
    test('reload restores persisted episodes and does not capture untracked history', async () => {
        const f = fixture();
        const ticket = await f.lifecycle.capture(f.context, [1]);
        await f.lifecycle.bind(f.context, { nodes: {} }, f.store, ticket);
        const restored = createSourceLifecycle({
            getContext: () => f.context, enabled: () => true,
            resolveScope: ctx => ({ key: ctx.key, target: { key: ctx.key } }),
        });
        f.context.chat.unshift({ mes: 'A historical insert' });
        await restored.refresh(f.store, f.context);
        expect(f.store.nodes.n_1.archived).toBe(true);
        expect(Object.keys(f.disk.get(f.context.key).sources)).toHaveLength(1);
        expect(f.context.chat[0].memory_os_source_id).toBeUndefined();
    });
});
