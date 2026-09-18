// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure W-04/W-05 World Info selection helpers. No persistence or model I/O.

const MAX_DEPENDENCY_DEPTH = 24;
const MIN_STATIC_KEY_LENGTH = 3;
const BUDGET_TIERS = Object.freeze(['critical', 'scene', 'normal', 'optional']);
const BUDGET_TIER_SCORE = Object.freeze({ critical: 300, scene: 200, normal: 100, optional: 0 });

export const WORLD_INFO_BUDGET_TIERS = BUDGET_TIERS;

function asStringArray(value, limit = 64) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, limit).map(item => String(item ?? '').trim()).filter(Boolean);
}

export function getWorldInfoEntryKey(entry) {
    const world = String(entry?.world ?? '').trim();
    const uid = Number(entry?.uid);
    return world && Number.isInteger(uid) ? world + '.' + uid : '';
}

export function normalizeWorldInfoEntryRef(value, defaultWorld = '') {
    let world = String(defaultWorld ?? '').trim();
    let uid = null;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        world = String(value.world ?? world).trim();
        uid = Number(value.uid);
    } else if (Number.isInteger(value)) {
        uid = Number(value);
    } else {
        const raw = String(value ?? '').trim();
        if (!raw) return null;
        const split = raw.lastIndexOf('#');
        if (split > 0) {
            world = raw.slice(0, split).trim();
            uid = Number(raw.slice(split + 1));
        } else {
            uid = Number(raw);
        }
    }
    if (!world || !Number.isInteger(uid) || uid < 0) return null;
    return { world, uid, key: world + '.' + uid, ref: world + '#' + uid };
}

export function normalizeWorldInfoSelectionMetadata(entry) {
    const budgetTier = BUDGET_TIERS.includes(entry?.budgetTier) ? entry.budgetTier : 'normal';
    return {
        requiredEntries: asStringArray(entry?.requiredEntries),
        relatedEntries: asStringArray(entry?.relatedEntries),
        mutualExclusionGroup: String(entry?.mutualExclusionGroup ?? '').trim(),
        budgetTier,
        compactContent: typeof entry?.compactContent === 'string' ? entry.compactContent : '',
    };
}

export function hasWorldInfoSelectionMetadata(entry) {
    const meta = normalizeWorldInfoSelectionMetadata(entry);
    return meta.requiredEntries.length > 0
        || meta.relatedEntries.length > 0
        || Boolean(meta.mutualExclusionGroup)
        || meta.budgetTier !== 'normal'
        || Boolean(meta.compactContent.trim());
}

export function getWorldInfoBudgetTierScore(entry) {
    return BUDGET_TIER_SCORE[normalizeWorldInfoSelectionMetadata(entry).budgetTier] ?? BUDGET_TIER_SCORE.normal;
}

function isRegexKey(key) {
    const raw = String(key ?? '').trim();
    if (raw.length < 2 || raw[0] !== '/') return false;
    return raw.lastIndexOf('/') > 0;
}

function isDynamicKey(key) {
    const raw = String(key ?? '');
    return raw.includes('{{') || raw.includes('<%') || raw.includes('$' + '{');
}

function normalizeAnchor(value) {
    return String(value ?? '').toLocaleLowerCase();
}

function makeTrigrams(value) {
    const text = normalizeAnchor(value);
    const result = new Set();
    if (text.length < MIN_STATIC_KEY_LENGTH) return result;
    for (let i = 0; i <= text.length - MIN_STATIC_KEY_LENGTH; i++) {
        result.add(text.slice(i, i + MIN_STATIC_KEY_LENGTH));
    }
    return result;
}

function getEntryScanSignature(entry) {
    return JSON.stringify([
        entry?.scanDepth ?? null,
        Boolean(entry?.matchPersonaDescription),
        Boolean(entry?.matchCharacterDescription),
        Boolean(entry?.matchCharacterPersonality),
        Boolean(entry?.matchCharacterDepthPrompt),
        Boolean(entry?.matchScenario),
        Boolean(entry?.matchCreatorNotes),
    ]);
}

function getIndexability(entry) {
    if (!entry || typeof entry !== 'object') return { indexable: false, reason: 'invalid_entry' };
    if (entry.constant === true) return { indexable: false, reason: 'constant' };
    if (entry.stateActivation === true) return { indexable: false, reason: 'state_activation' };
    if (entry.vectorized === true) return { indexable: false, reason: 'vectorized' };
    if (Number(entry.sticky) > 0) return { indexable: false, reason: 'timed_sticky' };
    if (Array.isArray(entry.decorators) && entry.decorators.includes('@@activate')) {
        return { indexable: false, reason: 'activate_decorator' };
    }
    if (!Array.isArray(entry.key) || entry.key.length === 0) {
        return { indexable: false, reason: 'no_primary_keys' };
    }

    const anchors = [];
    for (const value of entry.key) {
        const key = String(value ?? '').trim();
        if (!key) return { indexable: false, reason: 'empty_primary_key' };
        if (isRegexKey(key)) return { indexable: false, reason: 'regex_primary_key' };
        if (isDynamicKey(key)) return { indexable: false, reason: 'dynamic_primary_key' };
        if (key.length < MIN_STATIC_KEY_LENGTH) return { indexable: false, reason: 'short_primary_key' };
        anchors.push(normalizeAnchor(key).slice(0, MIN_STATIC_KEY_LENGTH));
    }

    return {
        indexable: true,
        reason: 'static_primary_keys',
        anchors: [...new Set(anchors)],
        signature: getEntryScanSignature(entry),
    };
}

