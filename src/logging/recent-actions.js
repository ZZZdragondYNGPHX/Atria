import { normalizeLogModule } from './modules.js';
import { redactText, redactValue } from './redact.js';

export const DEFAULT_RECENT_ACTION_CAPACITY = 200;

export class RecentActionStore {
    #entries = [];
    #nextId = 1;
    #capacity;

    constructor({ capacity = DEFAULT_RECENT_ACTION_CAPACITY } = {}) {
        this.#capacity = Math.max(1, Math.floor(Number(capacity) || DEFAULT_RECENT_ACTION_CAPACITY));
    }

    record(input = {}) {
        try {
            const entry = {
                id: this.#nextId++,
                timestamp: Number.isFinite(Number(input.timestamp)) ? Math.max(0, Math.floor(Number(input.timestamp))) : Date.now(),
                module: normalizeLogModule(input.module || 'system', input.side || 'frontend'),
                action: redactText(String(input.action || 'unknown')).slice(0, 160),
                label: redactText(String(input.label || '')).slice(0, 240),
                data: redactValue(input.data ?? {}, { maxDepth: 5, maxArrayLength: 30, maxObjectKeys: 50, maxStringLength: 2000 }),
            };
            this.#entries.push(entry);
            if (this.#entries.length > this.#capacity) {
                this.#entries.splice(0, this.#entries.length - this.#capacity);
            }
            return structuredClone(entry);
        } catch {
            return null;
        }
    }

    queryWindow({ before = Date.now(), after = null, beforeCount = 12, afterCount = 6 } = {}) {
        const pivot = Number(before) || Date.now();
        const afterPivot = after === null ? pivot : Number(after) || pivot;
        const prior = this.#entries.filter(entry => entry.timestamp <= pivot).slice(-Math.max(0, beforeCount));
        const later = this.#entries.filter(entry => entry.timestamp > pivot && entry.timestamp <= afterPivot).slice(0, Math.max(0, afterCount));
        return [...prior, ...later].map(entry => structuredClone(entry));
    }

    clear() {
        this.#entries.length = 0;
    }

    get size() {
        return this.#entries.length;
    }
}
