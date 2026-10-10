import { expect, test } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { createServer } from 'node:http';
import nodeFetch from 'node-fetch';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { projectSource, services } from '../agent-intelligence/project-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createNativeMessagesProvider } from '../../src/native/adapters/native-messages-provider.js';
import { createResponsesGenerationProvider } from '../../src/native/adapters/responses-generation-provider.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { createNativeStudioRouter } from '../../src/endpoints/native-studio.js';
import { runNativeStudioAgentTask } from '../../public/scripts/native/studio-agent.js';
import { capabilityObservationProof, executionPathFingerprint } from '../../src/native/model-prompt-runtime/execution-evidence.js';

test.each(['stable', 'responses_arguments', 'active_execution', 'different_task', 'changed_task', 'late_task', 'restored_task'])('G04 real Studio client/routers/Host %s protects signed state across distinct request/attempt IDs', async change => {
    const responses = change === 'responses_arguments';
    const stable = ['stable', 'responses_arguments', 'active_execution'].includes(change);
    const h = await makeTempFsEngine(); const wires = [], requests = [], updates = [], generationResponses = [];
    const server = createServer(async (req, res) => {
        let wire = ''; for await (const chunk of req) wire += chunk;
        wires.push(JSON.parse(wire));
        const parts = wires.length === 1 ? [{ functionCall: { name: 'atri_agent_get_project', args: {} }, thoughtSignature: 'PRIVATE-UI-NATIVE-SIGNATURE' }] : [{ text: 'Current project read.' }];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responses ? { status: 'completed', output: wires.length === 1
            ? [{ type: 'reasoning', encrypted_content: 'PRIVATE-UI-NATIVE-SIGNATURE' }, { type: 'function_call', call_id: 'read', name: 'atri_agent_get_project', arguments: '{\n  "z": 1, "a": 2\n}' }]
            : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Current project read.' }] }], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 25 } }
            : { candidates: [{ finishReason: 'STOP', content: { parts } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 25 } }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const previousFetch = globalThis.fetch, previousAtria = globalThis.Atria;
    try {
        const { studio, agent } = services(h); const source = projectSource();
        const created = await studio.createProject(h.handle, source);
        const task = await agent.createTask(h.handle, source.project.projectId, { intent: 'Read the project once.', baseRevision: created.revision.revision });
        const initialPlan = { summary: 'Original plan', steps: [{ id: 'original', title: 'Read the current project', impact: 'low' }] };
        await agent.setPlan(h.handle, source.project.projectId, task.taskId, initialPlan);
        const format = responses ? 'openai-responses' : 'gemini';
        const seeded = await seedGenerationProfiles({ ...h, format, roles: ['studio'], endpoint: `http://127.0.0.1:${server.address().port}/${responses ? 'v1/responses' : 'v1beta'}` });
        await seeded.persistence.saveModelProfile(h.handle, { ...seeded.model, limits: { contextTokens: 32000, outputTokens: 512 } });
        await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: { maxRequests: 2, maxTokens: 64000 } } });
        if (change === 'active_execution') {
            const connection = await seeded.persistence.getConnectionProfile(h.handle, seeded.connection.connectionProfileId);
            const model = await seeded.persistence.getModelProfile(h.handle, seeded.model.modelProfileId);
            const observedAt = Date.now() - 1;
            const decision = { capability: 'generation.continuation.active-execution', state: 'supported',
                provenance: [{ kind: 'provider-endpoint', source: 'synthetic local Studio native round trip', observedAt }],
                binding: { schemaVersion: 1, pathFingerprint: executionPathFingerprint({ handle: h.handle, connection, model }),
                    observedAt, expiresAt: Date.now() + 60000, assurance: 'verified' } };
            await seeded.persistence.saveModelProfile(h.handle, { ...model, capabilities: [...model.capabilities, decision] },
                { observationProof: capabilityObservationProof({ handle: h.handle, connection, model }, [decision]) });
            const route = await seeded.persistence.getRuntimeRoute(h.handle, seeded.routes[0].runtimeRouteId);
            await seeded.persistence.saveRuntimeRoute(h.handle, { ...route, executionPolicy: { ...route.executionPolicy, continuity: 'active_execution' } });
        }
        const changePlan = () => agent.setPlan(h.handle, source.project.projectId, task.taskId, { summary: 'New authority', steps: [{ id: 'fresh', title: 'New task state', impact: 'low' }] });
        let secretReads = 0;
        const host = new NativeGenerationHost({ ...seeded, studio, agent, secretPort: { resolveSecret: async () => {
            if (++secretReads === 2 && change === 'late_task') await changePlan();
            return 'ui-native-test-credential';
        } },
            providers: { ['provider.' + format]: responses ? createResponsesGenerationProvider({ fetchImpl: nodeFetch }) : createNativeMessagesProvider({ format: 'gemini', fetchImpl: nodeFetch }) } });
        const app = express(); app.use(express.json({ limit: '4mb' }));
        app.use((req, _res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
        app.get('/api/native/extensions/settings', (_req, res) => res.json({ value: { skills: {} } }));
        app.get('/api/skills', (_req, res) => res.json([]));
        app.use('/api/native/studio', createNativeStudioRouter(() => ({ studio, agent })));
        app.use('/api/native/generation', createNativeGenerationRouter(() => host));
        globalThis.Atria = { getContext: () => ({ getRequestHeaders: () => ({}) }) };
        globalThis.fetch = async (url, options = {}) => {
            const body = options.body ? JSON.parse(options.body) : undefined;
            if (url === '/api/native/generation/execute') requests.push(body);
            if (url === '/api/native/generation/execute' && requests.length === 2) {
                if (change === 'changed_task') await changePlan();
                if (change === 'restored_task') { await changePlan(); await agent.setPlan(h.handle, source.project.projectId, task.taskId, initialPlan); }
                if (change === 'different_task') {
                    const other = await agent.createTask(h.handle, source.project.projectId, { intent: task.intent, baseRevision: created.revision.revision });
                    body.taskId = other.taskId; delete body.projectAttemptId;
                }
            }
            let request = supertest(app)[(options.method || 'GET').toLowerCase()](url);
            if (body) request = request.send(body);
            const result = await request;
            if (url === '/api/native/generation/execute' && result.status === 200) generationResponses.push(result.body);
            return { ok: result.status >= 200 && result.status < 300, status: result.status,
                headers: { get: name => result.headers[name.toLowerCase()] }, json: async () => result.body };
        };
        const run = runNativeStudioAgentTask({ projectId: source.project.projectId, taskId: task.taskId, maxModelRounds: 3, onUpdate: value => updates.push(value) });
        if (!stable) {
            await expect(run).rejects.toMatchObject({ code: change === 'late_task' ? 'native_generation_task_stopped' : 'generation_continuation_unavailable' });
            expect(wires).toHaveLength(1);
            expect((await agent.getTask(h.handle, source.project.projectId, task.taskId)).compute.attempts).toHaveLength(1);
            return;
        }
        const result = await run;
        expect(wires).toHaveLength(2); expect(requests).toHaveLength(2);
        expect(requests[0].requestId).not.toBe(requests[1].requestId);
        expect(requests[0].projectAttemptId).not.toBe(requests[1].projectAttemptId);
        if (responses) {
            expect(wires[1].input).toContainEqual({ type: 'reasoning', encrypted_content: 'PRIVATE-UI-NATIVE-SIGNATURE' });
            expect(wires[1].input.find(item => item.type === 'function_call').arguments).toBe('{\n  "z": 1, "a": 2\n}');
            expect(requests[1].messages.find(message => message.tool_calls)?.tool_calls[0].function.arguments).toBe('{\n  "z": 1, "a": 2\n}');
        } else expect(wires[1].contents.at(-2).parts).toEqual([{ functionCall: { name: 'atri_agent_get_project', args: {} }, thoughtSignature: 'PRIVATE-UI-NATIVE-SIGNATURE' }]);
        expect(generationResponses.map(value => value.response.observation.nativeExecution)).toEqual([
            { protocol: responses ? 'openai.responses.v1' : 'native.gemini.v1', lifecycle: 'mandatory_tool_exchange', scope: 'task', retention: 'process_only',
                transferredCheckpoints: 0, requestAction: 'fresh_protocol_request', responseAction: 'capture_tool_checkpoint', upstreamReuse: 'unknown' },
            { protocol: responses ? 'openai.responses.v1' : 'native.gemini.v1', lifecycle: 'mandatory_tool_exchange', scope: 'task', retention: 'process_only',
                transferredCheckpoints: 1, requestAction: 'continue_tool_protocol', responseAction: 'discard_finished_execution', upstreamReuse: 'unknown' },
        ]);
        expect(generationResponses.map(value => value.snapshot.diagnostics.executionPlan.policy.continuity))
            .toEqual([change === 'active_execution' ? change : 'none', change === 'active_execution' ? change : 'none']);
        expect(JSON.stringify(generationResponses)).not.toContain('PRIVATE-UI-NATIVE-SIGNATURE');
        expect(JSON.stringify([requests, result, updates])).not.toContain('PRIVATE-UI-NATIVE-SIGNATURE');
        expect(result.messages.at(-1).content).toBe('Current project read.');
        const stored = await agent.getTask(h.handle, source.project.projectId, task.taskId);
        expect(stored.compute.attempts.map(row => row.status)).toEqual(['settled', 'settled']);
        expect(stored.attempts.filter(row => row.kind === 'generation').map(row => row.observation?.origin)).toEqual(['host', 'host']);
        expect((await studio.getRevision(h.handle, source.project.projectId)).revision).toBe(created.revision.revision);
    } finally {
        globalThis.fetch = previousFetch; globalThis.Atria = previousAtria;
        server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.cleanup();
    }
});
