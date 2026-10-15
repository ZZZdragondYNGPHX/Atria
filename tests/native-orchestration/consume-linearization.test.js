import { modelPortFixture } from './helpers/model-port-fixture.js';
import { jest } from '@jest/globals';
import { toolCompletionFixture } from './helpers/tool-completion-fixture.js';
import { PlanRepository, validationDigest, readPlanRevision } from '../../src/native/orchestration/plan-repository.js';
import { RunRepository } from '../../src/native/orchestration/run-repository.js';
import { DelegateController } from '../../src/native/orchestration/delegate-controller.js';
import { AttemptController } from '../../src/native/orchestration/attempt-controller.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { SourcePort } from '../../src/native/orchestration/source-port.js';
import { runGuard, controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';
import { hashNativeDocument as hash, putMutable, withNativeResourceWrites } from '../../src/native/repositories/common.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../src/native/identity.js';
import { installFixture } from '../native/helpers/session-fixture.js';
import { planFixture, prepareControllerOwnerRoot } from './fixtures.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

const id = kind => createNativeId('orchestration' + kind);
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const harnesses = CONTRACT_HARNESSES.filter(({ name }) => process.env.ATRIA_TEST_CONSUME_SQL === '1' || ['FsEngine', 'SqliteEngine'].includes(name));
if (process.env.ATRIA_TEST_CONSUME_SQL === '1') jest.setTimeout(60000);
const cases = ['Model', 'Skill'].flatMap(producer => ['cancel', 'unknown'].map(change => [producer, change]));

async function changeCurrent(runs, handle, ref, change) {
    const root = await runs.get(handle, ref.runId);
    if (change === 'cancel') return runs.cancel(handle, id('Command'), { ...runGuard(root), reasonCode: 'independent_cancel_before_consume' });
    // Explicit original-CAS fault injection, not a fabricated remote proof.
    return runs.control(handle, id('Command'), { ...runGuard(root), operation: 'effect.observe', detail: { effectId: ref.effectId, fault: 'current_unknown' } }, async ({ tx, root }) => {
        const row = await readEffect(tx, handle, root, ref.effectId);
        await putMutable(tx, controlRecordKey(handle, root.runId, 'effect', ref.effectId), { ...row.doc, status: 'unknown' }, { expectedIntegrity: row.integrity });
        root.status = 'reconciling';
        if (!root.pendingEffectRefs.includes(ref.effectId)) root.pendingEffectRefs.push(ref.effectId);
        return { root, eventType: 'effect_observed', reasonCode: 'test_injected_current_unknown', outcome: { effectId: ref.effectId, status: 'unknown' } };
    });
}

async function childFixture(make) {
    const h = await make();
    try {
        await prepareControllerOwnerRoot(h.dirs.root);
        const lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        const original = await installFixture(h), base = await original.core.create(h.handle, original.start);
        const budget = new BudgetPort({ sessionCore: original.core }), source = new SourcePort({ budgetPort: budget, sessionCore: original.core });
        const assertWriter = (handle, tx) => lifecycle.assertWriter(handle, tx), authorize = async () => {};
        const plans = new PlanRepository({ engine: h.engine, assertWriter, authorize, validateDependencies: async () => ({ status: 'valid', issues: [], dependencyDigest: hash([]) }) });
        const publish = async input => {
            const draft = await plans.create(h.handle, id('Command'), input), expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
            const report = await plans.validate(h.handle, expected);
            expect(report.status).toBe('valid');
            return (await plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) })).planRef;
        };
        const childPlan = planFixture(), childPlanRef = await publish(childPlan);
        const childRevision = await h.engine.withTransaction(h.handle, tx => readPlanRevision(tx, h.handle, childPlanRef));
        const parentPlan = planFixture(), output = parentPlan.definition.nodes[0], nodeId = id('Node');
        parentPlan.definition.nodes = [{ nodeId, kind: 'agent', label: 'Controlled Delegate', inputs: [], outputs: [{ name: 'next', type: 'task.result', required: false }],
            dependencyPinIds: ['route', 'child'], capabilities: ['agent.delegate'], policy: { agentPinId: 'route', allowedPlanPinIds: ['child'] } },
        { ...output, inputs: [{ name: 'in', type: 'task.result', required: true }] }];
        parentPlan.definition.entryNodeIds = [nodeId]; parentPlan.definition.capabilityCeiling = ['agent.delegate'];
        parentPlan.definition.edges = [{ edgeId: id('Edge'), from: { nodeId, port: 'next' }, to: { nodeId: output.nodeId, port: 'in' }, condition: 'always', loopBack: false, maxVisits: 1 }];
        parentPlan.dependencyPins = [{ pinId: 'route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: createNativeId('runtimeRoute') }, integrity: 'a'.repeat(64) },
            { pinId: 'child', port: 'plan', resourceRef: childPlanRef, integrity: hash(childRevision) }];
        const parentPlanRef = await publish(parentPlan);
        const runs = new RunRepository({ engine: h.engine, assertWriter, authorize, admit: ({ handle, sourceRequest }) => source.capture(handle, sourceRequest) });
        const grant = 'b'.repeat(64), limits = { maxRequests: 4, maxTokens: 4000 }, ceiling = { maxRequests: 2, maxTokens: 2000 };
        const root = await runs.start(h.handle, id('Command'), { planRef: parentPlanRef,
            sourceRequest: { domain: 'native_session', sessionId: base.session.sessionId, branchId: base.revision.branchId, revisionId: base.revision.revisionId }, retentionPolicyRef: { policyId: 'controlled-test-retention' } });
        const begin = async (run, nodeId) => (await runs.beginAttempt(h.handle, id('Command'), { ...runGuard(run), nodeId,
            inputRefs: [], inputDigest: hash([]), effectiveGrantDigest: grant, budgetRef: run.budgetAuthorityRef })).attemptId;
        const attempts = new AttemptController({ runs, authorizeAttempt: async ({ root }) => source.revalidate(h.handle, root.sourceBinding) });
        const parentAttemptId = await begin(root, nodeId);
        await attempts.activate(h.handle, { ...runGuard(await runs.get(h.handle, root.runId)), attemptId: parentAttemptId });
        // The delegation grant is an explicit controlled test authority. All
        // child identity, ancestry, reservation and storage paths are original.
        const delegates = new DelegateController({ runs, authorizeDelegation: async ({ parent, parentAttempt }) => ({ allowed: true,
            parentGrantDigest: parentAttempt.effectiveGrantDigest, effectiveGrantDigest: grant, budgetCeilingDigest: hash(ceiling), sourceBindingDigest: parent.sourceBinding.bindingDigest }),
        verifyReservation: args => budget.verifyReservation(args) });
        const { outcome } = await delegates.delegate(h.handle, { ...runGuard(await runs.get(h.handle, root.runId)), parentAttemptId,
            delegationId: 'controlled-child', childPlanRef, inputRefs: [], inputDigest: hash([]), effectiveGrantDigest: grant,
            returnContract: childPlan.definition.outputContract, budgetCeiling: ceiling });
        const childId = outcome.childRunId;
        await budget.reserveChild(h.handle, { authorityRef: root.budgetAuthorityRef, parentReservationId: null, childRunId: childId, ceiling, limits });
        await delegates.confirmBudget(h.handle, runGuard(await runs.get(h.handle, childId)));
        const childAttempt = await begin(await runs.get(h.handle, childId), childPlan.definition.entryNodeIds[0]);
        await attempts.activate(h.handle, { ...runGuard(await runs.get(h.handle, childId)), attemptId: childAttempt });
        return { h, runs, rootId: root.runId, childId, cleanup: async () => { await h.engine.close(); await h.cleanup(); } };
    } catch (error) { await h.engine.close(); await h.cleanup(); throw error; }
}

