import { jest } from '@jest/globals';
import { PlanRepository, validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { RunRepository } from '../../src/native/orchestration/run-repository.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';
import { planFixture } from './fixtures.js';

const command = () => createNativeId('orchestrationCommand');
const guard = root => ({ runId: root.runId, expectedEpoch: root.epoch, expectedStateVersion: root.stateVersion, expectedGraphRevision: root.graphRevision });

describe.each(CONTRACT_HARNESSES)('$name durable Host RunLedger', ({ make, name }) => {
    let h, lifecycle, repository, planRef, plan, admit, authorize;
    const makeRepository = () => new RunRepository({ engine: h.engine, authorize, admit, assertWriter: (handle, tx) => lifecycle.assertWriter(handle, tx) });
    const startBody = () => ({ planRef, sourceRequest: { source: 'test-original-native-authority' }, retentionPolicyRef: { policyId: 'explicit-test-retention' } });
    beforeEach(async () => {
        h = await make();
        lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        authorize = jest.fn(async () => {});
        const source = { sourceAuthority: 'native_session', sourceRef: { sessionId: createNativeId('session'), branchId: createNativeId('branch'), revisionId: createNativeId('revision') } };
        admit = jest.fn(async () => ({ sourceBinding: { ...source, bindingDigest: hashNativeDocument(source) }, budgetAuthorityRef: { domain: 'native_session', sessionId: source.sourceRef.sessionId } }));
        const plans = new PlanRepository({ engine: h.engine, authorize, assertWriter: (handle, tx) => lifecycle.assertWriter(handle, tx),
            validateDependencies: async () => ({ status: 'valid', issues: [], dependencyDigest: hashNativeDocument([]) }) });
        const created = await plans.create(h.handle, command(), planFixture());
        plan = created.definition;
        const expected = { planId: created.planId, expectedDraftVersion: created.draftVersion, expectedDefinitionHash: created.definitionHash };
        const report = await plans.validate(h.handle, expected);
        ({ planRef } = await plans.publish(h.handle, command(), { ...expected, validationDigest: validationDigest(report) }));
        repository = makeRepository();
    });
    afterEach(async () => { await h?.engine.close(); await h?.cleanup(); });

    test('Run root, admission event and stable command outcome commit together', async () => {
        const id = command(), body = startBody();
        const root = await repository.start(h.handle, id, body);
        expect(root).toMatchObject({ status: 'admitted', stateVersion: 0, eventSeq: 0, parentRef: null, rootRunId: root.runId, hostBootId: lifecycle.hostBootId });
        expect(root).not.toHaveProperty('balance');
        expect(await makeRepository().start(h.handle, id, body)).toEqual(root);
        expect(admit).toHaveBeenCalledTimes(1);
        const events = await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: h.handle, runId: root.runId, recordType: 'event' }));
        expect(events.map(record => record.doc.type)).toEqual(['admitted']);
        await expect(repository.start(h.handle, id, { ...body, sourceRequest: { changed: true } })).rejects.toMatchObject({ code: 'native_orchestration_command_conflict' });
    });

    test('simultaneous cancel CAS has one winner and durable event/epoch, without claiming refunds', async () => {
        const root = await repository.start(h.handle, command(), startBody());
        const body = { ...guard(root), reasonCode: 'user_cancelled' };
        const outcomes = await Promise.allSettled([repository.cancel(h.handle, command(), body), repository.cancel(h.handle, command(), body)]);
        expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1);
        expect(outcomes.find(item => item.status === 'rejected').reason.code).toBe('native_orchestration_run_conflict');
        const next = await repository.get(h.handle, root.runId);
        expect(next).toMatchObject({ cancelRequested: true, status: 'cancelled', epoch: root.epoch + 1, stateVersion: 1, eventSeq: 1, budgetAuthorityRef: root.budgetAuthorityRef });
        expect(next).not.toHaveProperty('refunded');
    });

    test('pending attempt identity/input/source remain durable; duplicate active attempts are rejected', async () => {
        const root = await repository.start(h.handle, command(), startBody());
        const body = { ...guard(root), nodeId: plan.nodes[0].nodeId, inputRefs: [], inputDigest: hashNativeDocument([]), effectiveGrantDigest: hashNativeDocument({ grants: [] }), budgetRef: root.budgetAuthorityRef };
        const id = command(), outcome = await repository.beginAttempt(h.handle, id, body);
        expect(await repository.beginAttempt(h.handle, id, body)).toEqual(outcome);
        const current = await repository.get(h.handle, root.runId);
        await expect(repository.beginAttempt(h.handle, command(), { ...body, ...guard(current) })).rejects.toMatchObject({ code: 'native_orchestration_attempt_already_active' });
        const attempt = await h.engine.withTransaction(h.handle, tx => tx.getResource({ kind: K.orchestrationRecord, handle: h.handle, runId: root.runId, recordType: 'attempt', recordId: outcome.attemptId }));
        expect(attempt.doc).toMatchObject({ attemptId: outcome.attemptId, attemptNumber: 1, status: 'pending', inputDigest: body.inputDigest, sourceBindingDigest: root.sourceBinding.bindingDigest, effectRefs: [] });
        expect(current.progress.attempts).toBe(1);
        expect(current.eventSeq).toBe(1);
    });

    test('new Host cannot mutate old-boot Run before explicit recovery; recovery stays blocked and preserves counters', async () => {
        const root = await repository.start(h.handle, command(), startBody());
        await h.engine.close();
        h.engine = new h.engine.constructor({ url: h.engine._nativeOwnerUrl, directoriesByHandle: () => h.dirs });
        lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        repository = makeRepository();
        await expect(repository.cancel(h.handle, command(), { ...guard(root), reasonCode: 'old_boot' })).rejects.toMatchObject({ code: 'native_orchestration_run_conflict' });
        const recovered = await repository.recover(h.handle, command(), guard(root));
        expect(recovered).toMatchObject({ hostBootId: lifecycle.hostBootId, epoch: root.epoch + 1, status: 'blocked', stateVersion: 1, eventSeq: 1, progress: root.progress, budgetAuthorityRef: root.budgetAuthorityRef });
        expect(await repository.get(h.handle, root.runId)).toEqual(recovered);
        expect(admit).toHaveBeenCalledTimes(1);
    });

    test('denied source admission or corrupted source digest cannot leave a partial Run/command', async () => {
        admit.mockRejectedValueOnce(new Error('original_source_revoked'));
        await expect(repository.start(h.handle, command(), startBody())).rejects.toThrow('original_source_revoked');
        admit.mockResolvedValueOnce({ sourceBinding: { bindingDigest: '0'.repeat(64) }, budgetAuthorityRef: { domain: 'forged' } });
        await expect(repository.start(h.handle, command(), startBody())).rejects.toThrow('SourceBinding digest mismatch');
        const runs = await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: h.handle }));
        expect(runs).toEqual([]);
    });

    test('original storage read-only mode keeps observation available and refuses new mutations', async () => {
        const root = await repository.start(h.handle, command(), startBody());
        setReadOnly(true);
        try {
            expect(await repository.get(h.handle, root.runId)).toEqual(root);
            await expect(repository.start(h.handle, command(), startBody())).rejects.toMatchObject({ code: 'storage_read_only' });
            await expect(repository.cancel(h.handle, command(), { ...guard(root), reasonCode: 'read_only' })).rejects.toMatchObject({ code: 'storage_read_only' });
        } finally { setReadOnly(false); }
    });

    test('restoring within the same Host invalidates the old storage generation and requires blocked recovery', async () => {
        const root = await repository.start(h.handle, command(), startBody());
        await lifecycle.afterRestore(h.handle);
        await expect(repository.cancel(h.handle, command(), { ...guard(root), reasonCode: 'stale_restore' })).rejects.toMatchObject({ code: 'native_orchestration_run_conflict' });
        const recovered = await repository.recover(h.handle, command(), guard(root));
        expect(recovered.hostBootId).toBe(root.hostBootId);
        expect(recovered.hostGeneration).toBe(root.hostGeneration + 1);
        expect(recovered.epoch).toBe(root.epoch + 1);
        expect(recovered.status).toBe('blocked');
    });

    const faultTest = name === 'FsEngine' ? test : test.skip;
    faultTest.each(['prepare', 'publish', 'install', 'ack'])('original Native FS Journal %s failure cannot split root/event/command or create a second admitted Run', async window => {
        const id = command(), body = startBody();
        let fired = false;
        h.engine._durabilityFault = stage => {
            if (stage === window && !fired) { fired = true; throw new Error('injected native journal fault'); }
        };
        await expect(repository.start(h.handle, id, body)).rejects.toThrow('injected native journal fault');
        expect(fired).toBe(true);
        const root = await repository.start(h.handle, id, body);
        const runs = await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: h.handle }));
        const events = await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: h.handle, runId: root.runId, recordType: 'event' }));
        expect(runs.map(record => record.doc.runId)).toEqual([root.runId]);
        expect(events).toHaveLength(1);
        expect(await repository.start(h.handle, id, body)).toEqual(root);
    });
});
