import {
    NATIVE_SESSION_LIFECYCLE,
    onNativeSessionLifecycle,
} from './session-lifecycle.js';

function text(value) {
    return String(value ?? '');
}

function activeRuntime() {
    return globalThis.Atria?.nativeSessionRuntime || null;
}

function actorName(snapshot, entry) {
    if (entry?.role === 'user') return 'You';
    if (entry?.role === 'system') return 'System';
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
    const role = documentRef.createElement('span');
    role.textContent = text(entry?.role || 'assistant');
    header.append(name, role);

    const body = documentRef.createElement('div');
    body.className = 'atria-play-message__body';
    body.textContent = text(entry?.content);

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
    conversation.setAttribute('aria-label', 'Conversation');
    const chatFooterSurface = createSurface(documentRef, 'chat.footer');
    conversationComponent.append(chatHeaderSurface, conversation, chatFooterSurface);

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
    textarea.rows = 2;
    textarea.placeholder = 'What do you do?';
    textarea.setAttribute('aria-label', 'Message');
    const send = documentRef.createElement('button');
    send.type = 'submit';
    send.className = 'atria-play-composer__send';
    send.textContent = 'Send';
    const composerStatus = documentRef.createElement('span');
    composerStatus.className = 'atria-play-composer__status';
    composerStatus.setAttribute('role', 'status');
    composer.append(textarea, send, composerStatus);
    const composerAfterSurface = createSurface(documentRef, 'composer.after');
    composerComponent.append(composerBeforeSurface, composer, composerAfterSurface);

    product.append(sessionHeader, appRootSurface, conversationComponent, composerComponent);
    root.append(product);

    function runtimeWritable(runtime) {
        return Boolean(runtime?.active && !runtime.history && !runtime.failed);
    }

    let draftText = '';
    const generating = () => documentRef.body.dataset.generating === 'true';
    const updateDraft = event => {
        draftText = String(event.detail?.text || '');
        render();
    };
    documentRef.addEventListener('atria-native-play-draft', updateDraft);
    const runtimeError = documentRef.createElement('div');
    runtimeError.className = 'atri-runtime-notice'; runtimeError.hidden = true;
    const showRuntimeError = event => {
        runtimeError.replaceChildren(); runtimeError.hidden = false;
        const message = documentRef.createElement('p'); message.textContent = event.detail.message;
        const action = documentRef.createElement('button'); action.type = 'button';
        action.textContent = 'Open Runtime ' + event.detail.target;
        action.addEventListener('click', () => globalThis.Atria?.shell?.getWorkspaceHost?.()?.openRuntimeSection(event.detail.target));
        runtimeError.append(message, action);
    };
    composerComponent.append(runtimeError);
    documentRef.addEventListener('atria-native-runtime-error', showRuntimeError);


    function render() {
        const runtime = activeRuntime();
        const snapshot = runtime?.snapshot || null;
        const active = Boolean(snapshot && runtime?.active);
        product.hidden = !active;
        if (!active) {
            conversation.replaceChildren();
            composerStatus.textContent = '';
            send.disabled = true;
            textarea.disabled = true;
            title.textContent = 'Play';
            subtitle.textContent = '';
            state.textContent = '';
            return;
        }

        title.textContent = snapshot.session?.displayTitle || snapshot.manifest?.name || 'Native Session';
        subtitle.textContent = [
            snapshot.manifest?.name,
            snapshot.manifest?.version,
        ].filter(Boolean).join(' · ');
        state.textContent = runtime.history ? 'History' : runtime.failed ? 'Recovery required' : 'Live';
        state.dataset.tone = runtime.failed ? 'danger' : runtime.history ? 'neutral' : 'success';

        const fragment = documentRef.createDocumentFragment();
        for (const entry of snapshot.timeline || []) {
            fragment.append(messageNode(documentRef, snapshot, entry));
        }
        if (generating() && draftText) {
            const draft = messageNode(documentRef, snapshot, { role: 'assistant', content: draftText });
            draft.dataset.atriaDraft = 'true';
            fragment.append(draft);
        }
        if (!(snapshot.timeline || []).length) {
            const empty = documentRef.createElement('div');
            empty.className = 'atria-play-conversation__empty';
            empty.textContent = 'This session has no committed turns yet.';
            fragment.append(empty);
        }
        conversation.replaceChildren(fragment);

        const writable = runtimeWritable(runtime);
        textarea.disabled = !writable || generating();
        send.disabled = !writable;
        send.textContent = generating() ? 'Stop' : 'Send';
        composerStatus.textContent = runtime.failed
            ? 'Native Session write barrier requires recovery.'
            : runtime.history ? 'Historical revisions are read-only.' : generating() ? 'Generating…' : '';
        queueMicrotask(() => {
            conversation.scrollTop = conversation.scrollHeight;
        });
    }

    function submit(event) {
        event.preventDefault();
        if (generating()) {
            globalThis.Atria?.getContext?.()?.stopGeneration?.();
            return;
        }
        const runtime = activeRuntime();
        const value = textarea.value.trim();
        if (!value || !runtimeWritable(runtime)) return;

        native.sendTextarea.value = value;
        native.sendTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        const sendButton = native.sendForm.querySelector('#send_but');
        if (!sendButton) {
            composerStatus.textContent = 'Native generation entrypoint is unavailable.';
            return;
        }
        textarea.value = '';
        composerStatus.textContent = 'Generating…';
        sendButton.click();
    }

    composer.addEventListener('submit', submit);

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

    render();

    return Object.freeze({
        root: product,
        conversation,
        composer,
        textarea,
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
