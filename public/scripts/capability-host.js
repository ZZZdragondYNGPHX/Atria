import { nativeSessionRuntime } from './native/session-runtime.js';
import { normalizeRegexPresets } from '../shared/regex-presets.js';
import { eventSource, event_types, saveSettings, getRequestHeaders, buildObjectPatchOperationsAsync, buildObjectPatchOperations, cloneJsonValue } from '../script.js';
import './loader.js';
import { renderTemplate, renderTemplateAsync } from './templates.js';
import { deleteValueByPath, setValueByPath } from './utils.js';
import { getContext } from './st-context.js';
import { debounce_timeout } from './constants.js';
import { SimpleMutex } from './util/SimpleMutex.js';
import { STATE_ERROR_REASONS, makeStateError, makeStateOk } from './state-errors.js';
import { formatHttpErrorHint, formatTransportErrorHint, formatConflictHint, formatValidationArgsHint } from './state-errors/format.js';
export { getContext, SimpleMutex as ModuleWorkerWrapper };

// Atria-owned capability bootstrap. There is no dynamically discovered plugin catalog.
export const globalPluginNames = Object.freeze(['regex', 'search-tools']);
const apis = new Map(), loadStates = new Map();
export function registerCapabilityApi(name, api) {
    if (!['orchestrator', 'memory-graph', 'game-runtime'].includes(name)) throw new TypeError('Unknown Atria capability');
    apis.set(name, api);
}
export function getCapabilityApi(name) { return apis.get(name); }
export function getCapabilityLoadState(name) { return loadStates.get(name) || 'pending'; }
const defaultCapabilitySettings = () => ({
    // Account rules and their enabled-rule groups only. Native Preset/Game rules
    // belong to their resource documents, never this account settings payload.
    disabledPlugins: [], regex: [], regex_presets: [],
    note: { default: '', chara: [], wiAddition: [] }, variables: { global: {} }, attachments: [], character_attachments: {}, disabled_attachments: [],
});
export const capabilitySettings = defaultCapabilitySettings();
const retainedKeys = new Set(['disabledPlugins', 'regex', 'regex_presets', 'regex_section_collapsed', 'note', 'variables', 'attachments', 'character_attachments', 'disabled_attachments', 'orchestrator', 'memory_graph', 'game-runtime', 'search_tools']);
export function primeCapabilitySettings(settings) {
    // Retain already-authored Atria capabilities once; never hydrate retired extension settings.
    const source = structuredClone(settings.atri_capabilities || settings.extension_settings || {});
    for (const key of Object.keys(capabilitySettings)) delete capabilitySettings[key];
    Object.assign(capabilitySettings, defaultCapabilitySettings());
    for (const [key, value] of Object.entries(source)) if (retainedKeys.has(key)) capabilitySettings[key] = value;
    capabilitySettings.regex_presets = normalizeRegexPresets(capabilitySettings.regex_presets, capabilitySettings.regex);
    const disabled = source.disabledPlugins || source.disabledExtensions;
    capabilitySettings.disabledPlugins = (Array.isArray(disabled) ? disabled : []).filter(name => globalPluginNames.includes(name));
}
export function serializeCapabilitySettings() { return { ...Object.fromEntries(Object.entries(capabilitySettings).filter(([key]) => retainedKeys.has(key))), regex_presets: normalizeRegexPresets(capabilitySettings.regex_presets, capabilitySettings.regex) }; }
function assertGlobalPlugin(name) { if (!globalPluginNames.includes(name)) throw new TypeError('Unknown Atria Global Plugin'); }
export async function enableGlobalPlugin(name, reload = true) {
    assertGlobalPlugin(name); const previous = capabilitySettings.disabledPlugins;
    capabilitySettings.disabledPlugins = previous.filter(item => item !== name);
    try { await saveSettings(); } catch (error) { capabilitySettings.disabledPlugins = previous; throw error; }
    if (reload) location.reload();
}
export async function disableGlobalPlugin(name, reload = true) {
    assertGlobalPlugin(name); const previous = capabilitySettings.disabledPlugins;
    capabilitySettings.disabledPlugins = [...new Set([...previous, name])];
    try { await saveSettings(); } catch (error) { capabilitySettings.disabledPlugins = previous; throw error; }
    if (reload) location.reload();
}
export function getGlobalPluginManifest(name) { assertGlobalPlugin(name); return { display_name: name === 'regex' ? 'Regex' : 'Search Tools', version: name === 'regex' ? '1.0.0' : '0.1.0' }; }
export function renderPluginTemplate(name, templateId, data = {}, sanitize = true, localize = true) {
    assertGlobalPlugin(name); return renderTemplate(`scripts/extensions/${name}/${templateId}.html`, data, sanitize, localize, true);
}
export function renderPluginTemplateAsync(name, templateId, data = {}, sanitize = true, localize = true) {
    assertGlobalPlugin(name); return renderTemplateAsync(`scripts/extensions/${name}/${templateId}.html`, data, sanitize, localize, true);
}
let bootstrap;
export function bootstrapCapabilities() {
    if (bootstrap) return bootstrap;
    bootstrap = (async () => {
        await eventSource.emit(event_types.EXTENSIONS_FIRST_LOAD);
        const load = async (name, task) => {
            if (globalPluginNames.includes(name) && capabilitySettings.disabledPlugins.includes(name)) { loadStates.set(name, 'disabled'); return; }
            const started = performance.now();
            try { await task(); loadStates.set(name, 'ready'); } catch (error) { loadStates.set(name, 'failed'); console.error('[atria] Capability startup failed', name, error); } finally {
                const state = globalThis.__atriaStartupTiming;
                if (state && typeof state === 'object') {
                    state.durations ||= {};
                    state.durations[`capability:${name}`] = performance.now() - started;
                }
            }
        };
        await load('regex', async () => {
            const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/scripts/extensions/regex/style.css'; document.head.append(css);
            const regex = await import('./extensions/regex/index.js'); await regex.init();
        });
        await load('game-runtime', () => import('./native/experience/index.js'));
        await load('search-tools', () => import('./extensions/search-tools/index.js'));
        await load('orchestrator', () => import('./agents/orchestrator/index.js'));
        await load('memory-graph', () => import('./agents/memory/index.js'));
        await eventSource.emit(event_types.EXTENSION_SETTINGS_LOADED);
    })();
    return bootstrap;
}

