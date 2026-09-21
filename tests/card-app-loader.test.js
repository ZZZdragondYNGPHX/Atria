/** @jest-environment jsdom */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
    createContainer,
    destroyContainer,
} from '../public/scripts/extensions/card-app/loader.js';
import { mountNativePlayHost } from '../public/scripts/atria-shell/native-play-host.js';

describe('Legacy CardApp R7C Stage integration', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="native-before"></div>
            <main id="sheld">
                <div id="chat">Native chat</div>
                <div id="form_sheld">
                    <div id="send_form"><textarea id="send_textarea"></textarea></div>
                </div>
            </main>
            <div id="native-after"></div>
            <section id="atria-stage"></section>
            <div id="atria-test-recovery"></div>
        `;
    });

    afterEach(() => {
        destroyContainer();
    });

    test('runs as a recoverable Legacy Full Stage Surface under the Shell', () => {
        const stage = document.getElementById('atria-stage');
        const recoveryLayer = document.getElementById('atria-test-recovery');
        const playHost = mountNativePlayHost({ document, stage });
        const shell = { slots: { stage, recovery: recoveryLayer } };
        const shellFoundation = {
            getShell: () => shell,
            getPlayHost: () => playHost,
        };
        const exit = jest.fn();
        const stop = jest.fn();
        const diagnostics = jest.fn();
        const chat = playHost.native.chat;
        const sendForm = playHost.native.sendForm;
        const textarea = playHost.native.sendTextarea;

        const container = createContainer({
            shell: shellFoundation,
            onExit: exit,
            onStopGeneration: stop,
            onDiagnostics: diagnostics,
        });

        expect(container.parentElement).toBe(stage);
        expect(container.dataset.atriaLegacyFullStage).toBe('true');
        expect(playHost.getStageOwner()).toBe('legacy-card-app');
        expect(playHost.root.style.display).toBe('none');
        expect(document.getElementById('card-app-menu-btn')).toBeNull();

        const recovery = document.getElementById('card-app-host-recovery');
        expect(recovery.parentElement).toBe(recoveryLayer);
        expect(container.contains(recovery)).toBe(false);
        recovery.querySelector('[data-atria-card-app-recovery-action="stop"]').click();
        recovery.querySelector('[data-atria-card-app-recovery-action="diagnostics"]').click();
        recovery.querySelector('[data-atria-card-app-recovery-action="exit"]').click();
        expect(stop).toHaveBeenCalledTimes(1);
        expect(diagnostics).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledTimes(1);

        expect(document.getElementById('chat')).toBe(chat);
        expect(document.getElementById('send_form')).toBe(sendForm);
        expect(document.getElementById('send_textarea')).toBe(textarea);
        expect(document.querySelectorAll('#chat')).toHaveLength(1);
        expect(document.querySelectorAll('#send_form')).toHaveLength(1);
        expect(document.querySelectorAll('#send_textarea')).toHaveLength(1);

        destroyContainer();

        expect(document.getElementById('card-app-container')).toBeNull();
        expect(document.getElementById('card-app-host-recovery')).toBeNull();
        expect(playHost.getStageOwner()).toBeNull();
        expect(playHost.root.style.display).toBe('');
        expect(playHost.assertIntegrity()).toBe(true);
        playHost.unmount();
    });

    test('keeps the historical in-native-host fallback when the Shell is absent', () => {
        const chat = document.getElementById('chat');
        const formSheld = document.getElementById('form_sheld');

        const container = createContainer();

        expect(container.parentElement.id).toBe('sheld');
        expect(chat.style.display).toBe('none');
        expect(formSheld.style.display).toBe('none');
        expect(document.getElementById('card-app-menu-btn')).not.toBeNull();

        destroyContainer();

        expect(chat.style.display).toBe('');
        expect(formSheld.style.display).toBe('');
        expect(document.getElementById('card-app-container')).toBeNull();
    });
});
