import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { installFixture } from '../native/helpers/session-fixture.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { PlanRepository, validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { RunRepository } from '../../src/native/orchestration/run-repository.js';
import { orchestrationSessionRoots } from '../../src/native/orchestration/reference-roots.js';
import { createNativeId } from '../../src/native/identity.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { hashNativeDocument, putImmutable, withNativeResourceWrites } from '../../src/native/repositories/common.js';
import { maintainSession } from '../../src/native/session-maintenance.js';
import { planFixture, prepareControllerOwnerRoot } from './fixtures.js';

const command = () => createNativeId('orchestrationCommand');
const guard = root => ({ runId: root.runId, expectedEpoch: root.epoch, expectedStateVersion: root.stateVersion, expectedGraphRevision: root.graphRevision });

describe.each(CONTRACT_HARNESSES)('$name original Session retention with V3 metadata', ({ make }) => {
    let h, f, view, sessionId, runs, planRef;
    beforeEach(async () => {
        h = await make();
        await prepareControllerOwnerRoot(h.dirs.root);
        const lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        f = await installFixture(h); view = await f.core.create(h.handle, f.start); sessionId = view.session.sessionId;
        const authorize = async () => {}, assertWriter = (owner, tx) => lifecycle.assertWriter(owner, tx);
        const plans = new PlanRepository({ engine: h.engine, authorize, assertWriter,
            validateDependencies: async () => ({ status: 'valid', issues: [], dependencyDigest: hashNativeDocument([]) }) });
        const plan = await plans.create(h.handle, command(), planFixture());
        const expected = { planId: plan.planId, expectedDraftVersion: plan.draftVersion, expectedDefinitionHash: plan.definitionHash };
        const report = await plans.validate(h.handle, expected);
        ({ planRef } = await plans.publish(h.handle, command(), { ...expected, validationDigest: validationDigest(report) }));
        // Controlled admission only: the test proves retention, never source authorization.
        runs = new RunRepository({ engine: h.engine, authorize, assertWriter, admit: async ({ sourceRequest }) => {
            const binding = { sourceRequest };
            return { sourceBinding: { ...binding, bindingDigest: hashNativeDocument(binding) }, budgetAuthorityRef: { authority: 'test-original-bank', sessionId } };
        } });
    });
    afterEach(async () => { await h?.engine.close(); await h?.cleanup(); });
    const orphan = async () => {
        const revisionId = createNativeId('revision');
        await f.sessionRepo.putRevision(h.handle, { ...view.revision, revisionId });
        return revisionId;
    };
    const start = revisionId => runs.start(h.handle, command(), { planRef,
        sourceRequest: { domain: 'native_session', sessionId, branchId: view.revision.branchId, revisionId },
        retentionPolicyRef: { policyId: 'retain-original-sources' } });

    test('a new Run invalidates old GC quarantine; terminal unknown history remains a root without granting read authority', async () => {
        const pinned = await orphan(), historical = await orphan(), unused = await orphan(), now = Date.now() + 1000;
        await maintainSession(f.sessionRepo, h.handle, sessionId, { now });
        let root = await start(pinned);
        const refs = await f.sessionRepo.getRevisionReferences(h.handle, sessionId, pinned);
        expect(refs).toEqual(expect.arrayContaining([expect.objectContaining({ kind: K.orchestrationRun, runId: root.runId })]));
        await expect(f.sessionRepo.deleteRevision(h.handle, sessionId, pinned)).rejects.toMatchObject({ code: 'native_session_revision_referenced' });
        // A retained orphan is not a committed Branch ancestor and cannot become Context.
        await expect(f.sessionRepo.loadSnapshot(h.handle, sessionId, { revisionId: pinned })).rejects.toThrow('committed native session revision');
        const observationId = 'historical-unknown';
        await withNativeResourceWrites(h.handle, [root.runId], () => h.engine.withTransaction(h.handle, tx => putImmutable(tx,
            { kind: K.orchestrationRecord, handle: h.handle, runId: root.runId, recordType: 'receipt', recordId: observationId },
            { schemaVersion: 1, runId: root.runId, outcome: 'unknown', sourceRefs: [{ sessionId, revisionId: historical }] })));
        root = await runs.cancel(h.handle, command(), { ...guard(root), reasonCode: 'test_cancelled' });
        expect(root.status).toBe('cancelled');
        await expect(f.sessionRepo.deleteRevision(h.handle, sessionId, historical)).rejects.toMatchObject({ code: 'native_session_revision_referenced' });
        await expect(f.sessionRepo.delete(h.handle, sessionId)).rejects.toMatchObject({ code: 'native_session_orchestration_referenced' });
        const removed = [];
        for (let pass = 0; pass < 30; pass++) removed.push(...(await maintainSession(f.sessionRepo, h.handle, sessionId, { now: now + (pass + 1) * 60001 })).deleted);
        expect(removed.map(key => key.revisionId)).toContain(unused);
        expect(removed.map(key => key.revisionId)).not.toContain(pinned);
        expect(removed.map(key => key.revisionId)).not.toContain(historical);
        expect(await f.sessionRepo.getRevision(h.handle, sessionId, pinned)).not.toBeNull();
        expect(await f.sessionRepo.getRevision(h.handle, sessionId, historical)).not.toBeNull();
    });

    test('corrupt retained metadata fails closed before direct delete or GC', async () => {
        const revisionId = await orphan(), root = await start(revisionId);
        const key = { kind: K.orchestrationRun, handle: h.handle, runId: root.runId };
        await withNativeResourceWrites(h.handle, [root.runId], () => h.engine.withTransaction(h.handle, async tx => {
            const row = await tx.getResource(key); await tx.putResource(key, { ...row, integrity: '0'.repeat(64) });
        }));
        await expect(h.engine.withTransaction(h.handle, tx => orchestrationSessionRoots(tx, h.handle, sessionId))).rejects.toMatchObject({ code: 'native_orchestration_integrity_mismatch' });
        await expect(f.sessionRepo.deleteRevision(h.handle, sessionId, revisionId)).rejects.toMatchObject({ code: 'native_orchestration_integrity_mismatch' });
        await expect(maintainSession(f.sessionRepo, h.handle, sessionId)).rejects.toMatchObject({ code: 'native_orchestration_integrity_mismatch' });
        expect(await f.sessionRepo.getRevision(h.handle, sessionId, revisionId)).not.toBeNull();
    });
});
