import { RunControl } from '../../src/native/run-control.js';
import { SessionRepo } from '../../src/native/repositories/session-repo.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { runFixture } from './helpers/run-fixture.js';
import { prepareControllerOwnerRoot } from '../native-orchestration/fixtures.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

// Real original Session/RunControl and Engine CAS. Usage is synthetic; no
// Provider endpoint, V3 dispatcher, actual child Run or real bill is exercised.
describe.each(CONTRACT_HARNESSES)('$name original RunControl child allocations', ({ make }) => {
    test('sibling CAS, stable charge, old-source refusal, reopen and late actual settlement retain one original cost', async () => {
        const h = await make();
        try {
            await prepareControllerOwnerRoot(h.dirs.root);
            attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
            const f = await runFixture(h, 'http://127.0.0.1:1/unused'), base = await f.begin();
            const localWork = { maxJobs: 1, maxItems: 2, maxInputBytes: 100 };
            const anchor = { branchId: base.revision.branchId, revisionId: base.revision.revisionId }, limits = { maxRequests: 2, maxTokens: 200, localWork };
            const child = reservationId => ({ reservationId, parentReservationId: null, consumerId: 'test-' + reservationId, limits: { maxRequests: 1, maxTokens: 150, localWork } });
            const decisions = await Promise.allSettled(['A', 'B'].map(id => f.core.runs.reserveComputeChild(h.handle, base, anchor, limits, child(id))));
            expect(decisions.filter(result => result.status === 'fulfilled')).toHaveLength(1);
            expect(decisions.filter(result => result.status === 'rejected')[0].reason.code).toBe('native_generation_budget_exhausted');
            const admitted = decisions.find(result => result.status === 'fulfilled').value, reservationId = admitted.reservation.reservationId;
            const attempt = { attemptId: 'c'.repeat(64), requestId: 'controlled-request', targetFingerprint: 'a'.repeat(64), inputFingerprint: 'b'.repeat(64), estimatedTokens: 100 };
            const options = { reservationId }, first = await f.core.runs.admitCompute(h.handle, base, anchor, limits, attempt, options);
            expect(first.replayed).toBe(false); expect((await f.core.runs.admitCompute(h.handle, base, anchor, limits, attempt, options)).replayed).toBe(true);
            const local = { attemptId: 'local-1', requestId: 'local-request', targetFingerprint: 'd'.repeat(64), kind: 'context_build', estimatedItems: 2, estimatedInputBytes: 100 };
            await f.core.runs.chargeLocalWork(h.handle, base, anchor, limits, local, options);
            await f.core.runs.settleLocalWork(h.handle, base.session.sessionId, first.operation, local.attemptId, null);
            expect((await f.core.runs.status(h.handle, base.session.sessionId)).operations[first.operation].compute.attempts).toHaveLength(1);
            await f.core.runs.settleCompute(h.handle, base.session.sessionId, first.operation, attempt.attemptId, null);
            await expect(f.core.runs.releaseComputeChild(h.handle, base.session.sessionId, first.operation, reservationId)).rejects.toMatchObject({ code: 'native_generation_reservation_unsettled' });
            await f.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'New source while child result is unknown' });
            await expect(f.core.runs.admitCompute(h.handle, base, anchor, limits, attempt, options)).rejects.toMatchObject({ code: 'native_generation_revision_conflict' });
            const before = await f.core.runs.observeCompute(h.handle, base.session.sessionId, first.operation, attempt.attemptId);
            expect(before.compute).toMatchObject({ status: 'unknown', estimatedTokens: 100, reservationId });
            const Engine = h.engine.constructor, url = h.engine._nativeOwnerUrl, nativeHostTopology = h.engine.nativeHostTopology;
            await h.engine.close();
            h.engine = new Engine({ url, nativeHostTopology, directoriesByHandle: () => h.dirs });
            attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
            const bank = new RunControl(new SessionRepo({ engine: h.engine }));
            expect(await bank.observeCompute(h.handle, base.session.sessionId, first.operation, attempt.attemptId)).toEqual(before);
            await bank.settleCompute(h.handle, base.session.sessionId, first.operation, attempt.attemptId, { totalTokens: 80 });
            await expect(bank.releaseComputeChild(h.handle, base.session.sessionId, first.operation, reservationId)).rejects.toMatchObject({ code: 'native_generation_reservation_unsettled' });
            await bank.settleLocalWork(h.handle, base.session.sessionId, first.operation, local.attemptId,
                { wallMs: 1, cpuUserMicros: 1, cpuSystemMicros: 0, cpuScope: 'process', outcome: 'cancelled' });
            await bank.releaseComputeChild(h.handle, base.session.sessionId, first.operation, reservationId);
            const final = await bank.status(h.handle, base.session.sessionId);
            expect(final.operations[first.operation]).toBeUndefined();
            expect(final.retiredCompute).toMatchObject({ modelAttempts: 1, knownTotalTokens: 80, unknownAttempts: 0, localJobs: 1, localCancelledJobs: 1 });
        } finally { await h.engine.close(); await h.cleanup(); }
    });
});
