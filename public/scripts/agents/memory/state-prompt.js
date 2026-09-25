// SPDX-License-Identifier: AGPL-3.0-or-later
// Known LoreState prompt ID from its current runtime. MVU prompt IDs are
// author-defined; only explicit additional IDs are accounted here.
export function existingStatePrompt(context, settings = {}) {
    const ids = ['lorestate_world_v3', ...(Array.isArray(settings.memoryOsStatePromptIds) ? settings.memoryOsStatePromptIds : [])];
    return [...new Set(ids)].map(id => context.extensionPrompts?.[id])
        .filter(prompt => prompt && Number(prompt.position) !== -1 && typeof prompt.value === 'string')
        .map(prompt => prompt.value).join('\n');
}
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** Only remove exact, scoped field/value matches. Unknown formats remain visible. */
export function stateClaimAlreadyPresent(claim, text) {
    if (!text) return false;
    const path = claim.path;
    if (claim.providerId === 'lorestate' && typeof claim.value === 'string') {
        let section = '';
        if (path.length === 2 && path[0] === 'shared') {
            section = text.split('当前有效公共状态：\n')[1]?.split('在场及本轮取回的完整实体资料')[0] || '';
        } else if (path.length === 4 && path[0] === 'entities' && path[2] === 'fields') {
            section = text.split(`<EntityRecord id="${xml(path[1])}"`)[1]?.split('</EntityRecord>')[0] || '';
        }
        const name = path.at(-1);
        return /^[\p{L}\p{N}_-]+$/u.test(name) && section.includes(`<${name}>${xml(claim.value)}</${name}>`);
    }
    if (claim.providerId === 'mvu') {
        try {
            const data = JSON.parse(text);
            let value = data.stat_data || data;
            for (const key of path) {
                if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return false;
                value = value[key];
            }
            return JSON.stringify(value) === JSON.stringify(claim.value);
        } catch { return false; }
    }
    return false;
}
