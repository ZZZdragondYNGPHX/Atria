import { createServer } from 'node:http';
import { createOrchestrationExecutionService } from '../../src/native/orchestration/execution-service.js';
import { PlanRepository, validationDigest, readPlanRevision } from '../../src/native/orchestration/plan-repository.js';
import { AttemptController } from '../../src/native/orchestration/attempt-controller.js';
import { runGuard } from '../../src/native/orchestration/controller-common.js';
import { sendAttemptId, localWorkAttemptId } from '../../src/native/orchestration/budget-port.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { installFixture } from '../native/helpers/session-fixture.js';
import { seedGenerationProfiles } from '../native/helpers/generation-fixture.js';
import { planFixture, prepareControllerOwnerRoot } from './fixtures.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';

const limits = { maxRequests: 4, maxTokens: 32000, localWork: { maxJobs: 32, maxItems: 100, maxInputBytes: 16777216 } };
const id = kind => createNativeId('orchestration' + kind);

async function setup(make, { prepareEffect = true } = {}) {
    const h = await make(), seen = [];
    await prepareControllerOwnerRoot(h.dirs.root);
    const lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
    const server = createServer(async (req, res) => {
        for await (const chunk of req) void chunk;
        seen.push(true); res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: 'Original Provider response', role: 'assistant' } }], usage: { total_tokens: 20, prompt_tokens: 12, completion_tokens: 8 } }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const f = await installFixture(h), snapshot = await f.core.create(h.handle, f.start);
    const seeded = await seedGenerationProfiles({ ...h, endpoint: `http://127.0.0.1:${server.address().port}/v1/chat/completions` });
    await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: limits } });
    const sourceRequest = { domain: 'native_session', sessionId: snapshot.session.sessionId, branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId };
    const request = { role: 'narrator', sessionId: snapshot.session.sessionId, revisionId: snapshot.revision.revisionId, requestId: 'effect-send' };
    const proposal = { actionRef: { runtimeRouteId: seeded.routes[0].runtimeRouteId }, targetRef: { connectionProfileId: seeded.connection.connectionProfileId },
        inputRef: { requestId: request.requestId }, inputHash: hashNativeDocument(request) };
    let revoked = false;
    // The grant/receipt callbacks here are explicit controlled authorities.
    // Original SourcePort, bank, Engine, EffectController and HTTP sends are real.
    const authority = {
        authorize: async () => {
            if (revoked) throw new Error('Controlled grant revoked');
            return { ...proposal, capability: 'generation.send', grantDigest: hashNativeDocument({ grant: 'controlled' }),
                endpointBindingDigest: hashNativeDocument(seeded.connection), egressDigest: hashNativeDocument({ endpoint: seeded.connection.endpoint }),
                budgetEnvelopeDigest: hashNativeDocument(limits), risk: 'R1', requiresApproval: false,
                dispatchPolicy: { idempotency: 'none', operationKey: null, reconcile: 'manual' } };
        },
        verifySend: async ({ prepared, resolved }) => {
            if (prepared.snapshot.requestId !== request.requestId || resolved.route.runtimeRouteId !== proposal.actionRef.runtimeRouteId) throw new Error('Changed actual send');
        },
        verifyObservation: async () => { throw new Error('No durable Provider receipt in this fixture'); },
        verifyApproval: async () => { throw new Error('No trusted Review Origin in this fixture'); },
        authorizeDelegation: async ({ parent, parentAttempt, effectiveGrantDigest, budgetCeiling }) => ({ allowed: true, effectiveGrantDigest,
            budgetCeilingDigest: hashNativeDocument(budgetCeiling), parentGrantDigest: parentAttempt.effectiveGrantDigest, sourceBindingDigest: parent.sourceBinding.bindingDigest }),
    };
    const service = createOrchestrationExecutionService({ engine: h.engine, sessionCore: f.core, effectAuthority: authority });
    const plans = new PlanRepository({ engine: h.engine, authorize: async () => {}, assertWriter: (handle, tx) => lifecycle.assertWriter(handle, tx),
        validateDependencies: async () => ({ status: 'valid', issues: [], dependencyDigest: hashNativeDocument([]) }) });
    const fixture = planFixture(), output = fixture.definition.nodes[0], nodeId = id('Node');
    fixture.definition.nodes = [{ nodeId, kind: 'agent', label: 'Original model task', inputs: [], outputs: [{ name: 'body', type: 'text.body', required: false }],
        dependencyPinIds: ['route'], capabilities: ['generation.send', 'agent.delegate'], policy: { agentPinId: 'route', allowedPlanPinIds: [] } },
    { ...output, inputs: [{ name: 'body', type: 'text.body', required: true }] }];
    fixture.definition.edges = [{ edgeId: id('Edge'), from: { nodeId, port: 'body' }, to: { nodeId: output.nodeId, port: 'body' }, condition: 'always', maxVisits: 1, loopBack: false }];
    fixture.definition.entryNodeIds = [nodeId]; fixture.definition.capabilityCeiling = ['generation.send', 'agent.delegate'];
    fixture.dependencyPins = [{ pinId: 'route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId },
        integrity: hashNativeDocument(await seeded.persistence.getRuntimeRoute(h.handle, seeded.routes[0].runtimeRouteId)) }];
    fixture.definition.limits.maxSteps = 50;
    const childDraft = await plans.create(h.handle, id('Command'), structuredClone(fixture));
    const childExpected = { planId: childDraft.planId, expectedDraftVersion: childDraft.draftVersion, expectedDefinitionHash: childDraft.definitionHash };
    const childReport = await plans.validate(h.handle, childExpected);
    const { planRef: childPlanRef } = await plans.publish(h.handle, id('Command'), { ...childExpected, validationDigest: validationDigest(childReport) });
    const childRevision = await h.engine.withTransaction(h.handle, tx => readPlanRevision(tx, h.handle, childPlanRef));
    fixture.dependencyPins.push({ pinId: 'child', port: 'plan', resourceRef: childPlanRef, integrity: hashNativeDocument(childRevision) });
    fixture.definition.nodes[0].dependencyPinIds.push('child'); fixture.definition.nodes[0].policy.allowedPlanPinIds = ['child'];
    const plan = await plans.create(h.handle, id('Command'), fixture), expected = { planId: plan.planId, expectedDraftVersion: plan.draftVersion, expectedDefinitionHash: plan.definitionHash };
    const report = await plans.validate(h.handle, expected), { planRef } = await plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) });
    const root = await service.runs.start(h.handle, id('Command'), { planRef, sourceRequest, retentionPolicyRef: { policyId: 'test' } });
    const { attemptId } = await service.runs.beginAttempt(h.handle, id('Command'), { ...runGuard(root), nodeId, inputRefs: [], inputDigest: hashNativeDocument([]),
        effectiveGrantDigest: (await authority.authorize()).grantDigest, budgetRef: root.budgetAuthorityRef });
    await new AttemptController({ runs: service.runs, authorizeAttempt: async ({ root }) => service.sourcePort.revalidate(h.handle, root.sourceBinding) })
        .activate(h.handle, { ...runGuard(await service.runs.get(h.handle, root.runId)), attemptId });
    const effectId = id('Effect');
    if (prepareEffect) await service.effects.prepare(h.handle, { ...runGuard(await service.runs.get(h.handle, root.runId)), effectId, nodeAttemptId: attemptId, proposal });
    const host = new NativeGenerationHost({ ...seeded, sessionCore: f.core, providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: { resolveSecret: async () => 'synthetic-secret' } });
    const ref = { authorityRef: root.budgetAuthorityRef, effectId, providerSendOrdinal: 0, attemptId: sendAttemptId(effectId, 0), reservationId: null };
    return { ...h, ...service, root, childPlanRef, effectId, ref, request, host, seen, nodeId, attemptId, proposal, authority, core: f.core, revoke: () => { revoked = true; },
        async cleanup() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.engine.close?.(); await h.cleanup(); } };
}

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s original bank → Effect ready/claim → GenerationHost', (_name, make) => {
    test('a funded child cannot send after its parent is cancelled after fresh claim', async () => {
        const f = await setup(make, { prepareEffect: false });
        try {
            const delegated = await f.delegates.delegate(f.handle, { ...runGuard(await f.runs.get(f.handle, f.root.runId)), parentAttemptId: f.attemptId,
                delegationId: 'model-child', childPlanRef: f.childPlanRef, inputRefs: [], inputDigest: hashNativeDocument([]),
                effectiveGrantDigest: (await f.authority.authorize()).grantDigest, returnContract: f.root.graph.outputContract, budgetCeiling: limits });
            const childRunId = delegated.outcome.childRunId;
            await expect(f.reserveChild(f.handle, { parentRunId: f.root.runId, childRunId, ceiling: { ...limits, maxRequests: 3 }, limits }))
                .rejects.toMatchObject({ code: 'native_orchestration_budget_reservation_mismatch' });
            await f.reserveChild(f.handle, { parentRunId: f.root.runId, childRunId, ceiling: limits, limits });
            await f.delegates.confirmBudget(f.handle, runGuard(await f.runs.get(f.handle, childRunId)));
            const child = await f.runs.get(f.handle, childRunId);
            const { attemptId } = await f.runs.beginAttempt(f.handle, id('Command'), { ...runGuard(child), nodeId: f.nodeId,
                inputRefs: [], inputDigest: hashNativeDocument([]), effectiveGrantDigest: child.parentRef.effectiveGrantDigest, budgetRef: child.budgetAuthorityRef });
            await new AttemptController({ runs: f.runs, authorizeAttempt: async () => {} }).activate(f.handle, { ...runGuard(await f.runs.get(f.handle, childRunId)), attemptId });
            await f.effects.prepare(f.handle, { ...runGuard(await f.runs.get(f.handle, childRunId)), effectId: f.effectId, nodeAttemptId: attemptId, proposal: f.proposal });
            await expect(f.generationSend(f.handle, { runId: childRunId, effectId: f.effectId, limits, reservationId: null })).rejects.toMatchObject({ code: 'native_orchestration_budget_reservation_mismatch' });
            const options = await f.generationSend(f.handle, { runId: childRunId, effectId: f.effectId, limits, reservationId: childRunId });
            const beforeSend = options.beforeSend;
            options.beforeSend = async args => {
                await beforeSend(args);
                await f.runs.cancel(f.handle, id('Command'), { ...runGuard(await f.runs.get(f.handle, f.root.runId)), reasonCode: 'cancel_parent' });
            };
            await expect(f.host.execute(f.handle, f.request, undefined, undefined, { orchestrationSend: options })).rejects.toThrow();
            expect(f.seen).toHaveLength(0);
            expect(await f.budgetPort.observeAttempt(f.handle, { ...f.ref, reservationId: childRunId })).toMatchObject({ status: 'unknown', reservationId: childRunId });
        } finally { await f.cleanup(); }
    });

    test('only fresh claims send and cancellation/foreign tokens cannot authorize dispatch', async () => {
        const f = await setup(make);
        try {
            const options = await f.generationSend(f.handle, { runId: f.root.runId, effectId: f.effectId, limits });
            const result = await f.host.execute(f.handle, f.request, undefined, undefined, { orchestrationSend: options });
            expect(f.seen).toHaveLength(1); expect(result.routing.compute.attempts[0].attemptId).toBe(f.ref.attemptId);
            expect(await f.budgetPort.observeAttempt(f.handle, f.ref)).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            await expect(f.assertDispatch({ handle: f.handle, runId: f.root.runId, effectId: f.effectId, dispatchToken: 'wrong' })).rejects.toMatchObject({ code: 'native_orchestration_dispatch_stale' });
            await expect(f.generationSend(f.handle, { runId: f.root.runId, effectId: f.effectId, limits })).rejects.toMatchObject({ code: 'native_orchestration_effect_not_prepared' });
            await f.runs.cancel(f.handle, id('Command'), { ...runGuard(await f.runs.get(f.handle, f.root.runId)), reasonCode: 'user_cancel' });
            await expect(options.bank.assertCurrent()).rejects.toMatchObject({ code: 'native_orchestration_dispatch_stale' });
            expect(f.seen).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('budget COMMIT ACK unknown observes one original row and never claims or sends', async () => {
        const f = await setup(make);
        try {
            const original = f.budgetPort.admitAttempt.bind(f.budgetPort);
            let admits = 0, observed = 0;
            const observe = f.budgetPort.observeAttempt.bind(f.budgetPort);
            f.budgetPort.admitAttempt = async (...args) => { admits++; await original(...args); throw new StorageCommitUnknownError(new Error('Synthetic ACK loss after original commit')); };
            f.budgetPort.observeAttempt = async (...args) => { observed++; return observe(...args); };
            const options = await f.generationSend(f.handle, { runId: f.root.runId, effectId: f.effectId, limits });
            await expect(f.host.execute(f.handle, f.request, undefined, undefined, { orchestrationSend: options })).rejects.toMatchObject({ code: 'native_orchestration_budget_reconcile_required' });
            expect(admits).toBe(1); expect(observed).toBe(1); expect(f.seen).toHaveLength(0);
            expect(await observe(f.handle, f.ref)).toMatchObject({ status: 'charged' });
            expect((await f.runs.get(f.handle, f.root.runId)).pendingEffectRefs).toEqual([f.effectId]);
        } finally { await f.cleanup(); }
    });

    test('foreign Effect budget and arbitrary reservation cannot bypass admission; local work has its own typed proof', async () => {
        const f = await setup(make);
        try {
            await expect(f.generationSend(f.handle, { runId: f.root.runId, effectId: f.effectId, limits, reservationId: id('Run') })).rejects.toMatchObject({ code: 'native_orchestration_budget_reservation_mismatch' });
            const foreignEffect = id('Effect');
            const { budgetAttemptRef } = await f.budgetPort.admitAttempt(f.handle, { authorityRef: f.root.budgetAuthorityRef, effectId: foreignEffect,
                providerSendOrdinal: 0, requestId: 'foreign', targetFingerprint: 'a'.repeat(64), inputFingerprint: 'b'.repeat(64), upperBound: 100, limits });
            await expect(f.effects.ready(f.handle, { ...runGuard(await f.runs.get(f.handle, f.root.runId)), effectId: f.effectId, budgetAttemptRef })).rejects.toMatchObject({ code: 'native_orchestration_budget_attempt_invalid' });
            const attemptId = localWorkAttemptId(f.effectId, 0);
            await f.budgetPort.chargeLocalWork(f.handle, { authorityRef: f.root.budgetAuthorityRef, limits, effectId: f.effectId, localWorkOrdinal: 0,
                attempt: { attemptId, requestId: 'local', kind: 'mcp_protocol', estimatedItems: 1, estimatedInputBytes: 10, targetFingerprint: 'c'.repeat(64) } });
            const localRef = { kind: 'local_work', authorityRef: f.root.budgetAuthorityRef, effectId: f.effectId, localWorkOrdinal: 0, attemptId, reservationId: null };
            expect(await f.budgetPort.observeAttempt(f.handle, localRef)).toMatchObject({ status: 'charged' });
            await expect(f.effects.ready(f.handle, { ...runGuard(await f.runs.get(f.handle, f.root.runId)), effectId: f.effectId, budgetAttemptRef: localRef })).resolves.toMatchObject({ outcome: { status: 'ready' } });
            await f.budgetPort.settleAttempt(f.handle, localRef, { wallMs: 1, cpuUserMicros: 1, cpuSystemMicros: 0, cpuScope: 'process', outcome: 'completed' });
            expect(await f.budgetPort.observeAttempt(f.handle, localRef)).toMatchObject({ status: 'settled', usage: { outcome: 'completed' } });
            expect(f.seen).toHaveLength(0);
        } finally { await f.cleanup(); }
    });
});
