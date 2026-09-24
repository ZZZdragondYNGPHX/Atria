/** @jest-environment jsdom */
import { test, expect, jest, afterEach } from '@jest/globals';
import { mountResourceBundleImport } from '../../public/scripts/native/resource-bundle-controls.js';
afterEach(() => { document.body.replaceChildren(); delete globalThis.fetch; });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function mount() {
    mountResourceBundleImport({ document, root: document.body, host: {} });
    const input = document.querySelector('input');
    return async (bundle, size = 1) => { Object.defineProperty(input, 'files', { configurable: true, value: [{ size, text: async () => JSON.stringify(bundle) }] }); input.dispatchEvent(new Event('change')); await tick(); };
}
test('bundle review ignores stale preflight and blocks conflicting targets', async () => {
    let resolveFirst;
    globalThis.fetch = jest.fn().mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; })).mockResolvedValueOnce({ ok: true, json: async () => ({ resources: [], existingOrigins: [], conflicts: [{ source: 'collision' }], canImport: false }) });
    const select = mount(); await select({ name: 'old' }); await select({ name: 'new' });
    resolveFirst({ ok: true, json: async () => ({ resources: [], existingOrigins: [], conflicts: [], canImport: true }) }); await tick();
    expect(document.body.textContent).toContain('destination conflicts');
    expect([...document.querySelectorAll('button')].some(node => node.textContent === 'Import into Library')).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
});
test('oversized and malformed files never reach preflight or import', async () => {
    globalThis.fetch = jest.fn(); const select = mount(); await select({}, 33 * 1024 * 1024);
    expect(fetch).not.toHaveBeenCalled(); expect(document.querySelector('[role="alert"]')).not.toBeNull();
    const input = document.querySelector('input'); Object.defineProperty(input, 'files', { value: [{ size: 1, text: async () => '{' }] }); input.dispatchEvent(new Event('change')); await tick();
    expect(fetch).not.toHaveBeenCalled();
});
