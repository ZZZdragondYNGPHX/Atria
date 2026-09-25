/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { mountNativePlayHost } from '../../public/scripts/atria-shell/native-play-host.js';
import { createAtriaSurfaceAdapter } from '../../public/scripts/native/experience/ui/host-surfaces.js';
import { createFullGameHost } from '../../public/scripts/native/experience/ui/full-host.js';

describe('A6 Native Play Product Host', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="native-before"></div>
            <main id="sheld">
                <div id="sheldheader"></div>
                <div id="chat"><div class="mes">existing conversation</div></div>
                <div id="form_sheld">
                    <div id="current_chat_tools_panel"></div>
                    <div id="send_form">
                        <textarea id="send_textarea"></textarea>
                        <button id="send_but" type="button">Send</button>
                    </div>
                </div>
            </main>
            <div id="native-after"></div>
            <section id="atria-stage"><div id="stage-placeholder">placeholder</div></section>
        `;
    });

    test('keeps one legacy generation ABI while Atria owns visible Conversation and Composer', () => {
        const stage = document.getElementById('atria-stage');
        const sheld = document.getElementById('sheld');
        const chat = document.getElementById('chat');
        const formSheld = document.getElementById('form_sheld');
        const sendForm = document.getElementById('send_form');
        const textarea = document.getElementById('send_textarea');
        const send = document.getElementById('send_but');
        const click = jest.fn();

        send.addEventListener('click', click);
        textarea.__atriaRuntimeMarker = { composing: true };

        const host = mountNativePlayHost({ document, stage });

        expect(host.root.id).toBe('atria-native-play-host');
        expect(stage.contains(sheld)).toBe(true);
        expect(sheld.parentElement).toBe(host.root);
        expect(document.getElementById('chat')).toBe(chat);
        expect(document.getElementById('form_sheld')).toBe(formSheld);
        expect(document.getElementById('send_form')).toBe(sendForm);
        expect(document.getElementById('send_textarea')).toBe(textarea);
        expect(chat.parentElement).toBe(sheld);
        expect(formSheld.parentElement).toBe(sheld);
        expect(sendForm.parentElement).toBe(formSheld);
        expect(sheld.classList.contains('atria-native-play-abi')).toBe(true);
        expect(sheld.getAttribute('aria-hidden')).toBe('true');
        expect(host.product.root.id).toBe('atria-play-product');
        expect(host.product.conversation.id).toBe('atria-play-conversation');
        expect(host.product.composer.id).toBe('atria-play-composer');
        expect(textarea.__atriaRuntimeMarker).toEqual({ composing: true });
        expect(document.querySelectorAll('#chat')).toHaveLength(1);
        expect(document.querySelectorAll('#send_form')).toHaveLength(1);
        expect(document.querySelectorAll('#send_textarea')).toHaveLength(1);
        expect(host.assertIntegrity()).toBe(true);

        send.click();
        expect(click).toHaveBeenCalledTimes(1);
    });

    test('unmount restores the exact original position and the same native node identities', () => {
        const stage = document.getElementById('atria-stage');
        const sheld = document.getElementById('sheld');
        const chat = document.getElementById('chat');
        const composer = document.getElementById('send_form');
        const placeholder = document.getElementById('stage-placeholder');

        const host = mountNativePlayHost({ document, stage });
        expect(host.unmount()).toBe(true);

        expect(document.body.children[1]).toBe(sheld);
        expect(sheld.previousElementSibling.id).toBe('native-before');
        expect(sheld.nextElementSibling.id).toBe('native-after');
        expect(document.getElementById('chat')).toBe(chat);
        expect(document.getElementById('send_form')).toBe(composer);
        expect(stage.firstElementChild).toBe(placeholder);
        expect(stage.dataset.atriaNativePlayMounted).toBeUndefined();
        expect(sheld.dataset.atriaNativePlayMounted).toBeUndefined();
        expect(document.getElementById('atria-native-play-host')).toBeNull();
        expect(host.isMounted()).toBe(false);
        expect(host.unmount()).toBe(false);
    });

    test('fails before mutation when native ids are duplicated', () => {
        const duplicate = document.createElement('div');
        duplicate.id = 'chat';
        document.body.append(duplicate);

        const sheld = document.getElementById('sheld');
        expect(() => mountNativePlayHost({
            document,
            stage: document.getElementById('atria-stage'),
        })).toThrow(/exactly one #chat/);
        expect(sheld.parentElement).toBe(document.body);
        expect(document.getElementById('atria-native-play-host')).toBeNull();
    });

    test('coordinates Hybrid Atria product components and Stage ownership without moving the legacy ABI', () => {
        const stage = document.getElementById('atria-stage');
        const host = mountNativePlayHost({ document, stage });
        const chat = host.native.chat;
        const sendForm = host.native.sendForm;
        const textarea = host.native.sendTextarea;
        const productConversation = host.product.getComponent('conversation');
        const productComposer = host.product.getComponent('composer');

        const gameSurface = document.createElement('section');
        gameSurface.id = 'hybrid-stage-surface';
        const conversationSlot = document.createElement('div');
        conversationSlot.id = 'hybrid-conversation-slot';
        const composerSlot = document.createElement('div');
        composerSlot.id = 'hybrid-composer-slot';
        gameSurface.append(conversationSlot, composerSlot);
        stage.appendChild(gameSurface);

        const ownership = host.acquireStageOwnership('game-runtime:hybrid');
        const conversation = host.mountNativeComponent('conversation', conversationSlot);
        const composer = host.mountNativeComponent('composer', composerSlot);

        expect(host.getStageOwner()).toBe('game-runtime:hybrid');
        expect(host.root.style.display).toBe('none');
        expect(stage.dataset.atriaStageOwner).toBe('game-runtime:hybrid');
        expect(host.getActiveNativeComponents()).toEqual(['conversation', 'composer']);
        expect(document.querySelectorAll('#chat')).toHaveLength(1);
        expect(document.querySelectorAll('#send_form')).toHaveLength(1);
        expect(document.querySelectorAll('#send_textarea')).toHaveLength(1);
        expect(document.getElementById('chat')).toBe(chat);
        expect(document.getElementById('send_form')).toBe(sendForm);
        expect(document.getElementById('send_textarea')).toBe(textarea);
        expect(productConversation.parentElement).toBe(conversationSlot);
        expect(productComposer.parentElement).toBe(composerSlot);
        expect(chat.parentElement).toBe(host.native.sheld);
        expect(sendForm.parentElement).toBe(host.native.formSheld);
        expect(host.assertIntegrity()).toBe(true);
        expect(() => host.acquireStageOwnership('game-runtime:full')).toThrow(/already owned/);

        composer.restore();
        conversation.restore();
        expect(productConversation.parentElement).toBe(host.product.root);
        expect(productComposer.parentElement).toBe(host.product.root);
        expect(chat.parentElement).toBe(host.native.sheld);
        expect(sendForm.parentElement).toBe(host.native.formSheld);
        expect(host.getActiveNativeComponents()).toEqual([]);

        ownership.release();
        expect(host.getStageOwner()).toBeNull();
        expect(host.root.style.display).toBe('');
        expect(stage.dataset.atriaStageOwner).toBeUndefined();
        expect(host.assertIntegrity()).toBe(true);

        host.unmount();
    });

    test('mounts Component surfaces into Atria product Conversation and Composer', () => {
        const host = mountNativePlayHost({
            document,
            stage: document.getElementById('atria-stage'),
        });
        const adapter = createAtriaSurfaceAdapter(document, { nativePlayHost: host });

        const header = adapter.resolveSurface('chat.header');
        const footer = adapter.resolveSurface('chat.footer');
        const before = adapter.resolveSurface('composer.before');
        const after = adapter.resolveSurface('composer.after');

        expect(header).toBe(host.resolveHostSurface('chat.header'));
        expect(footer).toBe(host.resolveHostSurface('chat.footer'));
        expect(before).toBe(host.resolveHostSurface('composer.before'));
        expect(after).toBe(host.resolveHostSurface('composer.after'));
        expect(header.closest('[data-atria-native-product-component="conversation"]')).not.toBeNull();
        expect(before.closest('[data-atria-native-product-component="composer"]')).not.toBeNull();

        adapter.destroy();
        host.unmount();
    });

    test('Full UI can hide and restore the moved native host without stealing Host recovery', () => {
        const playHost = mountNativePlayHost({
            document,
            stage: document.getElementById('atria-stage'),
        });
        const sheld = playHost.native.sheld;
        const full = createFullGameHost(document, {
            onExit: jest.fn(),
            onStopGeneration: jest.fn(),
            onDisablePackage: jest.fn(),
            onDiagnostics: jest.fn(),
        });

        expect(full.activate()).toBe(true);
        expect(playHost.root.style.display).toBe('');
        expect(full.recovery.parentElement).toBe(document.body);
        expect(full.root.contains(full.recovery)).toBe(false);

        full.dispose();
        expect(sheld.parentElement).toBe(playHost.root);
        expect(playHost.assertIntegrity()).toBe(true);

        playHost.unmount();
    });
});
