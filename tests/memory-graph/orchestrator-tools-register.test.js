import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import {
    registerMemoryGraphOrchestrationTools,
    unregisterMemoryGraphOrchestrationTools,
    MEMORY_TOOL_NAMES,
} from '../../public/scripts/agents/memory/orchestrator-tools.js';
import { __getExtensionRegistryForTest } from '../../public/scripts/agents/orchestrator/register-custom-tool.js';

describe('memory-graph orchestrator tools', () => {
    test('shared recall reads guarded context and never consumes private scratch', async () => {
        await registerMemoryGraphOrchestrationTools();
        const { __setSessionForTest } = await import('../../public/scripts/agents/memory/orchestrator-tools.js');
        const ctx = { scratch: 'Private hypothesis, not evidence' };
        const assertCurrent = jest.fn();
        const recallMemory = jest.fn(async () => ({ text: 'Shared evidence', selected: ['state:location'], tokenCount: 20, budget: 100, assertCurrent }));
        __setSessionForTest(ctx, { recallMemory });
        const tool = __getExtensionRegistryForTest().get('memory_recall');
        expect((await tool.exec({ query: 'Where?' }, ctx)).context).toBe('Shared evidence');
        expect(recallMemory.mock.calls[0][0]).toBe('Where?');
        expect(JSON.stringify(recallMemory.mock.calls)).not.toContain('Private hypothesis');
        // Port completion and the legacy tool return each guard their async boundary.
        expect(assertCurrent).toHaveBeenCalledTimes(2);
        assertCurrent.mockImplementation(() => { throw new Error('Source changed'); });
        await expect(tool.exec({ query: 'Where?' }, ctx)).rejects.toThrow('Source changed');
        const before = recallMemory.mock.calls.length;
        expect(await tool.simulate({}, ctx)).toMatchObject({ simulated: true, sources: [] });
        expect(recallMemory).toHaveBeenCalledTimes(before);
    });
    beforeEach(async () => {
        __getExtensionRegistryForTest().clear();
        // The register implementation is async (it dynamically imports
        // the orchestrator API). Tests await register/unregister.
        await unregisterMemoryGraphOrchestrationTools();
    });

    test('exports the canonical list of 16 tool names', () => {
        expect(MEMORY_TOOL_NAMES).toHaveLength(16);
        expect(MEMORY_TOOL_NAMES).toEqual(expect.arrayContaining([
            'memory_recall',
            'memory_list_candidates',
            'memory_edge_summary',
            'memory_node_brief',
            'memory_expand_seeds',
            'memory_schema',
            'memory_keyword_search',
            'memory_vector_search',
            'memory_find_by_name',
            'memory_compaction_candidates',
            'memory_node_create',
            'memory_node_edit',
            'memory_node_delete',
            'memory_link_upsert',
            'memory_link_delete',
            'memory_compact_nodes',
        ]));
    });

    test('register populates the orchestrator extension registry', async () => {
        await registerMemoryGraphOrchestrationTools();
        const reg = __getExtensionRegistryForTest();
        for (const name of MEMORY_TOOL_NAMES) {
            expect(reg.has(name)).toBe(true);
        }
    });

    test('each registered entry has correct mode', async () => {
        await registerMemoryGraphOrchestrationTools();
        const reg = __getExtensionRegistryForTest();
        const readTools = [
            'memory_list_candidates', 'memory_edge_summary', 'memory_node_brief',
            'memory_expand_seeds', 'memory_schema', 'memory_keyword_search',
            'memory_vector_search', 'memory_find_by_name', 'memory_compaction_candidates',
        ];
        const writeTools = [
            'memory_node_create', 'memory_node_edit', 'memory_node_delete',
            'memory_link_upsert', 'memory_link_delete', 'memory_compact_nodes',
        ];
        for (const name of readTools) expect(reg.get(name)?.mode).toBe('read');
        for (const name of writeTools) expect(reg.get(name)?.mode).toBe('write');
    });

    test('write tools carry a simulate hook', async () => {
        await registerMemoryGraphOrchestrationTools();
        const reg = __getExtensionRegistryForTest();
        const writeTools = [
            'memory_node_create', 'memory_node_edit', 'memory_node_delete',
            'memory_link_upsert', 'memory_link_delete', 'memory_compact_nodes',
        ];
        for (const name of writeTools) {
            expect(typeof reg.get(name)?.simulate).toBe('function');
        }
    });

    test('unregister removes all 15', async () => {
        await registerMemoryGraphOrchestrationTools();
        await unregisterMemoryGraphOrchestrationTools();
        const reg = __getExtensionRegistryForTest();
        for (const name of MEMORY_TOOL_NAMES) {
            expect(reg.has(name)).toBe(false);
        }
    });

    test('read exec runs without throwing when session is attached', async () => {
        await registerMemoryGraphOrchestrationTools();
        const reg = __getExtensionRegistryForTest();
        const entry = reg.get('memory_list_candidates');
        expect(typeof entry?.exec).toBe('function');
        // Stub the session pre-cache via the WeakMap helper exported for tests.
        const ctx = {};
        const { __setSessionForTest } = await import('../../public/scripts/agents/memory/orchestrator-tools.js');
        __setSessionForTest(ctx, {
            listVisibleCandidates: () => [
                { id: 'n1', type: 'event', level: 'episodic', title: 'hi', seqTo: 1, semanticDepth: 0 },
            ],
        });
        const out = await entry.exec({}, ctx);
        expect(out.candidates[0].id).toBe('n1');
    });
});
