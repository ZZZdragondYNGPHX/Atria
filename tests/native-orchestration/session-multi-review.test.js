import { expect, test } from '@jest/globals';
import { sessionMultiReviewFixture } from './helpers/session-multi-review-fixture.js';
import { makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { readSessionOutput } from '../../src/native/orchestration/session-output-contracts.js';
import { controlRecordKey, readAttemptInvalidation } from '../../src/native/orchestration/controller-common.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

const task = body => body.input.map(item => { try { return JSON.parse(item.content); } catch { return null; } }).find(value => value?.nodeId);

test('SQLite Game two authored Reviews redo both independent targets and the original settled pure downstream closure', async () => {
    const f = await sessionMultiReviewFixture(makeTempSqliteEngineHarness);
    try {
        const result = await f.start(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.status).toBe('completed'); expect(root.outputClaims).toHaveLength(1); expect(root.progress.reviews).toBe(4); expect(f.requests).toHaveLength(11);
        expect(new Set(f.requests.map(body => body.model)).size).toBe(4);
        const proof = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
        expect(proof.published.reviewCompletions).toHaveLength(4); expect(proof.published.graphResults).toHaveLength(6); expect(proof.closure.effectIds).toHaveLength(12);
        const rerun = proof.published.reviewCompletions.find(item => item.review.decision === 'rerun');
        expect(rerun.review.targetAttemptIds).toHaveLength(2); expect(rerun.review.replacements).toHaveLength(2); expect(rerun.review.invalidatedAttemptIds).toHaveLength(4);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            for (const id of rerun.review.invalidatedAttemptIds) expect((await readAttemptInvalidation(tx, f.h.handle, root,
                [...proof.published.graphResults, ...proof.published.reviewCompletions].find(item => item.producer.attemptId === id).producer)).reviewReceiptId).toBe(rerun.review.receiptId);
        });
        const merges = f.requests.filter(body => task(body)?.nodeId === f.topology.merge.nodeId);
        expect(merges).toHaveLength(2); expect(JSON.stringify(merges[1].input)).toContain('FIRST_2'); expect(JSON.stringify(merges[1].input)).toContain('SECOND_2');
        expect(JSON.stringify(merges[1].input)).not.toContain('FIRST_1'); expect(JSON.stringify(merges[1].input)).not.toContain('SECOND_1');
        expect(JSON.stringify(f.requests.at(-1).input)).toContain('MERGE_2'); expect(JSON.stringify(f.requests.at(-1).input)).not.toContain('MERGE_1');
        for (const body of f.requests.filter(body => task(body)?.reviewTargets)) {
            expect(JSON.stringify(body.input)).toContain('阿岚听说'); expect(JSON.stringify(body.input)).not.toContain('沈墨怀疑');
        }
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state); expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(11); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        await f.cold(); const cold = await f.authority.execution.runs.get(f.h.handle, root.runId);
        expect((await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, cold))).receipt).toEqual(proof.receipt);
        await f.authority.engine.withTransaction(f.h.handle, async tx => {
            const key = controlRecordKey(f.h.handle, cold.runId, 'receipt', rerun.receipt.receiptId), row = await tx.getResource(key);
            const response = JSON.parse(row.doc.responseText), changed = { ...row.doc,
                responseText: JSON.stringify({ ...response, targetAttemptIds: [proof.published.producer.attemptId] }) };
            try { await tx.putResource(key, { ...row, doc: changed, integrity: hash(changed) }); await expect(readSessionOutput(tx, f.h.handle, cold)).rejects.toThrow(); }
            finally { await tx.putResource(key, row); }
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(proof.receipt);
        });
        await f.authority.engine.withTransaction(f.h.handle, async tx => {
            const middle = proof.published.graphResults.find(item => item.record.payload === 'MERGE_2');
            const key = controlRecordKey(f.h.handle, cold.runId, 'receipt', 'oreceipt_' + middle.producer.attemptId.slice('oattempt_'.length)), row = await tx.getResource(key);
            expect(row.doc.receiptKind).toBe('graph_transition');
            const visits = { ...row.doc.edgeVisits }, first = Object.keys(visits)[0]; visits[first]++;
            const changed = { ...row.doc, edgeVisits: visits };
            try { await tx.putResource(key, { ...row, doc: changed, integrity: hash(changed) }); await expect(readSessionOutput(tx, f.h.handle, cold)).rejects.toThrow(); }
            finally { await tx.putResource(key, row); }
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(proof.receipt);
        });
        expect(f.requests).toHaveLength(11);
    } finally { await f.cleanup(); }
}, 240000);

test.each([['closure headroom', { maxRequests: 10 }, 5], ['invalid typed target', { invalidTarget: true }, 5],
    ['unreadable Actor evidence', { unreadable: true }, 2]])('Game multi-Review %s retains original paid work and cannot publish or dispatch replacements', async (_mode, options, sends) => {
    const f = await sessionMultiReviewFixture(makeTempSqliteEngineHarness, options);
    try {
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(sends);
        const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.outputClaims).toEqual([]); expect(root.pendingApprovalRefs).toEqual([]); expect(root.pendingEffectRefs).toEqual([]);
        expect(f.requests.filter(body => task(body)?.nodeId === f.topology.first.nodeId)).toHaveLength(1);
        expect(f.requests.filter(body => task(body)?.nodeId === f.topology.second.nodeId)).toHaveLength(1);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(sends); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        const current = await f.core.observe(f.h.handle, f.base.session.sessionId);
        expect(current.timeline).toEqual(f.base.timeline); expect(current.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        expect(await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root))).toBeNull();
        // A refused, uncharged Context must also leave a true durable terminal
        // state. This assertion deliberately covers the preparation boundary.
        expect(root.status).toBe('blocked');
    } finally { await f.cleanup(); }
}, 120000);

test('Game Source withdrawn during a real multi-Review response retains all paid facts and rejects later control adoption', async () => {
    const f = await sessionMultiReviewFixture(makeTempSqliteEngineHarness);
    let withdrawn = false;
    f.onResponse(async () => {
        if (f.requests.length !== 3) return;
        withdrawn = true; await f.core.appendTimeline(f.h.handle, f.base.session.sessionId,
            { role: 'user', content: 'Withdraw during the original typed multi-Review response.' });
    });
    try {
        await expect(f.start()).rejects.toThrow(); expect(withdrawn).toBe(true); expect(f.requests).toHaveLength(3);
        const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.status).toBe('blocked'); expect(root.outputClaims).toEqual([]); expect(root.pendingEffectRefs).toEqual([]);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(3); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        const current = await f.core.observe(f.h.handle, f.base.session.sessionId);
        expect(current.timeline.at(-1).content).toBe('Withdraw during the original typed multi-Review response.');
        expect(current.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(3);
    } finally { await f.cleanup(); }
}, 120000);
