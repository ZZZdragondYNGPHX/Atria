import { loadGamePackageJsonResource } from '../package-loader.js';
import { cloneGameUiValue } from './clone.js';

const SELECTOR_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const ACTION_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const COMMAND_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const FIELD_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const HUD_TIERS = Object.freeze(['primary', 'secondary', 'ambient', 'transient', 'details']);
const MAX_ITEMS_PER_TIER = 32;
const MAX_ACTIONS = 32;

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

function validateJsonObject(value, label, depth = 0) {
    if (depth > 8) throw new Error(label + ' exceeds maximum depth');
    if (
        value === null
        || typeof value === 'string'
        || typeof value === 'boolean'
        || (typeof value === 'number' && Number.isFinite(value))
    ) {
        return;
    }
    if (Array.isArray(value)) {
        for (const child of value) validateJsonObject(child, label, depth + 1);
        return;
    }
    if (isPlainObject(value)) {
        for (const [key, child] of Object.entries(value)) {
            if (BLOCKED_KEYS.has(key)) {
                throw new Error(label + ` contains blocked key '${key}'`);
            }
            validateJsonObject(child, label, depth + 1);
        }
        return;
    }
    throw new Error(label + ' must contain JSON-compatible values');
}

function compileValue(raw, label, selectorsUsed) {
    if (isPlainObject(raw)) {
        assertKnownFields(raw, new Set(['selector']), label);
        const selector = String(raw.selector || '').trim();
        if (!SELECTOR_ID_PATTERN.test(selector)) {
            throw new Error(label + ' requires a valid selector id');
        }
        selectorsUsed.add(selector);
        return Object.freeze({ kind: 'selector', selector });
    }
    if (
        raw === null
        || typeof raw === 'string'
        || typeof raw === 'boolean'
        || (typeof raw === 'number' && Number.isFinite(raw))
    ) {
        return Object.freeze({ kind: 'literal', value: raw });
    }
    throw new Error(label + ' must be a literal or { selector }');
}

function compileObject(raw, label, selectorsUsed) {
    if (raw === undefined || raw === null) return null;
    if (!isPlainObject(raw)) throw new Error(label + ' must be an object');

    const entries = [];
    for (const [key, value] of Object.entries(raw)) {
        if (!FIELD_PATTERN.test(key) || BLOCKED_KEYS.has(key)) {
            throw new Error(label + ` contains invalid field '${key}'`);
        }
        entries.push([key, compileValue(value, label + '.' + key, selectorsUsed)]);
    }
    return Object.freeze(entries);
}

function compileHud(raw, selectorsUsed) {
    if (raw === undefined || raw === null) return null;
    if (!isPlainObject(raw)) throw new Error('Immersive hud must be an object');
    assertKnownFields(raw, new Set(HUD_TIERS), 'Immersive hud');

    const output = {};
    for (const tier of HUD_TIERS) {
        const items = raw[tier] === undefined ? [] : raw[tier];
        if (!Array.isArray(items)) {
            throw new Error('Immersive hud.' + tier + ' must be an array');
        }
        if (items.length > MAX_ITEMS_PER_TIER) {
            throw new Error('Immersive hud.' + tier + ' exceeds 32 items');
        }

        output[tier] = Object.freeze(items.map((item, index) => {
            if (!isPlainObject(item)) {
                throw new Error(`Immersive hud.${tier}[${index}] must be an object`);
            }
            assertKnownFields(
                item,
                new Set(['id', 'label', 'selector', 'value']),
                `Immersive hud.${tier}[${index}]`,
            );

            const id = item.id === undefined ? tier + '-' + index : String(item.id || '').trim();
            if (!ACTION_ID_PATTERN.test(id)) {
                throw new Error(`Immersive hud.${tier}[${index}] has invalid id`);
            }
            const label = String(item.label ?? '').trim();

            const hasSelector = item.selector !== undefined;
            const hasValue = item.value !== undefined;
            if (hasSelector === hasValue) {
                throw new Error(
                    `Immersive hud.${tier}[${index}] requires exactly one of selector or value`,
                );
            }

            const source = hasSelector
                ? compileValue(
                    { selector: item.selector },
                    `Immersive hud.${tier}[${index}]`,
                    selectorsUsed,
                )
                : compileValue(item.value, `Immersive hud.${tier}[${index}]`, selectorsUsed);

            return Object.freeze({ id, label, source });
        }));
    }
    return Object.freeze(output);
}

function compileActions(raw) {
    if (raw === undefined || raw === null) return Object.freeze([]);
    if (!Array.isArray(raw)) throw new Error('Immersive actions must be an array');
    if (raw.length > MAX_ACTIONS) throw new Error('Immersive actions exceed 32 items');

    const seen = new Set();
    return Object.freeze(raw.map((item, index) => {
        if (!isPlainObject(item)) {
            throw new Error('Immersive action ' + index + ' must be an object');
        }
        assertKnownFields(item, new Set(['id', 'label', 'command', 'args']), 'Immersive action ' + index);

        const id = String(item.id || '').trim();
        const label = String(item.label || '').trim();
        const command = String(item.command || '').trim();
        if (!ACTION_ID_PATTERN.test(id)) {
            throw new Error('Immersive action ' + index + ' has invalid id');
        }
        if (seen.has(id)) throw new Error(`Duplicate Immersive action id '${id}'`);
        seen.add(id);
        if (!label || label.length > 120) {
            throw new Error('Immersive action ' + index + ' requires label up to 120 characters');
        }
        if (!COMMAND_ID_PATTERN.test(command)) {
            throw new Error('Immersive action ' + index + ' has invalid command id');
        }

        const args = item.args === undefined ? {} : item.args;
        if (!isPlainObject(args)) {
            throw new Error('Immersive action ' + index + ' args must be an object');
        }
        validateJsonObject(args, 'Immersive action ' + index + ' args');

        return Object.freeze({
            id,
            label,
            command,
            args: cloneGameUiValue(args),
        });
    }));
}

