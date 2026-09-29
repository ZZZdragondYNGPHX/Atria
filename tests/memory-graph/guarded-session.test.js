import { jest, test, expect, beforeEach } from '@jest/globals';

let api, store, commits, capture;
globalThis.Atria = { getContext: () => ({ registerCapabilityApi: (_name, value) => { api = value; } }) };
jest.unstable_mockModule('../../public/scripts/agents/memory/main.js', () => ({
    getMemoryWorkspacePorts: () => ({}), getMemoryStore: () => store, ensureMemoryStoreLoaded: async () => store,
    resolveChatKeyForSession: () => 'owned-chat', commitSessionMutation: async () => { commits++; },
    addStoreCommitListener: () => {}, removeStoreCommitListener: () => {}, findAffectedAssistantSeqFromMessageIndex: () => 1,
}));
jest.unstable_mockModule('../../public/scripts/agents/memory/read-api.js', () => ({ getMemoryGraphReadApi: value => ({
    getSchema: () => ({}), listNodes: () => structuredClone(value.nodes), listEdges: () => [],
}) }));
jest.unstable_mockModule('../../public/scripts/agents/memory/write-api.js', () => ({ getMemoryGraphWriteApi: (value, _context, { onCommit }) => ({
    createNode: async node => { value.nodes.push(node); await onCommit(value); return node; },
}) }));
jest.unstable_mockModule('../../public/scripts/agents/memory/source-lifecycle.js', () => ({
    captureMemorySourceSession: async () => { capture?.(); return null; }, assertMemorySourceSession: () => {},
    listMemoryFacts: () => [], writeMemoryFacts: () => {}, writeAuthoritativeMemoryFacts: () => {}, listMemoryGraph: () => [], resolveMemoryEntity: () => {}, writeMemoryBatch: () => {},
}));
jest.unstable_mockModule('../../public/scripts/agents/memory/hybrid-runtime.js', () => ({ recallHybridMemory: () => {} }));
jest.unstable_mockModule('../../public/scripts/agents/memory/character-overrides.js', () => ({
    getSchemaScopeInfo: () => {}, getAdvancedScopeInfo: () => {}, persistCharacterSchemaOverride: () => {}, removeCharacterSchemaOverride: () => {}, persistCharacterAdvancedOverride: () => {}, removeCharacterAdvancedOverride: () => {},
}));
await import('../../public/scripts/agents/memory/api.js');
const expected = () => ({ schema: {}, nodes: structuredClone(store.nodes), edges: [] });
beforeEach(() => { store = { nodes: [{ id: 'old' }] }; commits = 0; capture = null; });

test('guarded session rejects stale review before write-session capture and capture-time drift', async () => {
    const graph = expected(); store.nodes.push({ id: 'other' });
    await expect(api.openGuardedSession({}, graph)).rejects.toThrow(/changed/); expect(commits).toBe(0);
    const next = expected(); capture = () => store.nodes.push({ id: 'concurrent' });
    await expect(api.openGuardedSession({}, next)).rejects.toThrow(/changed/); expect(commits).toBe(0);
});
test('guarded write failure never publishes its isolated draft; queued concurrent writer fails stale', async () => {
    const graph = expected(), a = await api.openGuardedSession({}, graph), b = await api.openGuardedSession({}, graph);
    const results = await Promise.allSettled([a.createNode({ id: 'a' }), b.createNode({ id: 'b' })]);
    expect(results.map(item => item.status)).toEqual(['fulfilled', 'rejected']);
    expect(store.nodes.map(node => node.id)).toEqual(['old', 'a']); expect(commits).toBe(1);
});
