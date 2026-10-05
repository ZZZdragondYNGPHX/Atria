// Host supplies only its accepted immutable Session snapshot. This lane is player
// testimony, never a World fact, and never reads the account Persona library.
export function playerPersonaContext(snapshot, { enabled = false, seatId, blockedReason } = {}) {
    const state = snapshot.states?.atri_player_persona;
    const selection = state ? (seatId ? state.seats?.[seatId] : state.solo) : undefined;
    const evidence = { schemaVersion: 1, ref: selection?.ref ?? null, snapshotHash: selection?.snapshotHash ?? null,
        authority: 'player_provided', providerId: 'context.player-persona', reason: blockedReason ?? (!state ? 'legacy_unbound' : !selection ? 'none'
            : !enabled ? 'not_consumed' : !selection.snapshot.description ? 'empty' : 'candidate'), ...(seatId ? { seatId } : {}) };
    if (evidence.reason !== 'candidate') return { evidence, items: [] };
    const id = 'persona:' + selection.snapshotHash;
    return { evidence: { ...evidence, contextItemId: id }, items: [{ contextItemId: id, lane: 'player_persona',
        authority: 'player_provided', authorityRank: 10, priority: 0, content: selection.snapshot.description,
        sourceRefs: [{ kind: 'player_persona', ...selection.ref, snapshotHash: selection.snapshotHash }],
        metadata: { providerId: 'context.player-persona', authority: 'player_provided', ref: selection.ref, snapshotHash: selection.snapshotHash } }] };
}
