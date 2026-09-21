function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function normalizeFailure(result, label) {
    if (result === undefined || result === null || result === true) return [];
    if (result === false) return [label + ' rejected the command'];
    if (typeof result === 'string') {
        const message = result.trim();
        return message ? [message] : [label + ' rejected the command'];
    }
    if (result && typeof result === 'object' && !Array.isArray(result)) {
        if (result.ok === true) return [];
        if (Array.isArray(result.errors)) {
            return result.errors
                .filter(error => typeof error === 'string' && error.trim())
                .map(error => error.trim());
        }
        if (typeof result.error === 'string' && result.error.trim()) {
            return [result.error.trim()];
        }
        if (result.ok === false) return [label + ' rejected the command'];
    }
    throw new Error(label + ' returned an unsupported validation result');
}

export async function runCommandValidators(validators, context = {}) {
    const list = Array.isArray(validators) ? validators : [];
    const errors = [];

    for (let index = 0; index < list.length; index += 1) {
        const validator = list[index];
        if (typeof validator !== 'function') {
            throw new Error('Command validator ' + index + ' must be a function');
        }

        const label = validator.validatorId
            ? "Command validator '" + String(validator.validatorId) + "'"
            : 'Command validator ' + index;
        let result;
        try {
            result = await validator(Object.freeze({
                command: context.command,
                args: clone(context.args),
                world: clone(context.world),
            }));
        } catch (error) {
            throw new Error(label + ' failed: ' + (error?.message || String(error)));
        }
        errors.push(...normalizeFailure(result, label));
    }

    return {
        ok: errors.length === 0,
        errors,
    };
}
