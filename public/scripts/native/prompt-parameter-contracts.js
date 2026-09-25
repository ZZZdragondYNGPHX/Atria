import { formatShellText as formatProductText } from '../atria-shell/localization.js';
// Shared by authoring and Native resource contracts; matches runtime variable binding.
export function validatePromptParameters(definitions) {
    for (const [name, definition] of Object.entries(definitions || {})) {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || ['constructor', 'prototype', '__proto__'].includes(name)) throw new TypeError(formatProductText('Invalid parameter name: ${0}', [name]));
        if (definition.default !== undefined && (definition.type !== 'json' && typeof definition.default !== definition.type || definition.type === 'number' && !Number.isFinite(definition.default))) throw new TypeError(formatProductText('Parameter default does not match its type: ${0}', [name]));
    }
    return definitions;
}
