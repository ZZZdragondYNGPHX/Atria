/** @jest-environment jsdom */
import { afterEach, expect, jest, test } from '@jest/globals';
import { mountRuntimeRoutePicker } from '../../public/scripts/native/runtime-route-picker.js';
import { normalizeRuntimeRouteRef } from '../../public/scripts/native/runtime-route-ref.js';
const first = 'route_' + '1'.repeat(32); const second = 'route_' + '2'.repeat(32);
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
afterEach(() => { delete globalThis.fetch; document.body.replaceChildren(); });

test('route picker filters role, retains unavailable selection and recovers without silently replacing it', async () => {
    let fail = true;
    globalThis.fetch = jest.fn(async () => ({ ok: !fail, json: async () => ({ routes: [
        { runtimeRouteId: first, displayName: 'Writer', role: 'role.orchestrator' },
        { runtimeRouteId: second, displayName: 'Memory', role: 'role.memory' },
    ] }) }));
    const change = jest.fn();
    mountRuntimeRoutePicker({ parent: document.body, role: 'orchestrator', value: { scope: 'player', runtimeRouteId: second }, change });
    await flush(); expect(document.querySelector('select').disabled).toBe(true);
    fail = false; document.querySelector('button').click(); await flush();
    const select = document.querySelector('select');
    expect(select.value).toBe(second); expect(select.textContent).not.toContain('Memory');
    expect(select.textContent).toContain('Unavailable route'); expect(change).not.toHaveBeenCalled();
    select.value = first; select.dispatchEvent(new Event('change'));
    expect(change).toHaveBeenLastCalledWith({ scope: 'player', runtimeRouteId: first });
    select.value = ''; select.dispatchEvent(new Event('change')); expect(change).toHaveBeenLastCalledWith(undefined);
});

test('route refs reject name lookup, cross-scope data and embedded credentials', () => {
    for (const value of [{ scope: 'player', name: 'latest' }, { scope: 'package', runtimeRouteId: first }, { scope: 'player', runtimeRouteId: first, secret: 'hidden' }]) {
        expect(() => normalizeRuntimeRouteRef(value)).toThrow('exact player Runtime Route');
    }
});
