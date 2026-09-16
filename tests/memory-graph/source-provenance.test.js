import { describe, test, expect } from '@jest/globals';
import {
    emptyProvenance, captureEpisodes, reconcileSources, episodesAreCurrent,
    bindDerivedChanges, descendants, projectCurrentSources, normalizeProvenance,
} from '../../public/scripts/extensions/memory-graph/source-provenance.js';
import { normalizeStoreForRuntime, graphPayloadFromStore, buildRuntimeStoreFromGraphPayloadAndMeta } from '../../public/scripts/extensions/memory-graph/persistence.js';
import { cloneRollbackNodeSnapshot } from '../../public/scripts/extensions/memory-graph/graph-ops.js';

function message(id, text) { return { memory_os_source_id: id, mes: text, is_user: false, swipe_id: 0 }; }
function fixture() {
    const state = emptyProvenance();
    const chat = [message('a', 'Alice arrived'), message('b', 'Bob gave her a key')];
    const ids = captureEpisodes(state, chat, [0, 1], 'scope', 100);
    const store = { nodes: { n_1: { id: 'n_1', level: 'semantic', seqTo: 2, fields: { summary: 'A key' } } }, edges: [] };
    bindDerivedChanges(state, { nodes: {} }, store, ids, 'scope', () => 'version1');
    return { state, chat, ids, store };
}

describe('Memory OS source provenance', () => {
    test('duplicate ingestion is idempotent and keeps source identity separate from text', () => {
        const { state, chat, ids } = fixture();
        expect(captureEpisodes(state, chat, [0, 1, 0], 'scope', 200)).toEqual(ids);
        expect(Object.keys(state.episodes)).toHaveLength(2);
        expect(state.episodes[ids[0]].createdAt).toBe(100);
        expect(state.episodes[ids[0]].messageIds).toEqual(['a']);
    });
    test('edit advances revision, preserves old content and invalidates descendants', () => {
        const { state, chat, ids, store } = fixture();
        chat[0].mes = 'Alice stayed home';
        const affected = reconcileSources(state, chat);
        expect(affected.has('node:version1')).toBe(true);
        expect(state.episodes[ids[0]].status).toBe('stale');
        expect(state.episodes[ids[0]].content).toBe('Alice arrived');
        expect(captureEpisodes(state, chat, [0], 'scope')).toEqual(['a:2']);
        expect(projectCurrentSources(store, state, chat, 'scope').has('n_1')).toBe(true);
        expect(store.nodes.n_1.archived).toBe(true);
    });
    test('swiping away and back never reactivates old episodes, even with identical text', () => {
        const { state, chat, ids } = fixture();
        chat[0].swipe_id = 1;
        captureEpisodes(state, chat, [0], 'scope');
        chat[0].swipe_id = 0;
        expect(captureEpisodes(state, chat, [0], 'scope')).toEqual(['a:3']);
        expect(episodesAreCurrent(state, [ids[0]], chat, 'scope')).toBe(false);
    });
    test('delete/regenerate with identical text and a fresh message ID invalidates old evidence', () => {
        const { state, chat, ids } = fixture();
        chat[0] = message('new-a', chat[0].mes);
        reconcileSources(state, chat);
        expect(state.episodes[ids[0]].status).toBe('deleted');
        expect(episodesAreCurrent(state, ids, chat, 'scope')).toBe(false);
        const revision = state.sources.a.revision;
        reconcileSources(state, chat);
        expect(state.sources.a.revision).toBe(revision);
    });
    test('middle deletion/movement and duplicate imported IDs cannot silently rebind evidence', () => {
        const { state, chat, ids } = fixture();
        chat.shift();
        reconcileSources(state, chat);
        expect(state.episodes[ids[1]].status).toBe('stale');
        chat.push({ ...chat[0] });
        expect(() => captureEpisodes(state, chat, [0], 'scope')).toThrow('Ambiguous');
    });
    test('multi-source derived links and summaries become unavailable with any missing evidence', () => {
        const { state, chat, store, ids } = fixture();
        const before = structuredClone(store);
        store.nodes.n_2 = { id: 'n_2', childrenIds: ['n_1'], semanticRollup: true };
        store.edges = [{ from: 'n_1', to: 'n_2', type: 'semantic_contains' }];
        let serial = 0;
        bindDerivedChanges(state, before, store, [], 'scope', () => `rollup${++serial}`);
        expect(store.nodes.n_2.memoryOsEvidence.episodeIds).toEqual(ids);
        chat[1].mes = 'There was no key';
        reconcileSources(state, chat);
        projectCurrentSources(store, state, chat, 'scope');
        expect(store.nodes.n_2.archived).toBe(true);
        expect(store.edges).toEqual([]);
        expect(state.dependencies.some(edge => edge.child.startsWith('relation:'))).toBe(true);
    });
    test('dependency traversal is bounded even with cycles and shared descendants', () => {
        const deps = [{ parent: 'a', child: 'b' }, { parent: 'b', child: 'a' }, { parent: 'b', child: 'c' }];
        expect([...descendants(deps, ['a'])]).toEqual(['a', 'b', 'c']);
    });
    test('source ledger roundtrip, graph normalization and rollback preserve evidence independently', () => {
        const { state, chat, store, ids } = fixture();
        const ledger = normalizeProvenance(JSON.parse(JSON.stringify(state)));
        const normalized = normalizeStoreForRuntime(store);
        const restored = buildRuntimeStoreFromGraphPayloadAndMeta(graphPayloadFromStore(normalized), {});
        expect(restored.nodes.n_1.memoryOsEvidence.episodeIds).toEqual(ids);
        expect(cloneRollbackNodeSnapshot(restored.nodes.n_1).memoryOsEvidence).toEqual(store.nodes.n_1.memoryOsEvidence);
        restored.nodes.n_1.memoryOsEvidence.episodeIds.push('other');
        expect(store.nodes.n_1.memoryOsEvidence.episodeIds).toEqual(ids);
        expect(episodesAreCurrent(ledger, ids, chat, 'scope')).toBe(true);
    });
    test('import without ledger fails closed while legacy nodes retain behavior', () => {
        const { store, chat } = fixture();
        store.nodes.legacy = { id: 'legacy' };
        projectCurrentSources(store, emptyProvenance(), chat, 'another-scope');
        expect(store.nodes.n_1.archived).toBe(true);
        expect(store.nodes.legacy.archived).toBeUndefined();
    });
});
