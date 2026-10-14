import { describe, expect, jest, test } from '@jest/globals';
import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { CredentialTargetAuthority, createCredentialSecretPort } from '../../src/native/model-prompt-runtime/credential-targets.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { createNativeSessionRouter } from '../../src/endpoints/native-session.js';
import { CAPABILITIES } from '../../public/scripts/lib/orchestration-engine/capabilities.js';
import { nativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { readRunControl } from '../../src/native/run-control.js';

const suite = process.env.ATRIA_MCP_SOURCE ? describe : describe.skip;
suite('real MCP delegation → existing Browser AgentRuntime → reviewed Native Host → local Provider', () => {
    let h, f, seeded, host, browser, provider, appServer, executor, registry, seen, approvalHook, failSend, heldSend, release, loaded, driftOnAdmission, sessionId;
    beforeAll(async () => {
        const root = process.env.ATRIA_MCP_SOURCE;
        loaded = {};
        for (const [key, file] of [['delegation', 'agent-delegation.js'], ['kernel', 'kernel.js'], ['browser', 'browser.js']]) loaded[key] = await import(pathToFileURL(join(root, 'src', file)).href);
    });
    beforeEach(async () => {
        h = await makeTempFsEngineHarness(); f = await installFixture(h); seen = []; approvalHook = null; failSend = false; heldSend = false; driftOnAdmission = false;
        const gate = new Promise(resolveGate => { release = resolveGate; });
        provider = createServer(async (req, res) => {
            let raw = ''; for await (const chunk of req) raw += chunk; seen.push(JSON.parse(raw));
            if (heldSend) await gate;
            if (failSend) { res.destroy(); return; }
            res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ type: 'complete', output: 'Native reviewed delegated result' }) } }],
                usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 } }));
        });
        await new Promise(resolveListen => provider.listen(0, '127.0.0.1', resolveListen));
        const snapshot = await f.core.create(h.handle, f.start);
        sessionId = snapshot.session.sessionId;
        seeded = await seedGenerationProfiles({ ...h, roles: ['orchestrator'], endpoint: `http://127.0.0.1:${provider.address().port}/v1/chat/completions` });
        await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], policy: { ...seeded.routes[0].policy, maxRetries: 2 }, executionPolicy: {
            schemaVersion: 1, allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: { maxRequests: 3, maxTokens: 100000 } } });
        const credentials = new CredentialTargetAuthority({ persistence: seeded.persistence }), view = await credentials.inspect(h.handle, { connectionProfileId: seeded.connection.connectionProfileId });
        await credentials.authorize(h.handle, { connectionProfileId: seeded.connection.connectionProfileId, expectedFingerprint: view.connectionFingerprint,
            expectedTargetFingerprint: view.targetFingerprint, expectedPermitFingerprint: view.permitFingerprint, allowLocal: true });
        host = new NativeGenerationHost({ ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller,
            providers: { 'provider.openai-compatible': createHttpGenerationProvider() }, secretPort: createCredentialSecretPort({ authority: credentials, resolveSecret: async () => 'synthetic-loopback-only' }) });
        const app = express(), boot = randomUUID(); app.use(express.json({ limit: '1mb' }));
        app.use((req, res, next) => { req.user = { profile: { handle: h.handle } }; res.set('x-atria-server-boot-id', boot); next(); });
        app.use(async (req, _res, next) => {
            if (driftOnAdmission && req.path === '/api/native/generation/execute/start') await seeded.persistence.saveModelProfile(h.handle, { ...seeded.model, displayName: 'Late concurrent configuration edit' });
            next();
        });
        app.get('/csrf-token', (_req, res) => res.json({ token: 'fixture' }));
        app.get('/api/diagnostics/runtime-identity', (_req, res) => res.json({ version: 1, serverBootId: boot, processStartedAt: Date.now(), appVersion: 'test', mutationGuards: 1,
            source: { algorithm: 'atria-source-v1', revision: null, branch: null, workspaceId: null, fingerprint: null, reasons: [] } }));
        app.use('/api/native/session', createNativeSessionRouter(() => f));
        app.use('/api/native/generation', createNativeGenerationRouter(() => host, () => null));
        app.use(express.static(resolve('public'))); app.get('/', (_req, res) => res.type('html').send('<!doctype html><main>Delegated Native fixture</main>'));
        appServer = createServer(app); await new Promise(resolveListen => appServer.listen(0, '127.0.0.1', resolveListen));
        browser = new loaded.browser.AtriaBrowser({ url: `http://127.0.0.1:${appServer.address().port}`, channel: process.env.ATRIA_TEST_BROWSER_CHANNEL || 'msedge', timeout: 10000, maxResponseBytes: 1048576 });
        await browser.open();
        const caps = Object.fromEntries(CAPABILITIES.map(key => [key, true]));
        const preset = { schemaVersion: 1, id: 'delegation-fixture', name: 'Native controlled fixture', mode: 'loop', planTemplate: { schemaVersion: 1, planId: 'fixture', source: { mode: 'loop' },
            agents: [{ id: 'owner', tools: [], capabilities: caps, modelProfile: { nativeRouteRef: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } } }],
            nodes: [{ nodeId: 'owner', agentId: 'owner', kind: 'agent', capabilities: caps }], edges: [], entryNodeId: 'owner', capabilities: caps,
            budgets: { maxSteps: 4, maxTasks: 2, maxConcurrency: 1 }, arbitration: { kind: 'pass-through' }, output: { kind: 'guidance', ownerNodeId: 'owner', submitCapability: 'result.submit' } } };
        await browser.page.evaluate(async ({ preset, scope }) => {
            const { createDelegatedRunApi } = await import('/scripts/agents/orchestrator/delegated-run.js');
            const api = createDelegatedRunApi({ getPreset: () => preset, getScope: () => scope, getContext: () => ({}), generate: async () => { throw new Error('Unreviewed default model path forbidden'); } });
            globalThis.Atria = { getContext: () => ({ getCapabilityApi: () => api }) };
        }, { preset, scope: { sessionId: snapshot.session.sessionId, revisionId: snapshot.revision.revisionId, branchId: snapshot.revision.branchId } });
        registry = loaded.delegation.registerAgentDelegation(new loaded.kernel.ActionRegistry(), browser);
        executor = new loaded.kernel.RiskExecutor(registry, new loaded.kernel.PolicyCeiling(registry, registry.ids()), { approve: async () => {
            if (approvalHook) await approvalHook(); return { action: 'accept', content: { authorize: true, uses: 1 } };
        } });
    });
    afterEach(async () => { release(); appServer?.closeAllConnections(); provider?.closeAllConnections(); await browser?.close();
        await Promise.all([appServer, provider].filter(Boolean).map(server => new Promise(resolveClose => server.close(resolveClose))));
        for (const operation of nativeTaskScheduler.operations.values()) if (operation.owner === h.handle && !['completed', 'failed', 'cancelled', 'stale'].includes(operation.view.status)) nativeTaskScheduler.cancel(h.handle, operation.view.operationId);
        jest.restoreAllMocks(); await h.cleanup();
    }, 30000);
    const inspect = () => executor.execute('READ', { action: 'agent.delegation.inspect', input: { presetId: 'delegation-fixture', nodeId: 'owner' } });
    const run = (view, context = {}) => executor.execute('MUTATE', { action: 'agent.run.start', input: { presetId: 'delegation-fixture', nodeId: 'owner', mode: 'delegated-node', presetHash: view.presetHash,
        runtimeRouteId: view.runtimeRouteId, expectedGenerationFingerprint: view.generationFingerprint, acceptModelCharges: true,
        task: 'Finish the exact approved fixture task', maxSteps: 3, contextBudget: 12000, timeoutMs: 10000, operations: [] } }, context);
    const charges = async () => Object.values((await h.engine.withTransaction(h.handle, tx => readRunControl(tx, h.handle, sessionId)))?.operations ?? {}).flatMap(value => value.compute?.attempts ?? []);

    test('real selected AgentRuntime uses exactly reviewed Native generation and original usage bank', async () => {
        const regex = jest.spyOn(f.packageInstaller, 'currentRegexEdit').mockRejectedValue(new Error('MCP delegated execution must not adopt Package edits or wake background models'));
        const view = await inspect(); expect(view.generationReview.budget.maxRequests).toBe(3); expect(seen).toHaveLength(0);
        const result = await run(view);
        expect(result.receipt.status).toBe('succeeded'); expect(result.result.evidence.output).toBe('Native reviewed delegated result'); expect(seen).toHaveLength(1);
        expect(result.result.evidence.modelCalls[0].usage.totalTokens ?? result.result.evidence.modelCalls[0].usage.total_tokens).toBe(18);
        expect(result.result.evidence.modelCalls[0].nativeOperationId).toBeDefined();
        expect(await charges()).toEqual([expect.objectContaining({ status: 'settled', usage: expect.objectContaining({ totalTokens: 18 }) })]);
        expect(regex).not.toHaveBeenCalled();
    }, 30000);
    test('model configuration drift during approval is refused before any Native send', async () => {
        const view = await inspect(); approvalHook = () => seeded.persistence.saveModelProfile(h.handle, { ...seeded.model, displayName: 'Concurrent owner model edit' });
        await expect(run(view)).rejects.toThrow('configuration or budget changed'); expect(seen).toHaveLength(0);
    }, 30000);
    test('uncertain Provider failure is not retried even when the ordinary Native route has maxRetries=2', async () => {
        const view = await inspect(); failSend = true;
        const result = await run(view); expect(result.receipt.status).toBe('indeterminate'); expect(seen).toHaveLength(1);
        const failed = [...nativeTaskScheduler.operations.values()].findLast(value => value.owner === h.handle && value.view.status === 'failed');
        expect(failed).toBeDefined(); expect(failed.view.observation).toBeUndefined();
        expect(result.result.evidence.modelCalls[0].nativeOperationId).toBe(failed.view.operationId);
        expect(await charges()).toEqual([expect.objectContaining({ status: 'unknown' })]);
    }, 30000);
    test('Native send rejects a configuration edit after per-call preview without contacting the Provider', async () => {
        const view = await inspect(); driftOnAdmission = true;
        const result = await run(view); expect(result.receipt.status).toBe('indeterminate'); expect(seen).toHaveLength(0);
        expect(await charges()).toEqual([]);
    }, 30000);
    test('cancellation reaches only this delegated Native operation and preserves unknown usage', async () => {
        let finishUnrelated;
        const unrelated = nativeTaskScheduler.submit({ owner: h.handle, anchor: { kind: 'unrelated-fixture' }, kind: 'auxiliary_task', executionClass: 'background',
            resources: ['unrelated-fixture'], key: randomUUID(), fingerprint: 'unrelated', retry: false, fresh: async () => true,
            run: ({ signal }) => new Promise(resolveRun => { finishUnrelated = () => resolveRun({}); signal.addEventListener('abort', finishUnrelated, { once: true }); }), finalize: value => value });
        const view = await inspect(), controller = new AbortController(); heldSend = true;
        const pending = run(view, { signal: controller.signal });
        const deadline = Date.now() + 10000;
        while (!seen.length && Date.now() < deadline) await new Promise(resolveWait => setTimeout(resolveWait, 10));
        expect(seen).toHaveLength(1); controller.abort(new Error('Fixture user cancelled delegation'));
        const result = await pending;
        expect(result.receipt.status).toBe('indeterminate'); expect(seen).toHaveLength(1);
        expect(result.result.evidence.status).toBe('cancelled');
        const settlementDeadline = Date.now() + 5000;
        while ((await charges()).some(value => value.status === 'charged') && Date.now() < settlementDeadline) await new Promise(resolveWait => setTimeout(resolveWait, 10));
        expect(await charges()).toEqual([expect.objectContaining({ status: 'unknown' })]);
        expect(nativeTaskScheduler.project(h.handle, unrelated.operationId).status).toBe('running'); finishUnrelated(); await unrelated.result;
    }, 30000);
});
