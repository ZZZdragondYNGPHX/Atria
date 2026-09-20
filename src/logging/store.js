import { normalizeLogEntry } from './model.js';
import { queryLogEntries } from './query.js';

export const DEFAULT_BACKEND_LOG_CAPACITY = 5000;

export class LogStore {
    #entries = [];
    #nextId = 1;
    #capacity;
    #side;

    constructor({ capacity = DEFAULT_BACKEND_LOG_CAPACITY, side = 'backend' } = {}) {
        this.#capacity = Math.max(1, Math.floor(Number(capacity) || DEFAULT_BACKEND_LOG_CAPACITY));
        this.#side = side;
    }

    append(input = {}) {
        const entry = normalizeLogEntry(input, { side: this.#side });
        entry.id = this.#nextId++;
        this.#entries.push(entry);
        if (this.#entries.length > this.#capacity) {
            this.#entries.splice(0, this.#entries.length - this.#capacity);
        }
        return structuredClone(entry);
    }

    query(options = {}) {
        return {
            entries: queryLogEntries(this.#entries, options).map(entry => structuredClone(entry)),
            latestId: this.latestId,
        };
    }

    getByIds(ids = []) {
        const wanted = new Set(ids.map(id => Number(id)).filter(Number.isFinite));
        return this.#entries.filter(entry => wanted.has(entry.id)).map(entry => structuredClone(entry));
    }

    clear() {
        this.#entries.length = 0;
    }

    get size() {
        return this.#entries.length;
    }

    get latestId() {
        return this.#entries.length ? this.#entries[this.#entries.length - 1].id : 0;
    }
}
