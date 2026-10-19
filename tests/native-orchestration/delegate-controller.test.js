import { DelegateController, delegatedRunId } from '../../src/native/orchestration/delegate-controller.js';
import { RunRepository } from '../../src/native/orchestration/run-repository.js';
import { PlanRepository, validationDigest, readPlanRevision } from '../../src/native/orchestration/plan-repository.js';
import { AttemptController } from '../../src/native/orchestration/attempt-controller.js';
import { GraphController } from '../../src/native/orchestration/graph-controller.js';
import { graphPatchHash } from '../../src/native/orchestration/graph-revision-contracts.js';
import { admitGraphEdges } from '../../src/native/orchestration/graph-costs.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { SourcePort } from '../../src/native/orchestration/source-port.js';
import { runGuard, controlRecordKey, readAttempt, holdsConcurrencySlot } from '../../src/native/orchestration/controller-common.js';
import { handoffReceiptId } from '../../src/native/orchestration/handoff-contracts.js';
import { readRunControl } from '../../src/native/run-control.js';
import { createNativeId } from '../../src/native/identity.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { hashNativeDocument, putMutable } from '../../src/native/repositories/common.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { installFixture } from '../native/helpers/session-fixture.js';
import { planFixture, prepareControllerOwnerRoot } from './fixtures.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { NativeTaskScheduler } from '../../src/native/task-scheduler.js';

const command = () => createNativeId('orchestrationCommand'), grant = 'a'.repeat(64);
const limits = { maxRequests: 8, maxTokens: 8000, localWork: { maxJobs: 8, maxItems: 8, maxInputBytes: 8000 } };
const childCeiling = { maxRequests: 4, maxTokens: 4000, localWork: { maxJobs: 4, maxItems: 4, maxInputBytes: 4000 } };

