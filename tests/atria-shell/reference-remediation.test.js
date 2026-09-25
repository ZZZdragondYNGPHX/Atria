/** @jest-environment jsdom */
import { test, expect, jest, afterEach } from '@jest/globals';
import { renderReferenceRemediation } from '../../public/scripts/native/reference-remediation.js';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
afterEach(() => { document.body.replaceChildren(); delete globalThis.fetch; });
test('Runtime blockers open the exact editor without an unnecessary graph request', async () => {
    const host = { openRuntimeSection: jest.fn() }; globalThis.fetch = jest.fn();
    await renderReferenceRemediation({ document, root: document.body, host, error: { details: { usedBy: [{ section: 'models', id: 'model_a', displayName: 'My model' }] } } });
    expect(document.body.textContent).toContain('My model'); document.querySelector('button').click(); await tick();
    expect(host.openRuntimeSection).toHaveBeenCalledWith('models', 'model_a'); expect(fetch).not.toHaveBeenCalled();
});
test('reference lookup retries locally and opens the Project owner through Build', async () => {
    const host = { openBuild: jest.fn() }, error = { details: { references: [{ projectId: 'project_a' }] } };
    globalThis.fetch = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true, json: async () => ({ nodes: [{ key: 'p', scope: 'project/project_a', resourceType: 'core.project', resourceId: 'project_a', displayName: 'Harbor project', projectId: 'project_a' }] }) });
    await renderReferenceRemediation({ document, root: document.body, host, error });
    expect(document.body.textContent).toContain('Some reference names');
    [...document.querySelectorAll('button')].find(b => b.textContent === 'Retry reference lookup').click(); await tick(); await tick();
    expect(document.body.textContent).toContain('Harbor project'); expect(document.body.textContent).toContain('Review and Apply');
    [...document.querySelectorAll('button')].find(b => b.textContent === 'Open owner').click(); await tick();
    expect(host.openBuild).toHaveBeenCalledWith('project_a', undefined);
});
test('Session blockers reveal an existing Session management row and preserve its progress', async () => {
    document.body.innerHTML = '<article data-atria-session-id="session_a"><details><summary>Manage</summary></details></article>';
    globalThis.fetch = jest.fn(async url => ({ ok: true, json: async () => url.includes('graph') ? { nodes: [] } : [{ sessionId: 'session_a', packageId: 'pkg_a', displayTitle: 'Harbor journey' }] }));
    await renderReferenceRemediation({ document, root: document.body, host: {}, error: { details: { references: [{ sessionId: 'session_a' }] } } });
    expect(document.body.textContent).toContain('Harbor journey');
    [...document.querySelectorAll('button')].find(b => b.textContent === 'Manage Session in Library').click(); await tick();
    expect(document.querySelector('article details').open).toBe(true); expect(fetch.mock.calls.every(([, options]) => !options.method || options.method === 'GET')).toBe(true);
});
