import { expect, test, jest } from '@jest/globals';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { projectSource, services } from '../agent-intelligence/project-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createResponsesGenerationProvider } from '../../src/native/adapters/responses-generation-provider.js';
import { capabilityObservationProof, executionPathFingerprint } from '../../src/native/model-prompt-runtime/execution-evidence.js';
import { NATIVE_RESOURCE_KINDS } from '../../src/native/contracts.js';
import { RuntimeCheckpointStore } from '../../src/native/model-prompt-runtime/runtime-checkpoint-store.js';
import express from 'express';
import supertest from 'supertest';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { createNativeStudioRouter } from '../../src/endpoints/native-studio.js';
import { runNativeStudioAgentTask } from '../../public/scripts/native/studio-agent.js';

const harnesses = [['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]];
async function fixture(make, mode = 'task', verified = true) {
    const h = await make(); const wires = [];
    let reply = (_round, res) => res.end(JSON.stringify({ status: 'completed', output: [
        { type: 'reasoning', encrypted_content: 'PRIVATE-TASK-RUNTIME' },
        { type: 'function_call', call_id: 'read', name: 'atri_agent_get_project', arguments: '{\n}' },
    ], usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 } }));
    const server = createServer(async (req, res) => {
        let wire = ''; for await (const chunk of req) wire += chunk; wires.push(JSON.parse(wire));
        res.writeHead(200, { 'Content-Type': 'application/json' }); reply(wires.length, res);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { studio, agent } = services(h); const source = projectSource();
    const created = await studio.createProject(h.handle, source);
    const task = await agent.createTask(h.handle, source.project.projectId, { intent: 'Read project', baseRevision: created.revision.revision });
    const originalPlan = { summary: 'Original read', steps: [{ id: 'read', title: 'Read project', impact: 'low' }] };
    await agent.setPlan(h.handle, source.project.projectId, task.taskId, originalPlan);
    const seeded = await seedGenerationProfiles({ ...h, roles: ['studio'], format: 'openai-responses', endpoint: `http://127.0.0.1:${server.address().port}/v1/responses` });
    const model = await seeded.persistence.getModelProfile(h.handle, seeded.model.modelProfileId);
    const connection = await seeded.persistence.getConnectionProfile(h.handle, seeded.connection.connectionProfileId);
    const observedAt = Date.now() - 1;
    const decision = { capability: 'generation.continuation.task', state: 'supported', provenance: [{ kind: 'provider-endpoint', source: 'synthetic loopback task consumer', observedAt }],
        ...(verified ? { binding: { schemaVersion: 1, pathFingerprint: executionPathFingerprint({ handle: h.handle, connection, model }), observedAt,
            expiresAt: Date.now() + 60000, assurance: 'verified' } } : {}) };
    await seeded.persistence.saveModelProfile(h.handle, { ...model, limits: { contextTokens: 32000, outputTokens: 512 }, capabilities: [...model.capabilities, decision] },
        verified ? { observationProof: capabilityObservationProof({ handle: h.handle, connection, model }, [decision]) } : {});
    await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [model.modelProfileId], continuity: mode, computeBudget: { maxRequests: 4, maxTokens: 128000 } } });
    let onSecret = () => {};
    const providerFetch = globalThis.fetch;
    const newHost = () => new NativeGenerationHost({ ...seeded, studio, agent, providers: { 'provider.openai-responses': createResponsesGenerationProvider({ fetchImpl: providerFetch }) },
        secretPort: { resolveSecret: async () => { await onSecret(); return 'task-runtime-credential'; } } });
    const context = await agent.getContext(h.handle, source.project.projectId, task.taskId);
    const request = { role: 'studio', projectId: source.project.projectId, taskId: task.taskId, revision: created.revision.revision,
        requestId: 'task-runtime-first', tools: context.tools, messages: [{ role: 'user', content: task.intent }] };
    const rows = () => h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: NATIVE_RESOURCE_KINDS.runtimeCheckpoint, handle: h.handle }));
    return { h, seeded, studio, agent, task, originalPlan, request, newHost, wires, rows, setSecret: fn => { onSecret = fn; }, setReply: fn => { reply = fn; },
        cleanup: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.cleanup(); } };
}
const followup = (f, response) => ({ ...f.request, requestId: 'task-runtime-next', messages: [...f.request.messages,
    { role: 'assistant', content: response.text, tool_calls: response.toolCalls.map(call => call.raw), providerState: response.providerState },
    { role: 'tool', tool_call_id: response.toolCalls[0].id, content: 'Public project read' }] });
