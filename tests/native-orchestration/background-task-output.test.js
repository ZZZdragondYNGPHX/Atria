import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { backgroundModelFixture } from './helpers/background-model-fixture.js';
import { readBackgroundTaskOutput, readBackgroundTaskResult, backgroundOutputId } from '../../src/native/orchestration/background-task-output-contracts.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { controlCommandId, controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { createNativeId } from '../../src/native/identity.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { orchestrationSessionRoots } from '../../src/native/orchestration/reference-roots.js';
import { RunObservationService } from '../../src/native/orchestration/run-observation-service.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const getRoot = f => f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
const engine = f => f.authority.execution.runs.engine;
const compute = async (f, root) => (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;

describe.each(harnesses)('$name original background Task output', ({ make }) => {
    test('completed Run retains exact Task adoption after lawful input and a real Engine reopen; rehashed foreign facts fail', async () => {
        const f = await backgroundModelFixture(make);
        try {
            await f.run(); const root = await getRoot(f);
            const facts = await engine(f).withTransaction(f.h.handle, tx => readBackgroundTaskOutput(tx, f.h.handle, root));
            expect(root.status).toBe('completed'); expect(root.attemptRefs).toHaveLength(2);
            expect(root.progress.edgeVisits).toBe(1); expect(facts.receipt.costs.closed).toBe(true);
            expect(facts.published.record.payload).toEqual(facts.claim.domainReceiptRef);
            expect(JSON.stringify(facts.published.record)).not.toContain('Original background artifact');
            const projection = await new RunObservationService({ engine: engine(f), sessionCore: f.core, pollMs: 0 })
                .observe(f.h.handle, { runId: root.runId, cursor: null, limit: 100 });
            expect(projection.payload.events.map(item => item.type)).toContain('background_task_completed');
            expect(projection.payload.costs).toMatchObject({ closed: true, knownTotalTokens: 20 });
            expect(JSON.stringify(projection)).not.toContain('Original background artifact');
            const held = await engine(f).withTransaction(f.h.handle, tx => orchestrationSessionRoots(tx, f.h.handle, f.base.session.sessionId));
            expect(held.revisionIds).toContain(facts.claim.domainReceiptRef.revisionId);
            const changes = [
                [controlRecordKey(f.h.handle, root.runId, 'result', root.resultRefs[0].resultId), doc => { doc.payload.taskId = 'foreign-task'; }],
                [controlRecordKey(f.h.handle, root.runId, 'output', facts.claim.claimId), doc => { doc.consumerRef.invocationId = 'foreign-task'; }],
                [controlRecordKey(f.h.handle, root.runId, 'receipt', facts.receipt.traversalReceiptRef.receiptId), doc => { doc.nodeAttemptId = createNativeId('orchestrationAttempt'); }],
                [{ kind: K.orchestrationCommand, handle: f.h.handle, commandId: controlCommandId('native.background.output', root.runId) }, doc => { doc.outcome.claimRef.claimId = 'oclaim_' + hash('foreign').slice(0, 32); }],
            ];
            await engine(f).withTransaction(f.h.handle, async tx => {
                for (const [key, change] of changes) {
                    const saved = await tx.getResource(key), doc = structuredClone(saved.doc); change(doc);
                    // Plain Root reads no longer re-prove terminal facts; the cold reader does.
                    try { await tx.putResource(key, { ...saved, doc, integrity: hash(doc) }); await expect(readBackgroundTaskOutput(tx, f.h.handle, root)).rejects.toThrow(); }
                    finally { await tx.putResource(key, saved); }
                }
            });
            await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'Lawful input after original Task completion' });
            await f.cold();
            expect((await getRoot(f)).status).toBe('completed');
            const cold = await engine(f).withTransaction(f.h.handle, tx => readBackgroundTaskOutput(tx, f.h.handle, root));
            expect(cold.claim).toEqual(facts.claim); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each([false, true])('original adoption plus terminal transaction ACK saved=%s never repeats the Task writer or Model', async saved => {
        const f = await backgroundModelFixture(make), storage = engine(f), transaction = storage.withTransaction.bind(storage);
        let injected = false, adoptions = 0;
        const adopt = f.core.recordTaskResult.bind(f.core);
        f.core.recordTaskResult = async (...args) => { adoptions++; return adopt(...args); };
        const matches = value => value?.value?.record?.invocationId === f.intent.invocationId;
        storage.withTransaction = async (handle, callback, ...options) => {
            const result = await transaction(handle, async tx => {
                const value = await callback(tx);
                if (!injected && matches(value) && !saved) { injected = true; throw new StorageCommitUnknownError(new Error('Before original Task transaction persistence')); }
                return value;
            }, ...options);
            if (!injected && matches(result) && saved) { injected = true; throw new StorageCommitUnknownError(new Error('After original Task transaction persistence')); }
            return result;
        };
        try {
            const result = await f.run().then(value => ({ value }), error => ({ error }));
            expect(injected).toBe(true); expect(Boolean(result.error)).toBe(!saved);
            expect(result.error?.code ?? null).toBe(saved ? null : 'storage_commit_unknown');
            const root = await getRoot(f), snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
            expect(root.status).toBe(saved ? 'completed' : 'running'); expect(root.outputClaims).toHaveLength(saved ? 1 : 0);
            expect(snapshot.states.atri_task_results?.records ?? []).toHaveLength(saved ? 1 : 0);
            expect((await compute(f, root)).attempts[0].usage.totalTokens).toBe(20);
            storage.withTransaction = transaction;
            await f.cold(); await f.run();
            expect(adoptions).toBe(1); expect(f.requests).toHaveLength(1);
        } finally { storage.withTransaction = transaction; await f.cleanup(); }
    }, 60000);

    test.each(['binding', 'cancel', 'scope'])('%s withdrawal during final closure persists, retains original adoption and refuses terminal output', async change => {
        const f = await backgroundModelFixture(make), budget = f.authority.execution.budgetPort;
        const observe = budget.observeEffectClosure.bind(budget); let changed = false;
        budget.observeEffectClosure = async (...args) => {
            const result = await observe(...args);
            if (!changed) {
                changed = true;
                if (change === 'binding') {
                    const current = await f.plans.getBinding(f.h.handle, f.sourceSelector);
                    await f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector,
                        planRef: f.planRef, expectedVersion: current.version });
                } else if (change === 'cancel') await f.authority.execution.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), {
                    ...runGuard(await getRoot(f)), reasonCode: 'original_background_test_cancel' });
                else await f.command({ kind: 'scope.transition', scopeId: 'session', status: 'suspended' });
            }
            return result;
        };
        try {
            await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_background_completion_stale' });
            expect(changed).toBe(true); const root = await getRoot(f);
            expect(root.outputClaims).toEqual([]); expect(root.status).not.toBe('completed');
            const snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
            const withdrawn = change === 'binding' ? (await f.plans.getBinding(f.h.handle, f.sourceSelector)).version === 1
                : change === 'cancel' ? root.cancelRequested : snapshot.states.atri_lifecycle.scopes.session.status === 'suspended';
            expect(withdrawn).toBe(true);
            expect(snapshot.states.atri_task_results.records).toHaveLength(1);
            const held = await engine(f).withTransaction(f.h.handle, tx => orchestrationSessionRoots(tx, f.h.handle, f.base.session.sessionId));
            expect(held.revisionIds).toContain(snapshot.states.atri_task_results.records[0].storedRevisionId);
            expect((await compute(f, root)).attempts[0].usage.totalTokens).toBe(20); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test('unknown original usage retains the adopted Task and bounded Result, never a completed Root or invented cost', async () => {
        const f = await backgroundModelFixture(make, { usage: false });
        try {
            await f.run(); const root = await getRoot(f);
            expect(root.status).not.toBe('completed'); expect(root.outputClaims).toEqual([]); expect(root.resultRefs).toHaveLength(1);
            const result = await engine(f).withTransaction(f.h.handle, tx => readBackgroundTaskResult(tx, f.h.handle, root));
            expect(result.delivery.record.payload.text).toBe('Original background artifact');
            expect((await compute(f, root)).attempts[0]).toMatchObject({ status: 'unknown', usage: null });
            await f.run(); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test('a schema-valid Task payload changed after Model completion cannot borrow its original raw response hash', async () => {
        const f = await backgroundModelFixture(make), adopt = f.core.recordTaskResult.bind(f.core);
        f.core.recordTaskResult = (handle, sessionId, record, options) => {
            const payload = { text: 'Changed after original paid Model completion' };
            return adopt(handle, sessionId, { ...record, payload, normalizedResultHash: hash(payload) }, options);
        };
        try {
            await expect(f.run()).rejects.toThrow('Invalid original background Task output facts');
            const root = await getRoot(f), snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
            expect(root.outputClaims).toEqual([]); expect(root.resultRefs).toEqual([]);
            expect(snapshot.states.atri_task_results?.records ?? []).toEqual([]);
            expect((await compute(f, root)).attempts[0].usage.totalTokens).toBe(20); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each(['terminal', 'payload_bound'])('%s failure rolls back original adoption and all V3 result metadata while preserving the paid send', async phase => {
        const f = await backgroundModelFixture(make, { maxBytes: phase === 'payload_bound' ? 1 : 65536 });
        const runs = f.authority.execution.runs, control = runs.control.bind(runs);
        if (phase === 'terminal') runs.control = (handle, commandId, input, apply, ...options) => control(handle, commandId, input, async frame => {
            const result = await apply(frame);
            if (input.operation === 'output.publish') throw new Error('After original Task terminal metadata writes');
            return result;
        }, ...options);
        try {
            await expect(f.run()).rejects.toThrow(); const root = await getRoot(f);
            expect(root.status).toBe('running'); expect(root.resultRefs).toEqual([]); expect(root.outputClaims).toEqual([]);
            const snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
            expect(snapshot.revision.revisionId).toBe(f.base.revision.revisionId);
            expect(snapshot.states.atri_task_results?.records ?? []).toEqual([]);
            const delivered = await engine(f).withTransaction(f.h.handle, tx => tx.getResource(controlRecordKey(f.h.handle, root.runId, 'receipt', backgroundOutputId('delivery', root.runId))));
            expect(delivered).toBeNull(); expect((await compute(f, root)).attempts[0].usage.totalTokens).toBe(20);
            expect((await f.run()).pending.reason).toBe('native_task_outcome_unknown'); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);
});
