// SPDX-License-Identifier: AGPL-3.0-or-later

import {
    SOURCE_ID_FIELD, normalizeProvenance, emptyProvenance, sourceContent,
    reconcileSources, captureEpisodes, episodesAreCurrent, bindDerivedChanges, projectCurrentSources,
} from './source-provenance.js';
import { applyFactOperations, projectFacts } from './atomic-facts.js';

export const PROVENANCE_NAMESPACE = 'memory_graph__provenance';

let configuredLifecycle = null;
export function configureSourceLifecycle(options) {
    configuredLifecycle = createSourceLifecycle(options);
    return configuredLifecycle;
}
export function projectMemorySources(store, context) {
    return configuredLifecycle?.project(store, context);
}
export function captureMemorySourceSession(context) {
    const chat = context?.chat || [];
    const floors = chat.map((_, index) => index).slice(-2);
    return configuredLifecycle?.capture(context, floors) || Promise.resolve(null);
}
export function assertMemorySourceSession(ticket, context) {
    configuredLifecycle?.assertTicket(ticket, context);
}
export function listMemoryFacts(context, options) {
    return configuredLifecycle?.listFacts(context, options) || Promise.resolve([]);
}
export function writeMemoryFacts(context, operations, ticket) {
    if (!configuredLifecycle) throw new Error('Memory source lifecycle is not initialized');
    return configuredLifecycle.writeFacts(context, operations, ticket);
}

