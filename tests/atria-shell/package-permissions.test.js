/** @jest-environment jsdom */
import { test, expect, jest, afterEach } from '@jest/globals';
import { mountWorkPermissions, renderPackageUpdateReview, permissionRow } from '../../public/scripts/native/package-permissions.js';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
afterEach(() => { document.body.replaceChildren(); delete globalThis.fetch; });
test('permission review distinguishes installation consent from optional declarations and keeps reasons inert', () => {
    permissionRow(document, document.body, { permission: 'network', required: true, reason: '<script>bad()</script>' }, { installed: true });
    permissionRow(document, document.body, { permission: 'clipboard', required: false }, { installed: true });
    expect(document.body.textContent).toContain('Accepted at installation'); expect(document.body.textContent).toContain('No separate grant recorded');
    expect(document.querySelector('script')).toBeNull(); expect(document.querySelector('input')).toBeNull();
    renderPackageUpdateReview(document, document.body, { version: '2.0.0', update: { previous: { version: '1.0.0' }, comparisonAvailable: false, pinnedSessions: [{ sessionId: 'session_a' }] } });
    expect(document.body.textContent).toContain('1.0.0 → 2.0.0'); expect(document.body.textContent).toContain('unavailable for comparison'); expect(document.body.textContent).toContain('1 existing Sessions');
});
test('changing permission versions ignores late results and exposes the existing uninstall flow', async () => {
    let resolveFirst; const manage = jest.fn();
    globalThis.fetch = jest.fn().mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; })).mockResolvedValueOnce({ ok: true, json: async () => ({ manifest: { permissions: [] }, packageVersion: { version: '2.0.0' } }) });
    mountWorkPermissions({ document, root: document.body, work: { package: { packageId: 'pkg_a', currentVersionId: 'pkgv_a' }, versions: [{ packageVersionId: 'pkgv_a', version: '1.0.0' }, { packageVersionId: 'pkgv_b', version: '2.0.0' }] }, onManage: manage });
    [...document.querySelectorAll('button')].find(item => item.textContent === 'Review permissions').click(); await tick();
    const picker = document.querySelector('select'); picker.value = 'pkgv_b'; picker.dispatchEvent(new Event('change')); await tick();
    resolveFirst({ ok: true, json: async () => ({ manifest: { permissions: [{ permission: 'network', required: true }] }, packageVersion: {} }) }); await tick();
    expect(document.body.textContent).toContain('declares no permissions'); expect(document.body.textContent).not.toContain('Network access');
    [...document.querySelectorAll('button')].find(item => item.textContent === 'Manage uninstall and dependent Sessions').click(); await tick(); expect(manage).toHaveBeenCalledTimes(1);
});
