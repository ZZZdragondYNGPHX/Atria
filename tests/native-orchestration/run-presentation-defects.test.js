import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectCommitFixture } from './helpers/project-commit-fixture.js';
import { RunObservationService } from '../../src/native/orchestration/run-observation-service.js';
import { nativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
describe.each(harnesses)('$name Run presentation defects', ({ make }) => {
    test('pending approval distinguishes channel availability; an approved completed Run offers no recovery after restart', async () => {
        const f = await projectCommitFixture(make);
        try {
            const prepared = await f.prepare(); let available = true;
            const observer = new RunObservationService({ engine: f.authority.engine, studio: f.studio, projectAgent: f.agent,
                review: { available: () => available }, pollMs: 0 });
            const read = async () => (await observer.observe(f.h.handle, { runId: prepared.runId, cursor: null, limit: 50 })).payload;
            const pending = await read();
            expect(pending.diagnostics).toContainEqual({ code: 'native_orchestration_approval_pending', severity: 'info' });
            expect(pending.diagnostics.some(row => row.code === 'native_orchestration_approval_channel_unavailable')).toBe(false);
            available = false;
            expect((await read()).diagnostics).toContainEqual({ code: 'native_orchestration_approval_channel_unavailable', severity: 'blocking' });
            await f.approve(prepared);
            expect((await read()).diagnostics.some(row => row.code.startsWith('native_orchestration_approval_'))).toBe(false);
            await f.dispatch(prepared);
            await f.authority.engine.nativeHostLifecycle.afterRestore(f.h.handle);
            const completed = await read();
            expect(completed.status).toBe('completed'); expect(completed.controls.recover).toBe(false);
            expect(completed.diagnostics.some(row => row.code === 'native_orchestration_host_recovery_required')).toBe(false);
        } finally { await f.cleanup(); }
    }, 60000);
    test('the original operation exposes its exact durable Run while Provider work is still in flight', async () => {
        const f = await rpModelFixture(make); let release;
        const gate = new Promise(resolve => { release = resolve; }); let entered;
        const reached = new Promise(resolve => { entered = resolve; });
        f.onResponse(async () => { entered(); await gate; });
        try {
            const operation = await f.start();
            await reached;
            const observed = nativeTaskScheduler.project(f.h.handle, operation.operationId);
            expect(observed.runId).toBe(f.effects[0].runId);
            expect(['running', 'streaming']).toContain(observed.status);
            expect(() => nativeTaskScheduler.project('foreign', operation.operationId)).toThrow('operation_not_found');
            release(); await operation.result;
        } finally { release(); await f.cleanup(); }
    }, 60000);
});
