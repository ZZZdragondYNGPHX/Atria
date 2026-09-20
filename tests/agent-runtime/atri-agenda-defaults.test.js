import fs from 'node:fs';
import { test, expect } from '@jest/globals';
import { createWorkspaceFactoryPreset, getWorkspaceLibrary, prepareImportedWorkspacePreset, restoreNativeWorkspacePresets, workspaceHostProfile } from '../../public/scripts/extensions/orchestrator/workspace/host-presets.js';
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

test('repairs a restored revision-1 predecessor Agenda even when the old revision marker is present', () => {
    const old = createWorkspaceFactoryPreset('agenda', 'builtin-agenda');
    old.planTemplate.metadata.builtinAgendaRevision = 1;
    const retiredProduct = 'Lu' + 'ker';
    const retiredTool = 'lu' + 'ker_orch_planner_step';
    old.planTemplate.agents[0].instructions = `你是 ${retiredProduct} Agenda 调度者。只调用 ${retiredTool}。`;

    const custom = { ...structuredClone(old), id: 'my-agenda', name: 'My agenda' };
    let library = updatePresetLibrary(emptyPresetLibrary(), { type: 'save', preset: old });
    library = updatePresetLibrary(library, { type: 'save', preset: custom });
    library = updatePresetLibrary(library, { type: 'bind', scope: 'default', presetId: custom.id });
    library = updatePresetLibrary(library, { type: 'bind', scope: 'character', subjectId: 'char', presetId: old.id });
    const bindings = structuredClone(library.bindings);

    const settings = { agentWorkspace: library };
    const repaired = getWorkspaceLibrary(settings);
    const nativeAgenda = repaired.presets.find(preset => preset.id === 'builtin-agenda');
    const userAgenda = repaired.presets.find(preset => preset.id === 'my-agenda');

    expect(nativeAgenda.planTemplate.metadata.builtinAgendaRevision).toBe(2);
    expect(nativeAgenda.planTemplate.agents[0].instructions).toContain('Atria Agenda');
    expect(nativeAgenda.planTemplate.agents[0].instructions).toContain('atri_orch_planner_step');
    expect(nativeAgenda.planTemplate.agents[0].instructions).not.toContain(retiredTool);
    expect(userAgenda.planTemplate.agents[0].instructions).toContain(retiredTool);
    expect(repaired.bindings).toEqual(bindings);
});

test('native orchestration presets are fixed and missing definitions are restored', () => {
    const settings = { agentWorkspace: emptyPresetLibrary() };
    const library = getWorkspaceLibrary(settings);
    expect(library.presets.map(preset => preset.id).sort()).toEqual([
        'builtin-agenda', 'builtin-director', 'builtin-loop', 'builtin-spec',
    ]);
    expect(library.bindings.defaultPresetId).toBe('builtin-spec');

    const tampered = structuredClone(library);
    const agenda = tampered.presets.find(preset => preset.id === 'builtin-agenda');
    agenda.name = 'Broken restored agenda';
    agenda.planTemplate.agents[0].instructions = 'broken';
    tampered.presets = tampered.presets.filter(preset => preset.id !== 'builtin-loop');

    const repaired = restoreNativeWorkspacePresets(tampered);
    expect(repaired.presets.find(preset => preset.id === 'builtin-agenda').name).toBe('Atri-agenda');
    expect(repaired.presets.find(preset => preset.id === 'builtin-agenda').planTemplate.agents[0].instructions).toContain('atri_orch_planner_step');
    expect(repaired.presets.some(preset => preset.id === 'builtin-loop')).toBe(true);
});

test('same-name imports become user copies and cannot impersonate native presets', () => {
    const library = getWorkspaceLibrary({});
    const exportedNative = exportWorkspacePreset(library.presets.find(preset => preset.id === 'builtin-agenda'));
    const imported = importWorkspacePreset(exportedNative);
    const copy = prepareImportedWorkspacePreset(library, imported, 'imported-id');
    expect(copy.id).toBe('imported-id');
    expect(copy.name).toBe('Atri-agenda (imported)');
    expect(copy.planTemplate.metadata.nativePreset).toBeUndefined();
    expect(copy.planTemplate.metadata.builtinAgendaRevision).toBeUndefined();

    const secondLibrary = updatePresetLibrary(library, { type: 'save', preset: copy });
    const second = prepareImportedWorkspacePreset(secondLibrary, imported, 'imported-id-2');
    expect(second.name).toBe('Atri-agenda (imported 2)');
});
