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
        const regions = script.regions ?? ['prose'];
        if (!Array.isArray(regions) || !regions.length || regions.some(region => !['prose', 'supplement'].includes(region))) throw new TypeError('Invalid Regex regions');
        result.regions = [...new Set(regions)];
        if (script.blockTypes !== undefined) {
            if (!Array.isArray(script.blockTypes) || script.blockTypes.some(type => typeof type !== 'string' || !/^[a-z][a-z0-9._-]{0,63}$/.test(type))) throw new TypeError('Invalid Regex block types');
            result.blockTypes = [...new Set(script.blockTypes)];
        }
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

// Transform string leaves only; keys, numbers and canonical values stay intact.
export function applyNativeRegexValue(value, scripts, options, onRule) {
    const diagnostics = [];
    const transform = item => {
        if (typeof item === 'string') {
            const result = applyNativeRegex(item, scripts, options, onRule);
            diagnostics.push(...result.diagnostics); return result.text;
        }
        if (Array.isArray(item)) return item.map(transform);
        if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, transform(child)]));
        return item;
    };
    const transformed = transform(value);
    return { value: diagnostics.length ? value : transformed, diagnostics };
}

// Run only inside a terminable worker. Inputs are copies of one declared region.
export function nativeRegexApplies(script, { region = 'prose', scope = 'display', placement = 2, depth = 0, blockType } = {}) {
    return !(script.disabled || !script.placement.includes(placement) || !(script.regions ?? ['prose']).includes(region)
        || script.pluginOnly && !script.promptOnly && !script.markdownOnly
        || region === 'supplement' && script.blockTypes?.length && !script.blockTypes.includes(blockType)
        || scope === 'prompt' && script.markdownOnly && !script.promptOnly
        || scope === 'display' && script.promptOnly && !script.markdownOnly
        || script.minDepth != null && script.minDepth >= 0 && depth < script.minDepth
        || script.maxDepth != null && script.maxDepth >= 0 && depth > script.maxDepth);
}

export function applyNativeRegex(text, scripts, { region = 'prose', scope = 'display', placement = 2, depth = 0, blockType } = {}, onRule = () => {}) {
    const original = text;
    for (const script of scripts) {
        if (!nativeRegexApplies(script, { region, scope, placement, depth, blockType })) continue;
        onRule(script.id);
        try {
            if (script.substituteRegex) throw new TypeError('regex_dynamic_pattern_unsupported');
            const delimited = /^\/([\s\S]*)\/([dgimsuvy]*)$/.exec(script.findRegex);
            const regex = delimited ? new RegExp(delimited[1], delimited[2]) : new RegExp(script.findRegex);
            const replacement = script.replaceString.replace(/\{\{match\}\}|\$0(?!\d)/gi, () => '$&');
            text = script.trimStrings?.length ? text.replace(regex, (...args) => {
                const groups = typeof args.at(-1) === 'object' ? args.pop() : undefined;
                const input = args.pop(), offset = args.pop(), match = args[0];
                const clean = value => script.trimStrings.reduce((result, trim) => trim ? result.split(trim).join('') : result, value ?? '');
                return replacement.replace(/\$(\$|&|`|'|\d{1,2}|<[^>]+>)/g, (token, key) => {
                    if (key === '$') return '$';
                    if (key === '&') return clean(match);
                    if (key === '`') return input.slice(0, offset);
                    if (key === '\'') return input.slice(offset + match.length);
                    if (key[0] === '<') return groups ? clean(groups[key.slice(1, -1)]) : token;
                    const index = Number(key);
                    if (index > 0 && index < args.length) return clean(args[index]);
                    if (key.length === 2 && Number(key[0]) > 0 && Number(key[0]) < args.length) return clean(args[Number(key[0])]) + key[1];
                    return token;
                });
            }) : text.replace(regex, replacement);
            if (text.length > 4 * 1024 * 1024) throw new RangeError('regex_output_capacity');
        } catch (error) {
            return { text: original, diagnostics: [{ ruleId: script.id,
                code: error instanceof SyntaxError ? 'regex_syntax_invalid' : ['regex_dynamic_pattern_unsupported', 'regex_output_capacity'].includes(error.message) ? error.message : 'regex_failed' }] };
        }
    }
    return { text, diagnostics: [] };
}
