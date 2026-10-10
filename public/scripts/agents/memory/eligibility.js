// SPDX-License-Identifier: AGPL-3.0-or-later
import { informationContext, informationSourceMessageIds } from '../../../shared/native-information-runtime.js';
import { nativeSessionRuntime } from '../../native/session-runtime.js';
import { sourceMessageId, createMemorySupportChecker, captureEpisodes } from './source-provenance.js';

const denied = () => Object.assign(new Error('Memory source exposure unavailable'), { code: 'memory_exposure_denied' });
const stale = () => Object.assign(new Error('Memory requester or anchor changed'), { name: 'AbortError' });
const snapshotFor = context => {
    const live = nativeSessionRuntime.active ? nativeSessionRuntime.snapshot : null;
    const pinned = context.nativeSnapshot;
    if (pinned && live && (pinned.session.sessionId !== live.session.sessionId
        || pinned.revision.branchId !== live.revision.branchId || pinned.revision.revisionId !== live.revision.revisionId)) throw stale();
    return pinned || live;
};

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
        const ids = informationSourceMessageIds(snapshot, information);
        const groups = information.projection.items.filter(item => typeof item.data?.atomicGroup === 'string'
            && Array.isArray(item.data?.atomicSourceMessageIds)).map(item => ({ id: item.data.atomicGroup,
            sourceMessageIds: [...new Set(item.data.atomicSourceMessageIds)] }));
        const deniedIds = new Set(groups.filter(group => !group.sourceMessageIds.every(id => ids.includes(id))).flatMap(group => group.sourceMessageIds));
        return { identity: { kind: 'information', requester: target, at, anchor: information.projection.anchor, viewId: information.projection.viewId },
            ids: ids.filter(id => !deniedIds.has(id)), groups: groups.filter(group => group.sourceMessageIds.every(id => ids.includes(id))),
            signature: JSON.stringify([information, snapshot.timeline]) };
    };
    const initial = read();
    const assertCurrent = () => {
        let live; try { live = read(); } catch { throw stale(); }
        if (live.signature !== initial.signature || JSON.stringify(live.identity) !== JSON.stringify(initial.identity)) throw stale();
    };
    return Object.freeze({ identity: initial.identity, sourceMessageIds: Object.freeze(initial.ids), assertCurrent,
        atomicGroups: Object.freeze(initial.groups || []),
        // Scene identities and aliases are taken from source-backed graph by
        // the query planner; arbitrary caller text is never an authority.
    });
}

/** Short-lived legal subgraph; do not mutate or rewrite the original ledger. */
export function eligibleMemorySnapshot(snapshot, eligibility) {
    eligibility.assertCurrent(); snapshot.assertCurrent();
    const ids = new Set(eligibility.sourceMessageIds);
    const state = structuredClone(snapshot.state);
    // Existing Native Timeline is itself a formal source. Rebuild its legal
    // Episode projection in memory even when extraction writes are off; no
    // new source IDs, persistence or cognition changes are performed here.
    if (eligibility.identity.kind === 'information') {
        const floors = snapshot.chat.flatMap((message, floor) => message.atri_native?.messageId && ids.has(sourceMessageId(message)) ? [floor] : []);
        captureEpisodes(state, snapshot.chat, floors, state.scopeId);
    }
    const check = createMemorySupportChecker(state, snapshot.chat);
    const episodes = Object.fromEntries(Object.entries(state.episodes).filter(([, e]) => e.messageIds.length
        && e.messageIds.every(id => ids.has(id)) && check({ episodeIds: [e.id] })));
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
