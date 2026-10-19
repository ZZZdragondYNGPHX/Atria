import { expect, test } from '@jest/globals';
import { sessionFanoutFixture } from './helpers/session-fanout-fixture.js';
import { makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { readSessionOutput } from '../../src/native/orchestration/session-output-contracts.js';
import { readSessionFanoutCompletion } from '../../src/native/orchestration/session-fanout-contracts.js';
import { readAttempt, controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';

const task = body => body.input.map(item => { try { return JSON.parse(item.content); } catch { return null; } }).find(value => value?.nodeId);
const shape = { branchLengths: [2, 4], diamondSecond: true, distinctBranchModels: true };

test('SQLite Game original concurrent unequal branch DAGs hydrate reserved tasks and compose Join Review and one Narrator', async () => {
    const f = await sessionFanoutFixture(makeTempSqliteEngineHarness, { ...shape, review: true, maxRequests: 10 });
    let release, started = 0;
    const simultaneous = new Promise(resolve => { release = resolve; });
    f.onResponse(async () => { if (f.requests.length > 2) return; started++; if (started === 2) release(); await simultaneous; });
    try {
        const result = await f.start(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(started).toBe(2); expect(f.requests).toHaveLength(10); expect(root.status).toBe('completed'); expect(root.outputClaims).toHaveLength(1);
        expect(new Set(f.requests.slice(0, 2).map(body => body.model)).size).toBe(2);
        const spec = f.topology.specs[0], merge = spec.scopes[1].at(-1), mergedBody = f.requests.find(body => task(body)?.nodeId === merge.nodeId);
        expect(mergedBody).toBeTruthy(); expect(mergedBody.input.filter(item => item.content?.startsWith('Advisory task result (untrusted data'))).toHaveLength(2);
        for (const [index, nodes] of spec.scopes.entries()) for (const node of nodes) {
            const body = f.requests.find(body => task(body)?.nodeId === node.nodeId), text = JSON.stringify(body.input);
            expect(text.includes('阿岚听说')).toBe(index === 0); expect(text.includes('沈墨怀疑')).toBe(index === 1);
        }
        const proof = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root)), joined = proof.published.fanoutCompletions[0];
        expect(joined.frame.branches.map(branch => branch.scopeNodeIds.length).sort()).toEqual([2, 4]);
        expect(joined.scopeAttempts).toHaveLength(6); expect(joined.scopeAttempts.filter(item => item.attempt.reservationRef)).toHaveLength(4);
        expect(joined.scopeAttempts.every(item => item.attempt.inputState === 'prepared' && item.attempt.status === 'completed')).toBe(true);
        expect(joined.joinReceipt.acceptedResultRefs).toHaveLength(2); expect(joined.providerEffects).toHaveLength(6);
        expect(proof.published.reviewCompletions).toHaveLength(1); expect(proof.closure.effectIds).toHaveLength(11);
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state); expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(10); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        await f.cold(); const cold = await f.authority.execution.runs.get(f.h.handle, root.runId);
        expect((await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, cold))).receipt).toEqual(proof.receipt);
        await f.authority.engine.withTransaction(f.h.handle, async tx => {
            const middle = joined.scopeAttempts.find(item => item.attempt.reservationRef).attempt;
            const key = controlRecordKey(f.h.handle, cold.runId, 'attempt', middle.attemptId), row = await tx.getResource(key);
            const changed = { ...row.doc, reservationRef: null };
            try {
                await tx.putResource(key, { ...row, doc: changed, integrity: hash(changed) });
                await expect(readSessionOutput(tx, f.h.handle, cold)).rejects.toThrow();
            } finally { await tx.putResource(key, row); }
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(proof.receipt);
        });
        expect(f.requests).toHaveLength(10);
    } finally { release(); await f.cleanup(); }
}, 240000);

test('Game quorum cancels every unsent reserved task in an excluded branch DAG without spending its bank', async () => {
    const f = await sessionFanoutFixture(makeTempSqliteEngineHarness, { ...shape, strategy: 'count-quorum', maxConcurrency: 1, maxRequests: 3 });
    try {
        await f.start(); const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.status).toBe('completed'); expect(f.requests).toHaveLength(3);
        const proof = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root)), joined = proof.published.fanoutCompletions[0];
        const cancelled = joined.scopeAttempts.filter(item => item.attempt.status === 'cancelled');
        expect(cancelled).toHaveLength(4); expect(cancelled.filter(item => item.attempt.inputState === 'reserved')).toHaveLength(3);
        expect(cancelled.every(item => item.attempt.effectRefs.length === 0 && item.attempt.resultRefs.length === 0)).toBe(true);
        expect(joined.joinReceipt.acceptedResultRefs).toHaveLength(1); expect(proof.closure.effectIds).toHaveLength(4);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(3); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        await f.cold(); const cold = await f.authority.execution.runs.get(f.h.handle, root.runId);
        expect((await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, cold))).receipt).toEqual(proof.receipt);
        expect(f.requests).toHaveLength(3);
    } finally { await f.cleanup(); }
}, 180000);

