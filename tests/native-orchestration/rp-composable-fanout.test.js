import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpComposableFanoutFixture as fixture, bodyText } from './helpers/rp-composable-fanout-fixture.js';
import { readRpControlInputs } from '../../src/native/orchestration/rp-control-input-contracts.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { readRpControlFanoutCompletion } from '../../src/native/orchestration/rp-control-fanout-contracts.js';
import { readAttempt, controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { putMutable, hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { createNativeId } from '../../src/native/identity.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';

jest.setTimeout(120000);
const bankOf = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
const rootOf = async f => f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);

describe.each(CONTRACT_HARNESSES)('$name RP composable Fanout Join', ({ make }) => {
    test('Planner, unequal frozen Actor branches, Join, Review and Judge consume original Models before one Narrator with cold evidence', async () => {
        const f = await fixture(make); let cold, release; const startedAt = Date.now(), modelTimes = [];
        const both = new Promise(resolve => { release = resolve; });
        f.onResponse(async body => {
            modelTimes.push({ model: body.model, sentAtMs: Date.now() - startedAt });
            if (!['fanout-branch-a', 'fanout-branch-b'].includes(body.model)) return;
            if (f.requests.filter(item => ['fanout-branch-a', 'fanout-branch-b'].includes(item.model)).length === 2) release();
            await both;
        });
        try {
            const result = await f.run(), root = await rootOf(f);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(8); expect(root.graphRevision).toBe(1);
            expect(new Set(f.effects.filter(effect => effect.proposal.inputRef.kind === 'native_rp_intent').map(effect => effect.proposal.targetRef.connectionProfileId)).size).toBe(8);
            const a = bodyText(f.requests.find(body => body.model === 'fanout-branch-a'));
            const b = bodyText(f.requests.find(body => body.model === 'fanout-branch-b'));
            expect(a).toContain('A PRIVATE RUMOR'); expect(a).not.toContain('B PRIVATE RUMOR'); expect(a).not.toContain('ADVISORY_B');
            expect(b).toContain('B PRIVATE RUMOR'); expect(b).not.toContain('A PRIVATE RUMOR'); expect(b).not.toContain('ADVISORY_A');
            const next = bodyText(f.requests.find(body => body.model === 'fanout-branch-a-next'));
            expect(next).toContain('ADVISORY_A'); expect(next).not.toContain('ADVISORY_B'); expect(next).toContain('branch-a-next');
            const after = bodyText(f.requests.find(body => body.model === 'fanout-after-join'));
            expect(after).toContain('ADVISORY_A2'); expect(after).not.toContain('ADVISORY_B'); expect(after).toContain('reference-only');
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
            const joinAttempt = await f.h.engine.withTransaction(f.h.handle, async tx => (await Promise.all(root.attemptRefs.map(id => readAttempt(tx, f.h.handle, root, id)))).find(row => row.doc.nodeId === f.nodes.join.nodeId).doc);
            const joined = await f.h.engine.withTransaction(f.h.handle, tx => readRpControlFanoutCompletion(tx, f.h.handle, root, joinAttempt.attemptId));
            expect(joined.frame.branches.map(branch => branch.memberAttemptIds.length).sort()).toEqual([1, 2]);
            expect(joined.joinReceipt).toMatchObject({ policy: 'all-success', outcome: 'completed', excluded: [] });
            expect(joined.joinReceipt.acceptedResultRefs).toHaveLength(2); expect(joined.providerEffects).toHaveLength(3);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.fanoutCompletions).toHaveLength(1); expect(output.published.reviewCompletions).toHaveLength(1);
            expect(output.published.judgeCompletions).toHaveLength(1); expect(output.closure.effectIds).toHaveLength(9);
            const bank = await bankOf(f); expect(bank.attempts).toHaveLength(8); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            const actual = f.effects.find(effect => effect.proposal.inputRef.nodeId === f.nodes.after.nodeId).proposal.inputRef.controlGraph;
            await expect(f.h.engine.withTransaction(f.h.handle, tx => readRpControlInputs(tx, f.h.handle, root,
                { ...actual, evidenceRefs: actual.evidenceRefs.slice(1) }, { targetNodeId: f.nodes.after.nodeId }))).rejects.toThrow('Invalid RP control graph facts');
            await expect(f.h.engine.withTransaction(f.h.handle, tx => readRpControlInputs(tx, f.h.handle, root,
                actual, { targetNodeId: f.nodes.after.nodeId, controlsOnly: true }))).rejects.toThrow('Invalid RP control graph facts');
            expect((await f.source.core.observe(f.h.handle, f.source.base.session.sessionId)).revision).toEqual(f.source.base.revision);
            await f.chats.delete(f.h.handle, f.locator.charDir, f.locator.name);
            await f.h.engine.close(); cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            await cold.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, root.runId, 'join', joined.joinReceipt.joinId), row = await tx.getResource(key);
                await putMutable(tx, key, { ...row.doc, acceptedResultRefs: row.doc.acceptedResultRefs.slice(1) }, { expectedIntegrity: row.integrity });
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).rejects.toThrow(); expect(f.requests).toHaveLength(8);
        } catch (error) {
            if (process.env.ATRIA_RP_FANOUT_DIAGNOSTICS === '1') console.error('RP Fanout original Host diagnostics', {
                modelTimes, effects: f.effects.map(effect => ({ nodeId: effect.proposal.inputRef.nodeId, kind: effect.proposal.inputRef.kind })), elapsedMs: Date.now() - startedAt });
            throw error;
        } finally { release(); await cold?.close(); await f.cleanup(); }
    });

    test('an entry Fanout consumes an unequal pure Agent DAG without mandatory Planner or quality Models', async () => {
        const f = await fixture(make, { withPlanner: false, quality: false });
        let initial;
        const prepare = f.authority.execution.effects.prepare.bind(f.authority.execution.effects);
        f.authority.execution.effects.prepare = async (handle, input) => {
            initial ??= await bankOf(f);
            return prepare(handle, input);
        };
        try {
            const result = await f.run(), root = await rootOf(f);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(5); expect(root.graphRevision).toBe(0);
            expect(root.graph.graphChangePolicy.allowedOperations).toEqual([]);
            expect(root.graph.nodes.some(node => ['planner', 'review', 'judge'].includes(node.kind))).toBe(false);
            const a = bodyText(f.requests.find(body => body.model === 'fanout-branch-a')), b = bodyText(f.requests.find(body => body.model === 'fanout-branch-b'));
            expect(a).toContain('A PRIVATE RUMOR'); expect(a).not.toContain('B PRIVATE RUMOR');
            expect(b).toContain('B PRIVATE RUMOR'); expect(b).not.toContain('A PRIVATE RUMOR');
            const after = bodyText(f.requests.find(body => body.model === 'fanout-after-join'));
            expect(after).toContain('ADVISORY_A2'); expect(after).not.toContain('ADVISORY_B'); expect(after).toContain('reference-only');
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.fanoutCompletions).toHaveLength(1); expect(output.published.plannerCompletions).toEqual([]);
            expect(output.published.reviewCompletions).toEqual([]); expect(output.published.judgeCompletions).toEqual([]);
            expect(output.closure.effectIds).toHaveLength(6); expect(root.outputClaims).toHaveLength(1);
            expect(initial.limits.maxRequests).toBe(5); expect(initial.attempts).toEqual([]); expect(initial.localWork ?? []).toEqual([]); expect(initial.reservations ?? []).toEqual([]);
            const bank = await bankOf(f); expect(bank.limits).toEqual(initial.limits); expect(bank.limits.maxRequests).toBe(5); expect(bank.attempts).toHaveLength(5);
            expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            expect((await f.source.core.observe(f.h.handle, f.source.base.session.sessionId)).revision).toEqual(f.source.base.revision);
        } finally { await f.cleanup(); }
    });

    test('an entry Fanout binds only the original limits and refuses insufficient headroom with zero invented charges', async () => {
        const f = await fixture(make, { withPlanner: false, quality: false, maxRequests: 4 });
        try {
            await expect(f.run()).rejects.toThrow('native_orchestration_rp_graph_budget_unavailable'); expect(f.requests).toEqual([]);
            const bank = await bankOf(f); expect(bank.limits.maxRequests).toBe(4); expect(bank.attempts).toEqual([]);
            expect(bank.localWork ?? []).toEqual([]); expect(bank.reservations ?? []).toEqual([]);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toEqual([]); expect(await bankOf(f)).toEqual(bank);
        } finally { await f.cleanup(); }
    });

    test('one original Scheduler slot retains unknown branch cost through the same Join and quality chain with a completed output and retained estimated charges', async () => {
        const f = await fixture(make, { maxConcurrency: 1, usage: body => body.model !== 'fanout-branch-b' });
        try {
            const result = await f.run(), root = await rootOf(f);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(8); expect(root.outputClaims).toEqual([result.output.outputClaimRef]);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
            const bank = await bankOf(f); expect(bank.attempts).toHaveLength(8);
            expect(bank.attempts.filter(row => row.status === 'unknown')).toHaveLength(1);
            expect(bank.attempts.filter(row => row.status === 'settled')).toHaveLength(7);
            const joinAttempt = await f.h.engine.withTransaction(f.h.handle, async tx => (await Promise.all(root.attemptRefs.map(id => readAttempt(tx, f.h.handle, root, id)))).find(row => row.doc.nodeId === f.nodes.join.nodeId).doc);
            const joined = await f.h.engine.withTransaction(f.h.handle, tx => readRpControlFanoutCompletion(tx, f.h.handle, root, joinAttempt.attemptId));
            expect(joined.frame.maxConcurrency).toBe(1); expect(joined.joinReceipt.outcome).toBe('completed'); expect(joined.providerEffects).toHaveLength(3);
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(8); expect(await bankOf(f)).toEqual(bank);
        } finally { await f.cleanup(); }
    });

    test('the published original bank refuses branch and successor headroom before sending either branch', async () => {
        const f = await fixture(make, { maxRequests: 7 });
        try {
            await expect(f.run()).rejects.toThrow('native_orchestration_planner_patch_rejected'); expect(f.requests).toHaveLength(1);
            const root = await rootOf(f); expect(root.outputClaims).toEqual([]); expect(root.resultRefs).toEqual([]); expect(root.graphRevision).toBe(0);
            const patchId = 'opatch_' + hash({ runId: root.runId, attemptId: f.effects[0].nodeAttemptId }).slice(0, 32);
            const patch = await f.h.engine.withTransaction(f.h.handle, tx => tx.getResource(controlRecordKey(f.h.handle, root.runId, 'patch', patchId)));
            expect(patch.doc.accepted).toBe(false); expect(patch.doc.issues).toEqual([{ code: 'native_orchestration_graph_budget_unavailable' }]);
            const bank = await bankOf(f); expect(bank.attempts).toHaveLength(1); expect(bank.attempts[0].status).toBe('settled');
            expect(bank.localWork.filter(row => row.kind === 'graph_control_adopt')).toHaveLength(1);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(1); expect(await bankOf(f)).toEqual(bank);
        } finally { await f.cleanup(); }
    });

    test.each(['binding', 'cancel'])('real %s withdrawal while both frozen branches are paid blocks every successor and retains the original fees', async change => {
        const f = await fixture(make); let release, changed = false, admitted;
        const both = new Promise(resolve => { release = resolve; });
        f.onResponse(async body => {
            if (!['fanout-branch-a', 'fanout-branch-b'].includes(body.model)) return;
            if (f.requests.filter(item => ['fanout-branch-a', 'fanout-branch-b'].includes(item.model)).length === 2 && !changed) {
                changed = true; admitted = await bankOf(f);
                if (change === 'binding') {
                    const binding = await f.plans.getBinding(f.h.handle, f.sourceSelector);
                    await f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: binding.version });
                } else await f.authority.execution.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(await rootOf(f)), reasonCode: 'controlled_composable_fanout_cancel' });
                release();
            }
            await both;
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(changed).toBe(true); expect(f.requests).toHaveLength(3);
            const root = await rootOf(f); expect(root.outputClaims).toEqual([]); expect(root.resultRefs).toEqual([]); expect(root.cancelRequested).toBe(change === 'cancel');
            const bank = await bankOf(f); expect(bank.attempts).toHaveLength(3); expect(admitted.attempts).toHaveLength(3);
            expect(bank.limits).toEqual(admitted.limits); expect(bank.reservations).toEqual(admitted.reservations);
            for (const row of bank.attempts) {
                const before = admitted.attempts.find(item => item.attemptId === row.attemptId);
                expect(['settled', 'unknown']).toContain(row.status); expect(row).toEqual({ ...before, status: row.status,
                    usage: row.status === 'settled' ? { totalTokens: 20, inputTokens: 12, outputTokens: 8 } : null });
            }
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(3); expect(await bankOf(f)).toEqual(bank);
        } finally { release(); await f.cleanup(); }
    });

});