let saveMetadataTimeout = null;
export function cancelDebouncedMetadataSave() {
    if (saveMetadataTimeout) {
        console.debug('Debounced metadata save cancelled');
        clearTimeout(saveMetadataTimeout);
        saveMetadataTimeout = null;
    }
}

export function saveMetadataDebounced() {
    const context = getContext();
    const groupId = context.groupId;
    const characterId = context.characterId;

    cancelDebouncedMetadataSave();

    saveMetadataTimeout = setTimeout(async () => {
        const newContext = getContext();

        if (groupId !== newContext.groupId) {
            console.warn('Group changed, not saving metadata');
            return;
        }

        if (characterId !== newContext.characterId) {
            console.warn('Character changed, not saving metadata');
            return;
        }

        console.debug('Saving metadata...');
        await newContext.saveMetadata();
        console.debug('Saved metadata...');
    }, debounce_timeout.relaxed);
}

export const UNSET_VALUE = '__@@UNSET@@__';

/**
 * Writes `data.extensions[key]` on a character card and persists.
 *
 * Replace semantics: the full `value` argument becomes the new
 * `data.extensions[key]` on disk. Sibling subkeys present in the previous
 * on-disk value are NOT preserved — callers wanting a partial update must
 * read the previous value, spread it, and overlay changes before calling.
 *
 * Other extension keys under `data.extensions.*` (other plugins' data) are
 * never touched: the server scopes the replace to exactly the requested
 * key.
 *
 * Pass {@link UNSET_VALUE} as `value` to delete the key entirely.
 * Plain `null` writes a literal `null` (the key remains).
 *
 * @param {number|string} characterId Index in the character array
 * @param {string} key Field name
 * @param {any} value Field value, or {@link UNSET_VALUE} to delete
 * @returns {Promise<void>} When the field is written
 */
