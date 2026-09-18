/**
 * Wire snapshots used by chat diff/conflict recovery, not a second chat store.
 * Retain the active target plus one recently used inactive target. A write hold
 * protects every queued write until the queue drains, including failure paths.
 * Values are cloned by the existing callers; eviction never changes live chat.
 */
export class ChatSnapshotCache {
    #entries = new Map();
    #writeHolds = 0;
    #activeKey;
    #inactiveLimit;

    constructor({ activeKey, inactiveLimit = 1 }) {
        if (!Number.isInteger(inactiveLimit) || inactiveLimit < 0) {
            throw new RangeError('inactiveLimit must be a non-negative integer');
        }
        this.#activeKey = activeKey;
        this.#inactiveLimit = inactiveLimit;
    }

    get size() { return this.#entries.size; }

    get(key, kind) {
        const entry = this.#entries.get(key);
        if (!entry) return undefined;
        this.#entries.delete(key);
        this.#entries.set(key, entry);
        return entry[kind];
    }

    set(key, kind, value) {
        if (!key) return;
        const entry = this.#entries.get(key) ?? {};
        entry[kind] = value;
        this.#entries.delete(key);
        this.#entries.set(key, entry);
        this.prune();
    }

    delete(key, kind) {
        if (!kind) return this.#entries.delete(key);
        const entry = this.#entries.get(key);
        if (!entry) return false;
        delete entry[kind];
        if (Object.keys(entry).length === 0) this.#entries.delete(key);
        return true;
    }

    holdWrites() {
        this.#writeHolds++;
        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.#writeHolds--;
            this.prune();
        };
    }

    prune() {
        if (this.#writeHolds > 0) return;
        const active = this.#activeKey();
        let inactive = this.#entries.size - Number(this.#entries.has(active));
        for (const key of this.#entries.keys()) {
            if (inactive <= this.#inactiveLimit) break;
            if (key === active) continue;
            this.#entries.delete(key);
            inactive--;
        }
    }
}
