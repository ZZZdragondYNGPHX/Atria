import { openHostExternal } from './frontend/external.js';
import { createHeadlessConversation } from './frontend/conversation.js';
import { renderSafeProse } from '../../shared/native-safe-prose.js';
import { renderNarrativeIllustrations } from './illustration-renderer.js';
import { translateShellText as tl } from '../atria-shell/localization.js';
import {
    NATIVE_SESSION_LIFECYCLE,
    onNativeSessionLifecycle,
} from './session-lifecycle.js';
import { createAtriaIcon } from '../atria-shell/icons.js';

function text(value) {
    return String(value ?? '');
}

function activeRuntime() {
    return globalThis.Atria?.nativeSessionRuntime || null;
}

function actorName(snapshot, entry) {
    if (entry?.role === 'user') return tl('You');
    if (entry?.role === 'system') return tl('System');
    const actor = (snapshot?.manifest?.actors || []).find(item => item.actorId === entry?.actorId);
    return actor?.displayName || snapshot?.manifest?.name || 'Narrator';
}

function messageNode(documentRef, snapshot, entry) {
    const article = documentRef.createElement('article');
    article.className = 'atria-play-message';
    article.dataset.atriaMessageId = text(entry?.messageId);
    article.dataset.role = text(entry?.role || 'assistant');

    const header = documentRef.createElement('header');
    header.className = 'atria-play-message__header';
    const name = documentRef.createElement('strong');
    name.textContent = actorName(snapshot, entry);
    header.append(name);

    const body = documentRef.createElement('div');
    body.className = 'atria-play-message__body';
    renderSafeProse(body, text(entry?.content), { openExternal: openHostExternal });

    article.append(header, body);
    return article;
}

function createSurface(documentRef, id) {
    const node = documentRef.createElement('div');
    node.className = 'atria-play-product-surface';
    node.dataset.atriaProductSurface = id;
    return node;
}

