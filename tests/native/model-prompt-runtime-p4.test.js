import { afterEach, describe, expect, jest, test } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { createServer } from 'node:http';
import { createNativeId } from '../../src/native/identity.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { runNativePlayGeneration } from '../../public/scripts/native/play-generation.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';

const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

async function fixture({ format = 'openai-compatible', stream = false, handler } = {}) {
    const requests = [];
    const server = createServer(async (req, res) => {
        let text = ''; for await (const bytes of req) text += bytes;
        requests.push({ body: JSON.parse(text), authorization: req.headers.authorization });
        if (handler) return handler(req, res, requests.at(-1));
        if (stream) {
            res.writeHead(200, { 'Content-Type': 'text/event-stream' });
            res.end('data: ' + JSON.stringify({ choices: [{ text: 'Native ', delta: { content: 'Native ' } }] }) + '\n\ndata: '
                + JSON.stringify({ choices: [{ text: 'response', delta: { content: 'response' } }] }) + '\n\ndata: [DONE]\n\n');
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ choices: [{ text: 'Native response', message: { content: 'Native response' } }] }));
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    const h = await makeTempFsEngine(); cleanups.push(h.cleanup);
    const seeded = await seedGenerationProfiles({ ...h, endpoint: `http://127.0.0.1:${server.address().port}/v1/chat/completions`, format, streaming: stream,
        roles: ['narrator', 'studio', 'memory', 'search', 'orchestrator', 'intent_resolver', 'event_interpreter'] });
    const projectId = createNativeId('project');
    const project = { source: { project: { projectId }, package: {}, resources: [] }, revision: { revision: 'r1' } };
    const secretPort = { resolveSecret: jest.fn(async (_, owner) => { expect(owner.handle).toBe(h.handle); return 'p4-credential'; }) };
    const host = new NativeGenerationHost({ ...seeded, studio: { getProject: async () => project }, agent: { getContext: async () => ({ task: { status: 'planned', baseRevision: 'r1' }, tools: [] }) },
        providers: { ['provider.' + format]: createHttpGenerationProvider({ format }) }, secretPort });
    const request = { role: 'narrator', projectId, revision: 'r1', requestId: 'req-1', messages: [{ role: 'user', content: 'Selected task' }] };
    return { ...seeded, h, host, request, requests, secretPort, project };
}

