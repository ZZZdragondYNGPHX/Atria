import { nativeSessionRuntime } from '../../native/session-runtime.js';
import { normalizeRegexPresets } from '../../../shared/regex-presets.js';
/**
 * Regex Core architecture boundary.
 *
 * This module owns string transformation only: matching/replacement,
 * substitution, placement/lane/depth selection, capture handling and the
 * execution diagnostics needed to make those text operations safe.
 *
 * It must not become a world-state owner, Game Runtime, HUD renderer,
 * lifecycle host, or persistence layer for game data. New game behavior
 * belongs under the Game Runtime contracts and may consume ordinary text
 * after Regex has transformed it; Game Runtime must not depend on Regex for
 * authoritative state or UI lifecycle.
 */

import { saveSettingsDebounced, substituteParams, substituteParamsExtended } from '../../../script.js';
import { capabilitySettings } from '../../capability-host.js';
import { t } from '../../i18n.js';
import { regexFromString } from '../../utils.js';
import { isRegexScriptPaused, recordRegexExecution, resetRegexScriptState } from './redos-reporter.js';

/**
 * @readonly
 * @enum {number} Regex scripts types
 */
export const SCRIPT_TYPES = {
    // ORDER MATTERS: defines the regex script priority
    GLOBAL: 0,
};

/**
 * Special type for unknown/invalid script types.
 */
export const SCRIPT_TYPE_UNKNOWN = -1;

/**
 * @type {Readonly<GetRegexScriptsOptions>}
 */
const DEFAULT_GET_REGEX_SCRIPTS_OPTIONS = Object.freeze({ allowedOnly: false });
const REGEX_SCRIPT_TYPE_LABELS = Object.freeze({
    [SCRIPT_TYPES.GLOBAL]: 'global',
    [SCRIPT_TYPE_UNKNOWN]: 'unknown',
});
const warnedInvalidPlacementScripts = new Set();
let shownInvalidPlacementToast = false;
const pendingPersistedRegexScriptCleanups = new Set();

function isPersistedRegexScriptRecord(script) {
    return Boolean(script) && typeof script === 'object' && !Array.isArray(script);
}

function filterValidPersistedRegexScripts(scripts) {
    return Array.isArray(scripts) ? scripts.filter(isPersistedRegexScriptRecord) : [];
}

function getPersistedRegexScriptCleanupKey(scriptType) { return scriptType === SCRIPT_TYPES.GLOBAL ? 'global' : ''; }

function getPersistedRegexScriptCleanupToastMessage() { return t`Global regex entries contained invalid data. Invalid entries were removed automatically. Check the browser console for details.`; }

function schedulePersistedRegexScriptCleanup(scriptType, scripts) {
    const key = getPersistedRegexScriptCleanupKey(scriptType);
    if (!key || pendingPersistedRegexScriptCleanups.has(key)) return;
    pendingPersistedRegexScriptCleanups.add(key);
    if (typeof toastr !== 'undefined') toastr.error(getPersistedRegexScriptCleanupToastMessage(), t`Regex script error`);
    queueMicrotask(() => { capabilitySettings.regex = filterValidPersistedRegexScripts(scripts); saveSettingsDebounced(); pendingPersistedRegexScriptCleanups.delete(key); });
}

function sanitizePersistedRegexScriptList(scripts, scriptType) {
    if (!Array.isArray(scripts)) {
        return [];
    }

    const invalidEntries = [];
    for (let index = scripts.length - 1; index >= 0; index--) {
        if (isPersistedRegexScriptRecord(scripts[index])) {
            continue;
        }
        invalidEntries.push({ index, type: scripts[index] === null ? 'null' : typeof scripts[index] });
        scripts.splice(index, 1);
    }

    if (invalidEntries.length > 0) {
        console.warn('[Regex] Removed invalid persisted regex entries', {
            scriptType: REGEX_SCRIPT_TYPE_LABELS[scriptType] || String(scriptType),
            invalidEntries,
        });
        schedulePersistedRegexScriptCleanup(scriptType, scripts);
    }

    return scripts;
}

/** @type {Map<string, { provider: (options?: GetRegexScriptsOptions) => RegexScript[] | null | undefined, reloadOnChange: boolean, managedScripts?: Map<string, RegexScript> }>} */
const runtimeRegexProviders = new Map();
export const REGEX_RUNTIME_SCRIPTS_CHANGED_EVENT = 'atria:regex-runtime-scripts-changed';

const REGEX_SCOPE_MASK = Object.freeze({
    MARKDOWN: 1,
    PROMPT: 2,
    PLUGIN: 4,
});
const STATIC_EXECUTION_PLAN_CACHE_MAX = 8;
const EXECUTION_SELECTION_CACHE_MAX = 256;
const staticRegexExecutionPlans = new Map();
let staticRegexExecutionRevision = 0;
let staticRegexExecutionPlanBuilds = 0;

