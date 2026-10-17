import { PlanRepository, validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { RunRepository } from '../../src/native/orchestration/run-repository.js';
import { AttemptController } from '../../src/native/orchestration/attempt-controller.js';
import { ReviewController, reviewReceiptId } from '../../src/native/orchestration/review-controller.js';
import { TransitionController } from '../../src/native/orchestration/transition-controller.js';
import { controlRecordKey, runGuard, readAttempt, readAttemptInvalidation, attemptInvalidationId } from '../../src/native/orchestration/controller-common.js';
import { readAttemptSettlement } from '../../src/native/orchestration/attempt-settlement.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash, putMutable, putImmutable } from '../../src/native/repositories/common.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { planFixture, prepareControllerOwnerRoot } from './fixtures.js';

const id = kind => createNativeId('orchestration' + kind);
const port = name => ({ name, type: 'task.result', required: false });

// Original authority doubles for deterministic Host control; no Model, bank,
// domain write, recipient disclosure or actual Scheduler execution is claimed.
describe.each(CONTRACT_HARNESSES)('$name durable graph Review and local rerun', ({ make }) => {
    let h, runs, attempts, reviews, runId, a, b, c, r, output, ra, rb, rc, rr, clock, revoked, malformed, sourceResult;
    const current = () => runs.get(h.handle, runId);
    const read = attemptId => h.engine.withTransaction(h.handle, async tx => (await readAttempt(tx, h.handle, await current(), attemptId)).doc);
    beforeEach(async () => {
        h = await make(); await prepareControllerOwnerRoot(h.dirs.root);
        const lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        clock = Date.now(); revoked = false; malformed = null;
        const authorize = async () => {}, assertWriter = (handle, tx) => lifecycle.assertWriter(handle, tx);
        const plans = new PlanRepository({ engine: h.engine, authorize, assertWriter,
            validateDependencies: async () => ({ status: 'valid', issues: [], dependencyDigest: hash([]) }) });
        const fixture = planFixture(); output = fixture.definition.nodes[0].nodeId;
        a = id('Node'); b = id('Node'); c = id('Node'); r = id('Node');
        const wait = nodeId => ({ nodeId, kind: 'wait', label: 'Bounded work', inputs: [port('in')], outputs: [port('out')], dependencyPinIds: [], capabilities: [], policy: { timeoutMs: 1000 } });
        fixture.definition.nodes = [wait(a), wait(b), wait(c), { ...wait(r), kind: 'review', dependencyPinIds: ['review.model'], policy: { agentPinId: 'review.model', maxRounds: 2 } },
            { ...fixture.definition.nodes[0], inputs: [port('in'), port('other')] }];
        const edge = (from, to, input = 'in') => ({ edgeId: id('Edge'), from: { nodeId: from, port: 'out' }, to: { nodeId: to, port: input }, condition: 'always', maxVisits: 8, loopBack: false });
        fixture.definition.edges = [edge(a, b), edge(b, r), edge(r, output), edge(c, output, 'other')];
        fixture.definition.entryNodeIds = [a, c];
        fixture.definition.limits.maxSteps = 100; fixture.definition.limits.maxAttempts = 30;
        fixture.dependencyPins = [{ pinId: 'review.model', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: createNativeId('runtimeRoute') }, integrity: hash([]) }];
        const draft = await plans.create(h.handle, id('Command'), fixture), expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
        const report = await plans.validate(h.handle, expected);
        if (report.status !== 'valid') throw new Error(JSON.stringify(report.issues));
        const { planRef } = await plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) });
        const source = { sourceAuthority: 'controlled-review-source', sourceRef: { id: 'current-source' } };
        runs = new RunRepository({ engine: h.engine, authorize, assertWriter, now: () => clock,
            admit: async () => ({ sourceBinding: { ...source, bindingDigest: hash(source) }, budgetAuthorityRef: { authority: 'original-test-bank' } }) });
        ({ runId } = await runs.start(h.handle, id('Command'), { planRef, sourceRequest: {}, retentionPolicyRef: { policyId: 'review-test-retention' } }));
        attempts = new AttemptController({ runs, authorizeAttempt: async () => {}, verifySettlement: async () => {} });
        reviews = new ReviewController({ runs, authorizeReview: async () => { if (revoked) throw new Error('controlled source revoked'); },
            admitRerun: async ({ root }) => {
                const inputRefs = malformed === 'stale' ? [sourceResult] : [{ kind: 'source', bindingDigest: root.sourceBinding.bindingDigest }];
                return { inputRefs, inputDigest: malformed === 'digest' ? hash([]) : hash(inputRefs), effectiveGrantDigest: hash({ reauthorized: true }),
                    budgetRef: malformed === 'budget' ? { authority: 'foreign-bank' } : root.budgetAuthorityRef };
            } });
        ra = await begin(a); sourceResult = { runId, resultId: id('Result') }; await complete(ra, [sourceResult]);
        rb = await begin(b); await complete(rb);
        rc = await begin(c); await complete(rc);
        rr = await begin(r); await attempts.activate(h.handle, { ...runGuard(await current()), attemptId: rr });
    });
    afterEach(async () => { await h?.engine.close(); await h?.cleanup(); });
    async function begin(nodeId) {
        const root = await current();
        return (await runs.beginAttempt(h.handle, id('Command'), { ...runGuard(root), nodeId, inputRefs: [], inputDigest: hash([]), effectiveGrantDigest: hash([]), budgetRef: root.budgetAuthorityRef })).attemptId;
    }
    async function complete(attemptId, resultRefs = []) {
        await attempts.activate(h.handle, { ...runGuard(await current()), attemptId });
        await attempts.settle(h.handle, { ...runGuard(await current()), attemptId, outcome: 'completed', resultRefs, effectReceiptRefs: [], reasonCode: null });
    }
    async function request(decision = 'rerun', targetAttemptIds = [ra]) {
        return { ...runGuard(await current()), reviewAttemptId: rr, decision, targetAttemptIds, reasonCode: 'controlled_quality_evidence', evidenceRefs: [sourceResult] };
    }
    test('approve records bounded evaluation without authorizing any Effect or creating work', async () => {
        const before = await current(), input = await request('approve'), result = await reviews.decide(h.handle, input);
        expect(result.outcome.reviewReceipt).toMatchObject({ decision: 'approve', replacements: [], invalidatedAttemptIds: [] });
        const after = await current(); expect(after.attemptRefs).toEqual(before.attemptRefs);
        expect(after.pendingApprovalRefs).toEqual([]); expect(after.progress.reviews).toBe(1); expect(after.treeProgress.reviews).toBe(1);
        expect((await reviews.decide(h.handle, { ...input, ...runGuard(after) })).outcome).toEqual(result.outcome);
        expect(await current()).toEqual(after);
        await expect(reviews.decide(h.handle, { ...input, decision: 'rerun' })).rejects.toMatchObject({ code: 'native_orchestration_command_conflict' });
    });
    test('rerun preserves history, invalidates only descendants and creates fresh reauthorized Attempt identity', async () => {
        const before = await current(), old = await read(ra), result = await reviews.decide(h.handle, await request());
        const receipt = result.outcome.reviewReceipt, replacement = receipt.replacements[0].attemptId, after = await current();
        expect(receipt.invalidatedAttemptIds).toEqual([ra, rb].sort()); expect(receipt.replacements).toEqual([{ targetAttemptId: ra, attemptId: replacement }]);
        expect(await read(ra)).toEqual(old);
        expect(await read(replacement)).toMatchObject({ nodeId: a, attemptNumber: 2, status: 'pending', effectRefs: [], resultRefs: [], effectiveGrantDigest: hash({ reauthorized: true }), budgetRef: before.budgetAuthorityRef });
        expect(after.progress).toMatchObject({ reviews: 1, attempts: before.progress.attempts + 1, steps: before.progress.steps + 1 });
        await h.engine.withTransaction(h.handle, async tx => {
            expect(await readAttemptSettlement(tx, h.handle, after, old)).toMatchObject({ outcome: 'completed', resultRefs: [sourceResult] });
            expect(await readAttemptInvalidation(tx, h.handle, after, old)).toMatchObject({ reviewReceiptId: receipt.receiptId });
            expect(await readAttemptInvalidation(tx, h.handle, after, await read(rc))).toBeNull();
        });
        const transitions = new TransitionController({ runs, authorizeTransition: async ({ root }) => ({ inputRefs: [], inputDigest: hash([]), effectiveGrantDigest: hash([]), budgetRef: root.budgetAuthorityRef }) });
        const edge = after.graph.edges.find(item => item.from.nodeId === a);
        await expect(transitions.advance(h.handle, { ...runGuard(after), bindings: [{ edgeId: edge.edgeId, producerAttemptId: ra }], reservedAttemptId: null })).rejects.toMatchObject({ code: 'native_orchestration_attempt_superseded' });
        await complete(replacement);
        const next = await transitions.advance(h.handle, { ...runGuard(await current()), bindings: [{ edgeId: edge.edgeId, producerAttemptId: replacement }], reservedAttemptId: null });
        expect(await read(next.outcome.attemptId)).toMatchObject({ nodeId: b, attemptNumber: 2, status: 'pending' });
        await attempts.settle(h.handle, { ...runGuard(await current()), attemptId: rr, outcome: 'completed', resultRefs: [], effectReceiptRefs: [], reasonCode: null });
        const outputEdge = after.graph.edges.find(item => item.from.nodeId === r);
        await expect(transitions.advance(h.handle, { ...runGuard(await current()), bindings: [{ edgeId: outputEdge.edgeId, producerAttemptId: rr }], reservedAttemptId: null })).rejects.toMatchObject({ code: 'native_orchestration_review_rerun_pending' });
    });
    test.each([false, true])('Review output traversal requires its durable decision (approved=%s)', async approved => {
        if (approved) await reviews.decide(h.handle, await request('approve'));
        await attempts.settle(h.handle, { ...runGuard(await current()), attemptId: rr, outcome: 'completed', resultRefs: [], effectReceiptRefs: [], reasonCode: null });
        const transitions = new TransitionController({ runs, authorizeTransition: async ({ root }) => ({ inputRefs: [], inputDigest: hash([]), effectiveGrantDigest: hash([]), budgetRef: root.budgetAuthorityRef }) });
        const root = await current(), edge = root.graph.edges.find(item => item.from.nodeId === r);
        const action = transitions.advance(h.handle, { ...runGuard(root), bindings: [{ edgeId: edge.edgeId, producerAttemptId: rr }], reservedAttemptId: null });
        const observation = await action.then(result => ({ admitted: typeof result.outcome.attemptId === 'string' }), error => ({ code: error.code }));
        expect(observation).toEqual(approved ? { admitted: true } : { code: 'native_orchestration_review_decision_required' });
    });
    test.each(['digest', 'budget', 'stale'])('invalid %s re-admission rolls back the entire decision and counters', async problem => {
        malformed = problem; const before = await current();
        await expect(reviews.decide(h.handle, await request())).rejects.toMatchObject({ code: 'native_orchestration_review_rerun_denied' });
        expect(await current()).toEqual(before);
        expect(await h.engine.withTransaction(h.handle, tx => tx.getResource(controlRecordKey(h.handle, runId, 'receipt', reviewReceiptId(runId, rr))))).toBeNull();
    });
    test.each(['source', 'deadline', 'active', 'foreign', 'redundant'])('%s denies before any durable rerun change', async problem => {
        let targets = [ra];
        if (problem === 'source') revoked = true;
        if (problem === 'deadline') clock += 60001;
        if (problem === 'active') { await h.engine.withTransaction(h.handle, async tx => {
            const key = controlRecordKey(h.handle, runId, 'attempt', rb), row = await tx.getResource(key);
            await putMutable(tx, key, { ...row.doc, status: 'running', endedAt: null }, { expectedIntegrity: row.integrity });
        }); }
        if (problem === 'foreign') targets = [id('Attempt')];
        if (problem === 'redundant') targets = [ra, rb];
        const before = await current(); await expect(reviews.decide(h.handle, await request('rerun', targets))).rejects.toThrow(); expect(await current()).toEqual(before);
    });
    test('lost committed ACK replays one receipt, replacement and review charge', async () => {
        const original = runs.control.bind(runs); let hide = true;
        runs.control = async (...args) => { const result = await original(...args); if (hide && result?.outcome?.reviewReceipt) { hide = false; throw new Error('controlled review ACK loss'); } return result; };
        const input = await request(); await expect(reviews.decide(h.handle, input)).rejects.toThrow('review ACK loss');
        const saved = await current(), replay = await reviews.decide(h.handle, input);
        expect(replay.replayed).toBe(true); expect(saved.progress.reviews).toBe(1); expect(await current()).toEqual(saved);
    });
    test.each(['domain-write', 'unknown-send', 'approval-required'])('%s dependency cannot be locally rerun or erased', async problem => {
        const root = await current(), effectId = id('Effect');
        const effect = { schemaVersion: 1, runId, effectId, nodeAttemptId: ra, epoch: root.epoch, graphRevision: root.graphRevision,
            hostBootId: root.hostBootId, hostGeneration: root.hostGeneration, sourceBindingDigest: root.sourceBinding.bindingDigest,
            actionRef: { kind: 'controlled-test-effect' }, targetRef: { id: 'original-target' }, inputRef: { id: 'original-input' }, inputHash: hash([]),
            capability: problem === 'domain-write' ? 'world.write' : 'generation.send', endpointBindingDigest: hash([]), grantDigest: hash([]),
            risk: problem === 'approval-required' ? 'R3' : problem === 'domain-write' ? 'R2' : 'R1', egressDigest: hash([]), budgetEnvelopeDigest: hash([]),
            dispatchPolicy: { idempotency: 'none', operationKey: null, reconcile: 'manual' }, requiresApproval: problem === 'approval-required',
            approvalRef: null, budgetAttemptRef: { authorityRef: root.budgetAuthorityRef, charged: 'retained' }, status: problem === 'unknown-send' ? 'unknown' : 'confirmed', dispatchToken: null, createdAt: clock };
        await h.engine.withTransaction(h.handle, async tx => {
            const key = controlRecordKey(h.handle, runId, 'attempt', ra), row = await tx.getResource(key);
            await putMutable(tx, key, { ...row.doc, effectRefs: [effectId] }, { expectedIntegrity: row.integrity });
            await putImmutable(tx, controlRecordKey(h.handle, runId, 'effect', effectId), effect);
        });
        const before = await current();
        await expect(reviews.decide(h.handle, await request())).rejects.toMatchObject({ code: 'native_orchestration_review_irreversible_dependency' });
        expect(await current()).toEqual(before);
        expect((await h.engine.withTransaction(h.handle, tx => tx.getResource(controlRecordKey(h.handle, runId, 'effect', effectId)))).doc).toEqual(effect);
    });
    test('per-review-node rounds persist across fresh Attempts and cannot reset with another command', async () => {
        const transitions = new TransitionController({ runs, authorizeTransition: async ({ root }) => ({ inputRefs: [], inputDigest: hash([]), effectiveGrantDigest: hash([]), budgetRef: root.budgetAuthorityRef }) });
        for (let round = 0; round < 2; round++) {
            const decision = await reviews.decide(h.handle, await request('rerun', [rb]));
            await attempts.settle(h.handle, { ...runGuard(await current()), attemptId: rr, outcome: 'completed', resultRefs: [], effectReceiptRefs: [], reasonCode: null });
            rb = decision.outcome.reviewReceipt.replacements[0].attemptId;
            await complete(rb);
            const root = await current(), edge = root.graph.edges.find(item => item.from.nodeId === b);
            const next = await transitions.advance(h.handle, { ...runGuard(root), bindings: [{ edgeId: edge.edgeId, producerAttemptId: rb }], reservedAttemptId: null });
            rr = next.outcome.attemptId;
            await attempts.activate(h.handle, { ...runGuard(await current()), attemptId: rr });
        }
        const before = await current();
        await expect(reviews.decide(h.handle, await request('approve', [rb]))).rejects.toMatchObject({ code: 'native_orchestration_limit_exhausted' });
        expect(before.progress.reviews).toBe(2); expect(await current()).toEqual(before);
    });
    test('corrupt invalidation cannot be used as live permission while immutable history remains', async () => {
        await reviews.decide(h.handle, await request());
        await h.engine.withTransaction(h.handle, async tx => {
            const key = controlRecordKey(h.handle, runId, 'receipt', attemptInvalidationId(runId, ra)), row = await tx.getResource(key);
            await putMutable(tx, key, { ...row.doc, reviewIntegrity: hash([]) }, { expectedIntegrity: row.integrity });
        });
        await expect(h.engine.withTransaction(h.handle, async tx => readAttemptInvalidation(tx, h.handle, await current(), await read(ra)))).rejects.toThrow('Invalid Attempt invalidation facts');
    });
});
