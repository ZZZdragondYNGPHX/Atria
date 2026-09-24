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

    test('streaming preserves committed nodes and a reader scrolling earlier in the story', async () => {
        const product = mountAtriaPlayProduct({ document, root: document.getElementById('host'), native: {
            sendForm: document.getElementById('send_form'), sendTextarea: document.getElementById('send_textarea'),
        } });
        await flush();
        const first = product.conversation.firstElementChild;
        Object.defineProperties(product.conversation, { scrollHeight: { value: 1000 }, clientHeight: { value: 200 } });
        product.conversation.scrollTop = 40;
        product.conversation.dispatchEvent(new Event('scroll'));
        document.body.dataset.generating = 'true';
        document.dispatchEvent(new CustomEvent('atria-native-play-draft', { detail: { text: 'An unfinished reply' } }));
        await flush();
        expect(product.conversation.firstElementChild).toBe(first);
        expect(product.conversation.scrollTop).toBe(40);
        expect(product.conversation.querySelector('[data-atria-draft]').textContent).toContain('An unfinished reply');
        expect(runtime.snapshot.timeline).toHaveLength(2);
        document.body.dataset.generating = 'false';
        await flush();
        expect(product.conversation.querySelector('[data-atria-draft]')).toBeNull();
        delete document.body.dataset.generating;
        product.dispose();
    });

    test('composer preserves Enter/IME and supports modifier send without altering the generation ABI', () => {
        const clicked = jest.fn(); document.getElementById('send_but').addEventListener('click', clicked);
        const product = mountAtriaPlayProduct({ document, root: document.getElementById('host'), native: {
            sendForm: document.getElementById('send_form'), sendTextarea: document.getElementById('send_textarea'),
        } });
        product.textarea.value = 'A choice';
        product.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true, bubbles: true }));
        expect(clicked).not.toHaveBeenCalled();
        product.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(clicked).not.toHaveBeenCalled();
        product.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
        expect(clicked).toHaveBeenCalledTimes(1);
        expect(document.getElementById('send_textarea').value).toBe('A choice');
        product.dispose();
    });

    test('failed sessions recover through the existing runtime reload authority', async () => {
        runtime.failed = true;
        runtime.reload = jest.fn(async () => { runtime.failed = false; });
        const product = mountAtriaPlayProduct({ document, root: document.getElementById('host'), native: {
            sendForm: document.getElementById('send_form'), sendTextarea: document.getElementById('send_textarea'),
        } });
        expect(product.textarea.disabled).toBe(true);
        const recover = product.root.querySelector('.atria-play-session-recover');
        expect(recover.hidden).toBe(false);
        recover.click();
        await flush();
        expect(runtime.reload).toHaveBeenCalledTimes(1);
        expect(product.textarea.disabled).toBe(false);
        expect(recover.hidden).toBe(true);
        product.dispose();
    });
});