/**
 * Invalidates cached static regex execution plans.
 *
 * Runtime providers are intentionally excluded from this cache because plain
 * provider callbacks are allowed to derive scripts dynamically on every call.
 *
 * @returns {void}
 */
export function invalidateRegexExecutionPlans() {
    staticRegexExecutionRevision += 1;
    staticRegexExecutionPlans.clear();
}

/**
 * @returns {{revision:number, cachedPlans:number, builds:number}}
 */
export function getRegexExecutionPlanStats() {
    return {
        revision: staticRegexExecutionRevision,
        cachedPlans: staticRegexExecutionPlans.size,
        builds: staticRegexExecutionPlanBuilds,
    };
}

function touchBoundedMap(map, key, value, maxSize) {
    if (map.has(key)) {
        map.delete(key);
    }
    map.set(key, value);
    while (map.size > maxSize) {
        const firstKey = map.keys().next().value;
        map.delete(firstKey);
    }
}

function getRegexScriptScopeMask(script) {
    let mask = 0;
    if (script?.markdownOnly) mask |= REGEX_SCOPE_MASK.MARKDOWN;
    if (script?.promptOnly) mask |= REGEX_SCOPE_MASK.PROMPT;
    if (script?.pluginOnly) mask |= REGEX_SCOPE_MASK.PLUGIN;
    return mask;
}

function getRegexRequestScopeMask({ isMarkdown, isPrompt, isPluginPrompt } = {}) {
    let mask = 0;
    if (isMarkdown) mask |= REGEX_SCOPE_MASK.MARKDOWN;
    if (isPrompt) mask |= REGEX_SCOPE_MASK.PROMPT;
    if (isPluginPrompt) mask |= REGEX_SCOPE_MASK.PLUGIN;
    return mask;
}

function regexScriptMatchesScope(script, requestScopeMask) {
    const scriptScopeMask = getRegexScriptScopeMask(script);
    if (scriptScopeMask === 0) {
        return requestScopeMask === 0;
    }
    return (scriptScopeMask & requestScopeMask) !== 0;
}

function regexScriptMatchesDepth(script, depth) {
    if (typeof depth !== 'number') {
        return true;
    }

    if (!isNaN(script.minDepth) && script.minDepth !== null && script.minDepth >= -1 && depth < script.minDepth) {
        return false;
    }

    if (!isNaN(script.maxDepth) && script.maxDepth !== null && script.maxDepth >= 0 && depth > script.maxDepth) {
        return false;
    }

    return true;
}

/**
 * Builds a placement index once for a stable script collection.
 *
 * @param {RegexScript[]} scripts
 * @param {{warnInvalidPlacement?: boolean}} [options]
 * @returns {RegexExecutionPlan}
 */
function createRegexExecutionPlan(scripts, { warnInvalidPlacement = false } = {}) {
    const placementIndex = new Map();
    const uniquePatterns = new Set();
    const source = Array.isArray(scripts) ? scripts : [];

    source.forEach((script, index) => {
        if (!script || typeof script !== 'object' || script.disabled || !script.findRegex) {
            return;
        }

        uniquePatterns.add(String(script.findRegex));

        if (!Array.isArray(script.placement)) {
            if (warnInvalidPlacement) {
                warnInvalidRegexPlacement(script, index);
            }
            return;
        }

        // Current semantics use placement.includes(), so duplicate placement
        // values on one script still execute the script only once.
        for (const placement of new Set(script.placement)) {
            const bucket = placementIndex.get(placement);
            if (bucket) {
                bucket.push(script);
            } else {
                placementIndex.set(placement, [script]);
            }
        }
    });

    return {
        placementIndex,
        selectionCache: new Map(),
        depthSelectionCache: new Map(),
        scriptCount: source.length,
        patternCount: uniquePatterns.size,
    };
}

function getRegexExecutionBaseCandidates(plan, placement, requestScopeMask, isEdit) {
    const key = `${typeof placement}:${String(placement)}|${requestScopeMask}|${isEdit ? 1 : 0}`;
    const cached = plan.selectionCache.get(key);
    if (cached) {
        touchBoundedMap(plan.selectionCache, key, cached, EXECUTION_SELECTION_CACHE_MAX);
        return cached;
    }

    const placementCandidates = plan.placementIndex.get(placement) || [];
    const selected = placementCandidates.filter(script => {
        if (!regexScriptMatchesScope(script, requestScopeMask)) {
            return false;
        }
        if (isEdit && !script.runOnEdit) {
            return false;
        }
        return true;
    });
    touchBoundedMap(plan.selectionCache, key, selected, EXECUTION_SELECTION_CACHE_MAX);
    return selected;
}

