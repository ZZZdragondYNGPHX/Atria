import { describe, expect, test } from '@jest/globals';

import {
    GAME_SURFACES,
    createSurfaceHost,
} from '../../public/scripts/native/experience/ui/surfaces.js';

function makeElement(tagName = 'div') {
    const element = {
        tagName,
        dataset: {},
        className: '',
        parentNode: null,
        children: [],
        appendChild(child) {
            child.parentNode = this;
            this.children.push(child);
        },
        removeChild(child) {
            const index = this.children.indexOf(child);
            if (index >= 0) this.children.splice(index, 1);
            child.parentNode = null;
        },
        remove() {
            this.parentNode?.removeChild(this);
        },
    };
    return element;
}

describe('Game UI Surface Host', () => {
    test('mounts package content through stable surface ids and unmounts cleanly', () => {
        const root = makeElement('main');
        const host = createSurfaceHost({
            resolveSurface(surfaceId) {
                return surfaceId === 'app.root' ? root : null;
            },
            createElement: makeElement,
        });

        const handle = host.mount('app.root', 'hud', { className: 'game-hud' });

        expect(GAME_SURFACES).toContain('app.root');
        expect(root.children).toHaveLength(1);
        expect(handle.container.dataset).toEqual({
            atriaGameSurface: 'app.root',
            atriaGameMount: 'hud',
        });
        expect(handle.container.className).toBe('game-hud');
        expect(host.getActiveMounts()).toEqual([{ id: 'hud', surface: 'app.root' }]);

        expect(handle.unmount()).toBe(true);
        expect(handle.unmount()).toBe(false);
        expect(root.children).toEqual([]);
    });

    test('fails closed for unavailable or unknown surfaces', () => {
        const host = createSurfaceHost({
            resolveSurface: () => null,
            createElement: makeElement,
        });

        expect(() => host.mount('chat.header', 'hud')).toThrow(/unavailable/);
        expect(() => host.mount('host.internal.selector', 'hud')).toThrow(/Unknown Game UI surface/);
    });
});
