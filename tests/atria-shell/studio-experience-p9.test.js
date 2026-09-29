/** @jest-environment jsdom */
import { describe, test, expect, jest } from '@jest/globals';
import { mountStudioPreviewUi } from '../../public/scripts/native/studio-preview-ui.js';
import { mountExperienceHealth } from '../../public/scripts/native/experience-health-ui.js';
import { presentationNegotiation } from '../../public/scripts/native/host-capabilities.js';
import { mountSharedSessionPanel } from '../../public/scripts/native/shared-session-ui.js';

const click = (root, label) => [...root.querySelectorAll('button')].find(node => node.textContent === label).click();
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
afterEach(() => { document.body.replaceChildren(); });

describe('P9 authoring and product surfaces', () => {
    test('Preview refuses legacy documents rather than invoking another renderer', () => {
        for (const schemaVersion of [1, 2]) expect(() => mountStudioPreviewUi(document, document.createElement('div'), { schemaVersion }, 'component')).toThrow(/compiled Native Frontend/);
    });





    test('capability negotiation describes required blocks and optional degradation without changing mode', () => {
        expect(presentationNegotiation({ host: [{ id: 'speech', required: false }, { id: 'fullscreen', required: true }] }, document, {})).toMatchObject([
            { status: 'degraded' }, { status: 'blocked' },
        ]);
    });
    test('Health never repairs on read; explicit preview and confirmation use the exact token', async () => {
        const root = document.createElement('div'); const runtime = { snapshot: { session: { sessionId: 's' }, manifest: {} }, open: jest.fn() };
        const report = { anchor: { revisionId: 'r' }, capabilities: [], diagnostics: [], repairKinds: ['retention.compact'], status: 'healthy' };
        const plan = { request: { kind: 'retention.compact', expectedRevisionId: 'r' }, token: 'exact', changes: { before: 1, after: 0 } };
        const request = jest.fn(async path => path === 'health/preview' ? plan : report);
        const controller = mountExperienceHealth({ document, root, runtime, request, invocationId: () => 'test-repair' }); await flush();
        expect(request.mock.calls.map(call => call[0])).toEqual(['health']);
        click(root, 'Preview retention repair'); await flush(); expect(root.textContent).toContain('Proposed changes');
        click(root, 'Confirm repair'); await flush();
        expect(request).toHaveBeenCalledWith('health/apply', expect.objectContaining({ repair: expect.objectContaining({ token: 'exact', confirmed: true }) }), expect.anything());
        controller.dispose();
    });
    test('disposed Health reads cannot render into a newer panel', async () => {
        const root = document.createElement('div'); let finish;
        const request = () => new Promise(resolve => { finish = resolve; });
        const controller = mountExperienceHealth({ document, root, runtime: { snapshot: { session: { sessionId: 's' } } }, request });
        controller.dispose(); root.textContent = 'next'; finish({}); await flush(); expect(root.textContent).toBe('next');
    });
    test('Shared connection forwards no private local runtime and disposes a late remote mount', async () => {
        const root = document.createElement('div'); let finish; const dispose = jest.fn();
        const mount = jest.fn(() => new Promise(resolve => { finish = resolve; }));
        const controller = mountSharedSessionPanel({ document, root, runtime: { snapshot: { session: { sessionId: 'private' }, states: { secret: 'private' } } }, mount });
        click(root, 'Connect'); expect(mount.mock.calls[0][0]).not.toHaveProperty('runtime'); expect(mount.mock.calls[0][0]).not.toHaveProperty('states');
        controller.dispose(); finish({ dispose }); await flush(); expect(dispose).toHaveBeenCalled();
    });
});