function getRegexExecutionCandidates(plan, placement, params = {}) {
    const requestScopeMask = getRegexRequestScopeMask(params);
    const base = getRegexExecutionBaseCandidates(plan, placement, requestScopeMask, Boolean(params?.isEdit));
    const depth = params?.depth;
    if (typeof depth !== 'number') {
        return base;
    }

    const depthKey = `${typeof placement}:${String(placement)}|${requestScopeMask}|${params?.isEdit ? 1 : 0}|d:${String(depth)}`;
    const cached = plan.depthSelectionCache.get(depthKey);
    if (cached) {
        touchBoundedMap(plan.depthSelectionCache, depthKey, cached, EXECUTION_SELECTION_CACHE_MAX);
        return cached;
    }

    const selected = base.filter(script => regexScriptMatchesDepth(script, depth));
    touchBoundedMap(plan.depthSelectionCache, depthKey, selected, EXECUTION_SELECTION_CACHE_MAX);
    return selected;
}

function getStaticRegexExecutionContextKey() { return String(staticRegexExecutionRevision); }

function getStaticRegexExecutionPlan() {
    const key = getStaticRegexExecutionContextKey();
    const cached = staticRegexExecutionPlans.get(key);
    if (cached) {
        touchBoundedMap(staticRegexExecutionPlans, key, cached, STATIC_EXECUTION_PLAN_CACHE_MAX);
        return cached;
    }

    const scripts = Object.values(SCRIPT_TYPES)
        .flatMap(type => getScriptsByType(type, { allowedOnly: true }));
    const plan = createRegexExecutionPlan(scripts, { warnInvalidPlacement: true });
    RegexProvider.instance.reserve(plan.patternCount);
    staticRegexExecutionPlanBuilds += 1;
    touchBoundedMap(staticRegexExecutionPlans, key, plan, STATIC_EXECUTION_PLAN_CACHE_MAX);
    return plan;
}

/**
 * @param {{ requestReload?: boolean }} [options]
 * @returns {void}
 */
export function notifyRuntimeRegexScriptsChanged(options = {}) {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
        return;
    }
    if (typeof CustomEvent === 'undefined') {
        return;
    }
    window.dispatchEvent(new CustomEvent(REGEX_RUNTIME_SCRIPTS_CHANGED_EVENT, {
        detail: {
            requestReload: Boolean(options?.requestReload),
        },
    }));
}

/**
 * @param {string} ownerId
 * @param {{ provider: (options?: GetRegexScriptsOptions) => RegexScript[] | null | undefined, reloadOnChange: boolean, managedScripts?: Map<string, RegexScript> }} entry
 * @returns {RuntimeRegexProviderRegistration}
 */
function createRuntimeRegexProviderRegistration(ownerId, entry) {
    return {
        owner: ownerId,
        refresh(options = {}) {
            if (runtimeRegexProviders.get(ownerId) !== entry) {
                return;
            }
            notifyRuntimeRegexScriptsChanged({ requestReload: Boolean(options?.requestReload) });
        },
        unregister() {
            if (runtimeRegexProviders.get(ownerId) !== entry) {
                return;
            }
            if (entry.managedScripts instanceof Map) {
                for (const scriptId of entry.managedScripts.keys()) {
                    resetRegexScriptState(scriptId);
                }
            }
            runtimeRegexProviders.delete(ownerId);
            notifyRuntimeRegexScriptsChanged({ requestReload: entry.reloadOnChange });
        },
    };
}

/**
 * @param {RegexScript} script
 * @param {string} ownerId
 * @returns {RegexScript | null}
 */
function normalizeManagedRuntimeRegexScript(script, ownerId) {
    if (!script || typeof script !== 'object') {
        console.warn(`registerManagedRegexProvider: owner "${ownerId}" received a non-object script; skipped.`);
        return null;
    }
    const scriptId = String(script.id || '').trim();
    if (!scriptId) {
        console.warn(`registerManagedRegexProvider: owner "${ownerId}" received a script without id; skipped.`);
        return null;
    }
    const scriptName = String(script.scriptName || '').trim();
    if (!scriptName) {
        console.warn(`registerManagedRegexProvider: owner "${ownerId}" received a script without scriptName; skipped.`);
        return null;
    }
    return {
        ...script,
        id: scriptId,
        scriptName,
    };
}

/**
 * Creates and registers a managed runtime regex provider backed by engine-owned script storage.
 * This is useful for plugins that want `upsert/remove/set/clear` semantics instead of a pure callback provider.
 *
 * @param {string} owner Unique owner id, usually plugin/module name
 * @param {RuntimeRegexProviderOptions} [options] Provider options
 * @returns {ManagedRuntimeRegexProviderRegistration | null}
 */
