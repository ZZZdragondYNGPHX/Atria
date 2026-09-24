// Shared by authoring and Native resource contracts; matches runtime variable binding.
export function validatePromptParameters(definitions) {
    for (const [name, definition] of Object.entries(definitions || {})) {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || ['constructor', 'prototype', '__proto__'].includes(name)) throw new TypeError('Invalid parameter name: ' + name);
        if (definition.default !== undefined && (definition.type !== 'json' && typeof definition.default !== definition.type || definition.type === 'number' && !Number.isFinite(definition.default))) throw new TypeError('Parameter default does not match its type: ' + name);
    }
    return definitions;
}