describe.each(harnesses)('$name independent Run consumption order', ({ make }) => {
    test.each(cases)('%s %s committed from an ALS-independent task before consumption denies body', async (producer, change) => {
        const model = producer === 'Model', f = await (model ? modelPortFixture(make) : toolCompletionFixture(make, 'skill_read'));
        const trigger = deferred(), events = [], exec = model ? f.authority.execution : f.exec, runs = exec.runs;
        const ref = () => model ? f.effectRef : { runId: f.root.runId, effectId: f.effectId };
        // Register outside every original transaction and resource-write scope.
        const writer = trigger.promise.then(async () => { await changeCurrent(runs, f.h.handle, ref(), change); events.push('writer_committed'); });
        try {
            const observe = exec.effects.observe.bind(exec.effects);
            exec.effects.observe = async (...args) => { const ack = await observe(...args); trigger.resolve(); await writer; return ack; };
            await expect(f.start()).rejects.toThrow();
            expect(events).toEqual(['writer_committed']); expect(model ? f.requests.length : f.calls.length).toBe(model ? 1 : 0);
            const current = await runs.get(f.h.handle, ref().runId);
            expect(change === 'cancel' ? current.cancelRequested : (await f.observe()).outcome === 'unknown').toBe(true);
            const committed = await f.core.observe(f.h.handle, model ? f.input.sessionId : f.root.sourceBinding.sourceRef.sessionId);
            expect(committed.timeline.some(row => row.content.includes(model ? 'Synthetic native narrator response.' : 'Synthetic Skill body'))).toBe(false);
            await f.cold(); expect((await f.observe()).outcome).toBe(change === 'cancel' ? 'confirmed' : 'unknown');
        } finally { await f.cleanup(); }
    });

    test.each(cases)('%s consumption decides before an independently queued %s writer acquires its original Run lock', async (producer, change) => {
        const model = producer === 'Model', f = await (model ? modelPortFixture(make) : toolCompletionFixture(make, 'skill_read'));
        const trigger = deferred(), release = deferred(), events = [], runs = (model ? f.authority.execution : f.exec).runs;
        const ref = () => model ? f.effectRef : { runId: f.root.runId, effectId: f.effectId };
        const driver = trigger.promise.then(async () => {
            const writer = withNativeResourceWrites(f.h.handle, [ref().runId], async () => {
                events.push('writer_lock_acquired'); await changeCurrent(runs, f.h.handle, ref(), change); events.push('writer_committed');
            });
            // A disjoint original command lock is a deterministic queue barrier,
            // not a sleep or another scheduler/lock implementation.
            await withNativeResourceWrites(f.h.handle, [id('Command')], () => { release.resolve(); });
            await writer;
        });
        try {
            const consume = runs.withConsumption.bind(runs);
            runs.withConsumption = (handle, runId, work) => consume(handle, runId, async scope => {
                trigger.resolve(); await release.promise;
                const value = await work(scope); events.push('consume_decided'); return value;
            });
            const result = await f.start(); await driver;
            expect(events).toEqual(['consume_decided', 'writer_lock_acquired', 'writer_committed']); expect(model ? f.requests.length : f.calls.length).toBe(model ? 1 : 0);
            expect(JSON.stringify(result)).toContain(model ? 'Synthetic native narrator response.' : 'Synthetic Skill body');
            expect(change === 'cancel' ? (await runs.get(f.h.handle, ref().runId)).cancelRequested : (await f.observe()).outcome === 'unknown').toBe(true);
            // This proves the Port decision only. Native finalize/OutputClaim
            // cancellation fencing is a separate P4 business-write requirement.
        } finally { release.resolve(); await f.cleanup(); }
    });

    test('a real Delegate child cannot consume after independent ancestor cancellation has committed', async () => {
        const f = await childFixture(make), trigger = deferred();
        const writer = trigger.promise.then(() => changeCurrent(f.runs, f.h.handle, { runId: f.rootId }, 'cancel'));
        try {
            trigger.resolve(); await writer;
            let reads = 0;
            await expect(f.runs.withConsumption(f.h.handle, f.childId, async () => { reads++; return 'controlled child value'; })).rejects.toThrow();
            expect(reads).toBe(0); expect((await f.runs.get(f.h.handle, f.rootId)).cancelRequested).toBe(true);
        } finally { await f.cleanup(); }
    });

    test('a real Delegate child holds its original ancestor lock through the consumption decision', async () => {
        const f = await childFixture(make), trigger = deferred(), release = deferred(), events = [];
        const driver = trigger.promise.then(async () => {
            const writer = withNativeResourceWrites(f.h.handle, [f.rootId], async () => {
                events.push('parent_lock_acquired'); await changeCurrent(f.runs, f.h.handle, { runId: f.rootId }, 'cancel'); events.push('cancel_committed');
            });
            await withNativeResourceWrites(f.h.handle, [id('Command')], () => { release.resolve(); });
            await writer;
        });
        try {
            const result = await f.runs.withConsumption(f.h.handle, f.childId, async () => {
                trigger.resolve(); await release.promise; events.push('consume_decided'); return 'controlled child value';
            });
            await driver;
            expect(result).toBe('controlled child value'); expect(events).toEqual(['consume_decided', 'parent_lock_acquired', 'cancel_committed']);
            expect((await f.runs.get(f.h.handle, f.rootId)).cancelRequested).toBe(true);
        } finally { release.resolve(); await f.cleanup(); }
    });
});
