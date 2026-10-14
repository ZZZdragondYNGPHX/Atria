const handlers = new WeakMap();
export function registerVisualWake(engine, handler) { handlers.set(engine, handler); }
export function requestVisualWake(core, handle, sessionId) {
    const handler = handlers.get(core._sessions._engine);
    if (handler) queueMicrotask(() => { void handler(handle, sessionId).catch(() => {}); });
}
