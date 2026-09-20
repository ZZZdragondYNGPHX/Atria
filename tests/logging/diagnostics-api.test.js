import { beforeEach, describe, expect, test } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import { createDiagnosticsRouter } from '../../src/endpoints/diagnostics.js';
import { IncidentStore } from '../../src/logging/incidents.js';
import { LogStore } from '../../src/logging/store.js';
import { RuntimeProvenanceRegistry } from '../../src/logging/provenance.js';

function makeStartupStore() {
    const sessions = [
        { id: 'alice-new', user: 'alice', client: { summary: { firstLoadTotalMs: 1200 } }, extensions: [] },
        { id: 'alice-old', user: 'alice', client: { summary: { firstLoadTotalMs: 1000 } }, extensions: [] },
        { id: 'bob-one', user: 'bob', client: { summary: { firstLoadTotalMs: 900 } }, extensions: [] },
    ];
    return {
        list: ({ user, limit }) => sessions.filter(item => user === null || item.user === user).slice(-limit).reverse(),
        get: (id, { user }) => sessions.find(item => item.id === id && (user === null || item.user === user)) || null,
    };
}

function makeApp({ admin = false, handle = 'alice', incidentStore, logStore, startupStore, provenanceRegistry } = {}) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.user = { profile: { handle, admin } };
        next();
    });
    app.use('/api/diagnostics', createDiagnosticsRouter({
        isRequestAdminFn: req => Boolean(req.user?.profile?.admin),
        logStore,
        incidentStore,
        startupStore,
        provenanceRegistry,
        versionProvider: async () => ({ pkgVersion: '2.7.0', gitRevision: 'abc', gitBranch: 'main' }),
        requestInspectorProvider: () => [{
            id: 'inspect-1',
            requestId: 'req-1',
            model: 'm',
            fullMessages: [{ role: 'user', content: 'PRIVATE PROMPT' }],
            wireRequest: { messages: ['PRIVATE'] },
            responseText: 'PRIVATE RESPONSE',
        }],
        createRecentIncidentFn: (body, options) => incidentStore.upsert({
            ...body,
            subjectUser: options.subjectUser,
            type: body.type || 'unhandled_frontend_error',
            severity: 'error',
            primaryModule: 'network',
            summary: body.summary || 'recent problem',
            primaryFailure: { message: body.summary || 'recent problem' },
            correlation: body.correlation || {},
            embeddedLogEntries: body.frontendLogs || [],
            recentActions: [],
            safeConfigSnapshot: body.safeConfigSnapshot || {},
        }),
    }));
    return app;
}

