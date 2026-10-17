import { expect, test } from '@jest/globals';
import { sessionJudgeFixture } from './helpers/session-judge-fixture.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { readSessionOutput } from '../../src/native/orchestration/session-output-contracts.js';
import { readAttempt, controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

test.each([['SQLite', makeTempSqliteEngineHarness], ['FS', makeTempFsEngineHarness]])('%s Game original scoped Judge selects a typed candidate before the single Narrator', async (_name, make) => {
    const f = await sessionJudgeFixture(make);
    try {
        const result = await f.start(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.status).toBe('completed'); expect(root.outputClaims).toHaveLength(1); expect(f.requests).toHaveLength(4);
        expect(f.requests[2].model).toBe('session-judge-distinct-model'); expect(f.requests[0].model).not.toBe(f.requests[2].model);
        const judgeInput = JSON.stringify(f.requests[2].input), finalInput = JSON.stringify(f.requests[3].input);
        expect(judgeInput).toContain('CANDIDATE_UNSELECTED_BODY'); expect(judgeInput).toContain('CANDIDATE_SELECTED_BODY');
        expect(judgeInput).toContain('阿岚听说'); expect(judgeInput).not.toContain('沈墨怀疑');
        expect(finalInput).not.toContain('CANDIDATE_UNSELECTED_BODY');
        const proof = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
        expect(proof.published.judgeCompletions).toHaveLength(1);
        const judge = proof.published.judgeCompletions[0];
        expect(judge.receipt.candidateRefs).toHaveLength(2);
        expect(judge.selectedResultRef).toEqual(proof.published.graphResults.find(item => item.record.payload === 'CANDIDATE_SELECTED_BODY').receipt.resultRef);
        expect(proof.published.modelIntent.inputRef.acceptedGraphResultRefs).toEqual([judge.selectedResultRef]);
        expect(proof.published.modelIntent.inputRef.acceptedControlRefs).toEqual([judge.controlRef]);
        expect(proof.closure.effectIds).toHaveLength(5);
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state); expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(4); expect(bank.attempts.every(item => item.status === 'settled')).toBe(true);
        expect(bank.localWork.map(item => item.kind)).toEqual(expect.arrayContaining(['graph_control_parse', 'graph_control_adopt']));
        await f.cold();
        const cold = await f.authority.execution.runs.get(f.h.handle, root.runId);
        expect((await f.authority.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, cold))).receipt).toEqual(proof.receipt);
        await f.authority.engine.withTransaction(f.h.handle, async tx => {
            const key = controlRecordKey(f.h.handle, cold.runId, 'receipt', judge.receipt.receiptId), row = await tx.getResource(key);
            const other = row.doc.candidateRefs.find(ref => hash(ref) !== hash(row.doc.selectedResultRef));
            const changed = { ...row.doc, selectedResultRef: other, responseText: JSON.stringify({ selectedResultRef: other, reasonCode: 'candidate_selected' }) };
            expect(changed.selectedResultRef).not.toEqual(row.doc.selectedResultRef);
            try {
                await tx.putResource(key, { ...row, doc: changed, integrity: hash(changed) });
                await expect(readSessionOutput(tx, f.h.handle, cold)).rejects.toThrow();
            } finally { await tx.putResource(key, row); }
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(proof.receipt);
            const narrator = (await readAttempt(tx, f.h.handle, cold, proof.published.producer.attemptId)).doc;
            expect(narrator.inputRefs.slice(1)).toEqual([judge.selectedResultRef, judge.controlRef]);
        });
        expect(f.requests).toHaveLength(4);
    } finally { await f.cleanup(); }
}, 180000);

test.each([['invalidSelection', 3], ['unreadable', 2]])('Game Judge %s preserves paid history and cannot select or read outside original candidates', async (option, sends) => {
    const f = await sessionJudgeFixture(makeTempSqliteEngineHarness, { [option]: true });
    try {
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(sends);
        const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
        expect(root.outputClaims).toEqual([]); expect(root.pendingApprovalRefs).toEqual([]);
        expect((await f.core.observe(f.h.handle, f.base.session.sessionId)).timeline).toEqual(f.base.timeline);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(sends); expect(bank.attempts.every(item => item.status === 'settled')).toBe(true);
        expect(await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root))).toBeNull();
    } finally { await f.cleanup(); }
}, 120000);
