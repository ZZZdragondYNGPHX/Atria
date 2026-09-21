/** @jest-environment jsdom */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { createResponsiveEnvironment } from '../../public/scripts/extensions/game-runtime/ui/environment.js';

function setViewport(width, height) {
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: width,
    });
    Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: height,
    });
}

describe('Game UI responsive environment contract', () => {
    const originalMatchMedia = window.matchMedia;

    beforeEach(() => {
        document.body.innerHTML = '<main id="root"></main>';
        setViewport(390, 844);
        Object.defineProperty(window.navigator, 'maxTouchPoints', {
            configurable: true,
            value: 1,
        });
        window.matchMedia = jest.fn(query => ({
            matches: query.includes('coarse'),
            media: query,
            addEventListener() {},
            removeEventListener() {},
        }));
    });

    afterEach(() => {
        window.matchMedia = originalMatchMedia;
    });

    test('applies mobile portrait/touch contract and safe-area variables', () => {
        const root = document.getElementById('root');
        const environment = createResponsiveEnvironment(root, { window });

        expect(environment.get()).toEqual({
            device: 'mobile',
            orientation: 'portrait',
            touch: true,
            keyboard: false,
            width: 390,
            height: 844,
        });
        expect(root.dataset).toMatchObject({
            atriaGameDevice: 'mobile',
            atriaGameOrientation: 'portrait',
            atriaGameTouch: 'true',
            atriaGameKeyboard: 'false',
        });
        expect(root.style.getPropertyValue('--atria-game-safe-area-top'))
            .toBe('env(safe-area-inset-top, 0px)');
        expect(root.style.getPropertyValue('--atria-game-viewport-width')).toBe('390px');

        environment.dispose();
    });

    test('refreshes the same root for desktop landscape without alternate HTML', () => {
        const root = document.getElementById('root');
        const environment = createResponsiveEnvironment(root, { window });
        const changes = [];
        environment.subscribe((next, previous) => changes.push([next, previous]));

        setViewport(1440, 900);
        Object.defineProperty(window.navigator, 'maxTouchPoints', {
            configurable: true,
            value: 0,
        });
        window.matchMedia = jest.fn(query => ({
            matches: query.includes('fine'),
            media: query,
            addEventListener() {},
            removeEventListener() {},
        }));
        window.dispatchEvent(new Event('resize'));

        expect(environment.get()).toMatchObject({
            device: 'desktop',
            orientation: 'landscape',
            touch: false,
            keyboard: true,
            width: 1440,
            height: 900,
        });
        expect(root.dataset.atriaGameDevice).toBe('desktop');
        expect(root.dataset.atriaGameOrientation).toBe('landscape');
        expect(changes).toHaveLength(1);

        environment.dispose();
    });
});
