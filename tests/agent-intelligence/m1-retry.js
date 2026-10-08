import { setTimeout as delay } from 'node:timers/promises';

// Explicit M1 CLI policy. Each attempt must call the original funded send.
export class M1RetryPolicy {
    constructor({ wait = (signal => delay(10000, undefined, { signal })), snapshot = {}, onChange = () => {} } = {}) {
        this.wait = wait;
        this.connections = new Map(Object.entries(snapshot).map(([key, state]) => {
            if (!state || Object.keys(state).sort().join(',') !== 'consecutive,recent,stopped' || !Number.isInteger(state.consecutive) || state.consecutive < 0
                || !Array.isArray(state.recent) || state.recent.length > 20 || state.recent.some(v => typeof v !== 'boolean')
                || state.stopped !== null && !/^m1_[a-z_0-9]+$/.test(state.stopped)) throw new Error('invalid_transport_checkpoint');
            return [key, structuredClone(state)];
        }));
        this.onChange = onChange;
    }
    state(key) {
        if (!this.connections.has(key)) this.connections.set(key, { consecutive: 0, recent: [], stopped: null });
        return this.connections.get(key);
    }
    transient(code) { return /^m1_http_5\d\d$/.test(code) || code === 'm1_transport_failed'; }
    observe(key, code = null) {
        const state = this.state(key);
        state.recent.push(Boolean(code)); state.recent = state.recent.slice(-20);
        state.consecutive = code ? state.consecutive + 1 : 0;
        if (code && (!this.transient(code) || state.consecutive >= 3 || state.recent.filter(Boolean).length >= 6)) state.stopped = code;
        this.onChange(Object.fromEntries(this.connections));
    }
    assertAvailable(key) {
        const reason = this.state(key).stopped;
        if (reason) throw Object.assign(new Error(reason), { code: reason });
    }
    async send(key, operation, signal) {
        for (let attempt = 0; attempt < 3; attempt++) {
            this.assertAvailable(key);
            signal.throwIfAborted();
            try { return await operation(attempt); }
            catch (error) {
                // The original HTTP adapter deliberately wraps fetch errors.
                // Retry that wrapper only after this transport observed a fail.
                const retryable = this.transient(error.code) || error.kind === 'transport' && this.state(key).consecutive > 0;
                if (!retryable || this.state(key).stopped || attempt === 2 || signal.aborted) throw error;
                await this.wait(signal);
            }
        }
    }
}