function evaluateValue(compiled, selectors) {
    return compiled.kind === 'selector'
        ? selectors.get(compiled.selector)
        : compiled.value;
}

function evaluateObject(entries, selectors) {
    if (!entries) return null;
    const output = {};
    for (const [key, value] of entries) {
        const evaluated = evaluateValue(value, selectors);
        if (evaluated !== undefined && evaluated !== null) {
            output[key] = evaluated;
        }
    }
    return Object.keys(output).length ? output : null;
}

function evaluateHud(compiled, selectors) {
    if (!compiled) return null;
    const output = {};
    for (const tier of HUD_TIERS) {
        output[tier] = compiled[tier].map(item => ({
            id: item.id,
            label: item.label,
            value: evaluateValue(item.source, selectors),
        }));
    }
    return output;
}

export async function loadGameImmersiveDefinition(packageState, options = {}) {
    const resource = packageState?.manifest?.ui?.immersive;
    if (!resource) return null;

    const charId = String(packageState?.charId || '').trim();
    if (!charId) {
        throw new Error('Game Immersive presentation cannot load without a character package id');
    }

    const raw = await loadGamePackageJsonResource(charId, resource, {
        fetchImpl: options.fetchImpl,
        headers: options.headers || {},
    });
    if (!isPlainObject(raw)) {
        throw new Error('Game Immersive presentation root must be an object');
    }
    assertKnownFields(
        raw,
        new Set(['priority', 'identity', 'scene', 'visual', 'hud', 'actions']),
        'Game Immersive presentation',
    );

    const selectorsUsed = new Set();
    const priority = raw.priority === undefined ? 100 : Number(raw.priority);
    if (!Number.isFinite(priority) || priority < -1000 || priority > 1000) {
        throw new Error('Game Immersive presentation priority must be between -1000 and 1000');
    }

    return Object.freeze({
        priority,
        identity: compileObject(raw.identity, 'Immersive identity', selectorsUsed),
        scene: compileObject(raw.scene, 'Immersive scene', selectorsUsed),
        visual: compileObject(raw.visual, 'Immersive visual', selectorsUsed),
        hud: compileHud(raw.hud, selectorsUsed),
        actions: compileActions(raw.actions),
        selectorsUsed: Object.freeze([...selectorsUsed]),
    });
}

export async function activateGameImmersiveProvider(options = {}) {
    const definition = options.definition;
    if (!definition) return null;
    const immersiveApi = options.immersiveApi;
    const selectors = options.selectors;
    const actions = options.actions;

    if (!immersiveApi || typeof immersiveApi.registerProvider !== 'function') {
        return Object.freeze({
            status: 'unavailable',
            refresh: async () => null,
            dispose() {},
        });
    }
    if (!selectors || typeof selectors.get !== 'function' || typeof selectors.subscribe !== 'function') {
        throw new Error('Game Immersive provider requires Selector Runtime');
    }
    if (!actions || typeof actions.dispatch !== 'function') {
        throw new Error('Game Immersive provider requires typed Command actions');
    }

    const availableSelectors = new Set(selectors.list?.() || []);
    for (const selectorId of definition.selectorsUsed) {
        if (!availableSelectors.has(selectorId)) {
            throw new Error(`Game Immersive presentation references unknown selector '${selectorId}'`);
        }
    }

    const actionMap = new Map(definition.actions.map(action => [action.id, action]));
    const providerId = 'game-runtime:' + String(options.packageId || 'package');

    const provider = {
        id: providerId,
        priority: definition.priority,
        getState() {
            return {
                identity: evaluateObject(definition.identity, selectors),
                scene: evaluateObject(definition.scene, selectors),
                visual: evaluateObject(definition.visual, selectors),
                hud: evaluateHud(definition.hud, selectors),
                actions: definition.actions.map(action => ({
                    id: action.id,
                    label: action.label,
                })),
            };
        },
        async runAction(actionId) {
            const action = actionMap.get(String(actionId || '').trim());
            if (!action) return false;
            await actions.dispatch(action.command, cloneGameUiValue(action.args));
            return true;
        },
    };

    const handle = immersiveApi.registerProvider(provider);
    let refreshQueued = false;
    const subscriptions = definition.selectorsUsed.map(selectorId => (
        selectors.subscribe(selectorId, () => {
            if (refreshQueued) return;
            refreshQueued = true;
            queueMicrotask(() => {
                refreshQueued = false;
                void handle.refresh();
            });
        })
    ));

    await handle.refresh();

    let disposed = false;
    return Object.freeze({
        status: 'active',
        id: providerId,
        refresh: () => handle.refresh(),
        dispose() {
            if (disposed) return;
            disposed = true;
            for (const unsubscribe of subscriptions.splice(0).reverse()) unsubscribe();
            handle.dispose();
        },
    });
}
