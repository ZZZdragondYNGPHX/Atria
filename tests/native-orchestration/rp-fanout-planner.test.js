import { jest } from '@jest/globals';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpComposableFanoutFixture, bodyText } from './helpers/rp-composable-fanout-fixture.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { readRpControlFanoutCompletion } from '../../src/native/orchestration/rp-control-fanout-contracts.js';
import { readAttempt, controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { hashNativeDocument as hash, putMutable } from '../../src/native/repositories/common.js';
import { ContextPort } from '../../src/native/orchestration/context-port.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';

jest.setTimeout(120000);
const setup = (make, options = {}) => rpComposableFanoutFixture(make, { withPlanner: false, quality: false, scopePlanner: true, ...options });
const bankOf = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
const rootOf = f => f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
const joinOf = async (f, root) => f.h.engine.withTransaction(f.h.handle, async tx => {
    const records = await Promise.all(root.attemptRefs.map(id => readAttempt(tx, f.h.handle, root, id)));
    return readRpControlFanoutCompletion(tx, f.h.handle, root, records.find(row => row.doc.nodeId === f.nodes.join.nodeId).doc.attemptId);
});
const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));

describe.each(harnesses)('$name RP frozen Fanout Planner scope', ({ make }) => {
    test('owned Actor Planner controls its frozen Agent before exact Join and one Narrator with cold receipts', async () => {
        const f = await setup(make); let cold;
        try {
            const result = await f.run(), root = await rootOf(f), group = await joinOf(f, root);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(5);
            expect(f.requests.filter(body => body.model === 'fanout-branch-a')).toHaveLength(1);
            expect(root.graphRevision).toBe(1); expect(root.progress.patches).toBe(1);
            expect(root.nodeControl[f.nodes.a2.nodeId].priority).toBe(2);
            const planner = bodyText(f.requests.find(body => body.model === 'fanout-branch-a'));
            const a = bodyText(f.requests.find(body => body.model === 'fanout-branch-a-next'));
            const b = bodyText(f.requests.find(body => body.model === 'fanout-branch-b'));
            expect(planner).toContain('A PRIVATE RUMOR'); expect(planner).not.toContain('B PRIVATE RUMOR'); expect(planner).not.toContain('NARRATOR ONLY MEMORY');
            expect(a).toContain('A PRIVATE RUMOR'); expect(a).not.toContain('B PRIVATE RUMOR'); expect(a).toContain('graph_planner_control'); expect(a).toContain('setPendingPriority');
            expect(b).toContain('B PRIVATE RUMOR'); expect(b).not.toContain('A PRIVATE RUMOR'); expect(b).not.toContain('setPendingPriority');
            const after = bodyText(f.requests.find(body => body.model === 'fanout-after-join'));
            expect(after).toContain('ADVISORY_A2'); expect(after).not.toContain('ADVISORY_B'); expect(after).toContain('reference-only');
            expect(group.frame.graphRevision).toBe(0); expect(group.barrier.graphRevision).toBe(0);
            expect(group.joinReceipt).toMatchObject({ graphRevision: 0, outcome: 'completed', excluded: [] });
            expect(group.joinReceipt.acceptedResultRefs).toHaveLength(2); expect(group.providerEffects).toHaveLength(3);
            const p = group.scopeAttempts.find(item => item.attempt.nodeId === f.nodes.a.nodeId);
            const next = group.scopeAttempts.find(item => item.attempt.nodeId === f.nodes.a2.nodeId);
            expect(p.attempt.resultRefs).toEqual([]); expect(p.attempt.graphRevision).toBe(0);
            expect(next.attempt.graphRevision).toBe(1); expect(next.attempt.reservationRef).not.toBeNull();
            const bank = await bankOf(f); expect(bank.limits.maxRequests).toBe(5); expect(bank.attempts).toHaveLength(5);
            expect(bank.attempts.every(row => row.status === 'settled')).toBe(true); expect(bank.localWork.every(row => row.status === 'settled')).toBe(true);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(output.published.plannerCompletions).toHaveLength(1); expect(output.published.fanoutCompletions).toHaveLength(1);
            expect(output.closure.effectIds).toHaveLength(6); expect(root.outputClaims).toHaveLength(1);
            expect(root.resultRefs).toHaveLength(4);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
            expect((await f.source.core.observe(f.h.handle, f.source.base.session.sessionId)).revision).toEqual(f.source.base.revision);
            await f.chats.delete(f.h.handle, f.locator.charDir, f.locator.name); await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            expect((await cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).claim).toEqual(output.claim);
            await cold.withTransaction(f.h.handle, async tx => {
                const rows = await tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: root.runId, recordType: 'receipt' });
                const reservation = rows.find(row => row.doc.receiptKind === 'attempt_reservation' && row.doc.nodeAttemptId === next.attempt.attemptId);
                expect(reservation.doc.graphRevision).toBe(0);
                await putMutable(tx, reservation.key, { ...reservation.doc, graphRevision: 1 }, { expectedIntegrity: reservation.integrity });
            });
            await expect(cold.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root))).rejects.toThrow(); expect(f.requests).toHaveLength(5);
        } finally { await cold?.close(); await f.cleanup(); }
    });

    test('one Scheduler slot cancels unstarted sibling scope after its declared Planner branch wins the Join', async () => {
        const f = await setup(make, { maxConcurrency: 1, joinStrategy: 'any-success' });
        try {
            const result = await f.run(), root = await rootOf(f), group = await joinOf(f, root);
            expect(result.output.runStatus).toBe('completed'); expect(f.requests).toHaveLength(4);
            expect(f.requests.some(body => body.model === 'fanout-branch-b')).toBe(false);
            expect(group.frame.maxConcurrency).toBe(1); expect(group.joinReceipt).toMatchObject({ policy: 'any-success', outcome: 'completed' });
            expect(group.joinReceipt.acceptedResultRefs).toHaveLength(1);
            const skipped = group.scopeAttempts.find(item => item.attempt.nodeId === f.nodes.b.nodeId);
            expect(skipped.attempt).toMatchObject({ status: 'cancelled', effectRefs: [], resultRefs: [] });
            expect(skipped.completed.reasonCode).toBe('join_member_excluded');
            const bank = await bankOf(f); expect(bank.attempts).toHaveLength(4); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            expect(root.outputClaims).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('unknown scope Planner cost remains charged through Join without refund or replay', async () => {
        const f = await setup(make, { usage: body => body.model !== 'fanout-branch-a' });
        try {
            const result = await f.run(), root = await rootOf(f), group = await joinOf(f, root);
            expect(result.output.runStatus).toBe('pending_output'); expect(f.requests).toHaveLength(5); expect(root.outputClaims).toEqual([]);
            expect(group.joinReceipt.outcome).toBe('completed'); expect(group.providerEffects).toHaveLength(3);
            const bank = await bankOf(f); expect(bank.attempts).toHaveLength(5);
            expect(bank.attempts.filter(row => row.status === 'unknown')).toHaveLength(1); expect(bank.attempts.filter(row => row.status === 'settled')).toHaveLength(4);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(5); expect(await bankOf(f)).toEqual(bank);
        } finally { await f.cleanup(); }
    });

    test('Actor Source withdrawal after accepted scope control blocks its Agent and queued sibling while retaining the paid Planner', async () => {
        const f = await setup(make, { maxConcurrency: 1 }), compile = ContextPort.prototype.compile; let revoked = false;
        const spy = jest.spyOn(ContextPort.prototype, 'compile').mockImplementation(async function (handle, request, ...rest) {
            const result = await compile.call(this, handle, request, ...rest);
            if (request.inputRefs[0]?.nodeId === f.nodes.a2.nodeId && !revoked) {
                revoked = true;
                await f.source.core.applyLifecycleCommand(handle, f.source.base.session.sessionId, { type: 'lifecycle', invocationId: 'withdraw-scope-actor',
                    action: { kind: 'app.command', domainId: 'availability', recordId: 'main', commandId: 'save', args: { available: false } } },
                { expectedRevisionId: f.source.base.revision.revisionId });
            }
            return result;
        });
        try {
            await expect(f.run()).rejects.toThrow(); expect(revoked).toBe(true); expect(f.requests).toHaveLength(1);
            const root = await rootOf(f); expect(root.graphRevision).toBe(1); expect(root.resultRefs).toEqual([]); expect(root.outputClaims).toEqual([]);
            expect(root.status).toBe('reconciling'); expect(root.pendingEffectRefs).toHaveLength(1);
            const bank = await bankOf(f); expect(bank.attempts).toHaveLength(1); expect(bank.attempts[0].status).toBe('settled');
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(2);
        } finally { spy.mockRestore(); await f.cleanup(); }
    });

    test('a paid scope Planner cannot reprioritize another frozen branch', async () => {
        const f = await setup(make, { maxConcurrency: 1, scopeResponse: nodes => [{ op: 'setPendingPriority', nodeId: nodes.b.nodeId, priority: 7 }] });
        try {
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
            const root = await rootOf(f); expect(root.graphRevision).toBe(0); expect(root.resultRefs).toEqual([]); expect(root.outputClaims).toEqual([]);
            expect(root.nodeControl[f.nodes.b.nodeId].priority).toBe(0); expect(root.status).toBe('blocked');
            const patchId = 'opatch_' + hash({ runId: root.runId, attemptId: f.effects[0].nodeAttemptId }).slice(0, 32);
            const patch = await f.h.engine.withTransaction(f.h.handle, tx => tx.getResource(controlRecordKey(f.h.handle, root.runId, 'patch', patchId)));
            expect(patch.doc).toMatchObject({ accepted: false, issues: [{ code: 'native_orchestration_patch_denied' }] });
            const bank = await bankOf(f); expect(bank.attempts).toHaveLength(1); expect(bank.attempts[0].status).toBe('settled');
            expect(bank.localWork.filter(row => row.kind === 'graph_control_adopt')).toHaveLength(1);
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(1); expect(await bankOf(f)).toEqual(bank);
        } finally { await f.cleanup(); }
    });
});
