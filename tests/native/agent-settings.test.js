import { test, expect } from '@jest/globals';
import { clearNativePresetNames, normalizeNativeAgentModel } from '../../public/scripts/native/agent-settings.js';
import { createWorkspaceFactoryPreset, restoreNativeWorkspacePresets } from '../../public/scripts/agents/orchestrator/workspace/host-presets.js';
import { emptyPresetLibrary, updatePresetLibrary, exportWorkspacePreset, importWorkspacePreset } from '../../public/scripts/lib/agent-workspace/presets.js';

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
test.each(['spec', 'loop', 'agenda', 'director'])('%s save, restore and import keep Native route authority only', mode => {
    const preset = createWorkspaceFactoryPreset(mode, 'user-' + mode);
    const agent = preset.planTemplate.agents[0];
    agent.modelProfile = { apiPresetName: 'old', promptPresetName: 'old', nativeRouteRef: ref };
    agent.instructions = 'User content containing apiPresetName is unchanged.';
    agent.metadata.hostAdapters.atria.llmPresetName = 'old';
    let library = updatePresetLibrary(emptyPresetLibrary(), { type: 'save', preset });
    library.presets[0].planTemplate.agents[0].modelProfile.apiPresetName = 'restored old field';
    library = restoreNativeWorkspacePresets(library);
    const restored = library.presets.find(item => item.id === preset.id);
    const imported = importWorkspacePreset(exportWorkspacePreset(restored));
    const result = imported.planTemplate.agents[0];
    expect(result.modelProfile).toEqual({ nativeRouteRef: ref });
    expect(result.metadata.hostAdapters.atria).not.toHaveProperty('llmPresetName');
    expect(result.instructions).toBe(agent.instructions);
    expect(agent.modelProfile.apiPresetName).toBe('old');
});
