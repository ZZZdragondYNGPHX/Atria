import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpFanoutFixture } from './helpers/rp-fanout-fixture.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { readRpFanoutCompletion } from '../../src/native/orchestration/rp-fanout-contracts.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { readRpNarrationResult } from '../../src/native/orchestration/rp-narration-result-contracts.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';

const rootOf = async f => (await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle })))[0].doc;
const bankOf = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
const narration = body => JSON.stringify(body).includes('native_rp_graph_narration');

describe.each(CONTRACT_HARNESSES)('$name original RP Join policies', ({ make }) => {
    test.each(['any-success', 'count-quorum', 'deadline'])('%s closes its original receipt and starts the Narrator before a real late worker, preserving selected inputs and all actual fees', async strategy => {
        let late, release, beforeNarrator, cold;
        const gate = new Promise(resolve => { release = resolve; }), ordinals = new WeakMap();
        const f = await rpFanoutFixture(make, { strategy, branchCount: strategy === 'deadline' ? 2 : 3,
            quorum: strategy === 'count-quorum' ? 2 : 1, allowPartial: strategy === 'deadline', joinDeadlineMs: strategy === 'deadline' ? 8000 : 60000,
            responsePayload: body => body === late ? 'LATE_UNSELECTED_BODY' : narration(body) ? 'Selected advisory narration.' : 'SELECTED_BRANCH_' + ordinals.get(body) });
        f.onResponse(async body => {
            ordinals.set(body, f.requests.length);
            if (narration(body)) {
                beforeNarrator = { root: await rootOf(f), chat: await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name) };
                release();
            } else if (f.requests.length === 2) { late = body; await gate; }
        });
        try {
            const result = await f.run(), root = await rootOf(f);
            expect(beforeNarrator).toBeDefined(); expect(beforeNarrator.root.outputClaims).toEqual([]); expect(beforeNarrator.chat.body).toHaveLength(2);
            const joined = await f.h.engine.withTransaction(f.h.handle, tx => readRpFanoutCompletion(tx, f.h.handle, root));
            const selected = strategy === 'count-quorum' ? 2 : 1;
            expect(joined.joinReceipt.acceptedResultRefs).toHaveLength(selected);
            expect(joined.joinReceipt.excluded.some(item => item.reasonCode === 'unsettled_at_cutoff')).toBe(true);
            expect(joined.graphResults.some(item => item.record.payload === 'LATE_UNSELECTED_BODY')).toBe(true);
            expect(joined.allMembers.find(item => item.result?.record.payload === 'LATE_UNSELECTED_BODY').receipt).toBeNull();
            const request = f.requests.find(narration);
            expect(JSON.stringify(request)).not.toContain('LATE_UNSELECTED_BODY'); expect(JSON.stringify(request)).toContain('SELECTED_BRANCH_1');
            const expectedSends = strategy === 'count-quorum' ? 4 : 3;
            expect(f.requests).toHaveLength(expectedSends); expect((await bankOf(f)).attempts).toHaveLength(expectedSends);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.closure.budgetAttemptRefs.filter(ref => ref.kind !== 'local_work')).toHaveLength(expectedSends);
            expect(result.output.runStatus).toBe(strategy === 'deadline' ? 'partial' : 'completed');
            expect(root.status).toBe(result.output.runStatus);
            expect(output.published.record.envelope.status).toBe(strategy === 'deadline' ? 'partial' : 'complete');
            expect(joined.allMembers.filter(item => item.attempt.reasonCode === 'join_member_excluded')).toHaveLength(strategy === 'any-success' ? 1 : 0);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
            await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            const recovered = await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(recovered.claim).toEqual(output.claim);
            expect(recovered.published.fanout.joinReceipt.acceptedResultRefs).toEqual(joined.joinReceipt.acceptedResultRefs);
        } finally { release(); await cold?.close(); await f.cleanup(); }
    }, 120000);

    test('an unselected transport-unknown branch retains its original Effect and cost occupancy without blocking a legal selected narration or claiming final closure', async () => {
        let ambiguous;
        const f = await rpFanoutFixture(make, { strategy: 'any-success', quorum: 1, responseStatus: body => body === ambiguous ? null : 200 });
        f.onResponse(async body => { if (!narration(body)) ambiguous ??= body; });
        try {
            const result = await f.run(), root = await rootOf(f);
            const joined = await f.h.engine.withTransaction(f.h.handle, tx => readRpFanoutCompletion(tx, f.h.handle, root));
            expect(joined.joinReceipt.outcome).toBe('completed'); expect(joined.joinReceipt.acceptedResultRefs).toHaveLength(1);
            expect(joined.allMembers.filter(item => item.receipt === null && item.attempt.effectRefs.length === 1)).toHaveLength(1);
            expect(result.output.runStatus).toBe('pending_output'); expect(root.outputClaims).toEqual([]); expect(root.pendingEffectRefs).toHaveLength(1);
            const bank = await bankOf(f); expect(bank.attempts).toHaveLength(3); expect(bank.attempts.filter(row => row.status === 'unknown')).toHaveLength(1);
            expect(f.requests).toHaveLength(3); expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
        } finally { await f.cleanup(); }
    }, 60000);

    test('deadline still waits its frozen cutoff after every real worker has settled and preserves complete identity when both results are eligible', async () => {
        const f = await rpFanoutFixture(make, { strategy: 'deadline', allowPartial: true, joinDeadlineMs: 8000 });
        try {
            const result = await f.run(), root = await rootOf(f);
            const joined = await f.h.engine.withTransaction(f.h.handle, tx => readRpFanoutCompletion(tx, f.h.handle, root));
            expect(joined.settlement.createdAt).toBeGreaterThanOrEqual(joined.barrier.deadlineAt);
            expect(joined.allMembers.every(item => item.receipt?.createdAt < joined.barrier.deadlineAt)).toBe(true);
            expect(joined.joinReceipt.outcome).toBe('completed'); expect(joined.joinReceipt.acceptedResultRefs).toHaveLength(2);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(3); expect((await bankOf(f)).attempts).toHaveLength(3);
        } finally { await f.cleanup(); }
    }, 60000);

    test('the original deadline Join persists while both Model slots are occupied and never adopts their later receipts', async () => {
        let release, observed, observing = true;
        const gate = new Promise(resolve => { release = resolve; });
        const f = await rpFanoutFixture(make, { branchCount: 3, maxConcurrency: 2, strategy: 'deadline', allowPartial: true, joinDeadlineMs: 8000 });
        f.onResponse(async body => {
            const ordinal = f.requests.length;
            if (narration(body) || ordinal === 1) return;
            if (ordinal === 3) {
                while (observing && !observed) {
                    const root = await rootOf(f);
                    const rows = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRecord,
                        handle: f.h.handle, runId: root.runId, recordType: 'join' }));
                    const receipt = rows.find(row => row.doc.acceptedResultRefs)?.doc;
                    if (receipt) observed = { receipt, chat: await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name), root };
                    else await new Promise(resolve => setTimeout(resolve, 20));
                }
                release();
            }
            await gate;
        });
        try {
            const result = await f.run(), root = await rootOf(f);
            expect(observed.receipt.outcome).toBe('partial'); expect(observed.receipt.acceptedResultRefs).toHaveLength(1);
            expect(observed.root.outputClaims).toEqual([]); expect(observed.chat.body).toHaveLength(2);
            const joined = await f.h.engine.withTransaction(f.h.handle, tx => readRpFanoutCompletion(tx, f.h.handle, root));
            expect(joined.joinReceipt).toEqual(observed.receipt); expect(joined.joinReceipt.excluded).toHaveLength(2);
            expect(joined.allMembers.filter(item => item.receipt === null && item.result)).toHaveLength(2);
            expect(result.output.runStatus).toBe('partial'); expect(f.requests).toHaveLength(4); expect((await bankOf(f)).attempts).toHaveLength(4);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.closure.budgetAttemptRefs.filter(ref => ref.kind !== 'local_work')).toHaveLength(4);
        } finally { observing = false; release(); await f.cleanup(); }
    }, 60000);

    test('partial publication support is unavailable to an ordinary RP shape without the actual owned Fanout and Join consumer', async () => {
        await expect(rpModelFixture(make, { configurePlan: async plan => {
            plan.definition.capabilityCeiling.push('chat.output'); plan.definition.nodes[1].capabilities.push('chat.output');
            plan.definition.outputContract.allowPartial = true;
        } })).rejects.toThrow('native_orchestration_rp_output_policy_invalid');
    }, 30000);

    test.each([true, false])('all-settled uses a real rejected Model receipt, preserves partial identity and keeps unknown fees open; reported=%s', async reported => {
        let rejected;
        const f = await rpFanoutFixture(make, { strategy: 'all-settled', allowPartial: true,
            responseStatus: body => body === rejected ? 503 : 200, usage: body => body !== rejected || reported });
        f.onResponse(async body => { if (!narration(body)) rejected ??= body; });
        try {
            const result = await f.run(), root = await rootOf(f);
            const joined = await f.h.engine.withTransaction(f.h.handle, tx => readRpFanoutCompletion(tx, f.h.handle, root));
            expect(joined.joinReceipt.outcome).toBe('partial'); expect(joined.joinReceipt.acceptedResultRefs).toHaveLength(1);
            expect(joined.allMembers.filter(item => item.terminal?.kind === 'rejected')).toHaveLength(1);
            const published = await f.h.engine.withTransaction(f.h.handle, tx => readRpNarrationResult(tx, f.h.handle, root));
            expect(published.record.envelope.status).toBe('partial'); expect(published.producer.status).toBe('partial');
            expect(result.output.runStatus).toBe('partial');
            expect(root.outputClaims).toHaveLength(1);
            const bank = await bankOf(f); expect(bank.attempts).toHaveLength(3); expect(f.requests).toHaveLength(3);
            expect(bank.attempts.filter(row => row.status === 'unknown')).toHaveLength(reported ? 0 : 1);
            const output = reported ? await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root)) : null;
            expect(output?.closure.effectIds.length ?? null).toBe(reported ? 4 : null);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
        } finally { await f.cleanup(); }
    }, 120000);

    test('fail_fast records the real first failure and cancels still-prepared members without any additional HTTP, refund or output', async () => {
        const f = await rpFanoutFixture(make, { branchCount: 3, maxConcurrency: 1, failurePolicy: 'fail_fast', responseStatus: () => 503 });
        try {
            await expect(f.run()).rejects.toThrow('native_orchestration_join_unsuccessful');
            expect(f.requests).toHaveLength(1); const root = await rootOf(f);
            const joined = await f.h.engine.withTransaction(f.h.handle, tx => readRpFanoutCompletion(tx, f.h.handle, root));
            expect(joined.joinReceipt.outcome).toBe('failed'); expect(joined.joinReceipt.acceptedResultRefs).toEqual([]);
            expect(joined.allMembers.filter(item => item.attempt.status === 'failed')).toHaveLength(1);
            expect(joined.allMembers.filter(item => item.attempt.reasonCode === 'fanout_fail_fast')).toHaveLength(2);
            const bank = await bankOf(f); expect(bank.attempts).toHaveLength(1); expect(bank.attempts[0].status).toBe('settled');
            expect(root.status).toBe('blocked'); expect(root.outputClaims).toEqual([]);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { await f.cleanup(); }
    }, 60000);
});
