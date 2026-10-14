// In-process admission only. Native owner/revision transactions remain authoritative.
export class LaneScheduler {
    #pending = [];
    #held = new Set();
    #active = new Map();
    #closed = false;
    constructor({ limits = { control: 8, read: 4, mutation: 4, browser: 1 }, maxQueue = 128, queueTimeout = 30000 } = {}) {
        if (!Object.values(limits).every(n => Number.isInteger(n) && n > 0) || !Number.isInteger(maxQueue) || maxQueue < 1 || !Number.isFinite(queueTimeout) || queueTimeout < 1) throw Error('Invalid scheduler limits');
        this.limits = { ...limits }; this.maxQueue = maxQueue; this.queueTimeout = queueTimeout;
    }
    snapshot() { return { active: Object.fromEntries(this.#active), queued: this.#pending.length, limits: { ...this.limits }, closed: this.#closed }; }
    run(lane, keys, handler, { signal, heldKeys = [] } = {}) {
        if (this.#closed || !this.limits[lane]) return Promise.reject(Error('Scheduler unavailable'));
        if (signal?.aborted) return Promise.reject(signal.reason ?? Error('Cancelled before admission'));
        if (this.#pending.filter(item => item.lane === lane).length >= this.maxQueue) return Promise.reject(Error('Admission queue full'));
        const needed = [...new Set(keys)].filter(key => !heldKeys.includes(key));
        // Reentry is internal, restricted to authority keys already held by a delegated parent.
        if (keys.length && needed.length === 0) return Promise.resolve().then(() => handler(heldKeys));
        return new Promise((resolve, reject) => {
            const item = { lane, keys: needed, handler, heldKeys, signal, resolve, reject };
            const remove = error => {
                const index = this.#pending.indexOf(item);
                if (index < 0) return;
                this.#pending.splice(index, 1); this.#clean(item); reject(error); this.#drain();
            };
            item.onAbort = () => remove(signal.reason ?? Error('Cancelled before admission'));
            item.timer = setTimeout(() => remove(Error('Admission queue timeout')), this.queueTimeout);
            signal?.addEventListener('abort', item.onAbort, { once: true });
            this.#pending.push(item); this.#drain();
        });
    }
    #clean(item) { clearTimeout(item.timer); item.signal?.removeEventListener('abort', item.onAbort); }
    #drain() {
        const waitingKeys = new Set();
        for (let index = 0; index < this.#pending.length;) {
            const item = this.#pending[index];
            if ((this.#active.get(item.lane) ?? 0) >= this.limits[item.lane] || item.keys.some(key => this.#held.has(key) || waitingKeys.has(key))) {
                item.keys.forEach(key => waitingKeys.add(key)); index++; continue;
            }
            this.#pending.splice(index, 1); this.#clean(item);
            this.#active.set(item.lane, (this.#active.get(item.lane) ?? 0) + 1);
            item.keys.forEach(key => this.#held.add(key));
            Promise.resolve().then(() => { item.signal?.throwIfAborted(); return item.handler([...item.heldKeys, ...item.keys]); })
                .then(item.resolve, item.reject).finally(() => {
                    item.keys.forEach(key => this.#held.delete(key));
                    this.#active.set(item.lane, this.#active.get(item.lane) - 1); this.#drain();
                });
        }
    }
    close() {
        this.#closed = true;
        for (const item of this.#pending.splice(0)) { this.#clean(item); item.reject(Error('Scheduler closed before admission')); }
    }
}
