import express from 'express';
import request from 'supertest';
import path from 'node:path';
import { createNativeOrchestrationRouter } from '../../src/endpoints/native-orchestration.js';
import { createOrchestrationAuthoringService } from '../../src/native/orchestration/authoring-service.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { VersionedJsonResourceHandler } from '../../src/native/model-prompt-runtime/persistence.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { planFixture } from './fixtures.js';

describe.each(CONTRACT_HARNESSES)('$name authenticated Native authoring HTTP', ({ make }) => {
    let h, app, service;
    beforeEach(async () => {
        h = await make();
        const directories = handle => handle === h.handle ? h.dirs : { ...h.dirs, root: path.join(h.dataRoot, 'other-user') };
        if (h.engine._directoriesByHandle) h.engine._directoriesByHandle = directories;
        attachNativeHostLifecycle(h.engine, { directoriesByHandle: directories });
        service = createOrchestrationAuthoringService(h.engine);
        app = express(); app.use(express.json());
        app.use((req, _res, next) => { if (req.get('X-Test-Owner')) req.user = { profile: { handle: req.get('X-Test-Owner'), enabled: true } }; next(); });
        app.use('/api/native/orchestration', createNativeOrchestrationRouter(() => service));
    });
    afterEach(async () => { setReadOnly(false); await h?.engine.close(); await h?.cleanup(); });
    const read = (suffix, body, owner = h.handle) => request(app).post('/api/native/orchestration/' + suffix).set('X-Test-Owner', owner).send({ schemaVersion: 1, body });
    const mutation = (suffix, body, { id = createNativeId('orchestrationCommand'), boot = service.hostBootId, owner = h.handle } = {}) => request(app)
        .post('/api/native/orchestration/' + suffix).set('X-Test-Owner', owner).set('X-Atria-Host-Boot-Id', boot)
        .send({ schemaVersion: 1, commandId: id, expectedHostBootId: boot, body });

    test('current Host authoring publishes exact revisions, returns no-store, and is isolated by authenticated owner', async () => {
        await request(app).post('/api/native/orchestration/plans/list').send({ schemaVersion: 1, body: { cursor: null, limit: 10 } }).expect(401);
        const input = planFixture(), id = createNativeId('orchestrationCommand');
        const created = await mutation('plans/create', input, { id }).expect(200);
        expect(created.headers['cache-control']).toContain('no-store');
        const root = created.body.outcome;
        expect((await mutation('plans/create', input, { id }).expect(200)).body.outcome).toEqual(root);
        expect((await read('plans/get', { planId: root.planId }).expect(200)).body.outcome).toEqual(root);
        await read('plans/get', { planId: root.planId }, 'another-owner').expect(404);
        const expected = { planId: root.planId, expectedDraftVersion: root.draftVersion, expectedDefinitionHash: root.definitionHash };
        const validated = await read('plans/validate', expected).expect(200);
        expect(validated.body.outcome.status).toBe('valid');
        expect(validated.headers['x-atria-validation-digest']).toBe(validationDigest(validated.body.outcome));
        const published = await mutation('plans/publish', { ...expected, validationDigest: validationDigest(validated.body.outcome) }).expect(200);
        expect((await read('plans/revision', { planRef: published.body.outcome.planRef }).expect(200)).body.outcome.definition).toEqual(input.definition);
        const revisions = await read('plans/revisions', { planId: root.planId, cursor: null, limit: 10 }).expect(200);
        expect(revisions.body.outcome.items.map(item => item.planRevisionId)).toEqual([published.body.outcome.planRef.planRevisionId]);
    });

    test('boot conflicts, owner injection, unregistered execute/approve routes and original read-only mode cannot mutate', async () => {
        await mutation('plans/create', planFixture(), { boot: 'previous-boot' }).expect(409);
        await request(app).post('/api/native/orchestration/plans/create').set('X-Test-Owner', h.handle).set('X-Atria-Host-Boot-Id', service.hostBootId)
            .send({ schemaVersion: 1, commandId: createNativeId('orchestrationCommand'), expectedHostBootId: service.hostBootId, handle: 'victim', body: planFixture() }).expect(400);
        for (const route of ['effects/dispatch', 'graph/patch', 'approvals/decide', 'runs/start']) await mutation(route, {}).expect(404);
        setReadOnly(true);
        await mutation('plans/create', planFixture()).expect(503);
        expect((await read('plans/list', { cursor: null, limit: 10 }).expect(200)).body.outcome.items).toEqual([]);
    });

    test('page cursors are bounded, scoped and return every exact Plan once', async () => {
        const ids = [];
        for (let i = 0; i < 3; i++) ids.push((await mutation('plans/create', planFixture()).expect(200)).body.outcome.planId);
        const first = (await read('plans/list', { cursor: null, limit: 2 }).expect(200)).body.outcome;
        expect(first.items).toHaveLength(2);
        expect(first.cursor).not.toBeNull();
        const second = (await read('plans/list', { cursor: first.cursor, limit: 2 }).expect(200)).body.outcome;
        expect([...first.items, ...second.items].map(item => item.planId).sort()).toEqual(ids.sort());
        expect(second.cursor).toBeNull();
        await read('plans/list', { cursor: first.cursor, limit: 2 }, 'another-owner').expect(400);
        await read('plans/list', { cursor: null, limit: 101 }).expect(400);
    });

    test('pure validation reads the original exact Native library resource and detects pin mismatch', async () => {
        const library = new VersionedJsonResourceHandler({ engine: h.engine });
        const module = { schemaVersion: 1, promptModuleId: createNativeId('promptModule'), revision: createNativeId('revision'), displayName: 'V3 exact dependency', target: 'system.foundation', stages: ['stage.main'], body: 'An original Native module' };
        await library.commit(h.handle, 'core.prompt-module', module);
        const ref = { scope: 'library', resourceType: 'core.prompt-module', resourceId: module.promptModuleId, revision: module.revision };
        const snapshot = (await library.getExact(h.handle, ref)).snapshot;
        const input = planFixture();
        input.dependencyPins = [{ pinId: 'prompt.foundation', port: 'context', resourceRef: ref, integrity: hashNativeDocument(snapshot) }];
        const pin = await read('dependencies/inspect', { pinId: 'prompt.foundation', port: 'context', resourceRef: ref }).expect(200);
        expect(pin.body.outcome).toEqual(input.dependencyPins[0]); expect(JSON.stringify(pin.body)).not.toContain('An original Native module');
        await read('dependencies/inspect', { pinId: 'prompt.foundation', port: 'context', resourceRef: ref, handle: 'victim' }).expect(400);
        const created = (await mutation('plans/create', input).expect(200)).body.outcome;
        const expected = { planId: created.planId, expectedDraftVersion: created.draftVersion, expectedDefinitionHash: created.definitionHash };
        expect((await read('plans/validate', expected).expect(200)).body.outcome.status).toBe('valid');
        await expect(library.delete(h.handle, ref, async () => [])).rejects.toMatchObject({ code: 'native_resource_referenced' });
        expect((await library.getOrchestrationReferences(h.handle, ref)).map(item => item.planId)).toContain(created.planId);
        input.dependencyPins[0].integrity = '0'.repeat(64);
        const saved = (await mutation('plans/save', { ...expected, ...input }).expect(200)).body.outcome;
        const invalid = (await read('plans/validate', { planId: saved.planId, expectedDraftVersion: saved.draftVersion, expectedDefinitionHash: saved.definitionHash }).expect(200)).body.outcome;
        expect(invalid).toMatchObject({ status: 'invalid', issues: [expect.objectContaining({ code: 'native_orchestration_dependency_stale' })] });
    });
});
