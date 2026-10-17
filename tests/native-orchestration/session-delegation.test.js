import { expect, test } from '@jest/globals';
import { sessionDelegationFixture } from './helpers/session-delegation-fixture.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness, CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { createNativeId } from '../../src/native/identity.js';
import { runGuard } from '../../src/native/orchestration/controller-common.js';
import { readAttempt } from '../../src/native/orchestration/controller-common.js';
import { assertRunTreeConcurrency } from '../../src/native/orchestration/run-repository.js';
import { handoffReceiptId } from '../../src/native/orchestration/handoff-contracts.js';
import { handoffReturnReceiptId } from '../../src/native/orchestration/handoff-return-contracts.js';
import { checkedRecord } from '../../src/native/orchestration/plan-repository.js';
import { controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { resultDependencyDigest } from '../../src/native/orchestration/result-contracts.js';
import { childClosureReceiptId } from '../../src/native/orchestration/task-local-output-contracts.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { readSessionOutput } from '../../src/native/orchestration/session-output-contracts.js';

// These exercise the existing original Host and controllers, not mocked grants.
test.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness],
    ...CONTRACT_HARNESSES.filter(item => ['MysqlEngine', 'PgEngine'].includes(item.name)).map(item => [item.name, item.make])])('%s Game Handoff runs the pinned two-Agent Actor DAG in the original child reservation', async (_name, make) => {
    const f = await sessionDelegationFixture(make);
    try {
        const result = await f.start(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.status).toBe('completed'); expect(root.progress.delegates).toBe(1); expect(root.progress.handoffs).toBe(1);
        expect(f.requests).toHaveLength(4); expect(f.requests.slice(0, 2).every(body => body.model === 'session-delegated-distinct-model')).toBe(true);
        expect(f.requests[2].model).not.toBe(f.requests[0].model);
        expect(JSON.stringify(f.requests[1].input)).toContain('DELEGATED_ADVICE_0');
        expect(JSON.stringify(f.requests[2].input)).toContain('DELEGATED_ADVICE_1');
        for (const body of f.requests.slice(0, 3)) { expect(JSON.stringify(body.input)).toContain('阿岚听说'); expect(JSON.stringify(body.input)).not.toContain('沈墨怀疑'); }
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state);
        expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        const proof = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root)); expect(proof).toBeTruthy();
        await f.cold(); const cold = await f.authority.execution.runs.get(f.h.handle, root.runId);
        expect((await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, cold))).receipt).toEqual(proof.receipt);
        await f.authority.engine.withTransaction(f.h.handle, async tx => {
            const children = (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }))
                .filter(row => row.doc.parentRef?.parentRunId === cold.runId);
            expect(children).toHaveLength(1); const child = children[0].doc;
            expect(child.resultRefs).toHaveLength(2);
            const middleKey = controlRecordKey(f.h.handle, child.runId, 'result', child.resultRefs[0].resultId);
            const middle = await tx.getResource(middleKey), changed = structuredClone(middle.doc);
            changed.envelope.createdAt++; changed.envelope.dependencyDigest = resultDependencyDigest(changed.envelope);
            try {
                await tx.putResource(middleKey, { ...middle, doc: changed, integrity: hash(changed) });
                await expect(readSessionOutput(tx, f.h.handle, cold)).rejects.toThrow();
            } finally { await tx.putResource(middleKey, middle); }
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(proof.receipt);
            const closureKey = controlRecordKey(f.h.handle, child.runId, 'receipt', childClosureReceiptId(child.runId));
            const closure = await tx.getResource(closureKey), shortened = { ...closure.doc, budgetAttemptRefs: closure.doc.budgetAttemptRefs.slice(1) };
            expect(closure.doc.budgetAttemptRefs.length).toBeGreaterThan(0);
            try {
                await tx.putResource(closureKey, { ...closure, doc: shortened, integrity: hash(shortened) });
                await expect(readSessionOutput(tx, f.h.handle, cold)).rejects.toThrow();
            } finally { await tx.putResource(closureKey, closure); }
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(proof.receipt);
        });
        expect(f.requests).toHaveLength(4);
    } finally { await f.cleanup(); }
}, 240000);

test('Game child cannot expand an Actor delegation into another Actor Source', async () => {
    const f = await sessionDelegationFixture(makeTempFsEngineHarness, { foreignActor: true });
    try { await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(0); }
    finally { await f.cleanup(); }
}, 60000);


