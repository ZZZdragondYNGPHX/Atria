import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import request from 'supertest';
import { USER_DIRECTORY_TEMPLATE } from '../../src/constants.js';
import { router } from '../../src/endpoints/users-private.js';
import { getUserDirectories, USER_BACKUP_SELECTION_DEFAULTS } from '../../src/users.js';
import { ENDPOINT_HARNESSES, makeEndpointHarness } from '../storage/harness/endpoint-harness.js';
import { runFixture } from '../native/helpers/run-fixture.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { prepareControllerOwnerRoot, planFixture } from './fixtures.js';
import { PlanRepository, validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { RunRepository } from '../../src/native/orchestration/run-repository.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';

const selection = Object.fromEntries(Object.keys(USER_BACKUP_SELECTION_DEFAULTS).map(key => [key, key === 'native']));
async function archive(h) {
    const response = await request(h.app).post('/api/users/backup').send({ handle: h.handle, selection }).buffer(true).parse((res, cb) => {
        const chunks = []; res.on('data', bytes => chunks.push(bytes)); res.on('end', () => cb(null, Buffer.concat(chunks))); res.on('error', cb);
    });
    expect(response.status).toBe(200); return response.body;
}

async function harness(mode) {
    const h = await makeEndpointHarness({ mode, nativeHostTopology: 'direct_single_primary', mount(app, { dirs }) {
        const uploads = path.join(dirs.root, 'uploads'); fs.mkdirSync(uploads, { recursive: true });
        app.use('/api/users/restore-backup', multer({ dest: uploads }).single('avatar'));
        app.use('/api/users', router);
    } });
    globalThis.DATA_ROOT = h.dataRoot;
    Object.assign(h.dirs, Object.fromEntries(Object.entries(USER_DIRECTORY_TEMPLATE).map(([key, rel]) => [key, path.join(h.dirs.root, rel)])));
    Object.assign(getUserDirectories(h.handle), h.dirs);
    if (!fs.existsSync(path.join(h.dirs.root, 'native-host.identity'))) await prepareControllerOwnerRoot(h.dirs.root);
    if (!h.engine.nativeHostLifecycle) attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
    return h;
}

describe.each(ENDPOINT_HARNESSES)('$name original account restore does not refund Session work', ({ mode }) => {
    let h; const previousRoot = globalThis.DATA_ROOT;
    afterEach(async () => { if (h) await h.cleanup(); globalThis.DATA_ROOT = previousRoot; });
    test('overwrite of an older real archive preserves unknown/child capacity and permits late actual settlement only', async () => {
        h = await harness(mode);
        const f = await runFixture(h, 'http://127.0.0.1:1/unused'), base = await f.begin();
        const oldArchive = await archive(h), sessionId = base.session.sessionId;
        const anchor = { branchId: base.revision.branchId, revisionId: base.revision.revisionId }, limits = { maxRequests: 2, maxTokens: 200 };
        await f.core.runs.reserveComputeChild(h.handle, base, anchor, limits,
            { reservationId: 'restore-child', parentReservationId: null, consumerId: 'test-child', limits: { maxRequests: 1, maxTokens: 100 } });
        const attempt = { attemptId: 'a'.repeat(64), requestId: 'restore-request', targetFingerprint: 'b'.repeat(64), inputFingerprint: 'c'.repeat(64), estimatedTokens: 100 };
        const charged = await f.core.runs.admitCompute(h.handle, base, anchor, limits, attempt, { reservationId: 'restore-child' });
        await f.core.runs.settleCompute(h.handle, sessionId, charged.operation, attempt.attemptId, null);
        const response = await request(h.app).post('/api/users/restore-backup').field('handle', h.handle).field('mode', 'overwrite')
            .field('selection', JSON.stringify(selection)).attach('avatar', oldArchive, 'old-native.zip');
        expect(response.status).toBe(200);
        const restored = await f.core.runs.status(h.handle, sessionId);
        expect(restored.restoreState).toBe('review_required');
        expect(restored.operations[charged.operation].compute.reservations).toEqual([expect.objectContaining({ reservationId: 'restore-child', status: 'held' })]);
        expect((await f.core.runs.observeCompute(h.handle, sessionId, charged.operation, attempt.attemptId)).compute).toMatchObject({ status: 'unknown', estimatedTokens: 100 });
        await expect(f.core.runs.admitCompute(h.handle, base, anchor, limits, { ...attempt, attemptId: 'd'.repeat(64) })).rejects.toMatchObject({ code: 'native_run_restore_review_required' });
        await expect(f.core.appendTimeline(h.handle, sessionId, { role: 'user', content: 'Restore cannot resume authority' })).rejects.toMatchObject({ code: 'native_run_restore_review_required' });
        await f.core.runs.settleCompute(h.handle, sessionId, charged.operation, attempt.attemptId, { totalTokens: 60 });
        await f.core.runs.releaseComputeChild(h.handle, sessionId, charged.operation, 'restore-child');
        const settled = await f.core.runs.observeCompute(h.handle, sessionId, charged.operation, attempt.attemptId);
        expect(settled.compute).toMatchObject({ status: 'settled', usage: { totalTokens: 60 } });
        expect((await f.core.runs.status(h.handle, sessionId)).restoreState).toBe('review_required');
    }, 30000);

    test('retained active and terminal V3 history refuses dangerous replacement before data clear', async () => {
        h = await harness(mode);
        const f = await runFixture(h, 'http://127.0.0.1:1/unused'), base = await f.begin(), oldArchive = await archive(h);
        const command = () => createNativeId('orchestrationCommand'), authorize = async () => {};
        const assertWriter = (owner, tx) => h.engine.nativeHostLifecycle.assertWriter(owner, tx);
        const plans = new PlanRepository({ engine: h.engine, authorize, assertWriter,
            validateDependencies: async () => ({ status: 'valid', issues: [], dependencyDigest: hashNativeDocument([]) }) });
        const plan = await plans.create(h.handle, command(), planFixture());
        const expected = { planId: plan.planId, expectedDraftVersion: plan.draftVersion, expectedDefinitionHash: plan.definitionHash };
        const report = await plans.validate(h.handle, expected);
        const { planRef } = await plans.publish(h.handle, command(), { ...expected, validationDigest: validationDigest(report) });
        const binding = { sourceRef: { sessionId: base.session.sessionId, branchId: base.revision.branchId, revisionId: base.revision.revisionId } };
        const runs = new RunRepository({ engine: h.engine, authorize, assertWriter,
            admit: async () => ({ sourceBinding: { ...binding, bindingDigest: hashNativeDocument(binding) }, budgetAuthorityRef: { authority: 'test-original-session-bank' } }) });
        let root = await runs.start(h.handle, command(), { planRef, sourceRequest: {}, retentionPolicyRef: { policyId: 'retain-source-history' } });
        const admittedArchive = await archive(h);
        for (const state of ['active', 'terminal']) {
            const response = await request(h.app).post('/api/users/restore-backup').field('handle', h.handle).field('mode', state === 'active' ? 'overwrite' : 'merge')
                .field('selection', JSON.stringify(selection)).attach('avatar', state === 'active' ? oldArchive : admittedArchive, 'old-native.zip');
            expect(response.status).toBe(409);
            expect(response.body.code).toBe('native_orchestration_retention_review_required');
            expect(await runs.get(h.handle, root.runId)).toEqual(root);
            expect((await f.core.observe(h.handle, base.session.sessionId)).revision.revisionId).toBe(base.revision.revisionId);
            if (state === 'active') root = await runs.cancel(h.handle, command(), { runId: root.runId, expectedEpoch: root.epoch,
                expectedStateVersion: root.stateVersion, expectedGraphRevision: root.graphRevision, reasonCode: 'test_cancelled' });
        }
    }, 30000);
});
