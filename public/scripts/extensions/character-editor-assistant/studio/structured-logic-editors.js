/**
 * Structured editor model for the existing R3 declarative Game Logic format.
 *
 * Every edit is applied to the same logic JSON document and immediately
 * recompiled by the authoritative declarative compiler. Formula edits are
 * also compiled by the R3 safe Formula AST parser before acceptance.
 */

import { compileDeclarativeLogic } from '../../game-runtime/logic/declarative.js';
import { compileFormula } from '../../game-runtime/logic/formula.js';

export const LOGIC_EDITOR_SECTION = Object.freeze({
    COMMANDS: 'commands',
    REDUCERS: 'reducers',
    RULES: 'rules',
    INTERPRETATIONS: 'interpretations',
});

const SECTIONS = new Set(Object.values(LOGIC_EDITOR_SECTION));

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertLogicRoot(value) {
    if (!isPlainObject(value)) {
        throw new Error('Game Logic source must be a JSON object');
    }
}

function assertSection(section) {
    if (!SECTIONS.has(section)) {
        throw new Error(`Unsupported Game Logic editor section '${section}'`);
    }
}

function parseJsonField(value, label, expected = 'any') {
    let parsed;
    try {
        parsed = JSON.parse(String(value));
    } catch (error) {
        throw new Error(`${label} must be valid JSON: ${error?.message || String(error)}`);
    }
    if (expected === 'object' && !isPlainObject(parsed)) {
        throw new Error(`${label} must be a JSON object`);
    }
    if (expected === 'array' && !Array.isArray(parsed)) {
        throw new Error(`${label} must be a JSON array`);
    }
    return parsed;
}

function jsonText(value, fallback) {
    return JSON.stringify(value === undefined ? fallback : value, null, 2);
}

function sectionEntries(value, section) {
    return Array.isArray(value[section]) ? value[section] : [];
}

function entryLabel(section, entry, index) {
    if (section === LOGIC_EDITOR_SECTION.COMMANDS) return String(entry.id || `Command ${index + 1}`);
    if (section === LOGIC_EDITOR_SECTION.REDUCERS) return String(entry.type || `Reducer ${index + 1}`);
    if (section === LOGIC_EDITOR_SECTION.RULES) return String(entry.id || `Rule ${index + 1}`);
    return String(entry.eventType || `Mapping ${index + 1}`);
}

function entryModel(section, entry, index) {
    if (section === LOGIC_EDITOR_SECTION.COMMANDS) {
        return Object.freeze({
            index,
            label: entryLabel(section, entry, index),
            fields: Object.freeze({
                id: String(entry.id || ''),
                description: String(entry.description || ''),
                llmExpose: entry.llm?.expose === true,
                argsSchema: jsonText(entry.argsSchema, {}),
                validators: jsonText(entry.validators, []),
                events: jsonText(entry.events, []),
            }),
        });
    }
    if (section === LOGIC_EDITOR_SECTION.REDUCERS) {
        return Object.freeze({
            index,
            label: entryLabel(section, entry, index),
            fields: Object.freeze({
                type: String(entry.type || ''),
                payloadSchema: jsonText(entry.payloadSchema, {}),
                assign: jsonText(entry.assign, {}),
            }),
        });
    }
    if (section === LOGIC_EDITOR_SECTION.RULES) {
        return Object.freeze({
            index,
            label: entryLabel(section, entry, index),
            fields: Object.freeze({
                id: String(entry.id || ''),
                on: jsonText(entry.on, ''),
                priority: Number.isInteger(entry.priority) ? entry.priority : 0,
                when: String(entry.when || ''),
                events: jsonText(entry.events, []),
            }),
        });
    }
    return Object.freeze({
        index,
        label: entryLabel(section, entry, index),
        fields: Object.freeze({
            eventType: String(entry.eventType || ''),
            command: String(entry.command || ''),
            when: String(entry.when || ''),
            args: jsonText(entry.args, {}),
        }),
    });
}

function collectFormulaTemplates(value, path, rows) {
    if (Array.isArray(value)) {
        value.forEach((child, index) => collectFormulaTemplates(child, [...path, index], rows));
        return;
    }
    if (!isPlainObject(value)) return;

    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === 'formula' && typeof value.formula === 'string') {
        rows.push(Object.freeze({
            path: Object.freeze([...path, 'formula']),
            label: path.join('.'),
            expression: value.formula,
        }));
        return;
    }
    for (const [key, child] of Object.entries(value)) {
        collectFormulaTemplates(child, [...path, key], rows);
    }
}