describe('P4 authenticated Native generation host and real HTTP transport', () => {
    test.each([['openai-compatible', false], ['openai-compatible', true], ['raw-text', false], ['raw-text', true]])('%s stream=%s uses exact config and send-boundary Secret', async (format, stream) => {
        const f = await fixture({ format, stream });
        const result = await f.host.execute(f.h.handle, f.request);
        expect(result.response.assistantText).toBe('Native response');
        expect(f.requests[0].authorization).toBe('Bearer p4-credential');
        expect(JSON.stringify(result)).not.toContain('p4-credential');
        expect(JSON.stringify(f.requests[0].body)).toContain(f.module.body);
        expect(result.snapshot.contextPlan.source.projectId).toBe(f.request.projectId);
    });

    test('all first-party roles consume the same exact Program resources with isolated requests', async () => {
        const f = await fixture();
        const results = await Promise.all(f.routes.map(route => f.host.execute(f.h.handle, { ...f.request, role: route.role.slice(5), messages: [{ role: 'user', content: route.role }] })));
        expect(new Set(results.map(result => result.snapshot.promptProgramRef.resourceId)).size).toBe(1);
        expect(new Set(f.requests.map(item => item.body.messages.find(message => message.role === 'user' && message.content.startsWith('role.')).content)).size).toBe(7);
    });

    test('stream chunks are delivered but a credential split across chunks never escapes', async () => {
        const f = await fixture({ stream: true }); const chunks = [];
        await f.host.execute(f.h.handle, f.request, undefined, chunk => chunks.push(chunk));
        expect(chunks.at(-1).text).toBe('Native response');
        const poisoned = await fixture({ handler: (_req, res) => {
            res.setHeader('Content-Type', 'text/event-stream');
            res.end(['safe p4-', 'credential'].map(content => 'data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\n').join(''));
        } });
        const published = [];
        await expect(poisoned.host.execute(poisoned.h.handle, poisoned.request, undefined, chunk => published.push(chunk.delta))).rejects.toMatchObject({ code: 'generation_response_invalid' });
        expect(published.join('')).toBe('safe ');
    });

    test('retries finish on the primary before the fallback resolves its own complete configuration', async () => {
        const f = await fixture({ handler: (_req, res, request) => {
            if (request.body.model === 'p4-fixture') { res.writeHead(503).end(); return; }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ choices: [{ message: { content: 'fallback' } }] }));
        } });
        const model = { ...f.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'fallback-model' };
        await f.persistence.saveModelProfile(f.h.handle, model);
        const fallback = { ...f.routes[0], runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId } };
        await f.persistence.saveRuntimeRoute(f.h.handle, fallback);
        await f.persistence.saveRuntimeRoute(f.h.handle, { ...f.routes[0], policy: { ...f.routes[0].policy, maxRetries: 1 }, fallbackRouteRefs: [{ scope: 'player', runtimeRouteId: fallback.runtimeRouteId }] });
        const result = await f.host.execute(f.h.handle, { ...f.request, fallbackMode: 'automatic' });
        expect(f.requests.map(item => item.body.model)).toEqual(['p4-fixture', 'p4-fixture', 'fallback-model']);
        expect(result.routing.fallbackUsed).toBe(true);
        expect(result.snapshot.modelProfileId).toBe(model.modelProfileId);
        expect(result.routing.attempts.map(item => item.retry)).toEqual([0, 1, 0]);
    });

    test('missing/ambiguous Native routes, stale revision and stopped Studio task fail before Secret', async () => {
        const f = await fixture();
        await expect(f.host.execute(f.h.handle, { ...f.request, revision: 'old' })).rejects.toMatchObject({ code: 'native_generation_revision_conflict' });
        await expect(f.host.execute(f.h.handle, { ...f.request, routeRef: { scope: 'player', runtimeRouteId: createNativeId('runtimeRoute') } })).rejects.toMatchObject({ code: 'native_generation_route_missing' });
        await f.persistence.saveRuntimeRoute(f.h.handle, { ...f.routes[0], runtimeRouteId: createNativeId('runtimeRoute') });
        await expect(f.host.execute(f.h.handle, f.request)).rejects.toMatchObject({ code: 'native_generation_route_ambiguous' });
        f.host.agent.getContext = async () => ({ task: { status: 'review', baseRevision: 'r1' }, tools: [] });
        await expect(f.host.execute(f.h.handle, { ...f.request, role: 'studio', taskId: 'task-1' })).rejects.toMatchObject({ code: 'native_generation_task_stopped' });
        expect(f.secretPort.resolveSecret).not.toHaveBeenCalled();
    });

    test('tool calls and structured output are real protocol fields; tool transcript survives', async () => {
        const f = await fixture({ handler: (_req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'inspect', arguments: '{"id":1}' } }] } }] }));
        } });
        const tools = [{ type: 'function', function: { name: 'inspect', parameters: { type: 'object' } } }];
        const outputContract = { name: 'result', schema: { type: 'object', properties: {} }, strict: true };
        const result = await f.host.execute(f.h.handle, { ...f.request, tools, outputContract,
            messages: [{ role: 'assistant', content: '', tool_calls: [{ id: 'old', type: 'function', function: { name: 'inspect', arguments: '{}' } }] },
                { role: 'tool', tool_call_id: 'old', content: 'done' }] });
        expect(result.response.toolCalls[0]).toMatchObject({ name: 'inspect', args: { id: 1 } });
        expect(f.requests[0].body.tools).toEqual(tools);
        expect(f.requests[0].body.response_format.json_schema).toEqual(outputContract);
        expect(f.requests[0].body.messages.some(item => item.role === 'tool' && item.tool_call_id === 'old')).toBe(true);
        expect(f.requests[0].body.messages.at(-1).role).toBe('tool');
    });

    test('HTTP endpoint derives owner from authentication, never from submitted handle', async () => {
        const f = await fixture();
        const app = express(); app.use(express.json());
        app.use((req, _res, next) => { if (req.headers['x-test-user']) req.user = { profile: { handle: f.h.handle } }; next(); });
        app.use('/api/native/generation', createNativeGenerationRouter(() => f.host));
        await supertest(app).post('/api/native/generation/execute').send(f.request).expect(401);
        const response = await supertest(app).post('/api/native/generation/execute').set('x-test-user', 'yes').send({ ...f.request, handle: 'foreign' }).expect(200);
        expect(response.body.response.text).toBe('Native response');
        expect(f.secretPort.resolveSecret.mock.calls[0][1].handle).toBe(f.h.handle);
    });

    test('config/capability errors do not retry or send; cancellation stops the HTTP request', async () => {
        const f = await fixture({ handler: () => {} });
        const controller = new AbortController();
        const pending = f.host.execute(f.h.handle, f.request, controller.signal);
        setTimeout(() => controller.abort(), 100);
        await expect(pending).rejects.toMatchObject({ code: 'generation_cancelled' });
        await f.persistence.saveModelProfile(f.h.handle, { ...f.model, tokenizer: {} });
        const before = f.secretPort.resolveSecret.mock.calls.length;
        await expect(f.host.execute(f.h.handle, f.request)).rejects.toMatchObject({ code: 'generation_adapter_control_unsupported' });
        expect(f.secretPort.resolveSecret).toHaveBeenCalledTimes(before);
    });
});

