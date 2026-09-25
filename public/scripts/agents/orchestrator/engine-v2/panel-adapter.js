import { getCurrentRun, appendRound, ensureSection } from '../run-state/store.js';

/** Recreate disposable view slots after recovery; never restore execution from UI. */
export function ensureEngineRound(runId, id) {
    if (!runId) return;
    const current = getCurrentRun();
    if (current?.runId !== runId) throw new Error('Engine panel scope changed');
    if (!current.rounds.some(round => round.id === id)) appendRound({ runId, round: { id } });
}

export function ensureEngineSection(runId, roundId, section) {
    ensureEngineRound(runId, roundId);
    return ensureSection({ runId, roundId, section });
}
