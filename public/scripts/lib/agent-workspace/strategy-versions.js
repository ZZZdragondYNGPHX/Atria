import { normalizeWorkspacePreset, validatePresetLibrary } from './presets.js';
import { contentSha256 as sha256 } from '../../../shared/content-sha256.js';

const clone = value => structuredClone(value);
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
    : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
        : '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
const same = (a, b) => canonical(a) === canonical(b);
const fields = (value, allowed) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) throw new Error('Invalid Workspace strategy fields');
};
const conflict = () => { throw new Error('workspace_strategy_conflict'); };
const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const limits = Object.freeze({
    'budgets.maxSteps': { modes: ['loop', 'director'], max: 64 },
    'budgets.maxConcurrency': { modes: ['spec', 'director', 'agenda'], max: 16 },
    'scheduler.maxPlannerRounds': { modes: ['agenda'], max: 32 },
    'scheduler.maxTotalRuns': { modes: ['agenda'], max: 64 },
});
const read = (preset, field) => { const [group, key] = field.split('.'); return preset.planTemplate[group]?.[key]; };
function allowed(preset, field, value = read(preset, field)) {
    const limit = limits[field];
    if (!limit?.modes.includes(preset.mode) || !Number.isSafeInteger(value) || value < 1 || value > limit.max) throw new Error('Strategy field/value outside allowed bounds');
}
function desired(base, diff) {
    fields(diff, ['field', 'before', 'after']);
    allowed(base, diff.field); allowed(base, diff.field, diff.after);
    if (read(base, diff.field) !== diff.before || diff.before === diff.after) throw new Error('Invalid strategy diff');
    const result = clone(base), [group, key] = diff.field.split('.');
    result.planTemplate[group][key] = diff.after;
    return normalizeWorkspacePreset(result);
}
const isLocal = c => ['character', 'conversation'].includes(c.scope) && typeof c.subjectId === 'string' && c.subjectId.length > 0;
const baseBinding = c => c.baseBindings?.entries?.find(b => b.scope === c.scope && b.subjectId === c.subjectId);

export function normalizeWorkspaceStrategyVersions(value) {
    fields(value, ['schemaVersion', 'declarations', 'candidates']);
    if (value.schemaVersion !== 1 || !Array.isArray(value.declarations) || !Array.isArray(value.candidates)
        || value.declarations.length > 64 || value.candidates.length > 16 || new TextEncoder().encode(JSON.stringify(value)).length > 2 * 1024 * 1024) throw new Error('Workspace strategy capacity/schema invalid');
    const result = clone(value), presets = new Set(), ids = new Set();
    for (const d of result.declarations) {
        fields(d, ['declarationId', 'presetId', 'base', 'allowedFields']);
        if (!id(d.declarationId) || presets.has(d.presetId) || d.base.id !== d.presetId || d.presetId.startsWith('builtin-')
            || !same(d.base, normalizeWorkspacePreset(d.base)) || !Array.isArray(d.allowedFields) || d.allowedFields.length > 4
            || new Set(d.allowedFields).size !== d.allowedFields.length) throw new Error('Invalid strategy declaration');
        d.allowedFields.forEach(f => allowed(d.base, f)); presets.add(d.presetId);
    }
    for (const c of result.candidates) {
        fields(c, ['schemaVersion', 'candidateId', 'declarationId', 'presetId', 'base', 'desired', 'diff', 'baseBindings', 'scope', 'subjectId']);
        if (c.schemaVersion !== 1 || !id(c.candidateId) || ids.has(c.candidateId) || !id(c.declarationId) || c.base.id !== c.presetId
            || c.presetId.startsWith('builtin-') || !isLocal(c) || !same(c.base, normalizeWorkspacePreset(c.base))) throw new Error('Invalid strategy candidate');
        if (!same(desired(c.base, c.diff), c.desired)) throw new Error('Strategy changes protected fields');
        const { candidateId, ...identity } = c;
        if (candidateId !== sha256(canonical(identity))) throw new Error('Strategy content identity mismatch');
        const binding = baseBinding(c);
        if (c.baseBindings.schemaVersion !== 1 || binding?.presetId !== c.presetId || binding.promptVersionId || binding.strategyVersionId) throw new Error('Invalid strategy base binding');
        ids.add(candidateId);
    }
    return result;
}

