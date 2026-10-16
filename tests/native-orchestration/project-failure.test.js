import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectModelFixture } from './helpers/project-model-fixture.js';
import { configureProjectToolPlan } from './helpers/project-tool-fixture.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { RunObservationService } from '../../src/native/orchestration/run-observation-service.js';
import { createNativeId } from '../../src/native/identity.js';
import { runGuard } from '../../src/native/orchestration/controller-common.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const fixture = (make, batch = false) => projectModelFixture(make, { changeRoute: route => batch ? route : { ...route,
    executionPolicy: { ...route.executionPolicy, computeBudget: { ...route.executionPolicy.computeBudget,
        localWork: { ...route.executionPolicy.computeBudget.localWork, maxJobs: 1 } } } },
configurePlan: async args => {
    await configureProjectToolPlan(['atri_agent_set_plan', 'atri_agent_prepare_review'])(args);
    Object.assign(args.plan.definition.outputContract, { kind: 'project_review', resultPolicy: { outputType: 'json', maxBytes: 16384 } });
}, ...batch ? { responseBody: () => ({ id: 'rejected-batch', status: 'completed', output: [0, 1].map(index => ({ id: 'batch-' + index,
    call_id: 'batch-call-' + index, type: 'function_call', status: 'completed', name: 'atri_agent_set_plan',
    arguments: JSON.stringify({ summary: 'Rejected duplicate proposals', steps: [{ id: 'step', title: 'Inspect original Project' }] }) })),
usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } }) } : {} });
const failures = f => f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRecord,
    handle: f.h.handle, runId: f.effects[0].runId, recordType: 'receipt' })).then(rows => rows.filter(row => row.doc.receiptKind === 'project_failure'));

describe.each(harnesses)('$name original Project failure metadata', ({ make }) => {
    test.each([false, true])('actual failed execution stops future work without completing or clearing pending facts; batch=%s', async batch => {
        const f = await fixture(make, batch);
        try {
            await expect(f.run()).rejects.toMatchObject({ code: batch ? 'native_orchestration_project_tool_batch_unavailable' : 'native_generation_budget_exhausted' });
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId), rows = await failures(f);
            expect(root.status).toBe(batch ? 'blocked' : 'reconciling'); expect(root.outputClaims).toEqual([]); expect(root.resultRefs).toEqual([]);
            expect(root.pendingEffectRefs).toHaveLength(batch ? 0 : 1); expect(rows).toHaveLength(1);
            expect(rows[0].doc).toMatchObject({ reasonCode: batch ? 'project_execution_failed' : 'project_budget_exhausted', status: root.status });
            expect(f.requests).toHaveLength(batch ? 1 : 0);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.changeSets).toEqual([]); expect(task.attempts.filter(attempt => attempt.kind === 'generation')[0].status).toBe('failed');
            expect(task.compute.localWork.every(row => row.status === 'settled')).toBe(true);
            expect(task.compute.attempts).toHaveLength(batch ? 1 : 0);
            const observed = await new RunObservationService({ engine: f.h.engine, projectAgent: f.agent, studio: f.studio, pollMs: 0 })
                .observe(f.h.handle, { runId: root.runId, cursor: null, limit: 100 });
            expect(observed.payload.events.filter(event => event.type === 'project_execution_failed')).toHaveLength(1);
            expect(observed.payload.controls.resume).toBe(false);
            expect(observed.payload.capacity.remaining.jobs).toBe(batch ? 32 - task.compute.localWork.length : 0);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each([false, true])('failure metadata ACK saved=%s preserves the original error and never sends', async saved => {
        const f = await fixture(make), transaction = f.h.engine.withTransaction.bind(f.h.engine);
        let injected = false;
        const matches = value => value?.outcome?.reasonCode === 'project_budget_exhausted';
        f.h.engine.withTransaction = async (handle, callback, ...options) => {
            const value = await transaction(handle, async tx => {
                const result = await callback(tx);
                if (!injected && matches(result) && !saved) { injected = true; throw new StorageCommitUnknownError(new Error('Before failure metadata save')); }
                return result;
            }, ...options);
            if (!injected && matches(value) && saved) { injected = true; throw new StorageCommitUnknownError(new Error('After failure metadata save')); }
            return value;
        };
        try {
            const error = await f.run().then(() => null, error => error);
            expect(error.code).toBe('native_generation_budget_exhausted'); expect(injected).toBe(true);
            expect(error.captureError?.code ?? null).toBe(saved ? null : 'storage_commit_unknown');
            expect((await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId)).status).toBe(saved ? 'reconciling' : 'running');
            expect(await failures(f)).toHaveLength(saved ? 1 : 0); expect(f.requests).toEqual([]);
        } finally { f.h.engine.withTransaction = transaction; await f.cleanup(); }
    }, 60000);

    test('a lawful cancel during failure observation commits instead of being overwritten or rolled back', async () => {
        const f = await fixture(make), bank = f.authority.execution.budgetPort, observe = bank.observeEffectClosure.bind(bank);
        let cancelled = false;
        bank.observeEffectClosure = async (...args) => {
            const costs = await observe(...args);
            if (!cancelled) {
                cancelled = true;
                const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
                await f.authority.execution.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(root), reasonCode: 'cancel_failed_operation' });
            }
            return costs;
        };
        try {
            await expect(f.run()).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' }); expect(cancelled).toBe(true);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.cancelRequested).toBe(true); expect(root.status).toBe('reconciling'); expect(root.pendingEffectRefs).toHaveLength(1);
            expect(await failures(f)).toEqual([]); expect(f.requests).toEqual([]);
        } finally { await f.cleanup(); }
    }, 60000);
});
