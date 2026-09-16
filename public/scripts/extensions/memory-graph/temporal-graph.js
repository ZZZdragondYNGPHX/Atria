// SPDX-License-Identifier: AGPL-3.0-or-later
import { addDependency, isCurrentMemorySupport, createMemorySupportChecker } from './source-provenance.js';
import { projectFacts } from './atomic-facts.js';

export const ENTITY_TYPES = ['Character', 'Location', 'Organization', 'Item', 'Event', 'Quest', 'Concept'];
const normalizeName = name => String(name).normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const defaults = {
    located_in: { policy: 'replace_current', exclusiveSide: 'source' },
    owns: { policy: 'replace_current', exclusiveSide: 'target' },
    holds: { policy: 'replace_current', exclusiveSide: 'target' },
    visited: { policy: 'multi_active', exclusiveSide: 'source' },
    member_of: { policy: 'multi_active', exclusiveSide: 'source' },
};
const current = isCurrentMemorySupport;
const text = (value, field, max = 300) => {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Invalid ${field}`);
    return value.trim();
};

function support(state, op, ticket, newId, now) {
    if (!Array.isArray(op.evidence) || !op.evidence.length || op.evidence.length > 16) throw new Error('Graph operations require Episode evidence');
    const evidence = op.evidence.map(ref => {
        const episode = state.episodes[ref?.episodeId];
        if (!ticket.episodeIds.includes(ref?.episodeId) || typeof ref.excerpt !== 'string' || !ref.excerpt.trim()
            || !episode?.content.includes(ref.excerpt)) throw new Error('Graph evidence must quote a current ticket Episode');
        return { episodeId: ref.episodeId, excerpt: ref.excerpt };
    });
    return { id: newId(), episodeIds: [...new Set(evidence.map(ref => ref.episodeId))], evidence, createdAt: now };
}

function latestMerge(entity) {
    return entity.merges?.at(-1);
}

/** Resolve endpoints without rewriting their historical identity. */
function canonicalId(state, id, chat, cache = new Map(), check = ref => current(state, ref, chat)) {
    const seen = new Set(); let result = null;
    while (state.entities?.[id]) {
        if (cache.has(id)) { result = cache.get(id); break; }
        if (seen.has(id)) break;
        seen.add(id);
        const merge = latestMerge(state.entities[id]);
        if (!merge || merge.undone || !check(merge)) { result = id; break; }
        id = merge.targetId;
    }
    for (const visited of seen) cache.set(visited, result);
    return result;
}

export function projectTemporalGraph(state, chat, { includeInactive = false, at = null } = {}) {
    const check = createMemorySupportChecker(state, chat); const canonicalCache = new Map();
    const resolveCanonical = id => canonicalId(state, id, chat, canonicalCache, check);
    const entities = Object.values(state.entities || {}).filter(entity => entity?.scopeId === state.scopeId && Array.isArray(entity.names)).map(entity => {
        const names = entity.names.filter(name => !name.manualDisabled && check(name));
        const canonical = names.filter(name => name.kind === 'canonical').at(-1) || names[0];
        const merge = latestMerge(entity);
        const status = !names.length ? 'stale' : merge && !merge.undone
            ? check(merge) ? 'merged' : 'disputed' : 'active';
        return { ...structuredClone(entity), canonicalName: canonical?.name || entity.canonicalName,
            displayName: canonical?.name || entity.displayName,
            aliases: [...new Set(names.map(name => name.name).filter(name => name !== canonical?.name))],
            status, resolvedId: resolveCanonical(entity.id) };
    });
    const entityMap = new Map(entities.map(entity => [entity.id, entity]));
    // An active merge contributes searchable names only while both identities are usable.
    for (const entity of entities.filter(item => item.status === 'merged')) {
        const target = entityMap.get(entity.resolvedId);
        if (target?.status === 'active') target.aliases = [...new Set([...target.aliases, entity.canonicalName, ...entity.aliases])].filter(name => name !== target.canonicalName);
    }
    const facts = new Map(projectFacts(state, chat, { includeInactive: true, checkSupport: check }).map(fact => [fact.id, fact]));
    const relations = Object.values(state.relations || {}).filter(relation => relation?.scopeId === state.scopeId && Array.isArray(relation.supports)).map(relation => {
        const source = resolveCanonical(relation.sourceEntityId);
        const target = resolveCanonical(relation.targetEntityId);
        const supports = relation.supports.filter(ref => check(ref));
        const factViews = supports.map(ref => facts.get(ref.factId)).filter(Boolean);
        let status = factViews.some(fact => fact.status === 'active') ? 'active'
            : factViews.some(fact => fact.status === 'superseded') ? 'superseded'
                : factViews.some(fact => fact.status === 'disputed') ? 'disputed' : 'stale';
        if (entityMap.get(source)?.status !== 'active' || entityMap.get(target)?.status !== 'active'
            || ['stale', 'disputed'].includes(entityMap.get(relation.sourceEntityId)?.status)
            || ['stale', 'disputed'].includes(entityMap.get(relation.targetEntityId)?.status)) status = 'stale';
        if (status === 'active' && (relation.validUntil !== undefined || relation.untilOrder !== undefined)) status = 'superseded';
        return { ...structuredClone(relation), sourceEntityId: source, targetEntityId: target,
            originalSourceEntityId: relation.sourceEntityId, originalTargetEntityId: relation.targetEntityId,
            status: relation.manualDisabled ? 'rejected' : status, confidence: Math.max(0, ...factViews.filter(fact => fact.status === 'active').map(fact => fact.confidence)) };
    });
    const supported = new Set(relations.filter(relation => ['active', 'superseded'].includes(relation.status)).map(relation => relation.id));
    for (const relation of relations) {
        if (!['active', 'superseded'].includes(relation.status)) continue;
        if (relation.supersededBy?.length) {
            const successor = relation.supersededBy.find(ref => supported.has(ref.relationId) && check(ref));
            relation.status = successor ? 'superseded' : 'disputed';
            if (successor?.validUntil !== undefined) relation.validUntil ??= successor.validUntil;
            if (Number.isFinite(successor?.untilOrder)) relation.untilOrder ??= successor.untilOrder;
            continue;
        }
        const resolved = new Set((relation.resolutions || []).filter(ref => check(ref)).flatMap(ref => ref.loserIds));
        if ((relation.conflictIds || []).some(id => !resolved.has(id))) relation.status = 'disputed';
    }
    // Merging endpoints can reveal a conflict without adding a relation. Never let
    // two incompatible replace_current edges escape simply because IDs changed.
    const slots = new Map();
    for (const relation of relations) {
        if (relation.status !== 'active' || relation.policy !== 'replace_current') continue;
        const key = JSON.stringify([relation.predicate, relation.exclusiveSide, relation.exclusiveSide === 'target' ? relation.targetEntityId : relation.sourceEntityId]);
        if (!slots.has(key)) slots.set(key, []);
        slots.get(key).push(relation);
    }
    for (const peers of slots.values()) {
        if (new Set(peers.map(edge => JSON.stringify([edge.sourceEntityId, edge.targetEntityId]))).size > 1) {
            for (const edge of peers) edge.status = 'disputed';
        }
    }
    for (const relation of relations) {
        const from = temporalOrder(relation);
        const until = Number.isFinite(relation.untilOrder) ? relation.untilOrder : typeof relation.validUntil === 'number' ? relation.validUntil : null;
        relation.validAt = Number.isFinite(at) && from !== null && (relation.validUntil === undefined || until !== null)
            && (relation.status !== 'superseded' || until !== null)
            ? at >= from && (until === null || at < until) : null;
    }
    return { entities: entities.filter(entity => includeInactive || entity.status === 'active'),
        relations: relations.filter(relation => includeInactive || (Number.isFinite(at)
            ? relation.validAt === true && ['active', 'superseded'].includes(relation.status) : relation.status === 'active')),
        pending: Object.values(state.entityPending || {}).map(item => ({ ...structuredClone(item),
            status: item.manualDisabled ? 'rejected' : item.resolvedTo ? 'resolved' : check(item) ? 'pending' : 'stale' })) };
}

export function resolveEntity(state, chat, name, type) {
    const entities = projectTemporalGraph(state, chat).entities.filter(entity => entity.type === type);
    const searches = [
        ['canonical', entity => entity.canonicalName === name],
        ['alias', entity => entity.aliases.includes(name)],
        ['normalized', entity => [entity.canonicalName, ...entity.aliases].some(value => normalizeName(value) === normalizeName(name))],
    ];
    for (const [match, predicate] of searches) {
        const ids = entities.filter(predicate).map(entity => entity.id);
        if (ids.length) return { status: ids.length === 1 ? 'resolved' : 'ambiguous', match, ids };
    }
    return { status: 'missing', ids: [] };
}

function sameSlot(a, b) {
    return a.predicate === b.predicate && a.exclusiveSide === b.exclusiveSide
        && (a.exclusiveSide === 'target' ? a.targetEntityId === b.targetEntityId : a.sourceEntityId === b.sourceEntityId);
}
function sameEndpoints(a, b) { return a.sourceEntityId === b.sourceEntityId && a.targetEntityId === b.targetEntityId; }
function temporalOrder(relation) {
    if (Number.isFinite(relation.timeOrder)) return relation.timeOrder;
    return typeof relation.validFrom === 'number' && Number.isFinite(relation.validFrom) ? relation.validFrom : null;
}

/** Whole-batch copy-on-write. Entity refs are local to this batch, never durable IDs. */
export function applyTemporalOperations(ledger, operations, ticket, chat, factResults = [], newId = () => crypto.randomUUID(), now = Date.now(), manualProof = null) {
    if (manualProof && (!manualProof.manualId || !current(ledger, manualProof, chat))) throw new Error('Invalid user correction source');
    if (!ticket || ticket.scopeId !== ledger.scopeId || !current(ledger, ticket, chat)) throw new Error('Graph requires a current source ticket');
    if (!Array.isArray(operations) || operations.length > 64) throw new Error('Invalid graph operation batch');
    const state = structuredClone(ledger);
    state.entities ||= {}; state.relations ||= {}; state.entityPending ||= {}; state.predicates ||= {};
    const refs = new Map();
    const results = [];
    const entityId = id => refs.has(id) ? refs.get(id) : id;
    for (const op of operations) {
        const proof = manualProof && current(state, manualProof, chat) ? structuredClone(manualProof) : support(state, op, ticket, newId, now);
        const view = projectTemporalGraph(state, chat, { includeInactive: true });
        const activeFacts = new Map(projectFacts(state, chat).map(fact => [fact.id, fact]));
        const hasExplicitSupport = relation => relation.supports.some(ref => current(state, ref, chat) && activeFacts.get(ref.factId)?.type === 'explicit');
        const activeEntities = new Map(view.entities.filter(entity => entity.status === 'active').map(entity => [entity.id, entity]));
        const targetId = entityId(op.targetId);
        if (op.action === 'entity') {
            const name = text(op.name, 'entity name');
            if (!ENTITY_TYPES.includes(op.type)) throw new Error('Invalid entity type');
            if (op.ref && (refs.has(op.ref) || state.entities[op.ref])) throw new Error('Duplicate entity batch ref');
            const resolution = resolveEntity(state, chat, name, op.type);
            let id = resolution.status === 'resolved' ? resolution.ids[0] : null;
            if (op.candidateIds !== undefined && !Array.isArray(op.candidateIds)) throw new Error('Invalid entity candidates');
            const candidates = [...new Set(op.candidateIds || [])];
            if (!id && resolution.status === 'missing' && candidates.length) {
                if (candidates.some(candidate => activeEntities.get(candidate)?.type !== op.type)) throw new Error('Invalid entity candidates');
                if (candidates.length === 1 && Number.isFinite(op.resolutionConfidence) && op.resolutionConfidence >= 0.9 && op.resolutionConfidence <= 1 && op.reason?.trim()) id = candidates[0];
            }
            if (!id && (resolution.status === 'ambiguous' || candidates.length)) {
                const candidateIds = resolution.ids.length ? resolution.ids : candidates;
                const existing = Object.values(state.entityPending).find(item => !item.resolvedTo && item.name === name && item.type === op.type
                    && JSON.stringify(item.candidateIds) === JSON.stringify(candidateIds) && JSON.stringify(item.episodeIds) === JSON.stringify(proof.episodeIds));
                const pendingId = existing?.id || newId();
                state.entityPending[pendingId] ||= { ...proof, id: pendingId, scopeId: state.scopeId, name, type: op.type, candidateIds };
                for (const episodeId of proof.episodeIds) addDependency(state, `episode:${episodeId}`, `pending:${pendingId}`);
                if (op.ref) refs.set(op.ref, null);
                results.push({ status: 'pending', pendingId });
                continue;
            }
            if (!id) {
                id = newId();
                state.entities[id] = { id, scopeId: state.scopeId, type: op.type, canonicalName: name, displayName: name, names: [], merges: [], createdAt: now, updatedAt: now };
            }
            const entity = state.entities[id];
            if (!entity.names.some(entry => entry.name === name && JSON.stringify(entry.episodeIds) === JSON.stringify(proof.episodeIds))) {
                entity.names.push({ name, kind: entity.names.length ? 'alias' : 'canonical', ...proof });
            }
            entity.updatedAt = now;
            if (op.ref) refs.set(op.ref, id);
            for (const episodeId of proof.episodeIds) addDependency(state, `episode:${episodeId}`, `entity:${id}`);
            results.push({ id, status: 'resolved' });
            continue;
        }
        if (op.action === 'resolve_pending') {
            const pending = state.entityPending[op.pendingId];
            if (!pending || pending.manualDisabled || pending.resolvedTo || activeEntities.get(targetId)?.type !== pending.type) throw new Error('Invalid pending entity resolution');
            pending.resolvedTo = targetId;
            pending.resolution = { reason: text(op.reason, 'entity resolution reason', 2000), ...proof };
            state.entities[targetId].names.push({ name: pending.name, kind: 'alias', ...proof });
            for (const episodeId of proof.episodeIds) addDependency(state, `episode:${episodeId}`, `entity:${targetId}`);
            results.push({ id: targetId });
            continue;
        }
        if (['alias', 'rename', 'merge_entity', 'split_entity'].includes(op.action)) {
            const entity = state.entities[targetId];
            if (!entity || !view.entities.some(item => item.id === targetId && (['active', 'merged'].includes(item.status) || op.action === 'split_entity' && item.status === 'disputed'))) throw new Error('Unknown graph entity');
            if (op.action === 'alias' || op.action === 'rename') {
                entity.names.push({ name: text(op.name, 'entity name'), kind: op.action === 'rename' ? 'canonical' : 'alias', ...proof });
            } else if (op.action === 'merge_entity') {
                const sourceId = entityId(op.sourceId);
                const source = state.entities[sourceId];
                if (!activeEntities.has(sourceId) || !activeEntities.has(targetId) || sourceId === targetId || source.type !== entity.type) throw new Error('Invalid entity merge');
                source.merges.push({ targetId, reason: text(op.reason, 'merge reason', 2000), ...proof });
                for (const episodeId of proof.episodeIds) addDependency(state, `episode:${episodeId}`, `entity:${sourceId}`);
            } else {
                const merge = latestMerge(entity);
                if (!merge || merge.undone) throw new Error('Entity has no merge to undo');
                merge.undone = true;
                merge.undo = { reason: text(op.reason, 'split reason', 2000), ...proof };
            }
            entity.updatedAt = now;
            for (const episodeId of proof.episodeIds) addDependency(state, `episode:${episodeId}`, `entity:${targetId}`);
            results.push({ id: targetId });
            continue;
        }
        if (op.action === 'resolve_conflict') {
            const winner = view.relations.find(relation => relation.id === op.relationId && ['active', 'disputed'].includes(relation.status));
            if (!winner || !Array.isArray(op.loserIds) || !op.loserIds.length) throw new Error('Invalid conflict winner');
            text(op.reason, 'conflict resolution reason', 2000);
            for (const id of op.loserIds) {
                const loser = view.relations.find(relation => relation.id === id);
                if (!loser || id === winner.id || !sameSlot(winner, loser) || !['active', 'disputed'].includes(loser.status)) throw new Error('Invalid conflict loser');
                if (!manualProof && hasExplicitSupport(state.relations[id]) && !hasExplicitSupport(state.relations[winner.id])) throw new Error('Inference cannot resolve an explicit conflict');
                state.relations[id].supersededBy.push({ relationId: winner.id, reason: op.reason, ...proof });
                for (const episodeId of proof.episodeIds) addDependency(state, `episode:${episodeId}`, `relation:${id}`);
            }
            state.relations[winner.id].resolutions.push({ loserIds: [...op.loserIds], reason: op.reason, ...proof });
            for (const episodeId of proof.episodeIds) addDependency(state, `episode:${episodeId}`, `relation:${winner.id}`);
            results.push({ id: winner.id });
            continue;
        }
        if (op.action !== 'relation') throw new Error('Invalid graph action');
        const originalSource = entityId(op.sourceId);
        const sourceId = canonicalId(state, originalSource, chat);
        const target = canonicalId(state, targetId, chat);
        if (!activeEntities.has(sourceId) || !activeEntities.has(target)
            || !view.entities.some(entity => entity.id === originalSource && ['active', 'merged'].includes(entity.status))
            || !view.entities.some(entity => entity.id === targetId && ['active', 'merged'].includes(entity.status))) throw new Error('Relation has unresolved or stale endpoints');
        const factId = Number.isInteger(op.factIndex) ? factResults[op.factIndex]?.id : op.factId;
        const fact = activeFacts.get(factId);
        if (!fact) throw new Error('Relation requires an active Fact');
        const predicate = text(op.predicate, 'predicate', 80);
        if (!/^[a-z][a-z0-9_]*$/.test(predicate) || ['similar', 'similarity', 'cosine_similarity', 'similar_to', 'related', 'related_to'].includes(predicate)) throw new Error('Relation predicate must be semantic');
        const policy = op.policy || state.predicates[predicate]?.policy || defaults[predicate]?.policy || 'persistent';
        const exclusiveSide = op.exclusiveSide || state.predicates[predicate]?.exclusiveSide || defaults[predicate]?.exclusiveSide || 'source';
        if (!['persistent', 'replace_current', 'multi_active'].includes(policy) || !['source', 'target'].includes(exclusiveSide)) throw new Error('Invalid relation temporal policy');
        const contract = { policy, exclusiveSide };
        if (state.predicates[predicate] && JSON.stringify(state.predicates[predicate]) !== JSON.stringify(contract)) throw new Error('Predicate policy cannot change within a scope');
        state.predicates[predicate] = contract;
        let relation = Object.values(state.relations).find(item => !item.manualDisabled && item.sourceEntityId === originalSource && item.targetEntityId === targetId && item.predicate === predicate
            && item.validFrom === op.validFrom && item.validUntil === op.validUntil && item.timeOrder === op.timeOrder && item.untilOrder === op.untilOrder && !item.supersededBy.length);
        if (!relation) {
            relation = { id: newId(), scopeId: state.scopeId, sourceEntityId: originalSource, targetEntityId: targetId, predicate,
                label: op.label || predicate, ...contract, supports: [], supersededBy: [], conflictIds: [], resolutions: [], createdAt: now, updatedAt: now };
            for (const field of ['validFrom', 'validUntil', 'timeOrder', 'untilOrder']) {
                if (op[field] !== undefined) {
                    if (!(typeof op[field] === 'string' && ['validFrom', 'validUntil'].includes(field)) && !Number.isFinite(op[field])) throw new Error('Invalid relation time');
                    relation[field] = op[field];
                }
            }
            state.relations[relation.id] = relation;
            if (typeof relation.validFrom === 'number' && typeof relation.validUntil === 'number' && relation.validUntil < relation.validFrom) throw new Error('Invalid relation interval');
            if (Number.isFinite(relation.timeOrder) && Number.isFinite(relation.untilOrder) && relation.untilOrder < relation.timeOrder) throw new Error('Invalid relation interval');
        }
        if (!relation.supports.some(ref => ref.factId === factId && JSON.stringify(ref.evidence) === JSON.stringify(proof.evidence))) relation.supports.push({ factId, ...proof });
        relation.updatedAt = now;
        addDependency(state, `fact:${factId}`, `relation:${relation.id}`);
        addDependency(state, `entity:${originalSource}`, `relation:${relation.id}`);
        addDependency(state, `entity:${targetId}`, `relation:${relation.id}`);
        for (const episodeId of proof.episodeIds) addDependency(state, `episode:${episodeId}`, `relation:${relation.id}`);
        if (policy === 'replace_current' && relation.validUntil === undefined && relation.untilOrder === undefined) {
            const candidate = { ...relation, sourceEntityId: sourceId, targetEntityId: target };
            for (const old of view.relations.filter(item => item.id !== relation.id && ['active', 'disputed'].includes(item.status) && sameSlot(item, candidate) && !sameEndpoints(item, candidate))) {
                const older = temporalOrder(old); const newer = temporalOrder(relation);
                const oldExplicit = hasExplicitSupport(state.relations[old.id]);
                if (fact.type !== 'explicit' && oldExplicit) relation.conflictIds.push(old.id);
                else if (older !== null && newer !== null && newer > older) state.relations[old.id].supersededBy.push({ relationId: relation.id, validUntil: relation.validFrom, untilOrder: newer, ...proof });
                else if (fact.type === 'explicit' && !oldExplicit) state.relations[old.id].conflictIds.push(relation.id);
                else if (older !== null && newer !== null && newer < older) relation.supersededBy.push({ relationId: old.id, validUntil: old.validFrom, untilOrder: older, ...proof });
                else { relation.conflictIds.push(old.id); state.relations[old.id].conflictIds.push(relation.id); }
            }
        }
        results.push({ id: relation.id });
    }
    return { state, results };
}
