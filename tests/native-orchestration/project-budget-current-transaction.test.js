import { jest } from '@jest/globals';
import { projectConsumptionFixture as fixture } from './helpers/project-consumption-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
async function bounded(promise, ms = 1000) {
    let timer;
    try { return await Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve('bounded_waiting'), ms); })]); }
    finally { clearTimeout(timer); }
}
const underOriginalWriters = (f, work) => f.lock('Task', () => f.lock('Project', () => f.h.engine.withTransaction(f.h.handle, work)));

if (process.env.ATRIA_TEST_PROJECT_BUDGET_TX_SQL === '1') jest.setTimeout(60_000);

// Original Task -> Studio queues and a fresh Engine transaction, without a
// substitute mutex, source cache, Runtime grant or Project/Task writer.
describe.each(CONTRACT_HARNESSES.filter(({ name }) => process.env.ATRIA_TEST_PROJECT_BUDGET_TX_SQL === '1' || ['FsEngine', 'SqliteEngine'].includes(name)))('$name original Project budget transaction currentness', ({ make }) => {
    test('a fresh transaction inside Task and Studio writers uses only original observeComputeSource without queued reentry', async () => {
        const f = await fixture(make), queued = f.agent.observeContext, pure = f.agent.observeComputeSource;
        let queuedCalls = 0, pureCalls = 0, sameTx = false, expectedTx, pending;
        f.agent.observeContext = function (...args) { queuedCalls++; return queued.apply(this, args); };
        f.agent.observeComputeSource = async function (...args) {
            pureCalls++;
            await f.h.engine.withTransaction(f.h.handle, tx => { sameTx = tx === expectedTx; });
            return pure.apply(this, args);
        };
        try {
            await underOriginalWriters(f, async tx => {
                expectedTx = tx;
                pending = f.budget.assertCurrent(f.h.handle, f.root.budgetAuthorityRef, { tx });
                // Drain after the real outer writer has released if a mutant
                // enters Studio's queued reader and cannot finish in this scope.
                pending.catch(() => {});
                const result = await bounded(pending.then(() => 'completed'));
                expect({ result, queuedCalls, pureCalls, sameTx }).toEqual({ result: 'completed', queuedCalls: 0, pureCalls: 1, sameTx: true });
            });
        } finally {
            await Promise.allSettled([pending].filter(Boolean));
            f.agent.observeContext = queued; f.agent.observeComputeSource = pure;
            await f.cleanup();
        }
    });

    test('without a transaction the original reader still queues behind the independent Studio writer', async () => {
        const f = await fixture(make), entered = deferred(), release = deferred();
        const queued = f.agent.observeContext, pure = f.agent.observeComputeSource;
        let queuedCalls = 0, pureCalls = 0, reading;
        f.agent.observeContext = function (...args) { queuedCalls++; return queued.apply(this, args); };
        f.agent.observeComputeSource = function (...args) { pureCalls++; return pure.apply(this, args); };
        const holding = f.lock('Project', async () => { entered.resolve(); await release.promise; });
        try {
            await entered.promise;
            reading = f.budget.assertCurrent(f.h.handle, f.root.budgetAuthorityRef);
            expect(await bounded(reading.then(() => 'completed'), 50)).toBe('bounded_waiting');
            expect({ queuedCalls, pureCalls }).toEqual({ queuedCalls: 1, pureCalls: 0 });
            release.resolve(); await holding; await reading;
        } finally {
            release.resolve(); await Promise.allSettled([holding, reading].filter(Boolean));
            f.agent.observeContext = queued; f.agent.observeComputeSource = pure;
            await f.cleanup();
        }
    });

    test('original admission and settlement change cost and sequence while preserving the same Project execution authority', async () => {
        const f = await fixture(make);
        try {
            const before = await f.agent.observeComputeSource(f.h.handle, f.projectId, f.task.taskId);
            const charged = await f.budget.admitAttempt(f.h.handle, { authorityRef: f.root.budgetAuthorityRef,
                effectId: createNativeId('orchestrationEffect'), providerSendOrdinal: 0, requestId: 'actual-project-budget-current',
                targetFingerprint: 'a'.repeat(64), inputFingerprint: 'b'.repeat(64), upperBound: 100, limits: { maxRequests: 4, maxTokens: 1000 } });
            await f.budget.settleAttempt(f.h.handle, charged.budgetAttemptRef, { totalTokens: 10 });
            const after = await f.agent.observeComputeSource(f.h.handle, f.projectId, f.task.taskId);
            expect(after.project.revision).toEqual(before.project.revision);
            expect(after.task.executionFingerprint).toBe(before.task.executionFingerprint);
            expect(after.task.sequence).toBeGreaterThan(before.task.sequence);
            const original = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
            expect(original.compute.attempts).toHaveLength(1);
            expect(original.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 10 } });
            await expect(underOriginalWriters(f, tx => f.budget.assertCurrent(f.h.handle, f.root.budgetAuthorityRef, { tx }))).resolves.toBeUndefined();
            expect((await f.repository.get(f.h.handle, f.projectId, f.task.taskId)).compute).toEqual(original.compute);
        } finally { await f.cleanup(); }
    });

    test.each(['project_revision', 'task_plan', 'task_takeover', 'controlled_cancelled_record'])('%s invalidates the original operation even in a current Engine transaction', async change => {
        const f = await fixture(make);
        try {
            if (change === 'project_revision') await f.write('Project');
            else if (change === 'task_plan') await f.agent.setPlan(f.h.handle, f.projectId, f.task.taskId, {
                summary: 'A legitimate new original plan', steps: [{ id: 'one', title: 'Review source', description: 'Synthetic plan change', impact: 'low' }],
            });
            else if (change === 'task_takeover') await f.agent.takeOver(f.h.handle, f.projectId, f.task.taskId);
            else {
                // No public Task cancel command is being invented. This is an
                // explicit typed original-repository CAS fault injection only.
                await f.lock('Task', async () => {
                    const stored = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
                    await f.repository.save(f.h.handle, { ...stored, sequence: stored.sequence + 1, status: 'cancelled', updatedAt: stored.updatedAt + 1 }, hash(stored));
                });
            }
            await expect(underOriginalWriters(f, tx => f.budget.assertCurrent(f.h.handle, f.root.budgetAuthorityRef, { tx })))
                .rejects.toMatchObject({ code: 'native_generation_revision_conflict' });
            expect((await f.repository.get(f.h.handle, f.projectId, f.task.taskId)).compute).toBeUndefined();
        } finally { await f.cleanup(); }
    });
});
