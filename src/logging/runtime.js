import { IncidentAggregator, IncidentStore } from './incidents.js';
import { normalizeLogEntry } from './model.js';
import { backendLogStore } from './store.js';
import { classifyOperationalFailure } from './failure-classifier.js';

export const diagnosticIncidentStore = new IncidentStore({ capacity: 200 });
export const diagnosticIncidentAggregator = new IncidentAggregator({
    incidentStore: diagnosticIncidentStore,
    logStore: backendLogStore,
});

function normalizeEmbeddedLogs(logs) {
    if (!Array.isArray(logs)) return [];
    return logs.slice(-120).map(entry => normalizeLogEntry({
        ...entry,
        side: entry?.side === 'backend' ? 'backend' : 'frontend',
    }, {
        side: entry?.side === 'backend' ? 'backend' : 'frontend',
    }));
}

function correlationSearchValue(correlation = {}) {
    return correlation.orchestrationRunId
        || correlation.generationId
        || correlation.requestId
        || correlation.operationId
        || correlation.startupSessionId
        || '';
}

function latestRelevantLog(logs) {
    return [...logs].reverse().find(entry => entry.level === 'error')
        || [...logs].reverse().find(entry => entry.level === 'warn')
        || logs.at(-1)
        || null;
}

export function createIncidentFromRecent(input = {}, {
    subjectUser = '',
    includeBackendLogs = false,
    now = Date.now(),
    logStore = backendLogStore,
    incidentAggregator = diagnosticIncidentAggregator,
} = {}) {
    const correlation = input.correlation && typeof input.correlation === 'object' ? input.correlation : {};
    const embeddedLogEntries = normalizeEmbeddedLogs(input.frontendLogs ?? input.embeddedLogEntries);
    const correlationSearch = correlationSearchValue(correlation);
    const backendLogs = includeBackendLogs
        ? logStore.query({
            startTime: Math.max(0, now - Math.max(1000, Number(input.windowMs) || 120000)),
            endTime: now + 5000,
            correlation: correlationSearch,
            limit: Math.min(500, Math.max(20, Number(input.logLimit) || 200)),
        }).entries
        : [];
    const latest = latestRelevantLog([...backendLogs, ...embeddedLogEntries]);
    const severity = String(input.severity || (latest?.level === 'error' ? 'error' : 'warning'));
    const type = String(input.type || (embeddedLogEntries.length ? 'unhandled_frontend_error' : 'unhandled_backend_error'));
    const summary = String(input.summary || latest?.message || 'User reported a recent problem');
    const primaryFailure = input.primaryFailure || input.failure || {
        message: summary,
        ...(latest ? { sourceEvent: latest.event, sourceModule: latest.module } : {}),
    };

    return incidentAggregator.capture({
        ...input,
        createdAt: now,
        subjectUser,
        type,
        severity,
        summary,
        primaryFailure,
        primaryModule: input.primaryModule || latest?.module || 'uncategorized',
        stage: input.stage || latest?.event || 'reported-recently',
        relatedLogs: backendLogs,
        embeddedLogEntries,
        correlation,
        recentActions: input.recentActions,
        safeConfigSnapshot: input.safeConfigSnapshot,
        provenance: input.provenance,
        retryHistory: input.retryHistory,
        fallbackHistory: input.fallbackHistory,
        timeline: input.timeline,
    });
}

export function captureBackendIncident(input = {}, {
    request = null,
    incidentAggregator = diagnosticIncidentAggregator,
} = {}) {
    try {
        const failure = input.failure ?? input.error ?? input.primaryFailure;
        const classification = classifyOperationalFailure(failure, { stage: input.stage });
        const subjectUser = String(input.subjectUser || request?.user?.profile?.handle || '');
        return incidentAggregator.capture({
            ...input,
            subjectUser,
            failure,
            stage: classification.stage,
            probableOwner: input.probableOwner || classification.probableOwner,
            ownerName: input.ownerName || classification.ownerName,
            ownerConfidence: input.ownerConfidence ?? classification.confidence,
            ownershipEvidence: [
                ...(input.ownershipEvidence || []),
                ...classification.evidence,
            ],
        });
    } catch {
        return null;
    }
}
