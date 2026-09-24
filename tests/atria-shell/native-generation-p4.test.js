/** @jest-environment jsdom */
import { afterEach, expect, jest, test } from '@jest/globals';
import { nativeSessionRuntime } from '../../public/scripts/native/session-runtime.js';
import { executeFirstPartyGeneration, streamFirstPartyGeneration } from '../../public/scripts/native/generation-compat.js';
import { createRuntimeRoleRouter } from '../../public/scripts/extensions/game-runtime/llm/roles.js';
import { requestToolCallsWithRetry, requestToolCallWithRetry } from '../../public/scripts/lib/iter-tool-calling.js';

afterEach(() => { nativeSessionRuntime.snapshot = null; delete globalThis.fetch; delete globalThis.Atria; });

test('single-tool, multi-tool and streaming agent calls retain distinct exact Runtime Routes', async () => {
    nativeSessionRuntime.snapshot = { session: { sessionId: 'session' }, revision: { revisionId: 'revision' } };
    const context = { generateTask: () => { throw new Error('legacy sender'); } };
    const requests = [];
    globalThis.fetch = jest.fn(async (_url, options) => {
        requests.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ response: { assistantText: 'done', toolCalls: [{ id: 'call', name: 'inspect', args: {}, raw: { type: 'function', function: { name: 'inspect', arguments: '{}' } } }] }, snapshot: {}, routing: {} }) };
    });
    const routes = [1, 2, 3].map(index => ({ scope: 'player', runtimeRouteId: 'route_' + String(index).repeat(32) }));
    await requestToolCallWithRetry(context, {}, { functionName: 'inspect', nativeRouteRef: routes[0] });
    await requestToolCallsWithRetry(context, {}, { tools: [{ type: 'function', function: { name: 'inspect', parameters: { type: 'object' } } }], nativeRouteRef: routes[1] });
    const streaming = streamFirstPartyGeneration(context, 'orchestrator', { nativeRouteRef: routes[2] });
    for await (const _chunk of streaming.stream) { /* Drain. */ }
    await streaming.result;
    expect(requests.map(request => request.routeRef)).toEqual(routes);
});

test('Native role traffic cannot consult a poisoned legacy facade, preset or connection resolver', async () => {
    nativeSessionRuntime.snapshot = { session: { sessionId: 'session' }, revision: { revisionId: 'revision' } };
    const forbidden = () => { throw new Error('legacy authority touched'); };
    const context = { generateTask: forbidden, generateTaskStream: forbidden, getPresetManager: forbidden,
        connectionProfiles: { resolve: forbidden }, getRequestHeaders: () => ({}) };
    globalThis.Atria = { getContext: () => context };
    const requests = [];
    globalThis.fetch = jest.fn(async (_url, options) => {
        requests.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ response: { assistantText: 'done', toolCalls: [] }, snapshot: { runtimeRouteId: 'native-route' }, routing: { fallbackUsed: true, attempts: [{ retry: 0 }] } }) };
    });
    const router = createRuntimeRoleRouter({ executeGeneration: (role, request) => executeFirstPartyGeneration(context, role, request) });
    for (const role of ['narrator', 'intent_resolver', 'event_interpreter', 'orchestrator', 'studio']) {
        const result = await router.execute(role, { taskMessages: [{ role: 'user', content: role }], apiPresetName: 'poison', llmPresetName: 'poison' });
        expect(result).toMatchObject({ role, runtimeRouteId: 'native-route', fallbackUsed: true });
    }
    for (const role of ['memory', 'search']) await executeFirstPartyGeneration(context, role, {});
    const streamed = streamFirstPartyGeneration(context, 'orchestrator', {});
    for await (const _chunk of streamed.stream) { /* Drain before terminal result. */ }
    expect((await streamed.result).assistantText).toBe('done');
    expect(requests).toHaveLength(8);
    expect(requests.every(request => request.sessionId === 'session' && !Object.hasOwn(request, 'apiPresetName') && !Object.hasOwn(request, 'llmPresetName'))).toBe(true);
});

test('non-Native extensions keep their explicit legacy compatibility path', async () => {
    const context = { generateTask: jest.fn(async () => ({ assistantText: 'legacy' })) };
    expect((await executeFirstPartyGeneration(context, 'memory', { apiPresetName: 'old' })).assistantText).toBe('legacy');
    expect(context.generateTask).toHaveBeenCalledWith({ apiPresetName: 'old' });
});

test.each(['native_generation_route_missing', 'generation_capability_unsupported', 'generation_provider_failed'])('caller retry loops cannot replay %s after the Native host terminates', async code => {
    nativeSessionRuntime.snapshot = { session: { sessionId: 'session' }, revision: { revisionId: 'revision' } };
    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: code }) }));
    await expect(requestToolCallsWithRetry({}, { toolCallRetryMax: 5 }, {
        tools: [{ type: 'function', function: { name: 'inspect', parameters: { type: 'object' } } }],
    })).rejects.toMatchObject({ code });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
});
