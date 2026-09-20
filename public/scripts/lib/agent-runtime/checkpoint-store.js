import { copy } from './contracts.js';

/** Execution-only CAS store. Not durable; host persistence is a later adapter. */
export class MemoryCheckpointStore {
    #runs = new Map();

    load(runId) {
        const state = this.#runs.get(runId);
        return state ? copy(state) : null;
    }

    save(state, expectedVersion) {
        const current = this.#runs.get(state.runId);
        if ((current?.checkpointVersion ?? 0) !== expectedVersion) throw new Error('Checkpoint conflict');
        if (state.checkpointVersion !== expectedVersion + 1) throw new Error('Non-monotone checkpoint');
        this.#runs.set(state.runId, copy(state));
    }
}
