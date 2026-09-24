import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { createServer } from 'node:http';
import { createNativeId, GenerationService, NativeModelPromptPersistence, ProviderFailure, RouteResolver, VersionedJsonResourceHandler } from '../../src/native/index.js';
import { createGenerationProviderAdapter } from '../../src/native/adapters/generation-provider.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';

const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
const capability = (state, name = 'generation.tools') => ({ capability: name, state, provenance: [{ kind: 'adapter-metadata', source: 'fixture' }] });

async function fixture({ format = 'openai-compatible', send, capabilities = [] } = {}) {
    const h = await makeTempFsEngine();
    cleanups.push(h.cleanup);
    const persistence = new NativeModelPromptPersistence({ engine: h.engine });
    const library = new VersionedJsonResourceHandler({ engine: h.engine });
    const generation = { schemaVersion: 1, generationProfileId: createNativeId('generationProfile'), revision: 'r1', displayName: 'same name', sampling: { temperature: 0.2 }, output: { maxTokens: 10 } };
    const prompt = { schemaVersion: 1, promptProgramId: createNativeId('promptProgram'), revision: 'r1', displayName: 'same name', parameters: {}, stages: [{ stageId: 'stage.main', moduleRefs: [] }] };
    await library.commit(h.handle, 'core.generation-profile', generation);
    await library.commit(h.handle, 'core.prompt-program', prompt);
    const connections = [];
    const models = [];
    const routes = [];
    for (const name of ['a', 'b']) {
        const connection = { schemaVersion: 1, connectionProfileId: createNativeId('connectionProfile'), scope: 'player', displayName: 'same name', providerAdapter: 'provider.fixture', transport: 'transport.https', endpoint: `https://${name}.invalid/v1`, secretRef: { secretId: name, scope: 'player' } };
        const model = { schemaVersion: 1, modelProfileId: createNativeId('modelProfile'), scope: 'player', displayName: 'same name', connectionProfileRef: { connectionProfileId: connection.connectionProfileId, scope: 'player' }, remoteModelId: name, capabilities: [], limits: { contextTokens: 100, outputTokens: 20 } };
        const route = { schemaVersion: 1, runtimeRouteId: createNativeId('runtimeRoute'), scope: 'player', displayName: name, role: 'role.writer', modelProfileRef: { modelProfileId: model.modelProfileId, scope: 'player' }, connectionProfileRef: model.connectionProfileRef, generationProfileRef: { resourceType: 'core.generation-profile', resourceId: generation.generationProfileId, revision: 'r1', scope: 'library' }, promptProgramRef: { resourceType: 'core.prompt-program', resourceId: prompt.promptProgramId, revision: 'r1', scope: 'library' }, fallbackRouteRefs: [], policy: { timeoutMs: 1000, maxRetries: 0, maxFallbackAttempts: 1 }, requirements: [] };
        await persistence.saveConnectionProfile(h.handle, connection);
        await persistence.saveModelProfile(h.handle, model);
        connections.push(connection); models.push(model); routes.push(route);
    }
    routes[0].fallbackRouteRefs = [{ runtimeRouteId: routes[1].runtimeRouteId, scope: 'player' }];
    for (const route of [...routes].reverse()) await persistence.saveRuntimeRoute(h.handle, route);
    const sends = jest.fn(send || (async () => ({ choices: [{ message: { content: 'ok' }, text: 'ok' }] })));
    const provider = createGenerationProviderAdapter({ format, send: sends, countTokens: async () => 5, parseStream: async value => value, capabilities });
    const resolver = new RouteResolver({ persistence, library, providers: { 'provider.fixture': provider } });
    const contextProvider = { buildRequestContextPlan: async request => ({ schemaVersion: 1, requestId: request.requestId, source: { kind: 'task', projectId: createNativeId('project'), revision: 'r1', taskId: 'fixture' }, items: [], budget: { maxTokens: 80, reservedOutputTokens: 10 }, provenance: [] }) };
    // Stable context makes fallback/direct snapshots comparable.
    const source = (await contextProvider.buildRequestContextPlan({ requestId: 'fixture' })).source;
    contextProvider.buildRequestContextPlan = async request => ({ schemaVersion: 1, requestId: request.requestId, source, items: [], budget: { maxTokens: 80, reservedOutputTokens: 10 }, provenance: [] });
    const secretPort = { resolveSecret: jest.fn(async ref => `credential-${ref.secretId}`) };
    const preparePrompt = jest.fn(async ({ request, resolved }) => ({ schemaVersion: 1, requestId: request.requestId, directives: [resolved.prompt.revision], input: request.input || 'hello', provenance: [] }));
    const service = new GenerationService({ resolver, contextProvider, secretPort, preparePrompt, now: () => 1 });
    const request = (index = 0, extra = {}) => ({ handle: h.handle, requestId: 'req-1', role: 'role.writer', routeRef: { runtimeRouteId: routes[index].runtimeRouteId, scope: 'player' }, ...extra });
    return { h, persistence, library, generation, prompt, connections, models, routes, sends, provider, resolver, service, secretPort, preparePrompt, contextProvider, request };
}