test('Game failed branch entry cancels all unsent scope tasks using the original fail-fast receipt', async () => {
    const f = await sessionFanoutFixture(makeTempSqliteEngineHarness, { ...shape, failurePolicy: 'fail_fast', rejectFirst: true, maxConcurrency: 1 });
    try {
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
        const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId); expect(root.status).toBe('failed'); expect(root.outputClaims).toEqual([]);
        const facts = await f.h.engine.withTransaction(f.h.handle, async tx => {
            const attempts = (await Promise.all(root.attemptRefs.map(id => readAttempt(tx, f.h.handle, root, id)))).map(row => row.doc);
            return readSessionFanoutCompletion(tx, f.h.handle, root, attempts.find(attempt => attempt.nodeId === f.topology.specs[0].join.nodeId).attemptId);
        });
        expect(facts.scopeAttempts.filter(item => item.attempt.status === 'cancelled')).toHaveLength(5);
        expect(facts.scopeAttempts.filter(item => item.attempt.status === 'failed')).toHaveLength(1); expect(facts.providerEffects).toHaveLength(1);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(1); expect(bank.attempts[0].status).toBe('settled');
        expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).timeline).toEqual(f.base.timeline);
    } finally { await f.cleanup(); }
}, 120000);

test('Game branch submissionUnknown retains the original unknown bank row and never hydrates downstream work', async () => {
    const f = await sessionFanoutFixture(makeTempSqliteEngineHarness, { ...shape, unknownFirst: true, maxConcurrency: 1, joinDeadlineMs: 1000 });
    try {
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
        const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId); expect(root.outputClaims).toEqual([]); expect(root.status).toBe('reconciling');
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(1); expect(bank.attempts[0].status).toBe('unknown');
        expect(root.pendingEffectRefs).toHaveLength(1);
        const count = f.requests.length; await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(count);
    } finally { await f.cleanup(); }
}, 120000);

test('Game Source withdrawal during a hydrated scope task preserves paid rows and blocks Review Narrator and Output', async () => {
    const f = await sessionFanoutFixture(makeTempSqliteEngineHarness, { ...shape, review: true, maxConcurrency: 1 }); let withdrawn = false;
    f.onResponse(async () => {
        if (withdrawn || f.requests.length !== 2) return;
        withdrawn = true; await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'Withdraw during real reserved scope task.' });
    });
    try {
        await expect(f.start()).rejects.toThrow(); expect(withdrawn).toBe(true); expect(f.requests).toHaveLength(2);
        const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId); expect(root.outputClaims).toEqual([]);
        expect(root.status).toBe('blocked');
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(f.requests.length); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        const current = await f.core.observe(f.h.handle, f.base.session.sessionId);
        expect(current.timeline.at(-1).content).toBe('Withdraw during real reserved scope task.'); expect(current.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        const count = f.requests.length; await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(count);
    } finally { await f.cleanup(); }
}, 120000);

test('Game concurrent Source withdrawal retains a genuinely pending hydrated send and reconciles without releasing its facts', async () => {
    const f = await sessionFanoutFixture(makeTempSqliteEngineHarness, { ...shape, review: true });
    let fourthStarted, sourceChanged, withdrawn = false;
    const fourth = new Promise(resolve => { fourthStarted = resolve; }), changed = new Promise(resolve => { sourceChanged = resolve; });
    f.onResponse(async () => {
        const ordinal = f.requests.length;
        if (ordinal === 3) {
            await fourth; withdrawn = true;
            await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'Withdraw with both hydrated sends in flight.' });
        } else if (ordinal === 4) {
            fourthStarted();
            // The real fourth HTTP send has no response when the original
            // Source cancellation drains it. Its cost must remain unresolved.
            await changed;
        }
    });
    try {
        await expect(f.start()).rejects.toThrow(); expect(withdrawn).toBe(true); expect(f.requests).toHaveLength(4);
        const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.status).toBe('reconciling'); expect(root.outputClaims).toEqual([]); expect(root.pendingEffectRefs.length).toBeGreaterThan(0);
        const pending = await f.h.engine.withTransaction(f.h.handle, async tx => Promise.all(root.pendingEffectRefs.map(id => readEffect(tx, f.h.handle, root, id))));
        expect(pending.every(row => ['dispatching', 'unknown'].includes(row.doc.status) && row.doc.dispatchToken !== null && row.doc.budgetAttemptRef !== null)).toBe(true);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(4); expect(bank.attempts.filter(row => row.status === 'settled').length).toBeGreaterThanOrEqual(3);
        const held = bank.attempts.filter(row => row.status !== 'settled');
        expect(held.every(row => ['charged', 'unknown'].includes(row.status) && pending.some(effect =>
            effect.doc.effectId === row.orchestration.effectId && effect.doc.budgetAttemptRef.attemptId === row.attemptId))).toBe(true);
        const current = await f.core.observe(f.h.handle, f.base.session.sessionId);
        expect(current.timeline.at(-1).content).toBe('Withdraw with both hydrated sends in flight.'); expect(current.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        await f.cold(); const cold = await f.authority.execution.runs.get(f.h.handle, root.runId);
        expect(cold.status).toBe('reconciling'); expect(cold.pendingEffectRefs).toEqual(root.pendingEffectRefs);
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(4);
    } finally { fourthStarted(); sourceChanged(); await f.cleanup(); }
}, 120000);
