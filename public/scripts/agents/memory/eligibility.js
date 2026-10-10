// SPDX-License-Identifier: AGPL-3.0-or-later
import { informationContext } from '../../../shared/native-information-runtime.js';
import { nativeSessionRuntime } from '../../native/session-runtime.js';
import { sourceMessageId, createMemorySupportChecker } from './source-provenance.js';

const denied = () => Object.assign(new Error('Memory source exposure unavailable'), { code: 'memory_exposure_denied' });
const stale = () => Object.assign(new Error('Memory requester or anchor changed'), { name: 'AbortError' });
const snapshotFor = context => context.nativeSnapshot || (nativeSessionRuntime.active ? nativeSessionRuntime.snapshot : null);

/** Resolve from the host's selected snapshot and Information authority, never caller-supplied source IDs/grants. */
export function resolveMemoryEligibility(context, { requester = { kind: 'narrator' }, informationTaskId, at = null } = {}) {
    if (!['narrator', 'actor', 'task'].includes(requester?.kind)
        || (requester.kind === 'actor' && !String(requester.id || '').trim())
        || (requester.kind === 'task' && !String(informationTaskId || '').trim())) throw denied();
    const target = Object.freeze({ kind: requester.kind, ...(requester.id ? { id: String(requester.id) } : {}) });
    const read = () => {
        const snapshot = snapshotFor(context);
        if (!snapshot) {
            if (target.kind !== 'narrator' || !Array.isArray(context.chat)) throw denied();
            return { identity: { kind: 'conversation', requester: target, at }, ids: context.chat.map(sourceMessageId).filter(Boolean),
                signature: JSON.stringify(context.chat.map(m => [sourceMessageId(m), m.mes, m.swipe_id])) };
        }
        const information = informationContext(snapshot, target, informationTaskId);
        if (!information?.memory || !information.projection
            || information.projection.availability?.some(a => !a.available)) throw denied();
        const timeline = new Map(snapshot.timeline.map(entry => [entry.messageId, entry]));
        const ids = new Set();
        for (const item of information.projection.items) {
            if (item.variantId && timeline.get(item.recordId)?.activeVariantId === item.variantId) ids.add(item.recordId);
            // An application exposure only proves the complete source when it
            // exposes that exact content too. A reference/summary alone cannot
            // grant the rest of a hidden Episode.
            for (const id of Array.isArray(item.data?.sourceMessageIds) ? item.data.sourceMessageIds : []) {
                const entry = timeline.get(id);
                if (entry && item.data.text === entry.content) ids.add(id);
            }
        }
        return { identity: { kind: 'information', requester: target, at, anchor: information.projection.anchor, viewId: information.projection.viewId },
            ids: [...ids], signature: JSON.stringify([information, snapshot.timeline]) };
    };
    const initial = read();
    const assertCurrent = () => {
        let live; try { live = read(); } catch { throw stale(); }
        if (live.signature !== initial.signature || JSON.stringify(live.identity) !== JSON.stringify(initial.identity)) throw stale();
    };
    return Object.freeze({ identity: initial.identity, sourceMessageIds: Object.freeze(initial.ids), assertCurrent,
        // Scene identities and aliases are taken from source-backed graph by
        // the query planner; arbitrary caller text is never an authority.
    });
}

/** Short-lived legal subgraph; do not mutate or rewrite the original ledger. */
export function eligibleMemorySnapshot(snapshot, eligibility) {
    eligibility.assertCurrent(); snapshot.assertCurrent();
    const ids = new Set(eligibility.sourceMessageIds);
    const check = createMemorySupportChecker(snapshot.state, snapshot.chat);
    const episodes = Object.fromEntries(Object.entries(snapshot.state.episodes).filter(([, e]) => e.messageIds.length
        && e.messageIds.every(id => ids.has(id)) && check({ episodeIds: [e.id] })));
    const state = structuredClone(snapshot.state);
    state.episodes = episodes;
    state.sources = Object.fromEntries(Object.entries(state.sources).filter(([id]) => ids.has(id)));
    const restricted = eligibility.identity.kind === 'information';
    if (restricted) {
        state.externalSources = {}; state.providerSources = {}; state.providerSnapshots = {}; state.corrections = {};
    }
    const legal = ref => Array.isArray(ref?.episodeIds) && ref.episodeIds.every(id => episodes[id])
        && (!restricted || !ref.manualId && !(ref.externalSourceIds || []).length)
        && check(ref);
    state.facts = Object.fromEntries(Object.entries(state.facts || {}).flatMap(([id, fact]) => {
        const supports = fact.supports.filter(legal);
        return supports.length ? [[id, { ...fact, supports }]] : [];
    }));
    state.entities = Object.fromEntries(Object.entries(state.entities || {}).flatMap(([id, entity]) => {
        const names = entity.names.filter(legal);
        return names.length ? [[id, { ...entity, canonicalName: names[0].name, displayName: names[0].name, names, merges: entity.merges.filter(legal) }]] : [];
    }));
    state.relations = Object.fromEntries(Object.entries(state.relations || {}).flatMap(([id, relation]) => {
        const supports = relation.supports.filter(ref => legal(ref) && state.facts[ref.factId]);
        return supports.length && state.entities[relation.sourceEntityId] && state.entities[relation.targetEntityId]
            ? [[id, { ...relation, supports, resolutions: (relation.resolutions || []).filter(legal), supersededBy: (relation.supersededBy || []).filter(legal) }]] : [];
    }));
    const assertCurrent = () => { snapshot.assertCurrent(); eligibility.assertCurrent(); };
    return { ...snapshot, state, chat: snapshot.chat.map(message => ids.has(sourceMessageId(message)) ? message : {}),
        eligibility, assertCurrent, recordAccess: async selected => { assertCurrent(); await snapshot.recordAccess?.(selected); assertCurrent(); } };
}