describe('P5 configuration and compile-only preview', () => {
    test('preview matches execute snapshot without resolving Secret, sending or persisting', async () => {
        const f = await fixture();
        const before = await f.persistence.listRuntimeRoutes(f.h.handle);
        const preview = await f.host.execute(f.h.handle, f.request, undefined, undefined, { preview: true });
        expect(preview.preview).toBe(true);
        expect(preview.routing.attempts).toEqual([]);
        expect(f.requests).toEqual([]);
        expect(f.secretPort.resolveSecret).not.toHaveBeenCalled();
        expect(await f.persistence.listRuntimeRoutes(f.h.handle)).toEqual(before);
        const executed = await f.host.execute(f.h.handle, f.request);
        expect(preview.snapshot.promptIr).toEqual(executed.snapshot.promptIr);
        expect(preview.snapshot.diagnostics).toEqual(executed.snapshot.diagnostics);
        expect(preview.rendered.body).toEqual(f.requests[0].body);
        await expect(f.host.execute(f.h.handle, { ...f.request, revision: 'stale' }, undefined, undefined, { preview: true }))
            .rejects.toMatchObject({ code: 'native_generation_revision_conflict' });
    });
    test('authenticated configuration CRUD preserves exact revisions and rejects missing/cyclic fallbacks', async () => {
        const f = await fixture();
        const app = express(); app.use(express.json());
        app.use((req, _res, next) => { if (req.headers['x-test-user']) req.user = { profile: { handle: f.h.handle } }; next(); });
        app.use('/api/native/generation', createNativeGenerationRouter(() => f.host));
        const base = '/api/native/generation';
        await supertest(app).get(base + '/configuration').expect(401);
        await supertest(app).put(base + '/configuration/connections').send(f.connection).expect(401);
        await supertest(app).post(base + '/preview').send(f.request).expect(401);
        const put = (kind, body) => supertest(app).put(base + '/configuration/' + kind).set('x-test-user', 'yes').send(body);
        await put('connections', { ...f.connection, displayName: 'Updated connection' }).expect(200);
        await put('connections', { ...f.connection, endpoint: 'https://user:password@example.com' }).expect(400);
        await put('profiles', { ...f.generation, revision: 'r2', output: { maxTokens: 128 } }).expect(200);
        await put('profiles', { ...f.generation, output: { maxTokens: 3 } }).expect(400);
        const config = await supertest(app).get(base + '/configuration').set('x-test-user', 'yes').expect(200);
        expect(config.body.profiles[0].revision).toBe('r2');
        expect(config.body.routes[0].generationProfileRef.revision).toBe('r1');
        expect(config.body.resources.find(item => item.resourceType === 'core.generation-profile').revisions).toEqual(['r1', 'r2']);
        const route = f.routes[0];
        await put('routes', { ...route, fallbackRouteRefs: [{ scope: 'player', runtimeRouteId: createNativeId('runtimeRoute') }] }).expect(400);
        const alternative = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), fallbackRouteRefs: [{ scope: 'player', runtimeRouteId: route.runtimeRouteId }] };
        await put('routes', alternative).expect(200);
        await put('routes', { ...route, fallbackRouteRefs: [{ scope: 'player', runtimeRouteId: alternative.runtimeRouteId }] }).expect(400);
        const preview = await supertest(app).post(base + '/preview').set('x-test-user', 'yes').send({ ...f.request, handle: 'foreign' }).expect(200);
        expect(preview.body.preview).toBe(true);
        expect(f.secretPort.resolveSecret).not.toHaveBeenCalled();
        expect(f.requests).toEqual([]);
    });
});

