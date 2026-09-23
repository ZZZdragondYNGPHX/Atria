/** @jest-environment jsdom */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { mountAtriaPlayProduct } from '../../public/scripts/native/play-product.js';
import { resetNativeSessionLifecycleForTesting } from '../../public/scripts/native/session-lifecycle.js';

async function flush() {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
}

describe('A6 Atria-native Play product', () => {
    let runtime;

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="host">
                <main id="sheld">
                    <div id="chat"></div>
                    <div id="form_sheld">
                        <form id="send_form">
                            <textarea id="send_textarea"></textarea>
                            <button id="send_but" type="button">Send ABI</button>
                        </form>
                    </div>
                </main>
            </div>
        `;
        runtime = {
            active: true,
            history: false,
            failed: false,
            snapshot: {
                session: { sessionId: 'session_1', displayTitle: 'Native Run' },
                revision: { revisionId: 'rev_1' },
                manifest: {
                    name: 'Atria Game',
                    version: '1.0.0',
                    actors: [{ actorId: 'actor_1', displayName: 'Guide' }],
                },
                timeline: [
                    { messageId: 'msg_1', role: 'assistant', actorId: 'actor_1', content: 'Welcome.' },
                    { messageId: 'msg_2', role: 'user', content: 'Look around.' },
                ],
            },
        };
        globalThis.Atria = { nativeSessionRuntime: runtime };
        document.body.dataset.atriaNativeSessionActive = 'true';
    });

    afterEach(() => {
        resetNativeSessionLifecycleForTesting();
        delete document.body.dataset.atriaNativeSessionActive;
        delete globalThis.Atria;
    });

    test('renders only committed Native Timeline data into the product Conversation', () => {
        const root = document.getElementById('host');
        const product = mountAtriaPlayProduct({
            document,
            root,
            native: {
                sendForm: document.getElementById('send_form'),
                sendTextarea: document.getElementById('send_textarea'),
            },
        });

        expect(product.root.hidden).toBe(false);
        expect(product.sessionHeader.textContent).toContain('Native Run');
        expect(product.conversation.querySelectorAll('[data-atria-message-id]')).toHaveLength(2);
        expect(product.conversation.textContent).toContain('Welcome.');
        expect(product.conversation.textContent).toContain('Look around.');
        expect(product.conversation.textContent).toContain('Guide');
        expect(product.conversation.querySelector('#chat')).toBeNull();

        product.dispose();
    });

    test('Composer bridges to the existing generation entrypoint without owning a second chat state', async () => {
        const root = document.getElementById('host');
        const sendButton = document.getElementById('send_but');
        const abiTextarea = document.getElementById('send_textarea');
        const clicked = jest.fn();
        sendButton.addEventListener('click', clicked);

        const product = mountAtriaPlayProduct({
            document,
            root,
            native: {
                sendForm: document.getElementById('send_form'),
                sendTextarea: abiTextarea,
            },
        });

        product.textarea.value = 'Take the northern path.';
        product.composer.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flush();

        expect(clicked).toHaveBeenCalledTimes(1);
        expect(abiTextarea.value).toBe('Take the northern path.');
        expect(product.textarea.value).toBe('');
        expect(runtime.snapshot.timeline).toHaveLength(2);

        product.dispose();
    });

    test('historical Native revisions are read-only in the product Composer', () => {
        runtime.history = true;
        const product = mountAtriaPlayProduct({
            document,
            root: document.getElementById('host'),
            native: {
                sendForm: document.getElementById('send_form'),
                sendTextarea: document.getElementById('send_textarea'),
            },
        });

        expect(product.textarea.disabled).toBe(true);
        expect(product.composer.querySelector('button[type="submit"]').disabled).toBe(true);
        expect(product.composer.textContent).toContain('Historical revisions are read-only.');

        product.dispose();
    });
});
