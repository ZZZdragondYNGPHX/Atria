import { expect, test, jest } from '@jest/globals';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { projectSource, services } from '../agent-intelligence/project-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createResponsesGenerationProvider } from '../../src/native/adapters/responses-generation-provider.js';
import { createNativeMessagesProvider } from '../../src/native/adapters/native-messages-provider.js';
import { capabilityObservationProof, executionPathFingerprint } from '../../src/native/model-prompt-runtime/execution-evidence.js';
import { NATIVE_RESOURCE_KINDS } from '../../src/native/contracts.js';
import { RuntimeCheckpointStore } from '../../src/native/model-prompt-runtime/runtime-checkpoint-store.js';
import express from 'express';
import supertest from 'supertest';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { createNativeStudioRouter } from '../../src/endpoints/native-studio.js';
import { runNativeStudioAgentTask } from '../../public/scripts/native/studio-agent.js';
import { projectAgentResumeMessages } from '../../public/shared/project-agent-conversation.js';
import { serializeNativeDocument, hashNativeDocument } from '../../src/native/repositories/common.js';

const harnesses = [['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]];
const messagesReply = (format, finalText, privateText = 'PRIVATE-TASK-RUNTIME') => format === 'anthropic'
    ? { content: [{ type: 'thinking', thinking: privateText, signature: 'PRIVATE-NATIVE-SIGNATURE' }, { type: 'redacted_thinking', data: 'PRIVATE-REDACTED-BLOCK' },
        ...(finalText ? [{ type: 'text', text: finalText }] : [{ type: 'tool_use', id: 'read', name: 'atri_agent_get_project', input: {} }])],
    stop_reason: finalText ? 'end_turn' : 'tool_use', usage: { input_tokens: 12, output_tokens: 8 } }
    : { candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: privateText, thoughtSignature: 'PRIVATE-NATIVE-SIGNATURE' },
        ...(finalText ? [{ text: finalText }] : [{ functionCall: { id: 'read', name: 'atri_agent_get_project', args: {} }, thoughtSignature: 'PRIVATE-TOOL-SIGNATURE' }])] } }],
    usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8, totalTokenCount: 20 } };
async function fixture(make, mode = 'task', verified = true, maxRequests = 4, format = 'openai-responses', localWork) {
    const h = await make(); const wires = [];
    let reply = (_round, res) => res.end(JSON.stringify(format === 'openai-responses' ? { status: 'completed', output: [
        { type: 'reasoning', encrypted_content: 'PRIVATE-TASK-RUNTIME' },
        { type: 'function_call', call_id: 'read', name: 'atri_agent_get_project', arguments: '{\n}' },
    ], usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 } } : messagesReply(format)));
    const server = createServer(async (req, res) => {
        let wire = ''; for await (const chunk of req) wire += chunk; wires.push(JSON.parse(wire));
        res.setHeader('Content-Type', 'application/json'); reply(wires.length, res);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { studio, agent } = services(h); const source = projectSource();
    const created = await studio.createProject(h.handle, source);
    const task = await agent.createTask(h.handle, source.project.projectId, { intent: 'Read project', baseRevision: created.revision.revision });
    const originalPlan = { summary: 'Original read', steps: [{ id: 'read', title: 'Read project', impact: 'low' }] };
    await agent.setPlan(h.handle, source.project.projectId, task.taskId, originalPlan);
    const seeded = await seedGenerationProfiles({ ...h, roles: ['studio'], format, endpoint: `http://127.0.0.1:${server.address().port}/${format === 'openai-responses' ? 'v1/responses' : format === 'anthropic' ? 'v1/messages' : 'v1beta'}` });
    const model = await seeded.persistence.getModelProfile(h.handle, seeded.model.modelProfileId);
    const connection = await seeded.persistence.getConnectionProfile(h.handle, seeded.connection.connectionProfileId);
    const observedAt = Date.now() - 1;
    const decision = { capability: 'generation.continuation.task', state: 'supported', provenance: [{ kind: 'provider-endpoint', source: 'synthetic loopback task consumer', observedAt }],
        ...(verified ? { binding: { schemaVersion: 1, pathFingerprint: executionPathFingerprint({ handle: h.handle, connection, model }), observedAt,
            expiresAt: Date.now() + 60000, assurance: 'verified' } } : {}) };
    const decisions = [decision, ...(mode === 'adaptive' ? [{ ...decision, capability: 'generation.continuation.adaptive' }] : [])];
    await seeded.persistence.saveModelProfile(h.handle, { ...model, limits: { contextTokens: 32000, outputTokens: 512 }, capabilities: [...model.capabilities, ...decisions] },
        verified ? { observationProof: capabilityObservationProof({ handle: h.handle, connection, model }, decisions) } : {});
    await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: { schemaVersion: 1,
        allowedModelProfileIds: [model.modelProfileId], continuity: mode, computeBudget: { maxRequests, maxTokens: 128000, ...(localWork ? { localWork } : {}) } } });
    let onSecret = () => {};
    const providerFetch = globalThis.fetch;
    const newHost = () => new NativeGenerationHost({ ...seeded, studio, agent, providers: { ['provider.' + format]: format === 'openai-responses'
        ? createResponsesGenerationProvider({ fetchImpl: providerFetch }) : createNativeMessagesProvider({ format, fetchImpl: providerFetch }) },
        secretPort: { resolveSecret: async () => { await onSecret(); return 'task-runtime-credential'; } } });
    const context = await agent.getContext(h.handle, source.project.projectId, task.taskId);
    const request = { role: 'studio', projectId: source.project.projectId, taskId: task.taskId, revision: created.revision.revision,
        requestId: 'task-runtime-first', tools: context.tools, messages: [{ role: 'user', content: task.intent }] };
    const rows = () => h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: NATIVE_RESOURCE_KINDS.runtimeCheckpoint, handle: h.handle }));
    return { h, seeded, studio, agent, task, originalPlan, request, newHost, providerFetch, wires, rows, setSecret: fn => { onSecret = fn; }, setReply: fn => { reply = fn; },
        cleanup: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.cleanup(); } };
}
const followup = (f, response) => ({ ...f.request, requestId: 'task-runtime-next', messages: [...f.request.messages,
    { role: 'assistant', content: response.text, tool_calls: response.toolCalls.map(call => call.raw), providerState: response.providerState },
    { role: 'tool', tool_call_id: response.toolCalls[0].id, content: 'Public project read' }] });
