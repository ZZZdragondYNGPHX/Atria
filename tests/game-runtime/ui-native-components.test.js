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
                <div id="chat"><span id="chat-marker">Chat ABI</span></div>
                <div id="form_sheld">
                    <div id="send_form"><textarea id="send_textarea"></textarea></div>
                </div>
            </main>
            <section id="atria-play-product">
                <section id="product-conversation" data-atria-native-product-component="conversation">
                    <main id="atria-play-conversation">Conversation</main>
                </section>
                <section id="product-composer" data-atria-native-product-component="composer">
                    <form id="atria-play-composer">Composer</form>
                </section>
            </section>
            <section id="game-shell">
                <div id="conversation-slot" data-atria-native-component="conversation"></div>
                <div id="composer-slot" data-atria-native-component="composer"></div>
            </section>
        `;
    });

    test('moves the Atria product components into Hybrid slots while legacy generation ABI stays put', () => {
        const legacyChat = document.getElementById('chat');
        const legacySendForm = document.getElementById('send_form');
        const sheld = document.getElementById('sheld');
        const formSheld = document.getElementById('form_sheld');
        const conversation = document.querySelector('[data-atria-native-product-component="conversation"]');
        const composer = document.querySelector('[data-atria-native-product-component="composer"]');
        const productRoot = document.getElementById('atria-play-product');
        const registry = createNativeComponentRegistry(document);

        const dispose = bindNativeGameComponents(
            document.getElementById('game-shell'),
            registry,
        );

        expect(document.getElementById('chat')).toBe(legacyChat);
        expect(document.getElementById('send_form')).toBe(legacySendForm);
        expect(conversation.parentElement.id).toBe('conversation-slot');
        expect(composer.parentElement.id).toBe('composer-slot');
        expect(legacyChat.parentElement).toBe(sheld);
        expect(legacyChat.nextElementSibling).toBe(formSheld);
        expect(legacySendForm.parentElement).toBe(formSheld);
        expect(document.getElementById('send_textarea')).not.toBeNull();
        expect(registry.getActive()).toEqual(['conversation', 'composer']);

        dispose();

        expect(conversation.parentElement).toBe(productRoot);
        expect(composer.parentElement).toBe(productRoot);
        expect(legacyChat.parentElement).toBe(sheld);
        expect(legacySendForm.parentElement).toBe(formSheld);
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
