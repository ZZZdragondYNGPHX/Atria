import { normalizeWorkspacePreset, validatePresetLibrary } from './presets.js';
import { contentSha256 as sha256 } from '../../../shared/content-sha256.js';

const clone = value => structuredClone(value);
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
    : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
        : '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
const same = (a, b) => canonical(a) === canonical(b);
const fields = (value, allowed) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) throw new Error('Invalid Workspace Prompt fields');
};
const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const text = value => {
    if (typeof value !== 'string' || new TextEncoder().encode(value).length > 65536) throw new Error('Workspace Prompt body exceeds 64 KiB');
    return value;
};
const conflict = () => { throw new Error('workspace_prompt_conflict'); };

// Full immutable definitions live in the original per-owner settings library;
// a local character/conversation binding chooses an exact content identity.
export function normalizeWorkspacePromptVersions(value) {
    fields(value, ['schemaVersion', 'declarations', 'candidates']);
    if (value.schemaVersion !== 1 || !Array.isArray(value.declarations) || !Array.isArray(value.candidates)
        || value.declarations.length > 64 || value.candidates.length > 16 || new TextEncoder().encode(JSON.stringify(value)).length > 2 * 1024 * 1024) throw new Error('Workspace Prompt capacity/schema invalid');
    const result = clone(value);
    const presetIds = new Set();
    for (const d of result.declarations) {
        fields(d, ['declarationId', 'presetId', 'base', 'agentIds']);
        if (!id(d.declarationId) || presetIds.has(d.presetId) || d.base.id !== d.presetId || !same(d.base, normalizeWorkspacePreset(d.base))
            || !Array.isArray(d.agentIds) || d.agentIds.length > 64 || new Set(d.agentIds).size !== d.agentIds.length
            || d.agentIds.some(a => !d.base.planTemplate.agents.some(agent => agent.id === a))) throw new Error('Invalid Workspace Prompt declaration');
        presetIds.add(d.presetId);
    }
    const candidates = new Set();
    for (const c of result.candidates) {
        fields(c, ['schemaVersion', 'candidateId', 'declarationId', 'presetId', 'base', 'desired', 'agentId', 'diff', 'baseBindings', 'scope', 'subjectId']);
        fields(c.diff, ['field', 'before', 'after']);
        if (c.schemaVersion !== 1 || !id(c.candidateId) || candidates.has(c.candidateId) || !id(c.declarationId) || c.base.id !== c.presetId
            || c.presetId.startsWith('builtin-') || !['character', 'conversation'].includes(c.scope) || typeof c.subjectId !== 'string' || !c.subjectId
            || c.diff.field !== 'instructions' || !same(c.base, normalizeWorkspacePreset(c.base))) throw new Error('Invalid Workspace Prompt candidate');
        text(c.diff.before); text(c.diff.after);
        if (!c.diff.after.trim()) throw new Error('Workspace Prompt candidate instructions must be nonempty');
        const expected = clone(c.base), agent = expected.planTemplate.agents.find(a => a.id === c.agentId);
        if (!agent || (agent.instructions || '') !== c.diff.before || c.diff.before === c.diff.after) throw new Error('Invalid Workspace Prompt diff');
        agent.instructions = c.diff.after;
        if (!same(normalizeWorkspacePreset(expected), c.desired)) throw new Error('Workspace Prompt candidate changes protected fields');
        const { candidateId, ...identity } = c;
        if (candidateId !== sha256(canonical(identity))) throw new Error('Workspace Prompt candidate content identity mismatch');
        if (!c.baseBindings?.entries?.some(b => b.scope === c.scope && b.subjectId === c.subjectId && b.presetId === c.presetId && !b.promptVersionId && !b.strategyVersionId)) throw new Error('Invalid Workspace Prompt base binding');
        candidates.add(c.candidateId);
    }
    return result;
}

