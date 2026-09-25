/** @jest-environment jsdom */
import { test, expect, jest, afterEach } from '@jest/globals';
import { matchesSavePackage, mountSaveDependencyRecovery } from '../../public/scripts/native/save-dependency-recovery.js';
afterEach(() => { document.body.replaceChildren(); delete globalThis.fetch; });
test('recovery requires exact package identity, version and hash rather than names', () => {
    const required = { packageId: 'pkg_a', packageVersionId: 'pkgv_a', packageVersion: '1.0.0', packageContentHash: 'hash' }, candidate = { ...required, version: required.packageVersion, name: 'Any name' };
    expect(matchesSavePackage(required, candidate)).toBe(true);
    for (const key of ['packageId', 'packageVersionId', 'version', 'packageContentHash']) expect(matchesSavePackage(required, { ...candidate, [key]: 'different' })).toBe(false);
});
test('retry rechecks the same Save and only advances when the exact dependency is ready', async () => {
    const ready = jest.fn(); globalThis.fetch = jest.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ dependency: { status: 'missing' } }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ dependency: { status: 'ready' } }) });
    mountSaveDependencyRecovery({ document, root: document.body, preflight: { dependency: { required: { packageId: 'pkg_a' } } }, saveData: 'original-save-bytes', host: {}, onReady: ready });
    const button = [...document.querySelectorAll('button')].find(item => item.textContent === 'Check installed dependency again');
    button.click(); await new Promise(resolve => setTimeout(resolve, 0)); expect(ready).not.toHaveBeenCalled(); expect(document.querySelector('[role="alert"]').textContent).toContain('still unavailable');
    button.click(); await new Promise(resolve => setTimeout(resolve, 0)); expect(ready).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[1][1].body).data).toBe('original-save-bytes');
});
