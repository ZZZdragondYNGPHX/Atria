import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpFanoutFixture } from './helpers/rp-fanout-fixture.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { readRpFanoutCompletion } from '../../src/native/orchestration/rp-fanout-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../src/native/identity.js';
import { controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { putMutable } from '../../src/native/repositories/common.js';
import { AgentEvolutionService } from '../../src/native/agent-intelligence/evolution-service.js';
import { jest } from '@jest/globals';
import { nativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';
import { inspectComputeReservation } from '../../public/shared/native-compute-budget.js';

const bankOf = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
const rootOf = async f => (await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle })))[0].doc;

describe.each(CONTRACT_HARNESSES)('$name original RP explicit Fanout Join', ({ make }) => {
    test('real parallel Model branches close the original deterministic Join before the Narrator and single Chat output', async () => {
        const ordinals = new WeakMap();
        const f = await rpFanoutFixture(make, { responsePayload: body => 'BRANCH_RESULT_' + ordinals.get(body) });
        let release;
        const entered = new Promise(resolve => { release = resolve; });
        let beforeJoin, cold;
        f.onResponse(async body => {
            ordinals.set(body, f.requests.length);
            if (f.requests.length === 2) {
                beforeJoin = { root: await rootOf(f), chat: await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name) }; release();
            }
            if (f.requests.length <= 2) await entered;
        });
        try {
            const result = await f.run();
            const root = await f.authority.execution.runs.get(f.h.handle, result.runId);
            expect(beforeJoin.root.outputClaims).toEqual([]); expect(beforeJoin.root.resultRefs).toEqual([]); expect(beforeJoin.chat.body).toHaveLength(2);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(3);
            const joined = await f.h.engine.withTransaction(f.h.handle, tx => readRpFanoutCompletion(tx, f.h.handle, root));
            expect(joined.joinReceipt).toMatchObject({ outcome: 'completed', policy: 'all-success', excluded: [] });
            expect(joined.joinReceipt.acceptedResultRefs).toHaveLength(2); expect(joined.frame.maxConcurrency).toBe(2);
            expect(JSON.stringify(f.requests[0])).not.toContain('BRANCH_RESULT_'); expect(JSON.stringify(f.requests[1])).not.toContain('BRANCH_RESULT_');
            expect(JSON.stringify(f.requests[2])).toContain('BRANCH_RESULT_1'); expect(JSON.stringify(f.requests[2])).toContain('BRANCH_RESULT_2');
            expect(JSON.stringify(f.requests[2])).not.toContain('BRANCH_RESULT_3');
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.graphResults).toHaveLength(2); expect(output.closure.effectIds).toHaveLength(4);
            expect(output.closure.budgetAttemptRefs.filter(ref => ref.kind !== 'local_work')).toHaveLength(3);
            expect(root.progress.attempts).toBe(6); expect(root.progress.edgeVisits).toBe(6);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
            const bank = await bankOf(f);
            expect(bank.attempts).toHaveLength(3); expect(bank.attempts.every(attempt => attempt.status === 'settled' && attempt.usage.totalTokens === 20)).toBe(true);
            expect(new Set(output.closure.budgetAttemptRefs.map(ref => JSON.stringify(ref.authorityRef))).size).toBe(1);
            expect(new Set(bank.attempts.map(attempt => attempt.attemptId)).size).toBe(3);
            await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            await cold.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, root.runId, 'join', joined.joinReceipt.joinId), row = await tx.getResource(key);
                await putMutable(tx, key, { ...row.doc, acceptedResultRefs: row.doc.acceptedResultRefs.slice(1) }, { expectedIntegrity: row.integrity });
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).rejects.toThrow('Invalid original RP Fanout Join facts');
            expect(f.requests).toHaveLength(3);
        } finally { await cold?.close(); await f.cleanup(); }
    }, 60000);

    test('one logical execution slot runs both real branches through the original Scheduler without a passive-control deadlock or duplicate bank admission', async () => {
        const f = await rpFanoutFixture(make, { maxConcurrency: 1 });
        try {
            const result = await f.run(), root = await rootOf(f);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(3);
            const joined = await f.h.engine.withTransaction(f.h.handle, tx => readRpFanoutCompletion(tx, f.h.handle, root));
            expect(joined.frame.maxConcurrency).toBe(1); expect(root.limits.maxConcurrency).toBe(1);
            expect((await bankOf(f)).attempts).toHaveLength(3);
        } finally { await f.cleanup(); }
    }, 60000);

    test('unknown real branch usage is retained across the Join and prevents a completed cost claim without repeating either branch', async () => {
        let unknown;
        const f = await rpFanoutFixture(make, { usage: body => { unknown ??= body; return body !== unknown; } });
        try {
            const result = await f.run(), root = await rootOf(f);
            expect(result.output.runStatus).toBe('pending_output'); expect(root.outputClaims).toEqual([]); expect(f.requests).toHaveLength(3);
            const joined = await f.h.engine.withTransaction(f.h.handle, tx => readRpFanoutCompletion(tx, f.h.handle, root));
            expect(joined.joinReceipt.outcome).toBe('completed');
            const bank = await bankOf(f); expect(bank.attempts).toHaveLength(3);
            expect(bank.attempts.some(attempt => attempt.status === 'unknown')).toBe(true);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each(['binding', 'cancel'])('real %s withdrawal while both HTTP branches are pending retains their fees and never admits the Join successor or Chat output', async change => {
        const f = await rpFanoutFixture(make);
        let release, admitted, changed = false;
        const cancellations = [], originalCancel = nativeTaskScheduler.cancel;
        const cancel = jest.spyOn(nativeTaskScheduler, 'cancel').mockImplementation(function (owner, id, ...args) {
            const operation = this.operations.get(id), cancelled = originalCancel.call(this, owner, id, ...args);
            if (cancelled && operation.key.startsWith('rp-fanout:')) cancellations.push({ key: operation.key,
                retained: this.running.has(operation), aborted: operation.controller?.signal.aborted === true });
            return cancelled;
        });
        const both = new Promise(resolve => { release = resolve; });
        f.onResponse(async () => {
            if (f.requests.length === 2 && !changed) {
                changed = true;
                admitted = await bankOf(f);
                if (change === 'binding') {
                    const binding = await f.plans.getBinding(f.h.handle, f.sourceSelector);
                    await f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                } else await f.authority.execution.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(await rootOf(f)), reasonCode: 'controlled_fanout_cancel' });
                release();
            }
            await both;
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(changed).toBe(true); expect(f.requests).toHaveLength(2);
            const root = await rootOf(f);
            expect(root.outputClaims).toEqual([]); expect(root.resultRefs).toEqual([]); expect(root.attemptRefs).toHaveLength(4);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
            const bank = await bankOf(f); expect(bank.attempts).toHaveLength(2);
            expect(admitted.attempts).toHaveLength(2); expect(admitted.attempts.every(attempt => attempt.status === 'charged')).toBe(true);
            expect(bank.reservations).toEqual(admitted.reservations); expect(bank.limits).toEqual(admitted.limits);
            for (const row of bank.attempts) {
                const original = admitted.attempts.find(attempt => attempt.attemptId === row.attemptId);
                expect(original.estimatedTokens).toBeGreaterThan(0); expect(['settled', 'unknown']).toContain(row.status);
                expect(row).toEqual({ ...original, status: row.status,
                    usage: row.status === 'settled' ? { totalTokens: 20, inputTokens: 12, outputTokens: 8 } : null });
            }
            expect(inspectComputeReservation({ compute: bank }).used).toMatchObject({ requests: 2,
                tokens: bank.attempts.reduce((total, row) => total + (row.status === 'settled' ? 20 : admitted.attempts.find(item => item.attemptId === row.attemptId).estimatedTokens), 0) });
            for (const row of bank.attempts.filter(item => item.status === 'unknown')) {
                const effect = await f.h.engine.withTransaction(f.h.handle, tx => readEffect(tx, f.h.handle, root, row.orchestration.effectId));
                const key = 'rp-fanout:' + root.runId + ':' + effect.doc.nodeAttemptId;
                expect(cancellations).toContainEqual({ key, retained: true, aborted: true });
                const operation = [...nativeTaskScheduler.operations.values()].find(item => item.key === key);
                expect(operation.view.status).toBe('cancelled'); expect(nativeTaskScheduler.running.has(operation)).toBe(false);
            }
            expect(root.cancelRequested).toBe(change === 'cancel');
        } finally { release(); await f.cleanup(); cancel.mockRestore(); }
    }, 60000);

    test('a failed paid branch cannot masquerade as an accepted Join member or trigger a Narrator retry', async () => {
        let first;
        const f = await rpFanoutFixture(make, { responseStatus: body => body === first ? 500 : 200 });
        let release;
        const both = new Promise(resolve => { release = resolve; });
        f.onResponse(async body => { first ??= body; if (f.requests.length === 2) release(); await both; });
        try {
            await expect(f.run()).rejects.toThrow('native_orchestration_join_unsuccessful'); expect(f.requests).toHaveLength(2);
            const root = await rootOf(f);
            expect(root.outputClaims).toEqual([]); expect(root.resultRefs).toHaveLength(1); expect(root.attemptRefs).toHaveLength(4);
            const joined = await f.h.engine.withTransaction(f.h.handle, tx => readRpFanoutCompletion(tx, f.h.handle, root));
            expect(joined.joinReceipt.outcome).toBe('failed'); expect(joined.joinReceipt.acceptedResultRefs).toEqual([]);
            expect(joined.allMembers.filter(item => item.terminal?.kind === 'rejected')).toHaveLength(1);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
            const bank = await bankOf(f); expect(bank.attempts).toHaveLength(2); expect(bank.attempts.every(attempt => attempt.status === 'settled')).toBe(true);
            expect(root.pendingEffectRefs).toHaveLength(0); expect(root.status).toBe('blocked');
        } finally { release(); await f.cleanup(); }
    }, 60000);

    test('a single-branch shape without this concrete RP group consumer is rejected before any Model or bank work', async () => {
        const f = await rpFanoutFixture(make, { branchCount: 1 });
        try {
            await expect(f.run()).rejects.toThrow('native_orchestration_rp_fanout_unavailable');
            expect(f.requests).toEqual([]); expect((await f.control.status(f.h.handle, f.controlId)).operations).toEqual({});
        } finally { await f.cleanup(); }
    }, 30000);

    test('the original serial evaluation bridge refuses this published Fanout configuration before any evaluation send or fee', async () => {
        const f = await rpFanoutFixture(make);
        try {
            const service = new AgentEvolutionService({ host: f.host, chatRepo: f.chats });
            const scope = { domain: 'rp_chat', ...f.locator, groupId: '' }, subject = f.locator.charDir;
            const choice = (await service.targets.catalog(f.h.handle, scope, subject)).find(choice => choice.target.fieldPath === 'limits.maxSteps');
            const settings = await service.targets.evaluationSettings(f.h.handle, scope, subject, choice.target);
            await expect(service.evaluator.configuration(f.h.handle, settings.runtimeRouteId, null, settings.nativePlan)).rejects.toThrow('native_orchestration_evaluation_unavailable');
            expect(f.requests).toEqual([]); expect((await f.control.status(f.h.handle, f.controlId)).operations).toEqual({});
            expect(await service.repository.owner(f.h.handle)).toBeNull();
        } finally { await f.cleanup(); }
    }, 30000);
});
