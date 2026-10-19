import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { backgroundModelFixture } from './helpers/background-model-fixture.js';
import { lifecycleFixture } from '../native/helpers/lifecycle-fixture.js';
import { readBackgroundTaskOutput } from '../../src/native/orchestration/background-task-output-contracts.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const text = 'A bounded authored Task result.';
async function fixture(make, { scheduled = false, simulation = false, usage = true, dueTick = 3 } = {}) {
    const f = await backgroundModelFixture(make, { usage, responsePayload: scheduled ? { recordId: 'mail-one', dueTick, args: { text } } : { text },
        configureSource: ({ contract }) => {
            const task = contract.taskRuntime.tasks[0], variant = task.variants[0], notes = lifecycleFixture().lifecycleRuntime.domains[0];
            contract.lifecycleRuntime.domains.push(notes);
            task.resultPolicy = { resultClass: 'declared_app_command', sink: 'app_command' };
            variant.resultBinding = { kind: 'app.command', domainId: 'notes', commandId: 'save' };
            if (scheduled) {
                variant.resultBinding = { kind: 'interaction.schedule', interactionId: 'mail' };
                variant.outputSchema = { type: 'object', additionalProperties: false, required: ['recordId', 'dueTick', 'args'],
                    properties: { recordId: { type: 'string', maxLength: 64 }, dueTick: { type: 'integer', minimum: 0, maximum: 64 }, args: notes.commands[0].argsSchema } };
                contract.lifecycleRuntime.interactions = [{ id: 'mail', scopeId: 'session', taskId: task.id, clockId: 'world', domainId: 'notes', commandId: 'save', maxDelay: 5 }];
            }
            if (simulation) {
                contract.capabilities.push({ id: 'world-simulation', version: 1, required: true });
                contract.lifecycleRuntime.automations = [];
                task.context = ['input'];
                contract.informationRuntime.views = contract.informationRuntime.views.filter(view => view.audience !== 'task' || view.taskId !== task.id);
                if (!scheduled) variant.resultBinding.recordId = 'main';
                contract.simulationRuntime = { schemaVersion: 1, clockId: 'world', policy: { maxSteps: 8, maxDeliberations: 1, maxAdvanceTicks: 8 }, jobs: [{
                    id: 'notes.generate', scopeId: 'session', reads: [], enabled: 'true', due: 0, priority: 1, relevance: 'hot',
                    action: { kind: 'task', taskId: task.id, variantId: variant.id, input: {} },
                }] };
            }
        }, prepareReady: async (product, h, base) => simulation ? product.core.applyLifecycleCommand(h.handle, base.session.sessionId,
            { type: 'lifecycle', invocationId: 'declared-simulation', action: { kind: 'clock.advance', commandId: 'advance', ticks: 1 } },
            { expectedRevisionId: base.revision.revisionId }) : base });
    return f;
}
const notes = snapshot => snapshot.states.atri_lifecycle.domains.notes.records;

