export const LOG_WORKSPACE_HEALTH_GROUPS = Object.freeze([
    { id: 'startup', label: 'Startup', modules: ['startup'] },
    { id: 'network', label: 'Network', modules: ['network', 'http'] },
    { id: 'generation', label: 'Generation', modules: ['generation', 'dispatch'] },
    { id: 'orchestrator', label: 'Orchestrator', modules: ['orchestrator'] },
    { id: 'memory', label: 'Memory', modules: ['memory'] },
    { id: 'worldbook', label: 'Worldbook', modules: ['worldbook'] },
    { id: 'extensions', label: 'Extensions', modules: ['extensions', 'plugins'] },
    { id: 'storage', label: 'Storage', modules: ['storage'] },
    { id: 'sync', label: 'Sync', modules: ['sync', 'backup'] },
    { id: 'websocket', label: 'WebSocket', modules: ['websocket'] },
]);

export const LOG_WORKSPACE_VIRTUAL_ROW_HEIGHT = 58;
export const LOG_WORKSPACE_VIRTUAL_OVERSCAN = 8;

function moduleMatches(group, module) {
    return group.modules.includes(String(module || '').toLowerCase());
}

export function deriveModuleHealth({ incidents = [], logs = [], now = Date.now(), windowMs = 15 * 60 * 1000 } = {}) {
    const cutoff = now - Math.max(1000, Number(windowMs) || 15 * 60 * 1000);
    return LOG_WORKSPACE_HEALTH_GROUPS.map(group => {
        const relatedIncidents = incidents.filter(incident =>
            moduleMatches(group, incident.primaryModule)
            && incident.status !== 'resolved');
        const relatedLogs = logs.filter(entry =>
            moduleMatches(group, entry.module)
            && Number(entry.timestamp || 0) >= cutoff);
        const hasIncidentError = relatedIncidents.some(incident => ['critical', 'error'].includes(String(incident.severity || '').toLowerCase()));
        const hasLogError = relatedLogs.some(entry => entry.level === 'error');
        const hasWarning = relatedIncidents.some(incident => incident.severity === 'warning')
            || relatedLogs.some(entry => entry.level === 'warn');
        const status = hasIncidentError || hasLogError
            ? 'error'
            : hasWarning
                ? 'warning'
                : relatedLogs.length > 0
                    ? 'healthy'
                    : 'quiet';
        return {
            ...group,
            status,
            incidentCount: relatedIncidents.length,
            errorCount: relatedLogs.filter(entry => entry.level === 'error').length,
            warningCount: relatedLogs.filter(entry => entry.level === 'warn').length,
            activityCount: relatedLogs.length,
        };
    });
}

export function buildVirtualWindow({
    total = 0,
    scrollTop = 0,
    viewportHeight = 420,
    rowHeight = LOG_WORKSPACE_VIRTUAL_ROW_HEIGHT,
    overscan = LOG_WORKSPACE_VIRTUAL_OVERSCAN,
} = {}) {
    const count = Math.max(0, Math.floor(Number(total) || 0));
    const height = Math.max(1, Number(rowHeight) || LOG_WORKSPACE_VIRTUAL_ROW_HEIGHT);
    const start = Math.max(0, Math.floor(Math.max(0, Number(scrollTop) || 0) / height) - overscan);
    const visibleCount = Math.ceil(Math.max(height, Number(viewportHeight) || 420) / height) + overscan * 2;
    const end = Math.min(count, start + visibleCount);
    return {
        start,
        end,
        topSpacer: start * height,
        bottomSpacer: Math.max(0, (count - end) * height),
    };
}

export function formatWorkspaceLogEntry(entry) {
    const timestamp = Number(entry?.timestamp);
    const time = Number.isFinite(timestamp) ? new Date(timestamp).toLocaleTimeString() : '';
    const level = String(entry?.level || 'log').toUpperCase();
    const module = String(entry?.module || 'uncategorized');
    const event = String(entry?.event || 'log');
    const message = String(entry?.message || '');
    return `[${time}] [${level}] [${module}] ${event}: ${message}`;
}

export function selectIncidentForModule(incidents, healthGroup) {
    return incidents.find(incident =>
        healthGroup.modules.includes(String(incident.primaryModule || '').toLowerCase())
        && incident.status !== 'resolved') || null;
}