describe('P4 Native Play publication uses the existing lifecycle', () => {
    function hostFixture() {
        const events = [];
        const runtime = { prepareGeneration: async type => { events.push('prepare'); return type === 'regenerate' ? 'normal' : type; },
            persist: async () => events.push('persist'), finalizeStoppedGeneration: async () => events.push('abort') };
        const host = { started: async () => events.push('started'), submitUser: async () => events.push('user'),
            commitAssistant: async type => events.push('assistant:' + type), ended: async () => events.push('ended') };
        return { events, runtime, host };
    }
    test('user commits before generation and assistant commits afterward', async () => {
        const f = hostFixture();
        await runNativePlayGeneration({ ...f, type: 'normal', input: 'hello', execute: async () => { f.events.push('execute'); return { assistantText: 'reply' }; } });
        expect(f.events).toEqual(['prepare', 'started', 'user', 'persist', 'execute', 'assistant:normal', 'persist', 'ended']);
    });
    test.each(['regenerate', 'continue'])('%s preserves Native retry/continuation semantics without a new user turn', async type => {
        const f = hostFixture();
        await runNativePlayGeneration({ ...f, type, input: 'unused composer text', execute: async () => ({ assistantText: 'reply' }) });
        expect(f.events).not.toContain('user');
        expect(f.events).toContain('assistant:' + (type === 'regenerate' ? 'normal' : type));
    });
    test('Stop discards uncommitted work and never publishes a late result', async () => {
        const f = hostFixture(); const controller = new AbortController();
        await expect(runNativePlayGeneration({ ...f, type: 'normal', input: 'hello', signal: controller.signal,
            execute: async () => { controller.abort(); return { assistantText: 'late' }; } })).rejects.toMatchObject({ code: 'generation_cancelled' });
        expect(f.events).toContain('abort'); expect(f.events).not.toContain('assistant:normal');
    });

    test.each(['spec', 'director'])('Native %s orchestration stays on the existing publication boundary', async mode => {
        const f = hostFixture();
        f.host.orchestratorApi = () => ({ getGameRuntimeMode: () => mode,
            runGameGuidance: async () => ({ guidance: 'Keep the harbour closed.' }),
            runGameDirector: async () => ({ status: 'completed', finalProse: 'directed reply' }) });
        const execute = jest.fn(async request => { expect(request.messages.at(-1).content).toContain('Keep the harbour closed.'); return { assistantText: 'reply' }; });
        await runNativePlayGeneration({ ...f, type: 'normal', execute });
        expect(execute).toHaveBeenCalledTimes(mode === 'director' ? 0 : 1);
        expect(f.events).toEqual(['prepare', 'started', 'assistant:normal', 'persist', 'ended']);
    });
});

