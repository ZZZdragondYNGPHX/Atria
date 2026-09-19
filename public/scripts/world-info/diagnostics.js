function tr(strings, ...values) {
    const translator = globalThis.__i18n?.t;
    if (typeof translator === 'function') {
        return translator(strings, ...values);
    }
    return strings.reduce((result, string, index) => result + string + (values[index] !== undefined ? values[index] : ''), '');
}

/**
 * Deterministic World Info authoring diagnostics.
 *
 * This module is intentionally view-model only. It never mutates entries and
 * never participates in activation decisions; the runtime remains authoritative.
 */

function text(value) {
    return String(value ?? '').trim();
}

function scalarPathIsPresent(path) {
    return Array.isArray(path)
        ? path.length > 0 && path.every(part => text(part))
        : Boolean(text(path));
}

function normalizeEntryRef(ref, currentWorld) {
    const raw = text(ref);
    if (!raw) return null;

    const hash = raw.lastIndexOf('#');
    if (hash === -1) {
        const uid = Number.parseInt(raw, 10);
        return Number.isInteger(uid) && uid >= 0
            ? { world: text(currentWorld), uid, key: `${text(currentWorld)}#${uid}` }
            : null;
    }

    const world = text(raw.slice(0, hash));
    const uid = Number.parseInt(raw.slice(hash + 1), 10);
    if (!world || !Number.isInteger(uid) || uid < 0) return null;
    return { world, uid, key: `${world}#${uid}` };
}

function getEntryWorld(entry, fallbackWorld) {
    return text(entry?.world) || text(fallbackWorld);
}

function buildEntryLookup(entries, currentWorld) {
    const map = new Map();
    for (const entry of entries || []) {
        if (!entry || typeof entry !== 'object') continue;
        const uid = Number(entry.uid);
        if (!Number.isInteger(uid) || uid < 0) continue;
        const world = getEntryWorld(entry, currentWorld);
        map.set(`${world}#${uid}`, entry);
        if (world === text(currentWorld)) map.set(String(uid), entry);
    }
    return map;
}

function duplicateAutomationIds(entries) {
    const counts = new Map();
    for (const entry of entries || []) {
        const id = text(entry?.automationId);
        if (!id) continue;
        counts.set(id, (counts.get(id) || 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id));
}

function stateConditionIsIncomplete(condition) {
    if (!condition || typeof condition !== 'object') return true;
    if (!text(condition.providerId)) return true;
    if (!scalarPathIsPresent(condition.path)) return true;
    if (!text(condition.operator)) return true;
    return false;
}

function stateEventIsIncomplete(event) {
    if (!event || typeof event !== 'object') return true;
    if (!text(event.providerId)) return true;
    if (!scalarPathIsPresent(event.path)) return true;
    const fromPresent = Object.hasOwn(event, 'from') || event.fromPresent === true;
    const toPresent = Object.hasOwn(event, 'to') || event.toPresent === true;
    return !fromPresent && !toPresent;
}

/**
 * @param {object} entry
 * @param {{worldName?:string, entries?:object[]}} context
 * @returns {{code:string,severity:'warning'|'error',message:string}[]}
 */
export function getWorldInfoEntryIssues(entry, context = {}) {
    if (!entry || typeof entry !== 'object') return [];

    const worldName = getEntryWorld(entry, context.worldName);
    const entries = Array.isArray(context.entries) ? context.entries : [];
    const lookup = buildEntryLookup(entries, worldName);
    const duplicateIds = duplicateAutomationIds(entries);
    const issues = [];
    const push = (code, message, severity = 'warning') => issues.push({ code, message, severity });

    if (!text(entry.content)) {
        push('empty-content', tr`Content is empty.`);
    }

    const primaryKeys = Array.isArray(entry.key) ? entry.key.map(text).filter(Boolean) : [];
    const hasStateGate = Array.isArray(entry.stateConditions) && entry.stateConditions.length > 0;
    const isKeywordDriven = entry.constant !== true && entry.vectorized !== true && !hasStateGate;
    if (isKeywordDriven && primaryKeys.length === 0) {
        push('missing-primary-keywords', tr`Normal keyword-driven entry has no Primary Keywords.`);
    }

    const currentKey = `${worldName}#${Number(entry.uid)}`;
    const relationshipGroups = [
        ['requiredEntries', tr`Required entry`],
        ['relatedEntries', tr`Related entry`],
    ];
    for (const [field, label] of relationshipGroups) {
        const refs = Array.isArray(entry[field]) ? entry[field] : [];
        for (const ref of refs) {
            const normalized = normalizeEntryRef(ref, worldName);
            if (!normalized) {
                push('invalid-relationship-target', tr`${label} reference "${text(ref)}" is invalid.`, 'error');
                continue;
            }
            if (normalized.key === currentKey) {
                push('self-reference', tr`${label} points to this entry.`, 'error');
                continue;
            }
            const isSameBook = normalized.world === worldName;
            if (isSameBook && !lookup.has(normalized.key) && !lookup.has(String(ref))) {
                push('unresolved-relationship', tr`${label} "${text(ref)}" does not resolve in this lorebook.`);
            }
        }
    }

    const conditions = Array.isArray(entry.stateConditions) ? entry.stateConditions : [];
    conditions.forEach((condition, index) => {
        if (stateConditionIsIncomplete(condition)) {
            push('incomplete-state-condition', tr`State condition #${index + 1} is incomplete.`);
        }
    });

    const events = Array.isArray(entry.stateEvents) ? entry.stateEvents : [];
    events.forEach((event, index) => {
        if (stateEventIsIncomplete(event)) {
            push('incomplete-state-event', tr`State change event #${index + 1} is incomplete.`);
        }
    });

    const automationId = text(entry.automationId);
    if (automationId && duplicateIds.has(automationId)) {
        push('duplicate-automation-id', tr`Automation ID "${automationId}" is used by more than one entry.`);
    }

    const hasRelationshipConfig = (Array.isArray(entry.requiredEntries) && entry.requiredEntries.length > 0)
        || (Array.isArray(entry.relatedEntries) && entry.relatedEntries.length > 0);
    if (text(entry.compactContent) && !hasRelationshipConfig) {
        push('orphan-compact-content', tr`Compact Content is configured without Required or Related Entries.`);
    }

    return issues;
}

export function hasSpecialWorldInfoBehavior(entry) {
    if (!entry || typeof entry !== 'object') return false;
    return Boolean(
        entry.constant
        || entry.vectorized
        || entry.stateActivation
        || (Array.isArray(entry.stateConditions) && entry.stateConditions.length)
        || (Array.isArray(entry.stateEvents) && entry.stateEvents.length)
        || (Array.isArray(entry.requiredEntries) && entry.requiredEntries.length)
        || (Array.isArray(entry.relatedEntries) && entry.relatedEntries.length)
        || text(entry.mutualExclusionGroup)
        || text(entry.compactContent)
        || entry.sticky != null
        || entry.cooldown != null
        || entry.delay != null
        || entry.excludeRecursion
        || entry.preventRecursion
        || entry.delayUntilRecursion,
    );
}

/**
 * Workspace-only quick filter. Search/sort remain owned by world-info.js.
 */
export function filterWorldInfoWorkspaceEntries(entries, mode, context = {}) {
    const list = Array.isArray(entries) ? entries : [];
    switch (mode) {
        case 'enabled':
            return list.filter(entry => entry?.disable !== true);
        case 'special':
            return list.filter(hasSpecialWorldInfoBehavior);
        case 'issues':
            return list.filter(entry => getWorldInfoEntryIssues(entry, { ...context, entries: list }).length > 0);
        default:
            return list;
    }
}
