import express from 'express';

import { getVersion } from '../util.js';
import { isRequestAdmin } from '../users.js';
import { getBufferForHandle } from '../request-inspector.js';
import { getLogModules } from '../logging/modules.js';
import { INCIDENT_OWNER_TYPES } from '../logging/ownership.js';
import {
    INCIDENT_SEVERITIES,
    INCIDENT_STATUSES,
    INCIDENT_TYPES,
} from '../logging/incidents.js';
import { backendLogStore } from '../logging/store.js';
import {
    createIncidentFromRecent,
    diagnosticIncidentStore,
} from '../logging/runtime.js';
import { runtimeProvenanceRegistry } from '../logging/provenance.js';
import {
    buildIncidentFullPackage,
    buildIncidentSummaryPackage,
} from '../logging/incident-export.js';
import {
    compareStartupSessions,
    startupSessionStore,
} from '../logging/startup-store.js';

function requestHandle(request) {
    return String(request?.user?.profile?.handle || '');
}

function parseLimit(value, fallback = 100, max = 5000) {
    const numeric = Number(value);
    return Number.isFinite(numeric)
        ? Math.min(max, Math.max(1, Math.floor(numeric)))
        : fallback;
}

function incidentVisibleTo(incident, request, isAdmin) {
    return isAdmin || Boolean(incident && incident.subjectUser && incident.subjectUser === requestHandle(request));
}

function filterIncidentsForRequest(entries, request, isAdmin) {
    if (isAdmin) return entries;
    const handle = requestHandle(request);
    return entries.filter(entry => entry.subjectUser === handle);
}

function currentStartupUserFilter(request, isAdmin) {
    return isAdmin ? null : requestHandle(request);
}

export function createDiagnosticsRouter({
    isRequestAdminFn = isRequestAdmin,
    logStore = backendLogStore,
    incidentStore = diagnosticIncidentStore,
    createRecentIncidentFn = createIncidentFromRecent,
    startupStore = startupSessionStore,
    provenanceRegistry = runtimeProvenanceRegistry,
    versionProvider = getVersion,
    requestInspectorProvider = getBufferForHandle,
} = {}) {
    const router = express.Router();

    router.get('/modules', (_request, response) => {
        response.json({
            backend: getLogModules('backend'),
            frontend: getLogModules('frontend'),
            incidentTypes: INCIDENT_TYPES,
            incidentSeverities: INCIDENT_SEVERITIES,
            incidentStatuses: INCIDENT_STATUSES,
            ownerTypes: INCIDENT_OWNER_TYPES,
        });
    });

    router.post('/logs/query', (request, response) => {
        if (!isRequestAdminFn(request)) return response.sendStatus(403);
        try {
            return response.json(logStore.query(request.body && typeof request.body === 'object' ? request.body : {}));
        } catch (error) {
            console.error('[diagnostics] logs query failed', error);
            return response.status(400).json({ error: 'invalid_log_query' });
        }
    });

    router.post('/logs/clear', (request, response) => {
        if (!isRequestAdminFn(request)) return response.sendStatus(403);
        logStore.clear();
        return response.sendStatus(204);
    });

    router.post('/incidents/list', (request, response) => {
        const admin = isRequestAdminFn(request);
        const entries = incidentStore.list({
            status: request.body?.status,
            limit: parseLimit(request.body?.limit, 100, 200),
        });
        response.json({
            incidents: filterIncidentsForRequest(entries, request, admin),
        });
    });

    router.post('/incidents/create-from-recent', (request, response) => {
        const admin = isRequestAdminFn(request);
        const handle = requestHandle(request);
        if (!handle && !admin) return response.sendStatus(403);
        try {
            const incident = createRecentIncidentFn(request.body || {}, {
                subjectUser: handle,
                includeBackendLogs: admin,
                logStore,
            });
            return response.status(201).json({ incident });
        } catch (error) {
            console.error('[diagnostics] create incident failed', error);
            return response.status(400).json({ error: 'invalid_incident_payload' });
        }
    });

    router.get('/incidents/:incidentId', (request, response) => {
        const incident = incidentStore.get(String(request.params.incidentId || ''));
        if (!incident) return response.sendStatus(404);
        if (!incidentVisibleTo(incident, request, isRequestAdminFn(request))) return response.sendStatus(403);
        return response.json({ incident });
    });

    router.post('/incidents/:incidentId/export', async (request, response) => {
        const incident = incidentStore.get(String(request.params.incidentId || ''));
        if (!incident) return response.sendStatus(404);
        const admin = isRequestAdminFn(request);
        if (!incidentVisibleTo(incident, request, admin)) return response.sendStatus(403);

        const mode = request.body?.mode === 'full' ? 'full' : 'summary';
        const version = await Promise.resolve(versionProvider()).catch(() => ({}));
        if (mode === 'summary') {
            return response.json(buildIncidentSummaryPackage({ incident, logStore, version }));
        }
        const handle = admin && incident.subjectUser ? incident.subjectUser : requestHandle(request);
        const startupSession = incident.startupSessionId
            ? startupStore.get(incident.startupSessionId, { user: admin ? null : handle })
            : null;
        const requestInspectorEntries = handle ? requestInspectorProvider(handle) : [];
        return response.json(buildIncidentFullPackage({
            incident,
            logStore,
            version,
            startupSession,
            requestInspectorEntries,
        }));
    });

    router.post('/startup/list', (request, response) => {
        const admin = isRequestAdminFn(request);
        response.json({
            sessions: startupStore.list({
                user: currentStartupUserFilter(request, admin),
                limit: parseLimit(request.body?.limit, 20, 20),
            }),
        });
    });

    router.post('/startup/compare', (request, response) => {
        const admin = isRequestAdminFn(request);
        const user = currentStartupUserFilter(request, admin);
        const current = startupStore.get(String(request.body?.currentId || ''), { user });
        const previous = startupStore.get(String(request.body?.previousId || ''), { user });
        if (!current || !previous) return response.sendStatus(404);
        return response.json({ comparison: compareStartupSessions(current, previous) });
    });

    router.get('/startup/:sessionId', (request, response) => {
        const admin = isRequestAdminFn(request);
        const session = startupStore.get(String(request.params.sessionId || ''), {
            user: currentStartupUserFilter(request, admin),
        });
        if (!session) return response.sendStatus(404);
        return response.json({ session });
    });

    router.get('/ownership', (_request, response) => {
        response.json({
            ownerTypes: INCIDENT_OWNER_TYPES,
            backendModules: getLogModules('backend'),
            frontendModules: getLogModules('frontend'),
        });
    });

    router.get('/provenance', (_request, response) => {
        response.json({ records: provenanceRegistry.list() });
    });

    return router;
}

export const router = createDiagnosticsRouter();
