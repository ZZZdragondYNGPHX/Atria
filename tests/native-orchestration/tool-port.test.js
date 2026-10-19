import http from 'node:http';
import { ToolPort } from '../../src/native/orchestration/tool-port.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { McpService } from '../../src/native/mcp-service.js';
import { A2aService } from '../../src/native/a2a-service.js';
import { NativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { CredentialTargetAuthority, canonicalCredentialTarget, createCredentialSecretPort } from '../../src/native/model-prompt-runtime/credential-targets.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { installCognitionFixture } from '../native/helpers/cognition-fixture.js';
import { seedGenerationProfiles } from '../native/helpers/generation-fixture.js';
import { prepareControllerOwnerRoot } from './fixtures.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { createSkillRepository } from '../../src/skills/repository.js';
import { services } from '../native/helpers/session-fixture.js';
import { NativeModelPromptPersistence } from '../../src/native/model-prompt-runtime/persistence.js';

// Synthetic trusted controller/grant callbacks; actual original FS/SQLite
// Session banks, CredentialTargetAuthority, HTTP clients and Native scheduler.
// No real provider charge or protected Review Origin is represented here.
async function fixture(make, protocol, { auth = 'none', hook = async () => {}, childJobs = 8, routeJobs = 16 } = {}) {
    const calls = [], errors = [], secretReads = []; let endpoint;
    const server = http.createServer(async (req, res) => {
        try {
            const chunks = []; for await (const chunk of req) chunks.push(chunk);
            const body = req.method === 'GET' ? { method: 'GetAgentCard' } : JSON.parse(Buffer.concat(chunks).toString());
            calls.push({ method: body.method, authorization: req.headers.authorization, body });
            await hook(body);
            if (body.method === 'notifications/initialized') { res.writeHead(202); res.end(); return; }
            const card = { name: 'Synthetic', description: 'fixture', version: '1',
                supportedInterfaces: [{ url: endpoint, protocolBinding: 'JSONRPC', protocolVersion: '1.0' }], capabilities: {},
                defaultInputModes: ['text/plain'], defaultOutputModes: ['application/json'], skills: [{ id: 'stats', name: 'Stats', description: 'Count', tags: [] }] };
            const task = { id: 'task-1', contextId: 'context-1', status: { state: 'TASK_STATE_WORKING' }, artifacts: [] };
            const results = { initialize: { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } },
                'tools/list': { tools: [{ name: 'stats' }] }, 'tools/call': { content: [{ type: 'text', text: 'synthetic public result' }] },
                SendMessage: { task }, GetTask: task };
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(body.method === 'GetAgentCard' ? card : { jsonrpc: '2.0', id: body.id, result: results[body.method] }));
        } catch (error) { errors.push(error); res.writeHead(500); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    endpoint = `http://127.0.0.1:${server.address().port}/rpc`;
    let h;
    try {
        h = await make();
        await prepareControllerOwnerRoot(h.dirs.root);
        attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        const f = await installCognitionFixture(h, 'limited', undefined, ({ contract }) => {
            contract.informationRuntime.sources.push({ id: 'public-lines', kind: 'timeline', semantic: 'narrative', scopeId: 'session', fields: [['content']] });
            contract.informationRuntime.views.find(view => view.id === 'player').sources.push('public-lines');
        });
        const base = await f.core.appendTimeline(h.handle, f.snapshot.session.sessionId, { role: 'assistant', content: 'synthetic public words' }, { expectedRevisionId: f.snapshot.revision.revisionId });
        const seeded = await seedGenerationProfiles({ ...h, endpoint });
        const connection = { ...seeded.connection, providerAdapter: 'provider.' + protocol };
        await seeded.persistence.saveConnectionProfile(h.handle, connection);
        const limits = { maxRequests: 1, maxTokens: 4096, localWork: { maxJobs: 16, maxItems: 10000, maxInputBytes: 16777216 } };
        const policy = protocol === 'mcp' ? { protocolVersion: '2025-11-25', connectionProfileId: connection.connectionProfileId, toolNames: ['stats'], resourceUris: [], auth }
            : { protocolVersion: '1.0', connectionProfileId: connection.connectionProfileId, skillIds: ['stats'], auth };
        await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: { schemaVersion: 1,
            allowedModelProfileIds: [seeded.model.modelProfileId], [protocol]: policy,
            computeBudget: { ...limits, localWork: { ...limits.localWork, maxJobs: routeJobs } } } });
        const credentialAuthority = new CredentialTargetAuthority({ persistence: seeded.persistence });
        const host = { ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller,
            secretPort: createCredentialSecretPort({ authority: credentialAuthority, resolveSecret: async ref => { secretReads.push(ref); return 'synthetic-secret'; } }) };
        const scheduler = new NativeTaskScheduler(), service = protocol === 'mcp' ? new McpService({ host, scheduler }) : new A2aService({ host, scheduler });
        const budgetPort = new BudgetPort({ sessionCore: f.core }), authorityRef = await budgetPort.authorityFor(h.handle, { domain: 'native_session', sessionId: base.session.sessionId });
        const runId = createNativeId('orchestrationRun'), effectId = createNativeId('orchestrationEffect');
        await budgetPort.reserveChild(h.handle, { authorityRef, parentReservationId: null, childRunId: runId, limits,
            ceiling: { maxRequests: 0, maxTokens: 0, localWork: { ...limits.localWork, maxJobs: childJobs } } });
        const input = { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, viewId: 'player',
            itemId: 'public-lines:' + base.timeline.at(-1).messageId, ...(protocol === 'mcp' ? { toolName: 'stats' } : { skillId: 'stats' }) };
        const root = { runId, budgetAuthorityRef: authorityRef }, intent = { runId, effectId, dispatchToken: 'trusted-token', status: 'dispatching',
            actionRef: { protocol, operation: protocol === 'mcp' ? 'tool' : 'send' }, targetRef: { connectionProfileId: connection.connectionProfileId },
            endpointBindingDigest: hash(canonicalCredentialTarget(connection)), inputRef: { source: 'fixture' }, inputHash: hash(input),
            risk: 'R1', requiresApproval: false, approvalRef: null, grantDigest: 'a'.repeat(64), egressDigest: 'b'.repeat(64),
            sourceBindingDigest: 'c'.repeat(64), capability: protocol + '.read', budgetAttemptRef: { authorityRef, reservationId: runId } };
        const grant = { grantDigest: intent.grantDigest, egressDigest: intent.egressDigest, sourceBindingDigest: intent.sourceBindingDigest, capability: intent.capability, limits };
        let current = true;
        const port = new ToolPort({ [protocol + 'Service']: service, budgetPort, credentialAuthority,
            verifyDispatch: async () => current ? { root: structuredClone(root), intent: structuredClone(intent) } : null,
            readInput: async () => structuredClone(input), authorizeTool: async () => structuredClone(grant) });
        return { h, f, host, base, input, intent, root, port, budgetPort, service, scheduler, calls, errors, secretReads, credentialAuthority, connection,
            revoke: () => { current = false; }, request: { runId, effectId, dispatchToken: intent.dispatchToken },
            cleanup: async () => {
                for (const op of scheduler.operations.values()) scheduler.cancel(h.handle, op.view.operationId);
                while (scheduler.running.size) await new Promise(resolve => setTimeout(resolve, 5));
                server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
                await h.engine.close?.(); await h.cleanup();
            } };
    } catch (error) {
        server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
        await h?.engine.close?.(); await h?.cleanup();
        throw error;
    }
}

