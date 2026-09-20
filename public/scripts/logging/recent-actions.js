import { normalizeFrontendLogModule } from './modules.js';
import { redactText, redactValue } from './redact.js';

export class RecentUserActionStore {
    #entries = [];
    #nextId = 1;
    #capacity;

    constructor({ capacity = 200 } = {}) {
        this.#capacity = Math.max(1, Math.floor(Number(capacity) || 200));
    }

    record(input = {}) {
        try {
            const entry = {
                id: this.#nextId++,
                timestamp: Number.isFinite(Number(input.timestamp)) ? Math.max(0, Math.floor(Number(input.timestamp))) : Date.now(),
                module: normalizeFrontendLogModule(input.module || 'ui'),
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
}

export const recentUserActionStore = new RecentUserActionStore();
