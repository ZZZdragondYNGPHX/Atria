import { test, expect } from '@jest/globals';
import { clearNativePresetNames, normalizeNativeAgentModel } from '../../public/scripts/native/agent-settings.js';



const ref = { scope: 'player', runtimeRouteId: 'route_' + 'a'.repeat(32) };
test('Native settings discard obsolete selectors while preserving task policy and exact routing', () => {
    const settings = { recallApiPresetName: 'old', ragRewriteLlmPresetName: 'old', llmNodePresetName: 'old', nativeRoutes: { recall: ref }, recallTopK: 8, requestSystemPrompt: 'Keep apiPresetName in this quoted example.' };
    expect(clearNativePresetNames(settings)).toBe(settings);
    expect(settings).toEqual({ nativeRoutes: { recall: ref }, recallTopK: 8, requestSystemPrompt: 'Keep apiPresetName in this quoted example.' });
});
test('Native Agent models reject ambiguous authority and malformed route references', () => {
    expect(normalizeNativeAgentModel({ apiPresetName: 'old', nativeRouteRef: ref })).toEqual({ nativeRouteRef: ref });
    expect(normalizeNativeAgentModel({ promptPresetName: 'old' })).toEqual({});
    expect(() => normalizeNativeAgentModel({ model: 'provider-model' })).toThrow('Unsupported');
    expect(() => normalizeNativeAgentModel({ nativeRouteRef: { scope: 'player', runtimeRouteId: 'Writer' } })).toThrow('exact');
});