function fingerprintEntry(entry, indexability) {
    return JSON.stringify([
        getWorldInfoEntryKey(entry),
        entry?.hash ?? null,
        entry?.key ?? [],
        indexability?.signature ?? '',
        indexability?.anchors ?? [],
        Boolean(entry?.constant),
        Boolean(entry?.stateActivation),
        Boolean(entry?.vectorized),
        entry?.sticky ?? null,
        entry?.decorators ?? [],
    ]);
}

export class WorldInfoSelectionIndex {
    #descriptors = new Map();
    #groups = new Map();
    #fallback = new Set();
    #entryByKey = new Map();

    update(entries = []) {
        const nextKeys = new Set();
        const nextEntryByKey = new Map();
        let reused = 0;
        let rebuilt = 0;
        let removed = 0;

        for (const entry of Array.isArray(entries) ? entries : []) {
            const key = getWorldInfoEntryKey(entry);
            if (!key) continue;
            nextKeys.add(key);
            nextEntryByKey.set(key, entry);
            const indexability = getIndexability(entry);
            const fingerprint = fingerprintEntry(entry, indexability);
            const previous = this.#descriptors.get(key);
            if (previous?.fingerprint === fingerprint) {
                reused++;
                previous.entry = entry;
                continue;
            }
            this.#descriptors.set(key, { entry, key, indexability, fingerprint });
            rebuilt++;
        }

        for (const key of [...this.#descriptors.keys()]) {
            if (!nextKeys.has(key)) {
                this.#descriptors.delete(key);
                removed++;
            }
        }

        this.#entryByKey = nextEntryByKey;
        this.#groups = new Map();
        this.#fallback = new Set();
        for (const descriptor of this.#descriptors.values()) {
            if (!descriptor.indexability.indexable) {
                this.#fallback.add(descriptor.key);
                continue;
            }
            const signature = descriptor.indexability.signature;
            let group = this.#groups.get(signature);
            if (!group) {
                group = { representative: descriptor.entry, anchors: new Map() };
                this.#groups.set(signature, group);
            }
            for (const anchor of descriptor.indexability.anchors) {
                if (!group.anchors.has(anchor)) group.anchors.set(anchor, new Set());
                group.anchors.get(anchor).add(descriptor.key);
            }
        }

        return {
            total: this.#descriptors.size,
            indexed: this.#descriptors.size - this.#fallback.size,
            fallback: this.#fallback.size,
            reused,
            rebuilt,
            removed,
        };
    }

    select({ getScanText, forcedEntryKeys = [] } = {}) {
        if (typeof getScanText !== 'function') {
            return {
                entries: [...this.#entryByKey.values()],
                diagnostics: {
                    degraded: true,
                    fallbackReason: 'missing_scan_text_reader',
                    indexedCandidates: 0,
                    compatibilityCandidates: this.#entryByKey.size,
                },
            };
        }

        try {
            const keys = new Set(this.#fallback);
            for (const forced of forcedEntryKeys || []) {
                if (this.#entryByKey.has(forced)) keys.add(forced);
            }
            for (const group of this.#groups.values()) {
                const trigrams = makeTrigrams(getScanText(group.representative));
                for (const trigram of trigrams) {
                    const matches = group.anchors.get(trigram);
                    if (!matches) continue;
                    for (const key of matches) keys.add(key);
                }
            }
            const entries = [];
            for (const [key, entry] of this.#entryByKey.entries()) {
                if (keys.has(key)) entries.push(entry);
            }
            return {
                entries,
                diagnostics: {
                    degraded: false,
                    fallbackReason: '',
                    indexedCandidates: Math.max(0, entries.length - this.#fallback.size),
                    compatibilityCandidates: this.#fallback.size,
                },
            };
        } catch (error) {
            return {
                entries: [...this.#entryByKey.values()],
                diagnostics: {
                    degraded: true,
                    fallbackReason: 'index_query_failed',
                    error: String(error?.message || error),
                    indexedCandidates: 0,
                    compatibilityCandidates: this.#entryByKey.size,
                },
            };
        }
    }
}

export function buildWorldInfoEntryLookup(entries = []) {
    const lookup = new Map();
    for (const entry of Array.isArray(entries) ? entries : []) {
        const key = getWorldInfoEntryKey(entry);
        if (key) lookup.set(key, entry);
    }
    return lookup;
}

export function resolveWorldInfoDependencyBundle(rootEntry, {
    entryLookup,
    activeEntryKeys = new Set(),
    activeMutualExclusionGroups = new Map(),
    isEligible = () => true,
    maxDepth = MAX_DEPENDENCY_DEPTH,
} = {}) {
    const lookup = entryLookup instanceof Map ? entryLookup : new Map();
    const rootKey = getWorldInfoEntryKey(rootEntry);
    if (!rootKey) return { ok: false, reason: 'invalid_root', entries: [] };

    const ordered = [];
    const visited = new Set();
    const visiting = new Set();
    const bundleGroups = new Map();

    const visit = (entry, depth) => {
        const key = getWorldInfoEntryKey(entry);
        if (!key) return { ok: false, reason: 'invalid_dependency', key };
        if (visited.has(key) || activeEntryKeys.has(key)) return { ok: true };
        if (visiting.has(key)) return { ok: false, reason: 'dependency_cycle', key };
        if (depth > maxDepth) return { ok: false, reason: 'dependency_depth_exceeded', key };
        if (entry?.disable === true) return { ok: false, reason: 'dependency_disabled', key };
        if (!isEligible(entry)) return { ok: false, reason: 'dependency_ineligible', key };

        const meta = normalizeWorldInfoSelectionMetadata(entry);
        const group = meta.mutualExclusionGroup;
        if (group) {
            const active = activeMutualExclusionGroups.get(group);
            if (active && active !== key) {
                return { ok: false, reason: 'mutual_exclusion_conflict', key, group, conflictingEntryKey: active };
            }
            const bundled = bundleGroups.get(group);
            if (bundled && bundled !== key) {
                return { ok: false, reason: 'mutual_exclusion_conflict', key, group, conflictingEntryKey: bundled };
            }
            bundleGroups.set(group, key);
        }

        visiting.add(key);
        for (const refValue of meta.requiredEntries) {
            const ref = normalizeWorldInfoEntryRef(refValue, entry.world);
            if (!ref) {
                visiting.delete(key);
                return { ok: false, reason: 'invalid_dependency_ref', key, ref: refValue };
            }
            const dependency = lookup.get(ref.key);
            if (!dependency) {
                visiting.delete(key);
                return { ok: false, reason: 'missing_dependency', key, ref: ref.ref };
            }
            const child = visit(dependency, depth + 1);
            if (!child.ok) {
                visiting.delete(key);
                return child;
            }
        }
        visiting.delete(key);
        visited.add(key);
        ordered.push(entry);
        return { ok: true };
    };

    const resolved = visit(rootEntry, 0);
    return {
        ...resolved,
        entries: resolved.ok ? ordered : [],
        entryKeys: resolved.ok ? ordered.map(getWorldInfoEntryKey) : [],
        mutualExclusionGroups: resolved.ok ? bundleGroups : new Map(),
    };
}

export function buildWorldInfoBundleVariant(entries = [], mode = 'full') {
    return (Array.isArray(entries) ? entries : []).map(entry => {
        const meta = normalizeWorldInfoSelectionMetadata(entry);
        const useCompact = mode === 'compact' && Boolean(meta.compactContent.trim());
        return {
            entry,
            content: useCompact ? meta.compactContent : String(entry?.content ?? ''),
            compact: useCompact,
        };
    });
}

export function getRelatedWorldInfoEntryKeys(entry) {
    const meta = normalizeWorldInfoSelectionMetadata(entry);
    return meta.relatedEntries
        .map(value => normalizeWorldInfoEntryRef(value, entry?.world))
        .filter(Boolean)
        .map(value => value.key);
}

export function classifyWorldInfoSelectionCompatibility(entry) {
    const indexability = getIndexability(entry);
    if (hasWorldInfoSelectionMetadata(entry)) {
        return { mode: 'atria_v1', indexed: indexability.indexable, reason: indexability.reason };
    }
    if (indexability.indexable) {
        return { mode: 'indexed_legacy', indexed: true, reason: indexability.reason };
    }
    return { mode: 'compatibility', indexed: false, reason: indexability.reason };
}

export function buildWorldInfoSelectionMigrationReport(entries = []) {
    const report = { version: 1, total: 0, atriaV1: 0, indexedLegacy: 0, compatibility: 0, reasons: {} };
    for (const entry of Array.isArray(entries) ? entries : []) {
        const classified = classifyWorldInfoSelectionCompatibility(entry);
        report.total++;
        if (classified.mode === 'atria_v1') report.atriaV1++;
        else if (classified.mode === 'indexed_legacy') report.indexedLegacy++;
        else report.compatibility++;
        report.reasons[classified.reason] = (report.reasons[classified.reason] || 0) + 1;
    }
    return report;
}