// SQL is opt-in for this new tree integration suite; no Docker is needed for
// the default original FS/SQLite coverage.
const harnesses = CONTRACT_HARNESSES.filter(item => ['FsEngine', 'SqliteEngine'].includes(item.name) || process.env.ATRIA_TEST_DELEGATE_SQL === '1');
describe.each(harnesses)('$name guarded child Run and original bank', ({ make }) => {
    let h, original, base, runs, plans, attempts, delegates, budget, source, root, parentAttemptId, childPlanRef, childPlan, allowed, scopeCalls;
    beforeEach(async () => {
        h = await make(); allowed = true; scopeCalls = 0; await prepareControllerOwnerRoot(h.dirs.root);
        const lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        original = await installFixture(h); base = await original.core.create(h.handle, original.start);
        budget = new BudgetPort({ sessionCore: original.core }); source = new SourcePort({ budgetPort: budget, sessionCore: original.core });
        const assertWriter = (handle, tx) => lifecycle.assertWriter(handle, tx), authorize = async () => {};
        plans = new PlanRepository({ engine: h.engine, authorize, assertWriter, validateDependencies: async () => ({ status: 'valid', issues: [], dependencyDigest: hashNativeDocument([]) }) });
        runs = new RunRepository({ engine: h.engine, assertWriter, authorize, admit: ({ handle, sourceRequest }) => source.capture(handle, sourceRequest) });
        attempts = new AttemptController({ runs, authorizeAttempt: async ({ root }) => source.revalidate(h.handle, root.sourceBinding) });
        delegates = new DelegateController({ runs,
            authorizeDelegation: async ({ parent, parentAttempt, effectiveGrantDigest }) => {
                scopeCalls++;
                await source.revalidate(h.handle, parent.sourceBinding);
                return { allowed, parentGrantDigest: parentAttempt.effectiveGrantDigest, effectiveGrantDigest,
                    budgetCeilingDigest: hashNativeDocument(childCeiling), sourceBindingDigest: parent.sourceBinding.bindingDigest };
            },
            verifyReservation: args => budget.verifyReservation(args) });
        await setup();
    });
    afterEach(async () => { await h?.engine.close(); await h?.cleanup(); });
    async function publish(overrides = {}, extraCapability, children = [], template, stalePin = false) {
        const fixture = planFixture(), output = template?.nodes.at(-1) ?? fixture.definition.nodes[0], nodeId = template?.entryNodeIds[0] ?? createNativeId('orchestrationNode');
        const capabilities = ['agent.delegate', 'graph.patch', ...(extraCapability ? [extraCapability] : [])];
        const extraId = template?.nodes[1].nodeId ?? createNativeId('orchestrationNode');
        const agentNode = { nodeId, kind: 'agent', label: 'Delegating Agent', inputs: [], outputs: [{ name: 'next', type: 'task.result', required: false }],
            capabilities, dependencyPinIds: ['route', ...children.map((_child, index) => 'child-' + index)], policy: { agentPinId: 'route', allowedPlanPinIds: children.map((_child, index) => 'child-' + index) } };
        fixture.definition.nodes = [agentNode, { ...agentNode, nodeId: extraId, inputs: [{ name: 'in', type: 'task.result', required: true }] },
            { ...output, inputs: [{ name: 'in', type: 'task.result', required: true }] }];
        fixture.definition.entryNodeIds = [nodeId]; fixture.definition.capabilityCeiling = capabilities;
        if (template) fixture.definition.outputContract = structuredClone(template.outputContract);
        fixture.definition.graphChangePolicy.allowedOperations = ['setPendingPriority', 'requestReplan'];
        fixture.definition.edges = [[nodeId, extraId], [extraId, output.nodeId]].map(([from, to]) => ({ edgeId: createNativeId('orchestrationEdge'),
            from: { nodeId: from, port: 'next' }, to: { nodeId: to, port: 'in' }, condition: 'always', loopBack: false, maxVisits: 1 }));
        Object.assign(fixture.definition.limits, { maxConcurrency: 4, maxDelegates: 3, maxDepth: 3 }, overrides);
        fixture.dependencyPins = [{ pinId: 'route', port: 'model', resourceRef: { runtimeRouteId: createNativeId('runtimeRoute'), scope: 'player' }, integrity: 'b'.repeat(64) }];
        for (const [index, child] of children.entries()) fixture.dependencyPins.push({ pinId: 'child-' + index, port: 'plan', resourceRef: child.planRef, integrity: stalePin ? '0'.repeat(64) : hashNativeDocument(child.revision) });
        const draft = await plans.create(h.handle, command(), fixture), expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
        const report = await plans.validate(h.handle, expected);
        if (report.status !== 'valid') throw new Error('Plan fixture validation: ' + JSON.stringify(report.issues));
        const { planRef } = await plans.publish(h.handle, command(), { ...expected, validationDigest: validationDigest(report) });
        const revision = await h.engine.withTransaction(h.handle, tx => readPlanRevision(tx, h.handle, planRef));
        return { planRef, definition: fixture.definition, revision };
    }
    async function setup(overrides = {}, childOverrides = overrides) {
        const leaf = await publish(childOverrides), middle = await publish(childOverrides, undefined, [leaf], leaf.definition);
        const child = await publish(childOverrides, undefined, [middle], leaf.definition), parent = await publish(overrides, undefined, [child]);
        childPlanRef = child.planRef; childPlan = child.definition;
        await start(parent.planRef);
    }
    async function start(planRef) {
        root = await runs.start(h.handle, command(), { planRef, sourceRequest: { domain: 'native_session', sessionId: base.session.sessionId, branchId: base.revision.branchId, revisionId: base.revision.revisionId }, retentionPolicyRef: { policyId: 'test-explicit' } });
        parentAttemptId = await begin(root, root.graph.entryNodeIds[0]);
        await attempts.activate(h.handle, { ...runGuard(await current()), attemptId: parentAttemptId });
    }
    const current = () => runs.get(h.handle, root.runId);
    async function nextPlan(runId) {
        const run = await runs.get(h.handle, runId);
        const revision = await h.engine.withTransaction(h.handle, tx => readPlanRevision(tx, h.handle, run.planRef));
        return revision.dependencyPins.find(pin => pin.port === 'plan').resourceRef;
    }
    async function begin(run, nodeId) {
        const inputRefs = run.parentRef?.inputRefs ?? [], effectiveGrantDigest = run.parentRef?.effectiveGrantDigest ?? grant;
        return (await runs.beginAttempt(h.handle, command(), { ...runGuard(run), nodeId, inputRefs, inputDigest: hashNativeDocument(inputRefs), effectiveGrantDigest, budgetRef: run.budgetAuthorityRef })).attemptId;
    }
    const body = async (overrides = {}) => ({ ...runGuard(await current()), parentAttemptId, delegationId: 'child-one', childPlanRef,
        inputRefs: [], inputDigest: hashNativeDocument([]), effectiveGrantDigest: grant, returnContract: childPlan.outputContract, budgetCeiling: childCeiling, ...overrides });
    async function fund(childRunId, parentReservationId = null) {
        await budget.reserveChild(h.handle, { authorityRef: root.budgetAuthorityRef, parentReservationId, childRunId, ceiling: childCeiling, limits });
        await delegates.confirmBudget(h.handle, runGuard(await runs.get(h.handle, childRunId)));
    }
    async function siblings(ceiling) {
        await setup(ceiling);
        const first = await delegates.delegate(h.handle, await body()); await fund(first.outcome.childRunId);
        const second = await delegates.delegate(h.handle, await body({ delegationId: 'second-child' })); await fund(second.outcome.childRunId);
        return [first.outcome.childRunId, second.outcome.childRunId];
    }
    async function pending(childId, nodeId = childPlan.entryNodeIds[0]) {
        const attemptId = await begin(await runs.get(h.handle, childId), nodeId);
        return { runId: childId, attemptId };
    }
    const activate = async ref => attempts.activate(h.handle, { ...runGuard(await runs.get(h.handle, ref.runId)), attemptId: ref.attemptId });

    const parentAttempt = () => h.engine.withTransaction(h.handle, async tx => (await readAttempt(tx, h.handle, await current(), parentAttemptId)).doc);

    // Core persistence and original-bank tests only. The allowing fixture
    // callback is not a production Plan/Actor grant or a Result-return proof.
    test('handoff yields a durable parent slot and funds the exact child at concurrency one while delegate still refuses', async () => {
        await setup({ maxConcurrency: 1 });
        await expect(delegates.delegate(h.handle, await body())).rejects.toMatchObject({ code: 'native_orchestration_delegation_limit_exhausted' });
        const before = await current(), input = await body(), result = await delegates.handoff(h.handle, input), childId = result.outcome.childRunId;
        const parent = await current(), suspended = await parentAttempt(), child = await runs.get(h.handle, childId);
        expect(parent.status).toBe('running'); expect(suspended.status).toBe('waiting_child'); expect(holdsConcurrencySlot(parent, suspended)).toBe(false);
        expect(parent.progress.handoffs).toBe(before.progress.handoffs + 1);
        expect(parent.progress.steps).toBe(before.progress.steps + 1);
        expect(parent.progress.delegates).toBe(before.progress.delegates + 1);
        expect(child.budgetAuthorityRef).toEqual(parent.budgetAuthorityRef); expect(child.rootRunId).toBe(parent.runId);
        expect(result.outcome.handoffReceipt).toMatchObject({ receiptId: handoffReceiptId(childId), receiptKind: 'handoff',
            runId: parent.runId, parentAttemptId, childRunId: childId, parentEpoch: parent.epoch, returnNodeId: suspended.nodeId,
            inputDigest: child.parentRef.inputDigest, sourceBindingDigest: parent.sourceBinding.bindingDigest });
        expect((await delegates.handoff(h.handle, input)).replayed).toBe(true);
        expect(await current()).toEqual(parent);
        await expect(begin(child, child.graph.entryNodeIds[0])).rejects.toMatchObject({ code: 'native_orchestration_child_budget_unconfirmed' });
        await fund(childId);
        const childRef = await pending(childId); await activate(childRef);
        expect((await parentAttempt()).status).toBe('waiting_child');
        expect((await runs.get(h.handle, childId)).status).toBe('running');
    });

    test('handoff observes an unknown original reservation ACK without another allocation or permission', async () => {
        await setup({ maxConcurrency: 1 });
        const { outcome } = await delegates.handoff(h.handle, await body()), childId = outcome.childRunId;
        await expect((async () => {
            await budget.reserveChild(h.handle, { authorityRef: root.budgetAuthorityRef, parentReservationId: null, childRunId: childId, ceiling: childCeiling, limits });
            throw Object.assign(new Error('lost handoff bank ACK'), { code: 'storage_commit_unknown' });
        })()).rejects.toMatchObject({ code: 'storage_commit_unknown' });
        await expect(pending(childId)).rejects.toMatchObject({ code: 'native_orchestration_child_budget_unconfirmed' });
        const confirmed = await delegates.confirmBudget(h.handle, runGuard(await runs.get(h.handle, childId)));
        expect(confirmed.outcome.budgetReceipt.reservationId).toBe(childId);
        expect((await delegates.confirmBudget(h.handle, runGuard(await runs.get(h.handle, childId)))).replayed).toBe(true);
        const control = await h.engine.withTransaction(h.handle, tx => readRunControl(tx, h.handle, base.session.sessionId));
        expect(control.operations[root.budgetAuthorityRef.operationId].compute.reservations).toHaveLength(1);
        const childRef = await pending(childId); await activate(childRef);
        expect((await parentAttempt()).status).toBe('waiting_child');
    });

    test('handoff composes the original one-slot Scheduler without replaying the parent or implicitly returning durable control', async () => {
        await setup({ maxConcurrency: 1 });
        const scheduler = new NativeTaskScheduler({ concurrency: 1, perResource: 1, timeoutMs: 5000 });
        const expected = { owner: h.handle, anchor: { sessionId: base.session.sessionId, revisionId: base.revision.revisionId },
            kind: 'model_task', executionClass: 'interactive', resources: ['session:' + base.session.sessionId],
            key: 'controlled-parent:' + root.runId, fingerprint: hashNativeDocument(root.sourceBinding) };
        let parentRuns = 0, childRuns = 0;
        const scheduled = scheduler.submit({ ...expected, retry: false, fresh: async () => { await source.revalidate(h.handle, root.sourceBinding); return true; },
            run: async boundary => {
                parentRuns++;
                const { outcome } = await delegates.handoff(h.handle, await body()); await fund(outcome.childRunId);
                const observed = await scheduler.withResourceHandoff(boundary, expected, { kind: 'model_task', executionClass: expected.executionClass,
                    resources: expected.resources, key: 'controlled-child:' + outcome.childRunId, fingerprint: hashNativeDocument(outcome.handoffReceipt),
                    fresh: async () => { await source.revalidate(h.handle, root.sourceBinding); return true; },
                    run: async () => {
                        childRuns++;
                        const childRef = await pending(outcome.childRunId); await activate(childRef);
                        expect(scheduler.running.size).toBe(1); expect(scheduler.suspended.size).toBe(1);
                        expect((await parentAttempt()).status).toBe('waiting_child');
                        // Metadata from a controlled test callback, explicitly
                        // not a ResultEnvelope, domain grant or return receipt.
                        return { controlledSchedulingObservation: outcome.childRunId };
                    }, finalize: async observation => observation });
                scheduler.assertActiveBoundary(boundary, expected);
                return observed;
            }, finalize: async observation => observation });
        await expect(scheduled.result).resolves.toEqual({ controlledSchedulingObservation: expect.stringMatching(/^orun_/) });
        expect(parentRuns).toBe(1); expect(childRuns).toBe(1);
        expect(scheduler.running.size).toBe(0); expect(scheduler.suspended.size).toBe(0);
        expect((await parentAttempt()).status).toBe('waiting_child');
        expect((await current()).progress.handoffs).toBe(1);
    });

    test.each(['missing', 'forged-kind', 'sibling', 'grant', 'input', 'source', 'plan', 'control-token'])('handoff child refuses a %s durable receipt', async mutation => {
        await setup({ maxConcurrency: 1 });
        const { outcome } = await delegates.handoff(h.handle, await body()); await fund(outcome.childRunId);
        // Explicit corruption/fault injection into a real stored Native row;
        // this is not an authorized receipt-writing or model consumer API.
        await h.engine.withTransaction(h.handle, async tx => {
            const key = controlRecordKey(h.handle, root.runId, 'receipt', handoffReceiptId(outcome.childRunId)), row = await tx.getResource(key);
            if (mutation === 'missing') { await tx.deleteResource(key); return; }
            const doc = structuredClone(row.doc);
            if (mutation === 'forged-kind') doc.receiptKind = 'delegation';
            if (mutation === 'sibling') doc.childRunId = createNativeId('orchestrationRun');
            if (mutation === 'grant') doc.childGrantDigest = '0'.repeat(64);
            if (mutation === 'input') doc.inputDigest = '0'.repeat(64);
            if (mutation === 'source') doc.sourceBindingDigest = '0'.repeat(64);
            if (mutation === 'plan') doc.childPlanRef = { ...doc.childPlanRef, planRevisionId: createNativeId('orchestrationRevision') };
            if (mutation === 'control-token') doc.controlToken = '0'.repeat(64);
            await putMutable(tx, key, doc, { expectedIntegrity: row.integrity });
        });
        const childBefore = await runs.get(h.handle, outcome.childRunId);
        await expect(pending(outcome.childRunId)).rejects.toMatchObject({ code: 'native_orchestration_handoff_unconfirmed' });
        expect(await runs.get(h.handle, outcome.childRunId)).toEqual(childBefore);
        expect((await parentAttempt()).status).toBe('waiting_child');
    });

    test.each(['parent', 'child'])('handoff %s cancellation preserves the bank and refuses child activation', async target => {
        await setup({ maxConcurrency: 1 });
        const { outcome } = await delegates.handoff(h.handle, await body()); await fund(outcome.childRunId);
        const childRef = await pending(outcome.childRunId), before = await h.engine.withTransaction(h.handle, tx => readRunControl(tx, h.handle, base.session.sessionId));
        const selected = target === 'parent' ? await current() : await runs.get(h.handle, outcome.childRunId);
        await runs.cancel(h.handle, command(), { ...runGuard(selected), reasonCode: 'stop_handoff' });
        await expect(activate(childRef)).rejects.toMatchObject({ code: target === 'parent' ? 'native_orchestration_parent_stale' : 'native_orchestration_child_budget_unconfirmed' });
        expect(await h.engine.withTransaction(h.handle, tx => readRunControl(tx, h.handle, base.session.sessionId))).toEqual(before);
        expect((await parentAttempt()).status).toBe('waiting_child');
    });

    test('handoff same identity replays once while a competing child loses the parent CAS', async () => {
        await setup({ maxConcurrency: 1 });
        const input = await body(), results = await Promise.all([delegates.handoff(h.handle, input), delegates.handoff(h.handle, input)]);
        expect(results.filter(result => result.replayed)).toHaveLength(1);
        expect(results[0].outcome.childRunId).toBe(results[1].outcome.childRunId);
        const stable = await current(); expect(stable.progress.handoffs).toBe(1);
        await expect(delegates.handoff(h.handle, { ...input, inputRefs: ['changed'], inputDigest: hashNativeDocument(['changed']) }))
            .rejects.toMatchObject({ code: 'native_orchestration_command_conflict' });
        await setup({ maxConcurrency: 1 });
        const first = await body(), second = { ...first, delegationId: 'competing-handoff' };
        const settled = await Promise.allSettled([delegates.handoff(h.handle, first), delegates.handoff(h.handle, second)]);
        expect(settled.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        expect(settled.filter(result => result.status === 'rejected').map(result => result.reason.code)).toEqual(['native_orchestration_run_conflict']);
        expect((await current()).progress.handoffs).toBe(1);
        const winner = settled.find(result => result.status === 'fulfilled').value.outcome.childRunId;
        const loser = [delegatedRunId(root.runId, parentAttemptId, first.delegationId), delegatedRunId(root.runId, parentAttemptId, second.delegationId)].find(id => id !== winner);
        await expect(runs.get(h.handle, loser)).rejects.toThrow();
    });

    test.each(['effectRefs', 'resultRefs'])('handoff refuses a parent with previous %s before changing control', async field => {
        const before = await current();
        await h.engine.withTransaction(h.handle, async tx => {
            const key = controlRecordKey(h.handle, root.runId, 'attempt', parentAttemptId), row = await tx.getResource(key);
            const refs = field === 'effectRefs' ? [createNativeId('orchestrationEffect')]
                : [{ runId: root.runId, resultId: createNativeId('orchestrationResult') }];
            await putMutable(tx, key, { ...row.doc, [field]: refs }, { expectedIntegrity: row.integrity });
        });
        await expect(delegates.handoff(h.handle, await body())).rejects.toMatchObject({ code: 'native_orchestration_handoff_not_admitted' });
        expect(await current()).toEqual(before); expect((await parentAttempt()).status).toBe('running');
        expect(scopeCalls).toBe(0);
    });

    test('nested handoffs at concurrency one share root limits and never reset the cumulative handoff allowance', async () => {
        await setup({ maxConcurrency: 1, maxHandoffs: 2 });
        const first = await delegates.handoff(h.handle, await body()); await fund(first.outcome.childRunId);
        const childRef = await pending(first.outcome.childRunId); await activate(childRef);
        const second = await delegates.handoff(h.handle, { ...await body(), ...runGuard(await runs.get(h.handle, childRef.runId)),
            parentAttemptId: childRef.attemptId, delegationId: 'nested-handoff', childPlanRef: await nextPlan(childRef.runId) });
        await fund(second.outcome.childRunId, childRef.runId);
        const grandchildRef = await pending(second.outcome.childRunId); await activate(grandchildRef);
        const before = await current(); expect(before.treeProgress.handoffs).toBe(2); expect(before.progress.handoffs).toBe(1);
        const grandchild = await runs.get(h.handle, grandchildRef.runId);
        expect(grandchild.parentRef.logicalCeiling.handoffs).toBe(0);
        await expect(delegates.handoff(h.handle, { ...await body(), ...runGuard(grandchild), parentAttemptId: grandchildRef.attemptId,
            delegationId: 'beyond-handoff-limit', childPlanRef: await nextPlan(grandchild.runId) }))
            .rejects.toMatchObject({ code: 'native_orchestration_delegation_limit_exhausted' });
        expect(await current()).toEqual(before);
        expect((await parentAttempt()).status).toBe('waiting_child');
    });

    test('child identity, parent receipt and counters commit once; no Attempt without original held bank', async () => {
        const input = await body(), first = await delegates.delegate(h.handle, input);
        const child = await runs.get(h.handle, first.outcome.childRunId);
        expect(child.parentRef).toMatchObject({ parentRunId: root.runId, nodeAttemptId: parentAttemptId, delegationId: 'child-one', parentEpoch: 0, depth: 1 });
        expect(child.parentRef.budgetCeiling).toEqual(childCeiling); expect(first.outcome.delegationReceipt.budgetCeiling).toEqual(childCeiling);
        expect(child.rootRunId).toBe(root.runId); expect(child.sourceBinding).toEqual(root.sourceBinding); expect(child.budgetAuthorityRef).toEqual(root.budgetAuthorityRef);
        await expect(begin(child, childPlan.entryNodeIds[0])).rejects.toMatchObject({ code: 'native_orchestration_child_budget_unconfirmed' });
        await expect(delegates.confirmBudget(h.handle, runGuard(child))).rejects.toMatchObject({ code: 'native_orchestration_child_budget_unavailable' });
        expect((await delegates.delegate(h.handle, await body())).replayed).toBe(true);
        expect((await current()).progress.delegates).toBe(1);
        await expect(delegates.delegate(h.handle, await body({ inputRefs: ['changed'], inputDigest: hashNativeDocument(['changed']) }))).rejects.toMatchObject({ code: 'native_orchestration_command_conflict' });
        await expect(delegates.delegate(h.handle, await body({ budgetCeiling: { ...childCeiling, maxTokens: 5000 } }))).rejects.toMatchObject({ code: 'native_orchestration_command_conflict' });
        await fund(child.runId);
        expect(await begin(await runs.get(h.handle, child.runId), childPlan.entryNodeIds[0])).toMatch(/^oattempt_/);
    });

    test('lost original reservation ACK is reconciled by observation without another bank or child', async () => {
        const { outcome } = await delegates.delegate(h.handle, await body()), childRunId = outcome.childRunId;
        // Original bank commits; the caller loses its ACK. Recovery never
        // charges a new identity, and confirmBudget only reads persisted facts.
        await expect((async () => { await budget.reserveChild(h.handle, { authorityRef: root.budgetAuthorityRef, parentReservationId: null, childRunId, ceiling: childCeiling, limits }); throw Object.assign(new Error('ACK lost'), { code: 'storage_commit_unknown' }); })()).rejects.toMatchObject({ code: 'storage_commit_unknown' });
        const confirmed = await delegates.confirmBudget(h.handle, runGuard(await runs.get(h.handle, childRunId)));
        expect(confirmed.outcome.budgetReceipt.reservationId).toBe(childRunId);
        expect((await delegates.confirmBudget(h.handle, runGuard(await runs.get(h.handle, childRunId)))).replayed).toBe(true);
        const control = await h.engine.withTransaction(h.handle, tx => readRunControl(tx, h.handle, base.session.sessionId));
        expect(control.operations[root.budgetAuthorityRef.operationId].compute.reservations).toHaveLength(1);
        expect((await delegates.delegate(h.handle, await body())).outcome.childRunId).toBe(childRunId);
    });

    test('the original scope proof must approve the exact physical budget ceiling', async () => {
        await expect(delegates.delegate(h.handle, await body({ budgetCeiling: { ...childCeiling, maxTokens: 5000 } })))
            .rejects.toMatchObject({ code: 'native_orchestration_delegation_denied' });
        await expect(delegates.delegate(h.handle, await body({ budgetCeiling: { maxRequests: -1, maxTokens: 10 } }))).rejects.toThrow();
        expect((await current()).progress.delegates).toBe(0);
    });

    test('a larger cap inserted through the original bank cannot confirm the narrower child grant', async () => {
        const { outcome } = await delegates.delegate(h.handle, await body()), childRunId = outcome.childRunId;
        await budget.reserveChild(h.handle, { authorityRef: root.budgetAuthorityRef, parentReservationId: null, childRunId,
            ceiling: { ...childCeiling, maxTokens: 5000 }, limits });
        await expect(delegates.confirmBudget(h.handle, runGuard(await runs.get(h.handle, childRunId))))
            .rejects.toMatchObject({ code: 'native_orchestration_budget_reservation_mismatch' });
        await expect(begin(await runs.get(h.handle, childRunId), childPlan.entryNodeIds[0]))
            .rejects.toMatchObject({ code: 'native_orchestration_child_budget_unconfirmed' });
    });

    test('cancelled parent blocks confirmation and further child execution', async () => {
        const { outcome } = await delegates.delegate(h.handle, await body()); await fund(outcome.childRunId);
        await runs.cancel(h.handle, command(), { ...runGuard(await current()), reasonCode: 'user_cancel' });
        await expect(begin(await runs.get(h.handle, outcome.childRunId), childPlan.entryNodeIds[0])).rejects.toMatchObject({ code: 'native_orchestration_parent_stale' });
        await expect(delegates.delegate(h.handle, await body({ delegationId: 'after-cancel' }))).rejects.toThrow();
    });

    test('a merely prepared parent Attempt and an obsolete epoch cannot delegate', async () => {
        const fresh = await runs.start(h.handle, command(), { planRef: root.planRef, sourceRequest: { domain: 'native_session', sessionId: base.session.sessionId,
            branchId: base.revision.branchId, revisionId: base.revision.revisionId }, retentionPolicyRef: { policyId: 'test-explicit' } });
        const pending = await begin(fresh, fresh.graph.entryNodeIds[0]);
        const input = { ...await body(), ...runGuard(await runs.get(h.handle, fresh.runId)), parentAttemptId: pending, delegationId: 'not-running' };
        await expect(delegates.delegate(h.handle, input)).rejects.toMatchObject({ code: 'native_orchestration_delegation_not_admitted' });
        await expect(delegates.delegate(h.handle, { ...await body(), delegationId: 'old-epoch', expectedEpoch: 1 })).rejects.toMatchObject({ code: 'native_orchestration_run_conflict' });
    });

    test('scope denial, foreign Source and elevated child capabilities leave no child/counter writes', async () => {
        allowed = false;
        await expect(delegates.delegate(h.handle, await body())).rejects.toMatchObject({ code: 'native_orchestration_delegation_denied' });
        allowed = true;
        const elevated = await publish({}, 'tool.invoke');
        await expect(delegates.delegate(h.handle, await body({ childPlanRef: elevated.planRef, returnContract: elevated.definition.outputContract }))).rejects.toMatchObject({ code: 'native_orchestration_child_plan_not_allowed' });
        await original.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Moved Source' });
        await expect(delegates.delegate(h.handle, await body())).rejects.toMatchObject({ code: 'native_orchestration_source_stale' });
        expect((await current()).progress.delegates).toBe(0);
        await expect(runs.get(h.handle, delegatedRunId(root.runId, parentAttemptId, 'child-one'))).rejects.toThrow();
    });

    test('an empty allowed Plan list denies delegation before the controlled scope callback', async () => {
        const empty = await publish(); await start(empty.planRef);
        await expect(delegates.delegate(h.handle, await body())).rejects.toMatchObject({ code: 'native_orchestration_child_plan_not_allowed' });
        expect(scopeCalls).toBe(0); expect((await current()).progress.delegates).toBe(0);
    });

    test('a different exact Plan ref cannot borrow the declared child pin', async () => {
        const unlisted = await publish();
        await expect(delegates.delegate(h.handle, await body({ childPlanRef: unlisted.planRef, returnContract: unlisted.definition.outputContract })))
            .rejects.toMatchObject({ code: 'native_orchestration_child_plan_not_allowed' });
        expect(scopeCalls).toBe(0);
    });

    test('a stale full-revision integrity pin cannot be laundered by an allowing scope callback', async () => {
        const revision = await h.engine.withTransaction(h.handle, tx => readPlanRevision(tx, h.handle, childPlanRef));
        const stale = await publish({}, undefined, [{ planRef: childPlanRef, revision }], undefined, true); await start(stale.planRef);
        await expect(delegates.delegate(h.handle, await body())).rejects.toMatchObject({ code: 'native_orchestration_child_plan_pin_stale' });
        expect(scopeCalls).toBe(0);
    });

    test('a rewritten child revision is refused by its exact pin before any scope callback', async () => {
        const revision = await h.engine.withTransaction(h.handle, tx => readPlanRevision(tx, h.handle, childPlanRef));
        await h.engine.withTransaction(h.handle, tx => putMutable(tx, { kind: K.orchestrationRevision, handle: h.handle,
            planId: childPlanRef.planId, planRevisionId: childPlanRef.planRevisionId }, { ...revision, authorRef: { handle: 'foreign-owner' } }));
        await expect(delegates.delegate(h.handle, await body())).rejects.toMatchObject({ code: 'native_orchestration_child_plan_pin_stale' });
        expect(scopeCalls).toBe(0);
    });

    test('nested delegates share root bank and cumulative root delegate/depth limits', async () => {
        const { outcome } = await delegates.delegate(h.handle, await body()); await fund(outcome.childRunId);
        let child = await runs.get(h.handle, outcome.childRunId);
        const childAttemptId = await begin(child, childPlan.entryNodeIds[0]);
        await attempts.activate(h.handle, { ...runGuard(await runs.get(h.handle, child.runId)), attemptId: childAttemptId });
        child = await runs.get(h.handle, child.runId);
        const nested = await delegates.delegate(h.handle, { ...runGuard(child), parentAttemptId: childAttemptId, delegationId: 'grandchild', childPlanRef: await nextPlan(child.runId),
            inputRefs: [], inputDigest: hashNativeDocument([]), effectiveGrantDigest: grant, returnContract: childPlan.outputContract, budgetCeiling: childCeiling });
        const grandchild = await runs.get(h.handle, nested.outcome.childRunId);
        expect(grandchild.rootRunId).toBe(root.runId); expect(grandchild.parentRef.depth).toBe(2); expect(grandchild.budgetAuthorityRef).toEqual(root.budgetAuthorityRef);
        expect((await current()).treeProgress).toMatchObject({ delegates: 2, depth: 2 });
        await fund(grandchild.runId, child.runId);
    });

    test.each([{ maxDelegates: 1 }, { maxDepth: 1 }, { maxConcurrency: 2 }])('tree ceiling %j cannot be reset by a fresh child Run', async ceiling => {
        await setup(ceiling);
        const { outcome } = await delegates.delegate(h.handle, await body()); await fund(outcome.childRunId);
        let child = await runs.get(h.handle, outcome.childRunId);
        const childAttemptId = await begin(child, childPlan.entryNodeIds[0]);
        await attempts.activate(h.handle, { ...runGuard(await runs.get(h.handle, child.runId)), attemptId: childAttemptId });
        child = await runs.get(h.handle, child.runId);
        await expect(delegates.delegate(h.handle, { ...runGuard(child), parentAttemptId: childAttemptId, delegationId: 'over-limit', childPlanRef: await nextPlan(child.runId),
            inputRefs: [], inputDigest: hashNativeDocument([]), effectiveGrantDigest: grant, returnContract: childPlan.outputContract, budgetCeiling: childCeiling })).rejects.toMatchObject({ code: 'native_orchestration_delegation_limit_exhausted' });
        expect((await current()).progress.delegates).toBe(1);
    });

    test.each([{ maxDelegates: 1 }, { maxConcurrency: 2 }])('narrow intermediate ancestor %j remains binding across grandchildren', async ceiling => {
        await setup({}, ceiling);
        const first = await delegates.delegate(h.handle, await body()); await fund(first.outcome.childRunId);
        const childId = first.outcome.childRunId;
        const childAttempt = await begin(await runs.get(h.handle, childId), childPlan.entryNodeIds[0]);
        await attempts.activate(h.handle, { ...runGuard(await runs.get(h.handle, childId)), attemptId: childAttempt });
        const nestedInput = { ...await body(), ...runGuard(await runs.get(h.handle, childId)), parentAttemptId: childAttempt, delegationId: 'grandchild', childPlanRef: await nextPlan(childId) };
        const nested = await delegates.delegate(h.handle, nestedInput), grandchildId = nested.outcome.childRunId;
        await fund(grandchildId, childId);
        const grandchildAttempt = await begin(await runs.get(h.handle, grandchildId), childPlan.entryNodeIds[0]);
        await attempts.activate(h.handle, { ...runGuard(await runs.get(h.handle, grandchildId)), attemptId: grandchildAttempt });
        await expect(delegates.delegate(h.handle, { ...await body(), ...runGuard(await runs.get(h.handle, grandchildId)), parentAttemptId: grandchildAttempt, delegationId: 'great-grandchild', childPlanRef: await nextPlan(grandchildId) }))
            .rejects.toMatchObject({ code: 'native_orchestration_delegation_limit_exhausted' });
        expect((await current()).treeProgress.delegates).toBe(2);
        expect((await runs.get(h.handle, childId)).progress.delegates).toBe(1);
    });

    test('competing child admissions share the parent CAS and cannot double-increment counters', async () => {
        const first = await body(), second = { ...first, delegationId: 'competing-child' };
        const settled = await Promise.allSettled([delegates.delegate(h.handle, first), delegates.delegate(h.handle, second)]);
        expect(settled.filter(item => item.status === 'fulfilled')).toHaveLength(1);
        expect(settled.filter(item => item.status === 'rejected')).toHaveLength(1);
        expect((await current()).progress.delegates).toBe(1);
    });

    test('concurrent activation in different child Runs shares the root actual Attempt ceiling', async () => {
        await setup({ maxConcurrency: 3 });
        const first = await delegates.delegate(h.handle, await body()); await fund(first.outcome.childRunId);
        const second = await delegates.delegate(h.handle, await body({ delegationId: 'second-child' })); await fund(second.outcome.childRunId);
        const firstChildId = first.outcome.childRunId, secondChildId = second.outcome.childRunId;
        const firstAttempt = await begin(await runs.get(h.handle, firstChildId), childPlan.entryNodeIds[0]);
        await attempts.activate(h.handle, { ...runGuard(await runs.get(h.handle, firstChildId)), attemptId: firstAttempt });
        const extraNodeId = childPlan.nodes.find(node => node.kind === 'agent' && node.nodeId !== childPlan.entryNodeIds[0]).nodeId;
        const firstExtra = await begin(await runs.get(h.handle, firstChildId), extraNodeId);
        const secondAttempt = await begin(await runs.get(h.handle, secondChildId), childPlan.entryNodeIds[0]);
        const results = await Promise.allSettled([
            attempts.activate(h.handle, { ...runGuard(await runs.get(h.handle, firstChildId)), attemptId: firstExtra }),
            attempts.activate(h.handle, { ...runGuard(await runs.get(h.handle, secondChildId)), attemptId: secondAttempt }),
        ]);
        expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(item => item.status === 'rejected').map(item => item.reason.code)).toEqual(['native_orchestration_tree_concurrency_exhausted']);
    });

    test('actual grandchild Attempts cannot consume a narrow ancestor concurrency slot twice', async () => {
        await setup({}, { maxConcurrency: 2 });
        const first = await delegates.delegate(h.handle, await body()); await fund(first.outcome.childRunId);
        const childId = first.outcome.childRunId, childAttempt = await begin(await runs.get(h.handle, childId), childPlan.entryNodeIds[0]);
        await attempts.activate(h.handle, { ...runGuard(await runs.get(h.handle, childId)), attemptId: childAttempt });
        const nested = await delegates.delegate(h.handle, { ...await body(), ...runGuard(await runs.get(h.handle, childId)), parentAttemptId: childAttempt, delegationId: 'grandchild', childPlanRef: await nextPlan(childId) });
        await fund(nested.outcome.childRunId, childId);
        const grandchildAttempt = await begin(await runs.get(h.handle, nested.outcome.childRunId), childPlan.entryNodeIds[0]);
        await attempts.activate(h.handle, { ...runGuard(await runs.get(h.handle, nested.outcome.childRunId)), attemptId: grandchildAttempt });
        const extraId = childPlan.nodes.find(node => node.kind === 'agent' && node.nodeId !== childPlan.entryNodeIds[0]).nodeId;
        const extraAttempt = await begin(await runs.get(h.handle, childId), extraId);
        await expect(attempts.activate(h.handle, { ...runGuard(await runs.get(h.handle, childId)), attemptId: extraAttempt })).rejects.toMatchObject({ code: 'native_orchestration_tree_concurrency_exhausted' });
    });

    test('siblings cannot refresh the root remaining Attempt grant and competing admission is atomic', async () => {
        const children = await siblings({ maxAttempts: 2 });
        const before = await current();
        expect(before.treeProgress.attempts).toBe(1);
        for (const childId of children) expect((await runs.get(h.handle, childId)).parentRef.logicalCeiling.attempts).toBe(1);
        const results = await Promise.allSettled(children.map(childId => pending(childId)));
        expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(item => item.status === 'rejected').map(item => item.reason.code)).toEqual(['native_orchestration_tree_limit_exhausted']);
        const after = await current();
        expect(after.progress.attempts).toBe(1); expect(after.treeProgress.attempts).toBe(2);
        const loser = children[results.findIndex(item => item.status === 'rejected')];
        expect((await runs.get(h.handle, loser)).attemptRefs).toEqual([]);
    });

    test('siblings cannot refresh the root remaining steps when real Attempts activate', async () => {
        const children = await siblings({ maxSteps: 2 }), refs = await Promise.all(children.map(childId => pending(childId)));
        const results = await Promise.allSettled(refs.map(ref => activate(ref)));
        expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(item => item.status === 'rejected').map(item => item.reason.code)).toEqual(['native_orchestration_tree_limit_exhausted']);
        expect((await current()).treeProgress.steps).toBe(2); expect((await current()).progress.steps).toBe(1);
    });

    test('real sibling GraphPatches share the root patch cap, replay once and never refund on cancel', async () => {
        const children = await siblings({ maxPatches: 1 }), refs = await Promise.all(children.map(childId => pending(childId)));
        for (const ref of refs) await activate(ref);
        const graph = new GraphController({ runs, authorizePatch: ({ root: run }) => source.revalidate(h.handle, run.sourceBinding) });
        const inputs = await Promise.all(refs.map(async ref => {
            const run = await runs.get(h.handle, ref.runId);
            const patch = { schemaVersion: 1, patchId: createNativeId('orchestrationPatch'), runId: ref.runId, producerAttemptId: ref.attemptId,
                expectedEpoch: run.epoch, expectedGraphRevision: run.graphRevision,
                operations: [{ op: 'setPendingPriority', nodeId: childPlan.outputContract.ownerNodeId, priority: 2 }], reasonRefs: [] };
            return { expectedStateVersion: run.stateVersion, patch: { ...patch, payloadHash: graphPatchHash(patch) } };
        }));
        const results = await Promise.allSettled(inputs.map(input => graph.propose(h.handle, input)));
        expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(item => item.status === 'rejected').map(item => item.reason.code)).toEqual(['native_orchestration_tree_limit_exhausted']);
        const winnerIndex = results.findIndex(item => item.status === 'fulfilled'), loserIndex = 1 - winnerIndex;
        const snapshot = await current(); expect(snapshot.treeProgress.patches).toBe(1); expect(snapshot.progress.patches).toBe(0);
        expect((await graph.propose(h.handle, inputs[winnerIndex])).replayed).toBe(true);
        expect((await current()).treeProgress).toEqual(snapshot.treeProgress);
        expect((await runs.get(h.handle, children[loserIndex])).graphRevision).toBe(0);
        expect(await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: h.handle, runId: children[loserIndex], recordType: 'patch' }))).toEqual([]);
        await runs.cancel(h.handle, command(), { ...runGuard(await runs.get(h.handle, children[winnerIndex])), reasonCode: 'stop_child' });
        expect((await current()).treeProgress).toEqual(snapshot.treeProgress);
    });

    test('grandparent remaining steps constrain a deeper child even with equal static Plan limits', async () => {
        await setup({ maxSteps: 3 });
        const first = await delegates.delegate(h.handle, await body()); await fund(first.outcome.childRunId);
        const childRef = await pending(first.outcome.childRunId); await activate(childRef);
        const nested = await delegates.delegate(h.handle, { ...await body(), ...runGuard(await runs.get(h.handle, childRef.runId)), parentAttemptId: childRef.attemptId, delegationId: 'grandchild', childPlanRef: await nextPlan(childRef.runId) });
        await fund(nested.outcome.childRunId, childRef.runId);
        const grandchild = await runs.get(h.handle, nested.outcome.childRunId);
        expect(grandchild.parentRef.logicalCeiling.steps).toBe(1);
        const grandchildRef = await pending(grandchild.runId); await activate(grandchildRef);
        const extraId = childPlan.nodes.find(node => node.kind === 'agent' && node.nodeId !== childPlan.entryNodeIds[0]).nodeId;
        const extra = await pending(childRef.runId, extraId);
        await expect(activate(extra)).rejects.toMatchObject({ code: 'native_orchestration_tree_limit_exhausted' });
        expect((await current()).treeProgress.steps).toBe(3);
    });

    test('child edge costs accumulate only scalar tree visits while each graph keeps its own edge map', async () => {
        const children = await siblings({ maxEdgeVisits: 1 }), entries = await Promise.all(children.map(childId => pending(childId)));
        const edge = childPlan.edges[0], targets = await Promise.all(children.map(childId => pending(childId, edge.to.nodeId)));
        const results = await Promise.allSettled(entries.map(async (entry, index) => runs.control(h.handle, command(), {
            ...runGuard(await runs.get(h.handle, entry.runId)), operation: 'loop.advance', detail: { entry: entry.attemptId, target: targets[index].attemptId },
        }, async ({ tx, root: run, now }) => {
            await source.revalidate(h.handle, run.sourceBinding);
            await admitGraphEdges({ tx, handle: h.handle, root: run, transfers: [{ edgeId: edge.edgeId, producerAttemptId: entry.attemptId, nodeAttemptId: targets[index].attemptId }], now });
            return { root: run, eventType: 'test_guarded_edge', reasonCode: null, outcome: {} };
        })));
        expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(item => item.status === 'rejected').map(item => item.reason.code)).toEqual(['native_orchestration_tree_limit_exhausted']);
        const tree = await current(); expect(tree.treeProgress.edgeVisits).toBe(1); expect(tree.progress.edgeVisits).toBe(0); expect(tree.progress.edgeVisitCounts).toEqual({});
        for (const childId of children) {
            const child = await runs.get(h.handle, childId);
            expect(Object.values(child.progress.edgeVisitCounts).reduce((sum, count) => sum + count, 0)).toBe(child.progress.edgeVisits);
        }
    });

    test('failure after staged ancestor counters rolls back every root and retries/replays charge once', async () => {
        const first = await delegates.delegate(h.handle, await body()); await fund(first.outcome.childRunId);
        const child = await runs.get(h.handle, first.outcome.childRunId), before = await current(), id = command();
        const request = { ...runGuard(child), nodeId: childPlan.entryNodeIds[0], inputRefs: [], inputDigest: hashNativeDocument([]), effectiveGrantDigest: grant, budgetRef: child.budgetAuthorityRef };
        const originalTx = h.engine.withTransaction.bind(h.engine); let injected = false, ancestorStaged = false;
        h.engine.withTransaction = (handle, operation, options) => originalTx(handle, async tx => {
            // Keep the real Host-fenced transaction and its methods intact.
            // Fail after all metadata is staged but before the Engine commits.
            const result = await operation(tx);
            if (result?.runId === child.runId && result.attemptId) {
                const parentRow = await tx.getResource({ kind: K.orchestrationRun, handle, runId: root.runId });
                ancestorStaged = parentRow.doc.treeProgress.attempts === before.treeProgress.attempts + 1;
                injected = true; throw new Error('staged-child-write-failure');
            }
            return result;
        }, options);
        try { await expect(runs.beginAttempt(h.handle, id, request)).rejects.toThrow('staged-child-write-failure'); }
        finally { h.engine.withTransaction = originalTx; }
        expect(injected).toBe(true); expect(ancestorStaged).toBe(true); expect(await current()).toEqual(before); expect(await runs.get(h.handle, child.runId)).toEqual(child);
        const admitted = await runs.beginAttempt(h.handle, id, request);
        expect((await current()).treeProgress.attempts).toBe(before.treeProgress.attempts + 1);
        expect(await runs.beginAttempt(h.handle, id, request)).toEqual(admitted);
        expect((await current()).treeProgress.attempts).toBe(before.treeProgress.attempts + 1);
    });
});

test('delegation cannot be created without explicit original authority adapters', () => {
    expect(() => new DelegateController({ runs: {} })).toThrow('original scope and reservation authorities');
});
