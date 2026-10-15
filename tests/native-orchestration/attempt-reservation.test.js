import { PlanRepository, validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { RunRepository } from '../../src/native/orchestration/run-repository.js';
import { AttemptController } from '../../src/native/orchestration/attempt-controller.js';
import { TransitionController } from '../../src/native/orchestration/transition-controller.js';
import { JoinController } from '../../src/native/orchestration/join-controller.js';
import { GraphController, graphPatchHash } from '../../src/native/orchestration/graph-controller.js';
import { controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { attemptReceiptId } from '../../src/native/orchestration/attempt-settlement.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { ConflictError } from '../../src/storage/errors.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { planFixture, prepareControllerOwnerRoot } from './fixtures.js';

const id = kind => createNativeId('orchestration' + kind);
const port = (name, required = false) => ({ name, type: 'task.result', required });
const edge = (from, out, to, input) => ({ edgeId: id('Edge'), from: { nodeId: from, port: out }, to: { nodeId: to, port: input }, condition: 'always', maxVisits: 10, loopBack: false });

// Explicit P2 source/grant/budget/result doubles. A reserved identity is not
// Context admission, a bank reservation, scheduler permission or a send.
describe.each(CONTRACT_HARNESSES)('$name multi-step branch identity reservation', ({ make, name }) => {
    let h, runs, attempts, transitions, joins, patches, runId, plannerId, fanoutId, entryId, finalId, joinId, plannerAttempt, fanoutAttempt, entryAttempt, joinAttempt, incoming, revoked;
    const results = new Map();
    const current = () => runs.get(h.handle, runId);
    const read = async (type, key) => (await h.engine.withTransaction(h.handle, tx => tx.getResource(controlRecordKey(h.handle, runId, type, key))))?.doc;
    beforeEach(async () => {
        h = await make(); await prepareControllerOwnerRoot(h.dirs.root); results.clear(); revoked = false;
        const lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        const authorize = async () => {}, assertWriter = (handle, tx) => lifecycle.assertWriter(handle, tx);
        const plans = new PlanRepository({ engine: h.engine, authorize, assertWriter, validateDependencies: async () => ({ status: 'valid', issues: [], dependencyDigest: hashNativeDocument([]) }) });
        const fixture = planFixture(), output = fixture.definition.nodes[0];
        [plannerId, fanoutId, entryId, finalId, joinId] = Array.from({ length: 5 }, () => id('Node'));
        const wait = (nodeId, inputs) => ({ nodeId, kind: 'wait', label: 'Branch stage', inputs, outputs: [port('next')], dependencyPinIds: [], capabilities: [], policy: { timeoutMs: 1000 } });
        fixture.definition.nodes = [
            { nodeId: plannerId, kind: 'planner', label: 'Planner', inputs: [], outputs: [port('next')], dependencyPinIds: ['route'], capabilities: ['graph.patch'], policy: { agentPinId: 'route' } },
            { nodeId: fanoutId, kind: 'fanout', label: 'Fanout', inputs: [port('in')], outputs: [port('next')], dependencyPinIds: [], capabilities: [], policy: { maxConcurrency: 2 } },
            wait(entryId, [port('in')]), wait(finalId, [port('in', true), port('aux')]),
            { nodeId: joinId, kind: 'join', label: 'Join', inputs: [port('in')], outputs: [port('next')], dependencyPinIds: [], capabilities: [], policy: { strategy: 'all-settled', quorum: 1, deadlineMs: 60000 } },
            { ...output, inputs: [port('in')] },
        ];
        incoming = edge(entryId, 'next', finalId, 'in');
        fixture.definition.edges = [edge(plannerId, 'next', fanoutId, 'in'), edge(fanoutId, 'next', entryId, 'in'), incoming, edge(finalId, 'next', joinId, 'in'), edge(plannerId, 'next', joinId, 'in'), edge(joinId, 'next', output.nodeId, 'in')];
        fixture.definition.entryNodeIds = [plannerId]; fixture.definition.capabilityCeiling = ['graph.patch'];
        fixture.definition.graphChangePolicy = { allowedOperations: ['addEdge', 'cancelPending', 'markBlocked'], allowedNodeKinds: [] };
        Object.assign(fixture.definition.limits, { maxSteps: 100, maxAttempts: 5 });
        fixture.dependencyPins = [{ pinId: 'route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: createNativeId('runtimeRoute') }, integrity: 'a'.repeat(64) }];
        const plan = await plans.create(h.handle, id('Command'), fixture);
        const expected = { planId: plan.planId, expectedDraftVersion: plan.draftVersion, expectedDefinitionHash: plan.definitionHash };
        const report = await plans.validate(h.handle, expected);
        const { planRef } = await plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) });
        const source = { sourceAuthority: 'controlled-test-port', sourceRef: { id: 'multi-stage-source' } };
        runs = new RunRepository({ engine: h.engine, authorize, assertWriter, admit: async () => ({ sourceBinding: { ...source, bindingDigest: hashNativeDocument(source) }, budgetAuthorityRef: { authority: 'controlled-original-bank' } }) });
        runId = (await runs.start(h.handle, id('Command'), { planRef, sourceRequest: {}, retentionPolicyRef: { policyId: 'test-retention' } })).runId;
        attempts = new AttemptController({ runs, authorizeAttempt: async () => {}, authorizeReservation: async ({ target }) => {
            if (revoked || target.nodeId !== finalId) throw new ConflictError('controlled_reservation_scope_denied');
        }, verifySettlement: async ({ attempt, resultRefs }) => {
            if (hashNativeDocument(resultRefs) !== hashNativeDocument(results.get(attempt.attemptId) ?? [])) throw new TypeError('Original test Result proof missing');
        } });
        async function begin(nodeId) {
            const root = await current();
            return (await runs.beginAttempt(h.handle, id('Command'), { ...runGuard(root), nodeId, inputRefs: [], inputDigest: hashNativeDocument([]), effectiveGrantDigest: hashNativeDocument([]), budgetRef: root.budgetAuthorityRef })).attemptId;
        }
        plannerAttempt = await begin(plannerId); fanoutAttempt = await begin(fanoutId); entryAttempt = await begin(entryId); joinAttempt = await begin(joinId);
        for (const attemptId of [plannerAttempt, fanoutAttempt]) await attempts.activate(h.handle, { ...runGuard(await current()), attemptId });
        transitions = new TransitionController({ runs, authorizeTransition: async ({ root, producers, reservedAttempt }) => {
            if (revoked || reservedAttempt?.reservationRef.producerAttemptId !== fanoutAttempt) throw new ConflictError('controlled_prepare_scope_denied');
            const inputRefs = producers.flatMap(item => item.receipt.resultRefs);
            return { inputRefs, inputDigest: hashNativeDocument(inputRefs), effectiveGrantDigest: hashNativeDocument([]), budgetRef: root.budgetAuthorityRef };
        } });
        joins = new JoinController({ runs, authorizeMembership: async () => {}, verifyResults: async () => ({ valid: true }) });
        patches = new GraphController({ runs, authorizePatch: async () => {} });
    });
    afterEach(async () => { await h?.engine.close(); await h?.cleanup(); });
    const reserveInput = async () => ({ ...runGuard(await current()), producerAttemptId: fanoutAttempt, nodeId: finalId });
    const reserve = async () => (await attempts.reserve(h.handle, await reserveInput())).outcome.attemptId;
    async function freeze(attemptId) {
        return (await joins.freeze(h.handle, { ...runGuard(await current()), fanoutAttemptId: fanoutAttempt, nodeAttemptId: joinAttempt, memberAttemptIds: [attemptId] })).outcome.joinBarrier;
    }
    async function complete(attemptId) {
        await attempts.activate(h.handle, { ...runGuard(await current()), attemptId });
        const resultRefs = [{ runId, resultId: id('Result') }]; results.set(attemptId, resultRefs);
        await attempts.settle(h.handle, { ...runGuard(await current()), attemptId, outcome: 'completed', resultRefs, effectReceiptRefs: [], reasonCode: null });
    }
    const prepare = async attemptId => transitions.advance(h.handle, { ...runGuard(await current()), bindings: [{ edgeId: incoming.edgeId, producerAttemptId: entryAttempt }], reservedAttemptId: attemptId });
    async function patch(operations) {
        const root = await current(), proposal = { schemaVersion: 1, patchId: id('Patch'), runId, producerAttemptId: plannerAttempt, expectedEpoch: root.epoch, expectedGraphRevision: root.graphRevision,
            operations, reasonRefs: [{ kind: 'source', bindingDigest: root.sourceBinding.bindingDigest }], payloadHash: '0'.repeat(64) };
        proposal.payloadHash = graphPatchHash(proposal);
        return patches.propose(h.handle, { expectedStateVersion: root.stateVersion, patch: proposal });
    }

    test('freezing membership accepts an unprepared identity without inventing inputs/grant/budget or permitting activation', async () => {
        const attemptId = await reserve(), reserved = await read('attempt', attemptId);
        expect(reserved).toMatchObject({ status: 'reserved', inputState: 'reserved', inputRefs: null, inputDigest: null, effectiveGrantDigest: null, budgetRef: null });
        expect((await freeze(attemptId)).memberAttemptIds).toEqual([attemptId]);
        const before = await current();
        await expect(attempts.activate(h.handle, { ...runGuard(before), attemptId })).rejects.toMatchObject({ code: 'native_orchestration_attempt_not_admitted' });
        await expect(prepare(attemptId)).rejects.toMatchObject({ code: 'native_orchestration_transition_producer_invalid' });
        expect(await current()).toEqual(before);
    });

    test('the actual upstream receipt prepares the same frozen identity once, including when all Attempt slots are reserved', async () => {
        const attemptId = await reserve(), barrier = await freeze(attemptId); await complete(entryAttempt);
        const before = await current(), outcome = (await prepare(attemptId)).outcome;
        expect(before.progress.attempts).toBe(before.limits.maxAttempts);
        expect(outcome.attemptId).toBe(attemptId); expect((await current()).progress.attempts).toBe(before.progress.attempts);
        expect(await read('attempt', attemptId)).toMatchObject({ inputState: 'prepared', status: 'pending', inputRefs: results.get(entryAttempt), reservationRef: { producerAttemptId: fanoutAttempt } });
        const after = await current(); expect((await prepare(attemptId)).outcome).toEqual(outcome); expect(await current()).toEqual(after);
        await complete(attemptId);
        const receipt = (await joins.settle(h.handle, { ...runGuard(await current()), joinId: barrier.joinId })).outcome.joinReceipt;
        expect(receipt).toMatchObject({ outcome: 'completed', memberAttemptIds: [attemptId], acceptedResultRefs: results.get(attemptId) });
    });

    test('reservation replay cannot erase prepared inputs or allocate another control slot', async () => {
        const input = await reserveInput(), first = await attempts.reserve(h.handle, input); await complete(entryAttempt);
        await prepare(first.outcome.attemptId); const before = await current(), doc = await read('attempt', first.outcome.attemptId);
        expect((await attempts.reserve(h.handle, { ...input, ...runGuard(before) })).replayed).toBe(true);
        expect(await current()).toEqual(before); expect(await read('attempt', first.outcome.attemptId)).toEqual(doc);
    });

    test('a legal dependency can be added while reserved, but prepared inputs remain frozen', async () => {
        const attemptId = await reserve(); await freeze(attemptId);
        const added = edge(plannerId, 'next', finalId, 'aux');
        expect((await patch([{ op: 'addEdge', edge: added }])).outcome.patchReceipt.accepted).toBe(true);
        await complete(entryAttempt); await prepare(attemptId);
        const rejected = await patch([{ op: 'addEdge', edge: edge(plannerId, 'next', finalId, 'aux') }]);
        expect(rejected.outcome.patchReceipt).toMatchObject({ accepted: false, issues: [{ code: 'native_orchestration_patch_frozen_input' }] });
    });

    test('cancelling a reserved member appends a cancellation fact with no fabricated Result or bank reference', async () => {
        const attemptId = await reserve(), barrier = await freeze(attemptId);
        expect((await patch([{ op: 'cancelPending', nodeId: finalId }])).outcome.patchReceipt.accepted).toBe(true);
        expect(await read('receipt', attemptReceiptId(runId, attemptId))).toMatchObject({ outcome: 'cancelled', inputState: 'reserved', inputDigest: null, resultRefs: [], effectReceiptRefs: [] });
        expect((await joins.settle(h.handle, { ...runGuard(await current()), joinId: barrier.joinId })).outcome.joinReceipt).toMatchObject({ outcome: 'failed', acceptedResultRefs: [] });
        expect((await read('attempt', attemptId)).budgetRef).toBeNull();
    });

    test('source/grant revalidation failure leaves the reserved inputs empty and the original slot intact', async () => {
        const attemptId = await reserve(); await complete(entryAttempt); const before = await current(); revoked = true;
        await expect(prepare(attemptId)).rejects.toMatchObject({ code: 'controlled_prepare_scope_denied' });
        expect(await current()).toEqual(before); expect((await read('attempt', attemptId)).inputState).toBe('reserved');
    });

    test('only the original fanout scope may reserve; another running role cannot fabricate membership', async () => {
        const before = await current();
        await expect(attempts.reserve(h.handle, { ...await reserveInput(), producerAttemptId: plannerAttempt })).rejects.toMatchObject({ code: 'native_orchestration_reservation_not_admitted' });
        revoked = true; await expect(reserve()).rejects.toMatchObject({ code: 'controlled_reservation_scope_denied' });
        expect(await current()).toEqual(before);
    });

    test('cancelled epochs cannot prepare old reserved members', async () => {
        const attemptId = await reserve(); await complete(entryAttempt);
        await runs.cancel(h.handle, id('Command'), { ...runGuard(await current()), reasonCode: 'user_cancelled' });
        await expect(prepare(attemptId)).rejects.toMatchObject({ code: 'native_orchestration_transition_not_admitted' });
        expect((await read('attempt', attemptId)).inputState).toBe('reserved');
    });

    (name === 'FsEngine' ? test : test.skip)('FS publish fault cannot separate a reserved identity, Root reference and durable command', async () => {
        const input = await reserveInput(), before = await current(); let fired = false;
        h.engine._durabilityFault = stage => { if (stage === 'publish' && !fired) { fired = true; throw new Error('controlled reservation journal fault'); } };
        await expect(attempts.reserve(h.handle, input)).rejects.toThrow('journal fault');
        h.engine._durabilityFault = () => {};
        const replay = await attempts.reserve(h.handle, input), after = await current();
        expect(fired).toBe(true); expect(after.progress.attempts).toBe(before.progress.attempts + 1);
        expect(after.attemptRefs.filter(value => value === replay.outcome.attemptId)).toHaveLength(1);
        expect(await read('attempt', replay.outcome.attemptId)).toMatchObject({ status: 'reserved', inputState: 'reserved', budgetRef: null });
        expect((await attempts.reserve(h.handle, input)).outcome).toEqual(replay.outcome);
    });
});
