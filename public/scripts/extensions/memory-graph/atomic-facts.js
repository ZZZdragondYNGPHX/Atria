// SPDX-License-Identifier: AGPL-3.0-or-later
import { addDependency, episodesAreCurrent, isCurrentMemorySupport } from './source-provenance.js';

const TYPES = ['explicit', 'inferred', 'summary'];
const CAPS = { explicit: 0.95, inferred: 0.65, summary: 0.75 };
const canonical = text => text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const bounded = (value, fallback, ceiling = 1) => Number.isFinite(value) ? Math.max(0, Math.min(ceiling, value)) : fallback;

function currentSupport(state, support, chat) {
    return isCurrentMemorySupport(state, support, chat);
}

/** Projection only: history and evidence remain intact in the source ledger. */
export function projectFacts(state, chat, { includeInactive = false } = {}) {
    const facts = Object.values(state.facts || {}).filter(fact => fact && typeof fact.id === 'string' && typeof fact.text === 'string'
        && TYPES.includes(fact.type) && fact.scopeId === state.scopeId && Array.isArray(fact.supports)
        && fact.supports.every(support => support && Array.isArray(support.episodeIds)));
    const supported = new Map(facts.map(fact => [fact.id, fact.supports.filter(s => currentSupport(state, s, chat))]));
    return facts.map(fact => {
        const supports = supported.get(fact.id);
        let status = supports.length ? 'active' : 'stale';
        if (supports.length && fact.supersededBy?.length) {
            status = fact.supersededBy.some(id => supported.get(id)?.length) ? 'superseded' : 'disputed';
        }
        if (supports.length && fact.mergedInto) status = episodesAreCurrent(state, fact.mergeEpisodeIds || [], chat, state.scopeId) ? 'superseded' : 'disputed';
        return {
            ...structuredClone(fact), status: fact.manualDisabled ? 'rejected' : status,
            confidence: supports.length ? Math.max(...supports.map(s => bounded(s.confidence, 0, CAPS[fact.type]))) : 0,
            episodeIds: [...new Set(fact.supports.flatMap(s => s.episodeIds))],
        };
    }).filter(fact => includeInactive || fact.status === 'active');
}

/** Validate whole input before publishing the returned ledger; caller persists atomically. */
export function applyFactOperations(ledger, operations, ticket, chat, newId = () => crypto.randomUUID(), now = Date.now()) {
    if (!ticket || ticket.scopeId !== ledger.scopeId || !episodesAreCurrent(ledger, ticket.episodeIds, chat, ledger.scopeId)) {
        throw new Error('Facts require a current source ticket');
    }
    if (!Array.isArray(operations) || operations.length > 64) throw new Error('Invalid fact operation batch');
    const state = structuredClone(ledger);
    state.facts ||= {};
    const results = [];
    for (const op of operations) {
        if (!op || !['create', 'reinforce', 'merge', 'supersede'].includes(op.action)) throw new Error('Invalid fact action');
        const active = new Map(projectFacts(state, chat).map(fact => [fact.id, fact]));
        const target = op.targetId ? state.facts[op.targetId] : null;
        if (op.action !== 'create' && (!target || !active.has(target.id))) throw new Error('Fact target is not active in this scope');
        if (op.action === 'merge') {
            const source = state.facts[op.sourceId];
            if (!source || source.id === target.id || !active.has(source.id) || source.type !== target.type
                || source.validFrom !== target.validFrom || source.validUntil !== target.validUntil) throw new Error('Invalid fact merge');
            if (typeof op.reason !== 'string' || !op.reason.trim()) throw new Error('Merge requires an equivalence reason');
            for (const support of source.supports) {
                const copy = structuredClone(support);
                copy.id = newId();
                copy.episodeIds = [...new Set([...support.episodeIds, ...ticket.episodeIds])];
                copy.fingerprint = JSON.stringify(['merge', source.id, support.fingerprint, ticket.episodeIds]);
                target.supports.push(copy);
                for (const id of copy.episodeIds) addDependency(state, `episode:${id}`, `fact:${target.id}`);
            }
            source.mergedInto = target.id;
            source.mergeEpisodeIds = [...ticket.episodeIds];
            source.mergeReason = op.reason.trim();
            source.updatedAt = now;
            target.updatedAt = now;
            results.push({ id: target.id, action: 'merge', sourceId: source.id });
            continue;
        }
        const type = op.action === 'reinforce' ? target.type : op.type;
        const text = op.action === 'reinforce' ? target.text : op.text;
        if (!TYPES.includes(type) || typeof text !== 'string' || !text.trim() || text.length > 2000) throw new Error('Invalid atomic fact text/type');
        if (op.action === 'reinforce' && op.type && op.type !== target.type) throw new Error('Reinforcement cannot change fact type');
        if (!Array.isArray(op.evidence) || !op.evidence.length || op.evidence.length > 16) throw new Error('Facts require evidence excerpts');
        const evidence = op.evidence.map(ref => {
            const episode = state.episodes[ref?.episodeId];
            if (!ticket.episodeIds.includes(ref?.episodeId) || !episode || typeof ref.excerpt !== 'string'
                || !ref.excerpt.trim() || !episode.content.includes(ref.excerpt)) throw new Error('Evidence must quote a ticket Episode verbatim');
            return { episodeId: ref.episodeId, excerpt: ref.excerpt };
        });
        const episodeIds = [...new Set(evidence.map(ref => ref.episodeId))];
        const confidence = bounded(op.confidence, CAPS[type], CAPS[type]);
        let fact = op.action === 'reinforce' ? target : Object.values(state.facts).find(item =>
            active.has(item.id) && item.type === type && canonical(item.text) === canonical(text)
            && item.validFrom === op.validFrom && item.validUntil === op.validUntil);
        if (op.action === 'supersede' && fact?.id === target.id) throw new Error('A fact cannot supersede itself');
        if (op.action === 'supersede' && (type !== 'explicit' && target.type === 'explicit')) throw new Error('Only explicit evidence can supersede an explicit fact');
        if (op.action === 'supersede' && (typeof op.reason !== 'string' || !op.reason.trim())) throw new Error('Supersede requires a change reason');
        if (!fact) {
            fact = { id: newId(), scopeId: state.scopeId, text: text.trim(), type, confidence,
                importance: bounded(op.importance, 0.5), accessCount: 0, createdAt: now, updatedAt: now,
                supports: [], supersededBy: [] };
            for (const field of ['validFrom', 'validUntil']) {
                if (typeof op[field] === 'string' || (typeof op[field] === 'number' && Number.isFinite(op[field]))) fact[field] = op[field];
            }
            state.facts[fact.id] = fact;
        }
        // Same assertion + same evidence is idempotent; repeated extraction does not inflate confidence.
        const fingerprint = JSON.stringify(evidence.map(ref => [ref.episodeId, ref.excerpt]).sort());
        if (!fact.supports.some(s => s.fingerprint === fingerprint)) {
            fact.supports.push({ id: newId(), fingerprint, episodeIds, evidence, confidence, createdAt: now });
        }
        fact.updatedAt = now;
        for (const id of episodeIds) addDependency(state, `episode:${id}`, `fact:${fact.id}`);
        if (op.action === 'supersede') {
            target.supersededBy.push(fact.id);
            target.supersessionReason = op.reason.trim();
            target.updatedAt = now;
        }
        results.push({ id: fact.id, action: op.action });
    }
    return { state, results };
}
