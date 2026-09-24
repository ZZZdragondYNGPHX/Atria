/** @jest-environment jsdom */
import { afterEach, expect, jest, test } from '@jest/globals';
import { action, heading } from '../../public/scripts/native/library-ui.js';
import { mountNativeWorksWorkspace } from '../../public/scripts/native/library-workspaces.js';
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
afterEach(() => { document.body.replaceChildren(); delete globalThis.fetch; delete globalThis.__i18n; });

test('pending action prevents duplicate writes, restores focus after dismissal and focuses errors', async () => {
    let finish;
    const handler = jest.fn(() => new Promise(resolve => { finish = resolve; }));
    const button = action(document, document.body, 'Delete', handler);
    button.focus(); button.click(); button.click();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    button.blur(); finish(); await flush();
    expect(document.activeElement).toBe(button);
    handler.mockRejectedValueOnce(new Error('Save refused'));
    button.click(); await flush();
    expect(document.activeElement.getAttribute('role')).toBe('alert');
    expect(document.activeElement.textContent).toBe('Save refused');
    expect(button.disabled).toBe(false);
});

test('late list responses cannot replace a newer Work detail or disposed surface', async () => {
    let finishList;
    globalThis.fetch = jest.fn(path => {
        let payload;
        if (path.endsWith('/works')) return new Promise(resolve => { finishList = () => resolve({ ok: true, json: async () => [] }); });
        if (path.endsWith('/sessions')) payload = [];
        else payload = { package: { displayName: 'Current story' }, manifest: { entryPoints: [] }, versions: [], sessions: [], status: 'ready' };
        return Promise.resolve({ ok: true, json: async () => payload });
    });
    const controller = mountNativeWorksWorkspace({ document, body: document.body, route: { child: { id: 'works' } }, host: {} });
    controller.updateRoute({ child: { id: 'work:current' } }); await flush();
    expect(document.querySelector('[data-atria-work-detail]').textContent).toContain('Current story');
    finishList(); await flush();
    expect(document.querySelector('[data-atria-native-works]')).toBeNull();
    controller.updateRoute({ child: { id: 'works' } }); controller.dispose();
    document.body.textContent = 'Next workspace'; finishList(); await flush();
    expect(document.body.textContent).toBe('Next workspace');
});

test('authored resource names and prose are literal even when they match a UI translation key', () => {
    globalThis.__i18n = { translate: () => 'TRANSLATED' };
    heading(document, document.body, 'Works', 'Saved', true);
    expect(document.querySelector('h2').textContent).toBe('Works');
    expect(document.querySelector('p').textContent).toBe('Saved');
});