describe('P6 scoped catalog and authoring preview', () => {
    test('catalog reads authenticated exact owners; Library commits cannot mutate Package originals', async () => {
        const f = await fixture();
        const packageId = createNativeId('package'), packageVersionId = createNativeId('packageVersion');
        f.project.source.resources = [{ resourceType: 'core.prompt-module', resource: { ...f.module, displayName: 'Project module' } }];
        const packaged = { resourceType: 'core.prompt-module', resource: { ...f.module, displayName: 'Package module' } };
        f.host.studio.listProjects = jest.fn(async handle => { expect(handle).toBe(f.h.handle); return [{ project: f.project.source.project }]; });
        f.host.studio.listLibraryResources = jest.fn(async () => [{ resourceId: packageId, revisions: [packageVersionId] }]);
        f.host.packageInstaller = { open: jest.fn(async handle => { expect(handle).toBe(f.h.handle); return { manifest: { resources: [packaged] } }; }) };
        const app = express(); app.use(express.json());
        app.use((req, _res, next) => { if (req.headers['x-test-user']) req.user = { profile: { handle: f.h.handle } }; next(); });
        app.use('/generation', createNativeGenerationRouter(() => f.host));
        await supertest(app).get('/generation/resources').expect(401); await supertest(app).post('/generation/resources').send({}).expect(401);
        const list = await supertest(app).get('/generation/resources').set('x-test-user', 'yes').expect(200);
        expect(list.body.map(item => item.ref.scope)).toEqual(expect.arrayContaining(['library', 'project', 'package']));
        expect(list.body.find(item => item.ref.scope === 'package').ref).toMatchObject({ packageId, packageVersionId });
        const post = body => supertest(app).post('/generation/resources').set('x-test-user', 'yes').send(body);
        await post({ resourceType: 'core.prompt-module', resource: { ...f.module, revision: 'p6-new', body: 'Edited Library' } }).expect(200);
        await post({ resourceType: 'core.prompt-module', resource: { ...f.module, body: 'Overwrite pinned revision' } }).expect(400);
        await post({ resourceType: 'core.connection-profile', resource: f.connection }).expect(400);
        expect(packaged.resource.body).toBe(f.module.body);
        expect((await f.library.getExact(f.h.handle, f.routes[0].promptProgramRef)).snapshot).toMatchObject(f.prompt);
    });
    test('preview selects exact Project authoring resources without mutating route, Secret or execution path', async () => {
        const f = await fixture();
        const scoped = { ...f.prompt, promptProgramId: createNativeId('promptProgram'), revision: 'project-exact', responseDirective: { body: 'Project preview only' } };
        f.project.source.resources = [{ resourceType: 'core.prompt-program', resource: scoped }];
        const promptProgramRef = { scope: 'project', projectId: f.request.projectId, resourceType: 'core.prompt-program', resourceId: scoped.promptProgramId, revision: scoped.revision };
        const input = { ...f.request, previewRefs: { promptProgramRef } };
        const before = await f.persistence.listRuntimeRoutes(f.h.handle);
        const preview = await f.host.execute(f.h.handle, input, undefined, undefined, { preview: true });
        expect(preview.snapshot.promptProgramRef).toEqual(promptProgramRef); expect(JSON.stringify(preview.rendered)).toContain('Project preview only');
        expect(await f.persistence.listRuntimeRoutes(f.h.handle)).toEqual(before); expect(f.requests).toEqual([]); expect(f.secretPort.resolveSecret).not.toHaveBeenCalled();
        await expect(f.host.execute(f.h.handle, input)).rejects.toMatchObject({ code: 'native_generation_preview_only' });
        await expect(f.host.execute(f.h.handle, { ...input, previewRefs: { promptProgramRef: { ...promptProgramRef, projectId: createNativeId('project') } } }, undefined, undefined, { preview: true })).rejects.toThrow();
        await expect(f.host.execute(f.h.handle, { ...input, previewRefs: { promptProgramRef: { ...promptProgramRef, revision: 'missing' } } }, undefined, undefined, { preview: true })).rejects.toThrow();
        expect(f.secretPort.resolveSecret).not.toHaveBeenCalled();
    });
});


describe('P8 host request identity hard cut', () => {
    test.each(['session', 'library', undefined])('rejects explicit %s route scope before configuration lookup or send', async scope => {
        const f = await fixture(); const list = jest.spyOn(f.persistence, 'listRuntimeRoutes');
        const input = { ...f.request, routeRef: { scope, runtimeRouteId: f.routes[0].runtimeRouteId } };
        await expect(f.host.execute(f.h.handle, input)).rejects.toMatchObject({ code: 'native_generation_route_ref_invalid' });
        expect(list).not.toHaveBeenCalled(); expect(f.secretPort.resolveSecret).not.toHaveBeenCalled(); expect(f.requests).toEqual([]);
    });
    test('rejects conflicting context and cross-scope route metadata, preserving exact config', async () => {
        const f = await fixture(); const before = await f.persistence.listRuntimeRoutes(f.h.handle);
        await expect(f.host.execute(f.h.handle, { ...f.request, sessionId: createNativeId('session') })).rejects.toMatchObject({ code: 'native_generation_context_ambiguous' });
        await expect(f.host.execute(f.h.handle, { ...f.request, routeRef: { scope: 'player', runtimeRouteId: f.routes[0].runtimeRouteId, sessionId: createNativeId('session') } }, undefined, undefined, { preview: true })).rejects.toMatchObject({ code: 'native_generation_route_ref_invalid' });
        expect(await f.persistence.listRuntimeRoutes(f.h.handle)).toEqual(before); expect(f.requests).toEqual([]); expect(f.secretPort.resolveSecret).not.toHaveBeenCalled();
        const result = await f.host.execute(f.h.handle, { ...f.request, routeRef: { scope: 'player', runtimeRouteId: f.routes[0].runtimeRouteId } });
        expect(result.snapshot.runtimeRouteId).toBe(f.routes[0].runtimeRouteId);
    });
});
