import http from 'node:http';
import { McpService } from '../../src/native/mcp-service.js';
import { executeProjectSkillWork, verifyProjectSkillCompletion } from '../../src/native/skill-invocation.js';
import { createSkillRepository } from '../../src/skills/repository.js';
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

// Original HTTP/repository, bank and Effect persistence are real. Grant and
// initial control-work measurement callbacks are explicit synthetic test Ports.
async function fixture(make, kind, { remoteError = false, settleInitial = true } = {}) {
    const calls = []; let endpoint, h, coldEngine, remoteHook = async () => {};
    const server = http.createServer(async (req, res) => {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString()); calls.push(body.method);
        await remoteHook(body);
        if (body.method === 'notifications/initialized') { res.writeHead(202); res.end(); return; }
        const results = { initialize: { protocolVersion: '2025-11-25', capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'fixture', version: '1' } },
            'tools/list': { tools: [{ name: 'stats' }] }, 'tools/call': { content: [{ type: 'text', text: 'Synthetic remote body' }], isError: remoteError },
            'resources/list': { resources: [{ uri: 'fixture://public' }] }, 'resources/read': { contents: [{ uri: 'fixture://public', text: 'Synthetic remote body' }] } };
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: results[body.method] }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); endpoint = `http://127.0.0.1:${server.address().port}/mcp`;
    try {
        h = await make(); await prepareControllerOwnerRoot(h.dirs.root);
        let lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        const f = await installCognitionFixture(h, 'limited', undefined, ({ contract }) => {
            contract.informationRuntime.sources.push({ id: 'public-lines', kind: 'timeline', semantic: 'narrative', scopeId: 'session', fields: [['content']] });
            contract.informationRuntime.views.find(view => view.id === 'player').sources.push('public-lines');
        });
        const base = await f.core.appendTimeline(h.handle, f.snapshot.session.sessionId, { role: 'assistant', content: 'Synthetic public evidence.' }, { expectedRevisionId: f.snapshot.revision.revisionId });
        const seeded = await seedGenerationProfiles({ ...h, endpoint }), connection = { ...seeded.connection, providerAdapter: 'provider.mcp' };
        await seeded.persistence.saveConnectionProfile(h.handle, connection);
        await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: { schemaVersion: 1,
            allowedModelProfileIds: [seeded.model.modelProfileId], mcp: { protocolVersion: '2025-11-25', connectionProfileId: connection.connectionProfileId,
                toolNames: ['stats'], resourceUris: ['fixture://public'], auth: 'none' }, computeBudget: limits } });
        const repository = createSkillRepository(h.dirs.root), scope = { kind: 'global' };
        await repository.install({ scope, payload: { files: [{ path: 'SKILL.md', encoding: 'utf8', content: '---\nname: guide\ndescription: Synthetic\n---\nSynthetic Skill body' }] } });
        const entry = await repository.get('guide', scope), pin = await repository.pin({ scope, name: 'guide', expectedHash: entry.installedHash });
        const [protocol, operation] = kind.split('_');
        const input = protocol === 'mcp' ? { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, viewId: 'player',
            itemId: 'public-lines:' + base.timeline.at(-1).messageId, ...(operation === 'tool' ? { toolName: 'stats' } : { resourceUri: 'fixture://public' }) }
            : { scope, name: 'guide', version: pin.version, ...(operation === 'read' ? { path: 'SKILL.md', offset: 1, limit: 10 } : {}) };
        const targetRef = protocol === 'mcp' ? { connectionProfileId: connection.connectionProfileId } : { scope, name: 'guide', version: pin.version };
        const proposal = { actionRef: { protocol, operation }, targetRef, inputRef: { key: 'controlled-read-input' }, inputHash: hash(input) };
        const decision = { ...proposal, capability: 'tool.read', endpointBindingDigest: hash(protocol === 'mcp' ? canonicalCredentialTarget(connection) : targetRef),
            grantDigest: hash({ grant: 'controlled' }), risk: protocol === 'mcp' ? 'R1' : 'R0', egressDigest: hash({ publicRead: kind }), budgetEnvelopeDigest: hash(limits),
            dispatchPolicy: { idempotency: 'none', operationKey: null, reconcile: 'manual' }, requiresApproval: false };
        let port, allowContradiction = false, grantRevoked = false;
        const authority = { authorize: async () => decision, verifySend: async () => {}, verifyApproval: async () => { throw new Error('No Review authority'); },
            verifyObservation: args => allowContradiction && args.observation.reasonCode === 'controlled_contradiction' ? undefined : port.verifyObservation(args) };
        let exec = createOrchestrationExecutionService({ engine: h.engine, sessionCore: f.core, effectAuthority: authority });
        const plans = new PlanRepository({ engine: h.engine, authorize: async () => {}, assertWriter: (handle, tx) => lifecycle.assertWriter(handle, tx),
            validateDependencies: async () => ({ status: 'valid', issues: [], dependencyDigest: hash([]) }) });
        const plan = planFixture(), output = plan.definition.nodes[0], nodeId = id('Node');
        plan.definition.nodes = [{ nodeId, kind: 'effect', label: kind, inputs: [], outputs: [{ name: 'body', type: 'text.body', required: false }],
            dependencyPinIds: ['tool.action'], capabilities: ['tool.read'], policy: { actionPinId: 'tool.action' } }, { ...output, inputs: [{ name: 'body', type: 'text.body', required: true }] }];
        plan.definition.edges = [{ edgeId: id('Edge'), from: { nodeId, port: 'body' }, to: { nodeId: output.nodeId, port: 'body' }, condition: 'always', maxVisits: 1, loopBack: false }];
        plan.definition.entryNodeIds = [nodeId]; plan.definition.capabilityCeiling = ['tool.read']; plan.definition.limits.maxSteps = 50;
        plan.dependencyPins = [{ pinId: 'tool.action', port: 'tool', resourceRef: targetRef, integrity: hash(targetRef) }];
        const draft = await plans.create(h.handle, id('Command'), plan), expected = { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash };
        const report = await plans.validate(h.handle, expected), { planRef } = await plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) });
        const root = await exec.runs.start(h.handle, id('Command'), { planRef, sourceRequest: { domain: 'native_session', sessionId: base.session.sessionId,
            branchId: base.revision.branchId, revisionId: base.revision.revisionId }, retentionPolicyRef: { policyId: 'test' } });
        const { attemptId } = await exec.runs.beginAttempt(h.handle, id('Command'), { ...runGuard(root), nodeId, inputRefs: [], inputDigest: hash([]), effectiveGrantDigest: decision.grantDigest, budgetRef: root.budgetAuthorityRef });
        await new AttemptController({ runs: exec.runs, authorizeAttempt: async () => {} }).activate(h.handle, { ...runGuard(await exec.runs.get(h.handle, root.runId)), attemptId });
        const effectId = id('Effect');
        await exec.effects.prepare(h.handle, { ...runGuard(await exec.runs.get(h.handle, root.runId)), effectId, nodeAttemptId: attemptId, proposal });
        await exec.budgetPort.reserveChild(h.handle, { authorityRef: root.budgetAuthorityRef, parentReservationId: null, childRunId: root.runId,
            ceiling: { maxRequests: 0, maxTokens: 0, localWork: limits.localWork }, limits });
        const budgetRef = { kind: 'local_work', authorityRef: root.budgetAuthorityRef, effectId, localWorkOrdinal: 0, attemptId: localWorkAttemptId(effectId, 0), reservationId: root.runId };
        await exec.budgetPort.chargeLocalWork(h.handle, { authorityRef: root.budgetAuthorityRef, reservationId: root.runId, limits, effectId, localWorkOrdinal: 0,
            attempt: { attemptId: budgetRef.attemptId, requestId: 'effect-admission', kind: 'skill_read', estimatedItems: 1, estimatedInputBytes: 1, targetFingerprint: decision.inputHash } });
        await exec.effects.ready(h.handle, { ...runGuard(await exec.runs.get(h.handle, root.runId)), effectId, budgetAttemptRef: budgetRef });
        const claim = await exec.effects.claim(h.handle, { ...runGuard(await exec.runs.get(h.handle, root.runId)), effectId });
        let core = f.core, scheduler, service;
        const rebuild = persistence => {
            scheduler = new NativeTaskScheduler(); service = new McpService({ host: { ...seeded, persistence, sessionCore: core }, scheduler });
            port = new ToolPort({ mcpService: service, skillAuthority: async () => ({ repository, settings: {}, projectId: null, revalidate: async () => {
                if ((await repository.get('guide', scope)).installedHash !== entry.installedHash) throw new Error('Skill source stale');
            } }), budgetPort: exec.budgetPort, runs: exec.runs, effects: exec.effects, verifyDispatch: exec.assertDispatch,
            readInput: async () => input, authorizeTool: async ({ intent }) => {
                if (grantRevoked) throw new Error('Controlled original grant revoked');
                return { grantDigest: decision.grantDigest, egressDigest: decision.egressDigest,
                    sourceBindingDigest: intent.sourceBindingDigest, capability: decision.capability, limits };
            } });
        };
        rebuild(seeded.persistence);
        const settleAdmission = () => exec.budgetPort.settleLocalWork(h.handle, root.budgetAuthorityRef, budgetRef.attemptId,
            { wallMs: 1, cpuUserMicros: 1, cpuSystemMicros: 1, cpuScope: 'process', outcome: 'completed' });
        if (settleInitial) await settleAdmission();
        return { h, root, effectId, input, repository, decision, budgetRef, calls, get port() { return port; }, get exec() { return exec; },
            get core() { return core; }, get service() { return service; }, settleAdmission,
            revokeGrant: () => { grantRevoked = true; }, onResponse: hook => { remoteHook = hook; },
            start: async () => { const started = await port.execute(h.handle, { runId: root.runId, effectId, dispatchToken: claim.dispatchToken });
                if (protocol === 'mcp') await scheduler.operations.get(started.operationRef.operationId).handle.result; return started; },
            observe: () => port.observe(h.handle, { protocol }, { runId: root.runId, effectId }),
            contradict: async observation => { allowContradiction = true; try { return await exec.effects.observe(h.handle, {
                ...runGuard(await exec.runs.get(h.handle, root.runId)), effectId, observation: { ...observation, observationId: 'controlled-contradiction',
                    outcome: observation.outcome === 'confirmed' ? 'failed' : 'confirmed', reasonCode: 'controlled_contradiction' } }); } finally { allowContradiction = false; } },
            cold: async () => { await h.engine.close(); coldEngine = new h.engine.constructor({ url: h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => h.dirs });
                lifecycle = attachNativeHostLifecycle(coldEngine, { directoriesByHandle: () => h.dirs }); core = services(h, coldEngine).core;
                exec = createOrchestrationExecutionService({ engine: coldEngine, sessionCore: core, effectAuthority: authority });
                rebuild(new NativeModelPromptPersistence({ engine: coldEngine }));
                await exec.runs.recover(h.handle, id('Command'), runGuard(await exec.runs.get(h.handle, root.runId))); },
            cleanup: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await coldEngine?.close(); await h.engine.close(); await h.cleanup(); } };
    } catch (error) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h?.engine.close(); await h?.cleanup(); throw error; }
}

