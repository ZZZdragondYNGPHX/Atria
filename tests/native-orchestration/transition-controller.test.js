import { assertPlanDefinition } from '../../public/shared/native-orchestration-contracts.js';
import { PlanRepository, validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { RunRepository } from '../../src/native/orchestration/run-repository.js';
import { AttemptController } from '../../src/native/orchestration/attempt-controller.js';
import { TransitionController } from '../../src/native/orchestration/transition-controller.js';
import { controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { ConflictError } from '../../src/storage/errors.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { planFixture, prepareControllerOwnerRoot } from './fixtures.js';

const id = kind => createNativeId('orchestration' + kind);
const port = (name, required = false) => ({ name, type: 'task.result', required });
function loopFixture({ multipleInputs = false, edgeLimit = 8, loopLimit = 2, condition = 'always' } = {}) {
    const fixture = planFixture(), output = fixture.definition.nodes[0], a = id('Node'), b = id('Node'), c = id('Node');
    const wait = (nodeId, inputs) => ({ nodeId, kind: 'wait', label: 'Bounded task', inputs, outputs: [port('next')], dependencyPinIds: [], capabilities: [], policy: { timeoutMs: 1000 } });
    const edge = (from, to, input, loopBack = false, when = 'always') => ({ edgeId: id('Edge'), from: { nodeId: from, port: 'next' }, to: { nodeId: to, port: input }, condition: when, maxVisits: edgeLimit, loopBack });
    const forward = edge(a, b, 'in', false, condition), back = edge(b, a, 'feedback', true), exit = edge(b, output.nodeId, 'body');
    fixture.definition.nodes = [wait(a, [port('feedback')]), wait(b, [port('in', true), ...(multipleInputs ? [port('aux', true)] : [])]),
        ...(multipleInputs ? [wait(c, [port('in', true)])] : []), { ...output, inputs: [port('body', true)] }];
    const split = edge(a, c, 'in'), extra = edge(c, b, 'aux');
    fixture.definition.edges = [forward, back, exit, ...(multipleInputs ? [split, extra] : [])];
    fixture.definition.entryNodeIds = [a];
    Object.assign(fixture.definition.limits, { maxSteps: 100, maxAttempts: 100, maxEdgeVisits: 100, maxLoopIterations: loopLimit });
    return { fixture, a, b, c, forward, back, exit, split, extra };
}

test('bounded graph validation requires explicit loop-back coverage and a forward path for every declared return', () => {
    const { fixture, back, forward } = loopFixture();
    expect(() => assertPlanDefinition(fixture.definition, [])).not.toThrow();
    back.loopBack = false;
    expect(() => assertPlanDefinition(fixture.definition, [])).toThrow('explicit loop-back');
    back.loopBack = true; fixture.definition.limits.maxLoopIterations = 0;
    expect(() => assertPlanDefinition(fixture.definition, [])).toThrow('iteration limit');
    fixture.definition.limits.maxLoopIterations = 2; forward.loopBack = true;
    expect(() => assertPlanDefinition(fixture.definition, [])).toThrow('forward path');
});

test('publication rejects a deadline Join when the Plan denies partial output', () => {
    const { fixture } = loopFixture();
    fixture.definition.nodes[0].kind = 'join';
    fixture.definition.nodes[0].policy = { strategy: 'deadline', quorum: 1, deadlineMs: 1000 };
    expect(() => assertPlanDefinition(fixture.definition, [])).toThrow('partial output permission');
});

// Pure P2 original-Port doubles; no Result payload authority, scheduler,
// bank allocation, model or network dispatch is implemented by this fixture.
describe.each(CONTRACT_HARNESSES)('$name durable bounded graph transitions', ({ make }) => {
    let h, runs, transitions, attempts, graph, runId, initial, clock, revoked, malformed;
    const originalResults = new Map();
    const current = () => runs.get(h.handle, runId);
    const binding = (edge, producerAttemptId) => ({ edgeId: edge.edgeId, producerAttemptId });
    const advance = async bindings => transitions.advance(h.handle, { ...runGuard(await current()), bindings });
    beforeEach(async () => { h = await make(); clock = Date.now(); revoked = false; malformed = false; originalResults.clear(); });
    afterEach(async () => { await h?.engine.close(); await h?.cleanup(); });

    async function setup(options = {}) {
        graph = loopFixture(options);
        await prepareControllerOwnerRoot(h.dirs.root);
        if (options.entryAtB) graph.fixture.definition.entryNodeIds = [graph.b];
        if (options.maxAttempts !== undefined) graph.fixture.definition.limits.maxAttempts = options.maxAttempts;
        const lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        const authorize = async () => {}, assertWriter = (handle, tx) => lifecycle.assertWriter(handle, tx);
        const plans = new PlanRepository({ engine: h.engine, authorize, assertWriter,
            validateDependencies: async () => ({ status: 'valid', issues: [], dependencyDigest: hashNativeDocument([]) }) });
        const plan = await plans.create(h.handle, id('Command'), graph.fixture);
        const expected = { planId: plan.planId, expectedDraftVersion: plan.draftVersion, expectedDefinitionHash: plan.definitionHash };
        const report = await plans.validate(h.handle, expected);
        const { planRef } = await plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) });
        const source = { sourceAuthority: 'controlled-test-port', sourceRef: { id: 'bounded-test-source' } };
        runs = new RunRepository({ engine: h.engine, authorize, assertWriter, now: () => clock,
            admit: async () => ({ sourceBinding: { ...source, bindingDigest: hashNativeDocument(source) }, budgetAuthorityRef: { authority: 'controlled-original-bank' } }) });
        const root = await runs.start(h.handle, id('Command'), { planRef, sourceRequest: {}, retentionPolicyRef: { policyId: 'test-retention' } });
        runId = root.runId;
        attempts = new AttemptController({ runs, authorizeAttempt: async () => {}, verifySettlement: async ({ attempt, resultRefs }) => {
            if (hashNativeDocument(resultRefs) !== hashNativeDocument(originalResults.get(attempt.attemptId) ?? [])) throw new TypeError('Unverified test results');
        } });
        transitions = new TransitionController({ runs, authorizeTransition: async ({ root, producers }) => {
            if (revoked) throw new ConflictError('controlled_source_revoked');
            for (const { attempt, receipt } of producers) if (hashNativeDocument(receipt.resultRefs) !== hashNativeDocument(originalResults.get(attempt.attemptId) ?? [])) throw new TypeError('Original test Result authority mismatch');
            const inputRefs = producers.flatMap(producer => producer.receipt.resultRefs);
            return { inputRefs, inputDigest: malformed ? 'a'.repeat(64) : hashNativeDocument(inputRefs), effectiveGrantDigest: hashNativeDocument([]), budgetRef: root.budgetAuthorityRef };
        } });
        ({ attemptId: initial } = await runs.beginAttempt(h.handle, id('Command'), { ...runGuard(await current()), nodeId: options.entryAtB ? graph.b : graph.a, inputRefs: [], inputDigest: hashNativeDocument([]), effectiveGrantDigest: hashNativeDocument([]), budgetRef: root.budgetAuthorityRef }));
    }
    async function complete(attemptId, outcome = 'completed') {
        await attempts.activate(h.handle, { ...runGuard(await current()), attemptId });
        const resultRefs = ['completed', 'partial'].includes(outcome) ? [{ runId, resultId: id('Result') }] : [];
        originalResults.set(attemptId, resultRefs);
        await attempts.settle(h.handle, { ...runGuard(await current()), attemptId, outcome, resultRefs, effectReceiptRefs: [], reasonCode: outcome === 'completed' ? null : 'controlled_failure' });
    }

    test('one dependency decision atomically creates a pending Attempt/receipt and persists visits only once', async () => {
        await setup(); await complete(initial);
        const input = { ...runGuard(await current()), bindings: [binding(graph.forward, initial)] }, before = await current();
        const result = await transitions.advance(h.handle, input), receipt = result.outcome.traversalReceipt;
        expect(result).toMatchObject({ replayed: false, outcome: { attemptId: receipt.nodeAttemptId } });
        const after = await current();
        expect(after.progress).toMatchObject({ attempts: 2, steps: before.progress.steps + 1, edgeVisits: 1, loopIterations: 0, edgeVisitCounts: { [graph.forward.edgeId]: 1 } });
        const attempt = await h.engine.withTransaction(h.handle, tx => tx.getResource(controlRecordKey(h.handle, runId, 'attempt', receipt.nodeAttemptId)));
        expect(attempt.doc).toMatchObject({ status: 'pending', inputRefs: originalResults.get(initial), budgetRef: before.budgetAuthorityRef });
        expect((await transitions.advance(h.handle, { ...input, ...runGuard(after) })).outcome).toEqual(result.outcome);
        expect(await current()).toEqual(after);
    });

    test('all required dependencies are admitted together and order changes cannot invent a new decision', async () => {
        await setup({ multipleInputs: true }); await complete(initial);
        const before = await current();
        await expect(advance([binding(graph.forward, initial)])).rejects.toMatchObject({ code: 'native_orchestration_transition_inputs_incomplete' });
        expect(await current()).toEqual(before);
        const child = (await advance([binding(graph.split, initial)])).outcome.attemptId; await complete(child);
        const bindings = [binding(graph.forward, initial), binding(graph.extra, child)];
        const result = await advance(bindings), after = await current();
        expect(after.progress.edgeVisits).toBe(3); expect(after.progress.loopIterations).toBe(0);
        expect((await advance(bindings.reverse())).outcome).toEqual(result.outcome); expect(await current()).toEqual(after);
    });

    test('explicit loop visits accumulate across new Attempt identities and cannot reset the parent ceiling', async () => {
        await setup({ loopLimit: 1 }); await complete(initial);
        const b0 = (await advance([binding(graph.forward, initial)])).outcome.attemptId; await complete(b0);
        const a1 = (await advance([binding(graph.back, b0)])).outcome.attemptId; await complete(a1);
        const b1 = (await advance([binding(graph.forward, a1)])).outcome.attemptId; await complete(b1);
        const before = await current();
        expect(before.progress).toMatchObject({ attempts: 4, loopIterations: 1, edgeVisits: 3 });
        await expect(advance([binding(graph.back, b1)])).rejects.toMatchObject({ code: 'native_orchestration_limit_exhausted' });
        expect(await current()).toEqual(before); expect(new Set(before.attemptRefs).size).toBe(4);
    });

    test('a generic beginAttempt with a new command cannot bypass loop or redo accounting', async () => {
        await setup(); await complete(initial);
        const before = await current();
        await expect(runs.beginAttempt(h.handle, id('Command'), { ...runGuard(before), nodeId: graph.a, inputRefs: [], inputDigest: hashNativeDocument([]), effectiveGrantDigest: hashNativeDocument([]), budgetRef: before.budgetAuthorityRef })).rejects.toMatchObject({ code: 'native_orchestration_retry_requires_controller' });
        expect(await current()).toEqual(before);
    });

    test('edge-specific visits remain exhausted even while the total loop budget has headroom', async () => {
        await setup({ edgeLimit: 1, loopLimit: 4 }); await complete(initial);
        const b = (await advance([binding(graph.forward, initial)])).outcome.attemptId; await complete(b);
        const a = (await advance([binding(graph.back, b)])).outcome.attemptId; await complete(a);
        const before = await current();
        await expect(advance([binding(graph.forward, a)])).rejects.toMatchObject({ code: 'native_orchestration_edge_limit_exhausted' });
        expect(await current()).toEqual(before);
    });

    test('entry into the middle of a bounded cycle still counts its declared back-edge crossing', async () => {
        await setup({ entryAtB: true }); await complete(initial);
        const result = await advance([binding(graph.back, initial)]);
        expect(result.outcome.traversalReceipt.loopIterations).toBe(1);
        expect((await current()).progress).toMatchObject({ attempts: 2, edgeVisits: 1, loopIterations: 1 });
    });

    test('success edges do not turn failed or partial producer receipts into success', async () => {
        await setup({ condition: 'success' }); await complete(initial, 'partial');
        const before = await current();
        await expect(advance([binding(graph.forward, initial)])).rejects.toMatchObject({ code: 'native_orchestration_transition_condition_unmet' });
        expect(await current()).toEqual(before);
    });

    test('a failure edge can carry explicit failed receipt evidence without changing it to a completed producer', async () => {
        await setup({ condition: 'failure' }); await complete(initial, 'failed');
        expect((await advance([binding(graph.forward, initial)])).outcome.attemptId).toBeDefined();
        const stored = await h.engine.withTransaction(h.handle, tx => tx.getResource(controlRecordKey(h.handle, runId, 'attempt', initial)));
        expect(stored.doc.status).toBe('failed');
    });

    test('source revocation and malformed original input proofs leave no partial next Attempt or progress', async () => {
        await setup(); await complete(initial);
        const before = await current(); revoked = true;
        await expect(advance([binding(graph.forward, initial)])).rejects.toMatchObject({ code: 'controlled_source_revoked' });
        revoked = false; malformed = true;
        await expect(advance([binding(graph.forward, initial)])).rejects.toThrow('original transition admission');
        expect(await current()).toEqual(before);
    });

    test('a live producer, mismatched source node and caller-invented transition ID are rejected', async () => {
        await setup(); const before = await current();
        await expect(advance([binding(graph.forward, initial)])).rejects.toMatchObject({ code: 'native_orchestration_transition_producer_invalid' });
        await complete(initial);
        await expect(advance([binding(graph.back, initial)])).rejects.toMatchObject({ code: 'native_orchestration_transition_producer_invalid' });
        await expect(transitions.advance(h.handle, { ...runGuard(before), bindings: [binding(graph.forward, initial)], transitionId: id('Receipt') })).rejects.toThrow();
    });

    test('Attempt limits and expired deadlines stop new dependency admission without resetting counters', async () => {
        await setup({ maxAttempts: 1 }); await complete(initial);
        const before = await current();
        await expect(advance([binding(graph.forward, initial)])).rejects.toMatchObject({ code: 'native_orchestration_limit_exhausted' });
        clock += 60001;
        await expect(advance([binding(graph.forward, initial)])).rejects.toMatchObject({ code: 'native_orchestration_limit_exhausted' });
        expect(await current()).toEqual(before);
    });

    test('concurrent proposals and a hidden committed ACK preserve one pending Attempt and one visit', async () => {
        await setup(); await complete(initial);
        const input = { ...runGuard(await current()), bindings: [binding(graph.forward, initial)] };
        const execute = h.engine.withTransaction.bind(h.engine); let hide = true;
        h.engine.withTransaction = async (...args) => {
            const result = await execute(...args);
            if (hide && result?.outcome?.traversalReceipt) { hide = false; throw new Error('controlled committed transition ACK loss'); }
            return result;
        };
        await expect(transitions.advance(h.handle, input)).rejects.toThrow('transition ACK loss');
        const after = await current(), results = await Promise.all([transitions.advance(h.handle, input), transitions.advance(h.handle, input)]);
        expect(results.every(result => result.replayed)).toBe(true); expect(results[0].outcome).toEqual(results[1].outcome);
        expect(await current()).toEqual(after); expect(after.progress.edgeVisits).toBe(1); expect(after.attemptRefs).toHaveLength(2);
    });

    test('storage recovery preserves visit high-water and blocks new old-epoch work', async () => {
        await setup(); await complete(initial);
        const b = (await advance([binding(graph.forward, initial)])).outcome.attemptId; await complete(b);
        const a = (await advance([binding(graph.back, b)])).outcome.attemptId; await complete(a);
        const before = await current();
        await h.engine.nativeHostLifecycle.afterRestore(h.handle);
        const recovered = await runs.recover(h.handle, id('Command'), runGuard(before));
        expect(recovered.progress).toEqual(before.progress); expect(recovered.status).toBe('blocked');
        await expect(advance([binding(graph.forward, a)])).rejects.toMatchObject({ code: 'native_orchestration_transition_not_admitted' });
        expect((await current()).progress.loopIterations).toBe(1);
    });
});
