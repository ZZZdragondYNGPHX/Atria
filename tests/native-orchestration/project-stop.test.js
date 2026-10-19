import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectModelFixture } from './helpers/project-model-fixture.js';
import { configureProjectToolPlan, projectReadResponse } from './helpers/project-tool-fixture.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { RunObservationService } from '../../src/native/orchestration/run-observation-service.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { createNativeId } from '../../src/native/identity.js';
import { runGuard, readAttempt } from '../../src/native/orchestration/controller-common.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const fixture = (make, { tool = false } = {}) => projectModelFixture(make, { configurePlan: async args => {
    await configureProjectToolPlan(['atri_agent_prepare_review', ...tool ? ['atri_agent_get_project'] : []])(args);
    Object.assign(args.plan.definition.outputContract, { kind: 'project_review', resultPolicy: { outputType: 'json', maxBytes: 16384 } });
}, ...tool ? { responseBody: projectReadResponse } : {} });

describe.each(harnesses)('$name original Project quiescence', ({ make }) => {
    test.each([false, true])('a settled original round blocks its unfinished Review Root without a second send; tool=%s', async tool => {
        const f = await fixture(make, { tool });
        try {
            const before = (await f.studio.observeProject(f.h.handle, f.projectId)).source;
            await f.run(); const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.status).toBe('blocked'); expect(root.resultRefs).toEqual([]); expect(root.outputClaims).toEqual([]);
            expect(root.pendingEffectRefs).toEqual([]); expect(f.requests).toHaveLength(1);
            const rows = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: root.runId, recordType: 'receipt' }));
            const stops = rows.filter(row => row.doc.receiptKind === 'project_stop');
            expect(stops).toHaveLength(1); expect(stops[0].doc).toMatchObject({ stopReason: tool ? 'project_round_limit' : 'project_model_stopped', costs: { closed: true } });
            const observations = new RunObservationService({ engine: f.h.engine, projectAgent: f.agent, studio: f.studio, pollMs: 0 });
            const view = await observations.observe(f.h.handle, { runId: root.runId, cursor: null, limit: 100 });
            expect(view.payload.status).toBe('blocked'); expect(view.payload.controls.resume).toBe(false);
            expect(view.payload.events.filter(event => event.type === 'project_generation_stopped')).toHaveLength(1);
            expect(view.payload.costs).toMatchObject({ closed: true, modelAttempts: 1, knownTotalTokens: 20 });
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(view.payload.capacity).toMatchObject({ status: 'available', scope: 'original_bank', allocationStatus: 'bank',
                ceiling: { requests: task.compute.limits.maxRequests, jobs: task.compute.limits.localWork.maxJobs },
                used: { requests: 1, tokens: 20, jobs: task.compute.localWork.length } });
            expect((await f.studio.observeProject(f.h.handle, f.projectId)).source).toEqual(before);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each([false, true])('a stop ACK with saved=%s only observes the original transaction', async saved => {
        const f = await fixture(make), transaction = f.h.engine.withTransaction.bind(f.h.engine);
        let injected = false;
        const matches = value => value?.value?.outcome?.stopReason === 'project_model_stopped';
        f.h.engine.withTransaction = async (handle, callback, ...options) => {
            const value = await transaction(handle, async tx => {
                const result = await callback(tx);
                if (!injected && matches(result) && !saved) { injected = true; throw new StorageCommitUnknownError(new Error('Before original stop save')); }
                return result;
            }, ...options);
            if (!injected && matches(value) && saved) { injected = true; throw new StorageCommitUnknownError(new Error('After original stop save')); }
            return value;
        };
        try {
            const result = await f.run().then(value => ({ value }), error => ({ error }));
            expect(injected).toBe(true); expect(result.error?.code ?? null).toBe(saved ? null : 'storage_commit_unknown');
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.status).toBe(saved ? 'blocked' : 'running'); expect(root.outputClaims).toEqual([]); expect(f.requests).toHaveLength(1);
            expect((await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId)).compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
        } finally { f.h.engine.withTransaction = transaction; await f.cleanup(); }
    }, 60000);

    test('cancellation at the last stop observation persists and cannot be replaced by blocked metadata', async () => {
        const f = await fixture(make), bank = f.authority.execution.budgetPort, observe = bank.observeEffectClosure.bind(bank);
        let settledReads = 0, cancelled = false;
        bank.observeEffectClosure = async (...args) => {
            const costs = await observe(...args), root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            const attempt = await f.h.engine.withTransaction(f.h.handle, tx => readAttempt(tx, f.h.handle, root, root.attemptRefs.at(-1)));
            if (!cancelled && attempt.doc.status === 'completed' && ++settledReads === 3) {
                cancelled = true;
                await f.authority.execution.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(root), reasonCode: 'original_stop_cancel' });
            }
            return costs;
        };
        try {
            await expect(f.run()).rejects.toThrow(); expect(cancelled).toBe(true);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.cancelRequested).toBe(true); expect(root.status).toBe('cancelled'); expect(root.outputClaims).toEqual([]); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);
});
