/** Regex Presets group account rule identities only; no retired ownership buckets. */
export function normalizeRegexPresets(values, scripts = []) {
    const ids = new Set((Array.isArray(scripts) ? scripts : []).filter(Boolean).map(script => script.id));
    return (Array.isArray(values) ? values : []).filter(value => value && typeof value === 'object').map(({ id, name, isSelected, global }) => ({
        id, name, isSelected,
        global: [...new Set((Array.isArray(global) ? global : []).filter(item => item && ids.has(item.id)).map(item => item.id))].map(id => ({ id })),
    }));
}
