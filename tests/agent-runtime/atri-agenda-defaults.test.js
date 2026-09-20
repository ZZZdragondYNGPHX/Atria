import fs from 'node:fs';
import { test, expect } from '@jest/globals';
import { createWorkspaceFactoryPreset, getWorkspaceLibrary, workspaceHostProfile } from '../../public/scripts/extensions/orchestrator/workspace/host-presets.js';
import { emptyPresetLibrary, updatePresetLibrary, exportWorkspacePreset, importWorkspacePreset } from '../../public/scripts/lib/agent-workspace/presets.js';

const read = path => JSON.parse(fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));

test('Atri factory keeps every prompt/API selection empty and exports a native Agenda', () => {
    const preset = createWorkspaceFactoryPreset('agenda', 'builtin-agenda');
    const host = workspaceHostProfile(importWorkspacePreset(exportWorkspacePreset(preset)));
    expect(preset.name).toBe('Atri-agenda');
    expect(host.finalAgentId).toBe('finalizer');
    expect(host.limits).toEqual({ plannerMaxRounds: 6, maxConcurrentAgents: 3, maxTotalRuns: 10 });
    expect(Object.keys(host.agents).sort()).toEqual(['character_analyst', 'critic', 'distiller', 'finalizer', 'lorebook_reader', 'progression']);
    expect(host.planner.promptPresetName).toBe('');
    expect(host.defaultTools).toBeNull();
    for (const agent of preset.planTemplate.agents) {
        expect(agent.modelProfile.promptPresetName).toBe('');
        expect(agent.name.startsWith('Atri-')).toBe(true);
        expect(agent.tools).toEqual([]);
        expect(agent.modelProfile.apiPresetName).toBe('');
    }
});

test.each(['Atri-plugin-only', 'Atri-agenda-agent'])('%s injects runtime messages once after the reference boundary in both orders', name => {
    const helpAsset = name === 'Atri-plugin-only' ? 'plugin-only' : 'agent-non-director';
    const preset = read(`public/presets/${helpAsset}.json`);
    expect(preset.name).toBe(name);
    expect(preset.function_calling).toBe(true);
    expect(read('default/content/index.json').some(item => item.filename.includes('Atri-'))).toBe(false);
    const prompts = new Map(preset.prompts.map(prompt => [prompt.identifier, prompt]));
    expect(prompts.size).toBe(preset.prompts.length);
    expect(preset.prompt_order.map(group => group.character_id)).toEqual([100000, 100001]);
    for (const group of preset.prompt_order) {
        for (const item of group.order) expect(prompts.get(item.identifier)?.enabled).toBe(item.enabled);
        const enabled = group.order.filter(item => item.enabled).map(item => item.identifier);
        expect(enabled.filter(id => id === 'chatHistory')).toHaveLength(1);
        expect(enabled.at(-1)).toBe('chatHistory');
        expect(enabled.indexOf('atri-atria-reference-close')).toBeLessThan(enabled.indexOf('chatHistory'));
        for (const id of ['agentSystemPrompt', 'agentTask', 'agentResults']) expect(enabled).not.toContain(id);
    }
});

test('replaces the retired builtin once, retaining scope bindings and independent user presets', () => {
    const old = createWorkspaceFactoryPreset('agenda', 'builtin-agenda');
    delete old.planTemplate.metadata.builtinAgendaRevision;
    old.name = 'Agenda';
    old.planTemplate.agents[0].instructions = 'Old built-in planner';
    const custom = { ...structuredClone(old), id: 'my-agenda', name: 'My agenda' };
    let library = updatePresetLibrary(emptyPresetLibrary(), { type: 'save', preset: old });
    library = updatePresetLibrary(library, { type: 'save', preset: custom });
    library = updatePresetLibrary(library, { type: 'bind', scope: 'default', presetId: custom.id });
    library = updatePresetLibrary(library, { type: 'bind', scope: 'character', subjectId: 'char', presetId: old.id });
    library = updatePresetLibrary(library, { type: 'bind', scope: 'conversation', subjectId: 'chat', presetId: old.id });
    const bindings = structuredClone(library.bindings);
    const admitted = workspaceHostProfile(library.presets[0]);
    const settings = { agentWorkspace: library };
    const migrated = getWorkspaceLibrary(settings);
    expect(migrated.presets).toHaveLength(2);
    expect(migrated.presets[0].name).toBe('Atri-agenda');
    expect(migrated.presets[1]).toEqual(library.presets[1]);
    expect(migrated.bindings).toEqual(bindings);
    expect(admitted.planner.systemPrompt).toBe('Old built-in planner');
    const edited = structuredClone(migrated.presets[0]);
    edited.planTemplate.agents[0].instructions = 'My new customization';
    settings.agentWorkspace = updatePresetLibrary(migrated, { type: 'save', preset: edited });
    const reloaded = { agentWorkspace: JSON.parse(JSON.stringify(settings.agentWorkspace)) };
    expect(getWorkspaceLibrary(reloaded).presets[0].planTemplate.agents[0].instructions).toBe('My new customization');
    expect(getWorkspaceLibrary(reloaded)).toBe(reloaded.agentWorkspace);
});

test('does not resurrect a deleted builtin or add presets to an existing empty library', () => {
    const settings = { agentWorkspace: emptyPresetLibrary() };
    expect(getWorkspaceLibrary(settings).presets).toEqual([]);
    expect(getWorkspaceLibrary({}).bindings.defaultPresetId).toBe('builtin-spec');
});