describe('P2 Generation Core with P1 filesystem authorities', () => {
    test.each(['openai-compatible', 'raw-text'])('%s provider execution fixture keeps credentials at send boundary', async format => {
        const f = await fixture({ format });
        const result = await f.service.execute(f.request());
        expect(result.response.text).toBe('ok');
        expect(f.sends.mock.calls[0][1].secret).toBe('credential-a');
        expect(f.secretPort.resolveSecret.mock.calls[0][1].handle).toBe(f.h.handle);
        expect(JSON.stringify(result)).not.toContain('credential-a');
        expect(JSON.stringify(f.sends.mock.calls[0][0])).not.toContain('credential-a');
        expect(f.sends.mock.calls[0][0].body.model).toBe('a');
        expect(Object.isFrozen(result.snapshot.promptIr.directives)).toBe(true);
        expect(format === 'raw-text' ? f.sends.mock.calls[0][0].body.prompt : f.sends.mock.calls[0][0].body.messages).toBeDefined();
    });

    test('A to B fallback re-resolves exactly as direct B, including generation and prompt', async () => {
        const f = await fixture({ send: async rendered => {
            if (rendered.body.model === 'a') throw new ProviderFailure('transport');
            return { choices: [{ message: { content: 'B' } }] };
        } });
        await f.library.commit(f.h.handle, 'core.generation-profile', { ...f.generation, revision: 'r2', sampling: { temperature: 0.8 } });
        await f.library.commit(f.h.handle, 'core.prompt-program', { ...f.prompt, revision: 'r2' });
        f.routes[1].generationProfileRef.revision = 'r2';
        f.routes[1].promptProgramRef.revision = 'r2';
        await f.persistence.saveRuntimeRoute(f.h.handle, f.routes[1]);
        const switched = await f.service.execute(f.request(0, { fallbackMode: 'automatic' }));
        const direct = await f.service.execute(f.request(1));
        expect(switched).toEqual(direct);
        expect(f.sends.mock.calls[0][0].body.temperature).toBe(0.2);
        expect(f.sends.mock.calls[1][0].body.temperature).toBe(0.8);
        expect(f.sends.mock.calls[1][0]).toEqual(f.sends.mock.calls[2][0]);
    });

    test.each(['unsupported', 'unknown'])('required %s fails closed before secret resolution', async state => {
        const f = await fixture({ capabilities: [capability(state)] });
        await expect(f.service.execute(f.request(0, { requirements: ['generation.tools'] }))).rejects.toMatchObject({ code: `generation_capability_${state}` });
        expect(f.secretPort.resolveSecret).not.toHaveBeenCalled();
        expect(f.sends).not.toHaveBeenCalled();
    });

    test('explicit unknown override preserves unknown evidence and user provenance; unsupported cannot be overridden', async () => {
        const f = await fixture();
        const result = await f.service.execute(f.request(0, { requirements: ['generation.tools'], unknownCapabilityOverrides: ['generation.tools'] }));
        expect(result.snapshot.capabilities[0]).toMatchObject({ state: 'unknown', provenance: expect.arrayContaining([expect.objectContaining({ kind: 'user-override' })]) });
        f.models[0].capabilities = [capability('unsupported')];
        await f.persistence.saveModelProfile(f.h.handle, f.models[0]);
        await expect(f.service.execute(f.request(0, { requirements: ['generation.tools'], unknownCapabilityOverrides: ['generation.tools'] }))).rejects.toMatchObject({ code: 'generation_capability_unsupported' });
    });

    test('fallback cannot weaken primary requirements', async () => {
        const f = await fixture({ send: async () => { throw new ProviderFailure('provider'); } });
        f.models[0].capabilities = [capability('supported')];
        f.routes[0].requirements = ['generation.tools'];
        await f.persistence.saveModelProfile(f.h.handle, f.models[0]);
        await f.persistence.saveRuntimeRoute(f.h.handle, f.routes[0]);
        await expect(f.service.execute(f.request(0, { fallbackMode: 'automatic' }))).rejects.toMatchObject({ code: 'generation_capability_unknown' });
        expect(f.sends).toHaveBeenCalledTimes(1);
    });

    test.each([new Error('credential-a'), new ProviderFailure('application'), Object.assign(new Error('transport'), { kind: 'transport' })])('application/unclassified errors never fallback or expose raw errors', async failure => {
        const f = await fixture({ send: async () => { throw failure; } });
        await expect(f.service.execute(f.request(0, { fallbackMode: 'automatic' }))).rejects.toMatchObject({ code: 'generation_execution_failed', message: 'generation_execution_failed' });
        expect(f.sends).toHaveBeenCalledTimes(1);
    });

    test('cancellation of an uncooperative sender stops fallback', async () => {
        const controller = new AbortController();
        const f = await fixture({ send: async () => { controller.abort(); return new Promise(() => {}); } });
        await expect(f.service.execute(f.request(0, { signal: controller.signal, fallbackMode: 'automatic' }))).rejects.toMatchObject({ code: 'generation_cancelled' });
        expect(f.sends).toHaveBeenCalledTimes(1);
    });

    test('timeout is bounded and eligible for complete fallback', async () => {
        const f = await fixture({ send: async rendered => rendered.body.model === 'a' ? new Promise(() => {}) : { choices: [{ message: { content: 'B' } }] } });
        f.routes[0].policy.timeoutMs = 10;
        await f.persistence.saveRuntimeRoute(f.h.handle, f.routes[0]);
        expect((await f.service.execute(f.request(0, { fallbackMode: 'automatic' }))).response.text).toBe('B');
    });

    test('concurrent roles/routes/configs and caller mutation remain isolated', async () => {
        const f = await fixture({ send: async (rendered, { secret }) => {
            await new Promise(resolve => setTimeout(resolve, rendered.body.model === 'a' ? 15 : 1));
            expect(secret).toBe(`credential-${rendered.body.model}`);
            expect(rendered.body.temperature).toBe(rendered.body.model === 'a' ? 0.2 : 0.8);
            return { choices: [{ message: { content: `${rendered.body.model}:${rendered.body.messages[1].content}` } }] };
        } });
        f.routes[1].role = 'role.editor';
        await f.library.commit(f.h.handle, 'core.generation-profile', { ...f.generation, revision: 'r2', sampling: { temperature: 0.8 } });
        f.routes[1].generationProfileRef.revision = 'r2';
        await f.persistence.saveRuntimeRoute(f.h.handle, f.routes[1]);
        const request = f.request(0, { input: 'first' });
        const first = f.service.execute(request);
        request.input = 'mutated';
        const second = f.service.execute(f.request(1, { role: 'role.editor', input: 'second' }));
        const results = await Promise.all([first, second]);
        expect(results.map(r => r.response.text)).toEqual(['a:first', 'b:second']);
    });

    test('config mismatch, budget failure and exact revision missing never fallback', async () => {
        const f = await fixture();
        f.routes[0].generationProfileRef.revision = 'missing';
        await f.persistence.saveRuntimeRoute(f.h.handle, f.routes[0]);
        await expect(f.service.execute(f.request(0, { fallbackMode: 'automatic' }))).rejects.toMatchObject({ code: 'generation_execution_failed' });
        f.routes[0].generationProfileRef.revision = 'r1';
        f.routes[0].connectionProfileRef = f.routes[1].connectionProfileRef;
        await f.persistence.saveRuntimeRoute(f.h.handle, f.routes[0]);
        await expect(f.service.execute(f.request())).rejects.toMatchObject({ code: 'generation_profile_mismatch' });
        f.models[1].limits.contextTokens = 6;
        await f.persistence.saveModelProfile(f.h.handle, f.models[1]);
        await expect(f.service.execute(f.request(1))).rejects.toMatchObject({ code: 'generation_context_budget_exceeded' });
        expect(f.sends).not.toHaveBeenCalled();
    });

    test('credential echo in normalized response is rejected without fallback', async () => {
        const f = await fixture({ send: async () => ({ choices: [{ message: { content: 'credential-a' } }] }) });
        await expect(f.service.execute(f.request(0, { fallbackMode: 'automatic' }))).rejects.toMatchObject({ code: 'generation_response_contains_secret' });
        expect(f.sends).toHaveBeenCalledTimes(1);
    });

    test.each(['disabled', 'confirm'])('%s fallback needs explicit authorization', async fallbackMode => {
        const f = await fixture({ send: async () => { throw new ProviderFailure('provider'); } });
        await expect(f.service.execute(f.request(0, { fallbackMode }))).rejects.toMatchObject({ code: fallbackMode === 'confirm' ? 'generation_fallback_confirmation_required' : 'generation_provider_failed' });
        expect(f.sends).toHaveBeenCalledTimes(1);
    });

    test('secret port failure cannot masquerade as eligible provider failure', async () => {
        const f = await fixture();
        f.secretPort.resolveSecret.mockRejectedValue(new ProviderFailure('transport'));
        await expect(f.service.execute(f.request(0, { fallbackMode: 'automatic' }))).rejects.toMatchObject({ code: 'generation_secret_unavailable' });
        expect(f.secretPort.resolveSecret).toHaveBeenCalledTimes(1);
        expect(f.sends).not.toHaveBeenCalled();
    });

    test('known credential accidentally present in input never enters returned snapshot', async () => {
        const f = await fixture();
        await expect(f.service.execute(f.request(0, { input: 'credential-a' }))).rejects.toMatchObject({ code: 'generation_config_contains_secret' });
        expect(f.sends).not.toHaveBeenCalled();
    });

    test('nested provider config is deeply frozen without freezing the request', async () => {
        const f = await fixture();
        f.preparePrompt.mockImplementation(async ({ request, resolved }) => {
            expect(() => { resolved.generation.sampling.temperature = 99; }).toThrow();
            expect(() => { resolved.resources.push({}); }).toThrow();
            return { schemaVersion: 1, requestId: request.requestId, input: 'ok' };
        });
        const request = f.request();
        await f.service.execute(request);
        expect(Object.isFrozen(request)).toBe(false);
    });

    test('repeated common resolver calls are deterministic and never dereference secrets', async () => {
        const f = await fixture();
        const first = await f.resolver.resolve(f.request());
        expect(await f.resolver.resolve(f.request())).toEqual(first);
        expect(f.secretPort.resolveSecret).not.toHaveBeenCalled();
    });

    test('exact reader returning a different revision is rejected', async () => {
        const f = await fixture();
        const getExact = f.library.getExact.bind(f.library);
        f.library.getExact = async (...args) => {
            const envelope = await getExact(...args);
            return { ...envelope, snapshot: { ...envelope.snapshot, revision: 'wrong' } };
        };
        await expect(f.service.execute(f.request())).rejects.toMatchObject({ code: 'generation_exact_resource_mismatch' });
    });

    test('recursive exact Prompt Module dependency is resolved and missing dependency fails closed', async () => {
        const f = await fixture();
        const module = { schemaVersion: 1, promptModuleId: createNativeId('promptModule'), revision: 'r1', displayName: 'module', target: 'system.foundation', stages: ['stage.main'], priority: 0, body: 'fixture' };
        await f.library.commit(f.h.handle, 'core.prompt-module', module);
        const ref = { scope: 'library', resourceType: 'core.prompt-module', resourceId: module.promptModuleId, revision: 'r1' };
        await f.library.commit(f.h.handle, 'core.prompt-program', { ...f.prompt, revision: 'r2', stages: [{ stageId: 'stage.main', moduleRefs: [ref] }] });
        f.routes[0].promptProgramRef.revision = 'r2';
        await f.persistence.saveRuntimeRoute(f.h.handle, f.routes[0]);
        const result = await f.service.execute(f.request());
        expect(result.snapshot.diagnostics.effectiveConfig.resources).toHaveLength(3);
        await f.library.commit(f.h.handle, 'core.prompt-program', { ...f.prompt, revision: 'r3', stages: [{ stageId: 'stage.main', moduleRefs: [{ ...ref, revision: 'missing' }] }] });
        f.routes[0].promptProgramRef.revision = 'r3';
        await f.persistence.saveRuntimeRoute(f.h.handle, f.routes[0]);
        await expect(f.service.execute(f.request())).rejects.toMatchObject({ code: 'generation_execution_failed' });
    });

    test('fallback validates the new model context budget before secret/send', async () => {
        const f = await fixture({ send: async () => { throw new ProviderFailure('provider'); } });
        f.models[1].limits.contextTokens = 7;
        await f.persistence.saveModelProfile(f.h.handle, f.models[1]);
        await expect(f.service.execute(f.request(0, { fallbackMode: 'automatic' }))).rejects.toMatchObject({ code: 'generation_context_budget_exceeded' });
        expect(f.sends).toHaveBeenCalledTimes(1);
        expect(f.secretPort.resolveSecret).toHaveBeenCalledTimes(1);
    });

    test('cancellation before execute and while preparing context never sends', async () => {
        const f = await fixture();
        const controller = new AbortController();
        controller.abort();
        await expect(f.service.execute(f.request(0, { signal: controller.signal }))).rejects.toMatchObject({ code: 'generation_cancelled' });
        const next = new AbortController();
        const service = new GenerationService({ resolver: f.resolver, secretPort: f.secretPort, preparePrompt: f.preparePrompt,
            contextProvider: { buildRequestContextPlan: () => { next.abort(); return new Promise(() => {}); } } });
        await expect(service.execute(f.request(0, { signal: next.signal }))).rejects.toMatchObject({ code: 'generation_cancelled' });
        expect(f.sends).not.toHaveBeenCalled();
    });

    test.each(['project', 'package'])('%s resources require matching exact owner provenance', async scope => {
        const f = await fixture();
        const owner = scope === 'project' ? { projectId: createNativeId('project') } : { packageId: createNativeId('package'), packageVersionId: createNativeId('packageVersion') };
        f.routes[0].promptProgramRef = { ...f.routes[0].promptProgramRef, scope, ...owner };
        await f.persistence.saveRuntimeRoute(f.h.handle, f.routes[0]);
        let origin = { scope, ...owner };
        const resolver = new RouteResolver({ persistence: f.persistence, library: f.library, providers: { 'provider.fixture': f.provider }, getScopedResource: async () => ({ snapshot: f.prompt, origin }) });
        const service = new GenerationService({ resolver, contextProvider: f.contextProvider, preparePrompt: f.preparePrompt, secretPort: f.secretPort });
        expect((await service.execute(f.request())).snapshot.promptProgramRef).toMatchObject(owner);
        origin = { scope: 'library' };
        await expect(service.execute(f.request())).rejects.toMatchObject({ code: 'generation_resource_origin_mismatch' });
    });

    test('provider/parse errors after successful send cannot trigger fallback', async () => {
        const f = await fixture();
        const provider = { ...f.provider, parseStream: async () => { throw new ProviderFailure('provider'); } };
        const resolver = new RouteResolver({ persistence: f.persistence, library: f.library, providers: { 'provider.fixture': provider } });
        const service = new GenerationService({ resolver, contextProvider: f.contextProvider, preparePrompt: f.preparePrompt, secretPort: f.secretPort });
        await expect(service.execute(f.request(0, { fallbackMode: 'automatic' }))).rejects.toMatchObject({ code: 'generation_response_invalid' });
        expect(f.sends).toHaveBeenCalledTimes(1);
    });

    test('fallback cannot drop an output contract even when both models support it', async () => {
        const f = await fixture();
        const provider = { ...f.provider,
            resolveCapabilities: async () => [capability('supported', 'generation.structured-output')],
            renderRequest: async ({ resolved }) => ({ model: resolved.model.remoteModelId }),
            send: jest.fn(async () => { throw new ProviderFailure('provider'); }),
        };
        const resolver = new RouteResolver({ persistence: f.persistence, library: f.library, providers: { 'provider.fixture': provider } });
        const service = new GenerationService({ resolver, contextProvider: f.contextProvider, secretPort: f.secretPort,
            preparePrompt: async ({ request, resolved }) => ({ schemaVersion: 1, requestId: request.requestId, input: 'fixture', outputContract: resolved.model.remoteModelId === 'a' ? { type: 'json' } : null }),
        });
        await expect(service.execute(f.request(0, { fallbackMode: 'automatic', requirements: ['generation.structured-output'] }))).rejects.toMatchObject({ code: 'generation_output_authority_changed' });
        expect(provider.send).toHaveBeenCalledTimes(1);
    });

    test('optional unknown capability stays unknown and explicit streaming requires capability evidence', async () => {
        const f = await fixture({ capabilities: [capability('unknown', 'generation.streaming')] });
        expect((await f.service.execute(f.request())).snapshot.capabilities[0].state).toBe('unknown');
        await f.library.commit(f.h.handle, 'core.generation-profile', { ...f.generation, revision: 'r2', streaming: { enabled: true } });
        f.routes[0].generationProfileRef.revision = 'r2';
        await f.persistence.saveRuntimeRoute(f.h.handle, f.routes[0]);
        await expect(f.service.execute(f.request())).rejects.toMatchObject({ code: 'generation_capability_unknown' });
    });

    test('session route lookup checks session identity without persisting a second route store', async () => {
        const f = await fixture();
        const sessionId = createNativeId('session');
        const route = { ...f.routes[0], scope: 'session', sessionId };
        const resolver = new RouteResolver({ persistence: f.persistence, library: f.library, providers: { 'provider.fixture': f.provider }, getSessionRoute: async () => route });
        const service = new GenerationService({ resolver, contextProvider: f.contextProvider, preparePrompt: f.preparePrompt, secretPort: f.secretPort });
        await expect(service.execute(f.request(0, { routeRef: { runtimeRouteId: route.runtimeRouteId, scope: 'session', sessionId } }))).resolves.toMatchObject({ response: { text: 'ok' } });
        await expect(service.execute(f.request(0, { routeRef: { runtimeRouteId: route.runtimeRouteId, scope: 'session', sessionId: createNativeId('session') } }))).rejects.toMatchObject({ code: 'generation_route_mismatch' });
    });

    test.each(['openai-compatible', 'raw-text'])('%s loopback HTTP transport and streaming parser integration', async format => {
        const received = [];
        const server = createServer(async (req, res) => {
            let body = '';
            for await (const chunk of req) body += chunk;
            received.push({ body: JSON.parse(body), authorization: req.headers.authorization });
            res.setHeader('content-type', 'application/json');
            res.write('{"choices":[');
            res.end('{"message":{"content":"http-ok"},"text":"http-ok"}]}');
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        cleanups.push(() => new Promise(resolve => server.close(resolve)));
        const f = await fixture();
        f.connections[0].endpoint = `http://127.0.0.1:${server.address().port}/generate`;
        await f.persistence.saveConnectionProfile(f.h.handle, f.connections[0]);
        await f.library.commit(f.h.handle, 'core.generation-profile', { ...f.generation, revision: 'r2', streaming: { enabled: true } });
        f.routes[0].generationProfileRef.revision = 'r2';
        await f.persistence.saveRuntimeRoute(f.h.handle, f.routes[0]);
        const provider = createGenerationProviderAdapter({ format, countTokens: async () => 5, capabilities: [capability('supported', 'generation.streaming')],
            send: (rendered, { secret, signal }) => fetch(rendered.endpoint, { method: 'POST', signal, headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify(rendered.body) }),
            parseStream: async response => {
                let body = '';
                const decoder = new TextDecoder();
                for await (const chunk of response.body) body += decoder.decode(chunk, { stream: true });
                return JSON.parse(body + decoder.decode());
            },
        });
        const resolver = new RouteResolver({ persistence: f.persistence, library: f.library, providers: { 'provider.fixture': provider } });
        const service = new GenerationService({ resolver, contextProvider: f.contextProvider, preparePrompt: f.preparePrompt, secretPort: f.secretPort });
        expect((await service.execute(f.request())).response.text).toBe('http-ok');
        expect(received[0].authorization).toBe('Bearer credential-a');
        expect(received[0].body.model).toBe('a');
        expect(received[0].body.stream).toBe(true);
    });
});