export async function writeExtensionField(characterId, key, value) {
    const context = getContext();
    const character = context.characters[characterId];
    if (!character) {
        console.warn('Character not found', characterId);
        return;
    }

    const summary = Array.isArray(value)
        ? {
            kind: 'array',
            length: value.length,
            sampleIds: value.slice(0, 5).map(item => String(item?.id || '')),
            serializedLength: JSON.stringify(value).length,
        }
        : {
            kind: typeof value,
            serializedLength: JSON.stringify(value ?? null).length,
        };

    const extensionPath = `data.extensions.${key}`;
    const isUnset = value === UNSET_VALUE;
    console.info('[Extensions] writeExtensionField requested', {
        characterId,
        contextCharacterId: context.characterId,
        avatar: character.avatar || null,
        key,
        path: extensionPath,
        hasJsonData: Boolean(character.json_data),
        valueSummary: summary,
        isUnset,
    });
    if (isUnset) {
        deleteValueByPath(character, extensionPath);
    } else {
        setValueByPath(character, extensionPath, value);
    }

    // Process JSON data
    if (character.json_data) {
        const jsonData = JSON.parse(character.json_data);
        if (isUnset) {
            deleteValueByPath(jsonData, extensionPath);
        } else {
            setValueByPath(jsonData, extensionPath, value);
        }
        character.json_data = JSON.stringify(jsonData);

        // Make sure the data doesn't get lost when saving the current character
        if (Number(characterId) === Number(context.characterId)) {
            $('#character_json_data').val(character.json_data);
        }

        console.debug('[Extensions] writeExtensionField updated in-memory character JSON', {
            characterId,
            avatar: character.avatar || null,
            key,
            mirroredToOpenEditor: Number(characterId) === Number(context.characterId),
            jsonLength: character.json_data.length,
        });
    }

    // Save data to the server
    const saveDataRequest = {
        avatar: character.avatar,
        data: {
            extensions: {
                [key]: value,
            },
        },
        replacePaths: [`data.extensions.${key}`],
    };
    const mergeResponse = await fetch('/api/characters/merge-attributes', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(saveDataRequest),
    });

    console.info('[Extensions] writeExtensionField merge response', {
        characterId,
        avatar: character.avatar || null,
        key,
        status: mergeResponse.status,
        ok: mergeResponse.ok,
        statusText: mergeResponse.statusText,
    });

    if (!mergeResponse.ok) {
        console.error('Failed to save extension field', mergeResponse.statusText);
    }
}

/**
 * Read character-level sidecar state for a given namespace.
 * Data is stored in a separate sidecar file alongside the character card,
 * without modifying the card JSON itself.
 * @param {string} avatar - Character avatar filename (e.g. 'xxx.png')
 * @param {string} namespace - Storage namespace (e.g. 'my_extension')
 * @returns {Promise<{ok: boolean, state: object|null, reason?: string, hint?: string}>}
 *          Envelope: `{ok: true, state}` on hit or empty miss; `{ok: false, state: null, reason, hint}` on failure.
 */
export async function getCharacterState(avatar, namespace) {
    if (nativeSessionRuntime.active) return { ok: false, state: null, reason: 'native_state_integration_pending' };
    const safeAvatar = String(avatar || '').trim();
    const safeNamespace = String(namespace || '').trim();
    if (!safeAvatar) {
        return { ok: false, state: null,
            reason: STATE_ERROR_REASONS.VALIDATION_ARGS,
            hint: formatValidationArgsHint('avatar', 'is required') };
    }
    if (!safeNamespace) {
        return { ok: false, state: null,
            reason: STATE_ERROR_REASONS.VALIDATION_ARGS,
            hint: formatValidationArgsHint('namespace', 'is required') };
    }
    let response;
    try {
        response = await fetch('/api/characters/state/get', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ avatar_url: safeAvatar, namespace: safeNamespace }),
            cache: 'no-cache',
        });
    } catch (error) {
        return { ok: false, state: null,
            reason: STATE_ERROR_REASONS.TRANSPORT_ERROR,
            hint: formatTransportErrorHint(error?.message || error) };
    }
    if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        return { ok: false, state: null,
            reason: STATE_ERROR_REASONS.HTTP_ERROR,
            hint: formatHttpErrorHint(response.status, response.statusText, bodyText) };
    }
    const payload = await response.json().catch(() => null);
    const state = payload && typeof payload === 'object' ? payload.data : null;
    return { ok: true, state };
}

