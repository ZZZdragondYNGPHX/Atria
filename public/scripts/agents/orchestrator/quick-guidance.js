import { DEFAULT_SINGLE_AGENT_SYSTEM_PROMPT, DEFAULT_SINGLE_AGENT_USER_PROMPT_TEMPLATE } from './defaults.js';
import { sanitizeSpec, normalizeNodeSpec } from './spec-schema.js';
import { sanitizePresetMap } from './editable-spec.js';

export function createSingleAgentProfile(settings) {
    return {
        source: 'single', key: 'single_agent', mode: 'single',
        spec: sanitizeSpec({ stages: [{ id: 'single', mode: 'serial', nodes: [{ id: 'single_agent', preset: 'single_agent' }] }] }),
        presets: sanitizePresetMap({
            ...settings.presets,
            single_agent: {
                systemPrompt: String(settings.singleAgentSystemPrompt || DEFAULT_SINGLE_AGENT_SYSTEM_PROMPT),
                userPromptTemplate: String(settings.singleAgentUserPromptTemplate || DEFAULT_SINGLE_AGENT_USER_PROMPT_TEMPLATE),
            },
        }),
    };
}

export function createQuickGuidanceProfile(settings, copyLegacy = false) {
    const single = createSingleAgentProfile(copyLegacy ? settings : {});
    const preset = single.presets.single_agent;
    // Freeze the inherited routing names at copy time. Empty still means current
    // runtime configuration, exactly as in Single; card-first resolution remains.
    preset.apiPresetName = String(settings.llmNodeApiPresetName || '');
    preset.promptPresetName = String(settings.llmNodePresetName || '');
    if (!copyLegacy) {
        // New quick templates do not explore. Copying legacy preserves its
        // effective defaultTools (including existing seeded extension tools).
        single.spec.defaultTools = null;
        single.spec.stages[0].nodes[0].tools = {};
    }
    return { spec: single.spec, presets: { single_agent: preset } };
}

export function getQuickGuidancePreset(profile) {
    const stages = profile?.spec?.stages;
    if (stages?.length !== 1 || stages[0].nodes?.length !== 1) return null;
    const node = normalizeNodeSpec(stages[0].nodes[0]);
    // A node-specific prompt takes precedence over its preset: don't offer a
    // simplified editor that appears to save a field the runtime ignores.
    if (node.type === 'review' || node.userPromptTemplate !== undefined) return null;
    return profile.presets?.[node.preset] || null;
}