export function registerManagedRegexProvider(owner, options = {}) {
    const ownerId = String(owner || '').trim();
    if (!ownerId) {
        console.warn('registerManagedRegexProvider: owner is empty');
        return null;
    }
    const reloadOnChange = Boolean(options?.reloadOnChange);
    const managedScripts = new Map();
    const entry = {
        managedScripts,
        reloadOnChange,
        provider() {
            return Array.from(managedScripts.values(), script => ({ ...script }));
        },
    };
    runtimeRegexProviders.set(ownerId, entry);
    notifyRuntimeRegexScriptsChanged({ requestReload: reloadOnChange });

    const baseRegistration = createRuntimeRegexProviderRegistration(ownerId, entry);
    return {
        ...baseRegistration,
        upsertScript(script, changeOptions = {}) {
            if (runtimeRegexProviders.get(ownerId) !== entry) {
                return false;
            }
            const normalizedScript = normalizeManagedRuntimeRegexScript(script, ownerId);
            if (!normalizedScript) {
                return false;
            }
            managedScripts.set(normalizedScript.id, normalizedScript);
            notifyRuntimeRegexScriptsChanged({ requestReload: Boolean(changeOptions?.requestReload) });
            return true;
        },
        removeScript(scriptId, changeOptions = {}) {
            if (runtimeRegexProviders.get(ownerId) !== entry) {
                return false;
            }
            const normalizedId = String(scriptId || '').trim();
            if (!normalizedId) {
                return false;
            }
            const removed = managedScripts.delete(normalizedId);
            if (removed) {
                resetRegexScriptState(normalizedId);
                notifyRuntimeRegexScriptsChanged({ requestReload: Boolean(changeOptions?.requestReload) });
            }
            return removed;
        },
        setScripts(scripts, changeOptions = {}) {
            if (runtimeRegexProviders.get(ownerId) !== entry) {
                return;
            }
            const nextManagedScripts = new Map();
            for (const script of Array.isArray(scripts) ? scripts : []) {
                const normalizedScript = normalizeManagedRuntimeRegexScript(script, ownerId);
                if (!normalizedScript) {
                    continue;
                }
                nextManagedScripts.set(normalizedScript.id, normalizedScript);
            }
            for (const oldId of managedScripts.keys()) {
                if (!nextManagedScripts.has(oldId)) {
                    resetRegexScriptState(oldId);
                }
            }
            managedScripts.clear();
            for (const [scriptId, normalizedScript] of nextManagedScripts.entries()) {
                managedScripts.set(scriptId, normalizedScript);
            }
            notifyRuntimeRegexScriptsChanged({ requestReload: Boolean(changeOptions?.requestReload) });
        },
        clearScripts(changeOptions = {}) {
            if (runtimeRegexProviders.get(ownerId) !== entry || managedScripts.size === 0) {
                return;
            }
            for (const scriptId of managedScripts.keys()) {
                resetRegexScriptState(scriptId);
            }
            managedScripts.clear();
            notifyRuntimeRegexScriptsChanged({ requestReload: Boolean(changeOptions?.requestReload) });
        },
        getScripts() {
            if (runtimeRegexProviders.get(ownerId) !== entry) {
                return [];
            }
            return Array.from(managedScripts.values(), script => ({ ...script }));
        },
    };
}

/**
 * Warns once per broken script when placement is not a valid array.
 * @param {RegexScript} script The broken regex script
 * @param {number} index Script index
 */
function warnInvalidRegexPlacement(script, index) {
    const scriptName = String(script?.scriptName || '').trim() || `<unnamed #${index}>`;
    const warningKey = `${scriptName}:${index}`;
    if (warnedInvalidPlacementScripts.has(warningKey)) {
        return;
    }
    warnedInvalidPlacementScripts.add(warningKey);
    console.error(`Regex script "${scriptName}" has invalid placement and will be skipped.`);

    if (!shownInvalidPlacementToast && typeof toastr !== 'undefined') {
        shownInvalidPlacementToast = true;
        toastr.error('Some regex scripts are invalid and were skipped. Open Regex Editor to fix or delete them.', 'Regex script error');
    }
}

/**
 * Manages the compiled regex cache with LRU eviction.
 */
export class RegexProvider {
    /** @type {Map<string, RegExp>} */
    #cache = new Map();
    /** @type {number} */
    #maxSize = 1000;
    /** @type {number} */
    #baseMaxSize = 1000;
    /** @type {number} */
    #hardMaxSize = 8192;

    static instance = new RegexProvider();

