/**
 * Deterministic JSON-schema subset for authoritative runtime data.
 *
 * This validator is intentionally independent from DOM and JavaScript eval.
 */

function typeName(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

function matchesType(value, expected) {
    if (expected === 'null') return value === null;
    if (expected === 'array') return Array.isArray(value);
    if (expected === 'object') return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    if (expected === 'integer') return Number.isInteger(value);
    if (expected === 'number') return typeof value === 'number' && Number.isFinite(value);
    return typeof value === expected;
}

function sameJsonValue(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function validateNode(value, schema, path, errors, depth) {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
        errors.push(path + ': schema must be an object');
        return;
    }
    if (depth > 64) {
        errors.push(path + ': schema nesting exceeds 64 levels');
        return;
    }

    if (Array.isArray(schema.enum) && !schema.enum.some(item => sameJsonValue(item, value))) {
        errors.push(path + ': value is not in enum');
        return;
    }

    const expected = schema.type;
    if (typeof expected === 'string' && !matchesType(value, expected)) {
        errors.push(path + ': expected ' + expected + ', got ' + typeName(value));
        return;
    }
    if (Array.isArray(expected) && !expected.some(type => matchesType(value, type))) {
        errors.push(path + ': expected one of ' + expected.join(', ') + ', got ' + typeName(value));
        return;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        if (typeof schema.minimum === 'number' && value < schema.minimum) {
            errors.push(path + ': must be >= ' + schema.minimum);
        }
        if (typeof schema.maximum === 'number' && value > schema.maximum) {
            errors.push(path + ': must be <= ' + schema.maximum);
        }
    }

    if (typeof value === 'string') {
        if (Number.isInteger(schema.minLength) && value.length < schema.minLength) {
            errors.push(path + ': shorter than minLength ' + schema.minLength);
        }
        if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) {
            errors.push(path + ': longer than maxLength ' + schema.maxLength);
        }
        if (typeof schema.pattern === 'string') {
            let pattern;
            try {
                pattern = new RegExp(schema.pattern);
            } catch {
                errors.push(path + ': schema pattern is invalid');
                return;
            }
            if (!pattern.test(value)) {
                errors.push(path + ': does not match required pattern');
            }
        }
    }

    if (Array.isArray(value)) {
        if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
            errors.push(path + ': fewer than minItems ' + schema.minItems);
        }
        if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) {
            errors.push(path + ': more than maxItems ' + schema.maxItems);
        }
        if (schema.items && typeof schema.items === 'object') {
            value.forEach((item, index) => validateNode(item, schema.items, path + '[' + index + ']', errors, depth + 1));
        }
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const properties = schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
            ? schema.properties
            : {};
        const required = Array.isArray(schema.required)
            ? schema.required.filter(item => typeof item === 'string')
            : [];

        for (const key of required) {
            if (!Object.hasOwn(value, key)) {
                errors.push(path + ': missing required property \\'' + key + '\\'');
            }
        }

        for (const [key, child] of Object.entries(value)) {
            if (Object.hasOwn(properties, key)) {
                validateNode(child, properties[key], path + '.' + key, errors, depth + 1);
                continue;
            }
            if (schema.additionalProperties === false) {
                errors.push(path + ': unexpected property \\'' + key + '\\'');
                continue;
            }
            if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
                validateNode(child, schema.additionalProperties, path + '.' + key, errors, depth + 1);
            }
        }
    }
}

export function validateSchemaValue(value, schema, options = {}) {
    const errors = [];
    const path = typeof options.path === 'string' && options.path ? options.path : '$';
    validateNode(value, schema, path, errors, 0);
    return { ok: errors.length === 0, errors };
}

export function validateWorldState(state, schema) {
    return validateSchemaValue(state, schema);
}

export function assertValidWorldState(state, schema) {
    const result = validateWorldState(state, schema);
    if (!result.ok) {
        throw new Error('World State validation failed: ' + result.errors.slice(0, 8).join('; '));
    }
}
