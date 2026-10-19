/** @jest-environment jsdom */
import { afterEach, expect, jest, test } from '@jest/globals';
import { mountVisualAuthoring } from '../../public/scripts/native/visual-authoring.js';
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const button = text => [...document.querySelectorAll('button')].find(node => node.textContent === text);
const field = label => document.querySelector(`[aria-label="${label}"]`);
const input = (label, value) => { const node = field(label); node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })); };
let ui;
afterEach(() => { ui?.dispose(); document.body.replaceChildren(); });
function fixture(override = () => undefined) {
    const target = { scope: 'library', resourceType: 'core.image-target', resourceId: 'target', revision: 'v1' };
    const preview = { prepareId: 'prepared', sent: false, prompt: 'Final prompt', target: { name: 'Local', model: 'image-model' }, cost: { kind: 'free' }, constraints: { omitted: [] }, targetFingerprint: 'fingerprint', requestHash: 'request' };
    const request = jest.fn(async (path, options) => {
        const result = override(path, options); if (result !== undefined) return result;
        if (path === '/visual/configuration') return { targets: [], renderings: [], budget: { value: {} } };
        if (path === '/configuration') return { connections: [] };
        if (path === '/resources') return [{ ref: target, resource: { displayName: 'Target v1' } }];
        if (path === '/authoring/images/prepare') return preview;
        if (path === '/illustration-images') return { operationId: 'job' };
        return [];
    });
    ui = mountVisualAuthoring({ document, body: document.body, host: {}, request });
    return { request, target };
}
test('independent authoring sends only after preview and explicit approval and retains the submission receipt if refreshing fails', async () => {
    let submitted = false;
    const { request, target } = fixture(path => {
        if (path === '/illustration-images') { submitted = true; return { operationId: 'job' }; }
        if (path.startsWith('/authoring/images?') && submitted) return Promise.reject(new Error('Gallery unavailable'));
    });
    await flush(); input('Image prompt', 'A Chinese ink garden'); field('Exact image target').value = JSON.stringify(target); field('Exact image target').dispatchEvent(new Event('change'));
    button('Preview image request').click(); await flush();
    expect(request.mock.calls.some(([path]) => path === '/illustration-images')).toBe(false);
    expect(request.mock.calls.find(([path]) => path === '/authoring/images/prepare')[1].body).toEqual({ title: '', prompt: 'A Chinese ink garden', imageTargetRef: target });
    button('Approve generation').click(); await flush();
    expect(request.mock.calls.find(([path]) => path === '/illustration-images')[1].body.prepareId).toBe('prepared');
    expect(document.body.textContent).toContain('Image task submitted.'); expect(document.body.textContent).toContain('Gallery unavailable');
    expect(button('Approve generation')).toBeUndefined();
});
test('editing during preparation discards the old preview and never exposes approval for stale text', async () => {
    let finish;
    const { target } = fixture(path => path === '/authoring/images/prepare' ? new Promise(resolve => { finish = resolve; }) : undefined);
    await flush(); input('Image prompt', 'Earlier prompt'); field('Exact image target').value = JSON.stringify(target); field('Exact image target').dispatchEvent(new Event('change'));
    button('Preview image request').click(); input('Image prompt', 'New prompt');
    finish({ prepareId: 'stale' }); await flush(); expect(button('Approve generation')).toBeUndefined(); expect(field('Image prompt').value).toBe('New prompt');
});
test('published images use original owner assets and archive only on explicit action', async () => {
    let archived = false;
    const row = { operation: { operationId: 'job', status: 'completed', createdAt: 0, cost: { state: 'unknown' } }, image: { title: 'Garden', prompt: 'Ink garden', imageVersionId: 'version', ref: { assetId: 'asset', contentHash: 'hash' }, width: 100, height: 100 } };
    const { request } = fixture((path, options) => {
        if (path.startsWith('/authoring/images?')) return archived ? [] : [row];
        if (path === '/authoring/images/archive') { archived = options.body.archived; return row; }
    });
    await flush(); expect(document.querySelector('img').getAttribute('src')).toBe('/api/native/session/asset/asset?contentHash=hash');
    expect(document.querySelector('a[download]').href).toContain('/api/native/session/asset/asset?contentHash=hash');
    button('Archive image').click(); await flush();
    expect(request.mock.calls.find(([path]) => path === '/authoring/images/archive')[1].body).toEqual({ operationId: 'job', archived: true });
    expect(document.body.textContent).toContain('Image archived.'); expect(document.querySelector('img')).toBeNull();
});
