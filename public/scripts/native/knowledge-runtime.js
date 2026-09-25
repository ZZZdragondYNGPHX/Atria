import { normalizeKnowledgeLifecycle, normalizeKnowledgeRelations, normalizeKnowledgeDiscovery, normalizeKnowledgeApplicability, normalizeKnowledgeDelivery, normalizeKnowledgeSelector } from './knowledge-contracts.js';
import { normalizeKnowledgeEntryEnabled } from './knowledge-contracts.js';
import {
    STATE_CONDITION_RESULT,
    evaluateStateConditions,
} from './state-conditions.js';

export const KNOWLEDGE_AUTHORITY = Object.freeze({
    runtimeMechanics: Object.freeze({ id: 'runtime_mechanics', rank: 900 }),
    currentState: Object.freeze({ id: 'current_session_state', rank: 800 }),
    eventJournal: Object.freeze({ id: 'committed_event_journal', rank: 700 }),
    knowledgeOverride: Object.freeze({ id: 'knowledge_override', rank: 600 }),
    packageCanonical: Object.freeze({ id: 'package_canonical', rank: 500 }),
    libraryAugment: Object.freeze({ id: 'library_augment', rank: 400 }),
    sessionAugment: Object.freeze({ id: 'session_augment', rank: 300 }),
    memoryEvidence: Object.freeze({ id: 'memory_history_evidence', rank: 200 }),
});

const BLOCKED_PATH_PARTS = new Set(['__proto__', 'constructor', 'prototype']);
const DEFAULT_PRIORITY = 100;

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function asText(value) {
    return String(value ?? '').trim();
}

function candidateIdentity(candidate) {
    return [
        candidate.knowledgeBindingId,
        candidate.source.kind,
        candidate.knowledgeBaseId,
        candidate.knowledgeRevisionId,
        candidate.knowledgeEntryId,
    ].join(':');
}

function sourceKey(source) {
    return [source.kind, source.knowledgeBaseId, source.knowledgeRevisionId].join(':');
}

function entryPriority(binding, entry) {
    const value = entry?.delivery?.priority ?? binding?.priority ?? DEFAULT_PRIORITY;
    return Number.isFinite(Number(value)) ? Number(value) : DEFAULT_PRIORITY;
}

function authorityFor(binding) {
    if (binding.mode === 'override') return KNOWLEDGE_AUTHORITY.knowledgeOverride;
    if (binding.source.kind === 'package') return KNOWLEDGE_AUTHORITY.packageCanonical;
    if (binding.source.kind === 'library') return KNOWLEDGE_AUTHORITY.libraryAugment;
    if (binding.source.kind === 'session') return KNOWLEDGE_AUTHORITY.sessionAugment;
    return null;
}

export function normalizeKnowledgeTarget(value = 'narrator') {
    const selector = normalizeKnowledgeSelector(value, 'Knowledge target');
    if (Array.isArray(selector)) throw new TypeError('Knowledge target must be a single selector');
    return Object.freeze(typeof selector === 'string' ? { kind: selector } : selector);
}

function targetMatches(scope, target) {
    if (scope === undefined) return true;
    const selector = normalizeKnowledgeSelector(scope);
    if (Array.isArray(selector)) return selector.some(item => targetMatches(item, target));
    if (typeof selector === 'string') return selector === target.kind;
    return selector.kind === target.kind && (selector.id === undefined || selector.id === target.id);
}

function visibleTo(value, target) {
    if (!Array.isArray(value) || value.length === 0) return true;
    return value.includes(target.kind);
}

function flattenScalars(value, path = [], result = []) {
    if (result.length >= 512 || path.length > 12) return result;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const key of Object.keys(value).sort()) {
            if (!BLOCKED_PATH_PARTS.has(key) && !key.startsWith('$')) {
                flattenScalars(value[key], [...path, key], result);
            }
        }
        return result;
    }
    if (
        path.length
        && (value === null || ['string', 'number', 'boolean'].includes(typeof value))
        && JSON.stringify(value).length <= 4000
    ) {
        result.push({ path, value: clone(value) });
    }
    return result;
}

export function buildNativeKnowledgeStateProviders(snapshot) {
    const providers = [];
    const states = snapshot?.states && typeof snapshot.states === 'object' && !Array.isArray(snapshot.states)
        ? snapshot.states
        : {};
    for (const namespace of Object.keys(states).filter(key => key.startsWith('atri_')).sort()) {
        const raw = states[namespace];
        let state = raw;
        if (namespace === 'atri_variables' && raw?.schemaVersion === 1 && raw?.values && typeof raw.values === 'object') {
            state = raw.values;
        }
        providers.push({
            providerId: namespace,
            status: 'ready',
            fields: flattenScalars(state),
            revision: snapshot?.revision?.revisionId ?? null,
            contract: 'Native SessionState/revision',
        });
        if (namespace === 'atri_game_runtime') {
            const events = Array.isArray(raw?.events) ? raw.events : [];
            const latestEvent = events.at(-1) ?? null;
            providers.push({
                providerId: 'atri_event_journal',
                status: 'ready',
                fields: flattenScalars({
                    lastSeq: Number(raw?.nextEventSeq || 1) - 1,
                    latestEvent,
                }),
                revision: snapshot?.revision?.revisionId ?? null,
                contract: 'Native committed Event Journal',
            });
        }
    }
    return providers;
}

