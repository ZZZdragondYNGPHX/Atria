import { validateGraph } from '../orchestration-engine/graph.js';

const clone = value => structuredClone(value);
const id = value => typeof value === 'string' && value.trim().length > 0;
const scopes = new Set(['character', 'conversation']);

/** Native authoring data. No host settings, execution receipts or legacy profiles. */
export function compileWorkspacePreset(input) {
    if (input?.schemaVersion !== 1 || !id(input.id) || !id(input.name)) throw new Error('Invalid workspace preset');
    if (!['loop', 'spec', 'agenda', 'director'].includes(input.mode)) throw new Error('Invalid workspace mode; Single Agent is a Spec template');
    const template = clone(input.planTemplate);
    if (!template || template.source?.profile || template.source?.runtimeSettings || template.compatibility) {
        throw new Error('Workspace presets require native plans');
    }
    if (template.source?.mode !== input.mode) throw new Error('Preset mode mismatch');
    if (['policyState', 'results', 'taskGraph', 'graphRevision', 'checkpoint', 'memory', 'outputState'].some(key => Object.hasOwn(template, key))) {
        throw new Error('Runtime state cannot be stored in a preset definition');
    }
    return validateGraph({ ...template, planId: `preset:${input.id}`, source: { mode: input.mode, presetId: input.id, presetName: input.name } }).plan;
}

export function normalizeWorkspacePreset(input) {
    const planTemplate = clone(compileWorkspacePreset(input));
    return { schemaVersion: 1, id: input.id, name: input.name.trim(), mode: input.mode,
        planTemplate, editorMetadata: { description: String(input.editorMetadata?.description || '') } };
}

export function emptyPresetLibrary() {
    return { schemaVersion: 1, presets: [], bindings: { schemaVersion: 1, defaultPresetId: null, entries: [] } };
}

/** Validate before persistence; every reference must resolve to exactly one definition. */
export function validatePresetLibrary(input) {
    if (input?.schemaVersion !== 1 || !Array.isArray(input.presets) || input.bindings?.schemaVersion !== 1
        || !Array.isArray(input.bindings.entries)) throw new Error('Invalid preset library');
    const result = { schemaVersion: 1, presets: input.presets.map(normalizeWorkspacePreset), bindings: clone(input.bindings) };
    const ids = new Set(result.presets.map(preset => preset.id));
    if (ids.size !== result.presets.length) throw new Error('Duplicate preset ID');
    if (result.bindings.defaultPresetId !== null && !ids.has(result.bindings.defaultPresetId)) throw new Error('Unknown default preset');
    const keys = new Set();
    for (const binding of result.bindings.entries) {
        if (!scopes.has(binding.scope) || !id(binding.subjectId) || !ids.has(binding.presetId)
            || Object.keys(binding).some(key => !['scope', 'subjectId', 'presetId'].includes(key))) throw new Error('Invalid preset binding');
        const key = JSON.stringify([binding.scope, binding.subjectId]);
        if (keys.has(key)) throw new Error('Duplicate binding');
        keys.add(key);
    }
    return result;
}

export function resolvePresetBinding(library, { character = '', conversation = '' } = {}) {
    for (const [scope, subjectId] of [['conversation', conversation], ['character', character]]) {
        const binding = subjectId && library.bindings.entries.find(entry => entry.scope === scope && entry.subjectId === subjectId);
        if (binding) return { presetId: binding.presetId, selectionSource: scope };
    }
    return { presetId: library.bindings.defaultPresetId, selectionSource: 'default' };
}

/** Pure transactions let the host commit one complete settings update. */
export function updatePresetLibrary(library, action) {
    const next = validatePresetLibrary(library);
    if (action.type === 'save') {
        const preset = normalizeWorkspacePreset(action.preset);
        const index = next.presets.findIndex(item => item.id === preset.id);
        if (index < 0) next.presets.push(preset); else next.presets[index] = preset;
    } else if (action.type === 'duplicate') {
        const original = next.presets.find(item => item.id === action.id);
        if (!original || !id(action.newId) || next.presets.some(item => item.id === action.newId)) throw new Error('Invalid duplicate ID');
        next.presets.push(normalizeWorkspacePreset({ ...original, id: action.newId, name: action.name || `${original.name} copy` }));
    } else if (action.type === 'bind') {
        if (action.scope === 'default') next.bindings.defaultPresetId = action.presetId;
        else {
            if (!scopes.has(action.scope) || !id(action.subjectId)) throw new Error('Invalid binding scope');
            next.bindings.entries = next.bindings.entries.filter(item => item.scope !== action.scope || item.subjectId !== action.subjectId);
            if (action.presetId !== null) next.bindings.entries.push({ scope: action.scope, subjectId: action.subjectId, presetId: action.presetId });
        }
    } else if (action.type === 'delete') {
        const bound = next.bindings.defaultPresetId === action.id || next.bindings.entries.some(item => item.presetId === action.id);
        if (bound && !Object.hasOwn(action, 'replacementId')) throw new Error('Preset is bound; choose a replacement or clear bindings');
        if (action.replacementId === action.id) throw new Error('Cannot replace a preset with itself');
        if (next.bindings.defaultPresetId === action.id) next.bindings.defaultPresetId = action.replacementId ?? null;
        next.bindings.entries = next.bindings.entries.flatMap(item => item.presetId !== action.id ? [item]
            : action.replacementId ? [{ ...item, presetId: action.replacementId }] : []);
        next.presets = next.presets.filter(item => item.id !== action.id);
    } else throw new Error('Unknown preset operation');
    return validatePresetLibrary(next);
}

export function exportWorkspacePreset(preset) { return JSON.stringify(normalizeWorkspacePreset(preset), null, 2); }
export function importWorkspacePreset(text) { return normalizeWorkspacePreset(JSON.parse(text)); }
