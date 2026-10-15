import http from 'node:http';
import { jest } from '@jest/globals';
import { A2aService } from '../../src/native/a2a-service.js';
import { ToolPort } from '../../src/native/orchestration/tool-port.js';
import { createOrchestrationExecutionService } from '../../src/native/orchestration/execution-service.js';
import { PlanRepository, validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { AttemptController } from '../../src/native/orchestration/attempt-controller.js';
import { runGuard } from '../../src/native/orchestration/controller-common.js';
import { localWorkAttemptId } from '../../src/native/orchestration/budget-port.js';
import { NativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { NativeModelPromptPersistence } from '../../src/native/model-prompt-runtime/persistence.js';
import { canonicalCredentialTarget } from '../../src/native/model-prompt-runtime/credential-targets.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { createNativeId } from '../../src/native/identity.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { installCognitionFixture } from '../native/helpers/cognition-fixture.js';
import { seedGenerationProfiles } from '../native/helpers/generation-fixture.js';
import { services } from '../native/helpers/session-fixture.js';
import { planFixture, prepareControllerOwnerRoot } from './fixtures.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

const id = name => createNativeId('orchestration' + name);
const limits = { maxRequests: 1, maxTokens: 4096, localWork: { maxJobs: 16, maxItems: 10000, maxInputBytes: 16777216 } };

// Real original protocol, Session bank, Plan/Run/Effect and cold Engines. The
// test's explicit policy callbacks are synthetic, not a protected user approval.
async function fixture(make, mode = 'task') {
    const calls = []; let endpoint, onSend = () => {};
    const server = http.createServer(async (req, res) => {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const body = req.method === 'GET' ? { method: 'GetAgentCard' } : JSON.parse(Buffer.concat(chunks).toString());
        calls.push(body.method); res.setHeader('content-type', 'application/json');
        if (body.method === 'GetAgentCard') { res.end(JSON.stringify({ name: 'Synthetic', description: 'fixture', version: '1',
            supportedInterfaces: [{ url: endpoint, protocolBinding: 'JSONRPC', protocolVersion: '1.0' }], capabilities: {},
            defaultInputModes: ['text/plain'], defaultOutputModes: ['application/json'], skills: [{ id: 'stats', name: 'Stats', description: 'Count', tags: [] }] })); return; }
        onSend();
        if (mode === 'lost') { req.socket.destroy(); return; }
        const result = mode === 'message' ? { message: { messageId: 'response-1', contextId: 'ctx-1', role: 'ROLE_AGENT', parts: [{ text: 'Synthetic response' }] } }
            : { task: { id: 'task-1', contextId: 'ctx-1', status: { state: mode === 'invalid' ? 'unvalidated-state' : 'TASK_STATE_WORKING' }, artifacts: [] } };
        res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    endpoint = `http://127.0.0.1:${server.address().port}/rpc`;
    let h, coldEngine;
    try {
        h = await make(); await prepareControllerOwnerRoot(h.dirs.root);
        let lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        const f = await installCognitionFixture(h, 'limited', undefined, ({ contract }) => {
            contract.informationRuntime.sources.push({ id: 'public-lines', kind: 'timeline', semantic: 'narrative', scopeId: 'session', fields: [['content']] });
            contract.informationRuntime.views.find(view => view.id === 'player').sources.push('public-lines');
        });
        const base = await f.core.appendTimeline(h.handle, f.snapshot.session.sessionId, { role: 'assistant', content: 'Synthetic public evidence.' }, { expectedRevisionId: f.snapshot.revision.revisionId });
        const seeded = await seedGenerationProfiles({ ...h, endpoint }), connection = { ...seeded.connection, providerAdapter: 'provider.a2a' };
        await seeded.persistence.saveConnectionProfile(h.handle, connection);
        await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: { schemaVersion: 1,
            allowedModelProfileIds: [seeded.model.modelProfileId], a2a: { protocolVersion: '1.0', connectionProfileId: connection.connectionProfileId, skillIds: ['stats'], auth: 'none' }, computeBudget: limits } });
        const input = { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, viewId: 'player',
            itemId: 'public-lines:' + base.timeline.at(-1).messageId, skillId: 'stats' };
        const proposal = { actionRef: { protocol: 'a2a', operation: 'send' }, targetRef: { connectionProfileId: connection.connectionProfileId }, inputRef: { key: 'controlled-public-item' }, inputHash: hash(input) };
        const decision = { ...proposal, capability: 'a2a.read', endpointBindingDigest: hash(canonicalCredentialTarget(connection)), grantDigest: hash({ grant: 'controlled' }),
            risk: 'R1', egressDigest: hash({ playerDisplay: input.itemId, endpoint }), budgetEnvelopeDigest: hash(limits),
            dispatchPolicy: { idempotency: 'none', operationKey: null, reconcile: 'domain_status' }, requiresApproval: false };
        let port;
        const authority = { authorize: async () => decision, verifySend: async () => {}, verifyObservation: args => port.verifyObservation(args), verifyApproval: async () => { throw new Error('No Review authority'); } };
        let exec = createOrchestrationExecutionService({ engine: h.engine, sessionCore: f.core, effectAuthority: authority });
        const plans = new PlanRepository({ engine: h.engine, authorize: async () => {}, assertWriter: (handle, tx) => lifecycle.assertWriter(handle, tx),
            validateDependencies: async () => ({ status: 'valid', issues: [], dependencyDigest: hash([]) }) });
        const plan = planFixture(), output = plan.definition.nodes[0], nodeId = id('Node');
        plan.definition.nodes = [{ nodeId, kind: 'effect', label: 'Original A2A send', inputs: [], outputs: [{ name: 'body', type: 'text.body', required: false }],
            dependencyPinIds: ['a2a.action'], capabilities: ['a2a.read'], policy: { actionPinId: 'a2a.action' } }, { ...output, inputs: [{ name: 'body', type: 'text.body', required: true }] }];
        plan.definition.edges = [{ edgeId: id('Edge'), from: { nodeId, port: 'body' }, to: { nodeId: output.nodeId, port: 'body' }, condition: 'always', maxVisits: 1, loopBack: false }];
        plan.definition.entryNodeIds = [nodeId]; plan.definition.capabilityCeiling = ['a2a.read']; plan.definition.limits.maxSteps = 50;
        plan.dependencyPins = [{ pinId: 'a2a.action', port: 'tool', resourceRef: proposal.targetRef, integrity: hash(connection) }];
        const draft = await plans.create(h.handle, id('Command'), plan), expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
        const report = await plans.validate(h.handle, expected), { planRef } = await plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) });
        const root = await exec.runs.start(h.handle, id('Command'), { planRef, sourceRequest: { domain: 'native_session', sessionId: input.sessionId,
            branchId: base.revision.branchId, revisionId: input.revisionId }, retentionPolicyRef: { policyId: 'test' } });
        const { attemptId } = await exec.runs.beginAttempt(h.handle, id('Command'), { ...runGuard(root), nodeId, inputRefs: [], inputDigest: hash([]), effectiveGrantDigest: decision.grantDigest, budgetRef: root.budgetAuthorityRef });
        await new AttemptController({ runs: exec.runs, authorizeAttempt: async () => {} }).activate(h.handle, { ...runGuard(await exec.runs.get(h.handle, root.runId)), attemptId });
        const effectId = id('Effect');
        await exec.effects.prepare(h.handle, { ...runGuard(await exec.runs.get(h.handle, root.runId)), effectId, nodeAttemptId: attemptId, proposal });
        await exec.budgetPort.reserveChild(h.handle, { authorityRef: root.budgetAuthorityRef, parentReservationId: null, childRunId: root.runId,
            ceiling: { maxRequests: 0, maxTokens: 0, localWork: limits.localWork }, limits });
        const budgetRef = { kind: 'local_work', authorityRef: root.budgetAuthorityRef, effectId, localWorkOrdinal: 0,
            attemptId: localWorkAttemptId(effectId, 0), reservationId: root.runId };
        await exec.budgetPort.chargeLocalWork(h.handle, { authorityRef: root.budgetAuthorityRef, reservationId: root.runId, limits,
            effectId, localWorkOrdinal: 0,
            attempt: { attemptId: budgetRef.attemptId, requestId: 'effect-admission', kind: 'a2a_protocol', estimatedItems: 1, estimatedInputBytes: 1, targetFingerprint: decision.inputHash } });
        await exec.effects.ready(h.handle, { ...runGuard(await exec.runs.get(h.handle, root.runId)), effectId, budgetAttemptRef: budgetRef });
        const claim = await exec.effects.claim(h.handle, { ...runGuard(await exec.runs.get(h.handle, root.runId)), effectId });
        let core = f.core, scheduler, service;
        const rebuild = (engine, persistence) => {
            scheduler = new NativeTaskScheduler(); service = new A2aService({ host: { ...seeded, persistence, sessionCore: core }, scheduler });
            port = new ToolPort({ a2aService: service, budgetPort: exec.budgetPort, runs: exec.runs, verifyDispatch: exec.assertDispatch,
                readInput: async () => input, authorizeTool: async ({ intent }) => ({ grantDigest: decision.grantDigest, egressDigest: decision.egressDigest,
                    sourceBindingDigest: intent.sourceBindingDigest, capability: decision.capability, limits }) });
        };
        rebuild(h.engine, seeded.persistence);
        return { h, input, base, root, effectId, budgetRef, calls, proposal, decision, get port() { return port; }, get exec() { return exec; }, get core() { return core; },
            get service() { return service; }, get scheduler() { return scheduler; }, onSend: fn => { onSend = fn; },
            start: signal => port.execute(h.handle, { runId: root.runId, effectId, dispatchToken: claim.dispatchToken }, { signal }),
            settleAdmission: () => exec.budgetPort.settleLocalWork(h.handle, root.budgetAuthorityRef, budgetRef.attemptId,
                { wallMs: 1, cpuUserMicros: 1, cpuSystemMicros: 1, cpuScope: 'process', outcome: 'completed' }),
            cold: async () => {
                await h.engine.close();
                coldEngine = new h.engine.constructor({ url: h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => h.dirs });
                lifecycle = attachNativeHostLifecycle(coldEngine, { directoriesByHandle: () => h.dirs });
                core = services(h, coldEngine).core;
                exec = createOrchestrationExecutionService({ engine: coldEngine, sessionCore: core, effectAuthority: authority });
                rebuild(coldEngine, new NativeModelPromptPersistence({ engine: coldEngine }));
                await exec.runs.recover(h.handle, id('Command'), runGuard(await exec.runs.get(h.handle, root.runId)));
            },
            cleanup: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await coldEngine?.close(); await h.engine.close(); await h.cleanup(); } };
    } catch (error) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h?.engine.close(); await h?.cleanup(); throw error; }
}