describe('diagnostics API', () => {
    let logStore;
    let incidentStore;
    let startupStore;
    let provenanceRegistry;

    beforeEach(() => {
        logStore = new LogStore({ capacity: 20 });
        incidentStore = new IncidentStore({ capacity: 20 });
        startupStore = makeStartupStore();
        provenanceRegistry = new RuntimeProvenanceRegistry();
        provenanceRegistry.register({ type: 'server-plugin', name: 'demo', version: '1.0.0', origin: 'https://user:pass@example.com/repo.git?token=secret' });
        logStore.append({ level: 'error', module: 'generation', event: 'failed', message: 'apiKey=secret-value', correlation: { requestId: 'req-1' } });
    });

    test('non-admin cannot query or clear global backend logs', async () => {
        const app = makeApp({ incidentStore, logStore, startupStore, provenanceRegistry });
        await request(app).post('/api/diagnostics/logs/query').send({}).expect(403);
        await request(app).post('/api/diagnostics/logs/clear').send({}).expect(403);
        expect(logStore.size).toBe(1);
    });

    test('admin log query returns redacted canonical entries', async () => {
        const app = makeApp({ admin: true, incidentStore, logStore, startupStore, provenanceRegistry });
        const response = await request(app)
            .post('/api/diagnostics/logs/query')
            .send({ limit: 999999, levels: ['error'] })
            .expect(200);
        expect(response.body.entries).toHaveLength(1);
        expect(response.body.entries[0].message).not.toContain('secret-value');
    });

    test('create/list/detail incidents are scoped to the authenticated user', async () => {
        const alice = makeApp({ incidentStore, logStore, startupStore, provenanceRegistry });
        const created = await request(alice)
            .post('/api/diagnostics/incidents/create-from-recent')
            .send({ summary: 'Alice issue', frontendLogs: [{ side: 'frontend', level: 'error', module: 'network', event: 'fetch.error', message: 'failed' }] })
            .expect(201);
        expect(created.body.incident.subjectUser).toBe('alice');

        incidentStore.upsert({
            subjectUser: 'bob',
            type: 'network_failure',
            summary: 'Bob issue',
            primaryFailure: { message: 'Bob issue' },
        });

        const list = await request(alice).post('/api/diagnostics/incidents/list').send({}).expect(200);
        expect(list.body.incidents).toHaveLength(1);
        expect(list.body.incidents[0].subjectUser).toBe('alice');

        await request(alice).get('/api/diagnostics/incidents/' + created.body.incident.incidentId).expect(200);
        const bobId = incidentStore.list({ subjectUser: 'bob' })[0].incidentId;
        await request(alice).get('/api/diagnostics/incidents/' + bobId).expect(403);
    });

    test('full incident export strips prompt/response bodies and secrets', async () => {
        const incident = incidentStore.upsert({
            subjectUser: 'alice',
            type: 'generation_failure',
            primaryModule: 'generation',
            summary: 'Generation failed',
            primaryFailure: { message: 'apiKey=top-secret', stack: 'Error: failed' },
            correlation: { requestId: 'req-1' },
            requestInspectorEntryIds: ['inspect-1'],
            safeConfigSnapshot: { model: 'm', apiKey: 'top-secret' },
        });
        const app = makeApp({ incidentStore, logStore, startupStore, provenanceRegistry });
        const response = await request(app)
            .post('/api/diagnostics/incidents/' + incident.incidentId + '/export')
            .send({ mode: 'full' })
            .expect(200);
        const payload = JSON.stringify(response.body);
        expect(response.body.kind).toBe('atria-incident-full');
        expect(response.body.human).toContain('Atria Diagnostic Incident');
        expect(payload).not.toContain('PRIVATE PROMPT');
        expect(payload).not.toContain('PRIVATE RESPONSE');
        expect(payload).not.toContain('top-secret');
    });

    test('startup sessions are user-scoped while admin can compare globally', async () => {
        const alice = makeApp({ incidentStore, logStore, startupStore, provenanceRegistry });
        const list = await request(alice).post('/api/diagnostics/startup/list').send({ limit: 20 }).expect(200);
        expect(list.body.sessions.every(item => item.user === 'alice')).toBe(true);
        await request(alice).get('/api/diagnostics/startup/bob-one').expect(404);

        const admin = makeApp({ admin: true, incidentStore, logStore, startupStore, provenanceRegistry });
        const comparison = await request(admin)
            .post('/api/diagnostics/startup/compare')
            .send({ currentId: 'alice-new', previousId: 'alice-old' })
            .expect(200);
        expect(comparison.body.comparison.clientDeltas.firstLoadTotalMs).toBe(200);
    });

    test('ownership and provenance expose safe registries', async () => {
        const app = makeApp({ incidentStore, logStore, startupStore, provenanceRegistry });
        const ownership = await request(app).get('/api/diagnostics/ownership').expect(200);
        expect(ownership.body.ownerTypes).toContain('third-party-extension');
        const provenanceResponse = await request(app).get('/api/diagnostics/provenance').expect(200);
        expect(provenanceResponse.body.records[0].origin).toBe('https://example.com/repo.git');
    });

    test('admin clear removes canonical log entries', async () => {
        const app = makeApp({ admin: true, incidentStore, logStore, startupStore, provenanceRegistry });
        await request(app).post('/api/diagnostics/logs/clear').send({}).expect(204);
        expect(logStore.size).toBe(0);
    });
});
