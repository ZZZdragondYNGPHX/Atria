import express from 'express';
import request from 'supertest';
import path from 'node:path';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { installFixture } from '../native/helpers/session-fixture.js';
import { createNativeOrchestrationRouter } from '../../src/endpoints/native-orchestration.js';
import { createOrchestrationAuthoringService } from '../../src/native/orchestration/authoring-service.js';
import { RunObservationService } from '../../src/native/orchestration/run-observation-service.js';
import { createOrchestrationExecutionService } from '../../src/native/orchestration/execution-service.js';
import { validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../src/native/identity.js';
import { runGuard } from '../../src/native/orchestration/controller-common.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { planFixture, prepareControllerOwnerRoot } from './fixtures.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const command = () => createNativeId('orchestrationCommand');

describe.each(harnesses)('$name original Run metadata HTTP', ({ make }) => {
    let h, core, base, service, app, runs, root, sourceSelector, start, now;
    beforeEach(async () => {
        h = await make(); await prepareControllerOwnerRoot(h.dirs.root);
        const directories = handle => handle === h.handle ? h.dirs : Object.fromEntries(Object.entries(h.dirs)
            .map(([key, value]) => [key, path.join(h.dataRoot, handle, path.relative(h.dirs.root, value))]));
        h.engine._directoriesByHandle = directories;
        attachNativeHostLifecycle(h.engine, { directoriesByHandle: directories });
        const installed = await installFixture(h); core = installed.core; base = await core.create(h.handle, installed.start);
        now = Date.now();
        const authoring = createOrchestrationAuthoringService(h.engine, { sessionCore: core });
        service = { ...authoring, observations: new RunObservationService({ engine: h.engine, sessionCore: core, now: () => now, pollMs: 0 }) };
        const plan = await authoring.plans.create(h.handle, command(), planFixture());
        const expected = { planId: plan.planId, expectedDraftVersion: plan.draftVersion, expectedDefinitionHash: plan.definitionHash };
        const validation = await authoring.plans.validate(h.handle, expected);
        const { planRef } = await authoring.plans.publish(h.handle, command(), { ...expected, validationDigest: validationDigest(validation) });
        const deny = async () => { throw new Error('No Effect authority in metadata fixture'); };
        ({ runs } = createOrchestrationExecutionService({ engine: h.engine, sessionCore: core,
            effectAuthority: { authorize: deny, verifySend: deny, verifyObservation: deny, verifyApproval: deny } }));
        start = () => runs.start(h.handle, command(), { planRef, sourceRequest: { domain: 'native_session', sessionId: base.session.sessionId,
            branchId: base.revision.branchId, revisionId: base.revision.revisionId }, retentionPolicyRef: { policyId: 'original_observation_fixture' } });
        root = await start(); sourceSelector = { domain: 'native_session', sessionId: base.session.sessionId, entryPointId: null };
        app = express(); app.use(express.json());
        app.use((req, _res, next) => { if (req.get('X-Test-Owner')) req.user = { profile: { handle: req.get('X-Test-Owner'), enabled: true } }; next(); });
        app.use('/api/native/orchestration', createNativeOrchestrationRouter(() => service));
    });
    afterEach(async () => { setReadOnly(false); await h?.engine.close(); await h?.cleanup(); });
    const read = (method, body, owner = h.handle) => request(app).post('/api/native/orchestration/runs/' + method).set('X-Test-Owner', owner).send({ schemaVersion: 1, body });
    const mutation = (body, { id = command(), boot = service.hostBootId } = {}) => request(app).post('/api/native/orchestration/runs/cancel')
        .set('X-Test-Owner', h.handle).set('X-Atria-Host-Boot-Id', boot).send({ schemaVersion: 1, commandId: id, expectedHostBootId: boot, body });
    const observe = (cursor = null) => read('observe', { runId: root.runId, cursor, limit: 10 });

    test('authenticated no-store metadata reads never expose internal execution objects or write durable state', async () => {
        const before = await h.engine.withTransaction(h.handle, async tx => hash(await tx.listResources({ handle: h.handle, kind: K.orchestrationRun })));
        await request(app).post('/api/native/orchestration/runs/observe').send({ schemaVersion: 1, body: { runId: root.runId, cursor: null, limit: 10 } }).expect(401);
        const result = await observe().expect(200), snapshot = result.body.outcome;
        expect(result.headers['cache-control']).toContain('no-store');
        expect(snapshot).toMatchObject({ kind: 'snapshot', seq: 0, projectionVersion: 1, payload: { status: 'admitted', costs: { status: 'not_started' } } });
        const text = JSON.stringify(snapshot);
        for (const field of ['eventSeq', 'budgetAuthorityRef', 'dispatchToken', 'inputRefs', 'effectiveGrantDigest', 'sourceRequest', 'requestNonceHash']) expect(text).not.toContain('"' + field + '"');
        expect(snapshot.payload.controls).toEqual({ cancel: true, resume: false, reconcile: false, approve: false });
        expect(snapshot.payload.events).toEqual([expect.objectContaining({ type: 'admitted', eventId: expect.stringMatching(/^[a-f0-9]{64}$/) })]);
        expect(snapshot.payload.events[0]).not.toHaveProperty('eventSeq'); expect(snapshot.payload.events[0]).not.toHaveProperty('reasonCode');
        expect((await observe(snapshot.cursor).expect(200)).body.outcome).toMatchObject({ kind: 'deltaBatch', seq: 0, payload: { changes: [] } });
        expect(await h.engine.withTransaction(h.handle, async tx => hash(await tx.listResources({ handle: h.handle, kind: K.orchestrationRun })))).toBe(before);
    });

    test('cancel uses original Host CAS, exact replay and epoch fencing while observation cursors require resync', async () => {
        const snapshot = (await observe().expect(200)).body.outcome, id = command(), body = { ...runGuard(root), reasonCode: 'user_cancelled' };
        await mutation(body, { boot: 'foreign-boot' }).expect(409);
        const cancelled = await mutation(body, { id }).expect(200);
        expect(cancelled.body.outcome).toMatchObject({ status: 'cancelled', cancelRequested: true });
        expect((await mutation(body, { id }).expect(200)).body.outcome).toEqual(cancelled.body.outcome);
        await mutation({ ...body, reasonCode: 'different_payload' }, { id }).expect(409);
        expect((await observe(snapshot.cursor).expect(409)).body.error).toBe('native_orchestration_projection_resync_required');
        expect((await observe().expect(200)).body.outcome.payload).toMatchObject({ status: 'cancelled', cancelRequested: true, controls: { cancel: false } });
        expect((await runs.get(h.handle, root.runId)).budgetAuthorityRef).toEqual(root.budgetAuthorityRef);
    });

    test('same-Host storage generation changes disable stale controls and require recovery without changing history', async () => {
        await h.engine.nativeHostLifecycle.afterRestore(h.handle);
        const snapshot = (await observe().expect(200)).body.outcome;
        expect(snapshot.payload.controls.cancel).toBe(false);
        expect(snapshot.payload.diagnostics).toContainEqual({ code: 'native_orchestration_host_recovery_required', severity: 'blocking' });
        expect(await runs.get(h.handle, root.runId)).toEqual(root);
        await mutation({ ...runGuard(root), reasonCode: 'stale_restore' }).expect(409);
    });

    test('restore generation changes invalidate observation, list and details cursors', async () => {
        await start();
        const listed = (await read('list', { sourceSelector, cursor: null, limit: 1 }).expect(200)).body.outcome;
        await mutation({ ...runGuard(root), reasonCode: 'user_cancelled' }).expect(200);
        const snapshot = (await observe().expect(200)).body.outcome;
        const detail = (await read('details', { runId: root.runId, collection: 'events', cursor: null, limit: 1 }).expect(200)).body.outcome;
        expect(listed.cursor).not.toBeNull(); expect(detail.cursor).not.toBeNull();
        await h.engine.nativeHostLifecycle.afterRestore(h.handle);
        await observe(snapshot.cursor).expect(409);
        await read('list', { sourceSelector, cursor: listed.cursor, limit: 1 }).expect(409);
        await read('details', { runId: root.runId, collection: 'events', cursor: detail.cursor, limit: 1 }).expect(409);
        expect((await observe().expect(200)).body.outcome.kind).toBe('snapshot');
    });

    test('cursor scope, expiry, service restart and owner isolation cannot read another stream', async () => {
        const snapshot = (await observe().expect(200)).body.outcome, other = await start();
        await read('observe', { runId: other.runId, cursor: snapshot.cursor, limit: 10 }).expect(409);
        await read('observe', { runId: root.runId, cursor: snapshot.cursor, limit: 10 }, 'foreign').expect(404);
        await read('observe', { runId: root.runId, cursor: null, limit: 10 }, 'foreign').expect(404);
        now += 300001; await observe(snapshot.cursor).expect(409);
        const fresh = (await observe().expect(200)).body.outcome;
        service.observations = new RunObservationService({ engine: h.engine, sessionCore: core, pollMs: 0 });
        await observe(fresh.cursor).expect(409);
        expect((await runs.get(h.handle, root.runId)).cancelRequested).toBe(false);
    });

    test('source-scoped pagination returns every Run once and rejects cross-scope list cursors', async () => {
        const created = [root, await start(), await start()], listed = [], ids = new Set(); let cursor = null;
        do {
            const page = (await read('list', { sourceSelector, cursor, limit: 1 }).expect(200)).body.outcome;
            listed.push(...page.items); cursor = page.cursor;
            if (cursor) ids.add(cursor);
        } while (cursor);
        expect(listed.map(item => item.runId).sort()).toEqual(created.map(item => item.runId).sort());
        await read('observe', { runId: root.runId, cursor: [...ids][0], limit: 10 }).expect(409);
        await read('list', { sourceSelector, cursor: null, limit: 101 }).expect(400);
        await read('list', { sourceSelector, cursor: null, limit: 1, handle: 'foreign' }).expect(400);
    });

    test('public metadata collections are bounded, version scoped and cannot request Result payloads or Effect inputs', async () => {
        const detail = (await read('details', { runId: root.runId, collection: 'nodes', cursor: null, limit: 1 }).expect(200)).body.outcome;
        expect(detail.items).toEqual([{ nodeId: root.graph.nodes[0].nodeId, kind: 'output', label: 'Result' }]); expect(detail.cursor).toBeNull();
        for (const collection of ['result', 'inputRef', 'receipt', 'approvalProof']) await read('details', { runId: root.runId, collection, cursor: null, limit: 10 }).expect(400);
        for (const method of ['start', 'resume', 'reconcile']) await read(method, {}).expect(404);
        expect((await read('diagnostics', { runId: root.runId }).expect(200)).body.outcome.diagnostics).toEqual([]);
    });

    test('source removal revokes an existing cursor; read-only storage still permits observation and refuses cancel', async () => {
        const snapshot = (await observe().expect(200)).body.outcome;
        setReadOnly(true); await observe(snapshot.cursor).expect(200);
        await mutation({ ...runGuard(root), reasonCode: 'user_cancelled' }).expect(503); setReadOnly(false);
        await h.engine.withTransaction(h.handle, tx => tx.deleteResource({ kind: K.session, handle: h.handle, sessionId: base.session.sessionId }));
        await observe(snapshot.cursor).expect(404);
        const stored = await h.engine.withTransaction(h.handle, tx => tx.getResource({ kind: K.orchestrationRun, handle: h.handle, runId: root.runId }));
        expect(stored.doc.cancelRequested).toBe(false);
    });
});
