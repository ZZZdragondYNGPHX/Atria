/** @jest-environment jsdom */
import { afterEach, expect, jest, test } from '@jest/globals';
import { mountNativeWorksWorkspace } from '../../public/scripts/native/library-workspaces.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const reply = data => ({ ok: true, json: async () => data });
const button = label => [...document.querySelectorAll('button')].find(item => item.textContent === label);
async function file(input, name = 'work.atria', size = 10) {
    Object.defineProperty(input, 'files', { configurable: true, value: [{ name, size, arrayBuffer: async () => new Uint8Array([1, 2]).buffer }] });
    input.dispatchEvent(new Event('change')); await flush();
}
afterEach(() => { document.body.replaceChildren(); delete globalThis.fetch; delete globalThis.Atria; });

test('install is a full page and its receipt survives failed opening without a second write', async () => {
    let finish;
    const installed = jest.fn(() => new Promise(resolve => { finish = resolve; }));
    const host = { openLibrarySection: jest.fn(), openLibraryWork: jest.fn(() => { throw new Error('Read failed'); }) };
    globalThis.fetch = jest.fn((path, options) => {
        if (path.endsWith('/preflight')) return Promise.resolve(reply({ packageId: 'pkg', packageVersionId: 'old-exact', name: 'Story', version: '1', requiredPermissions: [], permissions: [] }));
        if (path.endsWith('/install')) return installed(JSON.parse(options.body));
        throw new Error('Unexpected read');
    });
    const controller = mountNativeWorksWorkspace({ document, body: document.body, route: { child: { id: 'install' } }, host });
    expect(document.querySelector('[data-atria-native-install]').tagName).toBe('SECTION');
    await file(document.querySelector('input[type=file]'));
    button('Install / Update').click(); button('Install / Update').click();
    expect(installed).toHaveBeenCalledTimes(1);
    expect(installed.mock.calls[0][0]).toMatchObject({ baseVersionId: null });
    finish(reply({ package: { packageId: 'pkg' } })); await flush();
    expect(document.body.textContent).toContain('Work installed.');
    expect(document.body.textContent).toContain('old-exact');
    button('Open Work').click(); await flush();
    expect(document.querySelector('[role=alert]').textContent).toContain('Read failed');
    expect(button('Install / Update')).toBeUndefined();
    button('Open Work').click(); await flush();
    expect(installed).toHaveBeenCalledTimes(1); controller.dispose();
});

test('save import retains password on failure, rechecks dependencies, and opens only the imported Session', async () => {
    let attempts = 0;
    globalThis.fetch = jest.fn(async (path, options) => {
        if (path.endsWith('/preflight')) return reply({ dependency: { status: 'ready', required: { packageId: 'pkg' } } });
        if (path.endsWith('/import')) {
            attempts++;
            if (attempts === 1) return { ok: false, status: 400, json: async () => ({ error: 'native_product_invalid_request' }) };
            expect(JSON.parse(options.body).password).toBe('corrected');
            return reply({ session: { sessionId: 'imported-exact' } });
        }
        throw new Error('Unexpected path');
    });
    const openNativeSession = jest.fn().mockRejectedValueOnce(new Error('Open failed')).mockResolvedValueOnce({});
    globalThis.Atria = { openNativeSession };
    const host = { openPlay: jest.fn(), openLibrarySection: jest.fn() };
    const controller = mountNativeWorksWorkspace({ document, body: document.body, route: { child: { id: 'import-save' } }, host });
    await file(document.querySelector('input[type=file]'), 'story.atriasave');
    const password = document.querySelector('input[type=password]'); password.value = 'wrong';
    button('Import Save').click(); await flush();
    expect(password.value).toBe('wrong'); expect(button('Import Save').disabled).toBe(false);
    password.value = 'corrected'; button('Import Save').click(); await flush();
    expect(document.body.textContent).toContain('Save imported.');
    button('Open Session').click(); await flush(); button('Open Session').click(); await flush();
    expect(openNativeSession.mock.calls).toEqual([['imported-exact'], ['imported-exact']]);
    expect(attempts).toBe(2);
    expect(fetch.mock.calls.filter(([path]) => path.endsWith('/preflight'))).toHaveLength(3);
    controller.dispose();
});

test('oversized files are rejected before reading and cancelled preflights cannot paint a newer route', async () => {
    let finish;
    globalThis.fetch = jest.fn(() => new Promise(resolve => { finish = resolve; }));
    const host = { openLibrarySection: jest.fn() };
    const controller = mountNativeWorksWorkspace({ document, body: document.body, route: { child: { id: 'install' } }, host });
    const input = document.querySelector('input[type=file]');
    await file(input, 'large.atria', 129 * 1024 * 1024);
    expect(fetch).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('exceeds');
    await file(input);
    controller.updateRoute({ child: { id: 'import-save' } });
    finish(reply({ packageId: 'stale', requiredPermissions: [] })); await flush();
    expect(document.querySelector('[data-atria-package-preflight]')).toBeNull();
    expect(document.querySelector('[data-atria-native-save-import]')).not.toBeNull(); controller.dispose();
});
