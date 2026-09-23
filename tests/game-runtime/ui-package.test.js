/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { loadGameComponentDefinition } from '../../public/scripts/extensions/game-runtime/ui/package.js';

function packageState(mode, options = {}) {
    return {
        sessionId: options.sessionId || 'session_ui',
        runtime: {
            experience: {
                mode,
                componentModelVersion: 1,
                component: options.component || 'ui/main.json',
                ...(options.selectors ? { selectors: options.selectors } : {}),
                surface: options.surface || 'app.root',
            },
        },
    };
}

function jsonFetch(payload) {
    return jest.fn(async (url, init) => {
        expect(url).toBe('/api/native/session/runtime/resource');
        expect(init.method).toBe('POST');
        return {
            ok: true,
            status: 200,
            async json() {
                return structuredClone(payload);
            },
        };
    });
}

function mountContext() {
    return {
        container: document.createElement('div'),
        selectors: {
            get: jest.fn(() => null),
            subscribe: jest.fn(() => jest.fn()),
        },
        actions: {
            dispatch: jest.fn(),
            simulate: jest.fn(),
        },
    };
}

describe('A4 Native Package Component Model', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    test('loads a Session-bound declarative Component Model and preserves semantic surface metadata', async () => {
        const fetchImpl = jsonFetch({
            id: 'hud',
            type: 'container',
            props: { className: 'hud-shell' },
            children: [
                { id: 'label', type: 'text', props: { text: 'Ready' } },
            ],
        });

        const definition = await loadGameComponentDefinition(
            packageState('component', { surface: 'chat.header' }),
            { document, fetchImpl },
        );

        expect(definition).toMatchObject({
            id: 'experience.component',
            mode: 'component',
            surface: 'chat.header',
            className: 'atria-experience-component',
            componentResource: 'ui/main.json',
        });
        expect(fetchImpl).toHaveBeenCalledWith(
            '/api/native/session/runtime/resource',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    sessionId: 'session_ui',
                    path: 'ui/main.json',
                }),
                cache: 'no-store',
            }),
        );

        const context = mountContext();
        const dispose = await definition.mount(context);
        expect(context.container.querySelector('[data-atria-component-id="hud"]')).not.toBeNull();
        expect(context.container.querySelector('[data-atria-component-id="label"]')?.textContent).toBe('Ready');
        expect(context.container.dataset.atriaGameDevice).toBeTruthy();
        dispose();
    });

    test('Component cannot claim Native slots', async () => {
        await expect(loadGameComponentDefinition(
            packageState('component'),
            {
                document,
                fetchImpl: jsonFetch({
                    id: 'root',
                    type: 'native-slot',
                    props: { component: 'conversation' },
                }),
            },
        )).rejects.toThrow(/cannot claim Native Conversation\/Composer slots/);
    });

    test('Hybrid and Full require app.root while sharing the same Component Model loader', async () => {
        for (const mode of ['hybrid', 'full']) {
            await expect(loadGameComponentDefinition(
                packageState(mode, { surface: 'sidebar.left' }),
                {
                    document,
                    fetchImpl: jsonFetch({ id: 'root', type: 'container' }),
                },
            )).rejects.toThrow(/requires the app.root surface/);

            const definition = await loadGameComponentDefinition(
                packageState(mode),
                {
                    document,
                    fetchImpl: jsonFetch({
                        id: 'root',
                        type: 'container',
                        children: [{
                            id: 'conversation',
                            type: 'native-slot',
                            props: { component: 'conversation' },
                        }],
                    }),
                },
            );
            expect(definition.mode).toBe(mode);
            expect(definition.surface).toBe('app.root');
        }
    });

    test('rejects script-style Component resources and does not expose arbitrary package JavaScript', async () => {
        await expect(loadGameComponentDefinition({
            sessionId: 'session_ui',
            runtime: {
                experience: {
                    mode: 'component',
                    componentModelVersion: 1,
                    component: 'ui/main.js',
                    surface: 'app.root',
                },
            },
        }, { document })).rejects.toThrow(/declarative \.json/);
    });
});
