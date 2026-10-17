import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpComposableJudgeFixture as fixture } from './helpers/rp-composable-fixture.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { readAttempt, readAttemptInvalidation, controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { graphReviewModelReceiptId } from '../../src/native/orchestration/graph-review-completion.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { putMutable } from '../../src/native/repositories/common.js';
import { createNativeId } from '../../src/native/identity.js';
import { ModelPort } from '../../src/native/orchestration/model-port.js';

jest.setTimeout(120000);
const id = kind => createNativeId('orchestration' + kind);
const text = body => body.messages.flatMap(message => typeof message.content === 'string' ? [message.content] : message.content.map(part => part.text ?? '')).join('\n');
const profile = { withPlanner: false, withReview: true };

describe.each(CONTRACT_HARNESSES)('$name RP composable models without a mandatory Planner', ({ make }) => {
    test('two exact targets redo through owned Models, Review and Judge to one Narrator, with all old fees and cold proofs retained', async () => {
        const f = await fixture(make, { ...profile, rerun: true }); let cold;
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(8);
            expect(root.graph.nodes.some(node => node.kind === 'planner')).toBe(false); expect(root.graphRevision).toBe(0);
            expect(root.graph.graphChangePolicy.allowedOperations).toEqual([]); expect(root.progress.reviews).toBe(2);
            const models = f.effects.filter(effect => effect.proposal.inputRef.kind === 'native_rp_intent');
            expect(new Set(models.map(effect => effect.proposal.targetRef.connectionProfileId)).size).toBe(5);
            expect(new Set(models.map(effect => effect.effectId)).size).toBe(8);
            for (const body of f.requests.filter(body => body.model !== 'p4-fixture')) {
                expect(text(body)).toContain('A PRIVATE RUMOR'); expect(text(body)).not.toContain('B PRIVATE RUMOR');
                expect(text(body)).not.toContain('NARRATOR ONLY MEMORY');
            }
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.plannerCompletions).toEqual([]); expect(output.published.reviewCompletions).toHaveLength(2);
            expect(output.published.graphResults).toHaveLength(4); expect(output.published.judgeCompletions).toHaveLength(1);
            expect(output.published.graphResults.map(fact => fact.producer.attemptId)).toEqual(models.filter(effect => f.nodes.candidates.some(node => node.nodeId === effect.proposal.inputRef.nodeId)).map(effect => effect.nodeAttemptId));
            expect(root.resultRefs).toEqual([...output.published.graphResults.map(fact => fact.receipt.resultRef), output.published.receipt.resultRef]);
            expect(output.published.reviewCompletions.map(fact => fact.review.decision)).toEqual(['rerun', 'approve']);
            for (const fact of output.published.reviewCompletions) expect(fact.review.targetAttemptIds).toHaveLength(2);
            const invalidations = await f.h.engine.withTransaction(f.h.handle, async tx => Promise.all(output.published.graphResults.slice(0, 2)
                .map(fact => readAttemptInvalidation(tx, f.h.handle, root, fact.producer))));
            expect(invalidations.every(Boolean)).toBe(true);
            const judge = output.published.judgeCompletions[0]; expect(judge.selectedResultRef).toEqual(f.selected());
            expect(judge.candidates).toHaveLength(2);
            const selected = judge.candidates.find(fact => fact.receipt.resultRef.resultId === f.selected().resultId);
            expect(text(f.requests.at(-1))).toContain(selected.record.payload);
            for (const fact of output.published.graphResults.filter(fact => fact.record.resultId !== selected.record.resultId))
                expect(text(f.requests.at(-1))).not.toContain(fact.record.payload);
            for (const body of f.requests.filter(body => body.model === 'generic-review' || body.model === 'generic-judge').slice(1))
                expect(text(body)).not.toMatch(/CANDIDATE_[01]_PRIVATE_V1/);
            expect(output.closure.effectIds).toHaveLength(9); expect(root.outputClaims).toHaveLength(1);
            const status = await f.control.status(f.h.handle, f.controlId), bank = Object.values(status.operations)[0].compute;
            expect(bank.limits.maxRequests).toBe(8); expect(bank.limits.localWork.maxJobs).toBe(64); expect(bank.attempts).toHaveLength(8);
            expect(bank.attempts.every(row => row.status === 'settled' && row.usage.totalTokens === 20)).toBe(true);
            expect((await f.source.core.observe(f.h.handle, f.source.base.session.sessionId)).revision).toEqual(f.source.base.revision);
            await f.chats.delete(f.h.handle, f.locator.charDir, f.locator.name); await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            const wrongOrder = { ...root, resultRefs: [root.resultRefs[1], root.resultRefs[0], ...root.resultRefs.slice(2)] };
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, wrongOrder))).rejects.toThrow('Invalid RP control graph facts');
            const review = output.published.reviewCompletions[0];
            await cold.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, root.runId, 'receipt', graphReviewModelReceiptId(root.runId, review.producer.attemptId));
                const row = await tx.getResource(key);
                await putMutable(tx, key, { ...row.doc, responseText: JSON.stringify({ decision: 'approve', reasonCode: 'quality_ready', targetAttemptIds: review.review.targetAttemptIds }) }, { expectedIntegrity: row.integrity });
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).rejects.toThrow('Invalid Graph Review completion facts');
            expect(f.requests).toHaveLength(8);
        } finally { await cold?.close(); await f.cleanup(); }
    });

    test('an Agent-only success DAG retains separate Actor Sources and reference-only unreadable evidence', async () => {
        const f = await fixture(make, { withPlanner: false, withJudge: false, unreadable: true });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(3); expect(root.graphRevision).toBe(0);
            const a = text(f.requests.find(body => body.model === 'generic-candidate.0')), b = text(f.requests.find(body => body.model === 'generic-candidate.1'));
            expect(a).toContain('A PRIVATE RUMOR'); expect(a).not.toContain('B PRIVATE RUMOR');
            expect(b).toContain('B PRIVATE RUMOR'); expect(b).not.toContain('A PRIVATE RUMOR');
            expect(text(f.requests.at(-1))).toContain('CANDIDATE_0_PRIVATE'); expect(text(f.requests.at(-1))).not.toContain('CANDIDATE_1_PRIVATE');
            expect(text(f.requests.at(-1))).toContain('reference-only');
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.graphResults).toHaveLength(2); expect(output.published.plannerCompletions).toEqual([]);
            expect(output.closure.effectIds).toHaveLength(4); expect(root.outputClaims).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('unknown fees retain every approved quality fact and legal Chat without completion, refund or resend', async () => {
        const f = await fixture(make, { ...profile, usage: false });
        try {
            const result = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('pending_output'); expect(f.requests).toHaveLength(5);
            expect(root.graphRevision).toBe(0); expect(root.resultRefs).toHaveLength(3); expect(root.outputClaims).toEqual([]);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
            const status = await f.control.status(f.h.handle, f.controlId), bank = Object.values(status.operations)[0].compute;
            expect(bank.attempts).toHaveLength(5); expect(bank.attempts.every(row => row.status === 'unknown')).toBe(true);
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(5); expect(await f.control.status(f.h.handle, f.controlId)).toEqual(status);
        } finally { await f.cleanup(); }
    });

    test('the declared four-request bank rejects redo headroom while retaining all paid Results and refusing a replay', async () => {
        const f = await fixture(make, { ...profile, rerun: true, maxRequests: 4 });
        try {
            await expect(f.run()).rejects.toMatchObject({ code: 'generation_execution_failed' }); expect(f.requests).toHaveLength(3);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.graphRevision).toBe(0); expect(root.resultRefs).toHaveLength(2); expect(root.outputClaims).toEqual([]);
            const status = await f.control.status(f.h.handle, f.controlId), bank = Object.values(status.operations)[0].compute;
            expect(bank.limits.maxRequests).toBe(4); expect(bank.attempts).toHaveLength(3);
            expect(bank.attempts.every(row => row.status === 'settled' && row.usage.totalTokens === 20)).toBe(true);
            expect(bank.localWork.at(-1)).toMatchObject({ kind: 'graph_control_adopt', status: 'settled', usage: { outcome: 'failed' } });
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(3); expect(await f.control.status(f.h.handle, f.controlId)).toEqual(status);
        } finally { await f.cleanup(); }
    });

    test('an unreadable Actor Result rejects the Reviewer before its HTTP and retains both paid independent predecessors', async () => {
        const f = await fixture(make, { ...profile, unreadable: true });
        try {
            await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_consumption_stale' }); expect(f.requests).toHaveLength(2);
            expect(f.requests.some(body => body.model === 'generic-review' || body.model === 'generic-judge')).toBe(false);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.resultRefs).toHaveLength(2); expect(root.outputClaims).toEqual([]);
            const status = await f.control.status(f.h.handle, f.controlId), bank = Object.values(status.operations)[0].compute;
            expect(bank.attempts).toHaveLength(2); expect(bank.attempts.every(row => row.status === 'settled' && row.usage.totalTokens === 20)).toBe(true);
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(2); expect(await f.control.status(f.h.handle, f.controlId)).toEqual(status);
        } finally { await f.cleanup(); }
    });

    test.each(['binding', 'cancel'])('same-transaction %s during Review proof preserves withdrawal and the three paid attempts', async change => {
        const f = await fixture(make, profile), inspect = ModelPort.prototype.inspectResultCompletion;
        let changed = false, runId;
        const spy = jest.spyOn(ModelPort.prototype, 'inspectResultCompletion').mockImplementation(async function (handle, request) {
            const proof = await inspect.call(this, handle, request);
            if (!changed && f.requests.length === 3 && f.h.engine.hasActiveTransaction(handle)) {
                changed = true; runId = request.runId;
                if (change === 'binding') {
                    const binding = await f.plans.getBinding(handle, f.sourceSelector);
                    await f.plans.saveBinding(handle, id('Command'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                } else await f.authority.execution.runs.cancel(handle, id('Command'), { ...runGuard(await f.authority.execution.runs.get(handle, runId)), reasonCode: 'user_cancelled' });
            }
            return proof;
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(changed).toBe(true); expect(f.requests).toHaveLength(3);
            const root = await f.authority.execution.runs.get(f.h.handle, runId);
            expect(root.cancelRequested).toBe(change === 'cancel'); expect(root.graphRevision).toBe(0); expect(root.outputClaims).toEqual([]);
            expect((await f.plans.getBinding(f.h.handle, f.sourceSelector)).version).toBe(change === 'binding' ? 1 : 0);
            const bank = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(bank.attempts).toHaveLength(3); expect(bank.attempts.every(row => row.status === 'settled' && row.usage.totalTokens === 20)).toBe(true);
            const attempts = await f.h.engine.withTransaction(f.h.handle, tx => Promise.all(root.attemptRefs.map(attempt => readAttempt(tx, f.h.handle, root, attempt))));
            expect(attempts.some(row => row.doc.nodeId === f.nodes.judge.nodeId)).toBe(false);
        } finally { spy.mockRestore(); await f.cleanup(); }
    });
});
