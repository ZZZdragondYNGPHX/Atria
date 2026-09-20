import { randomUUID } from 'node:crypto';
import { normalizeCorrelation } from './model.js';
import { attributeOwnership } from './ownership.js';
import { redactText, redactValue } from './redact.js';

export const INCIDENT_TYPES = Object.freeze([
    'startup_failure',
    'generation_failure',
    'orchestration_failure',
    'agent_failure',
    'tool_failure',
    'network_failure',
    'extension_install_failure',
    'extension_update_failure',
    'extension_runtime_failure',
    'plugin_runtime_failure',
    'storage_failure',
    'sync_failure',
    'websocket_failure',
    'unhandled_frontend_error',
    'unhandled_backend_error',
]);

export const INCIDENT_SEVERITIES = Object.freeze(['info', 'warning', 'error', 'critical']);
export const INCIDENT_STATUSES = Object.freeze(['open', 'acknowledged', 'resolved']);
export const DEFAULT_INCIDENT_CAPACITY = 200;

function normalizeEnum(value, allowed, fallback) {
    const normalized = String(value || '').trim().toLowerCase();
    return allowed.includes(normalized) ? normalized : fallback;
}

function mergeCorrelation(...items) {
    const output = {};
    for (const item of items) Object.assign(output, normalizeCorrelation(item));
    return output;
}

function fingerprint(correlation = {}) {
    return correlation.orchestrationRunId
        || correlation.generationId
        || correlation.requestId
        || correlation.operationId
        || correlation.startupSessionId
        || '';
}

function normalizeFailure(failure) {
    if (failure instanceof Error) {
        return {
            name: failure.name,
            message: redactText(failure.message),
            stack: failure.stack ? redactText(failure.stack) : '',
            ...(failure.code !== undefined ? { code: redactText(failure.code) } : {}),
        };
    }
    if (failure && typeof failure === 'object') {
        return redactValue(failure, { maxDepth: 6, maxStringLength: 8000 });
    }
    return { message: redactText(String(failure || 'Unknown failure')) };
}

function buildCauseChain(failure) {
    const output = [];
    let current = failure;
    const seen = new Set();
    for (let i = 0; i < 8 && current; i++) {
        if (seen.has(current)) break;
        seen.add(current);
        output.push(normalizeFailure(current));
        current = current?.cause;
    }
    return output;
}

function correlationFromLogs(logs) {
    return logs.reduce((acc, entry) => mergeCorrelation(acc, entry?.correlation), {});
}

function buildEvidence(input, ownership, logs) {
    const evidence = [
        ...(ownership?.evidence || []),
        ...(input.stage ? ['failure stage: ' + input.stage] : []),
        ...(input.primaryModule ? ['primary module: ' + input.primaryModule] : []),
    ];
    const firstError = logs.find(entry => entry.level === 'error');
    if (firstError) evidence.push('related error log #' + firstError.id + ': ' + firstError.event);
    return [...new Set(evidence)].slice(0, 40);
}

function normalizeRecentActions(actions) {
    if (!Array.isArray(actions)) return [];
    return actions.slice(0, 50).map((action) => {
        const source = action && typeof action === 'object' ? action : {};
        return {
            ...(Number.isFinite(Number(source.id)) ? { id: Number(source.id) } : {}),
            timestamp: Number.isFinite(Number(source.timestamp)) ? Math.max(0, Math.floor(Number(source.timestamp))) : 0,
            module: redactText(String(source.module || 'uncategorized')).slice(0, 128),
            action: redactText(String(source.action || 'unknown')).slice(0, 160),
            label: redactText(String(source.label || '')).slice(0, 240),
            data: redactValue(source.data ?? {}, { maxDepth: 5, maxArrayLength: 30, maxObjectKeys: 50, maxStringLength: 2000 }),
        };
    });
}

export function createIncident(input = {}) {
    const logs = Array.isArray(input.relatedLogs) ? input.relatedLogs : [];
    const error = input.failure instanceof Error ? input.failure : null;
    const primaryFailure = normalizeFailure(input.primaryFailure ?? input.failure ?? input.error ?? input.summary ?? 'Unknown failure');
    const ownership = input.ownership || attributeOwnership({
        error,
        stack: input.stack || error?.stack || primaryFailure?.stack,
        probableOwner: input.probableOwner,
        ownerName: input.ownerName,
        confidence: input.ownerConfidence,
        evidence: input.ownershipEvidence,
    });
    const correlation = mergeCorrelation(correlationFromLogs(logs), input.correlation);
    const createdAt = Number.isFinite(Number(input.createdAt)) ? Math.max(0, Math.floor(Number(input.createdAt))) : Date.now();
    const causeChain = Array.isArray(input.causeChain) && input.causeChain.length
        ? redactValue(input.causeChain)
        : buildCauseChain(input.failure ?? input.primaryFailure);

    return {
        incidentId: String(input.incidentId || randomUUID()),
        createdAt,
        updatedAt: createdAt,
        type: normalizeEnum(input.type, INCIDENT_TYPES, 'unhandled_backend_error'),
        severity: normalizeEnum(input.severity, INCIDENT_SEVERITIES, 'error'),
        status: normalizeEnum(input.status, INCIDENT_STATUSES, 'open'),
        primaryModule: String(input.primaryModule || logs.find(entry => entry.level === 'error')?.module || 'uncategorized'),
        summary: redactText(String(input.summary || primaryFailure?.message || 'Diagnostic incident')).slice(0, 1000),
        primaryFailure,
        stage: redactText(String(input.stage || 'unknown')).slice(0, 160),
        causeChain,
        correlation,
        relatedLogEntryIds: [...new Set([
            ...(input.relatedLogEntryIds || []).map(id => Number(id)).filter(Number.isFinite),
            ...logs.map(entry => Number(entry?.id)).filter(Number.isFinite),
        ])],
        requestInspectorEntryIds: [...new Set((input.requestInspectorEntryIds || []).map(String))],
        startupSessionId: String(input.startupSessionId || correlation.startupSessionId || ''),
        environment: redactValue(input.environment ?? {}, { maxDepth: 5, maxStringLength: 2000 }),
        provenance: redactValue(input.provenance ?? {}, { maxDepth: 6, maxStringLength: 2000 }),
        recentActions: normalizeRecentActions(input.recentActions),
        safeConfigSnapshot: redactValue(input.safeConfigSnapshot ?? {}, { maxDepth: 6, maxArrayLength: 100, maxStringLength: 2000 }),
        ownership,
        evidence: buildEvidence(input, ownership, logs),
    };
}