function collectFormulaRows(root, section) {
    const rows = [];
    const entries = sectionEntries(root, section);
    entries.forEach((entry, index) => {
        const base = [section, index];

        if (section === LOGIC_EDITOR_SECTION.COMMANDS) {
            (Array.isArray(entry.validators) ? entry.validators : []).forEach((validator, validatorIndex) => {
                if (typeof validator?.formula === 'string') {
                    rows.push(Object.freeze({
                        path: Object.freeze([...base, 'validators', validatorIndex, 'formula']),
                        label: `${entry.id || index}.validator.${validator.id || validatorIndex + 1}`,
                        expression: validator.formula,
                    }));
                }
            });
            collectFormulaTemplates(entry.events, [...base, 'events'], rows);
        } else if (section === LOGIC_EDITOR_SECTION.REDUCERS) {
            collectFormulaTemplates(entry.assign, [...base, 'assign'], rows);
        } else if (section === LOGIC_EDITOR_SECTION.RULES) {
            if (typeof entry.when === 'string' && entry.when.trim()) {
                rows.push(Object.freeze({
                    path: Object.freeze([...base, 'when']),
                    label: `${entry.id || index}.when`,
                    expression: entry.when,
                }));
            }
            collectFormulaTemplates(entry.events, [...base, 'events'], rows);
        } else if (section === LOGIC_EDITOR_SECTION.INTERPRETATIONS) {
            if (typeof entry.when === 'string' && entry.when.trim()) {
                rows.push(Object.freeze({
                    path: Object.freeze([...base, 'when']),
                    label: `${entry.eventType || index}.when`,
                    expression: entry.when,
                }));
            }
            collectFormulaTemplates(entry.args, [...base, 'args'], rows);
        }
    });
    return Object.freeze(rows);
}

export function validateDeclarativeLogicSource(value) {
    assertLogicRoot(value);
    compileDeclarativeLogic(value);
    return true;
}

export function buildLogicSectionEditorModel(value, section) {
    assertLogicRoot(value);
    assertSection(section);
    compileDeclarativeLogic(value);
    return Object.freeze({
        editor: 'game_logic',
        section,
        entries: Object.freeze(
            sectionEntries(value, section).map((entry, index) => entryModel(section, entry, index)),
        ),
        formulas: collectFormulaRows(value, section),
    });
}

export function parseLogicStructuredDocument(section, text) {
    assertSection(section);
    let value;
    try {
        value = JSON.parse(String(text));
    } catch (error) {
        throw new Error('Game Logic source is not valid JSON: ' + (error?.message || String(error)));
    }
    assertLogicRoot(value);
    compileDeclarativeLogic(value);
    return {
        value,
        model: buildLogicSectionEditorModel(value, section),
    };
}

function updateEntry(next, section, index, updater) {
    const entries = sectionEntries(next, section);
    if (!Number.isInteger(index) || index < 0 || index >= entries.length) {
        throw new Error('Game Logic entry index is out of range');
    }
    updater(entries[index]);
    next[section] = entries;
}

