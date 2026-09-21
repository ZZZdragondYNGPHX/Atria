/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { createFullGameHost } from '../../public/scripts/extensions/game-runtime/ui/full-host.js';

describe('Full Game UI host recovery shell', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="top-bar"></div>
            <div id="top-settings-holder"></div>
            <main id="sheld">
                <div id="chat"></div>
                <div id="form_sheld"><div id="send_form"></div></div>
            </main>
        `;
    });

    test('hides native host only after activation and restores it on dispose', () => {
        const sheld = document.getElementById('sheld');
        sheld.style.display = 'flex';
        const exit = jest.fn();
        const stop = jest.fn();
        const disable = jest.fn();
        const diagnostics = jest.fn();
        const host = createFullGameHost(document, {
            onExit: exit,
            onStopGeneration: stop,
            onDisablePackage: disable,
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
        host.recovery.querySelector('[data-atria-game-recovery-action="disable"]').click();
        host.recovery.querySelector('[data-atria-game-recovery-action="diagnostics"]').click();
        expect(stop).toHaveBeenCalledTimes(1);
        expect(disable).toHaveBeenCalledTimes(1);
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
