import { jest } from '@jest/globals';
import { rpConsumptionFixture } from './helpers/rp-consumption-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { PlanRepository, validationDigest, readPlanRevision } from '../../src/native/orchestration/plan-repository.js';
import { DelegateController } from '../../src/native/orchestration/delegate-controller.js';
import { AttemptController } from '../../src/native/orchestration/attempt-controller.js';
import { createOrchestrationAuthoringService } from '../../src/native/orchestration/authoring-service.js';
import { runGuard } from '../../src/native/orchestration/controller-common.js';
import { createNativeId } from '../../src/native/identity.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { hashNativeDocument as hash, withNativeResourceWrites } from '../../src/native/repositories/common.js';
import { withRuntimeWrite } from '../../src/native/model-prompt-runtime/runtime-write.js';
import { planFixture } from './fixtures.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const turn = () => new Promise(resolve => setImmediate(resolve));
const command = () => createNativeId('orchestrationCommand');
const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name) || process.env.ATRIA_TEST_SOURCE_CONTROL_SQL === '1');
if (process.env.ATRIA_TEST_SOURCE_CONTROL_SQL === '1') jest.setTimeout(60_000);

// An actual delegated RP Run for ancestry-lock tests. Only its Plan/grant
// decision is controlled; no Model, ResultEnvelope or return grant is issued.
async function childFixture(make) {
    const f = await rpConsumptionFixture(make);
    try {
        const lifecycle = f.h.engine.nativeHostLifecycle, plans = new PlanRepository({ engine: f.h.engine,
            assertWriter: (handle, tx) => lifecycle.assertWriter(handle, tx), authorize: async () => {},
            validateDependencies: async () => ({ status: 'valid', issues: [], dependencyDigest: hash([]) }) });
        const childPlanRef = f.root.planRef, childPlan = await f.h.engine.withTransaction(f.h.handle, tx => readPlanRevision(tx, f.h.handle, childPlanRef));
        const plan = planFixture(), nodeId = createNativeId('orchestrationNode'), output = plan.definition.nodes[0];
        plan.definition.nodes = [{ nodeId, kind: 'agent', label: 'Controlled metadata parent', inputs: [], outputs: [{ name: 'next', type: 'task.result', required: false }],
            dependencyPinIds: ['route', 'child'], capabilities: ['agent.delegate'], policy: { agentPinId: 'route', allowedPlanPinIds: ['child'] } },
        { ...output, inputs: [{ name: 'in', type: 'task.result', required: true }] }];
        plan.definition.entryNodeIds = [nodeId]; plan.definition.capabilityCeiling = ['agent.delegate'];
        plan.definition.edges = [{ edgeId: createNativeId('orchestrationEdge'), from: { nodeId, port: 'next' }, to: { nodeId: output.nodeId, port: 'in' }, condition: 'always', loopBack: false, maxVisits: 1 }];
        plan.dependencyPins = [{ pinId: 'route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: createNativeId('runtimeRoute') }, integrity: 'a'.repeat(64) },
            { pinId: 'child', port: 'plan', resourceRef: childPlanRef, integrity: hash(childPlan) }];
        const draft = await plans.create(f.h.handle, command(), plan), expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
        const report = await plans.validate(f.h.handle, expected);
        const { planRef } = await plans.publish(f.h.handle, command(), { ...expected, validationDigest: validationDigest(report) });
        const root = await f.runs.start(f.h.handle, command(), { planRef, sourceRequest: f.sourceRequest, retentionPolicyRef: { policyId: 'controlled_source_lock' } });
        const grant = hash(root.sourceBinding), ceiling = { maxRequests: 2, maxTokens: 2000 }, limits = { maxRequests: 4, maxTokens: 4000 };
        const { attemptId } = await f.runs.beginAttempt(f.h.handle, command(), { ...runGuard(root), nodeId, inputRefs: [], inputDigest: hash([]), effectiveGrantDigest: grant, budgetRef: root.budgetAuthorityRef });
        await new AttemptController({ runs: f.runs, authorizeAttempt: ({ tx, root }) => f.source.revalidate(f.h.handle, root.sourceBinding, { tx }) })
            .activate(f.h.handle, { ...runGuard(await f.runs.get(f.h.handle, root.runId)), attemptId });
        const delegates = new DelegateController({ runs: f.runs, authorizeDelegation: async ({ tx, parent, parentAttempt }) => {
            await f.source.revalidate(f.h.handle, parent.sourceBinding, { tx });
            return { allowed: true, parentGrantDigest: parentAttempt.effectiveGrantDigest, effectiveGrantDigest: grant, budgetCeilingDigest: hash(ceiling), sourceBindingDigest: parent.sourceBinding.bindingDigest };
        }, verifyReservation: args => f.budget.verifyReservation(args) });
        const { outcome } = await delegates.delegate(f.h.handle, { ...runGuard(await f.runs.get(f.h.handle, root.runId)), parentAttemptId: attemptId, delegationId: 'source-lock-child',
            childPlanRef, inputRefs: [], inputDigest: hash([]), effectiveGrantDigest: grant, returnContract: childPlan.definition.outputContract, budgetCeiling: ceiling });
        await f.budget.reserveChild(f.h.handle, { authorityRef: root.budgetAuthorityRef, parentReservationId: null, childRunId: outcome.childRunId, ceiling, limits });
        await delegates.confirmBudget(f.h.handle, runGuard(await f.runs.get(f.h.handle, outcome.childRunId)));
        return { ...f, parentRunId: root.runId, childRunId: outcome.childRunId };
    } catch (error) { await f.cleanup(); throw error; }
}

describe.each(harnesses)('$name same-source metadata control boundary', ({ make }) => {
    let f;
    afterEach(async () => { jest.restoreAllMocks(); await f?.cleanup(); });
    const control = (operation, runId = f.root.runId, withAuthority = f.boundary()) => f.runs.withSourceControl(f.h.handle, runId, operation, { withAuthority });
    const current = () => f.runs.get(f.h.handle, f.root.runId);
    const metadata = async (id, input) => f.runs.control(f.h.handle, id, input, async ({ tx, root }) => {
        await f.source.revalidate(f.h.handle, root.sourceBinding, { tx });
        root.progress.steps++;
        return { root, eventType: 'controlled_metadata_updated', reasonCode: null, outcome: { metadataOnly: true } };
    });

    test('operation and original authority boundary are mandatory before any source access', async () => {
        f = await rpConsumptionFixture(make);
        let calls = 0;
        const operation = () => { calls++; }, authority = next => { calls++; return next(); };
        await expect(f.runs.withSourceControl(f.h.handle, f.root.runId, operation)).rejects.toThrow('operation and original authority boundary');
        await expect(f.runs.withSourceControl(f.h.handle, f.root.runId, null, { withAuthority: authority })).rejects.toThrow('operation and original authority boundary');
        await expect(f.runs.withSourceControl(f.h.handle, f.root.runId, operation, { withAuthority: false })).rejects.toThrow('operation and original authority boundary');
        expect(calls).toBe(0);
    });

    test('an original control CAS may commit its own Run metadata inside the source boundary', async () => {
        f = await rpConsumptionFixture(make);
        const before = await current(), id = command(), input = { ...runGuard(before), operation: 'run.resume', detail: { purpose: 'controlled_metadata' } };
        const result = await control(() => metadata(id, input));
        expect(result.outcome).toEqual({ runId: before.runId, metadataOnly: true, versions: expect.any(Object) });
        const after = await current(); expect(after.stateVersion).toBe(before.stateVersion + 1); expect(after.progress.steps).toBe(before.progress.steps + 1);
        expect((await control(() => metadata(id, input))).replayed).toBe(true);
        expect(await current()).toEqual(after);
    });

    test('Run creation without an existing lineage keeps one stable command outcome under competition', async () => {
        f = await rpConsumptionFixture(make);
        const id = command(), input = { planRef: f.root.planRef, sourceRequest: f.sourceRequest, retentionPolicyRef: { policyId: 'controlled_create_replay' } };
        const before = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
        const [first, second] = await Promise.all([f.runs.start(f.h.handle, id, input), f.runs.start(f.h.handle, id, input)]);
        expect(second).toEqual(first); expect(first.runId).not.toBe(f.root.runId);
        const after = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
        expect(after.length).toBe(before.length + 1);
        expect(first.budgetAuthorityRef).toEqual(f.root.budgetAuthorityRef);
    });

    test.each(['ChatRepo', 'Runtime'])('%s writer waits outside Engine until the metadata boundary releases', async domain => {
        f = await rpConsumptionFixture(make);
        const trigger = deferred(), requested = deferred(), entered = deferred(), release = deferred(), events = [];
        const originalChat = await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name, f.locator);
        const plans = createOrchestrationAuthoringService(f.h.engine, { rpControl: f.control }).plans;
        const writer = trigger.promise.then(async () => {
            requested.resolve();
            if (domain === 'ChatRepo') await f.chats.save(f.h.handle, f.locator.charDir, f.locator.name, originalChat.header,
                [...originalChat.body, { name: 'User', mes: 'independent source writer', is_user: true }], originalChat.integrity, f.locator);
            else await plans.create(f.h.handle, command(), planFixture());
            events.push('writer_committed');
        });
        const pending = control(async () => { entered.resolve(); await release.promise; events.push('control_decided'); return { metadataOnly: true }; });
        let transactions;
        try {
            await entered.promise; transactions = jest.spyOn(f.h.engine, 'withTransaction'); trigger.resolve(); await requested.promise; await turn();
            expect(transactions).not.toHaveBeenCalled(); expect(events).toEqual([]);
        } finally { transactions?.mockRestore(); release.resolve(); await pending; await writer; }
        expect(events).toEqual(['control_decided', 'writer_committed']);
    });

    test.each(['root', 'ancestor'])('original %s cancellation waits for the complete Run lineage before entering its control transaction', async target => {
        f = await (target === 'ancestor' ? childFixture(make) : rpConsumptionFixture(make));
        const targetId = target === 'ancestor' ? f.parentRunId : f.root.runId, lockedId = target === 'ancestor' ? f.childRunId : f.root.runId;
        const root = await f.runs.get(f.h.handle, targetId), trigger = deferred(), lineageRead = deferred(), entered = deferred(), release = deferred();
        let transactionCalls = 0, track = false;
        const original = f.h.engine.withTransaction.bind(f.h.engine);
        f.h.engine.withTransaction = (handle, operation, options) => {
            const tracked = track; if (tracked) transactionCalls++;
            return original(handle, operation, options).then(value => { if (tracked && Array.isArray(value)) lineageRead.resolve(); return value; });
        };
        const writer = trigger.promise.then(() => { track = true; return f.runs.cancel(f.h.handle, command(), { ...runGuard(root), reasonCode: 'independent_source_control_cancel' }); });
        const pending = control(async () => { entered.resolve(); await release.promise; return { metadataOnly: true }; }, lockedId);
        try {
            await entered.promise; trigger.resolve(); await lineageRead.promise; await turn();
            expect(transactionCalls).toBe(1);
        } finally { track = false; f.h.engine.withTransaction = original; release.resolve(); await pending; await writer; }
        expect((await f.runs.get(f.h.handle, targetId)).cancelRequested).toBe(true);
    });

    test('Run lineage is already held while the original Runtime boundary is queued', async () => {
        f = await rpConsumptionFixture(make);
        const runtimeEntered = deferred(), releaseRuntime = deferred(), boundaryCalled = deferred(), probeTrigger = deferred();
        let acquired = false;
        const probe = probeTrigger.promise.then(() => withNativeResourceWrites(f.h.handle, [f.root.runId], () => { acquired = true; }));
        const holder = withRuntimeWrite(f.h.handle, async () => { runtimeEntered.resolve(); await releaseRuntime.promise; });
        await runtimeEntered.promise;
        const pending = control(() => f.h.engine.withTransaction(f.h.handle, tx => f.source.revalidate(f.h.handle, f.root.sourceBinding, { tx })), f.root.runId,
            operation => { boundaryCalled.resolve(); return f.boundary()(operation); });
        try { await boundaryCalled.promise; probeTrigger.resolve(); await turn(); expect(acquired).toBe(false); }
        finally { releaseRuntime.resolve(); await holder; await pending; await probe; }
        expect(acquired).toBe(true);
    });

    test('a same-scope original source write commits and the caller explicitly refuses its now-stale source', async () => {
        f = await rpConsumptionFixture(make);
        await expect(control(async () => {
            await f.write('content');
            return f.h.engine.withTransaction(f.h.handle, tx => f.source.revalidate(f.h.handle, f.root.sourceBinding, { tx }));
        })).rejects.toMatchObject({ code: 'native_generation_revision_conflict' });
        expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name, f.locator)).body[1].mes).toBe('Independent original writer');
        expect((await current()).cancelRequested).toBe(false);
    });

    test('an independent same-command waiter cannot capture the command lock before the outer Run holder completes that control', async () => {
        f = await rpConsumptionFixture(make);
        const id = command(), root = await current(), input = { ...runGuard(root), operation: 'run.resume', detail: { purpose: 'same_command_control' } };
        const trigger = deferred(), lineageRead = deferred(), probeTrigger = deferred(), probeEntered = deferred(), releaseProbe = deferred();
        const original = f.h.engine.withTransaction.bind(f.h.engine); let watch = false, timer;
        f.h.engine.withTransaction = (handle, operation, options) => original(handle, operation, options).then(value => {
            if (watch && Array.isArray(value)) { watch = false; lineageRead.resolve(); } return value;
        });
        const external = trigger.promise.then(() => { watch = true; return metadata(id, input); });
        const probe = probeTrigger.promise.then(() => withNativeResourceWrites(f.h.handle, [id], async () => { probeEntered.resolve(); await releaseProbe.promise; }));
        let internal;
        try {
            internal = await control(async () => {
                trigger.resolve(); await lineageRead.promise; await turn(); probeTrigger.resolve();
                const available = await Promise.race([probeEntered.promise.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 1000); })]);
                clearTimeout(timer); expect(available).toBe(true);
                releaseProbe.resolve(); await probe;
                return metadata(id, input);
            });
        } finally {
            clearTimeout(timer); releaseProbe.resolve(); f.h.engine.withTransaction = original;
            await external; await probe;
        }
        expect(internal.replayed).toBe(false); expect((await external).replayed).toBe(true);
        expect((await current()).stateVersion).toBe(root.stateVersion + 1);
    });
});
