export const LOG_SIDES = Object.freeze(['backend', 'frontend']);

export const BACKEND_LOG_MODULES = Object.freeze([
    'startup', 'http', 'websocket', 'auth', 'storage', 'sync', 'backup',
    'generation', 'dispatch', 'orchestrator', 'memory', 'worldbook',
    'extensions', 'plugins', 'request-inspector', 'system', 'uncategorized',
]);

export const FRONTEND_LOG_MODULES = Object.freeze([
    'startup', 'ui', 'network', 'generation', 'extensions', 'orchestrator',
    'memory', 'worldbook', 'regex', 'editor', 'studio', 'storage',
    'settings', 'system', 'uncategorized',
]);

const MODULES_BY_SIDE = Object.freeze({
    backend: new Set(BACKEND_LOG_MODULES),
    frontend: new Set(FRONTEND_LOG_MODULES),
});

export function normalizeLogSide(side, fallback = 'backend') {
    const normalized = String(side || '').trim().toLowerCase();
    return LOG_SIDES.includes(normalized) ? normalized : fallback;
}

export function isKnownLogModule(module, side = 'backend') {
    const normalizedSide = normalizeLogSide(side);
    const normalizedModule = String(module || '').trim().toLowerCase();
    return MODULES_BY_SIDE[normalizedSide].has(normalizedModule);
}

export function normalizeLogModule(module, side = 'backend') {
    const normalizedSide = normalizeLogSide(side);
    const normalizedModule = String(module || '').trim().toLowerCase();
    return MODULES_BY_SIDE[normalizedSide].has(normalizedModule)
        ? normalizedModule
        : 'uncategorized';
}

export function getLogModules(side = 'backend') {
    return normalizeLogSide(side) === 'frontend'
        ? [...FRONTEND_LOG_MODULES]
        : [...BACKEND_LOG_MODULES];
}
