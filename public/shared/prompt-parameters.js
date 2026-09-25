// Shared by authoring and Native resource contracts; matches runtime variable binding.
export function validatePromptParameters(definitions, formatProductText = (pattern, values) => pattern.replace(/\$\{(\d+)\}/g, (_, index) => values[Number(index)])) {
    for (const [name, definition] of Object.entries(definitions || {})) {
        if (!definition || !['string', 'number', 'boolean', 'json'].includes(definition.type)) throw new TypeError('prompt_parameter_type');
        for (const key of ['label', 'description']) {
            if (definition[key] !== undefined && (typeof definition[key] !== 'string' || !definition[key].trim() || definition[key].length > 512)) throw new TypeError('prompt_parameter_metadata');
        }
        if (definition.options !== undefined) {
            if (definition.default === undefined && !definition.required) throw new TypeError('prompt_parameter_choice_required');
            if (!['string', 'number'].includes(definition.type) || !Array.isArray(definition.options) || !definition.options.length || definition.options.length > 128) throw new TypeError('prompt_parameter_options');
            const values = new Set();
            for (const option of definition.options) {
                if (!option || Object.keys(option).some(key => !['value', 'label'].includes(key)) || typeof option.value !== definition.type
                    || (definition.type === 'number' && !Number.isFinite(option.value)) || typeof option.label !== 'string' || !option.label.trim() || option.label.length > 512
                    || values.has(option.value)) throw new TypeError('prompt_parameter_options');
                values.add(option.value);
            }
            if (definition.default !== undefined && !values.has(definition.default)) throw new TypeError('prompt_parameter_option');
        }
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || ['constructor', 'prototype', '__proto__'].includes(name)) throw new TypeError(formatProductText('Invalid parameter name: ${0}', [name]));
        if (definition.default !== undefined && (definition.type !== 'json' && typeof definition.default !== definition.type || definition.type === 'number' && !Number.isFinite(definition.default))) throw new TypeError(formatProductText('Parameter default does not match its type: ${0}', [name]));
    }
    return definitions;
}

export function validatePromptSelection(definitions, values) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new TypeError('prompt_parameters_invalid');
    for (const [name, value] of Object.entries(values)) {
        if (!Object.hasOwn(definitions, name)) throw new TypeError('prompt_parameter_unknown');
        const definition = definitions[name];
        if (definition.type !== 'json' && typeof value !== definition.type || definition.type === 'number' && !Number.isFinite(value)) throw new TypeError('prompt_parameter_type');
        if (definition.options && !definition.options.some(option => option.value === value)) throw new TypeError('prompt_parameter_option');
    }
    return values;
}
