import express from 'express';
import request from 'supertest';
import { expect, jest, test } from '@jest/globals';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { services } from './helpers/session-fixture.js';
import { authorityCandidateFixture } from './helpers/authority-candidate-fixture.js';
import { closed } from './helpers/authority-fixture.js';
import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { createNativeSessionRouter } from '../../src/endpoints/native-session.js';
import { acquireSessionReadLease } from '../../src/native/session-maintenance.js';

async function fixture(make) {
    const h = await make(), svc = services(h), f = authorityCandidateFixture();
    const value = { sequence: 0, calendar: { year: 1 }, era_id: 'opening' };
    f.contract.lifecycleRuntime.domains.push({ id: 'chronology', scopeId: 'session', schemaVersion: 1,
        recordSchema: closed({ sequence: { type: 'integer', minimum: 0, maximum: 10000 }, calendar: closed({ year: { type: 'integer', minimum: 1, maximum: 1000 } }), era_id: { type: 'string', maxLength: 64 } }), initial: value,
        commands: [{ id: 'start', argsSchema: closed({}), event: 'chronology.start', assign: value }], retention: { maxItems: 1, maxLogicalBytes: 65536, keepPinned: true, keepReferenced: true } });
    f.contract.lifecycleRuntime.history = { schemaVersion: 1, clockId: 'world', chronologyDomain: 'chronology', meaningfulDomains: ['notes'],
        sources: [{ id: 'note', domainId: 'notes', recordId: 'main', path: ['text'], public: true, refs: ['case:note'], label: 'Recorded note' }],
        hot: 4, warm: 4, cold: 4, maxDurable: 1024, maxBytes: 1048576, checkpointTurns: 16 };
    f.contract.lifecycleRuntime.automations.push({ id: 'chronology.start', scopeId: 'session', trigger: { kind: 'experience.ready' }, maxCatchUp: 1,
        action: { kind: 'app.command', domainId: 'chronology', commandId: 'start', recordId: 'main', args: {} } });
    f.contract.lifecycleRuntime.automations.push({ id: 'notes.start', scopeId: 'session', trigger: { kind: 'experience.ready' }, maxCatchUp: 1,
        action: { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main', args: { text: 'Initial recorded note' } } });
    f.sync();
    const container = buildAtriaPackageContainer({ manifest: f.base.manifest, sourceFiles: f.installed.sourceFiles, assetPayloads: new Map() });
    await svc.packageInstaller.install(h.handle, container.archive);
    let snapshot = await svc.core.create(h.handle, { packageId: f.base.session.packageId, packageVersionId: f.base.session.packageVersionId, entryPointId: f.base.session.entryPointId });
    snapshot = await svc.core.applyLifecycleCommand(h.handle, snapshot.session.sessionId, { type: 'lifecycle', invocationId: 'ready', action: { kind: 'experience.ready' } }, { expectedRevisionId: snapshot.revision.revisionId });
    const app = express(); app.use(express.json()); app.use((req, res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
    app.use(createNativeSessionRouter(() => svc));
    return { h, svc, snapshot, app };
}
for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`${kind}: Chronicle pages/metrics and exact Revision observation never synchronize or publish`, async () => {
        const { h, svc, snapshot, app } = await fixture(make);
        try {
            const input = { sessionId: snapshot.session.sessionId, revisionId: snapshot.revision.revisionId };
            const transaction = h.engine.withTransaction.bind(h.engine);
            const load = svc.core.load.bind(svc.core);
            jest.spyOn(svc.core, 'load').mockImplementation((handle, sessionId, options) => {
                if (!options?.revisionId || options.skipPackageEdits !== true) throw new Error('Impure HEAD load forbidden');
                return load(handle, sessionId, options);
            });
            jest.spyOn(h.engine, 'withTransaction').mockImplementation((handle, operation) => transaction(handle, tx => operation(new Proxy(tx, {
                get(target, key) { if (['putResource', 'deleteResource', 'putBlob', 'deleteBlob'].includes(key)) return () => { throw new Error('Persistent write in observation'); };
                    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; },
            }))));
            const query = await request(app).post('/history/observe').send({ ...input, query: { limit: 1 } });
            expect(query.status).toBe(200); expect(query.body.anchor.revisionId).toBe(input.revisionId);
            const metrics = await request(app).post('/history/metrics-observe').send(input);
            expect(metrics.status).toBe(200); expect(metrics.body.historyBytes).toBeGreaterThan(0);
            const revision = await request(app).post('/revisions/observe').send(input);
            expect(revision.status).toBe(200); expect(revision.body.committed).toBe(true); expect(revision.body.references.length).toBeGreaterThan(0);
            expect((await request(app).post('/history/observe').send({ ...input, owner: 'other' })).status).toBe(400);
        } finally { jest.restoreAllMocks(); await h.cleanup(); }
    });
    test(`${kind}: bounded checked maintenance rejects stale HEAD and protects referenced Revision with active read lease`, async () => {
        const { h, svc, snapshot, app } = await fixture(make);
        let release;
        try {
            const sessionId = snapshot.session.sessionId;
            const next = await svc.core.appendTimeline(h.handle, sessionId, { role: 'user', content: 'A later turn' });
            const stale = await request(app).post('/maintenance/checked').send({ sessionId, expectedRevisionId: snapshot.revision.revisionId });
            expect(stale.status).toBe(409); expect(stale.body.error).toBe('native_session_head_conflict');
            release = acquireSessionReadLease(h.handle, sessionId, snapshot.revision.revisionId);
            const result = await request(app).post('/maintenance/checked').send({ sessionId, expectedRevisionId: next.revision.revisionId });
            expect(result.status).toBe(200); expect(result.body.deleted).toEqual([]);
            expect(await svc.sessionRepo.getRevision(h.handle, sessionId, snapshot.revision.revisionId)).not.toBeNull();
            expect((await svc.core.observe(h.handle, sessionId)).revision.revisionId).toBe(next.revision.revisionId);
        } finally { release?.(); await h.cleanup(); }
    });
}
