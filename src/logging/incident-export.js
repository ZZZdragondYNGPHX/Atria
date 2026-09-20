import { redactText, redactValue } from './redact.js';

export const INCIDENT_EXPORT_FORMAT_VERSION = 1;

function logKey(entry) {
    return `${entry?.side || ''}:${entry?.id || ''}:${entry?.timestamp || ''}:${entry?.event || ''}`;
}

function selectKeyLogs(entries = [], limit = 20) {
    const sorted = [...entries].sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
    const priority = sorted.filter(entry => entry.level === 'error' || entry.level === 'warn').slice(-12);
    const recent = sorted.slice(-10);
    const map = new Map();
    for (const entry of [...priority, ...recent]) map.set(logKey(entry), entry);
    return [...map.values()].slice(-Math.max(5, Math.min(20, limit)));
}

function sanitizeInspectorEntry(entry) {
    const source = entry && typeof entry === 'object' ? entry : {};
    const output = {};
    for (const key of [
        'id', 'requestId', 'request_id', 'generationId', 'generation_id',
        'type', 'status', 'provider', 'model', 'endpoint', 'httpStatus',
        'startedAt', 'completedAt', 'durationMs', 'streaming',
        'apiKeyFingerprint', 'error', 'errorMessage',
    ]) {
        if (source[key] !== undefined) output[key] = source[key];
    }
    if (Array.isArray(source.fullMessages)) output.messageCount = source.fullMessages.length;
    if (source.wireRequest && typeof source.wireRequest === 'object') {
        output.wireRequestKeys = Object.keys(source.wireRequest).slice(0, 40);
    }
    if (typeof source.responseText === 'string') output.responseChars = source.responseText.length;
    return redactValue(output, { maxDepth: 4, maxStringLength: 2000 });
}

function correlationValues(correlation = {}) {
    return Object.values(correlation).map(String).filter(Boolean);
}

function selectInspectorEntries(entries, incident) {
    const explicit = new Set((incident.requestInspectorEntryIds || []).map(String));
    const values = correlationValues(incident.correlation);
    return (entries || []).filter(entry => {
        if (explicit.size && explicit.has(String(entry?.id || ''))) return true;
        if (!values.length) return false;
        const haystack = [
            entry?.id,
            entry?.requestId,
            entry?.request_id,
            entry?.generationId,
            entry?.generation_id,
        ].map(String);
        return values.some(value => haystack.includes(value));
    }).slice(-20).map(sanitizeInspectorEntry);
}

function formatLogLine(entry) {
    const time = Number.isFinite(Number(entry.timestamp))
        ? new Date(Number(entry.timestamp)).toISOString()
        : '';
    return `[${time}] [${String(entry.level || 'log').toUpperCase()}] [${entry.module || 'uncategorized'}] ${entry.event || 'log'}: ${entry.message || ''}`;
}

function buildHumanSummary(machine, keyLogs) {
    const incident = machine.incident;
    const owner = incident.ownership || {};
    const lines = [
        `Atria Diagnostic Incident ${incident.incidentId}`,
        `Generated: ${machine.generatedAt}`,
        `Version: ${machine.version.appVersion || 'unknown'} | Revision: ${machine.version.revision || 'unknown'} | Branch: ${machine.version.branch || 'unknown'}`,
        `Type: ${incident.type} | Severity: ${incident.severity} | Status: ${incident.status}`,
        `Module: ${incident.primaryModule} | Stage: ${incident.stage}`,
        `Error: ${incident.primaryFailure?.message || incident.summary}`,
        `Probable owner: ${owner.probableOwner || 'unknown'}${owner.ownerName ? ` (${owner.ownerName})` : ''} | Confidence: ${Number(owner.confidence || 0).toFixed(2)}`,
    ];
    const correlation = Object.entries(incident.correlation || {}).map(([key, value]) => `${key}=${value}`).join(', ');
    if (correlation) lines.push(`Correlation: ${correlation}`);
    if (incident.evidence?.length) {
        lines.push('Evidence:');
        for (const item of incident.evidence.slice(0, 12)) lines.push(`- ${item}`);
    }
    if (incident.causeChain?.length) {
        lines.push('Cause chain:');
        for (const item of incident.causeChain.slice(0, 8)) lines.push(`- ${item?.message || JSON.stringify(item)}`);
    }
    if (keyLogs.length) {
        lines.push('Key logs:');
        for (const entry of keyLogs) lines.push(`- ${formatLogLine(entry)}`);
    }
    return redactText(lines.join('\n'));
}

function versionShape(version = {}) {
    return {
        appVersion: redactText(String(version.pkgVersion || version.appVersion || '')).slice(0, 100),
        revision: redactText(String(version.gitRevision || version.revision || '')).slice(0, 200),
        branch: redactText(String(version.gitBranch || version.branch || '')).slice(0, 200),
    };
}

export function buildIncidentSummaryPackage({ incident, logStore, version = {} } = {}) {
    const backendLogs = logStore?.getByIds?.(incident?.relatedLogEntryIds || []) || [];
    const embedded = Array.isArray(incident?.embeddedLogEntries) ? incident.embeddedLogEntries : [];
    const keyLogs = selectKeyLogs([...backendLogs, ...embedded], 20);
    const machine = {
        formatVersion: INCIDENT_EXPORT_FORMAT_VERSION,
        kind: 'atria-incident-summary',
        generatedAt: new Date().toISOString(),
        version: versionShape(version),
        incident: redactValue({
            incidentId: incident.incidentId,
            createdAt: incident.createdAt,
            type: incident.type,
            severity: incident.severity,
            status: incident.status,
            primaryModule: incident.primaryModule,
            summary: incident.summary,
            primaryFailure: incident.primaryFailure,
            stage: incident.stage,
            causeChain: incident.causeChain,
            correlation: incident.correlation,
            startupSessionId: incident.startupSessionId,
            environment: incident.environment,
            ownership: incident.ownership,
            evidence: incident.evidence,
        }, { maxDepth: 10, maxArrayLength: 100, maxStringLength: 12000 }),
        keyLogs: redactValue(keyLogs, { maxDepth: 8, maxArrayLength: 20, maxStringLength: 12000 }),
    };
    return {
        ...machine,
        human: buildHumanSummary(machine, keyLogs),
    };
}

export function buildIncidentFullPackage({
    incident,
    logStore,
    version = {},
    requestInspectorEntries = [],
    startupSession = null,
} = {}) {
    const summary = buildIncidentSummaryPackage({ incident, logStore, version });
    const backendLogs = logStore?.getByIds?.(incident?.relatedLogEntryIds || []) || [];
    return {
        ...summary,
        kind: 'atria-incident-full',
        fullContext: redactValue({
            logs: [...backendLogs, ...(incident.embeddedLogEntries || [])],
            stack: incident.primaryFailure?.stack || '',
            requestInspector: selectInspectorEntries(requestInspectorEntries, incident),
            provenance: incident.provenance,
            recentActions: incident.recentActions,
            safeConfigSnapshot: incident.safeConfigSnapshot,
            retryHistory: incident.retryHistory,
            fallbackHistory: incident.fallbackHistory,
            startupSession,
            timeline: incident.timeline,
        }, {
            maxDepth: 12,
            maxArrayLength: 500,
            maxObjectKeys: 500,
            maxStringLength: 12000,
        }),
    };
}
