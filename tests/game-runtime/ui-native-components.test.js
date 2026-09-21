/** @jest-environment jsdom */

import { beforeEach, describe, expect, test } from '@jest/globals';

import {
    bindNativeGameComponents,
    createNativeComponentRegistry,
} from '../../public/scripts/extensions/game-runtime/ui/native-components.js';

describe('Game UI native component composition', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <main id="sheld">
                <div id="chat"><span id="chat-marker">Chat</span></div>
                <div id="form_sheld">
                    <div id="send_form"><textarea id="send_textarea"></textarea></div>
                </div>
            </main>
            <section id="game-shell">
                <div id="conversation-slot" data-atria-native-component="conversation"></div>
                <div id="composer-slot" data-atria-native-component="composer"></div>
            </section>
        `;
    });

    test('moves the original native nodes into Hybrid slots and restores them in place', () => {
        const chat = document.getElementById('chat');
        const sendForm = document.getElementById('send_form');
        const sheld = document.getElementById('sheld');
        const formSheld = document.getElementById('form_sheld');
        const registry = createNativeComponentRegistry(document);

        const dispose = bindNativeGameComponents(
            document.getElementById('game-shell'),
            registry,
        );

        expect(document.getElementById('chat')).toBe(chat);
        expect(document.getElementById('send_form')).toBe(sendForm);
        expect(chat.parentElement.id).toBe('conversation-slot');
        expect(sendForm.parentElement.id).toBe('composer-slot');
        expect(document.getElementById('send_textarea')).not.toBeNull();
        expect(registry.getActive()).toEqual(['conversation', 'composer']);

        dispose();

        expect(chat.parentElement).toBe(sheld);
        expect(chat.nextElementSibling).toBe(formSheld);
        expect(sendForm.parentElement).toBe(formSheld);
        expect(registry.getActive()).toEqual([]);
    });

    test('fails closed for duplicate or unknown native component ownership', () => {
        const registry = createNativeComponentRegistry(document);
        const extra = document.createElement('div');

        const first = registry.mount(
            'conversation',
            document.getElementById('conversation-slot'),
        );
        expect(() => registry.mount('conversation', extra)).toThrow(/already mounted/);
        expect(() => registry.mount('unknown', extra)).toThrow(/Unknown native/);

        first.restore();
    });
});
