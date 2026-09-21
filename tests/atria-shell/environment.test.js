/** @jest-environment jsdom */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
    createAtriaShellEnvironment,
    resolveAtriaViewportMode,
} from '../../public/scripts/atria-shell/environment.js';

function setWindowSize(width, height) {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

describe('Atria shell responsive environment', () => {
    const originalMatchMedia = window.matchMedia;
    const originalVisualViewport = window.visualViewport;

    beforeEach(() => {
        document.body.innerHTML = '<main id="root"></main>';
        setWindowSize(1440, 900);
        Object.defineProperty(window, 'visualViewport', {
            configurable: true,
            value: undefined,
        });
        window.matchMedia = jest.fn(query => ({
            matches: query.includes('fine'),
            media: query,
            addEventListener() {},
            removeEventListener() {},
        }));
    });

    afterEach(() => {
        window.matchMedia = originalMatchMedia;
        Object.defineProperty(window, 'visualViewport', {
            configurable: true,
            value: originalVisualViewport,
        });
    });

    test('uses Compact / Medium / Expanded instead of the old 1000px mobile rule', () => {
        expect(resolveAtriaViewportMode(390)).toBe('compact');
        expect(resolveAtriaViewportMode(900)).toBe('medium');
        expect(resolveAtriaViewportMode(1180)).toBe('expanded');
        expect(resolveAtriaViewportMode(1440)).toBe('expanded');
    });

    test('projects viewport semantics and safe sizing onto the shell root', () => {
        const root = document.getElementById('root');
        const environment = createAtriaShellEnvironment(root, { window });

        expect(environment.get()).toMatchObject({
            mode: 'expanded',
            orientation: 'landscape',
            pointer: 'fine',
            keyboardOpen: false,
            width: 1440,
            height: 900,
        });
        expect(root.dataset.atriaViewport).toBe('expanded');
        expect(root.style.getPropertyValue('--atri-viewport-width')).toBe('1440px');

        setWindowSize(900, 1200);
        environment.refresh();
        expect(environment.get()).toMatchObject({
            mode: 'medium',
            orientation: 'portrait',
        });

        environment.dispose();
    });

    test('detects keyboard-open only for a focused input on non-expanded layouts', () => {
        document.body.innerHTML = '<main id="root"></main><textarea id="input"></textarea>';
        setWindowSize(390, 844);
        const listeners = new Map();
        Object.defineProperty(window, 'visualViewport', {
            configurable: true,
            value: {
                width: 390,
                height: 560,
                addEventListener(type, listener) { listeners.set(type, listener); },
                removeEventListener(type) { listeners.delete(type); },
            },
        });
        document.getElementById('input').focus();

        const root = document.getElementById('root');
        const environment = createAtriaShellEnvironment(root, { window });
        expect(environment.get().keyboardOpen).toBe(true);
        expect(root.dataset.atriaKeyboard).toBe('open');

        environment.dispose();
    });
});