/**
 * Write character-level sidecar state for a given namespace.
 * Pass null as data to delete the sidecar entry.
 * @param {string} avatar - Character avatar filename (e.g. 'xxx.png')
 * @param {string} namespace - Storage namespace (e.g. 'my_extension')
 * @param {any} data - Data to store (or null to delete)
 * @returns {Promise<{ok: boolean, state?: any, reason?: string, hint?: string}>}
 *          Envelope: `{ok: true, state}` on success; `{ok: false, reason, hint}` on failure.
 */
export async function setCharacterState(avatar, namespace, data) {
    if (nativeSessionRuntime.active) return { ok: false, state: null, reason: 'native_state_integration_pending' };
    const safeAvatar = String(avatar || '').trim();
    const safeNamespace = String(namespace || '').trim();
    if (!safeAvatar) {
        return makeStateError(STATE_ERROR_REASONS.VALIDATION_ARGS,
            formatValidationArgsHint('avatar', 'is required'));
    }
    if (!safeNamespace) {
        return makeStateError(STATE_ERROR_REASONS.VALIDATION_ARGS,
            formatValidationArgsHint('namespace', 'is required'));
    }
    let response;
    try {
        response = await fetch('/api/characters/state/set', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ avatar_url: safeAvatar, namespace: safeNamespace, data }),
            cache: 'no-cache',
        });
    } catch (error) {
        return makeStateError(STATE_ERROR_REASONS.TRANSPORT_ERROR,
            formatTransportErrorHint(error?.message || error));
    }
    if (response.ok) return makeStateOk({ state: data });
    const bodyText = await response.text().catch(() => '');
    return makeStateError(STATE_ERROR_REASONS.HTTP_ERROR,
        formatHttpErrorHint(response.status, response.statusText, bodyText));
}

/**
 * Apply RFC 6902 JSON Patch operations to a character state sidecar.
 * The server reads the current sidecar, applies the operations, and writes
 * the result back atomically. Returns an envelope; on success `applied` is
 * the count of ops applied and `created` is true when the sidecar did not
 * previously exist (seeded from `{}`).
 *
 * Returns `{ok: false, reason: CONFLICT}` when the server returns 409
 * (patch test/missing-parent failures — treat as "another writer changed
 * the sidecar; retry"). Returns `{ok: false, reason: HTTP_ERROR}` for other
 * non-2xx responses (e.g. 400 on malformed operations).
 *
 * @param {string} avatar - Character avatar filename
 * @param {string} namespace - Storage namespace
 * @param {Array<object>} operations - RFC 6902 patch operations
 * @returns {Promise<{ok: boolean, applied?: number, created?: boolean, reason?: string, hint?: string}>}
 */
export async function patchCharacterState(avatar, namespace, operations) {
    if (nativeSessionRuntime.active) return { ok: false, state: null, reason: 'native_state_integration_pending' };
    const safeAvatar = String(avatar || '').trim();
    const safeNamespace = String(namespace || '').trim();
    if (!safeAvatar) {
        return makeStateError(STATE_ERROR_REASONS.VALIDATION_ARGS,
            formatValidationArgsHint('avatar', 'is required'));
    }
    if (!safeNamespace) {
        return makeStateError(STATE_ERROR_REASONS.VALIDATION_ARGS,
            formatValidationArgsHint('namespace', 'is required'));
    }
    if (!Array.isArray(operations) || operations.length === 0) {
        return makeStateError(STATE_ERROR_REASONS.VALIDATION_ARGS,
            formatValidationArgsHint('operations', 'must be a non-empty array'));
    }
    let response;
    try {
        response = await fetch('/api/characters/state/patch', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ avatar_url: safeAvatar, namespace: safeNamespace, operations }),
            cache: 'no-cache',
        });
    } catch (error) {
        return makeStateError(STATE_ERROR_REASONS.TRANSPORT_ERROR,
            formatTransportErrorHint(error?.message || error));
    }
    if (response.ok) {
        const result = await response.json().catch(() => null);
        return makeStateOk({
            applied: Number(result?.applied) || 0,
            created: Boolean(result?.created),
        });
    }
    if (response.status === 409) {
        return makeStateError(STATE_ERROR_REASONS.CONFLICT, formatConflictHint(0));
    }
    const bodyText = await response.text().catch(() => '');
    return makeStateError(STATE_ERROR_REASONS.HTTP_ERROR,
        formatHttpErrorHint(response.status, response.statusText, bodyText));
}

