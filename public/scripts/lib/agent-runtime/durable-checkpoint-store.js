import { copy, requireId, STATUSES } from './contracts.js';

export class CheckpointPersistenceError extends Error {
    constructor(cause) {
        super(`Checkpoint persistence failed: ${cause.message}`, { cause });
        this.name = 'CheckpointPersistenceError';
    }
}

function validate(state, runId) {
    if (!state) return;
    if (state.schemaVersion !== 1 || state.runId !== runId || !STATUSES.includes(state.status)
        || !Number.isSafeInteger(state.checkpointVersion) || state.checkpointVersion < 1
        || !Number.isSafeInteger(state.generation) || state.generation < 1
        || !state.completedEffects || !Array.isArray(state.scratch)) {
        throw new Error('Invalid or unsupported checkpoint');
    }
}

/** Synchronous Runtime view with an awaited, transactional persistence barrier.
 * backend.compareAndSet must atomically read/check/write; a settings debounce is insufficient.
 * A failed write poisons this instance. Reopen from durable truth before attempting recovery.
 */
export class DurableCheckpointStore {
    #state;
    #pending = Promise.resolve();
    #failure;

    static async open({ backend, runId }) {
        requireId(runId, 'runId');
        const state = await backend.load(runId);
        validate(state, runId);
        return new DurableCheckpointStore(backend, runId, state);
    }

    constructor(backend, runId, state) {
        this.backend = backend;
        this.runId = runId;
        this.#state = state ? copy(state) : null;
    }

    load(runId) {
        if (runId !== this.runId) throw new Error('Checkpoint scope mismatch');
        return this.#state ? copy(this.#state) : null;
    }

    save(state, expectedVersion) {
        if (this.#failure) throw this.#failure;
        validate(state, this.runId);
        if ((this.#state?.checkpointVersion ?? 0) !== expectedVersion
            || state.checkpointVersion !== expectedVersion + 1) throw new Error('Checkpoint conflict');
        const next = copy({ ...state, updatedAt: Date.now() });
        this.#state = next;
        this.#pending = this.#pending.then(async () => {
            if (this.#failure) return;
            try { await this.backend.compareAndSet(copy(next), expectedVersion); } catch (error) { this.#failure = new CheckpointPersistenceError(error); }
        });
    }

    async flush() {
        // Cancellation may append writes while a previous transaction is in flight.
        let pending;
        do { pending = this.#pending; await pending; } while (pending !== this.#pending);
        if (this.#failure) throw this.#failure;
    }
}
