/** @jest-environment jsdom */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { mountNativePlayControls } from '../../public/scripts/native/play-controls.js';

async function flush() {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
}

function response(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            return payload;
        },
    };
}

function findButton(root, label) {
    return [...root.querySelectorAll('button')].find(node => node.textContent === label);
}

describe('N9 Native Play product controls', () => {
    let runtime;
    let requests;

    beforeEach(() => {
        document.body.innerHTML = '<div id="root"><main id="sheld"></main></div>';
        requests = [];
        runtime = {
            active: false,
            history: false,
            failed: false,
            snapshot: null,
            currentContextPlan: jest.fn(() => ({
                revisionId: 'rev_22222222222222222222222222222222',
                included: [{ contextItemId: 'ctx_1', lane: 'recent_raw' }],
                rejected: [{ contextItemId: 'ctx_2', reason: 'budget' }],
            })),
            restoreSavePoint: jest.fn(async () => {}),
        };
        globalThis.Atria = {
            getContext: () => ({
                getRequestHeaders: () => ({ 'X-CSRF-Token': 'test' }),
            }),
            nativeSessionRuntime: runtime,
            openNativeSession: jest.fn(async () => {}),
            retryNativeReply: jest.fn(async () => {}),
            reenterNativeTurn: jest.fn(async () => {}),
            restartNativeFrom: jest.fn(async () => {}),
            shell: {
                getWorkspaceHost: () => ({
                    openLibrarySection: jest.fn(),
                    openLibraryWork: jest.fn(),
                }),
            },
        };
        globalThis.fetch = jest.fn(async (url, options = {}) => {
            const path = String(url);
            requests.push({ path, method: options.method || 'GET', body: options.body });
            if (path === '/api/native/product/sessions') return response([]);
            if (path === '/api/native/product/works') return response([]);
            if (path === '/api/native/product/sessions/session_11111111111111111111111111111111') {
                return response({
                    snapshot: {
                        session: { sessionId: 'session_11111111111111111111111111111111' },
                        revision: { revisionId: 'rev_22222222222222222222222222222222' },
                        timeline: [
                            { messageId: 'msg_1', role: 'assistant', content: 'Opening' },
                            { messageId: 'msg_2', role: 'user', content: 'Question' },
                            { messageId: 'msg_3', role: 'assistant', content: 'Answer' },
                        ],
                        knowledge: {
                            bindings: [{
                                knowledgeBindingId: 'kbinding_33333333333333333333333333333333',
                                source: { kind: 'session' },
                            }],
                        },
                    },
                    saves: [{
                        saveId: 'save_44444444444444444444444444444444',
                        kind: 'quick',
                        createdAt: 10,
                    }],
                    branches: [{ branchId: 'branch_1' }],
                    revisions: [{ revisionId: 'rev_1' }],
                });
            }
            if (path.endsWith('/save') && (options.method || 'GET') === 'POST') {
                return response({ saveId: 'save_new' });
            }
            if (path.endsWith('/promote-knowledge')) {
                return response({ knowledgeBaseId: 'kb_promoted' });
            }
            throw new Error('Unexpected fetch ' + path);
        });
    });

    afterEach(() => {
        delete document.body.dataset.atriaNativeSessionActive;
        delete globalThis.Atria;
        delete globalThis.fetch;
    });

    test('empty Play shows Native landing instead of the legacy empty chat host', async () => {
        const root = document.getElementById('root');
        const sheld = document.getElementById('sheld');
        const controls = mountNativePlayControls({ document, root });
        await flush();

        expect(controls.landing.hidden).toBe(false);
        expect(controls.root.hidden).toBe(true);
        expect(sheld.style.display).toBe('none');
        expect(controls.landing.textContent).toContain('Continue a Native game');
        expect(requests.map(item => item.path)).toEqual(expect.arrayContaining([
            '/api/native/product/sessions',
            '/api/native/product/works',
        ]));

        controls.dispose();
        expect(sheld.style.display).toBe('');
    });

    test('active Native Session exposes product actions, Timeline and Context diagnostics', async () => {
        const root = document.getElementById('root');
        const sheld = document.getElementById('sheld');
        const controls = mountNativePlayControls({ document, root });
        await flush();

        runtime.active = true;
        runtime.snapshot = {
            session: { sessionId: 'session_11111111111111111111111111111111' },
            revision: { revisionId: 'rev_22222222222222222222222222222222' },
            timeline: [
                { messageId: 'msg_1', role: 'assistant', content: 'Opening' },
                { messageId: 'msg_2', role: 'user', content: 'Question' },
                { messageId: 'msg_3', role: 'assistant', content: 'Answer' },
            ],
        };
        document.body.dataset.atriaNativeSessionActive = 'true';
        await flush();

        expect(controls.root.hidden).toBe(false);
        expect(controls.landing.hidden).toBe(true);
        expect(sheld.style.display).toBe('');
        for (const label of [
            'Retry Reply',
            'Re-enter Turn',
            'Restart From Here',
            'Save',
            'Quick Save',
            'Load',
            'Timeline',
            'Context',
        ]) {
            expect(findButton(controls.root, label)).toBeTruthy();
        }

        findButton(controls.root, 'Re-enter Turn').click();
        await flush();
        expect(globalThis.Atria.reenterNativeTurn).toHaveBeenCalledWith(1);

        findButton(controls.root, 'Quick Save').click();
        await flush();
        expect(requests.some(item => (
            item.path.endsWith('/sessions/session_11111111111111111111111111111111/save')
            && item.method === 'POST'
        ))).toBe(true);

        findButton(controls.root, 'Context').click();
        expect(controls.drawer.hidden).toBe(false);
        expect(controls.drawer.querySelector('[data-atria-context-plan="true"]').textContent)
            .toContain('"reason": "budget"');

        findButton(controls.root, 'Timeline').click();
        await flush();
        expect(controls.drawer.querySelectorAll('[data-atria-timeline-message-id]')).toHaveLength(3);
        expect(controls.drawer.querySelector('[data-atria-save-id]')).not.toBeNull();
        expect(controls.drawer.querySelector('[data-atria-embedded-knowledge]')).not.toBeNull();
        expect(findButton(controls.drawer, 'Save to my Library')).toBeTruthy();
        expect(findButton(controls.drawer, 'Restart From Here')).toBeTruthy();

        controls.dispose();
    });
});