describe.each(CONTRACT_HARNESSES.filter(({ name }) => process.env.ATRIA_TEST_TOOL_SQL === '1' || ['FsEngine', 'SqliteEngine'].includes(name)))('$name original completion proof', ({ make }) => {
    test.each(['mcp_tool', 'mcp_resource', 'skill_read', 'skill_files'])('%s saves only validated observation and cold reads existing receipt', async kind => {
        const f = await fixture(make, kind);
        try {
            await f.start(); const saved = await f.observe();
            expect(saved).toMatchObject({ outcome: 'confirmed', observation: { domainReceiptRef: null, resultRefs: [] } });
            expect(saved.observation.remoteOperationRef?.protocol ?? null).toBe(kind.startsWith('skill') ? null : 'mcp');
            expect(JSON.stringify(saved)).not.toMatch(/Synthetic (remote|Skill) body/);
            await f.cold(); expect(await f.observe()).toEqual(saved);
            const copied = structuredClone(saved.observation); copied.observationId = 'caller-copy';
            await expect(f.exec.effects.observe(f.h.handle, { ...runGuard(await f.exec.runs.get(f.h.handle, f.root.runId)), effectId: f.effectId, observation: copied }))
                .rejects.toThrow(/completion_proof_required/);
            await expect(f.start()).rejects.toThrow(/dispatch_stale/);
            expect(f.calls.length).toBe(kind.startsWith('mcp') ? 4 : 0);
        } finally { await f.cleanup(); }
    });

    test('remote Tool isError is a verified remote error, never business success or rollback', async () => {
        const f = await fixture(make, 'mcp_tool', { remoteError: true });
        try {
            await f.start(); await f.cold();
            expect(await f.observe()).toMatchObject({ outcome: 'failed', observation: { reasonCode: 'mcp_remote_reported_error',
                dispatchEvidence: { reference: { evidence: { remoteReportedError: true } } }, domainReceiptRef: null, resultRefs: [] } });
            expect(f.calls).toHaveLength(4);
        } finally { await f.cleanup(); }
    });

    test.each(['true', null, 1])('malformed remote isError=%p cannot mint a validated response proof', async remoteError => {
        const f = await fixture(make, 'mcp_tool', { remoteError });
        try {
            await expect(f.start()).rejects.toThrow(/isError must be boolean/);
            await f.cold(); expect((await f.observe()).outcome).toBe('unknown'); expect(f.calls).toHaveLength(4);
        } finally { await f.cleanup(); }
    });

    test.each(['source', 'grant'])('Skill %s revoked during receipt persistence blocks body return but preserves historical fact', async change => {
        const f = await fixture(make, 'skill_read');
        try {
            const original = f.exec.effects.observe.bind(f.exec.effects);
            f.exec.effects.observe = async (...args) => {
                const ack = await original(...args);
                if (change === 'source') await f.core.appendTimeline(f.h.handle, f.root.sourceBinding.sourceRef.sessionId, { role: 'user', content: 'Moved source during callback' });
                else f.revokeGrant();
                return ack;
            };
            await expect(f.start()).rejects.toThrow(change === 'source' ? /revision_conflict/ : /grant revoked/);
            await f.cold(); const saved = await f.observe();
            expect(saved).toMatchObject({ outcome: 'confirmed', observation: { resultRefs: [] } });
            expect(JSON.stringify(saved)).not.toContain('Synthetic Skill body');
        } finally { await f.cleanup(); }
    });

    test('Skill contradictory observation during completion blocks live body and cold confirmed receipt resurrection', async () => {
        const f = await fixture(make, 'skill_read'); let contradicting = false;
        try {
            const original = f.exec.effects.observe.bind(f.exec.effects);
            f.exec.effects.observe = async (...args) => {
                const ack = await original(...args);
                if (!contradicting) {
                    contradicting = true;
                    await f.contradict(args[1].observation);
                }
                return ack;
            };
            await expect(f.start()).rejects.toThrow(/consume_denied/);
            await f.cold(); expect((await f.observe()).outcome).toBe('unknown');
            expect(f.calls).toHaveLength(0);
        } finally { await f.cleanup(); }
    });

    test('original MCP final freshness failure never invokes completion persistence', async () => {
        const f = await fixture(make, 'mcp_resource'); let writes = 0;
        try {
            const original = f.exec.effects.observe.bind(f.exec.effects);
            f.exec.effects.observe = (...args) => { writes++; return original(...args); };
            f.onResponse(async body => { if (body.method === 'resources/read') await f.core.appendTimeline(f.h.handle, f.root.sourceBinding.sourceRef.sessionId, { role: 'user', content: 'Moved source during response' }); });
            await expect(f.start()).rejects.toThrow(/source_stale/);
            await f.cold(); expect((await f.observe()).outcome).toBe('unknown'); expect(writes).toBe(0);
        } finally { await f.cleanup(); }
    });

    test.each(['mcp_tool', 'skill_read'])('%s live proof cannot be substituted by plain object, reference or saved receipt', async kind => {
        const f = await fixture(make, kind);
        try {
            expect(() => f.service.verifyCompletion(f.h.handle, {}, {})).toThrow(/completion_proof_invalid/);
            expect(() => verifyProjectSkillCompletion({}, {})).toThrow(/completion proof/);
            const copyRejections = [], bindingRejections = []; let expired = () => true;
            if (kind.startsWith('mcp')) {
                const original = f.service.verifyCompletion.bind(f.service); let captured, expected;
                f.service.verifyCompletion = (handle, proof, binding) => {
                    captured = proof; expected = binding;
                    try { original(handle, JSON.parse(JSON.stringify(proof)), binding); copyRejections.push('accepted'); } catch (error) { copyRejections.push(error.code); }
                    try { original(handle, proof, { ...binding, bindingDigest: 'f'.repeat(64) }); bindingRejections.push('accepted'); } catch (error) { bindingRejections.push(error.code); }
                    return original(handle, proof, binding);
                };
                expired = () => { try { original(f.h.handle, captured, expected); return false; } catch { return true; } };
            }
            await f.start(); expect(expired()).toBe(true);
            expect(copyRejections).toEqual(kind.startsWith('mcp') ? ['native_mcp_completion_proof_invalid', 'native_mcp_completion_proof_invalid'] : []);
            expect(bindingRejections).toEqual(copyRejections);
            const saved = await f.observe();
            const forged = { ...saved.observation, observationId: 'forged-reference', dispatchEvidence: { kind: 'original_port_observation', reference: { authorized: true } } };
            await expect(f.exec.effects.observe(f.h.handle, { ...runGuard(await f.exec.runs.get(f.h.handle, f.root.runId)), effectId: f.effectId, observation: forged }))
                .rejects.toThrow(/completion_proof_required/);
            await f.contradict(saved.observation); expect((await f.observe()).outcome).toBe('unknown');
        } finally { await f.cleanup(); }
    });

    test.each(['mcp_resource', 'skill_files'])('%s save-before-ACK loss resolves only by reading the same receipt', async kind => {
        const f = await fixture(make, kind); let writes = 0;
        try {
            const original = f.exec.effects.observe.bind(f.exec.effects);
            f.exec.effects.observe = async (...args) => { writes++; await original(...args); throw new StorageCommitUnknownError(new Error('Synthetic saved ACK loss')); };
            await f.start(); await f.cold(); expect((await f.observe()).outcome).toBe('confirmed'); expect(writes).toBe(1);
        } finally { await f.cleanup(); }
    });

    test.each(['mcp_tool', 'skill_read'])('%s no-save and unresolved original budget remain unknown after cold reopen', async kind => {
        const f = await fixture(make, kind); let writes = 0;
        try {
            f.exec.effects.observe = async () => { writes++; throw new StorageCommitUnknownError(new Error('Synthetic no-save boundary')); };
            await expect(f.start()).rejects.toThrow(/commit outcome is unknown/);
            await f.cold(); expect((await f.observe()).outcome).toBe('unknown'); expect(writes).toBe(1);
            expect(f.calls.length).toBe(kind.startsWith('mcp') ? 4 : 0);
        } finally { await f.cleanup(); }
        const unsettled = await fixture(make, kind, { settleInitial: false });
        try {
            await expect(unsettled.start()).rejects.toThrow(/completion_budget_invalid/);
            await unsettled.settleAdmission(); await unsettled.cold(); expect((await unsettled.observe()).outcome).toBe('unknown');
        } finally { await unsettled.cleanup(); }
    });

    test('original Skill proof is valid only during its actual read callback and JSON copies cannot carry it', async () => {
        const f = await fixture(make, 'skill_read'); let captured;
        try {
            const attemptId = localWorkAttemptId(f.effectId, 1), bindingDigest = hash({ originalRead: true });
            const compute = { assertCurrent: () => f.exec.sourcePort.revalidate(f.h.handle, f.root.sourceBinding),
                beforeLocalWork: async ({ items, inputBytes, kind }) => {
                    await f.exec.budgetPort.chargeLocalWork(f.h.handle, { authorityRef: f.root.budgetAuthorityRef, reservationId: f.root.runId, limits,
                        effectId: f.effectId, localWorkOrdinal: 1, attempt: { attemptId, requestId: 'native-skill-proof', kind,
                            estimatedItems: items, estimatedInputBytes: inputBytes, targetFingerprint: hash(f.input) } }); return { attemptId };
                }, settleLocalWork: (ticket, usage) => f.exec.budgetPort.settleLocalWork(f.h.handle, f.root.budgetAuthorityRef, ticket.attemptId, usage) };
            const expected = { repository: f.repository, bindingDigest, inputHash: hash(f.input), operation: 'read' };
            await executeProjectSkillWork({ operation: 'read', input: f.input, repository: f.repository, compute, completionBindingDigest: bindingDigest,
                onCompleted: proof => { captured = proof; expect(verifyProjectSkillCompletion(proof, expected)).toMatchObject({ protocol: 'skill', operation: 'read' });
                    expect(() => verifyProjectSkillCompletion(proof, { ...expected, bindingDigest: 'f'.repeat(64) })).toThrow();
                    expect(() => verifyProjectSkillCompletion(JSON.parse(JSON.stringify(proof)), expected)).toThrow(); } });
            expect(() => verifyProjectSkillCompletion(captured, expected)).toThrow();
            expect((await f.observe()).outcome).toBe('unknown');
        } finally { await f.cleanup(); }
    });
});
