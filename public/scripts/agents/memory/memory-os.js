// SPDX-License-Identifier: AGPL-3.0-or-later

import * as legacyVectorIndex from './vector-index.js';

// User-level opt-in controlled by the Workspace Memory OS switch. Keep this
// separate from orchestration and automatic legacy memory processing.
export const MEMORY_SOURCE_WRITES_DEFAULT_ENABLED = false;

export function isHybridMemoryEnabled(settings) { return settings?.enabled !== false; }
export function isMemorySourceWriteEnabled(settings) { return settings?.sourceWritesEnabled === true; }

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
/** Shared vector tooling is independent of recall/source-write switches. */
export function getMemoryVectorStore() { return memoryOsVectors; }
