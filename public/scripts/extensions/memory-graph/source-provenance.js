// SPDX-License-Identifier: AGPL-3.0-or-later

export const SOURCE_ID_FIELD = 'memory_os_source_id';

export function emptyProvenance() {
    return { version: 1, scopeId: '', sources: {}, episodes: {}, dependencies: [] };
}

export function normalizeProvenance(raw) {
    const state = emptyProvenance();
    if (!raw || raw.version !== 1) return state;
    state.scopeId = String(raw.scopeId || '');
    for (const key of ['sources', 'episodes', 'facts', 'entities', 'relations', 'entityPending', 'predicates', 'providerSources', 'providerSnapshots', 'corrections', 'historyBuild']) {
        if (raw[key] && typeof raw[key] === 'object' && !Array.isArray(raw[key])) {
            state[key] = structuredClone(raw[key]);
        }
    }
    state.dependencies = Array.isArray(raw.dependencies) ? structuredClone(raw.dependencies) : [];
    return state;
}

// Exact source comparison, deliberately not the legacy 32-bit vector hash.
export function sourceContent(message) {
    return JSON.stringify([
        String(message?.mes || ''), String(message?.name || ''),
        Boolean(message?.is_user), Boolean(message?.is_system),
        Number.isInteger(message?.swipe_id) ? message.swipe_id : 0,
    ]);
}

export function descendants(dependencies, roots) {
    const children = new Map();
    for (const edge of dependencies) {
        if (!children.has(edge.parent)) children.set(edge.parent, []);
        children.get(edge.parent).push(edge.child);
    }
    const seen = new Set(roots);
    const queue = [...seen];
    for (let i = 0; i < queue.length; i++) {
        for (const child of children.get(queue[i]) || []) {
            if (!seen.has(child)) { seen.add(child); queue.push(child); }
        }
    }
    return seen;
}

export function addDependency(state, parent, child) {
    if (!state.dependencies.some(edge => edge.parent === parent && edge.child === child)) {
        state.dependencies.push({ parent, child });
    }
}

function sourceLookup(chat) {
    const result = new Map();
    for (let floor = 0; floor < chat.length; floor++) {
        const id = chat[floor]?.[SOURCE_ID_FIELD];
        if (typeof id !== 'string' || !id) continue;
        // Duplicate imported IDs cannot prove which message was the source.
        result.set(id, result.has(id) ? null : { message: chat[floor], floor });
    }
    return result;
}

/** Reconcile only previously tracked sources. Never extract old history on load. */
export function reconcileSources(state, chat, forced = new Set()) {
    const current = sourceLookup(chat);
    const invalidated = [];
    for (const [id, source] of Object.entries(state.sources)) {
        const found = current.get(id);
        const content = found ? sourceContent(found.message) : null;
        if (!forced.has(id) && source.content === content && source.floor === found?.floor && source.status === 'active') continue;
        if (!found && source.status === 'deleted') continue;
        source.revision += 1;
        source.content = content;
        source.floor = found?.floor ?? source.floor;
        source.status = found ? 'active' : 'deleted';
        for (const episode of Object.values(state.episodes)) {
            if (episode.messageIds.includes(id) && episode.status === 'active') {
                episode.status = found ? 'stale' : 'deleted';
                invalidated.push(`episode:${episode.id}`);
            }
        }
    }
    return descendants(state.dependencies, invalidated);
}

/** Ingest a bounded caller-selected batch; IDs must already be persisted on messages. */
export function captureEpisodes(state, chat, floors, scopeId, now = Date.now()) {
    reconcileSources(state, chat);
    const lookup = sourceLookup(chat);
    const ids = [];
    for (const floor of new Set(floors)) {
        const message = chat[floor];
        const id = message?.[SOURCE_ID_FIELD];
        if (!id || lookup.get(id)?.floor !== floor) throw new Error('Ambiguous memory source identity');
        if (!state.sources[id]) {
            state.sources[id] = { revision: 1, content: sourceContent(message), floor, status: 'active' };
        }
        const source = state.sources[id];
        const episodeId = `${id}:${source.revision}`;
        if (!state.episodes[episodeId]) {
            state.episodes[episodeId] = {
                id: episodeId, scopeId, chatId: scopeId, messageIds: [id],
                content: String(message.mes || ''), role: message.is_user ? 'user' : message.is_system ? 'system' : 'assistant',
                createdAt: now, sourceRevision: source.revision, sourceContent: source.content,
                sourceFloor: floor, status: 'active',
            };
            addDependency(state, `message:${id}`, `episode:${episodeId}`);
        }
        ids.push(episodeId);
    }
    return ids;
}

