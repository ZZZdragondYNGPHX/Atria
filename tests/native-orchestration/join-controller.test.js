import { PlanRepository, validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { RunRepository } from '../../src/native/orchestration/run-repository.js';
import { AttemptController } from '../../src/native/orchestration/attempt-controller.js';
import { JoinController } from '../../src/native/orchestration/join-controller.js';
import { attemptReceiptId } from '../../src/native/orchestration/attempt-settlement.js';
import { controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { createNativeId } from '../../src/native/identity.js';
import { ConflictError } from '../../src/storage/errors.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { planFixture } from './fixtures.js';

const id = kind => createNativeId('orchestration' + kind);
const port = name => ({ name, type: 'task.result', required: false });
const edge = (from, to) => ({ edgeId: id('Edge'), from: { nodeId: from, port: 'next' }, to: { nodeId: to, port: 'in' }, condition: 'always', maxVisits: 10 });

// Controlled original Ports deliberately supply no provider, budget bank,
// persisted ResultEnvelope, scheduler permits or real Audience compilation.
describe.each(CONTRACT_HARNESSES)('$name frozen Join barriers with controlled Ports', ({ make }) => {
    let h, runs, joins, attempts, runId, members, joinAttemptId, fanoutAttemptId, joinId, clock, revoked;
    const originalResults = new Map(), unavailableResults = new Set();
    const current = () => runs.get(h.handle, runId);
    const read = async (type, recordId) => (await h.engine.withTransaction(h.handle, tx => tx.getResource(controlRecordKey(h.handle, runId, type, recordId))))?.doc;
    beforeEach(async () => {
        h = await make(); clock = Date.now(); revoked = false;
        originalResults.clear(); unavailableResults.clear();
    });
    afterEach(async () => { await h?.engine.close(); await h?.cleanup(); });

    async function setup(policy = 'any-success', { quorum = 1, allowPartial = true, freeze = true } = {}) {
        const lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        const authorize = async () => {}, assertWriter = (handle, tx) => lifecycle.assertWriter(handle, tx);
        const plans = new PlanRepository({ engine: h.engine, authorize, assertWriter, validateDependencies: async () => ({ status: 'valid', issues: [], dependencyDigest: hashNativeDocument([]) }) });
        const fixture = planFixture(), output = fixture.definition.nodes[0], fanoutNodeId = id('Node'), joinNodeId = id('Node');
        const branchNodeIds = [id('Node'), id('Node'), id('Node')];
        fixture.definition.nodes = [
            { nodeId: fanoutNodeId, kind: 'fanout', label: 'Fanout', inputs: [], outputs: [port('next')], dependencyPinIds: [], capabilities: [], policy: { maxConcurrency: 2 } },
            ...branchNodeIds.map(nodeId => ({ nodeId, kind: 'wait', label: 'Branch', inputs: [port('in')], outputs: [port('next')], dependencyPinIds: [], capabilities: [], policy: { timeoutMs: 1000 } })),
            { nodeId: joinNodeId, kind: 'join', label: 'Join', inputs: [port('in')], outputs: [port('next')], dependencyPinIds: [], capabilities: [], policy: { strategy: policy, quorum, deadlineMs: 5000 } },
            { ...output, inputs: [port('in')] },
        ];
        fixture.definition.edges = [...branchNodeIds.flatMap(nodeId => [edge(fanoutNodeId, nodeId), edge(nodeId, joinNodeId)]), edge(joinNodeId, output.nodeId)];
        fixture.definition.entryNodeIds = [fanoutNodeId]; fixture.definition.limits.maxSteps = 100;
        fixture.definition.outputContract.allowPartial = allowPartial;
        const plan = await plans.create(h.handle, id('Command'), fixture);
        const expected = { planId: plan.planId, expectedDraftVersion: plan.draftVersion, expectedDefinitionHash: plan.definitionHash };
        const report = await plans.validate(h.handle, expected);
        const { planRef } = await plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) });
        const source = { sourceAuthority: 'controlled-test-port', sourceRef: { sourceId: 'join-test-source' } };
        runs = new RunRepository({ engine: h.engine, authorize, assertWriter, now: () => clock,
            admit: async () => ({ sourceBinding: { ...source, bindingDigest: hashNativeDocument(source) }, budgetAuthorityRef: { authority: 'controlled-test-original-bank' } }) });
        const root = await runs.start(h.handle, id('Command'), { planRef, sourceRequest: {}, retentionPolicyRef: { policyId: 'test-retention' } });
        runId = root.runId;
        attempts = new AttemptController({ runs, authorizeAttempt: async () => {}, verifySettlement: async ({ attempt, resultRefs }) => {
            if (revoked) throw new ConflictError('controlled_source_revoked');
            if (hashNativeDocument(resultRefs) !== hashNativeDocument(originalResults.get(attempt.attemptId) ?? [])) throw new TypeError('Original Result authority has no such results');
        } });
        async function begin(nodeId) {
            return (await runs.beginAttempt(h.handle, id('Command'), { ...runGuard(await current()), nodeId, inputRefs: [], inputDigest: hashNativeDocument([]), effectiveGrantDigest: hashNativeDocument([]), budgetRef: root.budgetAuthorityRef })).attemptId;
        }
        fanoutAttemptId = await begin(fanoutNodeId);
        await attempts.activate(h.handle, { ...runGuard(await current()), attemptId: fanoutAttemptId });
        members = [];
        for (const nodeId of branchNodeIds) members.push(await begin(nodeId));
        joinAttemptId = await begin(joinNodeId);
        joins = new JoinController({ runs, authorizeMembership: async ({ fanout, members: proposed }) => {
            if (hashNativeDocument(proposed.map(member => member.attemptId).sort()) !== hashNativeDocument([...members].sort()) || fanout.attemptId !== fanoutAttemptId) throw new TypeError('Not the complete original fan-out group');
        }, verifyResults: async ({ receipt }) => {
            if (revoked) throw new ConflictError('controlled_source_revoked');
            return { valid: !unavailableResults.has(receipt.nodeAttemptId) && hashNativeDocument(receipt.resultRefs) === hashNativeDocument(originalResults.get(receipt.nodeAttemptId) ?? []) };
        } });
        if (freeze) await freezeJoin();
    }
    async function freezeJoin(override = {}) {
        const input = { ...runGuard(await current()), fanoutAttemptId, nodeAttemptId: joinAttemptId, memberAttemptIds: members, ...override };
        const result = await joins.freeze(h.handle, input);
        joinId = result.outcome.joinBarrier.joinId;
        return { input, result };
    }
    const activate = async index => attempts.activate(h.handle, { ...runGuard(await current()), attemptId: members[index] });
    async function branch(index, outcome = 'completed') {
        const attemptId = members[index];
        if ((await read('attempt', attemptId)).status === 'pending') await activate(index);
        const resultRefs = ['completed', 'partial'].includes(outcome) ? [{ runId, resultId: id('Result') }] : [];
        originalResults.set(attemptId, resultRefs);
        const input = { ...runGuard(await current()), attemptId, outcome, resultRefs, effectReceiptRefs: [], reasonCode: outcome === 'completed' ? null : 'controlled_branch_failure' };
        return { input, result: await attempts.settle(h.handle, input) };
    }
    const settle = async () => joins.settle(h.handle, { ...runGuard(await current()), joinId });

    test('all-success waits for all immutable receipts, then records exact membership/cutoff once', async () => {
        await setup('all-success');
        await branch(0); await branch(1);
        const before = await current();
        await expect(settle()).rejects.toMatchObject({ code: 'native_orchestration_join_not_ready' });
        expect(await current()).toEqual(before);
        await branch(2);
        const result = await settle(), receipt = result.outcome.joinReceipt;
        expect(receipt).toMatchObject({ outcome: 'completed', memberAttemptIds: [...members].sort(), excluded: [] });
        expect(receipt.acceptedResultRefs).toHaveLength(3); expect(receipt.memberReceiptRefs).toHaveLength(3);
        expect(receipt.decisionSeq).toBe(receipt.cutoffSeq + 1);
        expect(await read('join', joinId)).toEqual(receipt);
        expect((await read('receipt', attemptReceiptId(runId, joinAttemptId))).resultRefs).toEqual(receipt.acceptedResultRefs);
        const after = await current();
        expect((await settle()).outcome.joinReceipt).toEqual(receipt);
        expect(await current()).toEqual(after);
    });

    test('all-success never reports completion after one durable failure; unfinished branches remain facts', async () => {
        await setup('all-success'); await branch(0, 'failed');
        const receipt = (await settle()).outcome.joinReceipt;
        expect(receipt).toMatchObject({ outcome: 'failed', acceptedResultRefs: [], reasons: ['join_member_unsuccessful'] });
        expect(receipt.excluded.filter(item => item.reasonCode === 'unsettled_at_cutoff')).toHaveLength(2);
        expect((await read('attempt', members[1])).status).toBe('pending');
    });

    test('all-settled waits for failures too and partial needs the Plan output permission', async () => {
        await setup('all-settled'); await branch(0); await branch(1, 'failed');
        await expect(settle()).rejects.toMatchObject({ code: 'native_orchestration_join_not_ready' });
        await branch(2, 'cancelled');
        expect((await settle()).outcome.joinReceipt).toMatchObject({ outcome: 'partial', acceptedResultRefs: originalResults.get(members[0]) });
    });

    test('a Plan denying partial cannot turn all-settled failures into usable partial output', async () => {
        await setup('all-settled', { allowPartial: false }); await branch(0); await branch(1); await branch(2, 'failed');
        expect((await settle()).outcome.joinReceipt).toMatchObject({ outcome: 'failed', acceptedResultRefs: [] });
    });

    test('any-success uses durable decision order and preserves its receipt after later success', async () => {
        await setup(); await branch(1); await branch(0);
        const receipt = (await settle()).outcome.joinReceipt;
        expect(receipt.acceptedResultRefs).toEqual(originalResults.get(members[1]));
        await branch(2);
        expect((await settle()).outcome.joinReceipt).toEqual(receipt);
        expect(await read('join', joinId)).toEqual(receipt);
        expect(receipt.memberReceiptRefs).not.toContain(attemptReceiptId(runId, members[2]));
    });

    test('count-quorum counts only valid complete results and fails when the remaining count is insufficient', async () => {
        await setup('count-quorum', { quorum: 2 }); await branch(0); await branch(1);
        unavailableResults.add(members[1]);
        await expect(settle()).rejects.toMatchObject({ code: 'native_orchestration_join_not_ready' });
        await branch(2, 'partial');
        expect((await settle()).outcome.joinReceipt).toMatchObject({ outcome: 'failed', acceptedResultRefs: [], reasons: ['join_quorum_unreachable'] });
    });

    test('count-quorum accepts exactly the earliest required successful receipts', async () => {
        await setup('count-quorum', { quorum: 2 }); await branch(2); await branch(0); await branch(1);
        expect((await settle()).outcome.joinReceipt.acceptedResultRefs).toEqual([...originalResults.get(members[2]), ...originalResults.get(members[0])]);
    });

    test('deadline cannot include a result persisted after its frozen deadline, even before settlement', async () => {
        await setup('deadline'); await branch(0); await activate(1);
        await expect(settle()).rejects.toMatchObject({ code: 'native_orchestration_join_not_ready' });
        clock += 5001; await branch(1);
        const receipt = (await settle()).outcome.joinReceipt;
        expect(receipt).toMatchObject({ outcome: 'partial', acceptedResultRefs: originalResults.get(members[0]) });
        expect(receipt.excluded).toContainEqual({ nodeAttemptId: members[1], reasonCode: 'after_deadline' });
        expect(receipt.excluded).toContainEqual({ nodeAttemptId: members[2], reasonCode: 'unsettled_at_cutoff' });
    });

    test('membership is frozen before member dispatch and cannot be replaced or truncated', async () => {
        await setup('any-success', { freeze: false });
        await expect(freezeJoin({ memberAttemptIds: [members[0]] })).rejects.toThrow('complete original fan-out group');
        const { input, result } = await freezeJoin();
        expect((await joins.freeze(h.handle, { ...input, memberAttemptIds: [...members].reverse() })).outcome).toEqual(result.outcome);
        await expect(freezeJoin({ memberAttemptIds: members.slice(0, 2) })).rejects.toMatchObject({ code: 'native_orchestration_command_conflict' });
    });

    test('impossible quorum is rejected without a partial barrier', async () => {
        await setup('count-quorum', { quorum: 4, freeze: false });
        const before = await current(); await expect(freezeJoin()).rejects.toThrow('quorum'); expect(await current()).toEqual(before);
    });

    test('a racing dispatch cannot be silently added to a newly frozen group', async () => {
        await setup('any-success', { freeze: false }); await activate(0);
        const before = await current(); await expect(freezeJoin()).rejects.toMatchObject({ code: 'native_orchestration_join_invalid_membership' }); expect(await current()).toEqual(before);
    });

    test('concurrent settlement and a lost local commit ACK never create a second Join decision', async () => {
        await setup(); await branch(0);
        const input = { ...runGuard(await current()), joinId };
        const execute = h.engine.withTransaction.bind(h.engine); let hide = true;
        h.engine.withTransaction = async (...args) => {
            const result = await execute(...args);
            if (hide && result?.outcome?.joinReceipt) { hide = false; throw new Error('controlled committed ACK loss'); }
            return result;
        };
        await expect(joins.settle(h.handle, input)).rejects.toThrow('committed ACK loss');
        const before = await current();
        const results = await Promise.all([joins.settle(h.handle, input), joins.settle(h.handle, input)]);
        expect(results.every(result => result.replayed)).toBe(true);
        expect(results[0].outcome).toEqual(results[1].outcome); expect(await current()).toEqual(before);
    });

    test('two fresh concurrent settlers return one new decision and one replay', async () => {
        await setup(); await branch(0);
        const input = { ...runGuard(await current()), joinId }, before = await current();
        const results = await Promise.all([joins.settle(h.handle, input), joins.settle(h.handle, input)]);
        expect(results.filter(result => !result.replayed)).toHaveLength(1);
        expect(results.filter(result => result.replayed)).toHaveLength(1);
        expect(results[0].outcome).toEqual(results[1].outcome);
        expect((await current()).eventSeq).toBe(before.eventSeq + 1);
    });

    test('Attempt settlement is idempotent and the ordinary controller cannot finish a Join', async () => {
        await setup(); const { input, result } = await branch(0);
        const before = await current();
        expect((await attempts.settle(h.handle, input)).outcome).toEqual(result.outcome);
        expect(await current()).toEqual(before);
        await expect(attempts.settle(h.handle, { ...input, reasonCode: 'changed_outcome' })).rejects.toMatchObject({ code: 'native_orchestration_command_conflict' });
        await expect(attempts.settle(h.handle, { ...runGuard(await current()), attemptId: joinAttemptId, outcome: 'completed', resultRefs: [], effectReceiptRefs: [], reasonCode: null })).rejects.toMatchObject({ code: 'native_orchestration_attempt_not_settleable' });
    });

    test('a missing durable member receipt fails closed instead of trusting the mutable Attempt status', async () => {
        await setup(); await branch(0);
        await h.engine.withTransaction(h.handle, tx => tx.deleteResource(controlRecordKey(h.handle, runId, 'receipt', attemptReceiptId(runId, members[0]))));
        const before = await current(); await expect(settle()).rejects.toThrow('lacks an immutable receipt');
        expect(await current()).toEqual(before); expect(await read('join', joinId)).toBeUndefined();
    });

    test('restoration recovery cannot reopen old membership or consume old epoch receipts', async () => {
        await setup(); await branch(0);
        const old = await current();
        await h.engine.nativeHostLifecycle.afterRestore(h.handle);
        const recovered = await runs.recover(h.handle, id('Command'), runGuard(old));
        expect(recovered).toMatchObject({ epoch: old.epoch + 1, status: 'blocked' });
        await expect(settle()).rejects.toMatchObject({ code: 'native_orchestration_join_not_admitted' });
        expect(await read('join', joinId)).toBeUndefined();
    });

    test('source revoke, forged results and cancellation do not produce a Join receipt', async () => {
        await setup(); await activate(0);
        await expect(attempts.settle(h.handle, { ...runGuard(await current()), attemptId: members[0], outcome: 'completed', resultRefs: [{ runId, resultId: id('Result') }], effectReceiptRefs: [], reasonCode: null })).rejects.toThrow('no such results');
        await branch(0); revoked = true;
        const before = await current(); await expect(settle()).rejects.toMatchObject({ code: 'controlled_source_revoked' }); expect(await current()).toEqual(before);
        revoked = false; await runs.cancel(h.handle, id('Command'), { ...runGuard(await current()), reasonCode: 'user_cancelled' });
        await expect(settle()).rejects.toMatchObject({ code: 'native_orchestration_join_not_admitted' });
        expect(await read('join', joinId)).toBeUndefined();
    });
});