describe.each(CONTRACT_HARNESSES.filter(({ name }) => process.env.ATRIA_TEST_TOOL_SQL === '1' || ['FsEngine', 'SqliteEngine'].includes(name)))('$name A2A accepted Effect', ({ make }) => {
    test.each(['task', 'message'])('%s response persists exact accepted fact and cold observation uses real Effect without send claim', async mode => {
        const f = await fixture(make, mode);
        try {
            const started = await f.start(); await f.scheduler.operations.get(started.operationRef.operationId).handle.result;
            // Original initial local admission must also be settled, not forged by the Port.
            expect((await f.port.observe(f.h.handle, started.operationRef, { runId: f.root.runId, effectId: f.effectId })).outcome).toBe('unknown');
            await f.settleAdmission(); await f.cold();
            const observed = await f.port.observe(f.h.handle, started.operationRef, { runId: f.root.runId, effectId: f.effectId });
            expect(observed).toMatchObject({ outcome: 'confirmed', observation: { reasonCode: 'a2a_send_accepted', resultRefs: [], domainReceiptRef: null } });
            expect(JSON.stringify(observed)).not.toContain('Synthetic response');
            const ack = await f.exec.effects.observe(f.h.handle, { ...runGuard(await f.exec.runs.get(f.h.handle, f.root.runId)), effectId: f.effectId, observation: observed.observation });
            expect(ack.outcome.status).toBe('confirmed');
            const replay = await f.exec.effects.observe(f.h.handle, { ...runGuard(await f.exec.runs.get(f.h.handle, f.root.runId)), effectId: f.effectId, observation: observed.observation });
            expect(replay.replayed).toBe(true);
            await expect(f.start()).rejects.toThrow(/dispatch_stale/);
            expect(f.calls).toEqual(['GetAgentCard', 'SendMessage']);
            const forged = { ...observed.observation, sourceRefs: [] };
            await expect(f.exec.effects.observe(f.h.handle, { ...runGuard(await f.exec.runs.get(f.h.handle, f.root.runId)), effectId: f.effectId,
                observation: { ...forged, observationId: 'forged' } })).rejects.toThrow(/observation_invalid/);
        } finally { await f.cleanup(); }
    });

    test.each(['invalid', 'lost'])('%s response has no original accepted proof and remains unknown', async mode => {
        const f = await fixture(make, mode);
        try {
            const started = await f.start(); await expect(f.scheduler.operations.get(started.operationRef.operationId).handle.result).rejects.toThrow();
            await f.settleAdmission(); await f.cold();
            expect((await f.port.observe(f.h.handle, started.operationRef, { runId: f.root.runId, effectId: f.effectId })).outcome).toBe('unknown');
            expect(f.calls).toEqual(['GetAgentCard', 'SendMessage']);
        } finally { await f.cleanup(); }
    });

    test('source movement and retention expiry preserve historical facts but never restore action permission', async () => {
        const f = await fixture(make); let now;
        try {
            const started = await f.start(); await f.scheduler.operations.get(started.operationRef.operationId).handle.result; await f.settleAdmission();
            const anchor = { branchId: f.base.revision.branchId, revisionId: f.input.revisionId };
            const retained = await f.core.runs.externalTask(f.h.handle, f.input.sessionId, anchor, started.operationRef.operationId);
            now = jest.spyOn(Date, 'now').mockReturnValue(retained.expiresAt + 1);
            // Exercise original expiry pruning on a second unrelated original task.
            const unrelated = { ...retained }; delete unrelated.acceptedReceipt; delete unrelated.orchestrationBinding;
            await f.core.runs.externalTask(f.h.handle, f.input.sessionId, anchor, 'unrelated', unrelated);
            await f.exec.budgetPort.releaseUnused(f.h.handle, { authorityRef: f.root.budgetAuthorityRef, reservationId: f.root.runId });
            await f.core.appendTimeline(f.h.handle, f.input.sessionId, { role: 'user', content: 'Moved source' });
            await f.cold();
            const observed = await f.port.observe(f.h.handle, started.operationRef, { runId: f.root.runId, effectId: f.effectId });
            expect(observed.outcome).toBe('confirmed');
            const opRef = { operationId: started.operationRef.operationId, sessionId: f.input.sessionId };
            await expect(f.service.reconnect(f.h.handle, opRef)).rejects.toThrow(); await expect(f.service.cancel(f.h.handle, opRef)).rejects.toThrow();
            const stripped = { ...retained }; delete stripped.acceptedReceipt;
            await expect(f.core.runs.externalTask(f.h.handle, f.input.sessionId, anchor, started.operationRef.operationId, stripped)).rejects.toThrow();
            expect(f.calls).toEqual(['GetAgentCard', 'SendMessage']);
        } finally { now?.mockRestore(); await f.cleanup(); }
    });

    test('lost acceptance persistence ACK resolves only by durable original query', async () => {
        const f = await fixture(make);
        try {
            const original = f.core.runs.externalTask.bind(f.core.runs);
            f.core.runs.externalTask = async (...args) => { const result = await original(...args); if (args[4]?.acceptedReceipt) throw new StorageCommitUnknownError(new Error('Synthetic ACK loss')); return result; };
            const started = await f.start(); await expect(f.scheduler.operations.get(started.operationRef.operationId).handle.result).rejects.toThrow();
            await f.settleAdmission(); await f.cold();
            expect((await f.port.observe(f.h.handle, started.operationRef, { runId: f.root.runId, effectId: f.effectId })).outcome).toBe('confirmed');
            expect(f.calls).toEqual(['GetAgentCard', 'SendMessage']);
        } finally { await f.cleanup(); }
    });

    test('failed acceptance persistence stays unknown and cancellation cannot produce accepted proof', async () => {
        const f = await fixture(make);
        try {
            const original = f.core.runs.externalTask.bind(f.core.runs);
            f.core.runs.externalTask = async (...args) => { if (args[4]?.acceptedReceipt) throw new Error('Synthetic persistence unavailable'); return original(...args); };
            const started = await f.start(); await expect(f.scheduler.operations.get(started.operationRef.operationId).handle.result).rejects.toThrow(/persistence/);
            await f.settleAdmission(); await f.cold();
            expect((await f.port.observe(f.h.handle, started.operationRef, { runId: f.root.runId, effectId: f.effectId })).outcome).toBe('unknown');
            expect(f.calls).toEqual(['GetAgentCard', 'SendMessage']);
        } finally { await f.cleanup(); }
        const cancelled = await fixture(make), controller = new AbortController();
        try {
            cancelled.onSend(() => controller.abort());
            const started = await cancelled.start(controller.signal);
            await expect(cancelled.scheduler.operations.get(started.operationRef.operationId).handle.result).rejects.toThrow();
            await cancelled.settleAdmission();
            expect((await cancelled.port.observe(cancelled.h.handle, started.operationRef, { runId: cancelled.root.runId, effectId: cancelled.effectId })).outcome).toBe('unknown');
            expect(cancelled.calls).toEqual(['GetAgentCard', 'SendMessage']);
        } finally { await cancelled.cleanup(); }
    });

    test('exact frozen Effect input, source, target and budget binding is checked on factual reads', async () => {
        const f = await fixture(make);
        try {
            const started = await f.start(); await f.scheduler.operations.get(started.operationRef.operationId).handle.result; await f.settleAdmission();
            const original = f.service.acceptedObservation.bind(f.service);
            for (const key of ['inputHash', 'sourceBindingDigest', 'grantDigest', 'endpointBindingDigest', 'budgetEnvelopeDigest']) {
                f.service.acceptedObservation = async (...args) => { const receipt = await original(...args); return { ...receipt, binding: { ...receipt.binding, [key]: 'f'.repeat(64) } }; };
                expect((await f.port.observe(f.h.handle, started.operationRef, { runId: f.root.runId, effectId: f.effectId })).outcome).toBe('unknown');
            }
            f.service.acceptedObservation = original;
            const accepted = await f.port.observe(f.h.handle, started.operationRef, { runId: f.root.runId, effectId: f.effectId });
            expect(accepted.outcome).toBe('confirmed');
            const anchor = { branchId: f.base.revision.branchId, revisionId: f.input.revisionId };
            const row = await f.core.runs.externalTask(f.h.handle, f.input.sessionId, anchor, started.operationRef.operationId);
            const stripped = { ...row }; delete stripped.acceptedReceipt;
            await expect(f.core.runs.externalTask(f.h.handle, f.input.sessionId, anchor, started.operationRef.operationId, stripped)).rejects.toThrow(/accepted_receipt_conflict/);
        } finally { await f.cleanup(); }
    });
});