/**
 * Read multiple character state namespaces in one round trip. Returns an
 * envelope with a per-namespace results map. Missing namespaces map to
 * `{ok: true, state: null}` (treated as empty miss). Top-level `ok` reflects
 * whole-batch transport/validation success.
 *
 * @param {string} avatar - Character avatar filename
 * @param {string[]} namespaces - Storage namespaces to read
 * @returns {Promise<{ok: boolean, results: Map<string, {ok: boolean, state: object|null, reason?: string, hint?: string}>, reason?: string, hint?: string}>}
 */
export async function getCharacterStateBatch(avatar, namespaces) {
    if (nativeSessionRuntime.active) return { ok: false, results: new Map(), reason: 'native_state_integration_pending' };
    const safeAvatar = String(avatar || '').trim();
    if (!safeAvatar) {
        return { ok: false, results: new Map(),
            reason: STATE_ERROR_REASONS.VALIDATION_ARGS,
            hint: formatValidationArgsHint('avatar', 'is required') };
    }
    const cleaned = Array.from(new Set(
        (Array.isArray(namespaces) ? namespaces : [])
            .map(n => String(n || '').trim())
            .filter(Boolean),
    ));
    if (cleaned.length === 0) {
        return { ok: true, results: new Map() };
    }

    let response;
    try {
        response = await fetch('/api/characters/state/get-batch', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ avatar_url: safeAvatar, namespaces: cleaned }),
            cache: 'no-cache',
        });
    } catch (error) {
        return { ok: false, results: new Map(),
            reason: STATE_ERROR_REASONS.TRANSPORT_ERROR,
            hint: formatTransportErrorHint(error?.message || error) };
    }
    if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        return { ok: false, results: new Map(),
            reason: STATE_ERROR_REASONS.HTTP_ERROR,
            hint: formatHttpErrorHint(response.status, response.statusText, bodyText) };
    }
    const payload = await response.json().catch(() => null);
    const data = (payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object')
        ? payload.data : {};

    const results = new Map();
    for (const ns of cleaned) {
        const raw = Object.prototype.hasOwnProperty.call(data, ns) ? data[ns] : null;
        results.set(ns, { ok: true, state: raw });
    }
    return { ok: true, results };
}

/**
 * Read-modify-write helper for character state. The `updater` receives a
 * deep clone of the current sidecar (`{}` when none exists) and must return
 * the next state. The diff is computed with `buildObjectPatchOperationsAsync`
 * and shipped through `patchCharacterState` — only the changed slice crosses
 * the wire, not the whole document.
 *
 * Use this in preference to `setCharacterState` for any non-trivial payload.
 * Returning `null` / `undefined` from the updater is treated as "no change"
 * and resolves with `updated: false`.
 *
 * On a 409 (concurrent edit) the helper re-reads the sidecar and re-runs the
 * updater. The retry budget is controlled by `options.maxRetries` (default 1,
 * i.e. one re-attempt after the initial try). All failures — transport, HTTP,
 * conflict-after-retries, validation, reducer-throw — surface as `{ok: false,
 * reason, hint}` envelopes; this helper does not throw.
 *
 * @param {string} avatar - Character avatar filename
 * @param {string} namespace - Storage namespace
 * @param {(currentState: object, meta: { attempt: number, avatar: string, namespace: string }) => (object|null|undefined|Promise<object|null|undefined>)} updater
 * @param {object} [options]
 * @param {number} [options.maxOperations] - Cap on patch op count before falling back to a single replace op. Default 2000.
 * @param {number} [options.maxRetries] - Re-attempts on 409. Default 1.
 * @param {boolean} [options.asyncDiff] - When `false`, use the sync diff path (skips the worker).
 * @returns {Promise<{ok: boolean, state?: object|null, updated?: boolean, created?: boolean, reason?: string, hint?: string}>}
 */