function resolveSources(snapshot) {
    const result = new Map();
    for (const item of snapshot?.manifest?.knowledge ?? []) {
        result.set(sourceKey({
            kind: 'package',
            knowledgeBaseId: item.knowledgeBase.knowledgeBaseId,
            knowledgeRevisionId: item.revision.knowledgeRevisionId,
        }), item);
    }
    for (const item of snapshot?.knowledge?.snapshots ?? []) {
        result.set(sourceKey({
            kind: item.kind,
            knowledgeBaseId: item.snapshot.knowledgeBase.knowledgeBaseId,
            knowledgeRevisionId: item.snapshot.revision.knowledgeRevisionId,
        }), item.snapshot);
    }
    return result;
}

function rejection(candidate, reason, details = {}) {
    return {
        identity: candidate.identity,
        knowledgeBindingId: candidate.knowledgeBindingId,
        knowledgeBaseId: candidate.knowledgeBaseId,
        knowledgeRevisionId: candidate.knowledgeRevisionId,
        knowledgeEntryId: candidate.knowledgeEntryId,
        source: clone(candidate.source),
        authority: candidate.authority.id,
        priority: candidate.priority,
        reason,
        ...clone(details),
    };
}

function compareCandidates(a, b) {
    return b.authority.rank - a.authority.rank
        || b.priority - a.priority
        || a.identity.localeCompare(b.identity);
}

function conditionEvaluation(entry, providers) {
    const applicability = normalizeKnowledgeApplicability(entry?.applicability);
    if (!applicability?.stateConditions?.length) return null;
    return evaluateStateConditions(applicability.stateConditions, providers, applicability.stateConditionsLogic ?? 'all');
}

function normalizeMemoryEvidence(memoryEvidence, providers) {
    const included = [];
    const rejected = [];
    for (const [index, raw] of (Array.isArray(memoryEvidence) ? memoryEvidence : []).entries()) {
        const memoryId = asText(raw?.memoryId || raw?.id) || `memory:${index}`;
        const claim = raw?.stateClaim;
        if (claim && typeof claim === 'object' && !Array.isArray(claim)) {
            const provider = providers.find(item => item.providerId === asText(claim.providerId));
            const path = Array.isArray(claim.path) ? claim.path.map(asText).filter(Boolean) : [];
            const field = provider?.fields?.find(item => JSON.stringify(item.path) === JSON.stringify(path));
            if (provider?.status === 'ready' && field && Object.hasOwn(claim, 'value') && !Object.is(field.value, claim.value)) {
                rejected.push({
                    memoryId,
                    authority: KNOWLEDGE_AUTHORITY.memoryEvidence.id,
                    reason: 'memory_conflicts_current_state',
                    current: clone(field.value),
                    claimed: clone(claim.value),
                    providerId: provider.providerId,
                    path,
                });
                continue;
            }
        }
        included.push({
            memoryId,
            authority: KNOWLEDGE_AUTHORITY.memoryEvidence.id,
            content: String(raw?.content ?? ''),
            source: clone(raw?.source ?? null),
        });
    }
    return { included, rejected };
}

