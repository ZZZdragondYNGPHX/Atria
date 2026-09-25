export const NATIVE_SESSION_LIFECYCLE = Object.freeze({
    TIMELINE_APPENDED: 'TIMELINE_APPENDED',
    REVISION_COMMITTED: 'REVISION_COMMITTED',
    REVISION_RESTORED: 'REVISION_RESTORED',
    BRANCH_ACTIVATED: 'BRANCH_ACTIVATED',
    SESSION_METADATA_CHANGED: 'SESSION_METADATA_CHANGED',
    SESSION_LOADED: 'SESSION_LOADED',
    DRAFT_ABORTED: 'DRAFT_ABORTED',
});

const listeners = new Map(
    Object.values(NATIVE_SESSION_LIFECYCLE).map(type => [type, new Set()]),
);

export function onNativeSessionLifecycle(type, listener) {
    const bucket = listeners.get(type);
    if (!bucket) throw new TypeError(`Unknown Native Session lifecycle '${String(type)}'`);
    if (typeof listener !== 'function') throw new TypeError('Native Session lifecycle listener must be a function');
    bucket.add(listener);
    return () => bucket.delete(listener);
}

export async function emitNativeSessionLifecycle(type, payload = {}) {
    const bucket = listeners.get(type);
    if (!bucket) throw new TypeError(`Unknown Native Session lifecycle '${String(type)}'`);
    const event = Object.freeze({ type, ...structuredClone(payload ?? {}) });
    for (const listener of [...bucket]) {
        try {
            await listener(event);
        } catch (error) {
            console.warn(`[native-session] lifecycle listener failed for ${type}`, error);
        }
    }
    return event;
}

export function resetNativeSessionLifecycleForTesting() {
    for (const bucket of listeners.values()) bucket.clear();
}
