import { test, expect } from '@jest/globals';
import {
    createWorkspaceFactoryPreset, getWorkspaceLibrary, workspaceHostProfile,
    NATIVE_WORKSPACE_MODES, NATIVE_WORKSPACE_PRESET_REVISION,
} from '../../public/scripts/agents/orchestrator/workspace/host-presets.js';
import { exportWorkspacePreset, importWorkspacePreset, normalizeWorkspacePreset } from '../../public/scripts/lib/agent-workspace/presets.js';

test.each(NATIVE_WORKSPACE_MODES)('%s native prompts survive Plan transport with current authority rules', mode => {
    const preset = createWorkspaceFactoryPreset(mode, `builtin-${mode}`);
    const restored = importWorkspacePreset(exportWorkspacePreset(preset));
    expect(restored.planTemplate.metadata.nativePreset.revision).toBe(NATIVE_WORKSPACE_PRESET_REVISION);
    for (const agent of restored.planTemplate.agents) {
        expect(agent.instructions).toContain('World State');
        expect(agent.instructions).toContain('Runtime Route');
        expect(agent.instructions).toContain('commandResults');
        expect(agent.instructions).not.toMatch(/Read skill|<thought>|角色卡|MVU|LoreState/);
        expect(agent.modelProfile).toEqual({});
    }
});

const hostFor = mode => workspaceHostProfile(importWorkspacePreset(exportWorkspacePreset(createWorkspaceFactoryPreset(mode, `builtin-${mode}`))));

test('Spec retains its review gate and final guidance output contract', () => {
    const host = hostFor('spec');
    expect(host.presets.critic.systemPrompt).toContain('atri_orch_request_rerun');
    expect(host.presets.critic.systemPrompt).toContain('review_feedback');
    expect(host.presets.anti_data_guard.systemPrompt).toContain('保留规则所需数值');
    expect(host.presets.synthesizer.systemPrompt).toContain('非空 text');
    for (const agent of Object.values(host.presets)) {
        const placeholders = [...agent.userPromptTemplate.matchAll(/{{(.*?)}}/g)].map(match => match[1]);
        expect(placeholders).toEqual(['recent_chat', 'last_user', 'distiller', 'previous_outputs']);
    }
});

test('Loop submits guidance through its capsule terminator', () => {
    const host = hostFor('loop');
    expect(host.system_prompt).toContain('finalize({capsule_text:');
    expect(host.system_prompt).toContain('不写成品正文');
});

test('Agenda keeps scheduler and automatic finalizer responsibilities distinct', () => {
    const host = hostFor('agenda');
    expect(host.planner.systemPrompt).toContain('atri_orch_planner_step');
    expect(host.planner.systemPrompt).toContain('不要主动派发 finalizer');
    for (const agent of Object.values(host.agents)) expect(agent.systemPrompt).toContain('atri_orch_submit_result');
});

test('Director writes prose and all configured workers are self-contained', () => {
    const host = hostFor('director');
    expect(host.mainAgent.systemPrompt).toContain('write_message({text, mode})');
    expect(host.mainAgent.systemPrompt).toContain('finalize({})');
    expect(host.mainAgent.systemPrompt).toContain('continue 时只能 append');
    expect(host.mainAgent.tools.message.write_message).toBe(true);
    expect(host.skills.visible).toEqual([]);
    for (const agent of host.subAgents) {
        expect(host.mainAgent.systemPrompt).toContain(agent.id);
        expect(agent.skills.visible).toEqual([]);
        expect(agent.systemPrompt).toContain('最终报告文本且不再调用工具');
    }
});

test('all fixed definitions upgrade while user copies, routes and bindings remain intact', () => {
    const library = getWorkspaceLibrary({});
    const custom = structuredClone(library.presets.find(item => item.mode === 'director'));
    custom.id = 'user-director';
    custom.name = 'My Director';
    custom.planTemplate.agents[0].instructions = 'My unchanged instructions';
    custom.planTemplate.agents[0].modelProfile = { nativeRouteRef: { scope: 'player', runtimeRouteId: 'route_0123456789abcdef0123456789abcdef' } };
    const savedCustom = normalizeWorkspacePreset(custom);
    library.presets.push(savedCustom);
    library.bindings.defaultPresetId = custom.id;
    library.bindings.entries = [{ scope: 'conversation', subjectId: 'session-1', presetId: 'builtin-loop' }];
    for (const preset of library.presets.filter(item => item.id.startsWith('builtin-'))) {
        preset.planTemplate.metadata.nativePreset.revision = 1;
        preset.planTemplate.agents[0].instructions = 'Old prompt';
    }
    const settings = { agentWorkspace: library };
    const upgraded = getWorkspaceLibrary(settings);
    expect(upgraded.presets.find(item => item.id === custom.id)).toEqual(savedCustom);
    expect(upgraded.bindings).toEqual(library.bindings);
    for (const mode of NATIVE_WORKSPACE_MODES) {
        expect(upgraded.presets.find(item => item.id === `builtin-${mode}`).planTemplate.agents[0].instructions).not.toBe('Old prompt');
    }
    expect(getWorkspaceLibrary(settings)).toEqual(upgraded);
});