export function episodesAreCurrent(state, ids, chat, scopeId, lookup = sourceLookup(chat)) {
    return ids.length > 0 && ids.every(id => {
        const episode = state.episodes[id];
        const found = lookup.get(episode?.messageIds?.[0]);
        return episode?.status === 'active' && episode.scopeId === scopeId && found
            && found.floor === episode.sourceFloor && sourceContent(found.message) === episode.sourceContent;
    });
}

export function copyEvidence(value) {
    if (!value || typeof value.scopeId !== 'string' || typeof value.id !== 'string' || !Array.isArray(value.episodeIds)) return undefined;
    return { id: value.id, scopeId: value.scopeId, episodeIds: [...new Set(value.episodeIds.filter(id => typeof id === 'string'))] };
}

/** Bind changed nodes/links/rollups, including their pre-existing graph context. */
export function bindDerivedChanges(state, before, after, episodeIds, scopeId, newId) {
    const inherited = [...Object.values(before.nodes || {}), ...Object.values(after.nodes || {})]
        .filter(node => !node.archived).flatMap(node => node.memoryOsEvidence?.episodeIds || []);
    const evidenceIds = [...new Set([...episodeIds, ...inherited])];
    if (!evidenceIds.length) return;
    const changed = new Set();
    for (const [id, node] of Object.entries(after.nodes || {})) {
        if (JSON.stringify(node) !== JSON.stringify(before.nodes?.[id])) changed.add(id);
    }
    if (JSON.stringify(before.edges || []) !== JSON.stringify(after.edges || [])) {
        // A link mutation can leave both node payloads unchanged. Bind endpoints too.
        for (const edge of [...(before.edges || []), ...(after.edges || [])]) {
            changed.add(edge.from); changed.add(edge.to);
        }
    }
    for (const id of changed) {
        const node = after.nodes[id];
        if (!node) continue;
        const revisionId = newId();
        node.memoryOsEvidence = { id: revisionId, scopeId, episodeIds: evidenceIds };
        for (const episodeId of evidenceIds) addDependency(state, `episode:${episodeId}`, `node:${revisionId}`);
        for (const childId of node.childrenIds || []) {
            const child = after.nodes[childId]?.memoryOsEvidence;
            if (child) addDependency(state, `node:${child.id}`, `node:${revisionId}`);
        }
    }
    for (const edge of after.edges || []) {
        const from = after.nodes[edge.from]?.memoryOsEvidence;
        const to = after.nodes[edge.to]?.memoryOsEvidence;
        if (from && to) addDependency(state, `node:${from.id}`, `relation:${from.id}:${edge.type}:${to.id}`);
        if (from && to) addDependency(state, `node:${to.id}`, `relation:${from.id}:${edge.type}:${to.id}`);
    }
}

/** Fail closed for missing evidence, e.g. imported graph without its source ledger. */
export function projectCurrentSources(store, state, chat, scopeId) {
    const invalidIds = new Set();
    const excludedIds = new Set();
    const lookup = sourceLookup(chat);
    for (const [id, node] of Object.entries(store.nodes || {})) {
        const evidence = node.memoryOsEvidence;
        if (evidence && (evidence.scopeId !== scopeId || !episodesAreCurrent(state, evidence.episodeIds, chat, scopeId, lookup))) {
            if (!node.archived) invalidIds.add(id);
            node.archived = true;
            excludedIds.add(id);
        }
    }
    // Existing consumers filter archived nodes. Remove edges so edge-only APIs are safe too.
    store.edges = (store.edges || []).filter(edge => !excludedIds.has(edge.from) && !excludedIds.has(edge.to));
    if (invalidIds.size) {
        store.lastRecallTrace = [];
        store.lastRecallProjection = null;
    }
    return invalidIds;
}

/** User corrections are explicit scope-local sources, never fabricated Episodes. */
export function isCurrentMemorySupport(state, ref, chat) {
    if (ref?.manualId) return state.corrections?.[ref.manualId]?.scopeId === state.scopeId
        && Array.isArray(ref.episodeIds) && (!ref.episodeIds.length || episodesAreCurrent(state, ref.episodeIds, chat, state.scopeId));
    return Array.isArray(ref?.episodeIds) && episodesAreCurrent(state, ref.episodeIds, chat, state.scopeId);
}
