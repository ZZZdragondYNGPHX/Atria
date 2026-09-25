// SPDX-License-Identifier: AGPL-3.0-or-later
import { sourceContent, addDependency } from './source-provenance.js';

const proof = (chat, floor) => chat.slice(0, floor + 1).map(sourceContent);
export function providerProofCurrent(snapshot, chat) {
    return snapshot.floor >= 0 && JSON.stringify(proof(chat, snapshot.floor)) === JSON.stringify(snapshot.source);
}

/** Immutable revisions in the existing ledger, not a second writable state store. */
export function reconcileProviders(state, providers, chat, newId, now = Date.now()) {
    state.providerSources ||= {};
    state.providerSnapshots ||= {};
    const seen = new Set();
    for (const provider of providers) {
        seen.add(provider.providerId);
        const previous = state.providerSources[provider.providerId];
        const signature = JSON.stringify([provider.status, provider.revision, provider.fields, provider.floor, provider.committedSource]);
        const old = state.providerSnapshots[previous?.snapshotId];
        const previousProof = old || state.providerSnapshots[previous?.lastSnapshotId];
        // MVU has a pre-commit update event, not a post-commit receipt. After a
        // source edit, an unchanged old table is not evidence for the new text.
        const uncommittedEdit = provider.providerId === 'mvu' && previousProof && !providerProofCurrent(previousProof, chat)
            && previous?.revision === provider.revision && provider.committedSource !== sourceContent(chat[provider.floor]);
        const status = uncommittedEdit ? 'initializing' : provider.status;
        if (previous?.signature === signature && (!old || providerProofCurrent(old, chat))) continue;
        if (old?.status === 'active') {
            old.status = status === 'ready' && provider.floor > old.floor && providerProofCurrent(old, chat) ? 'superseded' : 'stale';
        }
        let snapshotId = null;
        if (status === 'ready' && provider.floor >= 0) {
            snapshotId = newId();
            state.providerSnapshots[snapshotId] = { id: snapshotId, providerId: provider.providerId, scopeId: state.scopeId,
                floor: provider.floor, source: proof(chat, provider.floor), fields: structuredClone(provider.fields),
                contract: provider.contract, createdAt: now, status: 'active' };
            for (const field of provider.fields) addDependency(state, `provider:${snapshotId}`, `state:${snapshotId}:${JSON.stringify(field.path)}`);
        }
        state.providerSources[provider.providerId] = { signature, revision: provider.revision, status, snapshotId,
            lastSnapshotId: snapshotId || previous?.lastSnapshotId || old?.id || null };
    }
    for (const [id, source] of Object.entries(state.providerSources)) {
        if (!seen.has(id)) {
            if (state.providerSnapshots[source.snapshotId]) state.providerSnapshots[source.snapshotId].status = 'stale';
            source.status = 'absent'; source.snapshotId = null;
        }
    }
    for (const snapshot of Object.values(state.providerSnapshots)) {
        if (!providerProofCurrent(snapshot, chat)) snapshot.status = 'stale';
    }
}

export function projectProviders(state, chat) {
    return Object.entries(state.providerSources || {}).map(([providerId, source]) => {
        const snapshot = state.providerSnapshots?.[source.snapshotId];
        const ready = source.status === 'ready' && snapshot?.status === 'active' && providerProofCurrent(snapshot, chat);
        return { providerId, status: ready ? 'ready' : source.status === 'ready' ? 'error' : source.status,
            snapshotId: ready ? snapshot.id : null, fields: ready ? structuredClone(snapshot.fields) : [] };
    });
}