    /**
     * Grow the cache to cover the active rule set and avoid LRU thrashing
     * when users have more than the historical 1000 compiled patterns.
     * Capacity only grows during the session and remains hard-bounded.
     *
     * @param {number} minimumSize
     * @returns {number} Effective capacity
     */
    reserve(minimumSize) {
        const requested = Number.isFinite(Number(minimumSize))
            ? Math.max(this.#baseMaxSize, Math.ceil(Number(minimumSize)))
            : this.#baseMaxSize;
        this.#maxSize = Math.min(this.#hardMaxSize, Math.max(this.#maxSize, requested));
        return this.#maxSize;
    }

    /**
     * @returns {{size:number, capacity:number}}
     */
    getStats() {
        return { size: this.#cache.size, capacity: this.#maxSize };
    }

    /**
     * Gets a regex instance by its string representation.
     * @param {string} regexString The regex string to retrieve
     * @returns {RegExp?} Compiled regex or null if invalid
     */
    get(regexString) {
        const isCached = this.#cache.has(regexString);
        const regex = isCached
            ? this.#cache.get(regexString)
            : regexFromString(regexString);

        if (!regex) {
            return null;
        }

        if (isCached) {
            // LRU: Move to end by re-inserting
            this.#cache.delete(regexString);
            this.#cache.set(regexString, regex);
        } else {
            // Evict oldest if at capacity
            if (this.#cache.size >= this.#maxSize) {
                const firstKey = this.#cache.keys().next().value;
                this.#cache.delete(firstKey);
            }
            this.#cache.set(regexString, regex);
        }

        // Reset lastIndex for global/sticky regexes
        if (regex.global || regex.sticky) {
            regex.lastIndex = 0;
        }

        return regex;
    }

    /**
     * Clears the entire cache.
     */
    clear() {
        this.#cache.clear();
    }
}

/**
 * Registers an in-memory runtime regex provider.
 * Providers are evaluated on each getRegexScripts() call and are never persisted.
 * Each returned script must include a non-empty `scriptName`.
 *
 * @param {string} owner Unique owner id, usually plugin/module name
 * @param {(options?: GetRegexScriptsOptions) => RegexScript[] | null | undefined} provider Script provider callback
 * @param {RuntimeRegexProviderOptions} [options] Provider options
 * @returns {RuntimeRegexProviderRegistration | null}
 */
export function registerRegexProvider(owner, provider, options = {}) {
    const ownerId = String(owner || '').trim();
    if (!ownerId) {
        console.warn('registerRegexProvider: owner is empty');
        return null;
    }
    if (typeof provider !== 'function') {
        console.warn(`registerRegexProvider: provider for "${ownerId}" is not a function`);
        return null;
    }
    const reloadOnChange = Boolean(options?.reloadOnChange);
    const entry = { provider, reloadOnChange };
    runtimeRegexProviders.set(ownerId, entry);
    notifyRuntimeRegexScriptsChanged({ requestReload: reloadOnChange });
    return createRuntimeRegexProviderRegistration(ownerId, entry);
}

/**
 * Unregisters an in-memory runtime regex provider.
 *
 * @param {string} owner Owner id used during registration
 * @returns {void}
 */
export function unregisterRegexProvider(owner) {
    const ownerId = String(owner || '').trim();
    if (!ownerId) {
        return;
    }
    const runtimeProvider = runtimeRegexProviders.get(ownerId);
    const requestReload = Boolean(runtimeProvider?.reloadOnChange);
    if (runtimeProvider?.managedScripts instanceof Map) {
        for (const scriptId of runtimeProvider.managedScripts.keys()) {
            resetRegexScriptState(scriptId);
        }
    }
    runtimeRegexProviders.delete(ownerId);
    notifyRuntimeRegexScriptsChanged({ requestReload });
}

/**
 * Collects all runtime regex scripts from registered providers.
 * Runtime scripts are shallow-cloned to avoid mutating provider-owned objects.
 *
 * @param {GetRegexScriptsOptions} options Options for retrieving scripts
 * @returns {RegexScript[]}
 */
function collectRuntimeRegexScripts(options = DEFAULT_GET_REGEX_SCRIPTS_OPTIONS) {
    const scripts = [];
    for (const [owner, runtimeProvider] of runtimeRegexProviders.entries()) {
        try {
            const provider = runtimeProvider?.provider;
            const value = provider?.(options);
            if (!Array.isArray(value)) {
                continue;
            }
            for (const script of value) {
                if (!script || typeof script !== 'object') {
                    continue;
                }
                const scriptName = String(script.scriptName || '').trim();
                if (!scriptName) {
                    console.warn(`collectRuntimeRegexScripts: provider "${owner}" returned a script without scriptName; skipped.`);
                    continue;
                }
                scripts.push({ ...script, scriptName, __runtime_owner: owner });
            }
        } catch (error) {
            console.error(`collectRuntimeRegexScripts: provider "${owner}" failed`, error);
        }
    }
    return scripts;
}

/**
 * Returns runtime regex scripts provided by plugins/scripts.
 * This is for read-only UI/debug display and should not be used for persistence writes.
 *
 * @param {GetRegexScriptsOptions} options Options for retrieving scripts
 * @returns {RegexScript[]}
 */
export function getRuntimeRegexScripts(options = DEFAULT_GET_REGEX_SCRIPTS_OPTIONS) {
    return collectRuntimeRegexScripts(options);
}

/**
 * Retrieves the list of regex scripts by combining account rules, registered Plugin rules and exact Native Session rules
 *
 * @param {GetRegexScriptsOptions} options Options for retrieving the regex scripts
 * @returns {RegexScript[]} An array of regex scripts, where each script is an object containing the necessary information.
 */
export function getNativeRegexScripts() {
    const source = nativeSessionRuntime.snapshot?.manifest;
    return nativeSessionRuntime.regexScripts().map((script, index) => ({ ...script,
        id: script.id || `native-regex:${source?.packageId}:${source?.version}:${index}`,
        __runtime_owner: 'Native Package · ' + (source?.name || source?.packageId || '') + ' · ' + (source?.version || ''),
    }));
}

export function getRegexScripts(options = DEFAULT_GET_REGEX_SCRIPTS_OPTIONS) {
    return [
        ...Object.values(SCRIPT_TYPES).flatMap(type => getScriptsByType(type, options)),
        ...collectRuntimeRegexScripts(options),
        ...getNativeRegexScripts(),
    ];
}

/**
 * Returns conservative diagnostics for duplicate and same-pattern rules.
 *
 * The engine never auto-removes or reorders these rules because sequential
 * regex replacement is order-sensitive; diagnostics are advisory only.
 *
 * @param {RegexScript[]} [scripts]
 * @returns {{duplicates:Array<{signature:string, scripts:RegexScript[]}>, conflicts:Array<{pattern:string, scripts:RegexScript[]}>}}
 */
export function getRegexScriptDiagnostics(scripts = getRegexScripts({ allowedOnly: true })) {
    const source = Array.isArray(scripts)
        ? scripts.filter(script => script && typeof script === 'object' && !script.disabled && script.findRegex)
        : [];
    const duplicateGroups = new Map();
    const patternGroups = new Map();

    const normalizedPlacements = script => Array.isArray(script.placement)
        ? [...new Set(script.placement)]
        : [];
    const behaviorSignature = script => JSON.stringify({
        replaceString: script.replaceString ?? '',
        trimStrings: Array.isArray(script.trimStrings) ? script.trimStrings : [],
    });

    for (const script of source) {
        const placements = normalizedPlacements(script)
            .sort((a, b) => `${typeof a}:${String(a)}`.localeCompare(`${typeof b}:${String(b)}`));
        const signature = JSON.stringify({
            findRegex: script.findRegex ?? '',
            replaceString: script.replaceString ?? '',
            trimStrings: Array.isArray(script.trimStrings) ? script.trimStrings : [],
            placement: placements,
            markdownOnly: Boolean(script.markdownOnly),
            promptOnly: Boolean(script.promptOnly),
            pluginOnly: Boolean(script.pluginOnly),
            runOnEdit: Boolean(script.runOnEdit),
            minDepth: script.minDepth ?? null,
            maxDepth: script.maxDepth ?? null,
            substituteRegex: Number(script.substituteRegex ?? substitute_find_regex.NONE),
        });
        const duplicateBucket = duplicateGroups.get(signature);
        if (duplicateBucket) duplicateBucket.push(script);
        else duplicateGroups.set(signature, [script]);

        const patternKey = JSON.stringify({
            findRegex: script.findRegex ?? '',
            substituteRegex: Number(script.substituteRegex ?? substitute_find_regex.NONE),
        });
        const patternBucket = patternGroups.get(patternKey);
        if (patternBucket) patternBucket.push(script);
        else patternGroups.set(patternKey, [script]);
    }

    const duplicates = [];
    for (const [signature, group] of duplicateGroups.entries()) {
        if (group.length > 1) {
            duplicates.push({ signature, scripts: group });
        }
    }

    const conflicts = [];
    for (const [pattern, group] of patternGroups.entries()) {
        if (group.length < 2) continue;

        // Bucket by atomic execution domain instead of comparing every pair.
        // This stays close to O(n) even when hundreds of rules share one
        // pattern, which is exactly the pathological case this diagnostic is
        // meant to surface.
        const domainBuckets = new Map();
        for (const script of group) {
            const scopeMask = getRegexScriptScopeMask(script);
            const scopes = scopeMask === 0
                ? [0]
                : [REGEX_SCOPE_MASK.MARKDOWN, REGEX_SCOPE_MASK.PROMPT, REGEX_SCOPE_MASK.PLUGIN]
                    .filter(scope => (scopeMask & scope) !== 0);
            for (const placement of normalizedPlacements(script)) {
                const placementKey = `${typeof placement}:${String(placement)}`;
                for (const scope of scopes) {
                    const domainKey = `${placementKey}|${scope}`;
                    const bucket = domainBuckets.get(domainKey);
                    if (bucket) bucket.push(script);
                    else domainBuckets.set(domainKey, [script]);
                }
            }
        }

        const involved = new Set();
        for (const bucket of domainBuckets.values()) {
            if (bucket.length < 2) continue;
            const behaviors = new Set(bucket.map(behaviorSignature));
            if (behaviors.size < 2) continue;
            for (const script of bucket) {
                involved.add(script);
            }
        }

        if (involved.size > 1) {
            conflicts.push({
                pattern,
                scripts: group.filter(script => involved.has(script)),
            });
        }
    }

    const inventory = filterValidPersistedRegexScripts(scripts).map((script, index) => ({
        id: script.id, name: script.scriptName, order: index, source: script.__runtime_owner || 'account',
        reason: script.disabled ? 'disabled' : isRegexScriptPaused(script.id) ? 'paused' : !script.findRegex ? 'empty_pattern' : !normalizedPlacements(script).length ? 'missing_placement' : 'eligible',
        placement: normalizedPlacements(script),
    }));
    return { duplicates, conflicts, inventory };
}

/**
 * Retrieves the regex scripts for a specific type.
 * @param {SCRIPT_TYPES} scriptType The type of regex scripts to retrieve.
 * @param {GetRegexScriptsOptions} options Options for retrieving the regex scripts
 * @returns {RegexScript[]} An array of regex scripts for the specified type.
 */
export function getScriptsByType(scriptType) { return scriptType === SCRIPT_TYPES.GLOBAL ? sanitizePersistedRegexScriptList(capabilitySettings.regex ?? [], SCRIPT_TYPES.GLOBAL) : []; }

/**
 * Saves an array of regex scripts for a specific type.
 * @param {RegexScript[]} scripts An array of regex scripts to save.
 * @param {SCRIPT_TYPES} scriptType The type of regex scripts to save.
 * @returns {Promise<void>}
 */
export async function saveScriptsByType(scripts, scriptType) {
    if (scriptType !== SCRIPT_TYPES.GLOBAL) throw new TypeError('Only account Regex rules are writable');
    capabilitySettings.regex = filterValidPersistedRegexScripts(scripts);
    capabilitySettings.regex_presets = normalizeRegexPresets(capabilitySettings.regex_presets, capabilitySettings.regex);
    invalidateRegexExecutionPlans(); saveSettingsDebounced();
}

/**
 * @readonly
 * @enum {number} Where the regex script should be applied
 */
export const regex_placement = {
    /**
     * @deprecated MD Display is deprecated. Do not use.
     */
    MD_DISPLAY: 0,
    USER_INPUT: 1,
    AI_OUTPUT: 2,
    SLASH_COMMAND: 3,
    // 4 - sendAs (legacy)
    WORLD_INFO: 5,
    REASONING: 6,
};

/**
 * @readonly
 * @enum {number} How to substitute parameters in the find regex
 */
export const substitute_find_regex = {
    NONE: 0,
    RAW: 1,
    ESCAPED: 2,
};

function sanitizeRegexMacro(x) {
    return (x && typeof x === 'string') ?
        x.replaceAll(/[\n\r\t\v\f\0.^$*+?{}[\]\\/|()]/gs, function (s) {
            switch (s) {
                case '\n':
                    return '\\n';
                case '\r':
                    return '\\r';
                case '\t':
                    return '\\t';
                case '\v':
                    return '\\v';
                case '\f':
                    return '\\f';
                case '\0':
                    return '\\0';
                default:
                    return '\\' + s;
            }
        }) : x;
}

/**
 * Parent function to fetch a regexed version of a raw string
 * @param {string} rawString The raw string to be regexed
 * @param {regex_placement} placement The placement of the string
 * @param {RegexParams} params The parameters to use for the regex script
 * @returns {string} The regexed string
 * @typedef {{characterOverride?: string, isMarkdown?: boolean, isPrompt?: boolean, isPluginPrompt?: boolean, isEdit?: boolean, depth?: number }} RegexParams The parameters to use for the regex script
 */
export function getRegexedString(rawString, placement, { characterOverride, isMarkdown, isPrompt, isPluginPrompt, isEdit, depth } = {}) {
    // WTF have you passed me?
    if (typeof rawString !== 'string') {
        console.warn('getRegexedString: rawString is not a string. Returning empty string.');
        return '';
    }

    let finalString = rawString;
    if (capabilitySettings.disabledPlugins.includes('regex') || !rawString || placement === undefined) {
        return finalString;
    }

    const executionParams = { isMarkdown, isPrompt, isPluginPrompt, isEdit, depth };
    const staticPlan = getStaticRegexExecutionPlan();
    const staticCandidates = getRegexExecutionCandidates(staticPlan, placement, executionParams);

    // Runtime provider callbacks and the active Native Package projection
    // are dynamic by contract. Evaluate them on every call, but still narrow
    // them by placement/lane before execution. Keep the same ordering exposed
    // by getRegexScripts(): registered runtime providers first, Native Package
    // processors last.
    const runtimeScripts = [
        ...collectRuntimeRegexScripts({ allowedOnly: true }),
        ...getNativeRegexScripts(),
    ];
    const runtimeCandidates = runtimeScripts.length > 0
        ? getRegexExecutionCandidates(
            createRegexExecutionPlan(runtimeScripts, { warnInvalidPlacement: true }),
            placement,
            executionParams,
        )
        : [];

    const runCandidates = candidates => {
        for (const script of candidates) {
            if (isRegexScriptPaused(script.id)) {
                continue;
            }
            const __regexStart = performance.now();
            finalString = runRegexScript(script, finalString, { characterOverride });
            const __regexElapsed = performance.now() - __regexStart;
            recordRegexExecution(script, __regexElapsed);
        }
    };

    // Preserve the historical ordering exactly without allocating a joined
    // candidate array on every processed string.
    runCandidates(staticCandidates);
    runCandidates(runtimeCandidates);

    return finalString;
}

/**
 * Runs the provided regex script on the given string
 * @param {RegexScript} regexScript The regex script to run
 * @param {string} rawString The string to run the regex script on
 * @param {RegexScriptParams} params The parameters to use for the regex script
 * @returns {string} The new string
 * @typedef {{characterOverride?: string}} RegexScriptParams The parameters to use for the regex script
 */
export function runRegexScript(regexScript, rawString, { characterOverride } = {}) {
    let newString = rawString;
    if (!regexScript || !!(regexScript.disabled) || !regexScript?.findRegex || !rawString) {
        return newString;
    }

    const getRegexString = () => {
        switch (Number(regexScript.substituteRegex)) {
            case substitute_find_regex.NONE:
                return regexScript.findRegex;
            case substitute_find_regex.RAW:
                return substituteParamsExtended(regexScript.findRegex);
            case substitute_find_regex.ESCAPED:
                return substituteParamsExtended(regexScript.findRegex, {}, sanitizeRegexMacro);
            default:
                console.warn(`runRegexScript: Unknown substituteRegex value ${regexScript.substituteRegex}. Using raw regex.`);
                return regexScript.findRegex;
        }
    };
    const regexString = getRegexString();
    const findRegex = RegexProvider.instance.get(regexString);

    // The user skill issued. Return with nothing.
    if (!findRegex) {
        return newString;
    }

    // Normalize the static replacement template once per script execution,
    // not once per regex match. Large global matches can invoke the callback
    // thousands of times.
    const replaceString = regexScript.replaceString.replace(/{{match}}/gi, '$0');
    const hasCaptureSubstitutions = /\$(\d+)|\$<([^>]+)>/.test(replaceString);

    // Run replacement. Currently does not support the Overlay strategy
    newString = rawString.replace(findRegex, function (match) {
        let replaceWithGroups = replaceString;
        if (hasCaptureSubstitutions) {
            const args = [...arguments];
            replaceWithGroups = replaceString.replaceAll(/\$(\d+)|\$<([^>]+)>/g, (_, num, groupName) => {
                let capturedMatch = match;
                if (num) {
                    // Handle numbered capture groups ($1, $2, etc.)
                    capturedMatch = args[Number(num)];
                } else if (groupName) {
                    // Handle named capture groups ($<name>)
                    const groups = args[args.length - 1];
                    capturedMatch = groups && typeof groups === 'object' && groups[groupName];
                }

                // No match found - return the empty string
                if (!capturedMatch) {
                    return '';
                }

                // Remove trim strings from the match
                return filterString(capturedMatch, regexScript.trimStrings, { characterOverride });
            });
        }

        // Substitute at the end
        return substituteParams(replaceWithGroups);
    });

    return newString;
}

/**
 * Filters anything to trim from the regex match
 * @param {string} rawString The raw string to filter
 * @param {string[]} trimStrings The strings to trim
 * @param {RegexScriptParams} params The parameters to use for the regex filter
 * @returns {string} The filtered string
 */
function filterString(rawString, trimStrings, { characterOverride } = {}) {
    let finalString = rawString;
    trimStrings.forEach((trimString) => {
        const subTrimString = substituteParams(trimString, { name2Override: characterOverride });
        finalString = finalString.replaceAll(subTrimString, '');
    });

    return finalString;
}
