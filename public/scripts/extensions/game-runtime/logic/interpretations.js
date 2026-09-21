const EVENT_TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/;
const COMMAND_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const MAX_COMMANDS_PER_INTERPRETATION = 8;

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child, seen);
    return value;
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeProposal(raw, index, eventType) {
    if (!isPlainObject(raw)) {
        throw new Error(
            `Interpretation mapping '${eventType}' command proposal ${index} must be an object`,
        );
    }
    const id = String(raw.id || raw.commandId || '').trim();
    if (!COMMAND_ID_PATTERN.test(id)) {
        throw new Error(
            `Interpretation mapping '${eventType}' command proposal ${index} has invalid command id`,
        );
    }
    const args = raw.args === undefined ? {} : raw.args;
    if (!isPlainObject(args)) {
        throw new Error(
            `Interpretation mapping '${eventType}' command proposal ${index} args must be an object`,
        );
    }
    return Object.freeze({
        id,
        args: deepFreeze(clone(args)),
    });
}

function normalizeDefinitions(definitions) {
    if (definitions == null) return [];
    if (!Array.isArray(definitions)) {
        throw new Error('Interpretation Mapping Registry definitions must be an array');
    }

    const seen = new Set();
    return definitions.map((raw, index) => {
        if (!isPlainObject(raw)) {
            throw new Error('Interpretation mapping ' + index + ' must be an object');
        }
        const eventType = String(raw.eventType || '').trim();
        if (!EVENT_TYPE_PATTERN.test(eventType)) {
            throw new Error('Interpretation mapping ' + index + ' has invalid eventType');
        }
        if (seen.has(eventType)) {
            throw new Error(`Duplicate interpretation mapping for '${eventType}'`);
        }
        seen.add(eventType);
        if (typeof raw.map !== 'function') {
            throw new Error(`Interpretation mapping '${eventType}' requires map()`);
        }
        return Object.freeze({
            eventType,
            map: raw.map,
        });
    });
}

export function createInterpretationMappingRegistry(definitions = []) {
    const mappings = new Map(
        normalizeDefinitions(definitions).map(definition => [definition.eventType, definition]),
    );

    return Object.freeze({
        list() {
            return [...mappings.keys()];
        },

        has(eventType) {
            return mappings.has(String(eventType || '').trim());
        },

        map(interpretation, context = {}) {
            if (!interpretation || typeof interpretation !== 'object' || Array.isArray(interpretation)) {
                throw new Error('Interpretation Mapping requires a typed interpretation object');
            }
            if (interpretation.decision !== 'event') {
                return Object.freeze({
                    status: 'no_change',
                    eventType: null,
                    commands: Object.freeze([]),
                });
            }

            const eventType = String(interpretation.eventType || '').trim();
            const definition = mappings.get(eventType);
            if (!definition) {
                throw new Error(`No deterministic interpretation mapping registered for '${eventType}'`);
            }

            const input = Object.freeze({
                interpretation: deepFreeze(clone(interpretation)),
                world: deepFreeze(clone(context.world ?? {})),
                observation: deepFreeze(clone(context.observation ?? {})),
                turn: deepFreeze(clone(context.turn ?? null)),
            });
            const output = definition.map(input);
            const rawCommands = output == null
                ? []
                : (Array.isArray(output) ? output : [output]);

            if (rawCommands.length > MAX_COMMANDS_PER_INTERPRETATION) {
                throw new Error(
                    `Interpretation mapping '${eventType}' emitted too many commands`,
                );
            }

            return Object.freeze({
                status: rawCommands.length > 0 ? 'mapped' : 'no_change',
                eventType,
                commands: Object.freeze(
                    rawCommands.map((command, index) => normalizeProposal(command, index, eventType)),
                ),
            });
        },
    });
}
