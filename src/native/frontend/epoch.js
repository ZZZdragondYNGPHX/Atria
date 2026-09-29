// Host lifecycle signal only; not a persisted Session/World authority.
const listeners = new Set();
export function onFrontendEpochInvalidated(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function invalidateFrontendEpoch(owner, sessionId) { for (const listener of listeners) listener(owner, sessionId); }