test('Game original Host explicit Delegate keeps the parent slot and returns without Handoff receipts', async () => {
    const f = await sessionDelegationFixture(makeTempFsEngineHarness, { childSteps: 1, maxConcurrency: 2 });
    const original = f.authority.runSessionDelegation.bind(f.authority); let witnessed;
    // Select the actual original Host's internal control entry. No policy,
    // Controller, bank, permit or resulting receipt is replaced.
    f.authority.runSessionDelegation = args => original({ ...args, mode: 'delegate' });
    f.onResponse(async () => {
        if (witnessed) return;
        const child = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        const parent = await f.authority.execution.runs.get(f.h.handle, child.parentRef.parentRunId);
        witnessed = await f.h.engine.withTransaction(f.h.handle, async tx => {
            const attempt = (await readAttempt(tx, f.h.handle, parent, child.parentRef.nodeAttemptId)).doc;
            let extraSlot;
            try { await assertRunTreeConcurrency(tx, f.h.handle, child, { additionalSlots: 1 }); }
            catch (error) { extraSlot = error.code; }
            return { status: attempt.status, handoffs: parent.progress.handoffs, extraSlot };
        });
    });
    try {
        await f.start(); const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(witnessed).toEqual({ status: 'running', handoffs: 0, extraSlot: 'native_orchestration_tree_concurrency_exhausted' });
        expect(root.status).toBe('completed'); expect(root.progress.delegates).toBe(1); expect(root.progress.handoffs).toBe(0); expect(f.requests).toHaveLength(3);
        const runs = f.authority.execution.runs;
        const children = await f.h.engine.withTransaction(f.h.handle, async tx => {
            const list = await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle });
            return list.filter(row => row.doc.parentRef?.parentRunId === root.runId).map(row => row.doc);
        });
        expect(children).toHaveLength(1);
        const child = await runs.get(f.h.handle, children[0].runId);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            expect(await checkedRecord(tx, controlRecordKey(f.h.handle, root.runId, 'receipt', handoffReceiptId(child.runId)))).toBeNull();
            expect(await checkedRecord(tx, controlRecordKey(f.h.handle, root.runId, 'receipt', handoffReturnReceiptId(child.runId)))).toBeNull();
            expect(await readSessionOutput(tx, f.h.handle, root)).toBeTruthy();
        });
    } finally { await f.cleanup(); }
}, 180000);

test('Game true Delegate cannot obtain a child slot from a concurrency-one parent', async () => {
    const f = await sessionDelegationFixture(makeTempFsEngineHarness, { childSteps: 1 });
    const original = f.authority.runSessionDelegation.bind(f.authority);
    let parentRunId;
    f.authority.runSessionDelegation = args => { parentRunId = args.parentState.runId; return original({ ...args, mode: 'delegate' }); };
    try {
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(0);
        const parent = await f.authority.execution.runs.get(f.h.handle, parentRunId);
        expect(parent.status).toBe('blocked'); expect(parent.progress.delegates).toBe(0); expect(parent.progress.handoffs).toBe(0);
    }
    finally { await f.cleanup(); }
}, 60000);

test('Game delegated DAG exhausts its original held request allocation without reaching parent Model or Output', async () => {
    const f = await sessionDelegationFixture(makeTempFsEngineHarness, { childRequests: 1 });
    try {
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
        const child = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        const root = await f.authority.execution.runs.get(f.h.handle, child.rootRunId); expect(root.outputClaims).toEqual([]);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId];
        expect(bank.compute.attempts).toHaveLength(1); expect(bank.compute.attempts[0].status).toBe('settled');
        const before = f.requests.length; await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(before);
    } finally { await f.cleanup(); }
}, 120000);


test.each(['known', 'unknown', 'source', 'usage_unknown'])('Game child %s failure preserves original paid facts and never forges a return', async kind => {
    const f = await sessionDelegationFixture(makeTempSqliteEngineHarness, { childSteps: 1, ...(kind === 'usage_unknown' ? { childUsage: false } : kind !== 'source' ? { childFailure: kind } : {}) });
    if (kind === 'source') f.onResponse(async () => { await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'Withdraw child source during the paid request.' }); });
    try {
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
        const child = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        const parent = await f.authority.execution.runs.get(f.h.handle, child.parentRef.parentRunId);
        expect(child.status).toBe(kind === 'known' ? 'failed' : ['unknown', 'usage_unknown'].includes(kind) ? 'reconciling' : 'blocked');
        expect(parent.status).toBe(['unknown', 'usage_unknown'].includes(kind) ? 'reconciling' : 'blocked');
        expect(parent.outputClaims).toEqual([]); expect(child.outputClaims).toEqual([]); expect(child.resultRefs).toHaveLength(kind === 'usage_unknown' ? 1 : 0);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[parent.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(1); expect(bank.attempts[0].status).toBe(['unknown', 'usage_unknown'].includes(kind) ? 'unknown' : 'settled');
        expect(bank.reservations.find(row => row.reservationId === child.runId).status).toBe(['unknown', 'usage_unknown'].includes(kind) ? 'held' : 'released');
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            expect(await checkedRecord(tx, controlRecordKey(f.h.handle, parent.runId, 'receipt', handoffReturnReceiptId(child.runId)))).toBeNull();
        });
        await f.cold(); await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
    } finally { await f.cleanup(); }
}, 120000);


test('Game parent cancellation during its paid child preserves the original cancel and fee without return', async () => {
    const f = await sessionDelegationFixture(makeTempSqliteEngineHarness, { childSteps: 1 });
    let parentRunId;
    f.onResponse(async () => {
        const child = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId); parentRunId = child.parentRef.parentRunId;
        await f.authority.execution.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), {
            ...runGuard(await f.authority.execution.runs.get(f.h.handle, parentRunId)), reasonCode: 'cancel_during_delegated_model' });
    });
    try {
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
        const child = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId), parent = await f.authority.execution.runs.get(f.h.handle, parentRunId);
        expect(parent).toMatchObject({ status: 'cancelled', cancelRequested: true });
        expect(child).toMatchObject({ status: 'cancelled', cancelRequested: true });
        expect(parent.outputClaims).toEqual([]); expect(child.outputClaims).toEqual([]);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[parent.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(1); expect(bank.attempts[0].status).toBe('settled');
        expect(bank.reservations.find(row => row.reservationId === child.runId).status).toBe('released');
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            expect(await checkedRecord(tx, controlRecordKey(f.h.handle, parent.runId, 'receipt', handoffReturnReceiptId(child.runId)))).toBeNull();
        });
    } finally { await f.cleanup(); }
}, 90000);