test.each(harnesses)('Runtime task %s actual Host resumes persisted opaque state and retains final state without domain writes', async (_name, make) => {
    const f = await fixture(make);
    try {
        const first = await f.newHost().execute(f.h.handle, f.request);
        expect(await f.rows()).toHaveLength(1);
        expect(JSON.stringify(first)).not.toContain('PRIVATE-TASK-RUNTIME');
        // All retained lowering reads storage; a new Host/adapter does not rely
        // on an earlier lease, target resolution, or caller-supplied opaque data.
        f.setReply((_round, res) => res.end(JSON.stringify({ status: 'completed', output: [{ type: 'reasoning', encrypted_content: 'PRIVATE-FINAL-RUNTIME' },
            { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Read complete' }] }], usage: { input_tokens: 14, output_tokens: 6, total_tokens: 20 } })));
        const second = await f.newHost().execute(f.h.handle, followup(f, first.response));
        expect(f.wires).toHaveLength(2);
        expect(f.wires[1].input).toContainEqual({ type: 'reasoning', encrypted_content: 'PRIVATE-TASK-RUNTIME' });
        expect(second.response.providerState).toBeDefined();
        expect(await f.rows()).toHaveLength(2);
        expect(second.response.observation.nativeExecution.retention).toBe('owner_runtime_store');
        expect(JSON.stringify(second)).not.toContain('PRIVATE-FINAL-RUNTIME');
        const task = await f.agent.getTask(f.h.handle, f.request.projectId, f.task.taskId);
        expect(task.conversation).toEqual(f.task.conversation); expect(task.compute.attempts.map(row => row.status)).toEqual(['settled', 'settled']);
        expect(JSON.stringify(task)).not.toContain('PRIVATE-');
        expect((await f.studio.getProject(f.h.handle, f.request.projectId)).revision.revision).toBe(f.request.revision);
    } finally { await f.cleanup(); }
});
test.each(harnesses)('Runtime task %s fresh Node process restores private state from original StorageEngine', async (_name, make) => {
    const f = await fixture(make);
    try {
        const first = await f.newHost().execute(f.h.handle, f.request);
        f.setReply((_round, res) => res.end(JSON.stringify({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Cold process read' }] }], usage: { input_tokens: 2, output_tokens: 2, total_tokens: 4 } })));
        const output = await new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [fileURLToPath(new URL('./helpers/runtime-checkpoint-restart-worker.mjs', import.meta.url))], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, timeout: 20000 });
            let stdout = '', stderr = ''; child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; });
            child.on('error', reject); child.on('close', code => code === 0 ? resolve(JSON.parse(stdout)) : reject(new Error('Cold fixture failed: ' + stderr)));
            child.stdin.end(JSON.stringify({ kind: f.h.kind, handle: f.h.handle, dirs: f.h.dirs, request: followup(f, first.response) }));
        });
        expect(output.text).toBe('Cold process read'); expect(output.observation.transferredCheckpoints).toBe(1);
        expect(f.wires[1].input).toContainEqual({ type: 'reasoning', encrypted_content: 'PRIVATE-TASK-RUNTIME' });
        expect((await f.agent.getTask(f.h.handle, f.request.projectId, f.task.taskId)).compute.attempts).toHaveLength(2);
    } finally { await f.cleanup(); }
});
test.each(['deleted_before_send', 'task_changed_then_restored', 'secret_echo', 'storage_write_failure'])('Runtime task actual %s rejects replay/publish and awaits private cleanup', async change => {
    const f = await fixture(makeTempFsEngineHarness);
    try {
        const host = f.newHost(); const first = await host.execute(f.h.handle, f.request); const next = followup(f, first.response);
        if (change === 'deleted_before_send') f.setSecret(async () => { await new RuntimeCheckpointStore(f.h).discard((await f.rows())[0].doc.binding); });
        if (change === 'task_changed_then_restored') {
            await f.agent.setPlan(f.h.handle, f.request.projectId, f.task.taskId, { summary: 'new', steps: [{ id: 'new', title: 'new', impact: 'low' }] });
            await f.agent.setPlan(f.h.handle, f.request.projectId, f.task.taskId, f.originalPlan);
        }
        if (change === 'secret_echo') f.setReply((_round, res) => res.end(JSON.stringify({ status: 'completed', output: [{ type: 'reasoning', encrypted_content: 'task-runtime-credential' }], usage: { input_tokens: 2, output_tokens: 2, total_tokens: 4 } })));
        if (change === 'storage_write_failure') {
            const original = f.h.engine.withTransaction.bind(f.h.engine);
            f.h.engine.withTransaction = (handle, operation) => original(handle, tx => operation(new Proxy(tx, { get(target, key) {
                if (key === 'putResourceIfMatch') return async (resource, ...args) => {
                    if (resource.kind === NATIVE_RESOURCE_KINDS.runtimeCheckpoint) throw new Error('checkpoint disk full');
                    return target.putResourceIfMatch(resource, ...args);
                };
                return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
            } })));
        }
        await expect(host.execute(f.h.handle, next)).rejects.toMatchObject({ code: change === 'secret_echo' ? 'generation_response_contains_secret' : 'generation_continuation_unavailable' });
        expect(f.wires).toHaveLength(['secret_echo', 'storage_write_failure'].includes(change) ? 2 : 1);
        expect(await f.rows()).toHaveLength(0);
    } finally { await f.cleanup(); }
});
test.each(['task', 'adaptive'])('Runtime %s unverified actual path still denies before provider HTTP', async mode => {
    const f = await fixture(makeTempFsEngineHarness, mode, false);
    try {
        await expect(f.newHost().execute(f.h.handle, f.request)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
        expect(f.wires).toHaveLength(0); expect(await f.rows()).toHaveLength(0);
    } finally { await f.cleanup(); }
});
test.each(['cancel_during_publish', 'timeout_during_publish', 'cancel_during_settlement', 'timeout_during_settlement'])('Runtime task %s never reports success or leaves private state after delayed persistence', async change => {
    const f = await fixture(makeTempFsEngineHarness);
    try {
        if (change.startsWith('timeout')) {
            const route = await f.seeded.persistence.getRuntimeRoute(f.h.handle, f.seeded.routes[0].runtimeRouteId);
            await f.seeded.persistence.saveRuntimeRoute(f.h.handle, { ...route, policy: { ...route.policy, timeoutMs: 100 } });
        }
        let arrived, release;
        const paused = new Promise(resolve => { arrived = resolve; });
        const resumed = new Promise(resolve => { release = resolve; });
        const original = f.h.engine.withTransaction.bind(f.h.engine);
        if (change.endsWith('settlement')) {
            const settle = f.agent.settleGeneration.bind(f.agent);
            f.agent.settleGeneration = async (...args) => { arrived(); await resumed; return settle(...args); };
        } else f.h.engine.withTransaction = (handle, operation) => original(handle, tx => operation(new Proxy(tx, { get(target, key) {
            if (key === 'putResourceIfMatch') return async (resource, ...args) => {
                if (resource.kind === NATIVE_RESOURCE_KINDS.runtimeCheckpoint) { arrived(); await resumed; }
                return target.putResourceIfMatch(resource, ...args);
            };
            return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
        } })));
        const controller = new AbortController();
        const pending = f.newHost().execute(f.h.handle, f.request, controller.signal).then(value => ({ value }), error => ({ error }));
        await paused;
        if (change.startsWith('cancel')) controller.abort();
        else await new Promise(resolve => setTimeout(resolve, 150));
        release(); const outcome = await pending;
        expect(outcome.error).toMatchObject({ code: change.startsWith('cancel') ? 'generation_cancelled' : 'generation_provider_timeout' });
        expect(await f.rows()).toHaveLength(0); expect(f.wires).toHaveLength(1);
        const task = await f.agent.getTask(f.h.handle, f.request.projectId, f.task.taskId);
        expect(task.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
    } finally { await f.cleanup(); }
});
test.each(['policy_aba', 'connection_aba', 'unrelated_profile'])('Runtime task %s uses original configuration mutation version and preserves unrelated checkpoints', async change => {
    const f = await fixture(makeTempFsEngineHarness);
    try {
        const host = f.newHost(); const first = await host.execute(f.h.handle, f.request); const next = followup(f, first.response);
        if (change === 'unrelated_profile') {
            const connection = await f.seeded.persistence.getConnectionProfile(f.h.handle, f.seeded.connection.connectionProfileId);
            const { createNativeId } = await import('../../src/native/identity.js');
            await f.seeded.persistence.saveConnectionProfile(f.h.handle, { ...connection, connectionProfileId: createNativeId('connectionProfile') });
        } else if (change === 'policy_aba') {
            const route = await f.seeded.persistence.getRuntimeRoute(f.h.handle, f.seeded.routes[0].runtimeRouteId);
            await f.seeded.persistence.saveRuntimeRoute(f.h.handle, { ...route, executionPolicy: { ...route.executionPolicy, continuity: 'none' } });
            await f.seeded.persistence.saveRuntimeRoute(f.h.handle, route);
        } else {
            const connection = await f.seeded.persistence.getConnectionProfile(f.h.handle, f.seeded.connection.connectionProfileId);
            await f.seeded.persistence.saveConnectionProfile(f.h.handle, { ...connection, endpoint: 'http://127.0.0.1:1/v1/responses' });
            await f.seeded.persistence.saveConnectionProfile(f.h.handle, connection);
        }
        if (change === 'unrelated_profile') { await host.execute(f.h.handle, next); expect(f.wires).toHaveLength(2); }
        else { await expect(host.execute(f.h.handle, next)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' }); expect(f.wires).toHaveLength(1); expect(await f.rows()).toHaveLength(0); }
    } finally { await f.cleanup(); }
});
test('Runtime task same-millisecond configuration ABA advances original Native record metadata and rejects late capture before HTTP', async () => {
    const f = await fixture(makeTempFsEngineHarness); let clock;
    try {
        const route = await f.seeded.persistence.getRuntimeRoute(f.h.handle, f.seeded.routes[0].runtimeRouteId);
        const key = { kind: NATIVE_RESOURCE_KINDS.runtimeRoute, handle: f.h.handle, runtimeRouteId: route.runtimeRouteId };
        const initial = await f.h.engine.withTransaction(f.h.handle, tx => tx.getResource(key));
        clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now());
        f.setSecret(async () => {
            await f.seeded.persistence.saveRuntimeRoute(f.h.handle, { ...route, executionPolicy: { ...route.executionPolicy, continuity: 'none' } });
            const changed = await f.h.engine.withTransaction(f.h.handle, tx => tx.getResource(key));
            await f.seeded.persistence.saveRuntimeRoute(f.h.handle, route);
            const restored = await f.h.engine.withTransaction(f.h.handle, tx => tx.getResource(key));
            expect(changed.updatedAt).toBeGreaterThan(initial.updatedAt); expect(restored.updatedAt).toBeGreaterThan(changed.updatedAt);
            expect(restored.integrity).toBe(initial.integrity);
        });
        await expect(f.newHost().execute(f.h.handle, f.request)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
        expect(f.wires).toHaveLength(0); expect(await f.rows()).toHaveLength(0);
    } finally { clock?.mockRestore(); await f.cleanup(); }
});
test.each(harnesses)('Runtime task %s same-millisecond route delete/recreate cannot restore an in-flight configuration authority', async (_name, make) => {
    const f = await fixture(make); let clock;
    try {
        const route = await f.seeded.persistence.getRuntimeRoute(f.h.handle, f.seeded.routes[0].runtimeRouteId);
        const key = { kind: NATIVE_RESOURCE_KINDS.runtimeRoute, handle: f.h.handle, runtimeRouteId: route.runtimeRouteId };
        const original = await f.h.engine.withTransaction(f.h.handle, tx => tx.getResource(key));
        clock = jest.spyOn(Date, 'now').mockReturnValue(original.updatedAt);
        f.setSecret(async () => {
            await f.seeded.persistence.deleteProfile(f.h.handle, 'routes', route.runtimeRouteId);
            expect(await f.seeded.persistence.getRuntimeRoute(f.h.handle, route.runtimeRouteId)).toBeNull();
            expect(await f.seeded.persistence.listRuntimeRoutes(f.h.handle)).toEqual([]);
            await f.seeded.persistence.saveRuntimeRoute(f.h.handle, route);
        });
        await expect(f.newHost().execute(f.h.handle, f.request)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
        expect(f.wires).toHaveLength(0); expect(await f.rows()).toHaveLength(0);
    } finally { clock?.mockRestore(); await f.cleanup(); }
});
test.each(['restore', 'edited_history', 'task_authority_aba'])('Runtime task actual Studio restart %s uses only current saved public Task history', async change => {
    const f = await fixture(makeTempFsEngineHarness);
    const previousFetch = globalThis.fetch, previousAtria = globalThis.Atria;
    try {
        let host = f.newHost(); const requests = [], responses = [];
        const app = express(); app.use(express.json({ limit: '4mb' }));
        app.use((req, _res, next) => { req.user = { profile: { handle: f.h.handle } }; next(); });
        app.get('/api/native/extensions/settings', (_req, res) => res.json({ value: { skills: {} } }));
        app.get('/api/skills', (_req, res) => res.json([]));
        app.use('/api/native/studio', createNativeStudioRouter(() => ({ studio: f.studio, agent: f.agent })));
        app.use('/api/native/generation', createNativeGenerationRouter(() => host));
        globalThis.Atria = { getContext: () => ({ getRequestHeaders: () => ({}) }) };
        globalThis.fetch = async (url, options = {}) => {
            let request = supertest(app)[(options.method || 'GET').toLowerCase()](url);
            if (options.body) { const body = JSON.parse(options.body); if (url === '/api/native/generation/execute') requests.push(body); request = request.send(body); }
            const result = await request;
            if (url === '/api/native/generation/execute' && result.status === 200) responses.push(result.body);
            return { ok: result.status >= 200 && result.status < 300, status: result.status,
                headers: { get: name => result.headers[name.toLowerCase()] }, json: async () => result.body };
        };
        const options = { projectId: f.request.projectId, taskId: f.task.taskId, maxModelRounds: 1 };
        await runNativeStudioAgentTask(options);
        const saved = (await f.agent.getTask(f.h.handle, f.request.projectId, f.task.taskId)).conversation;
        expect(saved.some(message => message.tool_calls?.length)).toBe(true);
        expect(JSON.stringify(saved)).not.toContain('providerState'); expect(JSON.stringify(saved)).not.toContain('PRIVATE-TASK-RUNTIME');
        if (change === 'task_authority_aba') {
            await f.agent.setPlan(f.h.handle, f.request.projectId, f.task.taskId, { summary: 'changed', steps: [{ id: 'new', title: 'new', impact: 'low' }] });
            await f.agent.setPlan(f.h.handle, f.request.projectId, f.task.taskId, f.originalPlan);
        }
        if (change === 'edited_history') {
            // A caller editing the input is not the saved Task history authority.
            const bridge = globalThis.fetch;
            globalThis.fetch = (url, options = {}) => {
                if (url === '/api/native/generation/execute') { const body = JSON.parse(options.body); body.messages.find(message => message.role === 'user').content = 'Edited old user text'; options = { ...options, body: JSON.stringify(body) }; }
                return bridge(url, options);
            };
        }
        host = f.newHost();
        f.setReply((_round, res) => res.end(JSON.stringify({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Final public read' }] }], usage: { input_tokens: 4, output_tokens: 3, total_tokens: 7 } })));
        await runNativeStudioAgentTask(options);
        expect(f.wires).toHaveLength(2);
        expect(JSON.stringify(f.wires[1]).includes('PRIVATE-TASK-RUNTIME')).toBe(change === 'restore');
        expect(responses[1].response.observation.nativeExecution.transferredCheckpoints).toBe(change === 'restore' ? 1 : 0);
        expect(requests[1].messages.some(message => message.providerState)).toBe(false);
        expect(JSON.stringify(responses)).not.toContain('PRIVATE-TASK-RUNTIME');
        const finished = await f.agent.getTask(f.h.handle, f.request.projectId, f.task.taskId);
        expect(JSON.stringify(finished.conversation)).not.toContain('providerState');
        expect(finished.compute.attempts).toHaveLength(2);
    } finally { globalThis.fetch = previousFetch; globalThis.Atria = previousAtria; await f.cleanup(); }
});
