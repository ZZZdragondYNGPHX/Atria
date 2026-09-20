import { normalizeFrontendLogEntry } from './model.js';
import { queryFrontendLogEntries } from './query.js';

export const DEFAULT_FRONTEND_LOG_CAPACITY = 3000;

export class FrontendLogStore {
    #entries = [];
    #nextId = 1;
    #capacity;

    constructor({ capacity = DEFAULT_FRONTEND_LOG_CAPACITY } = {}) {
        this.#capacity = Math.max(1, Math.floor(Number(capacity) || DEFAULT_FRONTEND_LOG_CAPACITY));
    }

    append(input = {}) {
        const entry = normalizeFrontendLogEntry(input);
        entry.id = this.#nextId++;
        this.#entries.push(entry);
        if (this.#entries.length > this.#capacity) {
            this.#entries.splice(0, this.#entries.length - this.#capacity);
        }
        return structuredClone(entry);
    }

    query(options = {}) {
        return {
            entries: queryFrontendLogEntries(this.#entries, options).map(entry => structuredClone(entry)),
            latestId: this.latestId,
        };
    }

    clear() {
        this.#entries.length = 0;
    }

    get latestId() {
        return this.#entries.length ? this.#entries[this.#entries.length - 1].id : 0;
    }

    get size() {
        return this.#entries.length;
    }
}