export function mountAtriaPlayProduct({
    document: documentRef = globalThis.document,
    root,
    native,
} = {}) {
    if (!documentRef?.createElement || !root || !native?.sendTextarea || !native?.sendForm) {
        throw new Error('Atria Play Product requires the Play host and Native generation ABI');
    }

    const product = documentRef.createElement('section');
    product.id = 'atria-play-product';
    product.className = 'atria-play-product';
    product.dataset.atriaProductPlay = 'true';
    product.hidden = true;

    const sessionHeader = documentRef.createElement('header');
    sessionHeader.className = 'atria-play-session-header';
    sessionHeader.dataset.atriaPlaySessionHeader = 'true';
    const heading = documentRef.createElement('div');
    heading.className = 'atria-play-session-header__identity';
    const title = documentRef.createElement('h2');
    const subtitle = documentRef.createElement('p');
    heading.append(title, subtitle);
    const state = documentRef.createElement('span');
    state.className = 'atria-play-session-header__state';
    sessionHeader.append(heading, state);

    const appRootSurface = createSurface(documentRef, 'app.root');

    const conversationComponent = documentRef.createElement('section');
    conversationComponent.className = 'atria-play-conversation-component';
    conversationComponent.dataset.atriaNativeProductComponent = 'conversation';
    const chatHeaderSurface = createSurface(documentRef, 'chat.header');
    const conversation = documentRef.createElement('main');
    conversation.id = 'atria-play-conversation';
    conversation.className = 'atria-play-conversation';
    conversation.dataset.atriaConversation = 'native';
    conversation.setAttribute('role', 'log');
    conversation.setAttribute('aria-live', 'polite');
    conversation.setAttribute('aria-label', tl('Conversation'));
    conversation.tabIndex = 0;
    const latest = documentRef.createElement('button');
    latest.type = 'button';
    latest.className = 'atria-play-latest';
    latest.textContent = tl('Jump to latest');
    latest.hidden = true;
    const chatFooterSurface = createSurface(documentRef, 'chat.footer');
    conversationComponent.append(chatHeaderSurface, conversation, latest, chatFooterSurface);

    const composerComponent = documentRef.createElement('section');
    composerComponent.className = 'atria-play-composer-component';
    composerComponent.dataset.atriaNativeProductComponent = 'composer';
    const composerBeforeSurface = createSurface(documentRef, 'composer.before');
    const composer = documentRef.createElement('form');
    composer.id = 'atria-play-composer';
    composer.className = 'atria-play-composer';
    composer.dataset.atriaComposer = 'native';
    const textarea = documentRef.createElement('textarea');
    textarea.className = 'atria-play-composer__input';
    textarea.rows = 1;
    textarea.name = 'message';
    textarea.autocomplete = 'off';
    textarea.placeholder = tl('What do you do?');
    textarea.setAttribute('aria-label', tl('Message'));
    const send = documentRef.createElement('button');
    send.type = 'submit';
    send.className = 'atria-play-composer__send';
    send.setAttribute('aria-label', tl('Send'));
    send.append(createAtriaIcon(documentRef, 'send'));
    const composerStatus = documentRef.createElement('span');
    composerStatus.className = 'atria-play-composer__status';
    composerStatus.setAttribute('role', 'status');
    const recover = documentRef.createElement('button');
    recover.type = 'button';
    recover.className = 'atria-play-session-recover';
    recover.hidden = true;
    recover.addEventListener('click', async () => {
        const runtime = activeRuntime();
        recover.disabled = true;
        try {
            if (runtime?.failed) await runtime.reload();
            else await globalThis.Atria?.openNativeSession?.(runtime?.snapshot?.session?.sessionId);
            render();
        } catch (error) {
            composerStatus.textContent = error?.message || String(error);
        } finally { recover.disabled = false; }
    });
    composer.append(textarea, send, composerStatus, recover);
    const composerAfterSurface = createSurface(documentRef, 'composer.after');
    composerComponent.append(composerBeforeSurface, composer, composerAfterSurface);

    product.append(sessionHeader, appRootSurface, conversationComponent, composerComponent);
    root.append(product);

    function runtimeWritable(runtime) {
        return Boolean(runtime?.active && !runtime.history && !runtime.failed);
    }

    let draftText = '';
    let renderedSession = null;
    let following = true;
    const scrollToLatest = () => {
        following = true;
        conversation.scrollTop = conversation.scrollHeight;
        latest.hidden = true;
    };
    latest.addEventListener('click', scrollToLatest);
    conversation.addEventListener('scroll', () => {
        following = conversation.scrollHeight - conversation.scrollTop - conversation.clientHeight < 64;
        latest.hidden = following;
    }, { passive: true });
    const resizeInput = () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
    };
    textarea.addEventListener('input', resizeInput);
    const generating = () => documentRef.body.dataset.generating === 'true';
    const updateDraft = event => {
        draftText = String(event.detail?.text || '');
        render();
    };
    documentRef.addEventListener('atria-native-play-draft', updateDraft);
    const runtimeError = documentRef.createElement('div');
    runtimeError.className = 'atri-runtime-notice'; runtimeError.hidden = true;
    runtimeError.setAttribute('role', 'alert');
    const showRuntimeError = event => {
        runtimeError.replaceChildren(); runtimeError.hidden = false;
        const message = documentRef.createElement('p'); message.textContent = event.detail.message;
        const action = documentRef.createElement('button'); action.type = 'button';
        action.className = 'atria-native-play-actions__button';
        action.textContent = tl('Open Runtime') + ' ' + event.detail.target;
        action.addEventListener('click', () => globalThis.Atria?.shell?.getWorkspaceHost?.()?.openRuntimeSection(event.detail.target));
        runtimeError.append(message, action);
    };
    composerComponent.append(runtimeError);
    documentRef.addEventListener('atria-native-runtime-error', showRuntimeError);


    function render() {
        const runtime = activeRuntime();
        if (!generating()) draftText = '';
        const snapshot = runtime?.snapshot || null;
        const active = Boolean(snapshot && runtime?.active);
        product.hidden = !active;
        if (!active) {
            renderedSession = null;
            draftText = '';
            runtimeError.hidden = true;
            conversation.replaceChildren();
            composerStatus.textContent = '';
            send.disabled = true;
            textarea.disabled = true;
            recover.hidden = true;
            title.textContent = tl('Play');
            subtitle.textContent = '';
            state.textContent = '';
            return;
        }

        title.textContent = snapshot.session?.displayTitle || snapshot.manifest?.name || 'Native Session';
        subtitle.textContent = [
            snapshot.manifest?.name,
            snapshot.manifest?.version,
        ].filter(Boolean).join(' · ');
        state.textContent = tl(runtime.history ? 'History' : runtime.failed ? 'Recovery required' : 'Live');
        state.dataset.tone = runtime.failed ? 'danger' : runtime.history ? 'neutral' : 'success';

        const sessionId = snapshot.session?.sessionId;
        if (renderedSession !== sessionId) {
            conversation.replaceChildren();
            renderedSession = sessionId;
            following = true;
            textarea.value = '';
            resizeInput();
            runtimeError.hidden = true;
        }
        // Reconcile projection nodes; streaming must not replace committed prose,
        // disrupt a text selection, or drag a reader away from an earlier turn.
        const entries = headless.messages(), messageBlocks = headless.blocks();
        const committedEntries = new Map(snapshot.timeline.map(entry => [entry.messageId, entry]));
        const generation = headless.generation();
        const provisional = generation.text || draftText;
        const existing = new Map([...conversation.querySelectorAll('[data-atria-message-id]')]
            .map(node => [node.dataset.atriaMessageId, node]));
        conversation.querySelector('.atria-play-conversation__empty')?.remove();
        entries.forEach((entry, index) => {
            const id = text(entry.messageId);
            const node = existing.get(id) || messageNode(documentRef, snapshot, entry);
            existing.delete(id);
            const body = node.querySelector('.atria-play-message__body');
            if (body.dataset.canonicalText !== text(entry.content)) { renderSafeProse(body, text(entry.content), { openExternal: openHostExternal }); body.dataset.canonicalText = text(entry.content); }
            renderNarrativeIllustrations(body, committedEntries.get(entry.messageId), snapshot.illustrations);
            if (!node.querySelector('[data-atria-message-blocks]')) {
                const blocks = messageBlocks.filter(block => block.messageId === entry.messageId);
                const blockRoot = documentRef.createElement('section'); blockRoot.dataset.atriaMessageBlocks = 'true';
                for (const block of blocks) {
                    const card = documentRef.createElement('article'), title = documentRef.createElement('h4'), data = documentRef.createElement('dl');
                    card.dataset.blockType = block.type; card.dataset.blockId = block.id; title.textContent = block.type;
                    for (const [key, value] of Object.entries(block.data)) {
                        const label = documentRef.createElement('dt'), detail = documentRef.createElement('dd'); label.textContent = key;
                        detail.textContent = typeof value === 'string' ? value : JSON.stringify(value); data.append(label, detail);
                    }
                    card.append(title, data); blockRoot.append(card);
                }
                node.append(blockRoot);
            }
            if (conversation.children[index] !== node) conversation.insertBefore(node, conversation.children[index] || null);
        });
        for (const node of existing.values()) node.remove();
        provisionalNode.hidden = !generating() || !provisional;
        provisionalNode.textContent = provisional;
        provisionalNode.dataset.generationState = generation.state;
        if (!entries.length) {
            const empty = documentRef.createElement('div');
            empty.className = 'atria-play-conversation__empty';
            const heading = documentRef.createElement('h3');
            heading.textContent = tl('Your story starts here');
            const hint = documentRef.createElement('p');
            hint.textContent = tl('Write your first action to begin.');
            empty.append(heading, hint);
            conversation.append(empty);
        }

        const writable = runtimeWritable(runtime);
        textarea.disabled = !writable || generating();
        send.disabled = !writable;
        const action = generating() ? 'Stop' : 'Send';
        if (send.getAttribute('aria-label') !== tl(action)) {
            send.setAttribute('aria-label', tl(action));
            send.title = tl(action);
            send.replaceChildren(createAtriaIcon(documentRef, action.toLowerCase()));
        }
        recover.hidden = !runtime.failed && !runtime.history;
        recover.textContent = tl(runtime.failed ? 'Reload session' : 'Return to current story');
        composerStatus.textContent = tl(runtime.failed
            ? 'This session needs recovery before you can continue.'
            : runtime.history ? 'Historical revisions are read-only.' : generating() ? 'Generating…' : '');
        queueMicrotask(() => {
            if (following) scrollToLatest();
        });
    }

    let submitting = false;
    async function submitDraft({ revision } = {}) {
        const runtime = activeRuntime();
        if (revision && runtime?.snapshot?.revision?.revisionId !== revision) throw new Error('Composer revision changed');
        const value = textarea.value.trim();
        if (submitting || generating()) throw new Error(tl('Generation is already running.'));
        if (!value || !runtimeWritable(runtime)) throw new Error(tl('Native Composer is not ready.'));
        const generate = globalThis.Atria?.getContext?.()?.generate;
        if (typeof generate !== 'function') throw new Error(tl('Native generation entrypoint is unavailable.'));
        submitting = true;
        native.sendTextarea.value = value;
        native.sendTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.value = ''; resizeInput(); following = true;
        runtimeError.hidden = true; composerStatus.textContent = tl('Generating…');
        try { return await generate('normal'); } finally { submitting = false; render(); }
    }
    async function submitCommitted(snapshot) {
        const runtime = activeRuntime();
        const tail = snapshot?.timeline?.at(-1);
        if (submitting || generating() || !runtimeWritable(runtime)
            || runtime.snapshot.session.sessionId !== snapshot?.session?.sessionId
            || runtime.snapshot.revision.revisionId !== snapshot?.revision?.revisionId
            || tail?.role !== 'user') throw new Error('Committed Opening input is no longer current');
        const generate = globalThis.Atria?.getContext?.()?.generate;
        if (typeof generate !== 'function') throw new Error(tl('Native generation entrypoint is unavailable.'));
        submitting = true;
        native.sendTextarea.value = '';
        native.sendTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.value = ''; resizeInput(); following = true;
        try { return await generate('normal'); } finally { submitting = false; render(); }
    }
    function submit(event) {
        event.preventDefault();
        if (generating()) {
            void headless.invoke({ service: 'host.conversation', method: 'cancel' }, {}, activeRuntime()?.snapshot?.revision?.revisionId).catch(error => { composerStatus.textContent = error.message; });
            return;
        }
        void headless.invoke({ service: 'host.composer', method: 'submit' }, {}, activeRuntime()?.snapshot?.revision?.revisionId).catch(error => { composerStatus.textContent = error.message; });
    }

    composer.addEventListener('submit', submit);
    textarea.addEventListener('keydown', event => {
        // Keep Enter for paragraphs and IME composition; explicit modifier sends.
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
            event.preventDefault();
            submit(event);
        }
    });

    const lifecycleTypes = Object.values(NATIVE_SESSION_LIFECYCLE);
    const unsubscribers = lifecycleTypes.map(type => onNativeSessionLifecycle(type, render));
    const bodyObserver = new MutationObserver(render);
    bodyObserver.observe(documentRef.body, {
        attributes: true,
        attributeFilter: ['data-atria-native-session-active', 'data-generating'],
    });

    const surfaces = new Map([
        ['app.root', appRootSurface],
        ['chat.header', chatHeaderSurface],
        ['chat.footer', chatFooterSurface],
        ['composer.before', composerBeforeSurface],
        ['composer.after', composerAfterSurface],
    ]);
    const components = new Map([
        ['conversation', conversationComponent],
        ['composer', composerComponent],
    ]);

    const composerApi = Object.freeze({
        getDraft: () => textarea.value,
        setDraft(value) { if (typeof value !== 'string' || value.length > 65536) throw new Error('Invalid Composer draft'); textarea.value = value; resizeInput(); },
        appendDraft(value) { this.setDraft(textarea.value + value); },
        clearDraft() { textarea.value = ''; resizeInput(); },
        focus() { textarea.focus(); }, submit: submitDraft, submitCommitted,
    });
    const headless = createHeadlessConversation({ runtime: activeRuntime, composer: composerApi, generate: type => globalThis.Atria?.getContext?.()?.generate?.(type), stop: () => globalThis.Atria?.getContext?.()?.stopGeneration?.() });
    const provisionalNode = documentRef.createElement('aside');
    provisionalNode.dataset.atriaGenerationProjection = 'true'; provisionalNode.setAttribute('role', 'status');
    conversationComponent.append(provisionalNode);
    render();

    return Object.freeze({
        root: product,
        conversation,
        composer,
        textarea,
        composerApi,
        headless,
        sessionHeader,
        getComponent(id) {
            return components.get(String(id || '').trim()) || null;
        },
        resolveSurface(id) {
            return surfaces.get(String(id || '').trim()) || null;
        },
        refresh: render,
        dispose() {
            documentRef.removeEventListener('atria-native-play-draft', updateDraft);
            documentRef.removeEventListener('atria-native-runtime-error', showRuntimeError);
            bodyObserver.disconnect();
            for (const unsubscribe of unsubscribers) unsubscribe();
            composer.removeEventListener('submit', submit);
            product.remove();
        },
    });
}
