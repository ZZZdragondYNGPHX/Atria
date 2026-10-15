import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { prepareControllerOwnerRoot } from '../native-orchestration/fixtures.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { projectSource, services } from '../agent-intelligence/project-fixture.js';

// Real original Studio/ProjectTask CAS and Engine. Usage is synthetic; no
// Provider endpoint, V3 dispatcher, actual child Run or real bill is exercised.
describe.each([['FsEngine', makeTempFsEngineHarness], ['SqliteEngine', makeTempSqliteEngineHarness]])('%s original Project Task child allocations', (_name, make) => {
    test('sibling CAS, stable admission, old-source refusal, reopen and late actual settlement retain one original cost', async () => {
        const h = await make();
        try {
            await prepareControllerOwnerRoot(h.dirs.root);
            attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
            const svc = services(h), source = projectSource(), projectId = source.project.projectId;
            const project = await svc.studio.createProject(h.handle, source), revision = project.revision.revision;
            const task = await svc.agent.createTask(h.handle, projectId, { intent: 'Delegate bounded work', baseRevision: revision });
            const localWork = { maxJobs: 1, maxItems: 2, maxInputBytes: 100 }, limits = { maxRequests: 2, maxTokens: 200, localWork };
            const reserve = (agent, input) => agent.reserveComputeChild(h.handle, projectId, task.taskId, revision, limits, input, task.executionFingerprint);
            const child = reservationId => ({ reservationId, parentReservationId: null, consumerId: 'test-' + reservationId, limits: { maxRequests: 1, maxTokens: 150, localWork } });
            const decisions = await Promise.allSettled(['A', 'B'].map(id => reserve(svc.agent, child(id))));
            expect(decisions.filter(result => result.status === 'fulfilled')).toHaveLength(1);
            expect(decisions.filter(result => result.status === 'rejected')[0].reason.code).toBe('native_generation_budget_exhausted');
            const reservationId = decisions.find(result => result.status === 'fulfilled').value.reservation.reservationId;
            expect((await reserve(svc.agent, child(reservationId))).replayed).toBe(true);

            const attempt = { attemptId: 'c'.repeat(64), requestId: 'controlled-request', targetFingerprint: 'a'.repeat(64), inputFingerprint: 'b'.repeat(64), estimatedTokens: 100 };
            const options = { reservationId }, admit = (rev = revision, fingerprint = task.executionFingerprint, row = attempt) =>
                svc.agent.admitGeneration(h.handle, projectId, task.taskId, rev, limits, row, fingerprint, options);
            expect((await admit()).replayed).toBe(false);
            expect((await admit()).replayed).toBe(true);
            await expect(admit(revision, task.executionFingerprint, { ...attempt, inputFingerprint: 'e'.repeat(64) })).rejects.toMatchObject({ code: 'native_generation_attempt_conflict' });
            const local = { attemptId: 'local-1', requestId: 'local-request', targetFingerprint: 'd'.repeat(64), kind: 'context_build', estimatedItems: 2, estimatedInputBytes: 100 };
            await svc.agent.chargeLocalWork(h.handle, projectId, task.taskId, revision, limits, local, task.executionFingerprint, options);
            await svc.agent.settleGeneration(h.handle, projectId, task.taskId, attempt.attemptId, null);
            await expect(svc.agent.releaseComputeChild(h.handle, projectId, task.taskId, reservationId)).rejects.toMatchObject({ code: 'native_generation_reservation_unsettled' });

            // A stale Studio revision or stopped execution cannot admit new spend, but observation of the unknown attempt remains.
            await expect(admit(revision + 1)).rejects.toMatchObject({ code: 'native_generation_revision_conflict' });
            await expect(admit(revision, 'f'.repeat(64))).rejects.toMatchObject({ code: 'native_generation_task_stopped' });
            const before = await svc.agent.observeCompute(h.handle, projectId, task.taskId, attempt.attemptId);
            expect(before.compute).toMatchObject({ status: 'unknown', estimatedTokens: 100, reservationId });
            await expect(svc.agent.observeCompute(h.handle, projectId, task.taskId, 'missing')).rejects.toMatchObject({ code: 'native_generation_attempt_conflict' });

            const Engine = h.engine.constructor, url = h.engine._nativeOwnerUrl, nativeHostTopology = h.engine.nativeHostTopology;
            await h.engine.close();
            h.engine = new Engine({ url, nativeHostTopology, directoriesByHandle: () => h.dirs });
            attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
            const bank = services(h).agent;
            expect(await bank.observeCompute(h.handle, projectId, task.taskId, attempt.attemptId)).toEqual(before);
            await bank.settleGeneration(h.handle, projectId, task.taskId, attempt.attemptId, { totalTokens: 80 });
            await expect(bank.releaseComputeChild(h.handle, projectId, task.taskId, reservationId)).rejects.toMatchObject({ code: 'native_generation_reservation_unsettled' });
            await bank.settleLocalWork(h.handle, projectId, task.taskId, local.attemptId,
                { wallMs: 1, cpuUserMicros: 1, cpuSystemMicros: 0, cpuScope: 'process', outcome: 'cancelled' });
            expect((await bank.releaseComputeChild(h.handle, projectId, task.taskId, reservationId)).replayed).toBe(false);
            expect((await bank.releaseComputeChild(h.handle, projectId, task.taskId, reservationId)).replayed).toBe(true);
            const compute = (await bank.getTask(h.handle, projectId, task.taskId)).compute;
            expect(compute.attempts).toHaveLength(1);
            expect(compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 80 }, reservationId });
            expect(compute.reservations).toEqual([expect.objectContaining({ reservationId, status: 'released' })]);
        } finally { await h.engine.close(); await h.cleanup(); }
    });

    test('missing bank limits and missing local budget never become unmetered child work', async () => {
        const h = await make();
        try {
            const svc = services(h), source = projectSource(), projectId = source.project.projectId;
            const project = await svc.studio.createProject(h.handle, source), revision = project.revision.revision;
            const task = await svc.agent.createTask(h.handle, projectId, { intent: 'No bank', baseRevision: revision });
            const child = { reservationId: 'A', parentReservationId: null, consumerId: 'test-A', limits: { maxRequests: 1, maxTokens: 10 } };
            await expect(svc.agent.reserveComputeChild(h.handle, projectId, task.taskId, revision, undefined, child, task.executionFingerprint))
                .rejects.toMatchObject({ code: 'native_generation_budget_unavailable' });
            const attempt = { attemptId: 'c'.repeat(64), requestId: 'r', targetFingerprint: 'a'.repeat(64), inputFingerprint: 'b'.repeat(64), estimatedTokens: 1 };
            await expect(svc.agent.admitGeneration(h.handle, projectId, task.taskId, revision, undefined, attempt, task.executionFingerprint))
                .rejects.toMatchObject({ code: 'native_generation_budget_unavailable' });
            const local = { attemptId: 'local-1', requestId: 'local-request', targetFingerprint: 'd'.repeat(64), kind: 'context_build', estimatedItems: 1, estimatedInputBytes: 1 };
            await expect(svc.agent.chargeLocalWork(h.handle, projectId, task.taskId, revision, { maxRequests: 1, maxTokens: 10 }, local, task.executionFingerprint, { reservationId: 'A' }))
                .rejects.toMatchObject({ code: 'native_generation_budget_unavailable' });
            expect(await svc.agent.chargeLocalWork(h.handle, projectId, task.taskId, revision, { maxRequests: 1, maxTokens: 10 }, local, task.executionFingerprint)).toBeNull();
            expect((await svc.agent.getTask(h.handle, projectId, task.taskId)).compute).toBeUndefined();
        } finally { await h.cleanup(); }
    });
});
