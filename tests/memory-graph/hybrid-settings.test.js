import { test, expect } from '@jest/globals';
import { normalizeHybridMemorySettings } from '../../public/scripts/agents/memory/settings.js';

test('one-way cleanup removes old execution settings without changing source consent or valid routes', () => {
    const settings = { enabled: true, memoryOsEnabled: true, ragUseRerank: true, recallMethod: 'llm',
        recallApiPresetName: 'old', ragRewriteSystemPrompt: 'old', recallMaxIterations: 6,
        nativeRoutes: { recall: { id: 'old' }, rewrite: {}, extraction: { id: 'extract' } },
        nodeTypeSchema: [{ id: 'event' }], memoryOsTokenBudget: 1200 };
    normalizeHybridMemorySettings(settings);
    expect(settings).toEqual({ enabled: true, sourceWritesEnabled: true, rerankEnabled: true,
        nativeRoutes: { extraction: { id: 'extract' } }, nodeTypeSchema: [{ id: 'event' }], memoryOsTokenBudget: 1200 });
    expect(normalizeHybridMemorySettings(structuredClone(settings))).toEqual(settings);
    expect(normalizeHybridMemorySettings({ recallMethod: 'rag' }).sourceWritesEnabled).toBe(false);
    expect(normalizeHybridMemorySettings({ memoryOsEnabled: true, sourceWritesEnabled: false }).sourceWritesEnabled).toBe(false);
});
