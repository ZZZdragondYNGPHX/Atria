import { validateSchemaValue } from '../world/schema.js';

const COMMAND_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const EMPTY_ARGUMENT_SCHEMA = Object.freeze({
    type: 'object',
    additionalProperties: false,
    properties: {},
});

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeDefinitions(definitions) {
    if (Array.isArray(definitions)) return definitions;
    if (isPlainObject(definitions)) {
        return Object.entries(definitions).map(([id, definition]) => ({
            ...(isPlainObject(definition) ? definition : {}),
            id,
        }));
    }
    if (definitions == null) return [];
    throw new Error('Command Registry definitions must be an array or object map');
}

function normalizeCommandDefinition(raw) {
    if (!isPlainObject(raw)) {
        throw new Error('Command definition must be an object');
    }

    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!COMMAND_ID_PATTERN.test(id)) {
        throw new Error('Command id must match /^[a-z][a-z0-9._-]{0,63}$/');
    }
    if (typeof raw.execute !== 'function') {
        throw new Error('Command \' ' + id + ' \' requires an execute() function'.replace(/ \'/g, "\'"));
    }

    const description = raw.description === undefined
        ? ''
        : String(raw.description).trim();
    const argsSchema = raw.argsSchema === undefined
        ? EMPTY_ARGUMENT_SCHEMA
        : raw.argsSchema;
    if (!isPlainObject(argsSchema)) {
        throw new Error("Command '" + id + "' argsSchema must be an object");
    }

    return Object.freeze({
        id,
        ...(description ? { description } : {}),
        argsSchema: clone(argsSchema),
        execute: raw.execute,
    });
}

export function createCommandRegistry(definitions = []) {
    const commands = new Map();

    for (const raw of normalizeDefinitions(definitions)) {
        const command = normalizeCommandDefinition(raw);
        if (commands.has(command.id)) {
            throw new Error("Duplicate command id '" + command.id + "'");
        }
        commands.set(command.id, command);
    }

    function get(commandId) {
        const id = String(commandId || '').trim();
        return commands.get(id) || null;
    }

    function list() {
        return [...commands.values()].map(command => ({
            id: command.id,
            ...(command.description ? { description: command.description } : {}),
            argsSchema: clone(command.argsSchema),
        }));
    }

    function validate(commandId, args = {}) {
        const command = get(commandId);
        if (!command) {
            return {
                ok: false,
                errors: ["Unknown command '" + String(commandId || '').trim() + "'"],
                command: null,
                args: null,
            };
        }

        const normalizedArgs = args === undefined ? {} : clone(args);
        const result = validateSchemaValue(normalizedArgs, command.argsSchema, {
            path: '$command.args',
        });
        return {
            ok: result.ok,
            errors: result.errors,
            command,
            args: normalizedArgs,
        };
    }

    return Object.freeze({
        get,
        list,
        validate,
        size: commands.size,
    });
}
