import { copy } from './contracts.js';

const freeze = value => {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
};

/** Event listeners are projections: failures cannot change execution state. */
export function createEventBus(initialListener) {
    const listeners = new Set(typeof initialListener === 'function' ? [initialListener] : []);
    return {
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        emit(event) {
            for (const listener of [...listeners]) {
                try {
                    const pending = listener(freeze(copy(event)));
                    if (pending?.then) Promise.resolve(pending).catch(() => {});
                } catch { /* Isolate UI observers. */ }
            }
        },
    };
}
