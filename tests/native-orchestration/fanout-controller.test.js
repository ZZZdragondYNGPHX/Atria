import { PlanRepository, validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { RunRepository } from '../../src/native/orchestration/run-repository.js';
import { AttemptController } from '../../src/native/orchestration/attempt-controller.js';
import { TransitionController } from '../../src/native/orchestration/transition-controller.js';
import { JoinController } from '../../src/native/orchestration/join-controller.js';
import { EffectController } from '../../src/native/orchestration/effect-controller.js';
import { FanoutController, fanoutFrameId } from '../../src/native/orchestration/fanout-controller.js';
import { controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { createNativeId } from '../../src/native/identity.js';
import { ConflictError } from '../../src/storage/errors.js';
import { assertPlanDefinition } from '../../public/shared/native-orchestration-contracts.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { planFixture, prepareControllerOwnerRoot } from './fixtures.js';

const id = kind => createNativeId('orchestration' + kind);
const port = name => ({ name, type: 'task.result', required: false });
const edge = (from, to) => ({ edgeId: id('Edge'), from: { nodeId: from, port: 'next' }, to: { nodeId: to, port: 'in' }, condition: 'always', maxVisits: 10, loopBack: false });

// P2 doubles prove durable group/control decisions, not real Scheduler
// permits, Context grants, bank allocation, Provider effects or Result data.
describe.each(CONTRACT_HARNESSES)('$name explicit Fanout control frames', ({ make }) => {
    let h, runs, attempts, groups, transitions, joins, runId, fanout, entries, final, joinAttempt, nodes, branches, revoked;
    const current = () => runs.get(h.handle, runId);
    const read = async (type, recordId) => h.engine.withTransaction(h.handle, tx => tx.getResource(controlRecordKey(h.handle, runId, type, recordId)));
    beforeEach(async () => { h = await make(); await prepareControllerOwnerRoot(h.dirs.root); revoked = false; });
    afterEach(async () => { await h?.engine.close(); await h?.cleanup(); });
    async function setup({ failurePolicy = 'continue', maxEdgeVisits = 30, nested = false, withEffect = false, maxConcurrency = 10, joinStrategy = 'all-success' } = {}) {
        const lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        const authorize = async () => {}, assertWriter = (handle, tx) => lifecycle.assertWriter(handle, tx);
        const plans = new PlanRepository({ engine: h.engine, authorize, assertWriter, validateDependencies: async () => ({ status: 'valid', issues: [], dependencyDigest: hashNativeDocument([]) }) });
        const fixture = planFixture(), output = fixture.definition.nodes[0];
        nodes = { fanout: id('Node'), entry: id('Node'), middle: id('Node'), final: id('Node'), other: id('Node'), join: id('Node') };
        const wait = nodeId => ({ nodeId, kind: 'wait', label: 'Stage', inputs: [port('in')], outputs: [port('next')], dependencyPinIds: [], capabilities: [], policy: { timeoutMs: 1000 } });
        fixture.definition.nodes = [
            { nodeId: nodes.fanout, kind: 'fanout', label: 'Fanout', inputs: [], outputs: [port('next')], dependencyPinIds: [], capabilities: [], policy: { maxConcurrency: 1, failurePolicy } },
            ...[nodes.entry, nodes.middle, nodes.final, nodes.other].map(wait),
            { nodeId: nodes.join, kind: 'join', label: 'Join', inputs: [port('in')], outputs: [port('next')], dependencyPinIds: [], capabilities: [], policy: { strategy: joinStrategy, quorum: 1, deadlineMs: 10000 } },
            { ...output, inputs: [port('in')] },
        ];
        if (nested) {
            const middle = fixture.definition.nodes.find(node => node.nodeId === nodes.middle);
            middle.kind = 'fanout'; middle.policy = { maxConcurrency: 1, failurePolicy: 'continue' };
        }
        if (withEffect) {
            const other = fixture.definition.nodes.find(node => node.nodeId === nodes.other);
            Object.assign(other, { kind: 'agent', dependencyPinIds: ['route'], capabilities: ['test.effect'], policy: { agentPinId: 'route' } });
            fixture.definition.nodes[0].policy.maxConcurrency = 2;
            fixture.definition.capabilityCeiling = ['test.effect'];
            fixture.dependencyPins = [{ pinId: 'route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: createNativeId('runtimeRoute') }, integrity: 'a'.repeat(64) }];
        }
        fixture.definition.edges = [edge(nodes.fanout, nodes.entry), edge(nodes.fanout, nodes.other), edge(nodes.entry, nodes.middle), edge(nodes.middle, nodes.final), edge(nodes.final, nodes.join), edge(nodes.other, nodes.join), edge(nodes.join, output.nodeId)];
        fixture.definition.entryNodeIds = [nodes.fanout];
        Object.assign(fixture.definition.limits, { maxSteps: 100, maxAttempts: 20, maxEdgeVisits, maxConcurrency });
        for (const edge of fixture.definition.edges) edge.maxVisits = Math.min(10, maxEdgeVisits);
        const plan = await plans.create(h.handle, id('Command'), fixture);
        const expected = { planId: plan.planId, expectedDraftVersion: plan.draftVersion, expectedDefinitionHash: plan.definitionHash };
        const report = await plans.validate(h.handle, expected);
        const { planRef } = await plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) });
        const source = { sourceAuthority: 'controlled-test-source', sourceRef: { id: 'fanout-source' } };
        runs = new RunRepository({ engine: h.engine, authorize, assertWriter, admit: async () => ({ sourceBinding: { ...source, bindingDigest: hashNativeDocument(source) }, budgetAuthorityRef: { authority: 'controlled-bank' } }) });
        runId = (await runs.start(h.handle, id('Command'), { planRef, sourceRequest: {}, retentionPolicyRef: { policyId: 'test-retention' } })).runId;
        attempts = new AttemptController({ runs, authorizeAttempt: async () => {}, authorizeReservation: async () => {}, verifySettlement: async () => {} });
        groups = new FanoutController({ runs, authorizeGroup: async () => { if (revoked) throw new ConflictError('controlled_source_revoked'); } });
        transitions = new TransitionController({ runs, authorizeTransition: async ({ root, producers }) => {
            const inputRefs = producers.flatMap(producer => producer.receipt.resultRefs);
            return { inputRefs, inputDigest: hashNativeDocument(inputRefs), effectiveGrantDigest: hashNativeDocument([]), budgetRef: root.budgetAuthorityRef };
        } });
        joins = new JoinController({ runs, authorizeMembership: async () => {}, verifyResults: async () => ({ valid: true }) });
        async function begin(nodeId) {
            const root = await current();
            return (await runs.beginAttempt(h.handle, id('Command'), { ...runGuard(root), nodeId, inputRefs: [], inputDigest: hashNativeDocument([]), effectiveGrantDigest: hashNativeDocument([]), budgetRef: root.budgetAuthorityRef })).attemptId;
        }
        fanout = await begin(nodes.fanout); await activate(fanout);
        entries = [await begin(nodes.entry), await begin(nodes.other)]; joinAttempt = await begin(nodes.join);
        final = nested ? await begin(nodes.final) : (await attempts.reserve(h.handle, { ...runGuard(await current()), producerAttemptId: fanout, nodeId: nodes.final })).outcome.attemptId;
        branches = [{ entryAttemptId: entries[0], memberAttemptIds: [final], scopeNodeIds: [nodes.entry, nodes.middle, nodes.final] },
            { entryAttemptId: entries[1], memberAttemptIds: [entries[1]], scopeNodeIds: [nodes.other] }];
    }
    const activate = async attemptId => attempts.activate(h.handle, { ...runGuard(await current()), attemptId });
    const freeze = async (proposed = branches) => groups.freeze(h.handle, { ...runGuard(await current()), fanoutAttemptId: fanout, branches: proposed });
    const settle = async (attemptId, outcome = 'completed') => attempts.settle(h.handle, { ...runGuard(await current()), attemptId, outcome, resultRefs: [], effectReceiptRefs: [], reasonCode: outcome === 'completed' ? null : 'controlled_failure' });
    async function advance(producerAttemptId, from, to, reservedAttemptId = null) {
        const root = await current(), dependency = root.graph.edges.find(edge => edge.from.nodeId === from && edge.to.nodeId === to);
        return (await transitions.advance(h.handle, { ...runGuard(root), bindings: [{ edgeId: dependency.edgeId, producerAttemptId }], reservedAttemptId })).outcome.attemptId;
    }

    test('freezes exact prepared entries and reserved finals with one atomic set of outgoing admissions', async () => {
        await setup(); const before = await current(), result = await freeze(), frame = result.outcome.fanoutFrame;
        expect(frame).toMatchObject({ failurePolicy: 'continue', maxConcurrency: 1, fanoutAttemptId: fanout });
        expect(frame.edgeAdmissionRefs).toHaveLength(2); expect((await current()).progress.edgeVisits).toBe(before.progress.edgeVisits + 2);
        expect((await read('attempt', final)).doc).toMatchObject({ inputState: 'reserved', budgetRef: null });
        const after = await current(); expect((await freeze([...branches].reverse())).replayed).toBe(true); expect(await current()).toEqual(after);
        const barrier = (await joins.freeze(h.handle, { ...runGuard(after), fanoutAttemptId: fanout, nodeAttemptId: joinAttempt, memberAttemptIds: [final, entries[1]] })).outcome.joinBarrier;
        expect(barrier.fanoutFrameRef).toEqual({ receiptId: frame.receiptId, integrity: hashNativeDocument(frame) });
    });

    test('omitted branches, out-of-scope finals and duplicate entries leave no frame or costs', async () => {
        await setup(); const before = await current();
        await expect(freeze([branches[0]])).rejects.toThrow('omits');
        await expect(freeze([{ ...branches[0], scopeNodeIds: [nodes.entry] }, branches[1]])).rejects.toThrow('outside');
        await expect(freeze([branches[0], branches[0]])).rejects.toThrow();
        expect(await current()).toEqual(before); expect(await read('receipt', fanoutFrameId(runId, fanout))).toBeNull();
    });

    test('frozen policy rejects unbounded failure modes and effect-bearing passive controls', async () => {
        await setup(); const { graph } = await current();
        graph.nodes[0].policy.failurePolicy = 'retry_forever'; expect(() => assertPlanDefinition(graph, [])).toThrow('failurePolicy');
        graph.nodes[0].policy.failurePolicy = 'continue'; graph.nodes[0].capabilities.push('test.effect'); graph.capabilityCeiling.push('test.effect');
        expect(() => assertPlanDefinition(graph, [])).toThrow('cannot execute effects');
    });

    test('changed scope after freeze conflicts and a hidden commit ACK replays the original frame once', async () => {
        await setup(); const control = runs.control.bind(runs); let hidden = false;
        runs.control = async (...args) => {
            const result = await control(...args);
            if (!hidden && args[2].operation === 'fanout.freeze') { hidden = true; throw new Error('controlled ACK hidden after commit'); }
            return result;
        };
        await expect(freeze()).rejects.toThrow('ACK hidden'); const committed = await current();
        const replay = await freeze(); expect(replay.replayed).toBe(true); expect(replay.outcome.fanoutFrame.edgeAdmissionRefs).toHaveLength(2);
        expect(await current()).toEqual(committed);
        await expect(freeze([{ ...branches[0], scopeNodeIds: [...branches[0].scopeNodeIds, nodes.other] }, branches[1]])).rejects.toMatchObject({ code: 'native_orchestration_command_conflict' });
        expect(await current()).toEqual(committed);
    });

    test('source revoke and exhausted edge ceiling cannot publish a partial frame or membership', async () => {
        await setup({ maxEdgeVisits: 1 }); const before = await current();
        revoked = true; await expect(freeze()).rejects.toMatchObject({ code: 'controlled_source_revoked' });
        revoked = false; await expect(freeze()).rejects.toMatchObject({ code: 'native_orchestration_limit_exhausted' });
        expect(await current()).toEqual(before); expect(await read('receipt', fanoutFrameId(runId, fanout))).toBeNull();
        await activate(entries[0]); // no staged membership survived the rejected transaction
    });

    test('group concurrency is checked atomically and completed work releases only its logical slot', async () => {
        await setup(); await freeze(); await activate(entries[0]);
        await expect(activate(entries[1])).rejects.toMatchObject({ code: 'native_orchestration_fanout_concurrency_exhausted' });
        await settle(entries[0]); await activate(entries[1]); expect((await read('attempt', entries[1])).doc.status).toBe('running');
    });

    test('a single parent concurrency slot still permits passive Fanout bookkeeping and one executable branch', async () => {
        await setup({ maxConcurrency: 1 }); expect((await freeze()).outcome.fanoutFrame.maxConcurrency).toBe(1);
        await activate(entries[0]);
        await expect(activate(entries[1])).rejects.toMatchObject({ code: 'native_orchestration_limit_exhausted' });
    });

    test.each([false, true])('Join exclusion cancels an unsent nonterminal only when every shared scope is excluded=%s', async overlapping => {
        await setup({ joinStrategy: 'any-success' });
        if (overlapping) branches[1].scopeNodeIds.push(nodes.entry);
        await freeze();
        const frozen = await joins.freeze(h.handle, { ...runGuard(await current()), fanoutAttemptId: fanout, nodeAttemptId: joinAttempt,
            memberAttemptIds: [final, entries[1]] });
        await activate(entries[1]); await settle(entries[1]);
        const decided = await joins.settle(h.handle, { ...runGuard(await current()), joinId: frozen.outcome.joinBarrier.joinId });
        expect(decided.outcome.joinReceipt.excluded.map(item => item.nodeAttemptId)).toContain(final);
        attempts.authorizePendingCancellation = async () => {};
        const cancel = async () => attempts.cancelPending(h.handle, { ...runGuard(await current()),
            fanoutAttemptId: fanout, failedAttemptId: null, joinId: decided.outcome.joinReceipt.joinId, attemptId: entries[0] });
        const result = await cancel().then(value => ({ value }), error => ({ error }));
        expect(result.error?.code ?? null).toBe(overlapping ? 'native_orchestration_fanout_cancellation_denied' : null);
        expect(result.value?.outcome.attemptReceipt.outcome ?? null).toBe(overlapping ? null : 'cancelled');
        expect(result.value?.outcome.attemptReceipt.reasonCode ?? null).toBe(overlapping ? null : 'join_member_excluded');
        expect((await read('attempt', entries[0])).doc.status).toBe(overlapping ? 'pending' : 'cancelled');
        expect((await read('attempt', entries[0])).doc.effectRefs).toEqual([]);
    });

    test('membership follows multi-step dependencies without allocating a second queue or losing its ceiling', async () => {
        await setup(); await freeze(); await activate(entries[0]); await settle(entries[0]);
        const middle = await advance(entries[0], nodes.entry, nodes.middle);
        await activate(middle);
        await expect(activate(entries[1])).rejects.toMatchObject({ code: 'native_orchestration_fanout_concurrency_exhausted' });
        await settle(middle); expect(await advance(middle, nodes.middle, nodes.final, final)).toBe(final);
        await activate(final);
        await expect(activate(entries[1])).rejects.toMatchObject({ code: 'native_orchestration_fanout_concurrency_exhausted' });
    });

    test('fail_fast stops further admission after durable intermediate failure without erasing that failure', async () => {
        await setup({ failurePolicy: 'fail_fast' }); await freeze(); await activate(entries[0]); await settle(entries[0]);
        const middle = await advance(entries[0], nodes.entry, nodes.middle); await activate(middle); await settle(middle, 'failed');
        const before = await current(); await expect(activate(entries[1])).rejects.toMatchObject({ code: 'native_orchestration_fanout_fail_fast' });
        expect(await current()).toEqual(before); expect((await read('attempt', middle)).doc.status).toBe('failed');
        expect((await read('attempt', entries[1])).doc.status).toBe('pending');
    });

    test('continue policy preserves failures while admitting another frozen branch', async () => {
        await setup(); await freeze(); await activate(entries[0]); await settle(entries[0], 'failed');
        await activate(entries[1]); expect((await read('attempt', entries[0])).doc.status).toBe('failed');
    });

    test('fail_fast also stops an already-ready sibling Effect claim and preserves its original budget identity', async () => {
        await setup({ failurePolicy: 'fail_fast', withEffect: true }); await freeze(); await activate(entries[0]); await activate(entries[1]);
        const effects = new EffectController({ runs, authorizeEffect: async ({ proposal, intent }) => {
            const value = proposal ?? intent;
            return { actionRef: value.actionRef, targetRef: value.targetRef, inputRef: value.inputRef, inputHash: value.inputHash,
                capability: 'test.effect', endpointBindingDigest: hashNativeDocument('endpoint'), grantDigest: hashNativeDocument('grant'),
                risk: 'R1', requiresApproval: false, egressDigest: hashNativeDocument('egress'), budgetEnvelopeDigest: hashNativeDocument('budget'),
                dispatchPolicy: { idempotency: 'none', operationKey: null, reconcile: 'manual' } };
        }, verifyBudgetAttempt: async () => {}, verifyObservation: async () => {}, verifyApproval: async () => {} });
        const effectId = id('Effect'), proposal = { actionRef: { id: 'test-action' }, targetRef: { id: 'test-target' }, inputRef: { id: 'test-input' }, inputHash: hashNativeDocument('test-input') };
        await effects.prepare(h.handle, { ...runGuard(await current()), effectId, nodeAttemptId: entries[1], proposal });
        const budgetAttemptRef = { authority: 'controlled-bank', effectId };
        await effects.ready(h.handle, { ...runGuard(await current()), effectId, budgetAttemptRef });
        await settle(entries[0], 'failed'); const before = await current();
        await expect(effects.claim(h.handle, { ...runGuard(before), effectId })).rejects.toMatchObject({ code: 'native_orchestration_fanout_fail_fast' });
        expect((await read('effect', effectId)).doc).toMatchObject({ status: 'ready', dispatchToken: null, budgetAttemptRef });
        expect(await current()).toEqual(before);
    });

    test('nested frames share outer resource ceilings without deadlocking on passive fanout control', async () => {
        await setup({ nested: true }); await freeze(); await activate(entries[0]); await settle(entries[0]);
        const inner = await advance(entries[0], nodes.entry, nodes.middle); await activate(inner);
        await expect(advance(inner, nodes.middle, nodes.final, final)).rejects.toMatchObject({ code: 'native_orchestration_transition_producer_invalid' });
        // This nested fixture's entry already has an original-Port prepared
        // snapshot; no terminal producer Result or reservation is invented.
        await groups.freeze(h.handle, { ...runGuard(await current()), fanoutAttemptId: inner,
            branches: [{ entryAttemptId: final, memberAttemptIds: [final], scopeNodeIds: [nodes.final] }] });
        await activate(final); await expect(activate(entries[1])).rejects.toMatchObject({ code: 'native_orchestration_fanout_concurrency_exhausted' });
        await settle(final); await activate(entries[1]);
    });

    test('frozen frame membership prevents a permissive Join Port from truncating its barrier', async () => {
        await setup(); await freeze(); const before = await current();
        await expect(joins.freeze(h.handle, { ...runGuard(before), fanoutAttemptId: fanout, nodeAttemptId: joinAttempt, memberAttemptIds: [final] })).rejects.toMatchObject({ code: 'native_orchestration_join_invalid_membership' });
        expect(await current()).toEqual(before);
    });

    test('a racing activation cannot be retrospectively included in a new frame', async () => {
        await setup(); await activate(entries[0]); const before = await current();
        await expect(freeze()).rejects.toMatchObject({ code: 'native_orchestration_fanout_invalid_membership' }); expect(await current()).toEqual(before);
    });

    test('cancellation invalidates old-epoch work admitted under a frozen frame', async () => {
        await setup(); await freeze();
        await runs.cancel(h.handle, id('Command'), { ...runGuard(await current()), reasonCode: 'user_cancel' });
        await expect(activate(entries[0])).rejects.toMatchObject({ code: 'native_orchestration_attempt_not_admitted' });
    });
});
