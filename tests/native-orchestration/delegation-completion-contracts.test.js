import { DelegateController } from '../../src/native/orchestration/delegate-controller.js';
import { readDelegationCompletion } from '../../src/native/orchestration/delegation-completion-contracts.js';
import { RunRepository, childBudgetReceiptId } from '../../src/native/orchestration/run-repository.js';
import { PlanRepository, validationDigest, readPlanRevision } from '../../src/native/orchestration/plan-repository.js';
import { AttemptController } from '../../src/native/orchestration/attempt-controller.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { SourcePort } from '../../src/native/orchestration/source-port.js';
import { runGuard, controlCommandId, controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { handoffReceiptId } from '../../src/native/orchestration/handoff-contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { hashNativeDocument as hash, putMutable, putImmutable } from '../../src/native/repositories/common.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { installFixture } from '../native/helpers/session-fixture.js';
import { planFixture, prepareControllerOwnerRoot } from './fixtures.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

const command = () => createNativeId('orchestrationCommand'), grant = 'a'.repeat(64);
const ceiling = { maxRequests: 4, maxTokens: 4000, localWork: { maxJobs: 4, maxItems: 4, maxInputBytes: 4000 } };
const limits = { maxRequests: 8, maxTokens: 8000, localWork: { maxJobs: 8, maxItems: 8, maxInputBytes: 8000 } };
const commandKey = (handle, operation, identity) => ({ kind: K.orchestrationCommand, handle, commandId: controlCommandId(operation, identity) });

// Real original controllers, immutable commands and original Session bank.
// The explicit allowing dependency/scope callbacks are mechanism fixtures;
// these tests claim no Model, production Agent grant or Return permission.
describe.each(CONTRACT_HARNESSES.filter(item => ['FsEngine', 'SqliteEngine'].includes(item.name)))('$name delegation history facts', ({ make }) => {
    let h, runs, plans, attempts, delegates, budget, source, root, parentAttemptId, leaf, childPlan;
    beforeEach(async () => {
        h = await make(); await prepareControllerOwnerRoot(h.dirs.root);
        const lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        const original = await installFixture(h), base = await original.core.create(h.handle, original.start);
        budget = new BudgetPort({ sessionCore: original.core }); source = new SourcePort({ budgetPort: budget, sessionCore: original.core });
        const assertWriter = (handle, tx) => lifecycle.assertWriter(handle, tx), authorize = async () => {};
        plans = new PlanRepository({ engine: h.engine, authorize, assertWriter,
            validateDependencies: async () => ({ status: 'valid', issues: [], dependencyDigest: hash([]) }) });
        runs = new RunRepository({ engine: h.engine, assertWriter, authorize, admit: ({ handle, sourceRequest }) => source.capture(handle, sourceRequest) });
        attempts = new AttemptController({ runs, authorizeAttempt: async () => {}, verifySettlement: async () => {} });
        delegates = new DelegateController({ runs, authorizeDelegation: async ({ parent, parentAttempt, effectiveGrantDigest, budgetCeiling }) => ({ allowed: true,
            effectiveGrantDigest, parentGrantDigest: parentAttempt.effectiveGrantDigest, budgetCeilingDigest: hash(budgetCeiling), sourceBindingDigest: parent.sourceBinding.bindingDigest }),
        verifyReservation: args => budget.verifyReservation(args) });
        leaf = await publish(); childPlan = await publish(leaf); const parent = await publish(childPlan);
        root = await runs.start(h.handle, command(), { planRef: parent.planRef,
            sourceRequest: { domain: 'native_session', sessionId: base.session.sessionId, branchId: base.revision.branchId, revisionId: base.revision.revisionId },
            retentionPolicyRef: { policyId: 'explicit-controller-history-fixture' } });
        parentAttemptId = await activate(root);
    });
    afterEach(async () => { await h?.engine.close(); await h?.cleanup(); });

    async function publish(child = null) {
        const fixture = planFixture();
        if (child) {
            const output = fixture.definition.nodes[0], nodeId = createNativeId('orchestrationNode');
            fixture.definition.nodes.unshift({ nodeId, kind: 'agent', label: 'Declared child delegation', inputs: [],
                outputs: [{ name: 'next', type: 'task.result', required: false }], capabilities: ['agent.delegate'], dependencyPinIds: ['route', 'child'],
                policy: { agentPinId: 'route', allowedPlanPinIds: ['child'] } });
            output.inputs = [{ name: 'in', type: 'task.result', required: true }];
            fixture.definition.edges = [{ edgeId: createNativeId('orchestrationEdge'), from: { nodeId, port: 'next' },
                to: { nodeId: output.nodeId, port: 'in' }, condition: 'always', maxVisits: 1, loopBack: false }];
            fixture.definition.entryNodeIds = [nodeId]; fixture.definition.capabilityCeiling = ['agent.delegate'];
            fixture.dependencyPins = [{ pinId: 'route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: createNativeId('runtimeRoute') }, integrity: 'b'.repeat(64) },
                { pinId: 'child', port: 'plan', resourceRef: child.planRef, integrity: hash(child.revision) }];
        }
        Object.assign(fixture.definition.limits, { maxConcurrency: 4, maxDelegates: 3, maxDepth: 3 });
        const draft = await plans.create(h.handle, command(), fixture), expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
        const report = await plans.validate(h.handle, expected);
        if (report.status !== 'valid') throw new Error(JSON.stringify(report.issues));
        const { planRef } = await plans.publish(h.handle, command(), { ...expected, validationDigest: validationDigest(report) });
        return { planRef, revision: await h.engine.withTransaction(h.handle, tx => readPlanRevision(tx, h.handle, planRef)) };
    }
    async function activate(run) {
        const actual = await runs.get(h.handle, run.runId), inputRefs = actual.parentRef?.inputRefs ?? [];
        const begun = await runs.beginAttempt(h.handle, command(), { ...runGuard(actual), nodeId: actual.graph.entryNodeIds[0], inputRefs,
            inputDigest: hash(inputRefs), effectiveGrantDigest: actual.parentRef?.effectiveGrantDigest ?? grant, budgetRef: actual.budgetAuthorityRef });
        await attempts.activate(h.handle, { ...runGuard(await runs.get(h.handle, run.runId)), attemptId: begun.attemptId });
        return begun.attemptId;
    }
    async function create(mode = 'delegate', { parent = root, attemptId = parentAttemptId, plan = childPlan, delegationId = 'child-history', funded = true } = {}) {
        const inputRefs = [{ task: delegationId }];
        const result = await delegates[mode](h.handle, { ...runGuard(await runs.get(h.handle, parent.runId)), parentAttemptId: attemptId, delegationId,
            childPlanRef: plan.planRef, inputRefs, inputDigest: hash(inputRefs), effectiveGrantDigest: grant, returnContract: plan.revision.definition.outputContract, budgetCeiling: ceiling });
        const child = await runs.get(h.handle, result.outcome.childRunId);
        if (funded) {
            await budget.reserveChild(h.handle, { authorityRef: child.budgetAuthorityRef, parentReservationId: parent.parentRef ? parent.runId : null,
                childRunId: child.runId, ceiling, limits });
            await delegates.confirmBudget(h.handle, runGuard(await runs.get(h.handle, child.runId)));
        }
        return child.runId;
    }
    async function read(childRunId, parentRunId = root.runId) {
        return h.engine.withTransaction(h.handle, async tx => readDelegationCompletion(tx, h.handle,
            await runs.get(h.handle, parentRunId), await runs.get(h.handle, childRunId)));
    }
    async function mutate(key, change) {
        await h.engine.withTransaction(h.handle, async tx => {
            const saved = await tx.getResource(key); await putMutable(tx, key, change(structuredClone(saved.doc)), { expectedIntegrity: saved.integrity });
        });
    }

    test.each(['delegate', 'handoff'])('reads exact funded %s commands without producing a Return or live permission', async mode => {
        const childId = await create(mode), before = await runs.get(h.handle, root.runId), proof = await read(childId);
        expect(proof.mode).toBe(mode); expect(proof.parentAttempt.status).toBe(mode === 'handoff' ? 'waiting_child' : 'running');
        expect(proof.handoffReceiptRef).toEqual(mode === 'handoff' ? { runId: root.runId, receiptId: handoffReceiptId(childId) } : null);
        expect(proof.budgetReadyReceiptRef).toEqual({ runId: childId, receiptId: childBudgetReceiptId(childId) });
        expect(Object.keys(proof).sort()).toEqual(['mode', 'parentAttempt', 'delegation', 'handoff', 'budgetReady', 'delegationReceiptRef', 'handoffReceiptRef', 'budgetReadyReceiptRef'].sort());
        expect(await runs.get(h.handle, root.runId)).toEqual(before);
    });

    test('unfunded identity has no completion and a supplied root projection cannot stand in for the stored Run', async () => {
        const childId = await create('delegate', { funded: false }); expect(await read(childId)).toBeNull();
        await expect(h.engine.withTransaction(h.handle, async tx => readDelegationCompletion(tx, h.handle,
            { ...await runs.get(h.handle, root.runId), status: 'blocked' }, await runs.get(h.handle, childId)))).rejects.toThrow();
    });

    test('mode remains true Delegate when the same parent later waits on a different real Handoff', async () => {
        const first = await create(); await create('handoff', { delegationId: 'another-child' });
        const proof = await read(first); expect(proof.mode).toBe('delegate'); expect(proof.handoff).toBeNull(); expect(proof.parentAttempt.status).toBe('waiting_child');
    });

    test('original settled parent Attempt remains historical evidence and is never resumed', async () => {
        const child = await create();
        await attempts.settle(h.handle, { ...runGuard(await runs.get(h.handle, root.runId)), attemptId: parentAttemptId,
            outcome: 'completed', resultRefs: [], effectReceiptRefs: [], reasonCode: 'controller_history_fixture' });
        expect((await read(child)).parentAttempt.status).toBe('completed');
    });

    test.each(['delegate', 'handoff'])('real cancellation preserves %s history across its original parent epoch', async mode => {
        const child = await create(mode);
        await runs.cancel(h.handle, command(), { ...runGuard(await runs.get(h.handle, root.runId)), reasonCode: 'history_fixture_cancel' });
        const parent = await runs.get(h.handle, root.runId), proof = await read(child);
        expect(parent.cancelRequested).toBe(true); expect(parent.epoch).toBe(1); expect(proof.mode).toBe(mode);
        expect(proof.parentAttempt.epoch).toBe(0); expect(proof.delegation.parentRef.parentEpoch).toBe(0);
        expect(await runs.get(h.handle, root.runId)).toEqual(parent);
    });

    test.each(['operation', 'payload', 'child-id', 'receipt-copy', 'budget-operation', 'budget-receipt', 'event'])('rejects recomputed-integrity %s corruption', async kind => {
        const child = await create(); const proof = await read(child);
        const keys = { operation: commandKey(h.handle, 'run.delegate', child), payload: commandKey(h.handle, 'run.delegate', child),
            'child-id': commandKey(h.handle, 'run.delegate', child), 'receipt-copy': commandKey(h.handle, 'run.delegate', child),
            'budget-operation': commandKey(h.handle, 'run.childBudget', childBudgetReceiptId(child)),
            'budget-receipt': controlRecordKey(h.handle, child, 'receipt', childBudgetReceiptId(child)),
            event: controlRecordKey(h.handle, root.runId, 'event', 'event:' + proof.delegation.decisionSeq) };
        const changes = { operation: doc => ({ ...doc, operation: 'runs.control.run.handoff' }), payload: doc => ({ ...doc, payloadHash: '0'.repeat(64) }),
            'child-id': doc => ({ ...doc, outcome: { ...doc.outcome, childRunId: root.runId } }),
            'receipt-copy': doc => ({ ...doc, outcome: { ...doc.outcome, delegationReceipt: { ...doc.outcome.delegationReceipt, sourceBindingDigest: '0'.repeat(64) } } }),
            'budget-operation': doc => ({ ...doc, operation: 'runs.control.run.delegate' }),
            'budget-receipt': doc => ({ ...doc, parentReservationId: root.runId }), event: doc => ({ ...doc, type: 'control_handed_off' }) };
        await mutate(keys[kind], changes[kind]); await expect(read(child)).rejects.toThrow();
    });

    test('a true Delegate cannot acquire an invented HandoffReceipt', async () => {
        const child = await create();
        await h.engine.withTransaction(h.handle, tx => putImmutable(tx, controlRecordKey(h.handle, root.runId, 'receipt', handoffReceiptId(child)),
            { receiptKind: 'handoff', receiptId: handoffReceiptId(child), childRunId: child }));
        await expect(read(child)).rejects.toThrow();
    });

    test('nested completion requires the actual ancestor delegation command and budget chain', async () => {
        const childId = await create(), child = await runs.get(h.handle, childId), attemptId = await activate(child);
        const nested = await create('delegate', { parent: child, attemptId, plan: leaf, delegationId: 'nested-child' });
        expect((await read(nested, childId)).mode).toBe('delegate');
        await mutate(commandKey(h.handle, 'run.delegate', childId), doc => ({ ...doc, payloadHash: '0'.repeat(64) }));
        await expect(read(nested, childId)).rejects.toThrow();
    });
});
