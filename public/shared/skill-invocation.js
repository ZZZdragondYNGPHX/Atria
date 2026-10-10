import { SKILL_INVOCATION_PATHS, skillInvocationMode, skillEntryKey } from './extension-contract.js';

// Scope selection precedes routing: disabling an override must not resurrect
// an identically named, less specific Skill.
export function resolveSkillScopes(entries, context = {}, { legacy = false } = {}) {
    if (!Array.isArray(entries)) throw new TypeError('Skill inventory must be an array');
    const layers = [entry => entry.scope.kind === 'global'];
    if (legacy) {
        layers.push(entry => entry.scope.kind === 'preset' && context.presetName && entry.scope.name === context.presetName,
            entry => entry.scope.kind === 'orch-preset' && context.orchPreset && entry.scope.mode === context.orchPreset.mode && entry.scope.name === context.orchPreset.name,
            entry => entry.scope.kind === 'character' && context.characterFile && entry.scope.characterFile === context.characterFile);
    } else {
        layers.push(entry => entry.scope.kind === 'project' && context.projectId && entry.scope.projectId === context.projectId,
            entry => entry.scope.kind === 'package' && context.packageId && context.packageVersionId
                && entry.scope.packageId === context.packageId && entry.scope.packageVersionId === context.packageVersionId);
    }
    const merged = new Map();
    for (const matches of layers) for (const entry of entries) {
        if (entry?.scope && typeof entry.name === 'string' && matches(entry)) merged.set(entry.name, entry);
    }
    const declared = context.skillIds?.length ? new Set(context.skillIds) : null;
    return [...merged.values()].filter(entry => legacy || !declared || entry.scope.kind === 'global' || declared.has(entry.name))
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveSkillInvocation(entries, { context = {}, settings, path, legacy = false, modeProfile, agentConfig } = {}) {
    if (!SKILL_INVOCATION_PATHS.includes(path)) throw new TypeError('Unknown Skill invocation path');
    const modeVisible = modeProfile?.skills?.visible ?? ['*'];
    const agentVisible = agentConfig?.skills?.visible;
    const visible = new Set(!agentVisible?.length ? modeVisible : agentVisible[0] === '+' ? [...modeVisible, ...agentVisible.slice(1)] : agentVisible);
    const denied = new Set([...(modeProfile?.skills?.deny ?? []), ...(agentConfig?.skills?.deny ?? [])]);
    return resolveSkillScopes(entries, context, { legacy }).flatMap(entry => {
        const invocationMode = skillInvocationMode(entry, settings, path);
        return invocationMode === 'off' || denied.has(entry.name) || (!visible.has('*') && !visible.has(entry.name))
            ? [] : [{ ...entry, invocationMode }];
    });
}

export const SKILL_CONTENT_LIMIT = 32768;
export const SKILL_TOTAL_LIMIT = 131072;

export async function pinSkillEntries(entries, pin, acceptedEntries = new Map()) {
    const pinned = [];
    for (const entry of entries) {
        const key = skillEntryKey(entry);
        if (!acceptedEntries.has(key)) {
            // Publish the promise first so parallel workers share one acceptance.
            acceptedEntries.set(key, (async () => {
                if (!/^[a-f0-9]{64}$/.test(entry.installedHash)) throw new Error('skill_version_missing');
                const accepted = await pin({ scope: entry.scope, name: entry.name, expectedHash: entry.installedHash });
                if (accepted.version !== entry.installedHash) throw new Error('skill_version_conflict');
                return { ...entry, version: accepted.version };
            })());
        }
        pinned.push({ ...await acceptedEntries.get(key), invocationMode: entry.invocationMode });
    }
    return pinned;
}

export function skillReadPin(entry) {
    if (!/^[a-f0-9]{64}$/.test(entry?.version)) throw new Error('skill_version_missing');
    return { version: entry.version };
}

export async function loadAlwaysSkills(entries, readFile) {
    let size = 0;
    const result = [];
    for (const entry of entries) {
        if (entry.invocationMode !== 'always') { result.push(entry); continue; }
        const file = await readFile({ scope: entry.scope, name: entry.name, path: 'SKILL.md', ...(entry.version ? skillReadPin(entry) : {}) });
        size += file.content.length;
        if (file.content.length > SKILL_CONTENT_LIMIT || size > SKILL_TOTAL_LIMIT) throw new Error('skill_content_budget_exceeded');
        result.push({ ...entry, alwaysContent: file.content });
    }
    return result;
}

export function skillInstructions(entries) {
    return entries.filter(entry => entry.invocationMode === 'always').map(entry =>
        JSON.stringify({ skill: entry.name, scope: entry.scope, version: entry.version, instructions: entry.alwaysContent })).join('\n');
}

export function boundedSkillReadOptions(args = {}) {
    const { path = 'SKILL.md', offset = 1, limit = 200 } = args;
    if (typeof path !== 'string' || !/^[A-Za-z0-9._\-/]+$/.test(path) || path.includes('..') || path.startsWith('/')
        || !Number.isSafeInteger(offset) || offset < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new Error('skill_read_invalid');
    return { path, offset, limit };
}

export function boundSkillFile(file) {
    // Reject oversized single lines instead of silently losing the tail of a line.
    if (file.content.length > SKILL_CONTENT_LIMIT) throw new Error('skill_content_budget_exceeded');
    return file;
}
