import { test, expect } from '@jest/globals';
import { createWorkspaceFactoryPreset, workspaceHostProfile, getWorkspaceLibrary, resolveWorkspaceProfile } from '../../public/scripts/agents/orchestrator/workspace/host-presets.js';
import { compilePreset } from '../../public/scripts/agents/orchestrator/engine-v2/preset-compiler.js';
import { updatePresetLibrary, emptyPresetLibrary } from '../../public/scripts/lib/agent-workspace/presets.js';
import { executionConfigText } from '../../public/scripts/agents/orchestrator/execution-mode-contract.js';

test.each(['spec', 'loop', 'agenda', 'director'])('%s preserves distinct Native agent routes through the saved plan and host profile', mode => {
    const preset = createWorkspaceFactoryPreset(mode, `routes-${mode}`);
    preset.planTemplate.agents.forEach((agent, index) => { agent.modelProfile.nativeRouteRef = { scope: 'player', runtimeRouteId: 'route_' + (index + 1).toString(16).padStart(32, '0') }; });
    const library = updatePresetLibrary(emptyPresetLibrary(), { type: 'save', preset });
    const profile = workspaceHostProfile(library.presets[0]);
    const actual = mode === 'spec' ? Object.values(profile.presets) : mode === 'agenda' ? [profile.planner, ...Object.values(profile.agents)] : mode === 'director' ? [profile.mainAgent, ...profile.subAgents] : [profile];
    expect(actual.map(agent => agent.nativeRouteRef)).toEqual(preset.planTemplate.agents.map(agent => agent.modelProfile.nativeRouteRef));
    const invalid = structuredClone(preset); invalid.planTemplate.agents[0].modelProfile.nativeRouteRef.scope = 'package';
    expect(() => workspaceHostProfile(invalid)).toThrow('exact player Runtime Route');
});

test.each(['spec', 'loop', 'agenda', 'director'])('native %s factory compiles and adapts without storing a second definition', mode => {
    const preset = createWorkspaceFactoryPreset(mode, `test-${mode}`);
    const profile = workspaceHostProfile(preset);
    expect(profile.mode).toBe(mode);
    expect(compilePreset(profile).source).toMatchObject({ mode, presetId: `test-${mode}` });
    expect(preset.planTemplate.source.profile).toBeUndefined();
    expect(preset.planTemplate.compatibility).toBeUndefined();
    const nativeContent = {
        spec: () => profile.spec.stages.flatMap(stage => stage.nodes).length,
        agenda: () => profile.agents[profile.finalAgentId],
        director: () => profile.mainAgent.systemPrompt,
        loop: () => profile.systemPrompt,
    };
    expect(nativeContent[mode]()).toBeTruthy();
});

test('native effective resolver ignores old libraries and retains one default binding', () => {
    const settings = { presetLibraries: { spec: { bad: {} } }, activePresetIds: { spec: 'bad' } };
    const library = getWorkspaceLibrary(settings);
    expect(library.presets).toHaveLength(4);
    expect(resolveWorkspaceProfile(settings, {}).presetId).toBe('builtin-spec');
    expect(getWorkspaceLibrary(settings)).toBe(library);
});

test('editing a user preset affects the next resolution, never the admitted run snapshot', () => {
    const settings = {};
    let library = getWorkspaceLibrary(settings);
    library = updatePresetLibrary(library, {
        type: 'duplicate',
        id: 'builtin-spec',
        newId: 'user-spec',
        name: 'User Spec',
    });
    library = updatePresetLibrary(library, { type: 'bind', scope: 'default', presetId: 'user-spec' });
    settings.agentWorkspace = library;

    const admitted = resolveWorkspaceProfile(settings, {});
    const fingerprint = executionConfigText(admitted, settings, admitted.presetId);
    const edited = structuredClone(getWorkspaceLibrary(settings).presets.find(preset => preset.id === 'user-spec'));
    edited.planTemplate.agents[0].instructions = 'Changed for next run';
    settings.agentWorkspace = updatePresetLibrary(settings.agentWorkspace, { type: 'save', preset: edited });

    expect(executionConfigText(admitted, settings, admitted.presetId)).toBe(fingerprint);
    expect(executionConfigText(resolveWorkspaceProfile(settings, {}), settings, admitted.presetId)).not.toBe(fingerprint);
});