export class IncidentStore {
    #entries = [];
    #capacity;

    constructor({ capacity = DEFAULT_INCIDENT_CAPACITY } = {}) {
        this.#capacity = Math.max(1, Math.floor(Number(capacity) || DEFAULT_INCIDENT_CAPACITY));
    }

    upsert(incident) {
        const isNormalizedIncident = incident
            && typeof incident === 'object'
            && typeof incident.incidentId === 'string'
            && Array.isArray(incident.relatedLogEntryIds)
            && Array.isArray(incident.recentActions)
            && incident.ownership
            && typeof incident.ownership === 'object';
        const normalized = isNormalizedIncident
            ? structuredClone(incident)
            : createIncident(incident);
        const index = this.#entries.findIndex(item => item.incidentId === normalized.incidentId);
        if (index >= 0) this.#entries[index] = normalized;
        else this.#entries.push(normalized);
        if (this.#entries.length > this.#capacity) {
            this.#entries.splice(0, this.#entries.length - this.#capacity);
        }
        return structuredClone(normalized);
    }

    update(incidentId, patch = {}) {
        const index = this.#entries.findIndex(item => item.incidentId === incidentId);
        if (index < 0) return null;
        const current = this.#entries[index];
        const next = {
            ...current,
            ...redactValue(patch),
            incidentId: current.incidentId,
            createdAt: current.createdAt,
            updatedAt: Date.now(),
        };
        this.#entries[index] = next;
        return structuredClone(next);
    }

    findOpenByFingerprint({ type, primaryModule, correlation = {} } = {}) {
        const key = fingerprint(correlation);
        const entry = this.#entries.find(item => item.status === 'open'
            && item.type === type
            && item.primaryModule === primaryModule
            && fingerprint(item.correlation) === key);
        return entry ? structuredClone(entry) : null;
    }

    list({ status, limit = 100 } = {}) {
        let entries = this.#entries;
        if (status) entries = entries.filter(entry => entry.status === status);
        return entries
            .slice(-Math.max(1, Math.floor(Number(limit) || 100)))
            .map(entry => structuredClone(entry))
            .reverse();
    }

    get(incidentId) {
        const entry = this.#entries.find(item => item.incidentId === incidentId);
        return entry ? structuredClone(entry) : null;
    }

    clear() {
        this.#entries.length = 0;
    }
}

export class IncidentAggregator {
    constructor({ incidentStore = new IncidentStore(), logStore = null, recentActionStore = null, configSnapshotProvider = null } = {}) {
        this.incidentStore = incidentStore;
        this.logStore = logStore;
        this.recentActionStore = recentActionStore;
        this.configSnapshotProvider = configSnapshotProvider;
    }

    capture(input = {}) {
        const now = Number.isFinite(Number(input.createdAt)) ? Number(input.createdAt) : Date.now();
        const relatedLogs = Array.isArray(input.relatedLogs)
            ? input.relatedLogs
            : this.logStore?.query?.({
                startTime: now - Math.max(0, Number(input.logWindowMs) || 120000),
                endTime: now + Math.max(0, Number(input.logAfterMs) || 5000),
                correlation: input.correlationSearch || '',
                limit: Math.max(20, Number(input.logLimit) || 200),
            })?.entries || [];
        const correlation = mergeCorrelation(correlationFromLogs(relatedLogs), input.correlation);
        const recentActions = input.recentActions
            ?? this.recentActionStore?.queryWindow?.({ before: now, after: now + 5000 })
            ?? [];
        const safeConfigSnapshot = input.safeConfigSnapshot ?? this.configSnapshotProvider?.() ?? {};
        const candidate = createIncident({
            ...input,
            createdAt: now,
            relatedLogs,
            correlation,
            recentActions,
            safeConfigSnapshot,
        });
        const existing = this.incidentStore.findOpenByFingerprint(candidate);
        if (existing && fingerprint(candidate.correlation)) {
            return this.incidentStore.update(existing.incidentId, {
                summary: candidate.summary,
                primaryFailure: candidate.primaryFailure,
                stage: candidate.stage,
                causeChain: candidate.causeChain,
                correlation: mergeCorrelation(existing.correlation, candidate.correlation),
                relatedLogEntryIds: [...new Set([...existing.relatedLogEntryIds, ...candidate.relatedLogEntryIds])],
                recentActions: candidate.recentActions,
                safeConfigSnapshot: candidate.safeConfigSnapshot,
                ownership: candidate.ownership,
                evidence: [...new Set([...existing.evidence, ...candidate.evidence])].slice(0, 40),
            });
        }
        return this.incidentStore.upsert(candidate);
    }
}
