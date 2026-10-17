import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpComposableReviewFixture as fixture } from './helpers/rp-composable-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { putMutable } from '../../src/native/repositories/common.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { graphReviewModelReceiptId } from '../../src/native/orchestration/graph-review-completion.js';
import { ModelPort } from '../../src/native/orchestration/model-port.js';
import { controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { nativeTaskScheduler } from '../../src/native/task-scheduler.js';

jest.setTimeout(120000);
const id = kind => createNativeId('orchestration' + kind);
const text = body => body.messages.flatMap(message => typeof message.content === 'string' ? [message.content] : message.content.map(part => part.text ?? '')).join('\n');


describe.each(CONTRACT_HARNESSES)('$name RP original Planner and composable Review', ({ make }) => {
    test.each([{ rerun: false, multiTargets: false }, { rerun: true, multiTargets: false }, { rerun: false, multiTargets: true }])('independent owned Models preserve original Review decision and cold closure, rerun=$rerun multiTargets=$multiTargets', async ({ rerun, multiTargets }) => {
        const maxJobs = rerun ? 64 : 32, f = await fixture(make, { rerun, maxJobs, multiTargets }), calls = rerun ? 6 : multiTargets ? 5 : 4; let cold;
        try {
            const operation = await f.start(), scheduling = nativeTaskScheduler.operations.get(operation.operationId);
            const result = await operation.result, root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(calls); expect(root.graphRevision).toBe(1);
            expect(new Set(f.requests.map(body => body.model))).toEqual(new Set(['composable-planner', 'composable-agent', 'composable-review', 'p4-fixture', ...multiTargets ? ['composable-agent-second'] : []]));
            const modelEffects = f.effects.filter(effect => effect.proposal.inputRef.kind === 'native_rp_intent');
            expect(new Set(modelEffects.map(effect => effect.proposal.targetRef.connectionProfileId)).size).toBe(multiTargets ? 5 : 4);
            for (const resource of (await Promise.all(Object.values(f.nodes).map(async node => {
                const effect = modelEffects.find(effect => effect.proposal.inputRef.nodeId === node.nodeId);
                return 'connection:' + f.h.handle + ':' + effect.proposal.targetRef.connectionProfileId;
            })))) expect(scheduling.resources).toContain(resource);
            const reviewRequests = f.requests.filter(body => body.model === 'composable-review').map(text);
            expect(reviewRequests).toHaveLength(rerun ? 2 : 1);
            expect(reviewRequests.every(content => content.includes('A PRIVATE RUMOR') && !content.includes('B PRIVATE RUMOR'))).toBe(true);
            expect(reviewRequests.at(-1)).toContain(rerun ? 'DRAFT_2' : 'DRAFT_1');
            expect(reviewRequests.at(-1).includes('DRAFT_SECOND')).toBe(multiTargets);
            expect(text(f.requests.at(-1))).toContain(rerun ? 'DRAFT_2' : 'DRAFT_1');
            expect(text(f.requests.at(-1))).not.toContain(rerun ? 'DRAFT_1' : 'DRAFT_2');
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.plannerCompletions).toHaveLength(1); expect(output.published.reviewCompletions).toHaveLength(rerun ? 2 : 1);
            expect(output.published.graphResults).toHaveLength(rerun || multiTargets ? 2 : 1); expect(output.closure.effectIds).toHaveLength(calls + 1);
            const bank = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(bank.limits.localWork.maxJobs).toBe(maxJobs); expect(bank.attempts).toHaveLength(calls);
            expect(bank.attempts.every(attempt => attempt.status === 'settled' && attempt.usage.totalTokens === 20)).toBe(true);
            expect((await f.source.core.observe(f.h.handle, f.source.base.session.sessionId)).revision).toEqual(f.source.base.revision);
            await f.chats.delete(f.h.handle, f.locator.charDir, f.locator.name); await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            const review = output.published.reviewCompletions.at(-1);
            await cold.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, root.runId, 'receipt', graphReviewModelReceiptId(root.runId, review.producer.attemptId));
                const row = await tx.getResource(key);
                await putMutable(tx, key, { ...row.doc, responseText: JSON.stringify({ decision: 'approve', reasonCode: 'quality_ready', targetAttemptIds: [output.published.plannerCompletions[0].producer.attemptId] }) }, { expectedIntegrity: row.integrity });
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).rejects.toThrow('Invalid Graph Review completion facts');
            expect(f.requests).toHaveLength(calls);
        } finally { await cold?.close(); await f.cleanup(); }
    });
    test('the original 32-job bank retains the accepted Planner, Review and replacement Results when local headroom runs out', async () => {
        const f = await fixture(make, { rerun: true });
        try {
            await expect(f.run()).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
            expect(f.requests).toHaveLength(5);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.graphRevision).toBe(1); expect(root.resultRefs).toHaveLength(2); expect(root.outputClaims).toEqual([]);
            const control = await f.control.status(f.h.handle, f.controlId), bank = Object.values(control.operations)[0].compute;
            expect(bank.limits.localWork.maxJobs).toBe(32); expect(bank.localWork).toHaveLength(32);
            expect(bank.attempts).toHaveLength(5); expect(bank.attempts.every(attempt => attempt.status === 'settled' && attempt.usage.totalTokens === 20)).toBe(true);
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(5);
            expect(await f.control.status(f.h.handle, f.controlId)).toEqual(control);
            expect((await f.source.core.observe(f.h.handle, f.source.base.session.sessionId)).revision).toEqual(f.source.base.revision);
        } finally { await f.cleanup(); }
    });
    test('an unreadable direct Actor Result stops the composed Reviewer before its HTTP while retaining all paid predecessors', async () => {
        const f = await fixture(make, { multiTargets: true, unreadable: true });
        try {
            await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_consumption_stale' });
            expect(f.requests).toHaveLength(3); expect(f.requests.some(body => body.model === 'composable-review')).toBe(false);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.graphRevision).toBe(1); expect(root.resultRefs).toHaveLength(2); expect(root.outputClaims).toEqual([]);
            const control = await f.control.status(f.h.handle, f.controlId), bank = Object.values(control.operations)[0].compute;
            expect(bank.attempts).toHaveLength(3); expect(bank.attempts.every(attempt => attempt.status === 'settled' && attempt.usage.totalTokens === 20)).toBe(true);
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(3);
            expect(await f.control.status(f.h.handle, f.controlId)).toEqual(control);
        } finally { await f.cleanup(); }
    });
    test.each(['binding', 'cancel'])('same-transaction %s during composed Review proof retains withdrawal and all three paid attempts', async change => {
        const f = await fixture(make), inspect = ModelPort.prototype.inspectResultCompletion;
        let changed = false, runId;
        const spy = jest.spyOn(ModelPort.prototype, 'inspectResultCompletion').mockImplementation(async function (handle, request) {
            const proof = await inspect.call(this, handle, request);
            if (!changed && f.requests.length === 3 && f.h.engine.hasActiveTransaction(handle)) {
                changed = true; runId = request.runId;
                if (change === 'binding') {
                    const binding = await f.plans.getBinding(handle, f.sourceSelector);
                    await f.plans.saveBinding(handle, id('Command'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                } else await f.authority.execution.runs.cancel(handle, id('Command'), {
                    ...runGuard(await f.authority.execution.runs.get(handle, runId)), reasonCode: 'user_cancelled' });
            }
            return proof;
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(changed).toBe(true); expect(f.requests).toHaveLength(3);
            const root = await f.authority.execution.runs.get(f.h.handle, runId);
            expect(root.cancelRequested).toBe(change === 'cancel'); expect(root.graphRevision).toBe(1); expect(root.resultRefs).toHaveLength(1); expect(root.outputClaims).toEqual([]);
            expect((await f.plans.getBinding(f.h.handle, f.sourceSelector)).version).toBe(change === 'binding' ? 1 : 0);
            const bank = Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
            expect(bank.attempts).toHaveLength(3); expect(bank.attempts.every(attempt => attempt.status === 'settled' && attempt.usage.totalTokens === 20)).toBe(true);
        } finally { spy.mockRestore(); await f.cleanup(); }
    });
});
