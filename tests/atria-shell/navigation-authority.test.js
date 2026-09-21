/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { createAtriaNavigationAuthority } from '../../public/scripts/atria-shell/navigation-authority.js';

describe('R7D Navigation Authority', () => {
    beforeEach(() => {
        window.history.replaceState(null, '', '/');
    });

    test('owns primary route, breadcrumb and browser history as one state', () => {
        const navigation = createAtriaNavigationAuthority({ window });

        expect(navigation.getRoute()).toMatchObject({ domain: 'play', child: null });
        expect(window.location.search).toContain('atriaRoute=play');

        navigation.navigate('library');
        navigation.navigate('runtime');

        expect(navigation.getRoute().domain).toBe('runtime');
        expect(navigation.getState().historyIndex).toBe(2);
        expect(window.history.state.atriaNavigation).toMatchObject({
            index: 2,
            domain: 'runtime',
        });
        expect(navigation.getRoute().breadcrumb).toEqual(['Runtime']);

        navigation.dispose();
    });

    test('models detail/workspace child routes without creating a second router', () => {
        const navigation = createAtriaNavigationAuthority({ window });

        navigation.navigate('studio');
        navigation.navigateChild({ id: 'project/demo', label: 'Demo', kind: 'detail' });

        expect(navigation.getRoute()).toMatchObject({
            domain: 'studio',
            child: {
                id: 'project/demo',
                label: 'Demo',
                kind: 'detail',
            },
        });
        expect(navigation.getRoute().breadcrumb).toEqual(['Studio', 'Demo']);
        expect(window.location.search).toContain('atriaChild=project%2Fdemo');

        navigation.clearChild({ history: 'replace' });
        expect(navigation.getRoute().child).toBeNull();
        expect(navigation.getRoute().breadcrumb).toEqual(['Studio']);

        navigation.dispose();
    });

    test('restores route from popstate and exposes an Atria-local back boundary', () => {
        const navigation = createAtriaNavigationAuthority({ window });
        const listener = jest.fn();
        navigation.subscribe(listener);

        navigation.navigate('library');
        expect(navigation.canGoBackWithinAtria()).toBe(true);

        window.history.replaceState({
            atriaNavigation: {
                version: 1,
                index: 0,
                domain: 'play',
                child: null,
                breadcrumb: ['Play'],
            },
        }, '', '/?atriaRoute=play');
        window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));

        expect(navigation.getRoute().domain).toBe('play');
        expect(navigation.canGoBackWithinAtria()).toBe(false);
        expect(listener).toHaveBeenCalled();

        navigation.dispose();
    });

    test('keeps Context Dock/Sheet state inside the same navigation authority', () => {
        const navigation = createAtriaNavigationAuthority({ window });

        navigation.setContext({
            id: 'timeline',
            title: 'Timeline',
            open: true,
            sheetState: 'full',
            initialized: true,
        });

        expect(navigation.getContext()).toEqual({
            id: 'timeline',
            title: 'Timeline',
            open: true,
            sheetState: 'full',
            initialized: true,
        });
        expect(navigation.closeContext()).toBe(true);
        expect(navigation.getContext().open).toBe(false);

        navigation.dispose();
    });
});
