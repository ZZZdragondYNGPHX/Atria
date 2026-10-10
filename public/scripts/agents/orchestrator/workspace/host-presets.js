import { workspaceHostProfile } from './host-profile.js';
export { workspaceHostProfile } from './host-profile.js';
import { normalizeNativeAgentPlan } from '../../../native/agent-settings.js';
import { compilePreset } from '../engine-v2/preset-compiler.js';
import { createFactoryPresetForMode, DEFAULT_SINGLE_AGENT_SYSTEM_PROMPT, DEFAULT_SINGLE_AGENT_USER_PROMPT_TEMPLATE } from '../defaults.js';
import { validatePresetLibrary, emptyPresetLibrary, normalizeWorkspacePreset, updatePresetLibrary, resolvePresetBinding } from '../../../lib/agent-workspace/presets.js';
import { AGENDA_BUILTIN_REVISION } from '../agenda-defaults.js';
import { applyNativePresetPrompts } from './native-preset-prompts.js';
import { resolveWorkspacePromptVersion } from '../../../lib/agent-workspace/prompt-versions.js';
import { resolveWorkspaceStrategyVersion } from '../../../lib/agent-workspace/strategy-versions.js';

const WEB_TOOL_NAMES = Object.freeze(['search_search', 'search_visit']);
export const NATIVE_WORKSPACE_MODES = Object.freeze(['spec', 'loop', 'agenda', 'director']);
export const NATIVE_WORKSPACE_PRESET_REVISION = 2;

export function getNativeWorkspacePresetId(mode) {
    if (!NATIVE_WORKSPACE_MODES.includes(mode)) return null;
    return `builtin-${mode}`;
}

export function isNativeWorkspacePresetId(id) {
    return NATIVE_WORKSPACE_MODES.some(mode => getNativeWorkspacePresetId(mode) === id);
}

export function uniqueWorkspacePresetName(library, preferredName, suffix = 'imported') {
    const base = String(preferredName || 'Imported preset').trim() || 'Imported preset';
    const used = new Set((library?.presets || []).map(item => String(item?.name || '').trim().toLocaleLowerCase()));
    if (!used.has(base.toLocaleLowerCase())) return base;
    for (let index = 1; index < 10000; index++) {
        const tail = index === 1 ? suffix : `${suffix} ${index}`;
        const candidate = `${base} (${tail})`;
        if (!used.has(candidate.toLocaleLowerCase())) return candidate;
    }
    throw new Error('Could not allocate a unique preset name');
}

export function prepareImportedWorkspacePreset(library, preset, id = crypto.randomUUID()) {
    const copy = structuredClone(preset);
    copy.id = id;
    copy.name = uniqueWorkspacePresetName(library, copy.name);
    if (copy.planTemplate?.metadata) {
        delete copy.planTemplate.metadata.nativePreset;
        delete copy.planTemplate.metadata.builtinAgendaRevision;
    }
    return copy;
}

function setWebAccessFlags(tools, enabled) {
    const target = tools && typeof tools === 'object' ? tools : {};
    target.custom = target.custom && typeof target.custom === 'object' ? target.custom : {};
    for (const name of WEB_TOOL_NAMES) target.custom[name] = Boolean(enabled);
    return target;
}

function applyFactoryWebAccessPolicy(profile, mode) {
    const source = profile && typeof profile === 'object' ? profile : {};
    const target = mode === 'director' && source.director && typeof source.director === 'object'
        ? source.director
        : source;

    // New Atria factory presets use least-privilege web access. Existing
    // user presets are not rewritten by this helper: it runs only while a
    // factory preset is being constructed.
    if (target.tools || mode === 'loop' || mode === 'director') {
        target.tools = setWebAccessFlags(target.tools, false);
    }
    if (target.defaultTools) target.defaultTools = setWebAccessFlags(target.defaultTools, false);
    if (target.planner?.tools) target.planner.tools = setWebAccessFlags(target.planner.tools, false);
    for (const preset of Object.values(target.presets || {})) {
        preset.tools = setWebAccessFlags(preset.tools, false);
    }
    for (const agent of Object.values(target.agents || {})) {
        agent.tools = setWebAccessFlags(agent.tools, false);
    }
    if (target.mainAgent) target.mainAgent.tools = setWebAccessFlags(target.mainAgent.tools, false);
    for (const agent of target.subAgents || []) {
        agent.tools = setWebAccessFlags(agent.tools, agent?.id === 'canon_scout');
    }
    return source;
}

