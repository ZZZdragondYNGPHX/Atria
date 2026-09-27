export const SKILL_INVOCATION_PATHS = Object.freeze(['narrative', 'studio', 'agents']);
export function skillEntryKey(entry) {
    const scope = entry.scope;
    return JSON.stringify([scope.kind, scope.projectId ?? '', scope.packageId ?? '', scope.packageVersionId ?? '', scope.mode ?? '', scope.name ?? '', scope.characterFile ?? '', entry.name]);
}
export function skillInvocationMode(entry, settings, path) {
    const configured = settings?.skills?.[skillEntryKey(entry)]?.paths;
    if (configured) return configured[path] ?? 'off';
    const defaults = entry.metadata?.['atria-paths'];
    if (typeof defaults === 'string' && !defaults.split(',').map(s => s.trim()).includes(path)) return 'off';
    return 'on-demand';
}
export function assertExtensionSettings(value) {
    if (!value || value.schemaVersion !== 1 || !Array.isArray(value.folders) || value.folders.length > 100 || !value.skills || typeof value.skills !== 'object' || Array.isArray(value.skills)
        || Object.keys(value).some(key => !['schemaVersion', 'folders', 'skills'].includes(key)) || Object.keys(value.skills).length > 5000) throw new TypeError('Invalid extension settings');
    const ids = new Set();
    for (const folder of value.folders) {
        if (!folder || typeof folder.id !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(folder.id) || ids.has(folder.id) || typeof folder.name !== 'string' || !folder.name.trim() || folder.name.length > 80
            || Object.keys(folder).some(key => !['id', 'name'].includes(key))) throw new TypeError('Invalid Skill folder');
        ids.add(folder.id);
    }
    for (const [key, rule] of Object.entries(value.skills)) {
        let identity; try { identity = JSON.parse(key); } catch { throw new TypeError('Invalid Skill identity'); }
        if (!Array.isArray(identity) || identity.length !== 8 || identity.some(part => typeof part !== 'string') || key.length > 1500 || !rule || Object.keys(rule).some(k => !['folderId', 'paths'].includes(k))) throw new TypeError('Invalid Skill preference');
        if (rule.folderId != null && !ids.has(rule.folderId)) throw new TypeError('Unknown Skill folder');
        if (rule.paths !== undefined && (!rule.paths || typeof rule.paths !== 'object' || Array.isArray(rule.paths) || Object.entries(rule.paths).some(([path, mode]) => !SKILL_INVOCATION_PATHS.includes(path) || !['off', 'on-demand', 'always'].includes(mode)))) throw new TypeError('Invalid Skill invocation path');
    }
    return structuredClone(value);
}
export function assertScriptTargets(value) {
    if (!value || typeof value.global !== 'boolean' || !Array.isArray(value.presets) || !Array.isArray(value.works)
        || Object.keys(value).some(key => !['global', 'presets', 'works'].includes(key))) throw new TypeError('Invalid script scopes');
    for (const list of [value.presets, value.works]) if (list.length > 128 || new Set(list).size !== list.length || list.some(id => typeof id !== 'string' || !/^[a-z][a-z0-9_-]{0,127}$/.test(id))) throw new TypeError('Invalid script target identity');
    return structuredClone(value);
}
export function scriptMatches(plugin, context) {
    return Boolean(plugin.enabled && (plugin.targets.global || plugin.targets.presets.includes(context.presetId) || plugin.targets.works.includes(context.packageId)));
}
