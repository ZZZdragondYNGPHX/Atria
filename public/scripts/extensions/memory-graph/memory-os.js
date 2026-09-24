// SPDX-License-Identifier: AGPL-3.0-or-later

import * as legacyVectorIndex from './vector-index.js';

// User-level opt-in controlled by the Workspace Memory OS switch. Keep this
// separate from orchestration and automatic legacy memory processing.
export const MEMORY_OS_DEFAULT_ENABLED = false;

export function isMemoryOsEnabled(settings) {
    return settings?.memoryOsEnabled === true;
}

/**
 * Provider-independent boundary over the existing node index. Scope, profile,
 * store and AbortSignal are supplied per operation, never captured from the UI.
 * Sync reconciles the complete desired node set against server hashes; it is
 * not an append-only upsert. Removal is hash-based until Phase 2 supplies source
 * provenance. Do not infer source identity from a node's text or array position.
 * @param {object} legacy Existing vector-index operations.
 * @returns {object} Vector operations retaining legacy results and errors.
 */
export function createMemoryVectorAdapter(legacy) {
    return Object.freeze({
        sync: (store, profile, chatKey, options) => legacy.syncVectorIndex(store, profile, chatKey, options),
        search: (query, store, profile, chatKey, options) => legacy.findSimilarNodes(query, store, profile, chatKey, options),
        removeByHashes: (collectionId, profile, hashes, signal) => legacy.deleteVectorItems(collectionId, profile, hashes, signal),
        purge: (collectionId, signal, profile) => legacy.purgeVectorCollection(collectionId, signal, profile),
    });
}

const memoryOsVectors = createMemoryVectorAdapter(legacyVectorIndex);
const legacyVectors = Object.freeze({
    sync: legacyVectorIndex.syncVectorIndex,
    search: legacyVectorIndex.findSimilarNodes,
    removeByHashes: legacyVectorIndex.deleteVectorItems,
    purge: legacyVectorIndex.purgeVectorCollection,
});

/** Select at call time so settings hydration/toggling cannot pin an old mode. */
export function getMemoryVectorStore(settings) {
    return isMemoryOsEnabled(settings) ? memoryOsVectors : legacyVectors;
}
