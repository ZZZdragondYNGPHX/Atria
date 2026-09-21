import { cloneGameLlmValue } from './clone.js';
const COMMAND_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;

const clone = cloneGameLlmValue;

function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child, seen);
    return value;
}

function normalizeCommands(commands) {
    if (!Array.isArray(commands)) {
        throw new Error('Command Tool Catalog requires a command array');
    }

    const seen = new Set();
    return commands.map((command, index) => {
        if (!command || typeof command !== 'object' || Array.isArray(command)) {
            throw new Error('Command Tool Catalog entry ' + index + ' must be an object');
        }
        const id = String(command.id || '').trim();
        if (!COMMAND_ID_PATTERN.test(id)) {
            throw new Error('Command Tool Catalog contains invalid command id');
        }
        if (seen.has(id)) {
            throw new Error(`Duplicate Command Tool Catalog id '${id}'`);
        }
        seen.add(id);

        const argsSchema = command.argsSchema && typeof command.argsSchema === 'object'
            && !Array.isArray(command.argsSchema)
            ? clone(command.argsSchema)
            : {
                type: 'object',
                additionalProperties: false,
                properties: {},
            };

        return Object.freeze({
            id,
            description: String(command.description || '').trim(),
            argsSchema: deepFreeze(argsSchema),
            exposed: command.llm?.expose === true,
        });
    });
}

function resolveVisibilityRule(visibility, commandId) {
    if (!visibility) return null;
    if (typeof visibility === 'function') return visibility;
    if (visibility instanceof Map) return visibility.get(commandId) ?? null;
    if (typeof visibility === 'object' && !Array.isArray(visibility)) {
        return visibility[commandId] ?? null;
    }
    throw new Error('Command Tool Catalog visibility must be a function, map, or object');
}

async function isVisible(command, context, visibility) {
    const rule = resolveVisibilityRule(visibility, command.id);
    if (rule === null || rule === undefined) return { visible: true, reason: 'default_visible' };
    if (typeof rule === 'boolean') {
        return { visible: rule, reason: rule ? 'visible' : 'hidden' };
    }
    if (typeof rule !== 'function') {
        throw new Error(`Command '${command.id}' visibility rule must be boolean or function`);
    }

    try {
        const result = await rule(deepFreeze(clone(context)));
        if (typeof result !== 'boolean') {
            throw new Error('visibility predicate must return boolean');
        }
        return {
            visible: result,
            reason: result ? 'predicate_visible' : 'predicate_hidden',
        };
    } catch (error) {
        return {
            visible: false,
            reason: 'predicate_error',
            error: error?.message || String(error),
        };
    }
}

export async function createCommandToolCatalog(commands, options = {}) {
    const normalized = normalizeCommands(commands);
    const context = {
        role: String(options.role || 'intent_resolver'),
        observation: clone(options.observation ?? {}),
        turn: clone(options.turn ?? null),
    };

    const tools = [];
    const trace = [];

    for (const command of normalized) {
        if (!command.exposed) {
            trace.push({
                commandId: command.id,
                status: 'not_exposed',
            });
            continue;
        }

        const visibility = await isVisible(command, context, options.visibility);
        if (!visibility.visible) {
            trace.push({
                commandId: command.id,
                status: visibility.reason,
                ...(visibility.error ? { error: visibility.error } : {}),
            });
            continue;
        }

        const descriptor = Object.freeze({
            id: 'game.command.' + command.id,
            kind: 'command',
            commandId: command.id,
            description: command.description || ('Execute game command ' + command.id),
            inputSchema: clone(command.argsSchema),
        });
        tools.push(descriptor);
        trace.push({
            commandId: command.id,
            status: 'exposed',
        });
    }

    return Object.freeze({
        role: context.role,
        tools: Object.freeze(tools),
        trace: Object.freeze(trace),
    });
}
