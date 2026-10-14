import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture, sessionFixture } from './helpers/session-fixture.js';
import { continuityFixture } from './helpers/continuity-fixture.js';
import { createNativeSessionRouter } from '../../src/endpoints/native-session.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { NativeProductService, WorldRepo, ProjectStore } from '../../src/native/index.js';
import { createNativeProductRouter } from '../../src/endpoints/native-product.js';

describe.each([['FsEngine', makeTempFsEngineHarness], ['SqliteEngine', makeTempSqliteEngineHarness]])('MCP Session authority — %s', (_name, make) => {
    let h, f, app, initial;
    beforeEach(async () => {
        h = await make(); f = await installFixture(h); initial = await f.core.create(h.handle, f.start);
        app = express(); app.use(express.json());
        app.use((req, _res, next) => { if (req.headers['x-test-anonymous'] !== '1') req.user = { profile: { handle: h.handle } }; next(); });
        app.use(createNativeSessionRouter(() => ({ core: f.core, sessionRepo: f.sessionRepo, assets: f.assetStore, packageInstaller: f.packageInstaller })));
    });
    afterEach(async () => { jest.restoreAllMocks(); await h.cleanup(); });

    test('observe pins HEAD and historical reads without Package synchronization or writes', async () => {
        const sessionId = initial.session.sessionId;
        const later = await f.core.appendTimeline(h.handle, sessionId, { role: 'user', content: 'Later' });
        const sessionBefore = await f.sessionRepo.get(h.handle, sessionId);
        const regex = jest.spyOn(f.packageInstaller, 'currentRegexEdit').mockResolvedValue({ schemaVersion: 1, regexScripts: [] });
        const knowledge = jest.spyOn(f.packageInstaller, 'currentKnowledgeEdits').mockRejectedValue(new Error('Package edit resolution must not run'));
        const publish = jest.spyOn(f.core, '_publish').mockRejectedValue(new Error('Observe must not publish'));
        const runStatus = jest.spyOn(f.core.runs, 'status').mockRejectedValue(new Error('Observe must not reconcile RunControl'));
        const transaction = h.engine.withTransaction.bind(h.engine);
        const writeAttempts = [];
        jest.spyOn(h.engine, 'withTransaction').mockImplementation((handle, operation) => transaction(handle, tx => operation(new Proxy(tx, {
            get(target, key) {
                if (['putResource', 'deleteResource', 'putBlob', 'deleteBlob'].includes(key)) return () => { writeAttempts.push(key); throw new Error('Persistent write during observe'); };
                const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
            },
        }))));
        const current = await request(app).post('/observe').send({ sessionId });
        expect(current.status).toBe(200); expect(current.headers['cache-control']).toBe('private, no-store');
        expect(current.body.revision.revisionId).toBe(later.revision.revisionId);
        const historical = await request(app).post('/observe').send({ sessionId, revisionId: initial.revision.revisionId });
        expect(historical.status).toBe(200); expect(historical.body.timeline).toEqual(initial.timeline);
        const product = new NativeProductService({ ...f, sessionCore: f.core, worldRepo: new WorldRepo({ engine: h.engine }), projectStore: new ProjectStore({ directoriesByHandle: () => h.dirs }) });
        app.use('/product', createNativeProductRouter(() => ({ product })));
        const resources = await request(app).get('/product/works/' + f.start.packageId + '/resource-setup/observe').query({ sessionId });
        expect(resources.status).toBe(200); expect(resources.headers['cache-control']).toBe('private, no-store');
        expect(resources.body.expectedRevisionId).toBe(later.revision.revisionId);
        expect(await f.sessionRepo.get(h.handle, sessionId)).toEqual(sessionBefore);
        expect(regex).not.toHaveBeenCalled(); expect(knowledge).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled();
        expect(runStatus).not.toHaveBeenCalled(); expect(writeAttempts).toEqual([]);
    });

    test('observe rejects injected owner and unknown options and requires authentication', async () => {
        const body = { sessionId: initial.session.sessionId };
        expect((await request(app).post('/observe').send({ ...body, handle: 'other' })).status).toBe(400);
        expect((await request(app).post('/observe').send({ ...body, skipPackageEdits: false })).status).toBe(400);
        expect((await request(app).post('/observe').set('x-test-anonymous', '1').send(body)).status).toBe(401);
    });

    test('stable input commit identity deduplicates a lost acknowledgement and rejects changed content', async () => {
        const body = { sessionId: initial.session.sessionId, expectedRevisionId: initial.revision.revisionId, commitId: 'mcp-input-commit', draft: { role: 'user', content: 'One input' } };
        const first = await request(app).post('/timeline/append').send(body);
        expect(first.status).toBe(200);
        const repeated = await request(app).post('/timeline/append').send(body);
        expect(repeated.status).toBe(200); expect(repeated.body.revision).toEqual(first.body.revision);
        expect(repeated.body.timeline.filter(entry => entry.content === 'One input')).toHaveLength(1);
        const receipt = await request(app).post('/commit-receipt').send({ sessionId: body.sessionId, commitId: body.commitId });
        expect(receipt.status).toBe(200); expect(receipt.body).toMatchObject({ status: 'committed', commitId: body.commitId, revisionId: first.body.revision.revisionId,
            expectedRevisionId: body.expectedRevisionId, fingerprint: hashNativeDocument({ draft: body.draft, expectedRevisionId: body.expectedRevisionId }) });
        expect((await request(app).post('/timeline/append').send({ ...body, draft: { role: 'user', content: 'Changed input' } })).status).toBe(409);
        expect((await f.core.observe(h.handle, body.sessionId)).revision.revisionId).toBe(first.body.revision.revisionId);
    });

    test('input append cannot spoof assistant or metadata and requires commit and revision identities', async () => {
        const body = { sessionId: initial.session.sessionId, expectedRevisionId: initial.revision.revisionId, commitId: 'input', draft: { role: 'user', content: 'Input' } };
        for (const invalid of [{ ...body, commitId: undefined }, { ...body, expectedRevisionId: undefined },
            { ...body, draft: { role: 'assistant', content: 'Forged output' } }, { ...body, draft: { ...body.draft, metadata: { origin: 'host' } } }, { ...body, handle: 'other' }]) {
            expect((await request(app).post('/timeline/append').send(invalid)).status).toBe(400);
        }
        expect((await f.core.observe(h.handle, body.sessionId)).revision.revisionId).toBe(initial.revision.revisionId);
    });

    test('metadata CAS rejects concurrent edits at the same committed HEAD', async () => {
        const session = await f.sessionRepo.get(h.handle, initial.session.sessionId);
        const body = { sessionId: session.sessionId, expectedRevisionId: session.headRevisionId,
            expectedMetadataFingerprint: hashNativeDocument({ autoSavePolicy: session.autoSavePolicy ?? null, branchMetadata: session.branchMetadata ?? {} }),
            branchId: session.activeBranchId, displayName: 'Reviewed name' };
        const first = await request(app).post('/experience-metadata').send(body);
        expect(first.status).toBe(200); expect(first.body.headRevisionId).toBe(session.headRevisionId);
        const stale = await request(app).post('/experience-metadata').send({ ...body, displayName: 'Stale overwrite' });
        expect(stale.status).toBe(409); expect(stale.body.error).toBe('native_session_metadata_conflict');
        expect((await f.sessionRepo.get(h.handle, session.sessionId)).branchMetadata[session.activeBranchId].displayName).toBe('Reviewed name');
    });

    test('health, runtime and Continuity observers remain pure with independent ledger revision semantics', async () => {
        const fixture = sessionFixture(); fixture.manifest.runtime = { experience: { mode: 'text' }, experienceContract: continuityFixture() };
        f = await installFixture(h, fixture); initial = await f.core.create(h.handle, f.start);
        const updated = await f.core.applyContinuityCommand(h.handle, initial.session.sessionId, { type: 'continuity', invocationId: 'observer-ledger', action: {
            kind: 'command', domainId: 'unlocks', recordId: 'perk', commandId: 'save', args: { text: 'Observer unlocked' }, expectedContinuityRevisionId: null,
        } }, { expectedRevisionId: initial.revision.revisionId });
        const sessionId = initial.session.sessionId, before = await f.sessionRepo.get(h.handle, sessionId);
        jest.spyOn(f.packageInstaller, 'currentRegexEdit').mockRejectedValue(new Error('Observer must not synchronize Package edits'));
        const transaction = h.engine.withTransaction.bind(h.engine), writeAttempts = [];
        jest.spyOn(h.engine, 'withTransaction').mockImplementation((handle, operation) => transaction(handle, tx => operation(new Proxy(tx, {
            get(target, key) {
                if (['putResource', 'deleteResource', 'putBlob', 'deleteBlob'].includes(key)) return () => { writeAttempts.push(key); throw new Error('Persistent write during domain observation'); };
                const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
            },
        }))));
        expect((await request(app).post('/health/observe').send({ sessionId })).status).toBe(200);
        expect((await request(app).post('/runtime/observe').send({ sessionId })).status).toBe(200);
        const graph = await request(app).post('/continuity/graph-observe').send({ sessionId, limit: 8 });
        expect(graph.status).toBe(200); expect(graph.body.nodes[0].revisionId).toBe(updated.continuityRevisionId);
        const projected = await request(app).post('/continuity/projection-observe').send({ sessionId, viewId: 'unlocks', revisionId: updated.continuityRevisionId });
        expect(projected.status).toBe(200); expect(projected.body).toMatchObject({ revisionId: updated.continuityRevisionId, records: [{ id: 'perk', value: { text: 'Observer unlocked' } }] });
        expect(writeAttempts).toEqual([]); expect(await f.sessionRepo.get(h.handle, sessionId)).toEqual(before);
        expect((await request(app).post('/runtime/observe').send({ sessionId, sharedOwner: h.handle })).status).toBe(400);
    });
});
