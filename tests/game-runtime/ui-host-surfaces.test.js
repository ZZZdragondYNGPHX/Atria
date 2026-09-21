import { beforeEach, describe, expect, test } from '@jest/globals';

import { createAtriaSurfaceAdapter } from '../../public/scripts/extensions/game-runtime/ui/host-surfaces.js';

describe('Atria Game UI host surface adapter', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="left-nav-panel"></div>
            <div id="right-nav-panel"></div>
            <main id="sheld">
                <div id="sheldheader"></div>
                <div id="chat"></div>
                <div id="form_sheld">
                    <div id="send_form"></div>
                </div>
            </main>
        `;
    });

    test('creates Atria-owned anchors around native host regions', () => {
        const adapter = createAtriaSurfaceAdapter(document);

        const appRoot = adapter.resolveSurface('app.root');
        const chatHeader = adapter.resolveSurface('chat.header');
        const chatFooter = adapter.resolveSurface('chat.footer');
        const before = adapter.resolveSurface('composer.before');
        const after = adapter.resolveSurface('composer.after');
        const left = adapter.resolveSurface('sidebar.left');
        const right = adapter.resolveSurface('sidebar.right');
        const modal = adapter.resolveSurface('modal');

        expect(appRoot.dataset.atriaGameHostSurface).toBe('app.root');
        expect(chatHeader.nextElementSibling.id).toBe('chat');
        expect(chatFooter.nextElementSibling.id).toBe('form_sheld');
        expect(before.nextElementSibling.id).toBe('send_form');
        expect(after.previousElementSibling.id).toBe('send_form');
        expect(left.parentElement.id).toBe('left-nav-panel');
        expect(right.parentElement.id).toBe('right-nav-panel');
        expect(modal.parentElement).toBe(document.body);

        expect(adapter.resolveSurface('chat.header')).toBe(chatHeader);
        expect(document.querySelectorAll('[data-atria-game-host-surface="chat.header"]')).toHaveLength(1);

        adapter.destroy();
        expect(document.querySelectorAll('[data-atria-game-host-surface]')).toHaveLength(0);
        expect(document.getElementById('chat')).not.toBeNull();
        expect(document.getElementById('send_form')).not.toBeNull();
    });

    test('returns null when a required native host region is unavailable', () => {
        document.getElementById('sheld').remove();
        const adapter = createAtriaSurfaceAdapter(document);

        expect(adapter.resolveSurface('chat.header')).toBeNull();
    });
});
