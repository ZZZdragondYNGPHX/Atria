import {
    compileFormula,
    evaluateFormulaAst,
} from './formula.js';

const BLOCKED_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const PATH_SEGMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertKnownFields(source, allowed, label) {
    for (const key of Object.keys(source)) {
        if (!allowed.has(key)) {
            throw new Error(label + ` contains unknown field '${key}'`);
        }
    }
}

function normalizeOptionalArray(value, label) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        throw new Error(label + ' must be an array');
    }
    return value;
}

function compileValueTemplate(value, label) {
    if (Array.isArray(value)) {
        const items = value.map((item, index) => compileValueTemplate(item, label + '[' + index + ']'));
        return Object.freeze({ kind: 'array', items: Object.freeze(items) });
    }

    if (isPlainObject(value)) {
        const keys = Object.keys(value);
        if (keys.length === 1 && keys[0] === 'formula') {
            if (typeof value.formula !== 'string' || !value.formula.trim()) {
                throw new Error(label + ' formula must be a non-empty string');
            }
            return Object.freeze({
                kind: 'formula',
                ast: compileFormula(value.formula),
            });
        }

        const entries = Object.entries(value).map(([key, child]) => [
            key,
            compileValueTemplate(child, label + '.' + key),
        ]);
        return Object.freeze({
            kind: 'object',
            entries: Object.freeze(entries),
        });
    }

    return Object.freeze({
        kind: 'literal',
        value: clone(value),
    });
}

function rngFunctions(rng) {
    if (!rng) return {};
    return {
        'rng.float': () => rng.float(),
        'rng.int': (minimum, maximum) => rng.int(minimum, maximum),
        'rng.dice': (count, sides, modifier = 0) => rng.dice(count, sides, modifier).total,
    };
}

function evaluateTemplate(template, context) {
    if (template.kind === 'literal') return clone(template.value);
    if (template.kind === 'array') {
        return template.items.map(item => evaluateTemplate(item, context));
    }
    if (template.kind === 'object') {
        return Object.fromEntries(template.entries.map(([key, child]) => [
            key,
            evaluateTemplate(child, context),
        ]));
    }
    if (template.kind === 'formula') {
        return evaluateFormulaAst(template.ast, {
            world: context.world,
            args: context.args,
            selectors: context.selectors || {},
        }, {
            functions: rngFunctions(context.rng),
        });
    }
    throw new Error(`Unsupported declarative template kind '${String(template.kind)}'`);
}

function compileEventTemplate(raw, label) {
    if (!isPlainObject(raw)) throw new Error(label + ' must be an object');
    assertKnownFields(raw, new Set(['type', 'payload']), label);

    const type = typeof raw.type === 'string' ? raw.type.trim() : '';
    if (!type) throw new Error(label + ' requires type');

    return Object.freeze({
        type,
        payload: compileValueTemplate(raw.payload ?? {}, label + '.payload'),
    });
}

function evaluateEventTemplate(template, context) {
    return {
        type: template.type,
        payload: evaluateTemplate(template.payload, context),
    };
}

function compileValidator(raw, index, commandId) {
    if (!isPlainObject(raw)) {
        throw new Error(`Declarative command '${commandId}' validator ${index} must be an object`);
    }
    assertKnownFields(
        raw,
        new Set(['id', 'formula', 'error']),
        `Declarative command '${commandId}' validator ${index}`,
    );
    if (typeof raw.formula !== 'string' || !raw.formula.trim()) {
        throw new Error(`Declarative command '${commandId}' validator ${index} requires formula`);
    }

    const ast = compileFormula(raw.formula);
    const id = typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : 'validator_' + (index + 1);
    const errorMessage = typeof raw.error === 'string' && raw.error.trim()
        ? raw.error.trim()
        : `Command '${commandId}' precondition failed`;

    const validator = ({ world, args }) => {
        const result = evaluateFormulaAst(ast, {
            world,
            args,
            selectors: {},
        });
        if (typeof result !== 'boolean') {
            throw new Error(`Declarative validator '${id}' must evaluate to a boolean`);
        }
        return result || errorMessage;
    };
    validator.validatorId = id;
    return validator;
}

function normalizeAssignments(raw, type) {
    if (!isPlainObject(raw) || Object.keys(raw).length === 0) {
        throw new Error(`Declarative reducer '${type}' requires non-empty assignments`);
    }

    return Object.entries(raw).map(([path, value]) => {
        const segments = path.split('.').map(segment => segment.trim());
        if (
            segments.length === 0
            || segments.length > 16
            || segments.some(segment => (
                !PATH_SEGMENT_PATTERN.test(segment)
                || BLOCKED_PATH_SEGMENTS.has(segment)
            ))
        ) {
            throw new Error(`Declarative reducer '${type}' has unsafe assignment path '${path}'`);
        }
        return Object.freeze({
            path,
            segments: Object.freeze(segments),
            value: compileValueTemplate(value, `Reducer '${type}' assignment '${path}'`),
        });
    });
}