export function applyLogicEntryFieldPatch(value, section, index, field, rawValue) {
    assertLogicRoot(value);
    assertSection(section);
    const next = clone(value);

    updateEntry(next, section, index, entry => {
        if (section === LOGIC_EDITOR_SECTION.COMMANDS) {
            if (field === 'id') entry.id = String(rawValue || '').trim();
            else if (field === 'description') {
                const description = String(rawValue || '');
                if (description) entry.description = description;
                else delete entry.description;
            } else if (field === 'llmExpose') {
                entry.llm = { ...(isPlainObject(entry.llm) ? entry.llm : {}), expose: Boolean(rawValue) };
            } else if (field === 'argsSchema') {
                entry.argsSchema = parseJsonField(rawValue, 'Command argsSchema', 'object');
            } else if (field === 'validators') {
                entry.validators = parseJsonField(rawValue, 'Command validators', 'array');
            } else if (field === 'events') {
                entry.events = parseJsonField(rawValue, 'Command events', 'array');
            } else {
                throw new Error(`Unsupported Command editor field '${field}'`);
            }
        } else if (section === LOGIC_EDITOR_SECTION.REDUCERS) {
            if (field === 'type') entry.type = String(rawValue || '').trim();
            else if (field === 'payloadSchema') {
                entry.payloadSchema = parseJsonField(rawValue, 'Reducer payloadSchema', 'object');
            } else if (field === 'assign') {
                entry.assign = parseJsonField(rawValue, 'Reducer assign', 'object');
            } else {
                throw new Error(`Unsupported Reducer editor field '${field}'`);
            }
        } else if (section === LOGIC_EDITOR_SECTION.RULES) {
            if (field === 'id') entry.id = String(rawValue || '').trim();
            else if (field === 'on') entry.on = parseJsonField(rawValue, 'Rule on');
            else if (field === 'priority') {
                const priority = Number(rawValue);
                if (!Number.isInteger(priority)) throw new Error('Rule priority must be an integer');
                entry.priority = priority;
            } else if (field === 'when') {
                const expression = String(rawValue || '').trim();
                if (expression) entry.when = expression;
                else delete entry.when;
            } else if (field === 'events') {
                entry.events = parseJsonField(rawValue, 'Rule events', 'array');
            } else {
                throw new Error(`Unsupported Rule editor field '${field}'`);
            }
        } else {
            if (field === 'eventType') entry.eventType = String(rawValue || '').trim();
            else if (field === 'command') entry.command = String(rawValue || '').trim();
            else if (field === 'when') {
                const expression = String(rawValue || '').trim();
                if (expression) entry.when = expression;
                else delete entry.when;
            } else if (field === 'args') {
                entry.args = parseJsonField(rawValue, 'Interpretation args', 'object');
            } else {
                throw new Error(`Unsupported Interpretation editor field '${field}'`);
            }
        }
    });

    compileDeclarativeLogic(next);
    return next;
}

function nextUnique(base, used) {
    if (!used.has(base)) return base;
    for (let index = 2; index < 10000; index += 1) {
        const candidate = base + '_' + index;
        if (!used.has(candidate)) return candidate;
    }
    throw new Error('Could not allocate a unique Game Logic id');
}

function defaultEntry(root, section) {
    const entries = sectionEntries(root, section);
    if (section === LOGIC_EDITOR_SECTION.COMMANDS) {
        const used = new Set(entries.map(entry => String(entry.id || '')));
        return {
            id: nextUnique('new_command', used),
            description: '',
            argsSchema: { type: 'object', additionalProperties: false, properties: {} },
            validators: [],
            events: [],
            llm: { expose: false },
        };
    }
    if (section === LOGIC_EDITOR_SECTION.REDUCERS) {
        const used = new Set(entries.map(entry => String(entry.type || '')));
        return {
            type: nextUnique('NewEvent', used),
            payloadSchema: { type: 'object', additionalProperties: false, properties: {} },
            assign: { value: 0 },
        };
    }
    if (section === LOGIC_EDITOR_SECTION.RULES) {
        const used = new Set(entries.map(entry => String(entry.id || '')));
        return {
            id: nextUnique('new_rule', used),
            on: 'NewEvent',
            priority: 0,
            events: [],
        };
    }
    const used = new Set(entries.map(entry => String(entry.eventType || '')));
    return {
        eventType: nextUnique('semantic_event', used),
        command: 'new_command',
        args: {},
    };
}

export function addLogicEntry(value, section) {
    assertLogicRoot(value);
    assertSection(section);
    const next = clone(value);
    const entries = sectionEntries(next, section);
    entries.push(defaultEntry(next, section));
    next[section] = entries;
    compileDeclarativeLogic(next);
    return next;
}

export function removeLogicEntry(value, section, index) {
    assertLogicRoot(value);
    assertSection(section);
    const next = clone(value);
    const entries = sectionEntries(next, section);
    if (!Number.isInteger(index) || index < 0 || index >= entries.length) {
        throw new Error('Game Logic entry index is out of range');
    }
    entries.splice(index, 1);
    next[section] = entries;
    compileDeclarativeLogic(next);
    return next;
}

function setAtPath(root, path, value) {
    const next = clone(root);
    let cursor = next;
    for (const segment of path.slice(0, -1)) {
        if (!cursor || typeof cursor !== 'object') {
            throw new Error('Formula source path is no longer valid');
        }
        cursor = cursor[segment];
    }
    cursor[path.at(-1)] = value;
    return next;
}

export function applyFormulaExpression(value, path, expression) {
    assertLogicRoot(value);
    const source = String(expression || '').trim();
    compileFormula(source);
    const next = setAtPath(value, path, source);
    compileDeclarativeLogic(next);
    return next;
}

export function validateFormulaExpression(expression) {
    return compileFormula(expression);
}
