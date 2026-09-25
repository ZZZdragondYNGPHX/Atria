/** @jest-environment jsdom */
import { test, expect, jest, afterEach } from '@jest/globals';
import { mountPromptRuntimeControls } from '../../public/scripts/native/prompt-runtime-controls.js';
import { mountPromptParameters } from '../../public/scripts/native/prompt-semantics.js';

afterEach(() => { delete globalThis.fetch; document.body.replaceChildren(); });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const input = label => document.querySelector(`[aria-label="${label}"]`);
const button = label => [...document.querySelectorAll('button')].find(item => item.textContent === label);
const definitions = { grounded: { type: 'boolean', label: 'Grounding', default: true },
    mode: { type: 'string', label: 'Style', default: 'calm', options: [{ value: 'calm', label: 'Calm prose' }, { value: 'fast', label: 'Quick prose' }] } };

test('authoring preserves human labels and exclusive options without JSON editing', () => {
    const read = mountPromptParameters(document, document.body, definitions);
    expect(read()).toEqual(Object.fromEntries(Object.entries(definitions).map(([key, value]) => [key, { ...value, required: false }])));
    const option = document.querySelector('[aria-label="Option label"]'); option.value = 'Quiet prose';
    expect(read().mode.options[0].label).toBe('Quiet prose');
});

test('runtime controls save typed route overrides, reload them and reset without authoring writes', async () => {
    let route = { runtimeRouteId: 'route_1', promptParameters: {} };
    globalThis.fetch = jest.fn(async (url, options) => {
        if (options.method === 'PUT') route = { ...route, promptParameters: JSON.parse(options.body).parameters };
        return { ok: true, json: async () => options.method === 'PUT' ? route : { route, definitions } };
    });
    await mountPromptRuntimeControls({ document, root: document.body, routeId: route.runtimeRouteId });
    const overrides = document.querySelectorAll('[aria-label="Override default"]');
    expect(input('Grounding').checked).toBe(true); expect(input('Style').disabled).toBe(true);
    for (const control of overrides) { control.checked = true; control.dispatchEvent(new Event('change')); }
    input('Grounding').checked = false; input('Style').value = '1';
    button('Save Prompt choices').click(); await tick();
    expect(route.promptParameters).toEqual({ grounded: false, mode: 'fast' });
    document.body.replaceChildren(); await mountPromptRuntimeControls({ document, root: document.body, routeId: route.runtimeRouteId });
    expect(input('Grounding').checked).toBe(false); expect(input('Style').value).toBe('1');
    button('Restore Prompt defaults').click(); await tick();
    expect(route.promptParameters).toEqual({}); expect(input('Grounding').checked).toBe(true);
    expect(globalThis.fetch.mock.calls.every(([url]) => url.includes('/prompt-controls/'))).toBe(true);
});

test('stale choices are visible; failed saves retain the current draft', async () => {
    globalThis.fetch = jest.fn(async (url, options) => ({ ok: options.method !== 'PUT', json: async () => options.method === 'PUT'
        ? { error: 'native_prompt_controls_conflict' } : { route: { promptParameters: { mode: 'gone' } }, definitions } }));
    await mountPromptRuntimeControls({ document, root: document.body, routeId: 'route_1' });
    expect(document.querySelector('[role="alert"]').textContent).toContain('no longer valid');
    input('Style').value = '1'; button('Save Prompt choices').click(); await tick();
    expect(input('Style').value).toBe('1'); expect(document.body.textContent).toContain('Could not save');
});