// SQL uses isolated original harness databases/schemas when explicitly selected.
// Default invocation is FS/SQLite; ATRIA_TEST_TOOL_SQL=1 selects all four.
describe.each(CONTRACT_HARNESSES.filter(({ name }) => process.env.ATRIA_TEST_TOOL_SQL === '1'
    || ['FsEngine', 'SqliteEngine'].includes(name)))('$name ToolPort', ({ make }) => {
    test.each(['mcp', 'a2a'])('%s real HTTP uses child bank, refuses replay and preserves unknown observation', async protocol => {
        const f = await fixture(make, protocol);
        try {
            const started = await f.port.execute(f.h.handle, f.request);
            await f.scheduler.operations.get(started.operationRef.operationId).handle.result;
            expect(started).toMatchObject({ outcome: 'unknown', receiptRef: null });
            expect(await f.port.observe(f.h.handle, started.operationRef)).toMatchObject({ outcome: 'unknown', status: 'completed', receiptRef: null });
            const bank = await f.f.core.runs.status(f.h.handle, f.input.sessionId);
            const work = Object.values(bank.operations).flatMap(op => op.compute?.localWork ?? []);
            expect(work).toHaveLength(protocol === 'mcp' ? 5 : 3);
            expect(work.every(row => row.reservationId === f.root.runId && row.usage.outcome === 'completed')).toBe(true);
            const before = f.calls.length;
            await expect(f.port.execute(f.h.handle, f.request)).rejects.toThrow(/attempt|work|budget/i);
            expect(f.calls).toHaveLength(before); expect(f.errors).toEqual([]);
            expect(f.secretReads).toEqual([]);
        } finally { await f.cleanup(); }
    });

    test.each(['mcp', 'a2a'])('%s revoke between protocol requests prevents the next network send', async protocol => {
        let f;
        f = await fixture(make, protocol, { hook: async () => { f.revoke(); } });
        try {
            const started = await f.port.execute(f.h.handle, f.request);
            await expect(f.scheduler.operations.get(started.operationRef.operationId).handle.result).rejects.toThrow(/dispatch_denied/);
            expect(f.calls).toHaveLength(1); expect(f.errors).toEqual([]);
        } finally { await f.cleanup(); }
    });

    test('R3/client approval Boolean, grant drift, payload drift and changed endpoint cannot dispatch', async () => {
        const f = await fixture(make, 'mcp');
        try {
            f.intent.risk = 'R3'; f.intent.requiresApproval = true;
            await expect(f.port.execute(f.h.handle, f.request)).rejects.toThrow(/approval_unavailable/);
            await expect(f.port.execute(f.h.handle, { ...f.request, approved: true })).rejects.toThrow();
            f.intent.risk = 'R1'; f.intent.requiresApproval = false;
            f.intent.grantDigest = 'f'.repeat(64);
            await expect(f.port.execute(f.h.handle, f.request)).rejects.toThrow(/grant_denied/);
            f.intent.inputHash = 'f'.repeat(64);
            await expect(f.port.execute(f.h.handle, f.request)).rejects.toThrow(/input_stale/);
            f.intent.inputHash = hash(f.input); f.intent.endpointBindingDigest = 'f'.repeat(64);
            await expect(f.port.execute(f.h.handle, f.request)).rejects.toThrow(/target_stale/);
            expect(f.calls).toEqual([]);
        } finally { await f.cleanup(); }
    });

    test('child exhaustion prevents MCP discovery after first protocol request', async () => {
        const f = await fixture(make, 'mcp', { childJobs: 2 });
        try {
            const started = await f.port.execute(f.h.handle, f.request);
            await expect(f.scheduler.operations.get(started.operationRef.operationId).handle.result).rejects.toThrow(/budget/);
            expect(f.calls.map(row => row.method)).toEqual(['initialize']);
        } finally { await f.cleanup(); }
    });

    test('original route local limit intersects the wider orchestration grant', async () => {
        const f = await fixture(make, 'mcp', { routeJobs: 1 });
        try {
            let failure;
            try {
                const started = await f.port.execute(f.h.handle, f.request);
                await f.scheduler.operations.get(started.operationRef.operationId).handle.result;
            } catch (error) { failure = error; }
            expect(failure?.code).toMatch(/budget/);
            expect(f.calls).toEqual([]);
        } finally { await f.cleanup(); }
    });

    test('original CredentialTarget permit is required before Secret resolution and binds exact endpoint', async () => {
        const f = await fixture(make, 'mcp', { auth: 'secret' });
        try {
            await expect(f.port.execute(f.h.handle, f.request)).rejects.toThrow(/target_approval_required/);
            expect(f.secretReads).toEqual([]); expect(f.calls).toEqual([]);
            const view = await f.credentialAuthority.inspect(f.h.handle, { connectionProfileId: f.connection.connectionProfileId });
            await f.credentialAuthority.authorize(f.h.handle, { connectionProfileId: f.connection.connectionProfileId,
                expectedFingerprint: view.connectionFingerprint, expectedTargetFingerprint: view.targetFingerprint,
                expectedPermitFingerprint: view.permitFingerprint, allowLocal: true });
            const started = await f.port.execute(f.h.handle, f.request);
            await f.scheduler.operations.get(started.operationRef.operationId).handle.result;
            expect(f.secretReads).toEqual([f.connection.secretRef]);
            expect(f.calls.every(call => call.authorization === 'Bearer synthetic-secret')).toBe(true);
            expect(JSON.stringify(await f.port.observe(f.h.handle, started.operationRef))).not.toContain('synthetic-secret');
        } finally { await f.cleanup(); }
    });

    test('Skill refuses an adapter without the original durable Run and Effect consumer before reading or charging work', async () => {
        const f = await fixture(make, 'mcp');
        try {
            const repository = createSkillRepository(f.h.dirs.root), scope = { kind: 'global' };
            await repository.install({ scope, payload: { files: [{ path: 'SKILL.md', encoding: 'utf8',
                content: '---\nname: guide\ndescription: Synthetic guidance\n---\nText, never Host code.' }] } });
            const entry = await repository.get('guide', scope);
            const pinned = await repository.pin({ scope, name: 'guide', expectedHash: entry.installedHash });
            const input = { scope, name: 'guide', version: pinned.version, path: 'SKILL.md', offset: 1, limit: 10 };
            let reads = 0;
            const readFile = repository.readFile.bind(repository);
            repository.readFile = (...args) => { reads++; return readFile(...args); };
            f.intent.actionRef = { protocol: 'skill', operation: 'read' }; f.intent.risk = 'R0'; f.intent.inputHash = hash(input);
            f.port.readInput = async () => input;
            f.port.skillAuthority = async () => ({ repository, settings: {}, projectId: null, revalidate: async () => {
                const current = await repository.get('guide', scope);
                if (current.installedHash !== entry.installedHash) throw new Error('skill-source-stale');
            } });
            const outcome = await f.port.execute(f.h.handle, f.request).then(value => ({ value }), error => ({ error }));
            expect(reads).toBe(0);
            expect(f.calls).toEqual([]);
            const bank = await f.f.core.runs.status(f.h.handle, f.input.sessionId);
            const work = Object.values(bank.operations).flatMap(op => op.compute?.localWork ?? []);
            expect(work).toHaveLength(0);
            expect(outcome.error).toMatchObject({ code: 'native_orchestration_tool_consume_denied' }); expect(outcome.value).toBeUndefined();
        } finally { await f.cleanup(); }
    });

    test('A2A ownership survives cold Engine reopen and refuses original reconnect/cancel or binding removal', async () => {
        const f = await fixture(make, 'a2a'); let coldEngine;
        try {
            const started = await f.port.execute(f.h.handle, f.request);
            await f.scheduler.operations.get(started.operationRef.operationId).handle.result;
            const ref = { operationId: started.operationRef.operationId, sessionId: f.input.sessionId };
            await expect(f.service.reconnect(f.h.handle, ref)).rejects.toMatchObject({ code: 'native_a2a_orchestration_reauthorization_required' });
            await expect(f.service.cancel(f.h.handle, ref)).rejects.toMatchObject({ code: 'native_a2a_orchestration_reauthorization_required' });
            await f.h.engine.close();
            coldEngine = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary',
                directoriesByHandle: handle => { if (handle !== f.h.handle) throw new Error('owner denied'); return f.h.dirs; } });
            attachNativeHostLifecycle(coldEngine, { directoriesByHandle: () => f.h.dirs });
            const cold = services(f.h, coldEngine), scheduler = new NativeTaskScheduler();
            const host = { ...f.host, sessionCore: cold.core, persistence: new NativeModelPromptPersistence({ engine: coldEngine }), packageInstaller: cold.packageInstaller };
            const rebuilt = new A2aService({ host, scheduler });
            const status = await rebuilt.status(f.h.handle, ref);
            expect(status).toMatchObject({ status: 'interrupted', canReconnect: false, artifact: null, recovery: 'orchestration_authority_required' });
            const anchor = { branchId: f.base.revision.branchId, revisionId: f.input.revisionId };
            const retained = await cold.core.runs.externalTask(f.h.handle, f.input.sessionId, anchor, ref.operationId);
            expect(retained.orchestrationBinding).toEqual({ schemaVersion: 1, runId: f.root.runId, effectId: f.intent.effectId,
                sourceBindingDigest: f.intent.sourceBindingDigest, grantDigest: f.intent.grantDigest });
            const before = f.calls.length;
            await expect(rebuilt.reconnect(f.h.handle, ref)).rejects.toMatchObject({ code: 'native_a2a_orchestration_reauthorization_required' });
            await expect(rebuilt.cancel(f.h.handle, ref)).rejects.toMatchObject({ code: 'native_a2a_orchestration_reauthorization_required' });
            const { orchestrationBinding, ...unbound } = retained;
            await expect(cold.core.runs.externalTask(f.h.handle, f.input.sessionId, anchor, ref.operationId, unbound))
                .rejects.toMatchObject({ code: 'native_a2a_orchestration_binding_conflict' });
            await expect(cold.core.runs.externalTask(f.h.handle, f.input.sessionId, anchor, ref.operationId,
                { ...retained, orchestrationBinding: { ...orchestrationBinding, effectId: createNativeId('orchestrationEffect') } }))
                .rejects.toMatchObject({ code: 'native_a2a_orchestration_binding_conflict' });
            expect(f.calls).toHaveLength(before);
            expect(await cold.core.runs.externalTask(f.h.handle, f.input.sessionId, anchor, ref.operationId)).toEqual(retained);
        } finally { await coldEngine?.close(); await f.cleanup(); }
    });
});
