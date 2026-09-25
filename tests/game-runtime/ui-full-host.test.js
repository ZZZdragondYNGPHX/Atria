/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { createFullGameHost } from '../../public/scripts/native/experience/ui/full-host.js';
import { mountNativePlayHost } from '../../public/scripts/atria-shell/native-play-host.js';

describe('Full Game UI host recovery shell', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="top-bar"></div>
            <div id="top-settings-holder"></div>
            <main id="sheld">
                <div id="chat"></div>
                <div id="form_sheld"><div id="send_form"><textarea id="send_textarea"></textarea></div></div>
            </main>
            <section id="atria-stage"></section>
            <div id="atria-test-recovery"></div>
        `;
    });

    test('hides native host only after activation and restores it on dispose', () => {
        const sheld = document.getElementById('sheld');
        sheld.style.display = 'flex';
        const exit = jest.fn();
        const stop = jest.fn();
        const save = jest.fn();
        const diagnostics = jest.fn();
        const host = createFullGameHost(document, {
            onExit: exit,
            onStopGeneration: stop,
            onSave: save,
            onDiagnostics: diagnostics,
        });

        expect(document.getElementById('atria-game-full-root')).toBe(host.root);
        expect(document.getElementById('atria-game-full-recovery')).toBe(host.recovery);
        expect(sheld.style.display).toBe('flex');
        expect(document.body.dataset.atriaGameFullActive).toBeUndefined();

        expect(host.activate()).toBe(true);
        expect(sheld.style.display).toBe('none');
        expect(document.getElementById('top-bar').style.display).toBe('none');
        expect(document.getElementById('top-settings-holder').style.display).toBe('none');
        expect(document.body.dataset.atriaGameFullActive).toBe('true');

        host.recovery.querySelector('[data-atria-game-recovery-action="stop"]').click();
        host.recovery.querySelector('[data-atria-game-recovery-action="save"]').click();
        host.recovery.querySelector('[data-atria-game-recovery-action="diagnostics"]').click();
        expect(stop).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledTimes(1);
        expect(diagnostics).toHaveBeenCalledTimes(1);

        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
        }));
        expect(exit).toHaveBeenCalledTimes(1);

        host.dispose();

        expect(sheld.style.display).toBe('flex');
        expect(document.getElementById('top-bar').style.display).toBe('');
        expect(document.getElementById('top-settings-holder').style.display).toBe('');
        expect(document.body.dataset.atriaGameFullActive).toBeUndefined();
        expect(document.getElementById('atria-game-full-root')).toBeNull();
        expect(document.getElementById('atria-game-full-recovery')).toBeNull();
    });

    test('recovery chrome exists outside the package-owned full root', () => {
        const host = createFullGameHost(document, {
            onExit: jest.fn(),
        });

        expect(host.root.contains(host.recovery)).toBe(false);
        expect(host.recovery.parentElement).toBe(document.body);
        expect(host.root.parentElement).toBe(document.body);

        host.dispose();
    });

    test('Shell-scoped Full owns Stage while Host chrome and Recovery stay Host-owned', () => {
        const stage = document.getElementById('atria-stage');
        const recoveryLayer = document.getElementById('atria-test-recovery');
        const playHost = mountNativePlayHost({ document, stage });
        const shell = { slots: { stage, recovery: recoveryLayer } };
        const shellFoundation = {
            getShell: () => shell,
            getPlayHost: () => playHost,
        };
        const host = createFullGameHost(document, {
            shell: shellFoundation,
            onExit: jest.fn(),
            onStopGeneration: jest.fn(),
        });

        expect(host.root.parentElement).toBe(stage);
        expect(host.recovery.parentElement).toBe(recoveryLayer);
        expect(host.root.contains(host.recovery)).toBe(false);
        expect(host.root.hidden).toBe(true);
        expect(document.getElementById('top-bar').style.display).toBe('');
        expect(document.getElementById('top-settings-holder').style.display).toBe('');

        expect(host.activate()).toBe(true);
        expect(host.root.hidden).toBe(false);
        expect(playHost.getStageOwner()).toBe('game-runtime:full');
        expect(playHost.root.style.display).toBe('none');
        expect(document.getElementById('top-bar').style.display).toBe('');
        expect(document.getElementById('top-settings-holder').style.display).toBe('');

        host.dispose();

        expect(playHost.getStageOwner()).toBeNull();
        expect(playHost.root.style.display).toBe('');
        expect(document.getElementById('atria-game-full-root')).toBeNull();
        expect(document.getElementById('atria-game-full-recovery')).toBeNull();
        expect(playHost.assertIntegrity()).toBe(true);
        playHost.unmount();
    });

    test('prevents overlapping Full UI ownership', () => {
        const first = createFullGameHost(document, {
            onExit: jest.fn(),
        });

        expect(() => createFullGameHost(document, {
            onExit: jest.fn(),
        })).toThrow(/already active/);

        first.dispose();
    });
});
