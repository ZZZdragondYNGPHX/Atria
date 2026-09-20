import { frontendLogStore } from './logger.js';
import { attributeFrontendOwnership } from './ownership.js';
import { recentUserActionStore } from './recent-actions.js';
import { createSafeConfigSnapshot } from './safe-config.js';
import { redactText, redactValue } from './redact.js';

const recentFingerprints = new Map();

function normalizeFailure(error, fallback = '') {
    if (error instanceof Error || (error && typeof error === 'object')) {
        return {
            name: redactText(String(error?.name || 'Error')).slice(0, 120),
            message: redactText(String(error?.message || fallback || error)).slice(0, 4000),
            stack: redactText(String(error?.stack || '')).slice(0, 12000),
            ...(error?.code !== undefined ? { code: redactText(String(error.code)).slice(0, 200) } : {}),
        };
    }
    return { message: redactText(String(error || fallback || 'Frontend failure')).slice(0, 4000) };
}

function correlationSearchValue(correlation = {}) {
    return correlation.orchestrationRunId
        || correlation.generationId
        || correlation.requestId
        || correlation.operationId
        || correlation.startupSessionId
        || '';
}

function shouldSuppressDuplicate(payload, now) {
    const key = [
        payload.type,
        payload.primaryModule,
        payload.stage,
        payload.primaryFailure?.message,
        payload.correlation?.orchestrationRunId || payload.correlation?.generationId || '',
    ].join('|');
    const previous = recentFingerprints.get(key) || 0;
    recentFingerprints.set(key, now);
    for (const [fingerprint, timestamp] of recentFingerprints) {
        if (now - timestamp > 10000) recentFingerprints.delete(fingerprint);
    }
    return now - previous < 1500;
}

export function buildFrontendIncidentPayload(input = {}, { now = Date.now() } = {}) {
    const correlation = input.correlation && typeof input.correlation === 'object' ? input.correlation : {};
    const correlationSearch = correlationSearchValue(correlation);
    const primaryFailure = normalizeFailure(input.failure ?? input.error, input.summary);
    const ownership = input.ownership || attributeFrontendOwnership({
        stack: primaryFailure.stack || input.stack || '',
        probableOwner: input.probableOwner,
        ownerName: input.ownerName,
        confidence: input.ownerConfidence,
        evidence: input.ownershipEvidence,
    });
    const logs = frontendLogStore.query({
        startTime: Math.max(0, now - Math.max(1000, Number(input.windowMs) || 120000)),
        correlation: correlationSearch,
        limit: Math.min(200, Math.max(20, Number(input.logLimit) || 120)),
    }).entries;
    const recentActions = input.recentActions
        ?? recentUserActionStore.queryWindow({ before: now, beforeCount: 20, afterCount: 0 });

    const provenance = input.provenance || (ownership.probableOwner === 'third-party-extension'
        ? { type: 'extension', name: ownership.ownerName, displayName: ownership.ownerName }
        : {});

    return redactValue({
        type: input.type || 'unhandled_frontend_error',
        severity: input.severity || 'error',
        primaryModule: input.primaryModule || 'system',
        summary: input.summary || primaryFailure.message || 'Frontend failure',
        primaryFailure,
        stage: input.stage || 'runtime',
        correlation,
        frontendLogs: logs,
        recentActions,
        safeConfigSnapshot: createSafeConfigSnapshot({
            ...(input.safeConfigSnapshot || {}),
            runtime: {
                userAgent: globalThis.navigator?.userAgent || '',
                platform: globalThis.navigator?.platform || '',
                language: globalThis.navigator?.language || '',
                online: typeof globalThis.navigator?.onLine === 'boolean' ? globalThis.navigator.onLine : null,
                ...(input.safeConfigSnapshot?.runtime || {}),
            },
        }),
        provenance,
        ownership,
        retryHistory: input.retryHistory || [],
        fallbackHistory: input.fallbackHistory || [],
        timeline: input.timeline || [],
        environment: input.environment || {},
    }, { maxDepth: 12, maxArrayLength: 300, maxObjectKeys: 300, maxStringLength: 12000 });
}

export async function captureFrontendIncident(input = {}) {
    try {
        const now = Date.now();
        const payload = buildFrontendIncidentPayload(input, { now });
        if (shouldSuppressDuplicate(payload, now)) return null;
        const { getRequestHeaders } = await import('../../script.js');
        const response = await fetch('/api/diagnostics/incidents/create-from-recent', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(payload),
            keepalive: true,
        });
        if (!response.ok) return null;
        const result = await response.json().catch(() => null);
        return result?.incident || null;
    } catch {
        return null;
    }
}