export function compileNativeKnowledgePlan(snapshot, options = {}) {
    if (!snapshot?.knowledge || !snapshot?.manifest) throw new TypeError('Native Knowledge compilation requires a Session snapshot');
    const target = normalizeKnowledgeTarget(options.target ?? 'narrator');
    const sources = resolveSources(snapshot);
    const providers = buildNativeKnowledgeStateProviders(snapshot);
    const candidates = [];
    const rejected = [];

    for (const binding of snapshot.knowledge.bindings ?? []) {
        const source = sources.get(sourceKey(binding.source));
        if (!source) throw new Error('Missing exact pinned Native Knowledge source');
        const authority = authorityFor(binding);
        if (!authority) continue;
        for (const [sourceEntryIndex, entry] of (source.entries ?? []).entries()) {
            normalizeKnowledgeEntryEnabled(entry.enabled);
            normalizeKnowledgeDelivery(entry.delivery);
            normalizeKnowledgeDiscovery(entry.discovery);
            normalizeKnowledgeLifecycle(entry.lifecycle);
            normalizeKnowledgeRelations(entry.relations);
            const candidate = {
                identity: [
                    binding.knowledgeBindingId,
                    binding.source.kind,
                    binding.source.knowledgeBaseId,
                    binding.source.knowledgeRevisionId,
                    entry.knowledgeEntryId,
                ].join(':'),
                knowledgeBindingId: binding.knowledgeBindingId,
                knowledgeBaseId: binding.source.knowledgeBaseId,
                knowledgeRevisionId: binding.source.knowledgeRevisionId,
                knowledgeEntryId: entry.knowledgeEntryId,
                source: clone(binding.source),
                sourceEntryIndex,
                authority,
                priority: entryPriority(binding, entry),
                mode: binding.mode,
                target: clone(target),
                bindingTarget: clone(binding.target),
                bindingVisibility: clone(binding.visibility ?? []),
                entry: clone(entry),
                stateEvidence: null,
            };
            if (binding.enabled !== true) {
                rejected.push(rejection(candidate, 'binding_disabled'));
                continue;
            }
            if (entry.enabled === false) {
                rejected.push(rejection(candidate, 'entry_disabled'));
                continue;
            }
            if (!targetMatches(binding.target, target) || !targetMatches(entry?.delivery?.target, target)) {
                rejected.push(rejection(candidate, 'target_mismatch'));
                continue;
            }
            if (!visibleTo(binding.visibility, target) || !visibleTo(entry?.delivery?.visibility, target)) {
                rejected.push(rejection(candidate, 'visibility_mismatch'));
                continue;
            }
            const evaluated = conditionEvaluation(entry, providers);
            if (evaluated) {
                candidate.stateEvidence = clone(evaluated);
                if (evaluated.status !== STATE_CONDITION_RESULT.TRUE) {
                    rejected.push(rejection(
                        candidate,
                        evaluated.status === STATE_CONDITION_RESULT.UNKNOWN
                            ? 'state_condition_unknown'
                            : 'current_state_conflict',
                        { stateEvidence: evaluated },
                    ));
                    continue;
                }
            }
            candidates.push(candidate);
        }
    }

    const active = new Map(candidates.map(candidate => [candidate.identity, candidate]));
    const groupMembers = new Map();
    for (const candidate of active.values()) {
        const group = asText(candidate.entry?.relations?.exclusiveGroup);
        if (!group) continue;
        const list = groupMembers.get(group) ?? [];
        list.push(candidate);
        groupMembers.set(group, list);
    }
    for (const [group, members] of groupMembers) {
        const ordered = [...members].sort(compareCandidates);
        const winner = ordered[0];
        for (const loser of ordered.slice(1)) {
            active.delete(loser.identity);
            const reason = loser.authority.rank < winner.authority.rank
                ? 'exclusive_group_lower_authority'
                : 'exclusive_group_lower_priority';
            rejected.push(rejection(loser, reason, {
                exclusiveGroup: group,
                winnerIdentity: winner.identity,
                winnerAuthority: winner.authority.id,
            }));
        }
    }

    let changed = true;
    while (changed) {
        changed = false;
        for (const candidate of [...active.values()]) {
            const required = candidate.entry?.relations?.requiredEntryIds ?? [];
            for (const requiredEntryId of required) {
                const dependency = candidates.find(item => (
                    item.knowledgeBindingId === candidate.knowledgeBindingId
                    && item.knowledgeEntryId === requiredEntryId
                ));
                if (!dependency || !active.has(dependency.identity)) {
                    active.delete(candidate.identity);
                    rejected.push(rejection(candidate, 'required_dependency_rejected', {
                        requiredEntryId,
                        dependencyIdentity: dependency?.identity ?? null,
                    }));
                    changed = true;
                    break;
                }
            }
        }
    }

    const included = [...active.values()]
        .sort(compareCandidates)
        .map(candidate => ({
            identity: candidate.identity,
            knowledgeBindingId: candidate.knowledgeBindingId,
            knowledgeBaseId: candidate.knowledgeBaseId,
            knowledgeRevisionId: candidate.knowledgeRevisionId,
            knowledgeEntryId: candidate.knowledgeEntryId,
            source: clone(candidate.source),
            authority: candidate.authority.id,
            authorityRank: candidate.authority.rank,
            priority: candidate.priority,
            mode: candidate.mode,
            target: clone(target),
            selectionReason: 'eligible_' + candidate.authority.id,
            stateActivated: candidate.entry?.applicability?.stateActivation === true && candidate.stateEvidence?.status === STATE_CONDITION_RESULT.TRUE,
            stateEvidence: clone(candidate.stateEvidence),
            sourceEntryIndex: candidate.sourceEntryIndex,
            entry: clone(candidate.entry),
        }));

    const memory = normalizeMemoryEvidence(options.memoryEvidence, providers);
    return Object.freeze({
        schemaVersion: 1,
        revisionId: snapshot.revision?.revisionId ?? null,
        branchId: snapshot.revision?.branchId ?? null,
        target,
        included,
        rejected: rejected.sort((a, b) => a.identity.localeCompare(b.identity)),
        authorityEvidence: {
            runtimeMechanics: { authority: KNOWLEDGE_AUTHORITY.runtimeMechanics.id },
            currentState: providers
                .filter(item => item.providerId !== 'atri_event_journal')
                .map(item => ({ providerId: item.providerId, status: item.status, revision: item.revision })),
            eventJournal: providers
                .filter(item => item.providerId === 'atri_event_journal')
                .map(item => ({ providerId: item.providerId, status: item.status, revision: item.revision })),
            memory,
        },
    });
}

export function getNativeKnowledgeCandidateIdentity(candidate) {
    return candidateIdentity(candidate);
}
