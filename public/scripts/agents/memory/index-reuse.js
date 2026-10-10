// SPDX-License-Identifier: AGPL-3.0-or-later
import { freezeMemoryData, memorySourceSnapshotProof } from './source-lifecycle.js';
import { memoryEligibleSnapshotProof } from './eligibility.js';

// Derived process-local resources only. No saved query answer, rank or prose.
const entries = new Map();
const MAX_ENTRIES = 16, MAX_BYTES = 16 * 1024 * 1024, MAX_ENTRY_BYTES = MAX_BYTES;
let serial = 0, retainedBytes = 0;
export function memoryCorpusReuse(snapshot, at, build) {
    const scoped = memoryEligibleSnapshotProof(snapshot);
    const identity = scoped?.identity ?? memorySourceSnapshotProof(snapshot);
    if (!identity) return { corpus: build(), decision: { status: 'miss', reason: 'authority_proof_unavailable' }, fingerprints: null };
    const domain = JSON.stringify([snapshot.key, scoped?.domain ?? 'conversation', at, 'memory-corpus.v2']);
    for (const [key, entry] of entries) {
        if (entry.identity !== identity || entry.domain !== domain) continue;
        entries.delete(key); entries.set(key, entry);
        return { corpus: { ...entry.corpus, documents: entry.corpus.documents.slice() }, fingerprints: entry.fingerprints,
            decision: { status: 'valid_hit', reason: 'exact_source_authority', savedDocuments: entry.corpus.documents.length } };
    }
    const corpus = build();
    const bytes = new TextEncoder().encode(JSON.stringify(corpus)).length;
    if (bytes > MAX_ENTRY_BYTES || corpus.documents.length > 10000) return { corpus, fingerprints: null,
        decision: { status: 'miss', reason: 'derived_cache_capacity', requiredBytes: bytes, maxBytes: MAX_ENTRY_BYTES } };
    while (entries.size >= MAX_ENTRIES || retainedBytes + bytes > MAX_BYTES) {
        const key = entries.keys().next().value; retainedBytes -= entries.get(key).bytes; entries.delete(key);
    }
    const frozen = freezeMemoryData(corpus);
    const fingerprints = new WeakMap();
    entries.set(++serial, { identity, domain, corpus: frozen, bytes, fingerprints }); retainedBytes += bytes;
    return { corpus: { ...frozen, documents: frozen.documents.slice() }, fingerprints, decision: { status: 'miss', reason: 'dependency_not_cached' } };
}
