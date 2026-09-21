import { compileFormula, evaluateFormulaAst } from '../logic/formula.js';
import { loadGamePackageJsonResource } from '../package-loader.js';

const SELECTOR_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const COMMAND_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_SELECTOR_COUNT = 128;
const MAX_ARGS_TEXT = 4096;
const MAX_ARGS_NODES = 256;
const MAX_ARGS_DEPTH = 8;

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

function validateJsonValue(value, state, depth = 0) {
    state.nodes += 1;
    if (state.nodes > MAX_ARGS_NODES) {
        throw new Error('Command action arguments exceed maximum complexity');
    }
    if (depth > MAX_ARGS_DEPTH) {
        throw new Error('Command action arguments exceed maximum depth');
    }

    if (
        value === null
        || typeof value === 'string'
        || typeof value === 'boolean'
        || (typeof value === 'number' && Number.isFinite(value))
    ) {
        return;
    }

    if (Array.isArray(value)) {
        for (const child of value) validateJsonValue(child, state, depth + 1);
        return;
    }

    if (isPlainObject(value)) {
        for (const [key, child] of Object.entries(value)) {
            if (BLOCKED_KEYS.has(key)) {
                throw new Error(`Command action arguments contain blocked key '${key}'`);
            }
            validateJsonValue(child, state, depth + 1);
        }
        return;
    }

    throw new Error('Command action arguments must be JSON-compatible values');
}

function parseCommandArgs(raw) {
    const text = String(raw || '').trim();
    if (!text) return {};
    if (text.length > MAX_ARGS_TEXT) {
        throw new Error('Command action arguments exceed 4096 characters');
    }

    let value;
    try {
        value = JSON.parse(text);
    } catch (error) {
        throw new Error('Command action arguments are invalid JSON: ' + (error?.message || String(error)));
    }
    if (!isPlainObject(value)) {
        throw new Error('Command action arguments must be a JSON object');
    }
    validateJsonValue(value, { nodes: 0 });
    return value;
}

function normalizeSelectorDefinitions(raw) {
    if (!Array.isArray(raw)) {
        throw new Error('Game UI selectors resource must be an array');
    }
    if (raw.length > MAX_SELECTOR_COUNT) {
        throw new Error('Game UI selectors resource exceeds 128 selectors');
    }

    const seen = new Set();
    return raw.map((entry, index) => {
        if (!isPlainObject(entry)) {
            throw new Error('Game UI selector ' + index + ' must be an object');
        }
        assertKnownFields(entry, new Set(['id', 'formula']), 'Game UI selector ' + index);

        const id = String(entry.id || '').trim();
        if (!SELECTOR_ID_PATTERN.test(id)) {
            throw new Error('Game UI selector id must match /^[a-z][a-z0-9._-]{0,63}$/');
        }
        if (seen.has(id)) {
            throw new Error(`Duplicate Game UI selector id '${id}'`);
        }
        seen.add(id);

        if (typeof entry.formula !== 'string' || !entry.formula.trim()) {
            throw new Error(`Game UI selector '${id}' requires formula`);
        }
        const ast = compileFormula(entry.formula);

        return Object.freeze({
            id,
            select(world) {
                return evaluateFormulaAst(ast, {
                    world,
                    args: {},
                    selectors: {},
                });
            },
        });
    });
}

export async function loadGameSelectorDefinitions(packageState, options = {}) {
    const resource = packageState?.manifest?.ui?.selectors;
    if (!resource) return [];

    const charId = String(packageState?.charId || '').trim();
    if (!charId) {
        throw new Error('Game UI selectors cannot load without a character package id');
    }

    const raw = await loadGamePackageJsonResource(charId, resource, {
        fetchImpl: options.fetchImpl,
        headers: options.headers || {},
    });
    return normalizeSelectorDefinitions(raw);
}

function setBoundValue(element, binding, value) {
    if (binding === 'text') {
        element.textContent = value === null || value === undefined ? '' : String(value);
        return;
    }
    if (binding === 'value') {
        if (!('value' in element)) {
            throw new Error('data-atria-bind-value requires an element with a value property');
        }
        element.value = value === null || value === undefined ? '' : String(value);
        return;
    }
    if (binding === 'hidden') {
        if (typeof value !== 'boolean') {
            throw new Error('data-atria-bind-hidden selector must return a boolean');
        }
        element.hidden = value;
        return;
    }
    throw new Error(`Unsupported Game UI binding '${binding}'`);
}

function bindSelectorElements(root, context, cleanups) {
    const bindings = [
        ['text', 'data-atria-bind-text'],
        ['value', 'data-atria-bind-value'],
        ['hidden', 'data-atria-bind-hidden'],
    ];

    for (const [binding, attribute] of bindings) {
        for (const element of root.querySelectorAll('[' + attribute + ']')) {
            const selectorId = String(element.getAttribute(attribute) || '').trim();
            if (!SELECTOR_ID_PATTERN.test(selectorId)) {
                throw new Error(`${attribute} requires a valid selector id`);
            }

            const render = value => setBoundValue(element, binding, value);
            render(context.selectors.get(selectorId));
            cleanups.push(context.selectors.subscribe(selectorId, render));
        }
    }
}

function bindCommandElements(root, context, cleanups) {
    for (const element of root.querySelectorAll('[data-atria-command]')) {
        const commandId = String(element.getAttribute('data-atria-command') || '').trim();
        if (!COMMAND_ID_PATTERN.test(commandId)) {
            throw new Error('data-atria-command requires a valid command id');
        }

        const mode = String(element.getAttribute('data-atria-command-mode') || 'dispatch').trim();
        if (!['dispatch', 'simulate'].includes(mode)) {
            throw new Error(`Command action '${commandId}' has invalid mode '${mode}'`);
        }
        const args = parseCommandArgs(element.getAttribute('data-atria-command-args'));
        let pending = false;
        const originallyDisabled = 'disabled' in element ? Boolean(element.disabled) : null;

        const listener = async (event) => {
            event.preventDefault();
            if (pending) return;
            pending = true;
            element.dataset.atriaCommandState = 'pending';
            if ('disabled' in element) element.disabled = true;

            try {
                const action = mode === 'simulate'
                    ? context.actions.simulate
                    : context.actions.dispatch;
                await action(commandId, clone(args));
                element.dataset.atriaCommandState = 'success';
                delete element.dataset.atriaCommandError;
            } catch (error) {
                element.dataset.atriaCommandState = 'error';
                element.dataset.atriaCommandError = String(error?.code || error?.name || 'COMMAND_FAILED');
                console.warn('[game-runtime] Declarative command action failed', {
                    commandId,
                    mode,
                    error,
                });
            } finally {
                pending = false;
                if ('disabled' in element) element.disabled = originallyDisabled;
            }
        };

        element.addEventListener('click', listener);
        cleanups.push(() => element.removeEventListener('click', listener));
    }
}

export function bindDeclarativeGameUi(root, context) {
    if (!root || typeof root.querySelectorAll !== 'function') {
        throw new Error('Declarative Game UI binding requires a root element');
    }
    if (!context?.selectors || !context?.actions) {
        throw new Error('Declarative Game UI binding requires selectors and actions');
    }

    const cleanups = [];
    try {
        bindSelectorElements(root, context, cleanups);
        bindCommandElements(root, context, cleanups);
    } catch (error) {
        for (const cleanup of cleanups.splice(0).reverse()) cleanup();
        throw error;
    }

    let disposed = false;
    return () => {
        if (disposed) return;
        disposed = true;
        for (const cleanup of cleanups.splice(0).reverse()) cleanup();
    };
}