export async function updateCharacterState(avatar, namespace, updater, options = {}) {
    if (nativeSessionRuntime.active) return { ok: false, state: null, reason: 'native_state_integration_pending' };
    const safeAvatar = String(avatar || '').trim();
    const safeNamespace = String(namespace || '').trim();
    if (!safeAvatar || !safeNamespace || typeof updater !== 'function') {
        return makeStateError(STATE_ERROR_REASONS.VALIDATION_ARGS,
            formatValidationArgsHint(!safeAvatar ? 'avatar' : !safeNamespace ? 'namespace' : 'updater',
                'is required / must be a function'));
    }

    const maxOperations = Number.isInteger(options?.maxOperations) && options.maxOperations > 0
        ? Number(options.maxOperations) : 2000;
    const maxRetries = Number.isInteger(options?.maxRetries) && options.maxRetries >= 0
        ? Number(options.maxRetries) : 1;

    let lastFailure = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const readResult = await getCharacterState(safeAvatar, safeNamespace);
        if (!readResult.ok) {
            return { ok: false, reason: readResult.reason, hint: readResult.hint };
        }
        const currentRaw = readResult.state;
        const currentState = (currentRaw != null && typeof currentRaw === 'object' && !Array.isArray(currentRaw))
            ? cloneJsonValue(currentRaw) : {};
        let nextRaw;
        try {
            nextRaw = await updater(cloneJsonValue(currentState), {
                attempt, avatar: safeAvatar, namespace: safeNamespace,
            });
        } catch (reducerError) {
            return makeStateError(
                STATE_ERROR_REASONS.VALIDATION_ARGS,
                `reducer threw: ${String(reducerError?.message || reducerError).slice(0, 80)}`,
            );
        }
        if (nextRaw === undefined || nextRaw === null) {
            return makeStateOk({ state: currentState, updated: false });
        }
        if (!(nextRaw && typeof nextRaw === 'object' && !Array.isArray(nextRaw))) {
            return makeStateError(STATE_ERROR_REASONS.VALIDATION_ARGS,
                'updater must return a plain object (or null/undefined to skip)');
        }
        const nextState = cloneJsonValue(nextRaw);
        const operations = options?.asyncDiff === false
            ? buildObjectPatchOperations(currentState, nextState, { maxOperations })
            : await buildObjectPatchOperationsAsync(currentState, nextState, { maxOperations });
        if (operations.length === 0) {
            return makeStateOk({ state: nextState, updated: false });
        }

        const patchResult = await patchCharacterState(safeAvatar, safeNamespace, operations);
        if (patchResult.ok) {
            return makeStateOk({
                state: nextState, updated: true, created: Boolean(patchResult.created),
            });
        }
        lastFailure = patchResult;
        if (patchResult.reason !== STATE_ERROR_REASONS.CONFLICT) return patchResult;
    }
    return lastFailure ?? makeStateError(STATE_ERROR_REASONS.CONFLICT, formatConflictHint(maxRetries));
}

/**
 * Remove a per-character state sidecar entry entirely. Use when an
 * adapter wants to wipe a legacy namespace; `setCharacterState(...null)`
 * is rejected by the server (the /state/set endpoint requires an object).
 *
 * @param {string} avatar
 * @param {string} namespace
 * @returns {Promise<{ok: boolean, reason?: string, hint?: string}>}
 */
export async function deleteCharacterState(avatar, namespace) {
    if (nativeSessionRuntime.active) return { ok: false, state: null, reason: 'native_state_integration_pending' };
    const safeAvatar = String(avatar || '').trim();
    const safeNamespace = String(namespace || '').trim();
    if (!safeAvatar || !safeNamespace) {
        return makeStateError(STATE_ERROR_REASONS.VALIDATION_ARGS,
            formatValidationArgsHint(!safeAvatar ? 'avatar' : 'namespace', 'is required'));
    }
    let response;
    try {
        response = await fetch('/api/characters/state/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ avatar_url: safeAvatar, namespace: safeNamespace }),
            cache: 'no-cache',
        });
    } catch (error) {
        return makeStateError(STATE_ERROR_REASONS.TRANSPORT_ERROR,
            formatTransportErrorHint(error?.message || error));
    }
    if (response.ok) return makeStateOk();
    const bodyText = await response.text().catch(() => '');
    return makeStateError(STATE_ERROR_REASONS.HTTP_ERROR,
        formatHttpErrorHint(response.status, response.statusText, bodyText));
}

