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
    test('typed Composer uses the manual submit path and rejects busy, empty and historical writes', async () => {
        const product = mountAtriaPlayProduct({ document, root: document.getElementById('host'), native: {
            sendForm: document.getElementById('send_form'), sendTextarea: document.getElementById('send_textarea'),
        } });
        const api = product.composerApi;
        await expect(api.submit()).rejects.toThrow(/ready/);
        api.setDraft('A'); api.appendDraft('B'); expect(api.getDraft()).toBe('AB');
        runtime.history = true; await expect(api.submit()).rejects.toThrow(/ready/); runtime.history = false;
        document.body.dataset.generating = 'true'; await expect(api.submit()).rejects.toThrow(/running/); delete document.body.dataset.generating;
        await api.submit(); expect(globalThis.Atria.getContext().generate).toHaveBeenCalledTimes(1);
        api.clearDraft(); expect(api.getDraft()).toBe('');
        expect(() => api.setDraft({ html: '<script>' })).toThrow(/Invalid/);
        product.dispose();
    });
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
        const generate = jest.fn(async () => 'Generated');
        globalThis.Atria = { nativeSessionRuntime: runtime, getContext: () => ({ generate }) };
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

        expect(clicked).not.toHaveBeenCalled();
        expect(globalThis.Atria.getContext().generate).toHaveBeenCalledWith('normal');
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
        expect(product.root.querySelector('[data-atria-generation-projection]').textContent).toContain('An unfinished reply');
        expect(runtime.snapshot.timeline).toHaveLength(2);
        document.body.dataset.generating = 'false';
        await flush();
        expect(product.conversation.querySelector('[data-atria-draft]')).toBeNull();
        expect(product.root.querySelector('[data-atria-generation-projection]').hidden).toBe(true);
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
        expect(clicked).not.toHaveBeenCalled();
        expect(globalThis.Atria.getContext().generate).toHaveBeenCalledWith('normal');
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

    test.each([-1, 0, 1])('Native preference %s respects Shift, modifiers, IME and keyCode 229', async preference => {
        const generate = jest.fn(async () => {});
        const settings = { send_on_enter: preference };
        globalThis.Atria.getContext = () => ({ generate, powerUserSettings: settings });
        const product = mountAtriaPlayProduct({ document, root: document.getElementById('host'), native: {
            sendForm: document.getElementById('send_form'), sendTextarea: document.getElementById('send_textarea'),
        } });
        for (const flags of [{ shiftKey: true, ctrlKey: true }, { shiftKey: true }, { altKey: true }, { isComposing: true, ctrlKey: true }, { keyCode: 229, metaKey: true }]) {
            product.composerApi.setDraft('Keep this paragraph');
            const key = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...flags });
            product.textarea.dispatchEvent(key); await flush();
            expect(key.defaultPrevented).toBe(false);
            expect(generate).not.toHaveBeenCalled();
        }
        product.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await flush(); expect(generate).toHaveBeenCalledTimes(preference === 1 ? 1 : 0);
        generate.mockClear();
        for (const modifier of ['ctrlKey', 'metaKey']) {
            product.composerApi.setDraft('Send this choice');
            product.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', [modifier]: true, bubbles: true, cancelable: true }));
            await flush();
        }
        expect(generate).toHaveBeenCalledTimes(2);
        settings.send_on_enter = 1; product.composerApi.setDraft('Live setting');
        product.textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await flush();
        expect(generate).toHaveBeenCalledTimes(3);
        product.dispose();
    });

    test('failed unaccepted input keeps the draft; accepted input and another Session never receive it', async () => {
        const generate = jest.fn(async () => { throw new Error('Prepare failed'); });
        globalThis.Atria.getContext = () => ({ generate });
        const product = mountAtriaPlayProduct({ document, root: document.getElementById('host'), native: {
            sendForm: document.getElementById('send_form'), sendTextarea: document.getElementById('send_textarea'),
        } });
        product.composerApi.setDraft('Original input');
        await expect(product.composerApi.submit()).rejects.toThrow('Prepare failed');
        expect(product.textarea.value).toBe('Original input');
        generate.mockImplementationOnce(async () => { runtime.snapshot.revision.revisionId = 'accepted'; throw new Error('Provider failed'); });
        await expect(product.composerApi.submit()).rejects.toThrow('Provider failed');
        expect(product.textarea.value).toBe('');
        product.composerApi.setDraft('Old Session input');
        generate.mockImplementationOnce(async () => { runtime.snapshot.session.sessionId = 'other'; throw new Error('Switched'); });
        await expect(product.composerApi.submit()).rejects.toThrow('Switched');
        expect(product.textarea.value).toBe(''); product.dispose();
    });

    test('one pending submit blocks duplicate sending while keeping the real Stop action available', async () => {
        let finish;
        const stopGeneration = jest.fn();
        const generate = jest.fn(() => { document.body.dataset.generating = 'true'; return new Promise(resolve => { finish = resolve; }); });
        globalThis.Atria.getContext = () => ({ generate, stopGeneration });
        const product = mountAtriaPlayProduct({ document, root: document.getElementById('host'), native: {
            sendForm: document.getElementById('send_form'), sendTextarea: document.getElementById('send_textarea'),
        } });
        product.composerApi.setDraft('Choice'); const pending = product.composerApi.submit(); await flush();
        expect(product.textarea.disabled).toBe(true);
        await expect(product.composerApi.submit()).rejects.toThrow('running');
        const stop = product.composer.querySelector('button[type=submit]');
        expect(stop.disabled).toBe(false); expect(stop.getAttribute('aria-label')).toBe('Stop');
        stop.click(); await flush(); expect(stopGeneration).toHaveBeenCalledTimes(1); expect(generate).toHaveBeenCalledTimes(1);
        document.body.dataset.generating = 'false'; finish(); await pending;
        delete document.body.dataset.generating; product.dispose();
    });
});
