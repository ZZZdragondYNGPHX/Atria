/** Event listeners are projections: failures cannot change execution state. */
export function createEventBus() {
    const listeners = new Set();
    return {
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        emit(event) {
            for (const listener of [...listeners]) {
                try { listener(Object.freeze({ ...event })); } catch { /* Isolate UI observers. */ }
            }
        },
    };
}
