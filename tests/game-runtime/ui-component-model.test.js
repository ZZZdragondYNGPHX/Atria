/** @jest-environment jsdom */

import { describe, expect, test } from '@jest/globals';

import {
    applyResponsiveComponentVisibility,
    compileExperienceComponentModel,
    renderExperienceComponentModel,
    setComponentHiddenReason,
} from '../../public/scripts/extensions/game-runtime/ui/component-model.js';

describe('A4 shared Component Model', () => {
    test('compiles and renders the shared structured model', () => {
        const compiled = compileExperienceComponentModel({
            id: 'root',
            type: 'container',
            props: { className: 'hud', role: 'region', ariaLabel: 'HUD' },
            children: [
                {
                    id: 'hp',
                    type: 'text',
                    bindings: { text: 'player.hp' },
                    visibility: { selector: 'player.ready', when: 'truthy' },
                    responsive: { devices: ['desktop', 'tablet'] },
                },
                {
                    id: 'heal',
                    type: 'button',
                    props: { text: 'Heal' },
                    actions: {
                        click: {
                            commandId: 'heal',
                            mode: 'dispatch',
                            args: { amount: 5 },
                        },
                    },
                },
            ],
        }, { mode: 'component' });

        expect(compiled.nodeCount).toBe(3);
        expect(compiled.usesNativeComponents).toBe(false);

        const root = renderExperienceComponentModel(document, compiled);
        expect(root.dataset.atriaComponentId).toBe('root');
        expect(root.className).toBe('hud');
        expect(root.getAttribute('role')).toBe('region');
        expect(root.getAttribute('aria-label')).toBe('HUD');

        const hp = root.querySelector('[data-atria-component-id="hp"]');
        expect(hp.getAttribute('data-atria-bind-text')).toBe('player.hp');
        expect(hp.dataset.atriaVisibleSelector).toBe('player.ready');
        expect(hp.dataset.atriaResponsiveDevices).toBe('desktop,tablet');

        const heal = root.querySelector('[data-atria-component-id="heal"]');
        expect(heal.tagName).toBe('BUTTON');
        expect(heal.dataset.atriaCommand).toBe('heal');
        expect(JSON.parse(heal.dataset.atriaCommandArgs)).toEqual({ amount: 5 });
    });

    test('Component rejects Native slots while Hybrid and Full share the same node model', () => {
        const raw = {
            id: 'root',
            type: 'container',
            children: [
                {
                    id: 'conversation',
                    type: 'native-slot',
                    props: { component: 'conversation' },
                },
                {
                    id: 'composer',
                    type: 'native-slot',
                    props: { component: 'composer' },
                },
            ],
        };

        expect(() => compileExperienceComponentModel(raw, { mode: 'component' }))
            .toThrow(/cannot claim Native Conversation\/Composer slots/);

        for (const mode of ['hybrid', 'full']) {
            const compiled = compileExperienceComponentModel(raw, { mode });
            expect(compiled.usesNativeComponents).toBe(true);
            const root = renderExperienceComponentModel(document, compiled);
            expect(root.querySelector('[data-atria-native-component="conversation"]')).not.toBeNull();
            expect(root.querySelector('[data-atria-native-component="composer"]')).not.toBeNull();
        }
    });

    test('visibility and responsive reasons compose instead of overwriting each other', () => {
        const element = document.createElement('div');
        element.dataset.atriaResponsiveDevices = 'desktop';

        setComponentHiddenReason(element, 'visibility', true);
        applyResponsiveComponentVisibility(element.parentNode || {
            querySelectorAll: () => [element],
        }, {
            device: 'mobile',
            orientation: 'portrait',
        });
        expect(element.hidden).toBe(true);

        setComponentHiddenReason(element, 'visibility', false);
        expect(element.hidden).toBe(true);

        applyResponsiveComponentVisibility({
            querySelectorAll: () => [element],
        }, {
            device: 'desktop',
            orientation: 'portrait',
        });
        expect(element.hidden).toBe(false);
    });

    test('fails closed for unknown fields, unsafe action args, duplicate ids, and invalid slots', () => {
        expect(() => compileExperienceComponentModel({
            id: 'root',
            type: 'container',
            executable: 'main.js',
        }, { mode: 'component' })).toThrow(/unknown field/);

        expect(() => compileExperienceComponentModel({
            id: 'root',
            type: 'button',
            actions: {
                click: {
                    commandId: 'heal',
                    args: JSON.parse('{"constructor":{"polluted":true}}'),
                },
            },
        }, { mode: 'component' })).toThrow(/blocked key/);

        expect(() => compileExperienceComponentModel({
            id: 'root',
            type: 'container',
            children: [{ id: 'root', type: 'text' }],
        }, { mode: 'component' })).toThrow(/Duplicate Component Model id/);

        expect(() => compileExperienceComponentModel({
            id: 'root',
            type: 'native-slot',
            props: { component: 'unknown' },
        }, { mode: 'hybrid' })).toThrow(/conversation or composer/);
    });
});