function applyAssignment(target, assignment, value) {
    let cursor = target;
    for (let index = 0; index < assignment.segments.length - 1; index += 1) {
        const segment = assignment.segments[index];
        const existing = cursor[segment];
        if (existing === undefined) {
            cursor[segment] = {};
        } else if (!isPlainObject(existing)) {
            throw new Error(
                `Cannot assign '${assignment.path}': '${assignment.segments.slice(0, index + 1).join('.')}' is not an object`,
            );
        }
        cursor = cursor[segment];
    }
    cursor[assignment.segments.at(-1)] = clone(value);
}

export function compileDeclarativeCommand(raw) {
    if (!isPlainObject(raw)) throw new Error('Declarative command must be an object');
    assertKnownFields(
        raw,
        new Set(['id', 'description', 'argsSchema', 'validators', 'events']),
        'Declarative command',
    );

    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!id) throw new Error('Declarative command requires id');
    const events = normalizeOptionalArray(
        raw.events,
        `Declarative command '${id}' events`,
    ).map((event, index) => compileEventTemplate(
        event,
        `Declarative command '${id}' event ${index}`,
    ));
    const validators = normalizeOptionalArray(
        raw.validators,
        `Declarative command '${id}' validators`,
    ).map((validator, index) => compileValidator(validator, index, id));

    return {
        id,
        ...(raw.description === undefined ? {} : { description: String(raw.description) }),
        ...(raw.argsSchema === undefined ? {} : { argsSchema: clone(raw.argsSchema) }),
        validators,
        execute(context) {
            return events.map(event => evaluateEventTemplate(event, {
                world: context.world,
                args: context.args,
                selectors: {},
                rng: context.rng,
            }));
        },
    };
}

export function compileDeclarativeReducer(raw) {
    if (!isPlainObject(raw)) throw new Error('Declarative reducer must be an object');
    assertKnownFields(
        raw,
        new Set(['type', 'payloadSchema', 'assign']),
        'Declarative reducer',
    );

    const type = typeof raw.type === 'string' ? raw.type.trim() : '';
    if (!type) throw new Error('Declarative reducer requires type');
    const assignments = normalizeAssignments(raw.assign, type);

    return {
        type,
        ...(raw.payloadSchema === undefined ? {} : { payloadSchema: clone(raw.payloadSchema) }),
        reduce(state, event) {
            const sourceWorld = clone(state);
            const next = clone(state);
            for (const assignment of assignments) {
                const value = evaluateTemplate(assignment.value, {
                    world: sourceWorld,
                    args: event.payload ?? {},
                    selectors: {},
                });
                applyAssignment(next, assignment, value);
            }
            return next;
        },
    };
}

export function compileDeclarativeRule(raw) {
    if (!isPlainObject(raw)) throw new Error('Declarative rule must be an object');
    assertKnownFields(
        raw,
        new Set(['id', 'on', 'priority', 'when', 'events']),
        'Declarative rule',
    );

    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!id) throw new Error('Declarative rule requires id');
    let whenAst = null;
    if (raw.when !== undefined) {
        if (typeof raw.when !== 'string' || !raw.when.trim()) {
            throw new Error(`Declarative rule '${id}' when must be a non-empty string`);
        }
        whenAst = compileFormula(raw.when);
    }
    const events = normalizeOptionalArray(
        raw.events,
        `Declarative rule '${id}' events`,
    ).map((event, index) => compileEventTemplate(
        event,
        `Declarative rule '${id}' event ${index}`,
    ));

    return {
        id,
        on: clone(raw.on),
        ...(raw.priority === undefined ? {} : { priority: raw.priority }),
        ...(whenAst ? {
            when(context) {
                const result = evaluateFormulaAst(whenAst, {
                    world: context.state,
                    args: context.event?.payload ?? {},
                    selectors: {
                        commandArgs: context.args ?? {},
                    },
                }, {
                    functions: rngFunctions(context.rng),
                });
                if (typeof result !== 'boolean') {
                    throw new Error(`Declarative rule '${id}' condition must evaluate to a boolean`);
                }
                return result;
            },
        } : {}),
        emit(context) {
            return events.map(event => evaluateEventTemplate(event, {
                world: context.state,
                args: context.event?.payload ?? {},
                selectors: {
                    commandArgs: context.args ?? {},
                },
                rng: context.rng,
            }));
        },
    };
}

export function compileDeclarativeLogic(raw = {}) {
    if (!isPlainObject(raw)) throw new Error('Declarative logic root must be an object');
    assertKnownFields(
        raw,
        new Set(['commands', 'reducers', 'rules']),
        'Declarative logic root',
    );

    const commands = normalizeOptionalArray(
        raw.commands,
        'Declarative logic commands',
    ).map(compileDeclarativeCommand);
    const reducers = normalizeOptionalArray(
        raw.reducers,
        'Declarative logic reducers',
    ).map(compileDeclarativeReducer);
    const rules = normalizeOptionalArray(
        raw.rules,
        'Declarative logic rules',
    ).map(compileDeclarativeRule);

    return Object.freeze({
        commands: Object.freeze(commands),
        reducers: Object.freeze(reducers),
        rules: Object.freeze(rules),
    });
}