/** Runtime I/O is injected so lifecycle/race tests use the same production path. */
export function createSourceLifecycle({ getContext, resolveScope, enabled, onInvalidation = () => {}, newId = () => crypto.randomUUID() }) {
    const queues = new Map();
    const cache = new Map();
    const observed = new Map();
    const pending = new Map();
    const epochs = new Map();

    function observeMutation(context, floor) {
        const key = resolveScope(context)?.key;
        const id = context.chat?.[floor]?.[SOURCE_ID_FIELD];
        if (!key || !id) return;
        const observationKey = `${key}:${id}`;
        const content = sourceContent(context.chat[floor]);
        const previous = observed.get(observationKey) ?? cache.get(key)?.sources[id]?.content;
        observed.set(observationKey, content);
        if (previous === undefined || previous === content) return;
        const epoch = (epochs.get(key) || 0) + 1;
        epochs.set(key, epoch);
        if (!pending.has(key)) pending.set(key, new Map());
        pending.get(key).set(id, epoch);
        for (const episode of Object.values(cache.get(key)?.episodes || {})) {
            if (episode.messageIds.includes(id)) episode.status = 'stale';
        }
        onInvalidation();
    }

    function abort() {
        return Object.assign(new Error('Memory source or chat changed'), { name: 'AbortError' });
    }

    function session(context) {
        const scope = resolveScope(context);
        if (!scope?.key || !scope.target) throw abort();
        const chat = context.chat;
        const assertLive = () => {
            const live = getContext();
            if (resolveScope(live)?.key !== scope.key || live.chat !== chat) throw abort();
        };
        assertLive();
        return { ...scope, chat, assertLive };
    }

    function enqueue(key, work) {
        const next = (queues.get(key) || Promise.resolve()).catch(() => {}).then(work);
        queues.set(key, next);
        return next.finally(() => { if (queues.get(key) === next) queues.delete(key); });
    }

    async function transaction(context, run, validate = () => {}) {
        const scope = session(context);
        return enqueue(scope.key, async () => {
            scope.assertLive();
            const result = await context.getChatState(PROVENANCE_NAMESPACE, { target: scope.target });
            scope.assertLive();
            if (!result?.ok) throw new Error('Memory provenance read failed');
            if (result.state && result.state.version !== 1) throw new Error('Unsupported memory provenance version');
            const state = normalizeProvenance(result.state);
            state.scopeId ||= scope.key;
            const before = JSON.stringify(state);
            const dirty = new Map(pending.get(scope.key));
            reconcileSources(state, scope.chat, new Set(dirty.keys()));
            const output = await run(state, scope);
            if (state.facts) {
                for (const fact of projectFacts(state, scope.chat, { includeInactive: true })) state.facts[fact.id] = fact;
            }
            scope.assertLive();
            validate();
            if (before !== JSON.stringify(state)) {
                const saved = await context.updateChatState(PROVENANCE_NAMESPACE, () => {
                    scope.assertLive();
                    validate();
                    return state;
                }, { target: scope.target });
                scope.assertLive();
                if (!saved?.ok) throw new Error('Memory provenance write failed');
            }
            cache.set(scope.key, state);
            for (const [id, epoch] of dirty) {
                if (pending.get(scope.key)?.get(id) === epoch) pending.get(scope.key).delete(id);
            }
            return output;
        });
    }

    function project(store, context) {
        // Once evidence exists it must never become active merely by turning the
        // feature flag off. Legacy nodes without evidence retain their behavior.
        const scope = resolveScope(context);
        const state = resolveScope(getContext())?.key === scope?.key
            ? cache.get(scope?.key) || emptyProvenance() : emptyProvenance();
        for (const episode of Object.values(state.episodes)) {
            if (episode.messageIds.some(id => pending.get(scope?.key)?.has(id))) episode.status = 'stale';
        }
        const invalid = projectCurrentSources(store, state, getContext().chat || [], state.scopeId);
        if (invalid.size) onInvalidation();
        return invalid;
    }

    async function refresh(store, context) {
        if (!enabled(context) && !Object.values(store.nodes || {}).some(node => node.memoryOsEvidence)) return new Set();
        try {
            await transaction(context, () => {});
        } catch (error) {
            cache.delete(resolveScope(context)?.key);
            project(store, context);
            throw error;
        }
        return project(store, context);
    }

    async function capture(context, floors, expected = null) {
        if (!enabled(context)) return null;
        const scope = session(context);
        const selected = [...new Set(floors)].filter(floor => Number.isInteger(floor) && scope.chat[floor]);
        if (!selected.length) throw new Error('Memory extraction has no source messages');
        let changed = false;
        for (const floor of selected) {
            const message = scope.chat[floor];
            if (expected && expected[floor] !== sourceContent(message)) throw abort();
            const id = message[SOURCE_ID_FIELD];
            if (typeof id !== 'string' || !id || scope.chat.filter(item => item?.[SOURCE_ID_FIELD] === id).length !== 1) {
                message[SOURCE_ID_FIELD] = newId();
                changed = true;
            }
        }
        if (changed) {
            scope.assertLive();
            await context.saveChat();
            scope.assertLive();
        }
        return transaction(context, (state, current) => {
            if (expected && selected.some(floor => expected[floor] !== sourceContent(current.chat[floor]))) throw abort();
            const episodeIds = captureEpisodes(state, current.chat, selected, state.scopeId);
            return { key: current.key, scopeId: state.scopeId, episodeIds, chat: current.chat, epoch: epochs.get(current.key) || 0,
                sources: episodeIds.map(id => ({ episodeId: id, content: state.episodes[id].content, role: state.episodes[id].role })) };
        });
    }

    function assertTicket(ticket, context) {
        if (!ticket) return;
        const scope = session(context);
        const state = cache.get(scope.key) || emptyProvenance();
        if (scope.key !== ticket.key || scope.chat !== ticket.chat
            || ticket.epoch !== (epochs.get(scope.key) || 0)
            || !episodesAreCurrent(state, ticket.episodeIds, scope.chat, ticket.scopeId)) throw abort();
    }

    async function bind(context, before, after, ticket = null) {
        if (!enabled(context)) return;
        assertTicket(ticket, context);
        await transaction(context, (state, scope) => {
            if (ticket && !episodesAreCurrent(state, ticket.episodeIds, scope.chat, state.scopeId)) throw abort();
            for (const node of Object.values(after.nodes || {})) {
                if (!node.archived && node.memoryOsEvidence
                    && !episodesAreCurrent(state, node.memoryOsEvidence.episodeIds, scope.chat, state.scopeId)) throw abort();
            }
            bindDerivedChanges(state, before, after, ticket?.episodeIds || [], state.scopeId, newId);
            for (const node of Object.values(after.nodes || {})) {
                if (!node.archived && node.memoryOsEvidence
                    && !episodesAreCurrent(state, node.memoryOsEvidence.episodeIds, scope.chat, state.scopeId)) throw abort();
            }
        });
        assertTicket(ticket, context);
    }

    async function inherit(context, payload) {
        if (!enabled(context) || !payload?.sourceTarget || !payload?.targetTarget) return;
        const target = resolveScope(context, payload.targetTarget);
        await enqueue(target.key, async () => {
            const source = await context.getChatState(PROVENANCE_NAMESPACE, { target: payload.sourceTarget });
            if (!source?.ok || !source.state) return;
            // Deliberate branch inheritance preserves original evidence identity.
            // On first load reconciliation soft-invalidates sources outside the branch.
            const result = await context.updateChatState(PROVENANCE_NAMESPACE, () => normalizeProvenance(source.state), { target: payload.targetTarget });
            if (!result?.ok) throw new Error('Memory provenance branch inheritance failed');
            cache.delete(target.key);
        });
    }

    function commitGuard(context, store) {
        const evidence = Object.values(store.nodes || {}).filter(node => !node.archived && node.memoryOsEvidence)
            .map(node => structuredClone(node.memoryOsEvidence));
        if (!enabled(context) && !evidence.length) return undefined;
        const scope = session(context);
        const epoch = epochs.get(scope.key) || 0;
        const validate = () => {
            scope.assertLive();
            const state = cache.get(scope.key) || emptyProvenance();
            if (epoch !== (epochs.get(scope.key) || 0) || evidence.some(ref => ref.scopeId !== state.scopeId
                || !episodesAreCurrent(state, ref.episodeIds, scope.chat, state.scopeId))) throw abort();
        };
        validate();
        return validate;
    }

    async function listFacts(context, options) {
        return transaction(context, (state, scope) => projectFacts(state, scope.chat, options));
    }

    async function writeFacts(context, operations, ticket) {
        if (!enabled(context)) throw new Error('Memory OS is disabled');
        if (!ticket) throw new Error('Facts require a source ticket');
        assertTicket(ticket, context);
        return transaction(context, (state, scope) => {
            const result = applyFactOperations(state, operations, ticket, scope.chat, newId);
            Object.assign(state, result.state);
            return result.results;
        }, () => assertTicket(ticket, context));
    }

    function validateFacts(context, operations, ticket) {
        assertTicket(ticket, context);
        return applyFactOperations(cache.get(session(context).key), operations, ticket, context.chat, newId);
    }

    return { capture, assertTicket, bind, refresh, project, inherit, observeMutation, commitGuard, listFacts, writeFacts, validateFacts };
}
