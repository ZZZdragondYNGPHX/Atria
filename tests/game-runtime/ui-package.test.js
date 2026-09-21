/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
    loadGameComponentDefinition,
    sanitizeGameHtmlFragment,
} from '../../public/scripts/extensions/game-runtime/ui/package.js';

describe('Game Package Component HTML', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    test('sanitizes active content and inline handlers before mounting', () => {
        const fragment = sanitizeGameHtmlFragment(document, `
            <section id="safe" onclick="window.pwned = true">
                <a id="bad-link" href="javascript:alert(1)">bad</a>
                <img id="safe-image" src="assets/portrait.png" onerror="alert(1)">
                <script>window.pwned = true</script>
                <iframe src="https://example.com"></iframe>
                <style>body { display:none }</style>
                <span>HP</span>
            </section>
        `);

        const host = document.createElement('div');
        host.appendChild(fragment);

        expect(host.querySelector('#safe')).not.toBeNull();
        expect(host.querySelector('#safe').hasAttribute('onclick')).toBe(false);
        expect(host.querySelector('#bad-link').hasAttribute('href')).toBe(false);
        expect(host.querySelector('#safe-image').getAttribute('src')).toBe('assets/portrait.png');
        expect(host.querySelector('#safe-image').hasAttribute('onerror')).toBe(false);
        expect(host.querySelector('script')).toBeNull();
        expect(host.querySelector('iframe')).toBeNull();
        expect(host.querySelector('style')).toBeNull();
    });

    test('loads a declared static Component entry and preserves stable surface metadata', async () => {
        const fetchImpl = jest.fn(async () => ({
            ok: true,
            status: 200,
            async text() {
                return '<section id="hud">HUD</section>';
            },
        }));
        const definition = await loadGameComponentDefinition({
            charId: 'hero',
            manifest: {
                ui: {
                    mode: 'component',
                    entry: 'ui/hud.html',
                    surface: 'chat.header',
                },
            },
        }, {
            document,
            fetchImpl,
        });

        expect(fetchImpl).toHaveBeenCalledWith(
            '/api/card-app/hero/ui/hud.html',
            expect.objectContaining({ cache: 'no-store' }),
        );
        expect(definition).toMatchObject({
            id: 'package.component',
            surface: 'chat.header',
            className: 'atria-game-package-component',
        });

        const container = document.createElement('div');
        const dispose = await definition.mount({
            container,
            selectors: {
                get() {
                    throw new Error('fixture has no selectors');
                },
                subscribe() {
                    throw new Error('fixture has no selectors');
                },
            },
            actions: {
                dispatch: jest.fn(),
                simulate: jest.fn(),
            },
        });
        expect(container.querySelector('#hud')?.textContent).toBe('HUD');
        expect(container.dataset.atriaGameDevice).toBeTruthy();
        dispose();
    });

    test('rejects script-style Component entrypoints in the static R4 slice', async () => {
        await expect(loadGameComponentDefinition({
            charId: 'hero',
            manifest: {
                ui: {
                    mode: 'component',
                    entry: 'ui/main.js',
                    surface: 'app.root',
                },
            },
        }, { document })).rejects.toThrow(/must be an \.html file/);
    });
});