test.each([['fs', harnesses[0][1], 'openai-responses'], ['sqlite', harnesses[1][1], 'openai-responses'], ['fs', harnesses[0][1], 'anthropic'], ['fs', harnesses[0][1], 'gemini']])('Runtime lowering %s %s quota refusal retains valid original Task checkpoint before second HTTP', async (_name, make, format) => {
    const f = await fixture(make, 'task', true, 4, format, { maxJobs: 3, maxItems: 3, maxInputBytes: 1048576 });
    try {
        const first = await f.newHost().execute(f.h.handle, f.request), rows = await f.rows();
        await expect(f.newHost().execute(f.h.handle, followup(f, first.response))).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
        expect(await f.rows()).toEqual(rows); expect(f.wires).toHaveLength(1);
        const task = await f.agent.getTask(f.h.handle, f.request.projectId, f.task.taskId);
        expect(task.compute.localWork.map(row => row.kind)).toEqual(['generation_count', 'generation_render', 'generation_count']);
        expect(task.compute.attempts).toHaveLength(1); expect(task.conversation).toEqual(f.task.conversation);
    } finally { await f.cleanup(); }
});
test('Runtime lowering stale Task after render settlement cleans private state and keeps completed local work', async () => {
    const f = await fixture(harnesses[0][1], 'task', true, 4, 'openai-responses', { maxJobs: 4, maxItems: 4, maxInputBytes: 1048576 }); let spy;
    try {
        const first = await f.newHost().execute(f.h.handle, f.request); let jobs = 0;
        const original = f.agent.settleLocalWork.bind(f.agent);
        spy = jest.spyOn(f.agent, 'settleLocalWork').mockImplementation(async (...args) => {
            const result = await original(...args);
            if (++jobs === 2) await f.agent.setPlan(f.h.handle, f.request.projectId, f.task.taskId, { summary: 'Changed after private lowering', steps: [{ id: 'read', title: 'Read', impact: 'low' }] });
            return result;
        });
        await expect(f.newHost().execute(f.h.handle, followup(f, first.response))).rejects.toMatchObject({ code: 'native_generation_task_stopped' });
        expect(await f.rows()).toEqual([]); expect(f.wires).toHaveLength(1);
        expect((await f.agent.getTask(f.h.handle, f.request.projectId, f.task.taskId)).compute.localWork.map(row => row.usage.outcome)).toEqual(Array(4).fill('completed'));
    } finally { spy?.mockRestore(); await f.cleanup(); }
});
for (const format of ['anthropic', 'gemini']) {
    test.each(harnesses)(`Runtime messages task ${format} %s actual Host resumes full native state and persists the final checkpoint`, async (_name, make) => {
        const f = await fixture(make, 'task', true, 4, format);
        try {
            const first = await f.newHost().execute(f.h.handle, f.request);
            expect(await f.rows()).toHaveLength(1); expect(JSON.stringify(first)).not.toContain('PRIVATE-');
            f.setReply((_round, res) => res.end(JSON.stringify(messagesReply(format, 'Native read complete', 'PRIVATE-FINAL-RUNTIME'))));
            const second = await f.newHost().execute(f.h.handle, followup(f, first.response));
            expect(f.wires).toHaveLength(2);
            const actual = format === 'anthropic' ? f.wires[1].messages.find(row => row.role === 'assistant').content : f.wires[1].contents.find(row => row.role === 'model').parts;
            expect(JSON.stringify(actual)).toBe(JSON.stringify(format === 'anthropic' ? messagesReply(format).content : messagesReply(format).candidates[0].content.parts));
            expect(second.response.providerState).toBeDefined(); expect(await f.rows()).toHaveLength(2);
            expect(second.snapshot.diagnostics.continuity).toMatchObject({ requestedPolicy: 'task', action: 'continue', reason: 'supplied_checkpoint' });
            expect(second.response.observation.nativeExecution).toMatchObject({ retention: 'owner_runtime_store', transferredCheckpoints: 1, decision: second.snapshot.diagnostics.continuity });
            expect(JSON.stringify(second)).not.toContain('PRIVATE-');
            const task = await f.agent.getTask(f.h.handle, f.request.projectId, f.task.taskId);
            expect(task.conversation).toEqual(f.task.conversation); expect(JSON.stringify(task)).not.toContain('PRIVATE-');
            expect(task.compute.attempts.map(row => row.status)).toEqual(format === 'anthropic' ? ['unknown', 'unknown'] : ['settled', 'settled']);
            if (format === 'anthropic') expect(task.compute.attempts[0].usage).toEqual({ inputTokens: 12, outputTokens: 8, totalTokens: null });
            expect((await f.studio.getProject(f.h.handle, f.request.projectId)).revision.revision).toBe(f.request.revision);
        } finally { await f.cleanup(); }
    });
    test.each(harnesses)(`Runtime messages task ${format} %s fresh Node restores persisted private state`, async (_name, make) => {
        const f = await fixture(make, 'task', true, 4, format);
        try {
            const first = await f.newHost().execute(f.h.handle, f.request);
            f.setReply((_round, res) => res.end(JSON.stringify(messagesReply(format, 'Cold native read'))));
            const output = await new Promise((resolve, reject) => {
                const child = spawn(process.execPath, [fileURLToPath(new URL('./helpers/runtime-checkpoint-restart-worker.mjs', import.meta.url))], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, timeout: 20000 });
                let stdout = '', stderr = ''; child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; });
                child.on('error', reject); child.on('close', code => code === 0 ? resolve(JSON.parse(stdout)) : reject(new Error('Cold native fixture failed: ' + stderr)));
                child.stdin.end(JSON.stringify({ format, kind: f.h.kind, handle: f.h.handle, dirs: f.h.dirs, request: followup(f, first.response) }));
            });
            expect(output.text).toBe('Cold native read'); expect(output.observation).toMatchObject({ transferredCheckpoints: 1, retention: 'owner_runtime_store' });
            const native = format === 'anthropic' ? f.wires[1].messages.find(row => row.role === 'assistant').content : f.wires[1].contents.find(row => row.role === 'model').parts;
            expect(JSON.stringify(native)).toBe(JSON.stringify(format === 'anthropic' ? messagesReply(format).content : messagesReply(format).candidates[0].content.parts));
            expect(await f.rows()).toHaveLength(2);
        } finally { await f.cleanup(); }
    });
    test.each(['unverified', 'deleted_before_charge', 'secret_echo', 'legacy_checkpoint', 'malformed_wire'])(`Runtime messages task ${format} %s cannot bypass private currentness or publication`, async change => {
        const f = await fixture(makeTempFsEngineHarness, 'task', change !== 'unverified', 4, format);
        try {
            if (change === 'unverified') {
                await expect(f.newHost().execute(f.h.handle, f.request)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
                expect(f.wires).toHaveLength(0); expect(await f.rows()).toHaveLength(0); return;
            }
            const first = await f.newHost().execute(f.h.handle, f.request);
            const blockedBeforeCharge = change !== 'secret_echo';
            if (change === 'deleted_before_charge') f.setSecret(async () => { await new RuntimeCheckpointStore(f.h).discard((await f.rows())[0].doc.binding); });
            else if (['legacy_checkpoint', 'malformed_wire'].includes(change)) {
                const row = (await f.rows())[0], doc = { ...row.doc };
                if (change === 'legacy_checkpoint') { doc.schemaVersion = 1; doc.content = JSON.parse(doc.contentWire); delete doc.contentWire; }
                else doc.contentWire = '[invalid-json]';
                await f.h.engine.withTransaction(f.h.handle, tx => tx.putResource(row.key, { ...row, doc, integrity: hashNativeDocument(doc) }));
            } else f.setReply((_round, res) => res.end(JSON.stringify(messagesReply(format, 'Rejected public reply', 'task-runtime-credential'))));
            await expect(f.newHost().execute(f.h.handle, followup(f, first.response))).rejects.toMatchObject({ code: blockedBeforeCharge ? 'generation_continuation_unavailable' : 'generation_response_contains_secret' });
            expect(f.wires).toHaveLength(blockedBeforeCharge ? 1 : 2); expect(await f.rows()).toHaveLength(0);
            const task = await f.agent.getTask(f.h.handle, f.request.projectId, f.task.taskId);
            expect(task.compute.attempts).toHaveLength(blockedBeforeCharge ? 1 : 2);
        } finally { await f.cleanup(); }
    });
    test(`Runtime messages adaptive ${format} cancelled publication awaits original usage and private cleanup`, async () => {
        const f = await fixture(makeTempFsEngineHarness, 'adaptive', true, 4, format);
        try {
            let arrived, release;
            const paused = new Promise(resolve => { arrived = resolve; }), resumed = new Promise(resolve => { release = resolve; });
            const original = f.h.engine.withTransaction.bind(f.h.engine);
            f.h.engine.withTransaction = (handle, operation) => original(handle, tx => operation(new Proxy(tx, { get(target, key) {
                if (key === 'putResourceIfMatch') return async (resource, ...args) => {
                    if (resource.kind === NATIVE_RESOURCE_KINDS.runtimeCheckpoint) { arrived(); await resumed; }
                    return target.putResourceIfMatch(resource, ...args);
                };
                return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
            } })));
            const controller = new AbortController(), pending = f.newHost().execute(f.h.handle, f.request, controller.signal).then(value => ({ value }), error => ({ error }));
            await paused; controller.abort(); release(); const outcome = await pending;
            expect(outcome.error).toMatchObject({ code: 'generation_cancelled' }); expect(await f.rows()).toHaveLength(0);
            const attempt = (await f.agent.getTask(f.h.handle, f.request.projectId, f.task.taskId)).compute.attempts[0];
            expect(attempt).toMatchObject(format === 'anthropic' ? { status: 'unknown', usage: { inputTokens: 12, outputTokens: 8, totalTokens: null } }
                : { status: 'settled', usage: { totalTokens: 20 } });
        } finally { await f.cleanup(); }
    });
    test(`Runtime messages task ${format} a reordering JSON storage codec cannot rewrite signed native key order`, async () => {
        const f = await fixture(makeTempFsEngineHarness, 'task', true, 4, format);
        try {
            const first = await f.newHost().execute(f.h.handle, f.request);
            // A deterministic local codec simulation, not an executed PG/MySQL
            // backend. JSON object normalization must not alter native wire.
            const original = f.h.engine.withTransaction.bind(f.h.engine);
            f.h.engine.withTransaction = (handle, operation) => original(handle, tx => operation(new Proxy(tx, { get(target, key) {
                if (key === 'getResource') return async resource => {
                    const row = await target.getResource(resource);
                    return resource.kind === NATIVE_RESOURCE_KINDS.runtimeCheckpoint && row ? { ...row, doc: JSON.parse(serializeNativeDocument(row.doc)) } : row;
                };
                return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
            } })));
            f.setReply((_round, res) => res.end(JSON.stringify(messagesReply(format, 'Codec read complete'))));
            await f.newHost().execute(f.h.handle, followup(f, first.response));
            const native = format === 'anthropic' ? f.wires[1].messages.find(row => row.role === 'assistant').content : f.wires[1].contents.find(row => row.role === 'model').parts;
            expect(JSON.stringify(native)).toBe(JSON.stringify(format === 'anthropic' ? messagesReply(format).content : messagesReply(format).candidates[0].content.parts));
        } finally { await f.cleanup(); }
    });
}
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
        if (change === 'deleted_before_send') expect((await f.agent.getTask(f.h.handle, f.request.projectId, f.task.taskId)).compute.attempts).toHaveLength(1);
    } finally { await f.cleanup(); }
});
test.each(['task', 'adaptive'])('Runtime %s unverified actual path still denies before provider HTTP', async mode => {
    const f = await fixture(makeTempFsEngineHarness, mode, false);
    try {
        await expect(f.newHost().execute(f.h.handle, f.request)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
        expect(f.wires).toHaveLength(0); expect(await f.rows()).toHaveLength(0);
    } finally { await f.cleanup(); }
});
test.each(['missing_task_evidence', 'non_task_source'])('Runtime adaptive %s cannot borrow a lifecycle or a consumer from another scope', async change => {
    const f = await fixture(makeTempFsEngineHarness, 'adaptive');
    try {
        if (change === 'missing_task_evidence') {
            const model = await f.seeded.persistence.getModelProfile(f.h.handle, f.seeded.model.modelProfileId);
            await f.seeded.persistence.saveModelProfile(f.h.handle, { ...model, capabilities: model.capabilities.filter(row => row.capability !== 'generation.continuation.task') });
        }
        const request = { ...f.request }; if (change === 'non_task_source') delete request.taskId;
        await expect(f.newHost().execute(f.h.handle, request)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
        expect(f.wires).toHaveLength(0); expect(await f.rows()).toHaveLength(0);
        expect((await f.agent.getTask(f.h.handle, f.request.projectId, f.task.taskId)).compute?.attempts || []).toHaveLength(0);
    } finally { await f.cleanup(); }
});
test('Runtime adaptive cancelled publication waits for original Task usage and private cleanup', async () => {
    const f = await fixture(makeTempFsEngineHarness, 'adaptive');
    try {
        let arrived, release;
        const paused = new Promise(resolve => { arrived = resolve; }); const resumed = new Promise(resolve => { release = resolve; });
        const original = f.h.engine.withTransaction.bind(f.h.engine);
        f.h.engine.withTransaction = (handle, operation) => original(handle, tx => operation(new Proxy(tx, { get(target, key) {
            if (key === 'putResourceIfMatch') return async (resource, ...args) => {
                if (resource.kind === NATIVE_RESOURCE_KINDS.runtimeCheckpoint) { arrived(); await resumed; }
                return target.putResourceIfMatch(resource, ...args);
            };
            return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
        } })));
        const controller = new AbortController();
        const pending = f.newHost().execute(f.h.handle, f.request, controller.signal).then(value => ({ value }), error => ({ error }));
        await paused; controller.abort(); release(); const outcome = await pending;
        expect(outcome.error).toMatchObject({ code: 'generation_cancelled' }); expect(await f.rows()).toHaveLength(0);
        expect((await f.agent.getTask(f.h.handle, f.request.projectId, f.task.taskId)).compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
    } finally { await f.cleanup(); }
});
test('Runtime adaptive attempted HTTP then retry budget refusal still discards private state and retains unknown cost', async () => {
    const f = await fixture(makeTempFsEngineHarness, 'adaptive', true, 2);
    try {
        const route = await f.seeded.persistence.getRuntimeRoute(f.h.handle, f.seeded.routes[0].runtimeRouteId);
        await f.seeded.persistence.saveRuntimeRoute(f.h.handle, { ...route, policy: { ...route.policy, maxRetries: 1 } });
        const host = f.newHost(); const first = await host.execute(f.h.handle, f.request);
        f.setReply((_round, res) => { res.writeHead(429); res.end('{}'); });
        await expect(host.execute(f.h.handle, followup(f, first.response))).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
        expect(f.wires).toHaveLength(2); expect(await f.rows()).toHaveLength(0);
        const task = await f.agent.getTask(f.h.handle, f.request.projectId, f.task.taskId);
        expect(task.compute.attempts.map(row => row.status)).toEqual(['settled', 'unknown']);
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
        expect((await f.agent.getTask(f.h.handle, f.request.projectId, f.task.taskId)).compute?.attempts || []).toHaveLength(0);
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
        expect((await f.agent.getTask(f.h.handle, f.request.projectId, f.task.taskId)).compute?.attempts || []).toHaveLength(0);
    } finally { clock?.mockRestore(); await f.cleanup(); }
});
const studioContinuityCases = [
    ...['restore', 'edited_history', 'task_authority_aba', 'adaptive_continue', 'adaptive_missing', 'adaptive_task_aba', 'adaptive_repeat_reset', 'adaptive_malformed_history', 'adaptive_preview_projection', 'adaptive_budget_refusal_projection', 'adaptive_charge_refusal_projection'].map(change => ['openai-responses', change]),
    ...['anthropic', 'gemini'].flatMap(format => ['restore', 'edited_history', 'adaptive_missing', 'adaptive_legacy'].map(change => [format, change])),
];
test.each(studioContinuityCases)('Runtime Studio continuity %s %s uses only current saved public Task history', async (format, change) => {
    const adaptive = change.startsWith('adaptive');
    const f = await fixture(makeTempFsEngineHarness, adaptive ? 'adaptive' : 'task', true, change === 'adaptive_charge_refusal_projection' ? 1 : 4, format);
    const previousFetch = globalThis.fetch, previousAtria = globalThis.Atria;
    try {
        let host = f.newHost(); const requests = [], responses = [], updates = [];
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
        const options = { projectId: f.request.projectId, taskId: f.task.taskId, maxModelRounds: 1, onUpdate: update => updates.push(update) };
        await runNativeStudioAgentTask(options);
        const saved = (await f.agent.getTask(f.h.handle, f.request.projectId, f.task.taskId)).conversation;
        expect(saved.some(message => message.tool_calls?.length)).toBe(true);
        expect(JSON.stringify(saved)).not.toContain('providerState'); expect(JSON.stringify(saved)).not.toContain('PRIVATE-TASK-RUNTIME');
        if (['adaptive_preview_projection', 'adaptive_budget_refusal_projection', 'adaptive_charge_refusal_projection'].includes(change)) {
            const before = (await f.rows()).map(row => row.doc.checkpointId);
            const projected = { ...requests[0], requestId: 'projection-preflight', messages: [requests[0].messages[0], ...projectAgentResumeMessages(saved)] };
            delete projected.projectAttemptId;
            if (change === 'adaptive_preview_projection') {
                const preview = await host.execute(f.h.handle, projected, undefined, undefined, { preview: true });
                expect(preview.snapshot.diagnostics.continuity).toMatchObject({ action: 'reset', reason: 'public_observation_projection', loss: 'opaque_not_restored' });
            } else if (change === 'adaptive_charge_refusal_projection') {
                await expect(host.execute(f.h.handle, projected)).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
            } else {
                const base = createResponsesGenerationProvider({ fetchImpl: f.providerFetch });
                const measured = { ...base, withRuntimeCheckpointStore: store => {
                    const native = base.withRuntimeCheckpointStore(store);
                    return { ...native, countTokens: async input => { await native.countTokens(input); return 100000; } };
                } };
                const blocked = new NativeGenerationHost({ ...f.seeded, studio: f.studio, agent: f.agent, providers: { 'provider.openai-responses': measured }, secretPort: { resolveSecret: async () => 'task-runtime-credential' } });
                await expect(blocked.execute(f.h.handle, projected)).rejects.toMatchObject({ code: 'generation_context_budget_exceeded' });
            }
            expect((await f.rows()).map(row => row.doc.checkpointId)).toEqual(before);
            expect(f.wires).toHaveLength(1);
            expect((await f.agent.getTask(f.h.handle, f.request.projectId, f.task.taskId)).compute.attempts).toHaveLength(1);
            if (change !== 'adaptive_preview_projection') return;
        }
        if (['task_authority_aba', 'adaptive_task_aba'].includes(change)) {
            await f.agent.setPlan(f.h.handle, f.request.projectId, f.task.taskId, { summary: 'changed', steps: [{ id: 'new', title: 'new', impact: 'low' }] });
            await f.agent.setPlan(f.h.handle, f.request.projectId, f.task.taskId, f.originalPlan);
        }
        if (['adaptive_missing', 'adaptive_repeat_reset'].includes(change)) await new RuntimeCheckpointStore(f.h).discard((await f.rows())[0].doc.binding);
        if (change === 'adaptive_legacy') {
            const row = (await f.rows())[0], doc = { ...row.doc, schemaVersion: 1, content: JSON.parse(row.doc.contentWire) }; delete doc.contentWire;
            await f.h.engine.withTransaction(f.h.handle, tx => tx.putResource(row.key, { ...row, doc, integrity: hashNativeDocument(doc) }));
        }
        if (['edited_history', 'adaptive_malformed_history', 'adaptive_repeat_reset'].includes(change)) {
            // A caller editing the input is not the saved Task history authority.
            const bridge = globalThis.fetch;
            globalThis.fetch = (url, options = {}) => {
                if (url === '/api/native/generation/execute') {
                    const body = JSON.parse(options.body);
                    if (change === 'adaptive_repeat_reset') { if (requests.length === 2) body.messages = [body.messages[0], ...saved]; }
                    else body.messages.find(message => message.role === 'user').content = 'Edited old user text';
                    options = { ...options, body: JSON.stringify(body) };
                }
                return bridge(url, options);
            };
        }
        host = f.newHost();
        f.setReply((_round, res) => res.end(JSON.stringify(format === 'openai-responses' ? { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Final public read' }] }], usage: { input_tokens: 4, output_tokens: 3, total_tokens: 7 } } : messagesReply(format, 'Final public read', 'PRIVATE-FINAL-RUNTIME'))));
        const denied = ['edited_history', 'task_authority_aba', 'adaptive_malformed_history', 'adaptive_repeat_reset'].includes(change);
        if (denied) {
            await expect(runNativeStudioAgentTask(options)).rejects.toMatchObject({ code: change === 'adaptive_repeat_reset' ? 'generation_continuation_reset_required' : 'generation_continuation_unavailable' });
            expect(f.wires).toHaveLength(1);
            expect((await f.agent.getTask(f.h.handle, f.request.projectId, f.task.taskId)).compute.attempts).toHaveLength(1);
            if (change === 'adaptive_repeat_reset') { expect(requests).toHaveLength(3); expect(updates.filter(update => update.continuation?.status === 'reset')).toHaveLength(1); }
            return;
        }
        await runNativeStudioAgentTask(options);
        expect(f.wires).toHaveLength(2);
        const continued = ['restore', 'adaptive_continue', 'adaptive_preview_projection'].includes(change);
        expect(JSON.stringify(f.wires[1]).includes('PRIVATE-TASK-RUNTIME')).toBe(continued);
        expect(responses[1].response.observation.nativeExecution.transferredCheckpoints).toBe(continued ? 1 : 0);
        const planned = responses[1].snapshot.diagnostics.continuity;
        expect(responses[1].response.observation.nativeExecution.decision).toEqual(planned);
        expect(planned).toMatchObject({ requestedPolicy: adaptive ? 'adaptive' : 'task', action: continued ? 'continue' : 'reset',
            effectiveScope: continued ? 'task' : 'none', reason: continued ? 'saved_task_checkpoint' : 'public_observation_projection', loss: continued ? 'none' : 'opaque_not_restored' });
        if (!continued) { expect(requests).toHaveLength(3); expect(JSON.stringify(f.wires[1])).not.toContain('PRIVATE-TASK-RUNTIME');
            expect(JSON.stringify(f.wires[1])).toContain('Previous tool observation'); expect(updates.filter(update => update.continuation?.status === 'reset')).toHaveLength(1); }
        expect(requests[1].messages.some(message => message.providerState)).toBe(false);
        expect(JSON.stringify(responses)).not.toContain('PRIVATE-TASK-RUNTIME');
        const finished = await f.agent.getTask(f.h.handle, f.request.projectId, f.task.taskId);
        expect(JSON.stringify(finished.conversation)).not.toContain('providerState');
        expect(finished.compute.attempts).toHaveLength(2);
    } finally { globalThis.fetch = previousFetch; globalThis.Atria = previousAtria; await f.cleanup(); }
});
