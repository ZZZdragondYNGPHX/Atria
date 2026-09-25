/** Validate portable Regex data without executing it or changing its owner. */
export function normalizeNativeRegexScripts(value = []) {
    if (!Array.isArray(value) || value.length > 5000) throw new TypeError('Invalid Regex scripts');
    const ids = new Set();
    return value.map(script => {
        if (!script || typeof script !== 'object' || Array.isArray(script)
            || typeof script.id !== 'string' || !script.id.trim() || script.id.length > 256 || ids.has(script.id)
            || typeof script.scriptName !== 'string' || typeof script.findRegex !== 'string'
            || typeof script.replaceString !== 'string'
            || !Array.isArray(script.placement) || script.placement.some(p => !Number.isInteger(p) || p < 0 || p > 6)
            || (script.trimStrings !== undefined && (!Array.isArray(script.trimStrings) || script.trimStrings.some(s => typeof s !== 'string')))) {
            throw new TypeError('Invalid or duplicate Regex script');
        }
        ids.add(script.id);
        const result = { id: script.id, scriptName: script.scriptName, findRegex: script.findRegex,
            replaceString: script.replaceString, placement: [...new Set(script.placement)], trimStrings: [...(script.trimStrings || [])] };
        for (const field of ['disabled', 'markdownOnly', 'promptOnly', 'pluginOnly', 'runOnEdit']) {
            if (script[field] !== undefined && typeof script[field] !== 'boolean') throw new TypeError('Invalid Regex flag');
            result[field] = script[field] ?? false;
        }
        if (script.substituteRegex !== undefined && ![0, 1, 2].includes(script.substituteRegex)) throw new TypeError('Invalid Regex substitution');
        result.substituteRegex = script.substituteRegex ?? 0;
        for (const field of ['minDepth', 'maxDepth']) {
            if (script[field] != null && (!Number.isInteger(script[field]) || script[field] < -1)) throw new TypeError('Invalid Regex depth');
            result[field] = script[field] ?? null;
        }
        return result;
    });
}
