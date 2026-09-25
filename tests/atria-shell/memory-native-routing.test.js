/** @jest-environment jsdom */
import { afterEach, expect, jest, test } from '@jest/globals';
import { MEMORY_ROUTE_TASKS, memoryRouteOptions, normalizeMemoryRoutes } from '../../public/scripts/agents/memory/native-routing.js';
import { mountMemoryRouting } from '../../public/scripts/agents/memory/native-routing-ui.js';
import { nativeSessionRuntime } from '../../public/scripts/native/session-runtime.js';
import { requestToolCallsWithRetry } from '../../public/scripts/lib/iter-tool-calling.js';

const ref = index => ({ scope: 'player', runtimeRouteId: 'route_' + String(index).repeat(32) });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
afterEach(() => { nativeSessionRuntime.snapshot = null; delete globalThis.fetch; document.body.replaceChildren(); });

test('Memory tasks use independent exact routes and the shared schema runner sends the memory role', async () => {
    const nativeRoutes = Object.fromEntries(Object.keys(MEMORY_ROUTE_TASKS).map((task, index) => [task, ref(index + 1)]));
    expect(normalizeMemoryRoutes(nativeRoutes)).toEqual(nativeRoutes);
    expect(memoryRouteOptions({}, 'recall')).toEqual({ nativeRole: 'memory' });
    expect(() => normalizeMemoryRoutes({ unknown: ref(1) })).toThrow('Invalid Memory');
    expect(() => normalizeMemoryRoutes({ schema: { scope: 'package', runtimeRouteId: ref(1).runtimeRouteId } })).toThrow('exact player');
    nativeSessionRuntime.snapshot = { session: { sessionId: 'session' }, revision: { revisionId: 'revision' } };
    const requests = [];
    globalThis.fetch = jest.fn(async (_url, options) => {
        requests.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ response: { assistantText: '', toolCalls: [{ id: 'call', name: 'inspect', args: {}, raw: { type: 'function', function: { name: 'inspect', arguments: '{}' } } }] }, snapshot: {}, routing: {} }) };
    });
    for (const task of Object.keys(MEMORY_ROUTE_TASKS)) await requestToolCallsWithRetry({}, {}, {
        ...memoryRouteOptions({ nativeRoutes }, task), tools: [{ type: 'function', function: { name: 'inspect', parameters: {} } }], allowNoToolCalls: true,
    });
    expect(requests.map(request => request.routeRef)).toEqual(Object.values(nativeRoutes));
    expect(requests.every(request => request.role === 'memory')).toBe(true);
});

test('Memory routing save errors preserve selected task routes for retry', async () => {
    globalThis.fetch = jest.fn(async url => ({ ok: true, json: async () => url.endsWith('/retrieval') ? [] : ({ routes: [{ runtimeRouteId: ref(1).runtimeRouteId, role: 'role.memory', displayName: 'Memory model' }] }) }));
    let fail = true;
    const service = { getNativeRetrieval: () => ({}), setNativeRetrieval: jest.fn(), getNativeRoutes: () => ({}), setNativeRoutes: jest.fn(async () => { if (fail) throw new Error('offline'); }) };
    mountMemoryRouting(document.body, service); await flush();
    const select = document.querySelector('[aria-label="Schema assistance route"]');
    select.value = ref(1).runtimeRouteId; select.dispatchEvent(new Event('change'));
    const submit = () => select.closest('form').dispatchEvent(new Event('submit', { cancelable: true }));
    submit(); await flush();
    expect(document.activeElement.textContent).toContain('Your selections are still here');
    expect(select.value).toBe(ref(1).runtimeRouteId);
    fail = false; submit(); await flush();
    expect(service.setNativeRoutes).toHaveBeenLastCalledWith({ schema: ref(1) });
    expect(document.body.textContent).toContain('Memory routes saved');
});
