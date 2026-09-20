export const FRONTEND_LOG_MODULES = Object.freeze([
    'startup', 'ui', 'network', 'generation', 'extensions', 'orchestrator',
    'memory', 'worldbook', 'regex', 'editor', 'studio', 'storage',
    'settings', 'system', 'uncategorized',
]);

const MODULE_SET = new Set(FRONTEND_LOG_MODULES);

export function normalizeFrontendLogModule(module) {
    const normalized = String(module || '').trim().toLowerCase();
    return MODULE_SET.has(normalized) ? normalized : 'uncategorized';
}

export function getFrontendLogModules() {
    return [...FRONTEND_LOG_MODULES];
}
