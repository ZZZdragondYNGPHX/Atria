import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpComposableJudgeFixture as fixture } from './helpers/rp-composable-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { putMutable } from '../../src/native/repositories/common.js';
import { resultDependencyDigest } from '../../src/native/orchestration/result-contracts.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { graphJudgeModelReceiptId } from '../../src/native/orchestration/graph-judge-completion.js';
import { controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { ModelPort } from '../../src/native/orchestration/model-port.js';

jest.setTimeout(120000);
const id = kind => createNativeId('orchestration' + kind);
const text = body => body.messages.flatMap(message => typeof message.content === 'string' ? [message.content] : message.content.map(part => part.text ?? '')).join('\n');

describe.each(CONTRACT_HARNESSES)('$name RP composable typed Judge', ({ make }) => {
    test.each([{ candidateCount: 3, withReview: false }, { candidateCount: 2, withReview: true }])('Planner/candidates/Review=$withReview/Judge use exact non-fixed $candidateCount candidates and one cold Output', async options => {
        const f = await fixture(make, options); let cold;
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(f.calls); expect(root.graphRevision).toBe(1);
            const judge = text(f.requests.find(body => body.model === 'generic-judge'));
            for (let i = 0; i < options.candidateCount; i++) expect(judge).toContain('CANDIDATE_' + i + '_PRIVATE');
            expect(judge).toContain('A PRIVATE RUMOR'); expect(judge).not.toContain('B PRIVATE RUMOR'); expect(judge).not.toContain('NARRATOR ONLY MEMORY');
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.plannerCompletions).toHaveLength(1); expect(output.published.reviewCompletions).toHaveLength(Number(options.withReview));
            expect(output.published.judgeCompletions).toHaveLength(1); expect(output.published.graphResults).toHaveLength(options.candidateCount);
            const selected = output.published.judgeCompletions[0]; expect(selected.receipt.candidateRefs).toHaveLength(options.candidateCount);
            expect(selected.selectedResultRef).toEqual(f.selected());
            const actual = selected.candidates.find(fact => fact.record.resultId === f.selected().resultId);
            const narrator = text(f.requests.at(-1)); expect(narrator).toContain(actual.record.payload);
            for (const candidate of selected.candidates.filter(fact => fact !== actual)) expect(narrator).not.toContain(candidate.record.payload);
            expect(root.outputClaims).toHaveLength(1); expect(output.closure.effectIds).toHaveLength(f.calls + 1);
            const control = await f.control.status(f.h.handle, f.controlId), bank = Object.values(control.operations)[0].compute;
            expect(bank.limits.maxRequests).toBe(f.calls); expect(bank.limits.localWork.maxJobs).toBe(64); expect(bank.attempts).toHaveLength(f.calls);
            expect(bank.attempts.every(attempt => attempt.status === 'settled' && attempt.usage.totalTokens === 20)).toBe(true);
            expect((await f.source.core.observe(f.h.handle, f.source.base.session.sessionId)).revision).toEqual(f.source.base.revision);
            await f.chats.delete(f.h.handle, f.locator.charDir, f.locator.name); await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            const resultKey = controlRecordKey(f.h.handle, root.runId, 'result', actual.record.resultId);
            const originalResult = await cold.withTransaction(f.h.handle, async tx => {
                const row = await tx.getResource(resultKey);
                const envelope = { ...row.doc.envelope, createdAt: row.doc.envelope.createdAt + 1 };
                envelope.dependencyDigest = resultDependencyDigest(envelope);
                await putMutable(tx, resultKey, { ...row.doc, envelope }, { expectedIntegrity: row.integrity });
                return row.doc;
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).rejects.toThrow('Invalid Graph Result facts');
            await cold.withTransaction(f.h.handle, async tx => {
                const row = await tx.getResource(resultKey);
                await putMutable(tx, resultKey, originalResult, { expectedIntegrity: row.integrity });
            });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            await cold.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, root.runId, 'receipt', graphJudgeModelReceiptId(root.runId, selected.producer.attemptId));
                const row = await tx.getResource(key), other = selected.receipt.candidateRefs.find(ref => ref.resultId !== f.selected().resultId);
                await putMutable(tx, key, { ...row.doc, selectedResultRef: other,
                    responseText: JSON.stringify({ selectedResultRef: other, reasonCode: 'candidate_selected' }) }, { expectedIntegrity: row.integrity });
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).rejects.toThrow('Invalid Graph Judge completion facts');
            expect(f.requests).toHaveLength(f.calls);
        } finally { await cold?.close(); await f.cleanup(); }
    });

    test('all independent Actor candidates must be readable before composed Judge HTTP, retaining every prior paid Result', async () => {
        const f = await fixture(make, { unreadable: true });
        try {
            await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_consumption_stale' });
            expect(f.requests).toHaveLength(3); expect(f.requests.some(body => body.model === 'generic-judge')).toBe(false);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.graphRevision).toBe(1); expect(root.resultRefs).toHaveLength(2); expect(root.outputClaims).toEqual([]);
            const control = await f.control.status(f.h.handle, f.controlId), bank = Object.values(control.operations)[0].compute;
            expect(bank.attempts).toHaveLength(3); expect(bank.attempts.every(attempt => attempt.status === 'settled' && attempt.usage.totalTokens === 20)).toBe(true);
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(3); expect(await f.control.status(f.h.handle, f.controlId)).toEqual(control);
        } finally { await f.cleanup(); }
    });

    test('an out-of-candidate typed choice retains the paid Judge and both Results without a Narrator or resend', async () => {
        const f = await fixture(make, { invalidChoice: true });
        try {
            await expect(f.run()).rejects.toMatchObject({ code: 'generation_execution_failed' });
            expect(f.requests).toHaveLength(4);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.resultRefs).toHaveLength(2); expect(root.outputClaims).toEqual([]);
            const control = await f.control.status(f.h.handle, f.controlId), bank = Object.values(control.operations)[0].compute;
            expect(bank.attempts).toHaveLength(4); expect(bank.attempts.every(attempt => attempt.status === 'settled' && attempt.usage.totalTokens === 20)).toBe(true);
            // Original metered local work normalizes internal parse rejection.
            // The paid invalid choice must fail its parse job and create no
            // accepted Judge choice, even though the Model send is settled.
            expect(bank.localWork.at(-1)).toMatchObject({ kind: 'graph_control_parse', status: 'settled', usage: { outcome: 'failed' } });
            const judge = f.effects.find(effect => effect.proposal.inputRef.nodeId === f.nodes.judge.nodeId);
            expect(await f.h.engine.withTransaction(f.h.handle, tx => tx.getResource(controlRecordKey(f.h.handle, root.runId, 'receipt',
                graphJudgeModelReceiptId(root.runId, judge.nodeAttemptId))))).toBeNull();
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(4); expect(await f.control.status(f.h.handle, f.controlId)).toEqual(control);
        } finally { await f.cleanup(); }
    });

    test('unknown fees preserve all composed control facts and legal Chat output without completion, refund or resend', async () => {
        const f = await fixture(make, { withReview: true, usage: false });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('pending_output'); expect(f.requests).toHaveLength(6); expect(root.resultRefs).toHaveLength(3); expect(root.outputClaims).toEqual([]);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
            const control = await f.control.status(f.h.handle, f.controlId), bank = Object.values(control.operations)[0].compute;
            expect(bank.attempts).toHaveLength(6); expect(bank.attempts.every(attempt => attempt.status === 'unknown')).toBe(true);
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(6); expect(await f.control.status(f.h.handle, f.controlId)).toEqual(control);
        } finally { await f.cleanup(); }
    });

    test.each(['binding', 'cancel'])('same-transaction %s during composed Judge proof preserves withdrawal and all paid facts', async change => {
        const f = await fixture(make), inspect = ModelPort.prototype.inspectResultCompletion;
        let changed = false, runId;
        const spy = jest.spyOn(ModelPort.prototype, 'inspectResultCompletion').mockImplementation(async function (handle, request) {
            const proof = await inspect.call(this, handle, request);
            if (!changed && f.requests.length === 4 && f.h.engine.hasActiveTransaction(handle)) {
                changed = true; runId = request.runId;
                if (change === 'binding') {
                    const binding = await f.plans.getBinding(handle, f.sourceSelector);
                    await f.plans.saveBinding(handle, id('Command'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                } else await f.authority.execution.runs.cancel(handle, id('Command'), { ...runGuard(await f.authority.execution.runs.get(handle, runId)), reasonCode: 'user_cancelled' });
            }
            return proof;
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(changed).toBe(true); expect(f.requests).toHaveLength(4);
            const root = await f.authority.execution.runs.get(f.h.handle, runId);
            expect(root.cancelRequested).toBe(change === 'cancel'); expect(root.graphRevision).toBe(1); expect(root.resultRefs).toHaveLength(2); expect(root.outputClaims).toEqual([]);
            expect((await f.plans.getBinding(f.h.handle, f.sourceSelector)).version).toBe(change === 'binding' ? 1 : 0);
            const bank = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(bank.attempts).toHaveLength(4); expect(bank.attempts.every(attempt => attempt.status === 'settled' && attempt.usage.totalTokens === 20)).toBe(true);
        } finally { spy.mockRestore(); await f.cleanup(); }
    });
});