describe.each(harnesses)('$name original declared Task result through V3', ({ make }) => {
    test.each([[false, false], [true, false], [false, true]])('scheduled=%s simulation=%s completes only the authored target and retains exact cold output', async (scheduled, simulation) => {
        const f = await fixture(make, { scheduled, simulation });
        try {
            const outcome = await f.run(), runId = f.effectRef.runId, root = await f.authority.execution.runs.get(f.h.handle, runId);
            expect(f.requests).toHaveLength(1); expect(root.status).toBe('completed'); expect(root.outputClaims).toHaveLength(1);
            expect(JSON.stringify(f.requests[0])).not.toContain('寄信者真实身份是沈墨');
            expect(outcome.results[0]).toMatchObject({ status: 'applied', authorityReceipt: { decision: scheduled ? 'schedule' : 'app.command' } });
            expect(notes(outcome.snapshot)).toHaveLength(scheduled ? 0 : 1);
            expect(outcome.snapshot.timeline).toEqual(f.base.timeline); expect(outcome.snapshot.states.atri_world_state).toEqual(f.base.states.atri_world_state);
            expect(outcome.snapshot.states.atri_lifecycle.clocks.world).toBe(simulation ? 1 : 0);
            const saved = await f.h.engine.withTransaction(f.h.handle, tx => readBackgroundTaskOutput(tx, f.h.handle, root));
            expect(saved.receipt.costs.closed).toBe(true);
            const bank = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            const phases = bank.operations[root.budgetAuthorityRef.operationId].compute.localWork.filter(row => row.kind.startsWith('task_result_'));
            expect(phases.map(row => [row.kind, row.status, row.usage.outcome])).toEqual([['task_result_parse', 'settled', 'completed'], ['task_result_adopt', 'settled', 'completed']]);
            await f.cold();
            expect((await f.host.persistence._engine.withTransaction(f.h.handle, tx => readBackgroundTaskOutput(tx, f.h.handle, root))).claim).toEqual(saved.claim);
            expect((await f.run()).results).toEqual([]); expect(f.requests).toHaveLength(1);
            const pumped = await f.command({ kind: 'pump' }); expect(notes(pumped)).toHaveLength(scheduled ? 0 : 1);
            await f.command({ kind: 'clock.advance', commandId: 'advance', ticks: simulation ? 2 : 3 });
            const delivered = await f.command({ kind: 'pump' });
            expect(notes(delivered).map(row => row.value)).toEqual([{ text }]); expect(f.requests).toHaveLength(1);
            expect(delivered.states.atri_lifecycle.interactions.map(item => item.status)).toEqual(scheduled ? ['delivered'] : []);
        } finally { await f.cleanup(); }
    }, 120000);

    test('the canonical Simulation contract still forbids an interaction scheduling job', async () => {
        await expect(fixture(make, { scheduled: true, simulation: true })).rejects.toThrow(/canonical deadlines/);
    });

    test('an input-only Task cannot consume a late response after its original simulation clock changes', async () => {
        const f = await fixture(make, { simulation: true });
        f.onResponse(() => f.command({ kind: 'clock.advance', commandId: 'advance', ticks: 1 }));
        try {
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
            expect(JSON.stringify(f.requests[0])).not.toContain('寄信者真实身份是沈墨');
            const current = await f.core.observe(f.h.handle, f.base.session.sessionId), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            expect(notes(current)).toEqual([]); expect(current.states.atri_lifecycle.clocks.world).toBe(2);
            expect(root.resultRefs).toEqual([]); expect(root.outputClaims).toEqual([]);
            const bank = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            expect(bank.operations[root.budgetAuthorityRef.operationId].compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            await f.run(); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test('an out-of-bounds original interaction rolls back domain metadata but retains Model and actual parse/adopt work', async () => {
        const f = await fixture(make, { scheduled: true, dueTick: 6 });
        try {
            await expect(f.run()).rejects.toThrow(/bounds/);
            const current = await f.core.observe(f.h.handle, f.base.session.sessionId), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            expect(current.revision.revisionId).toBe(f.base.revision.revisionId); expect(notes(current)).toEqual([]);
            expect(current.states.atri_lifecycle.interactions).toEqual([]); expect(root.resultRefs).toEqual([]); expect(root.outputClaims).toEqual([]);
            const bank = await f.core.runs.status(f.h.handle, f.base.session.sessionId), compute = bank.operations[root.budgetAuthorityRef.operationId].compute;
            expect(compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            expect(compute.localWork.filter(row => row.kind.startsWith('task_result_')).map(row => [row.kind, row.status, row.usage.outcome]))
                .toEqual([['task_result_parse', 'settled', 'completed'], ['task_result_adopt', 'settled', 'failed']]);
            expect((await f.run()).pending.reason).toBe('native_task_outcome_unknown'); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each([false, true])('domain adoption ACK saved=%s never repeats the declared command or Model', async saved => {
        const f = await fixture(make), transaction = f.h.engine.withTransaction.bind(f.h.engine);
        let injected = false;
        const matches = value => Boolean(value?.value?.snapshot?.states.atri_lifecycle.domains.notes.records.length);
        f.h.engine.withTransaction = async (handle, callback, ...options) => {
            const value = await transaction(handle, async tx => {
                const result = await callback(tx);
                if (!injected && matches(result) && !saved) { injected = true; throw new StorageCommitUnknownError(new Error('Before declared Task save')); }
                return result;
            }, ...options);
            if (!injected && matches(value) && saved) { injected = true; throw new StorageCommitUnknownError(new Error('After declared Task save')); }
            return value;
        };
        try {
            const outcome = await f.run().then(value => ({ value }), error => ({ error }));
            expect(injected).toBe(true); expect(outcome.error?.code ?? null).toBe(saved ? null : 'storage_commit_unknown');
            const current = await f.core.observe(f.h.handle, f.base.session.sessionId);
            expect(notes(current)).toHaveLength(saved ? 1 : 0); expect(f.requests).toHaveLength(1);
            const again = await f.run(); expect(again.results).toEqual([]); expect(f.requests).toHaveLength(1);
        } finally { f.h.engine.withTransaction = transaction; await f.cleanup(); }
    }, 60000);

    test('unknown usage retains the declared command and Result without inventing a completed Root', async () => {
        const f = await fixture(make, { usage: false });
        try {
            const outcome = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            expect(notes(outcome.snapshot)).toHaveLength(1); expect(root.status).toBe('running'); expect(root.resultRefs).toHaveLength(1); expect(root.outputClaims).toEqual([]);
            const bank = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            expect(bank.operations[root.budgetAuthorityRef.operationId].compute.attempts[0].status).toBe('unknown');
            expect((await f.run()).results).toEqual([]); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);
});