/** One-time factory construction, not an importer of old user libraries. */
export function createWorkspaceFactoryPreset(mode, id = crypto.randomUUID()) {
    const single = mode === 'single';
    if (single) mode = 'spec';
    const factory = single ? { spec: { stages: [{ id: 'single', mode: 'serial', nodes: [{ id: 'owner', preset: 'owner', type: 'worker' }] }] },
        presets: { owner: { systemPrompt: DEFAULT_SINGLE_AGENT_SYSTEM_PROMPT, userPromptTemplate: DEFAULT_SINGLE_AGENT_USER_PROMPT_TEMPLATE } } } : createFactoryPresetForMode(mode);
    const profile = applyFactoryWebAccessPolicy(
        structuredClone(Array.isArray(factory) ? factory.at(-1) : factory),
        mode,
    );
    applyNativePresetPrompts(profile, mode);
    const plan = structuredClone(compilePreset(profile, { mode, presetId: id }));
    delete plan.compatibility;
    plan.source = { mode, presetId: id };
    // Opaque adapter settings live under an explicit host namespace. Definitions
    // and graph topology are stored once, in Plan agents/nodes, never in this bag.
    const hostOptions = structuredClone(profile.director || profile);
    for (const key of ['spec', 'presets', 'planner', 'agents', 'mainAgent', 'subAgents', 'systemPrompt', 'system_prompt', 'userPromptTemplate', 'apiPresetName', 'promptPresetName',
        'max_rounds', 'maxRounds', 'maxConcurrentSubagents', 'limits', 'finalAgentId']) delete hostOptions[key];
    if (profile.spec) { hostOptions.specOptions = structuredClone(profile.spec); delete hostOptions.specOptions.stages; }
    plan.metadata = { hostAdapters: { atria: hostOptions } };
    const nativeId = getNativeWorkspacePresetId(mode);
    if (nativeId && id === nativeId) {
        plan.metadata.nativePreset = { mode, revision: NATIVE_WORKSPACE_PRESET_REVISION };
    }
    if (mode === 'agenda') plan.metadata.builtinAgendaRevision = AGENDA_BUILTIN_REVISION;
    for (const agent of plan.agents) {
        const settings = structuredClone(agent.metadata.config);
        if (settings.name) agent.name = settings.name;
        if (mode === 'loop') agent.instructions = settings.system_prompt || '';
        for (const key of ['name', 'systemPrompt', 'system_prompt', 'apiPresetName', 'promptPresetName']) delete settings[key];
        agent.metadata = { hostAdapters: { atria: settings } };
        agent.tools = mode === 'agenda' ? [] : ['*'];
    }
    return { schemaVersion: 1, id, name: single ? 'Single Agent' : mode === 'agenda' ? profile.name : `${mode[0].toUpperCase()}${mode.slice(1)}`, mode, planTemplate: normalizeNativeAgentPlan(plan), editorMetadata: {} };
}

export function restoreNativeWorkspacePresets(library) {
    let next = library || emptyPresetLibrary();
    for (const mode of NATIVE_WORKSPACE_MODES) {
        const id = getNativeWorkspacePresetId(mode);
        const factory = normalizeWorkspacePreset(createWorkspaceFactoryPreset(mode, id));
        const current = next.presets?.find(preset => preset.id === id);
        // Native definitions are Atria-owned and fixed. This deliberately
        // repairs stale backup/restore copies, wrong revisions, accidental
        // edits and missing/deleted native presets without touching user IDs.
        if (!current || JSON.stringify(current) !== JSON.stringify(factory)) {
            next = updatePresetLibrary(next, { type: 'save', preset: factory });
        }
    }
    if (!next.bindings.defaultPresetId) {
        next = updatePresetLibrary(next, { type: 'bind', scope: 'default', presetId: 'builtin-spec' });
    }
    const normalized = validatePresetLibrary(next);
    return JSON.stringify(normalized) === JSON.stringify(next) ? next : normalized;
}

export function getWorkspaceLibrary(settings) {
    settings.agentWorkspace = restoreNativeWorkspacePresets(settings.agentWorkspace || emptyPresetLibrary());
    return settings.agentWorkspace;
}

export function resolveWorkspaceProfile(settings, scope) {
    const library = getWorkspaceLibrary(settings);
    const binding = resolvePresetBinding(library, scope);
    const preset = binding.strategyVersionId ? resolveWorkspaceStrategyVersion(library, binding) : resolveWorkspacePromptVersion(library, binding);
    if (!preset) throw new Error('Select a default orchestration preset in Workspace');
    return workspaceHostProfile(preset, binding.selectionSource, binding.promptVersionId, binding.strategyVersionId);
}