/**
 * @typedef {object} BulkExtensionFieldResult
 * @property {string[]} updated  Avatar filenames that were successfully updated
 * @property {string[]} skipped  Avatar filenames skipped (filter didn't match or unreadable)
 * @property {string[]} failed   Avatar filenames where the update failed
 */

/**
 * Writes (or deletes) an extension field for multiple characters in a
 * single bulk request. Like {@link writeExtensionField}, this uses
 * replace semantics — the `value` argument becomes the full
 * `data.extensions[key]` on each matching card, with no preservation
 * of stale sibling subkeys.
 *
 * When `value` is {@link UNSET_VALUE} the extension key is **deleted**
 * from each matching character card. Passing `null` sets the field to
 * `null` (the key is preserved).
 *
 * @param {string[]|null} avatars Avatar filenames to update. Pass `null` or an
 *   empty array to target **all** characters in the user's character directory.
 * @param {string} key Extension field name (e.g. "greeting_tools")
 * @param {any} value Field value, `null` to set null, or
 *   {@link UNSET_VALUE} to delete the key entirely
 * @param {object} [options={}] Optional settings
 * @param {string} [options.filterPath] Dot-path filter — the server will only
 *   update characters where this path is present and not `undefined`;
 *   `null` still counts as a match. Useful when the frontend has shallow
 *   character data and cannot pre-filter.
 *   Defaults to `data.extensions.<key>` when unsetting, so deletion requests
 *   automatically skip characters where the field is missing/`undefined`.
 * @returns {Promise<BulkExtensionFieldResult>} Summary of the bulk operation
 */
export async function writeExtensionFieldBulk(avatars, key, value, { filterPath } = {}) {
    const context = getContext();
    const extensionPath = `data.extensions.${key}`;
    const isUnset = value === UNSET_VALUE;

    // Build the server request
    const requestBody = {
        avatars: Array.isArray(avatars) && avatars.length > 0 ? avatars : [],
        data: {
            data: {
                extensions: {
                    [key]: value,
                },
            },
        },
        replacePaths: [`data.extensions.${key}`],
    };

    // Default filter: when unsetting, only touch characters that have the field
    const resolvedFilterPath = filterPath ?? (isUnset ? extensionPath : undefined);
    if (resolvedFilterPath) {
        requestBody.filter = { path: resolvedFilterPath };
    }

    const mergeResponse = await fetch('/api/characters/merge-attributes', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(requestBody),
    });

    if (!mergeResponse.ok) {
        console.error('Bulk extension field update failed', mergeResponse.statusText);
        return { updated: [], skipped: [], failed: [] };
    }

    /** @type {BulkExtensionFieldResult} */
    const result = await mergeResponse.json();

    // Sync in-memory character objects for successfully updated characters
    const updatedSet = new Set(result.updated);
    for (const character of context.characters) {
        if (!character || !updatedSet.has(character.avatar)) continue;

        if (isUnset) {
            deleteValueByPath(character, extensionPath);
        } else {
            setValueByPath(character, extensionPath, value);
        }

        // Keep json_data in sync
        if (character.json_data) {
            const jsonData = JSON.parse(character.json_data);
            if (isUnset) {
                deleteValueByPath(jsonData, extensionPath);
            } else {
                setValueByPath(jsonData, extensionPath, value);
            }
            character.json_data = JSON.stringify(jsonData);
        }
    }

    // If the currently active character was updated, sync the hidden input
    if (context.characterId !== undefined) {
        const activeChar = context.characters[context.characterId];
        if (activeChar && updatedSet.has(activeChar.avatar) && activeChar.json_data) {
            $('#character_json_data').val(activeChar.json_data);
        }
    }

    return result;
}