export function resolveWorkspacePromptVersion(library, binding) {
    if (!binding.promptVersionId) return library.presets.find(p => p.id === binding.presetId);
    const versions = normalizeWorkspacePromptVersions(library.promptVersions);
    const candidate = versions.candidates.find(c => c.candidateId === binding.promptVersionId && c.presetId === binding.presetId);
    if (!candidate) throw new Error('Workspace exact Prompt version missing');
    return clone(candidate.desired);
}

export function checkWorkspacePromptCandidate(library, candidateId, { rollback = false } = {}) {
    const current = validatePresetLibrary(library);
    const candidate = current.promptVersions?.candidates.find(c => c.candidateId === candidateId);
    if (!candidate) throw new Error('Workspace Prompt candidate missing');
    const declaration = current.promptVersions.declarations.find(d => d.declarationId === candidate.declarationId);
    const base = current.presets.find(p => p.id === candidate.presetId);
    if (!same(base, candidate.base) || !rollback && (!declaration || !declaration.agentIds.includes(candidate.agentId) || !same(declaration.base, candidate.base))) conflict();
    const desiredBindings = clone(candidate.baseBindings);
    desiredBindings.entries.find(b => b.scope === candidate.scope && b.subjectId === candidate.subjectId).promptVersionId = candidateId;
    const alreadyApplied = same(current.bindings, desiredBindings);
    if (!alreadyApplied && !same(current.bindings, candidate.baseBindings)) conflict();
    return { candidate: clone(candidate), desiredBindings, alreadyApplied, alreadyRolledBack: same(current.bindings, candidate.baseBindings) };
}

export function updateWorkspacePromptVersions(library, action) {
    const next = validatePresetLibrary(library);
    if (!next.promptVersions) next.promptVersions = { schemaVersion: 1, declarations: [], candidates: [] };
    const versions = next.promptVersions;
    if (action.type === 'declare') {
        fields(action, ['type', 'presetId', 'expectedPreset', 'agentIds']);
        const preset = next.presets.find(p => p.id === action.presetId);
        if (!preset || action.presetId.startsWith('builtin-')) throw new Error('Declare a user Preset copy');
        if (!same(preset, action.expectedPreset)) conflict();
        versions.declarations = versions.declarations.filter(d => d.presetId !== action.presetId);
        versions.declarations.push({ declarationId: crypto.randomUUID(), presetId: action.presetId, base: clone(preset), agentIds: clone(action.agentIds) });
    } else if (action.type === 'prepare') {
        fields(action, ['type', 'presetId', 'agentId', 'body', 'scope', 'subjectId', 'expectedBindings']);
        text(action.body);
        const declaration = versions.declarations.find(d => d.presetId === action.presetId);
        const base = next.presets.find(p => p.id === action.presetId);
        if (!declaration || !declaration.agentIds.includes(action.agentId) || !same(base, declaration.base)) conflict();
        if (!same(next.bindings, action.expectedBindings)) conflict();
        const desired = clone(base), agent = desired.planTemplate.agents.find(a => a.id === action.agentId);
        const candidate = { schemaVersion: 1, candidateId: crypto.randomUUID(), declarationId: declaration.declarationId, presetId: action.presetId,
            base: clone(base), desired: null, agentId: action.agentId, diff: { field: 'instructions', before: agent.instructions || '', after: action.body },
            baseBindings: clone(next.bindings), scope: action.scope, subjectId: action.subjectId };
        agent.instructions = action.body;
        candidate.desired = normalizeWorkspacePreset(desired);
        const { candidateId: _temporaryId, ...identity } = candidate;
        candidate.candidateId = sha256(canonical(identity));
        versions.candidates.push(candidate);
    } else if (['apply', 'rollback'].includes(action.type)) {
        fields(action, ['type', 'candidateId']);
        const checked = checkWorkspacePromptCandidate(next, action.candidateId, { rollback: action.type === 'rollback' });
        next.bindings = action.type === 'rollback' ? checked.candidate.baseBindings : checked.desiredBindings;
    } else throw new Error('Unknown Workspace Prompt operation');
    return validatePresetLibrary(next);
}
