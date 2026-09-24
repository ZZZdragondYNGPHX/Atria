/** @jest-environment jsdom */

import { beforeEach, describe, expect, test } from '@jest/globals';

import { createAtriaSurfaceAdapter } from '../../public/scripts/extensions/game-runtime/ui/host-surfaces.js';
import { mountNativePlayHost } from '../../public/scripts/atria-shell/native-play-host.js';

describe('Atria Game UI host surface adapter', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="left-nav-panel"></div>
            <div id="right-nav-panel"></div>
            <main id="sheld">
                <div id="sheldheader"></div>
                <div id="chat"></div>
                <div id="form_sheld">
                    <div id="send_form"><textarea id="send_textarea"></textarea></div>
                </div>
            </main>
            <section id="atria-stage"></section>
            <aside id="atria-test-dock"></aside>
            <div id="atria-test-transient"></div>
            <div id="atria-test-recovery"></div>
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

    test('Hybrid app.root resolves to Shell Stage while native compatibility surfaces stay native', () => {
        const stage = document.getElementById('atria-stage');
        const playHost = mountNativePlayHost({ document, stage });
        const shell = {
            slots: {
                stage,
                dock: document.getElementById('atria-test-dock'),
                transient: document.getElementById('atria-test-transient'),
                recovery: document.getElementById('atria-test-recovery'),
            },
        };
        const shellFoundation = {
            getShell: () => shell,
            getPlayHost: () => playHost,
        };
        const adapter = createAtriaSurfaceAdapter(document, {
            mode: 'hybrid',
            shell: shellFoundation,
        });

        const appRoot = adapter.resolveSurface('app.root');
        const header = adapter.resolveSurface('chat.header');
        const right = adapter.resolveSurface('sidebar.right');
        const modal = adapter.resolveSurface('modal');

        expect(appRoot.parentElement).toBe(stage);
        expect(appRoot.classList.contains('atria-game-host-surface--stage')).toBe(true);
        expect(playHost.getStageOwner()).toBe('game-runtime:hybrid');
        expect(playHost.root.style.display).toBe('none');
        expect(header.parentElement).toBe(playHost.native.sheld);
        expect(right.parentElement).toBe(shell.slots.dock);
        expect(modal.parentElement).toBe(shell.slots.transient);
        expect(adapter.resolveSurface('sidebar.left').parentElement).toBe(shell.slots.dock);
        expect(modal.tagName).toBe('DIALOG');
        expect(modal.getAttribute('aria-label')).toBe('Game dialog');
        expect(document.querySelectorAll('[data-atria-game-host-surface="app.root"]')).toHaveLength(1);

        adapter.destroy();

        expect(playHost.getStageOwner()).toBeNull();
        expect(playHost.root.style.display).toBe('');
        expect(document.querySelectorAll('[data-atria-game-host-surface]')).toHaveLength(0);
        playHost.unmount();
    });

    test('returns null when a required native host region is unavailable', () => {
        document.getElementById('sheld').remove();
        const adapter = createAtriaSurfaceAdapter(document);

        expect(adapter.resolveSurface('chat.header')).toBeNull();
    });
});