export function resolveWorkspaceStrategyVersion(library, binding) {
    const versions = normalizeWorkspaceStrategyVersions(library.strategyVersions);
    const candidate = versions.candidates.find(c => c.candidateId === binding.strategyVersionId && c.presetId === binding.presetId
        && c.scope === binding.selectionSource);
    if (!candidate || binding.promptVersionId) throw new Error('Workspace exact strategy version missing or combined');
    return clone(candidate.desired);
}

function check(library, candidateId, rollback = false) {
    const current = validatePresetLibrary(library), c = current.strategyVersions?.candidates.find(c => c.candidateId === candidateId);
    if (!c) throw new Error('Workspace strategy candidate missing');
    if (!same(current.presets.find(p => p.id === c.presetId), c.base)) conflict();
    if (!rollback) {
        const d = current.strategyVersions.declarations.find(d => d.declarationId === c.declarationId);
        if (!d || !d.allowedFields.includes(c.diff.field) || !same(d.base, c.base)) conflict();
    }
    const desiredBindings = clone(c.baseBindings);
    baseBinding({ ...c, baseBindings: desiredBindings }).strategyVersionId = c.candidateId;
    const alreadyApplied = same(current.bindings, desiredBindings), alreadyRolledBack = same(current.bindings, c.baseBindings);
    if (!alreadyApplied && !alreadyRolledBack) conflict();
    return { candidate: clone(c), desiredBindings, alreadyApplied, alreadyRolledBack };
}
export function checkWorkspaceStrategyCandidate(library, candidateId) { return check(library, candidateId); }

export function updateWorkspaceStrategyVersions(library, action) {
    const next = validatePresetLibrary(library);
    next.strategyVersions ||= { schemaVersion: 1, declarations: [], candidates: [] };
    const versions = next.strategyVersions;
    if (action.type === 'declare') {
        fields(action, ['type', 'presetId', 'expectedPreset', 'allowedFields']);
        const base = next.presets.find(p => p.id === action.presetId);
        if (!base || action.presetId.startsWith('builtin-')) throw new Error('Declare a user Preset copy');
        if (!same(base, action.expectedPreset)) conflict();
        versions.declarations = versions.declarations.filter(d => d.presetId !== action.presetId);
        versions.declarations.push({ declarationId: crypto.randomUUID(), presetId: action.presetId, base: clone(base), allowedFields: clone(action.allowedFields) });
    } else if (action.type === 'prepare') {
        fields(action, ['type', 'presetId', 'field', 'value', 'scope', 'subjectId', 'expectedBindings']);
        const d = versions.declarations.find(d => d.presetId === action.presetId), base = next.presets.find(p => p.id === action.presetId);
        if (!d || !d.allowedFields.includes(action.field) || !same(base, d.base) || !same(next.bindings, action.expectedBindings)) conflict();
        const diff = { field: action.field, before: read(base, action.field), after: action.value };
        const seed = { schemaVersion: 1, declarationId: d.declarationId, presetId: base.id, base: clone(base), desired: desired(base, diff), diff,
            baseBindings: clone(next.bindings), scope: action.scope, subjectId: action.subjectId };
        const candidateId = sha256(canonical(seed));
        if (!versions.candidates.some(c => c.candidateId === candidateId)) versions.candidates.push({ ...seed, candidateId });
    } else if (['apply', 'rollback'].includes(action.type)) {
        fields(action, ['type', 'candidateId']);
        const result = check(next, action.candidateId, action.type === 'rollback');
        next.bindings = action.type === 'rollback' ? result.candidate.baseBindings : result.desiredBindings;
    } else throw new Error('Unknown Workspace strategy operation');
    return validatePresetLibrary(next);
}
