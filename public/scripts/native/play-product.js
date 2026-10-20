import { markStartupReadiness } from './startup-readiness.js';
import { runtimeRequest, onRuntimeConfigurationChanged, runtimeRemediation } from './runtime-client.js';
import { openConnectModelWizard } from './connect-model-wizard.js';
import { isTaskBindingFailure, taskBindingMessage } from './task-binding-ui.js';
import { mountSpeechControls } from './speech-controls.js';
import { ConversationWindow } from './conversation-window.js';
import { nativeAssetUrl } from './session-projection.js';
import { openPersonaSelector } from './persona-ui.js';
import { openHostExternal } from './frontend/external.js';
import { createHeadlessConversation } from './frontend/conversation.js';
import { renderSafeProse } from '../../shared/native-safe-prose.js';
import { nativePlayGenerationBusy } from './play-generation.js';
import { updateIllustrationSurface, releaseIllustrationSurface } from './illustration-surfaces.js';
import { translateShellText as tl } from '../atria-shell/localization.js';
import {
    NATIVE_SESSION_LIFECYCLE,
    onNativeSessionLifecycle,
} from './session-lifecycle.js';
import { createAtriaIcon } from '../atria-shell/icons.js';
import { rememberStartupResume } from '../atria-shell/startup-resume.js';

function text(value) {
    return String(value ?? '');
}

function activeRuntime() {
    return globalThis.Atria?.nativeSessionRuntime || null;
}

function actorName(snapshot, entry) {
    if (entry?.role === 'user') return entry?.metadata?.atri_player_identity?.name || tl('You');
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
    const avatar = documentRef.createElement('span');
    avatar.className = 'atria-play-message__avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = name.textContent.slice(0, 1);
    const identity = entry.metadata?.atri_player_identity;
    if (identity?.avatar) {
        const image = documentRef.createElement('img'); image.alt = ''; image.src = nativeAssetUrl(identity.avatar.assetId);
        image.addEventListener('error', () => image.remove(), { once: true }); avatar.append(image);
    }
    const role = documentRef.createElement('span');
    role.className = 'atria-play-message__role';
    role.textContent = tl(entry?.role === 'user' ? 'You' : entry?.role === 'system' ? 'System' : 'Narrator');
    role.hidden = role.textContent === name.textContent;
    const sequence = documentRef.createElement('span');
    sequence.className = 'atria-play-message__sequence';
    sequence.textContent = String((entry?.sequence ?? 0) + 1);
    sequence.setAttribute('aria-label', tl('Story timeline'));
    header.append(avatar, name, role, sequence);

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
    navigation,
} = {}) {
    if (!documentRef?.createElement || !root) {
        throw new Error('Atria Play Product requires a document and Play host');
    }

    const product = documentRef.createElement('section');
    product.id = 'atria-play-product';
    product.className = 'atria-play-product';
    product.dataset.atriaProductPlay = 'true';
    product.hidden = true;

    const sessionHeader = documentRef.createElement('header');
    sessionHeader.className = 'atria-play-session-header';
    sessionHeader.dataset.atriaPlaySessionHeader = 'true';
    const heading = documentRef.createElement('nav');
    heading.className = 'atria-play-session-header__identity';
    heading.setAttribute('aria-label', tl('Location'));
    const home = documentRef.createElement('button');
    home.type = 'button'; home.className = 'atria-play-crumb'; home.textContent = tl('Play');
    home.addEventListener('click', () => navigation?.navigate('play', { child: { id: 'recent-stories', label: tl('Recent stories'), kind: 'workspace' }, reason: 'recent-stories' }));
    const subtitle = documentRef.createElement('button');
    subtitle.type = 'button'; subtitle.className = 'atria-play-crumb';
    subtitle.addEventListener('click', () => {
        const session = activeRuntime()?.snapshot?.session;
        if (session?.packageId) globalThis.Atria?.shell?.getWorkspaceHost?.()?.openLibraryWork?.(session.packageId, subtitle.textContent);
    });
    const separator = () => { const node = documentRef.createElement('span'); node.className = 'atria-play-crumb-sep'; node.textContent = '/'; node.setAttribute('aria-hidden', 'true'); return node; };
    const title = documentRef.createElement('h2');
    heading.append(home, separator(), subtitle, separator(), title);
    const state = documentRef.createElement('span');
    state.className = 'atria-play-session-header__state';
    const exact = documentRef.createElement('span');
    exact.className = 'atria-seal atria-play-session-header__seal'; exact.dataset.seal = 'pinned';
    sessionHeader.append(heading, state, exact);

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
    const persona = documentRef.createElement('button');
    persona.type = 'button'; persona.className = 'atri-library-button'; persona.dataset.atriaPersonaSelect = 'true';
    persona.setAttribute('aria-label', tl('Choose Persona'));
    let picker = null;
    const openPicker = ({ revision, sessionId } = {}) => {
        picker?.close();
        picker = openPersonaSelector({ document: documentRef, runtime: activeRuntime(), expectedRevisionId: revision, sessionId });
    };
    persona.addEventListener('click', () => { try { openPicker(); } catch (error) { composerStatus.textContent = error.message; } });
    // Key hint follows the real send preference; IME composition never sends.
    const keyHint = documentRef.createElement('span');
    keyHint.className = 'atria-play-composer__hint';
    const renderKeyHint = () => {
        const enterSends = Number(globalThis.Atria?.getContext?.()?.powerUserSettings?.send_on_enter ?? 0) === 1;
        const key = label => { const node = documentRef.createElement('kbd'); node.textContent = label; return node; };
        keyHint.replaceChildren(
            ...(enterSends
                ? [key('Enter'), ' ' + tl('Send') + ' · ', key('Shift'), key('Enter'), ' ' + tl('New line')]
                : [key('Enter'), ' ' + tl('New line') + ' · ', key('Ctrl'), key('Enter'), ' ' + tl('Send')]),
            ' · ' + tl('IME composition never sends'),
        );
    };
    renderKeyHint();
    textarea.addEventListener('focus', renderKeyHint);
    composer.append(textarea, send, persona, keyHint, composerStatus, recover);
    const composerAfterSurface = createSurface(documentRef, 'composer.after');
    composerComponent.append(composerBeforeSurface, composer, composerAfterSurface);

    product.append(sessionHeader, appRootSurface, conversationComponent, composerComponent);
    root.append(product);

    function runtimeWritable(runtime) {
        return Boolean(runtime?.active && !runtime.history && !runtime.failed);
    }

    let disposed = false;
    let draftText = '';
    let renderedSession = null;
    const speechControls = new Map();
    const clearSpeechControls = () => { speechControls.forEach(control => control.dispose()); speechControls.clear(); };
    let following = true;
    let playScope, playEpoch = 0, prepared = false, preparationError, preparing, prepareController;
    const resetPreparation = () => { playEpoch++; prepareController?.abort(); prepared = false; preparationError = null; preparing = null; playScope = null; };
    const unsubscribeConfiguration = onRuntimeConfigurationChanged(() => { resetPreparation(); render(); });
    const checkPreparation = snapshot => {
        const scope = snapshot.session.sessionId + ':' + snapshot.revision.branchId;
        if (playScope !== scope) { resetPreparation(); playScope = scope; }
        if (prepared || preparing || preparationError || typeof activeRuntime()?.request !== 'function') return;
        const runtime = activeRuntime(), epoch = playEpoch, source = snapshot;
        prepareController = new AbortController();
        const context = globalThis.Atria?.getContext?.();
        const slotBindings = context?.capabilitySettings?.atri_task_bindings?.[snapshot.session.packageId] ?? {};
        preparing = runtimeRequest('/play/prepare', { method: 'POST', signal: prepareController.signal,
            body: { sessionId: snapshot.session.sessionId, revisionId: snapshot.revision.revisionId, slotBindings } }).then(result => {
            if (disposed || epoch !== playEpoch) return;
            if (runtime.snapshot !== source) { preparing = null; render(); return; }
            prepared = result.prepared === true && result.revisionId === source.revision.revisionId && result.branchId === source.revision.branchId;
            render();
        }).catch(error => {
            if (!disposed && epoch === playEpoch && !prepareController.signal.aborted) { preparationError = error.code ?? 'prepare_failed'; render(); }
        });
    };

    const topSpace = documentRef.createElement('div'), bottomSpace = documentRef.createElement('div');
    for (const spacer of [topSpace, bottomSpace]) { spacer.setAttribute('aria-hidden', 'true'); spacer.className = 'atria-play-window-spacer'; }
    const canShift = () => documentRef.getSelection?.()?.isCollapsed !== false
        && !(conversation.contains(documentRef.activeElement) && documentRef.activeElement !== conversation);
    const window = new ConversationWindow({ scroll: conversation,
        read: (snapshot, fromSequence, limit, signal) => activeRuntime()?.request?.('timeline', {
            sessionId: snapshot.session.sessionId, revisionId: snapshot.revision.revisionId, fromSequence, limit,
        }, { signal }) ?? Promise.resolve({ revisionId: snapshot.revision.revisionId, branchId: snapshot.revision.branchId,
            entries: snapshot.timeline.slice(fromSequence, fromSequence + limit) }),
        changed: () => render(), failed: error => { composerStatus.textContent = error.message; } });
    window.canShift = canShift;
    const onPressure = () => { window.pressure(); clearSpeechControls(); };
    const onVisibility = () => { if (documentRef.hidden) onPressure(); };
    documentRef.addEventListener('visibilitychange', onVisibility);
    documentRef.addEventListener('atria-memory-pressure', onPressure);
    documentRef.addEventListener('atria-native-experience-prepared', render);
    const resizeRows = typeof ResizeObserver === 'function' ? new ResizeObserver(rows => {
        const viewport = conversation.getBoundingClientRect();
        const anchor = [...conversation.querySelectorAll('[data-atria-message-id]')].find(node => node.getBoundingClientRect().bottom >= viewport.top);
        const before = anchor?.getBoundingClientRect().top;
        for (const row of rows) window.measure(Number(row.target.dataset.sequence), row.target.getBoundingClientRect().height);
        topSpace.style.height = window.offset(window.from) + 'px';
        bottomSpace.style.height = Math.max(0, window.offset(window.total) - window.offset(window.from + window.entries.length)) + 'px';
        if (following) conversation.scrollTop = conversation.scrollHeight;
        else if (anchor && before !== undefined) conversation.scrollTop += anchor.getBoundingClientRect().top - before;
    }) : null;
    const scrollToLatest = () => {
        following = true;
        window.latest();
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
    const generating = () => nativePlayGenerationBusy(activeRuntime());
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
    // Setup problems are stated before the reader writes, with the one fix that applies (blueprint §6.1).
    const setupNotice = documentRef.createElement('div');
    setupNotice.className = 'atri-runtime-notice atria-play-setup-notice'; setupNotice.hidden = true;
    setupNotice.setAttribute('role', 'status');
    composerComponent.prepend(setupNotice);
    let setupNoticeCode = null;
    const paintSetupNotice = code => {
        if (code === setupNoticeCode) return;
        setupNoticeCode = code; setupNotice.replaceChildren(); setupNotice.hidden = !code;
        if (!code) return;
        const routeProblem = isTaskBindingFailure([code]);
        const message = documentRef.createElement('p');
        message.textContent = routeProblem ? taskBindingMessage(code) : (runtimeRemediation(code)[0] || tl('This story cannot be prepared yet. Check its model setup in Runtime.'));
        const action = documentRef.createElement('button'); action.type = 'button';
        action.className = 'atria-native-play-actions__button atria-play-primary';
        const host = globalThis.Atria?.shell?.getWorkspaceHost?.();
        action.textContent = tl(routeProblem ? 'Connect a model' : 'Open Runtime');
        action.addEventListener('click', () => routeProblem
            ? openConnectModelWizard({ document: documentRef, host, onDone: () => { resetPreparation(); render(); } })
            : host?.openRuntimeSection?.('overview'));
        setupNotice.append(message, action);
    };
    documentRef.addEventListener('atria-native-runtime-error', showRuntimeError);


    function render() {
        if (disposed) return;
        const runtime = activeRuntime();
        if (!generating()) draftText = '';
        const snapshot = runtime?.snapshot || null;
        const active = Boolean(snapshot && runtime?.active);
        product.hidden = !active || navigation?.getRoute()?.child?.id === 'recent-stories';
        if (!active) {
            resetPreparation();
            product.dataset.atriaPlayReadiness = 'inactive';
            window.clear(); resizeRows?.disconnect();
            clearSpeechControls(); renderedSession = null;
            draftText = '';
            runtimeError.hidden = true; paintSetupNotice(null);
            for (const body of conversation.querySelectorAll('.atria-play-message__body')) releaseIllustrationSurface(body);
            conversation.replaceChildren();
            composerStatus.textContent = '';
            send.disabled = true;
            textarea.disabled = true;
            recover.hidden = true;
            title.textContent = tl('Play');
            subtitle.textContent = '';
            state.textContent = '';
            exact.textContent = '';
            return;
        }

        title.textContent = snapshot.session?.displayTitle || snapshot.manifest?.name || 'Native Session';
        subtitle.textContent = snapshot.manifest?.name || '';
        subtitle.hidden = !subtitle.textContent;
        subtitle.previousElementSibling.hidden = subtitle.hidden;
        exact.textContent = snapshot.manifest?.version ? 'v' + snapshot.manifest.version : '';
        exact.hidden = !exact.textContent;
        exact.title = tl('This story keeps the exact work version it started with.');
        const terminalArchive = snapshot.states?.atri_run?.status === 'dead' && snapshot.states.atri_run.mode === 'ironman';
        state.textContent = tl(terminalArchive ? 'Story ended' : runtime.history ? 'History' : runtime.failed ? 'Recovery required' : 'Live');
        state.dataset.tone = runtime.failed ? 'danger' : runtime.history ? 'neutral' : 'success';

        const sessionId = snapshot.session?.sessionId;
        if (renderedSession !== sessionId) {
            clearSpeechControls();
            for (const body of conversation.querySelectorAll('.atria-play-message__body')) releaseIllustrationSurface(body);
            conversation.replaceChildren();
            renderedSession = sessionId;
            following = true;
            textarea.value = '';
            resizeInput();
            runtimeError.hidden = true;
        }
        window.update(snapshot, following && canShift());
        checkPreparation(snapshot);
        if (topSpace.parentNode !== conversation) conversation.append(topSpace, bottomSpace);
        // Reconcile projection nodes; streaming must not replace committed prose,
        // disrupt a text selection, or drag a reader away from an earlier turn.
        let entries;
        try { entries = headless.presentationMessages(window.entries, window.variants); } catch {
            entries = headless.messages(window.entries, window.variants);
            showRuntimeError({ detail: { message: tl('Presentation Processing failed. Showing the original message.'), target: 'diagnostics' } });
        }
        const messageBlocks = headless.blocks(undefined, window.entries, window.variants);
        const committedEntries = new Map(window.entries.map(entry => [entry.messageId, entry]));
        const blocksByMessage = new Map();
        for (const block of messageBlocks) { if (!blocksByMessage.has(block.messageId)) blocksByMessage.set(block.messageId, []); blocksByMessage.get(block.messageId).push(block); }
        const generation = headless.generation();
        const provisional = generation.text || draftText;
        const existing = new Map([...conversation.querySelectorAll('[data-atria-message-id]')]
            .map(node => [node.dataset.atriaMessageId, node]));
        conversation.querySelector('.atria-play-conversation__empty')?.remove();
        entries.forEach((entry, index) => {
            const id = text(entry.messageId);
            const node = existing.get(id) || messageNode(documentRef, snapshot, { ...committedEntries.get(id), ...entry });
            node.dataset.sequence = String(entry.sequence ?? window.from + index);
            node.setAttribute('aria-posinset', String(Number(node.dataset.sequence) + 1)); node.setAttribute('aria-setsize', String(window.total));
            existing.delete(id);
            if (entry.role === 'assistant' && snapshot.manifest.runtime?.experienceContract?.informationRuntime?.narration?.expression) {
                if (speechControls.has(id) && speechControls.get(id).actorId !== entry.actorId) { speechControls.get(id).dispose(); speechControls.delete(id); }
                if (!speechControls.has(id)) speechControls.set(id, mountSpeechControls({ document: documentRef, container: node, runtime: activeRuntime, messageId: id, actorId: entry.actorId }));
                speechControls.get(id).refresh();
            }

            const body = node.querySelector('.atria-play-message__body');
            const displayContent = entry.displayContent ?? entry.content;
            if (body.dataset.canonicalText !== text(displayContent)) { renderSafeProse(body, text(displayContent), { openExternal: openHostExternal }); body.dataset.canonicalText = text(displayContent); }
            updateIllustrationSurface(body, { sessionId, branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId, entry: committedEntries.get(entry.messageId), state: snapshot.illustrations, controlsTop: () => composerComponent.getBoundingClientRect().top });
            if (!node.querySelector('[data-atria-message-blocks]')) {
                const blocks = blocksByMessage.get(entry.messageId) ?? [];
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
            if (conversation.children[index + 1] !== node) conversation.insertBefore(node, conversation.children[index + 1] || bottomSpace);
            resizeRows?.observe(node);
        });
        for (const node of existing.values()) { resizeRows?.unobserve(node); speechControls.get(node.dataset.atriaMessageId)?.dispose(); speechControls.delete(node.dataset.atriaMessageId); releaseIllustrationSurface(node.querySelector('.atria-play-message__body')); node.remove(); }
        conversation.append(bottomSpace);
        topSpace.style.height = window.offset(window.from) + 'px';
        bottomSpace.style.height = Math.max(0, window.offset(window.total) - window.offset(window.from + entries.length)) + 'px';
        conversation.setAttribute('aria-live', following ? 'polite' : 'off');
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
        if (!runtime.history && !runtime.failed && !generating() && window.from + entries.length >= window.total) {
            rememberStartupResume({ snapshot, entries, total: window.total, nameOf: entry => actorName(snapshot, entry) });
        }

        const writable = runtimeWritable(runtime) && snapshot.states?.atri_run?.status !== 'dead';
        textarea.disabled = !writable || generating() || submitting;
        persona.disabled = !writable || generating() || submitting || Boolean(runtime.generation);
        persona.textContent = runtime.snapshot.states?.atri_player_persona?.solo?.snapshot.name || tl('Choose Persona');
        send.disabled = !writable || (submitting && !generating()) || generation.state === 'cancelling';
        send.setAttribute('aria-busy', String(generation.state === 'cancelling'));
        const action = generating() ? 'Stop' : 'Send';
        if (send.getAttribute('aria-label') !== tl(action)) {
            send.setAttribute('aria-label', tl(action));
            send.title = tl(action);
            send.replaceChildren(createAtriaIcon(documentRef, action.toLowerCase()));
        }
        const game = globalThis.Atria?.getContext?.()?.getCapabilityApi?.('game-runtime');
        const rangeReady = window.loadedIdentity === window.identity;
        const blockedDialog = Boolean(documentRef.querySelector('dialog[open]'));
        const presented = product.isConnected && textarea.getClientRects().length > 0 && !product.closest('[inert]');
        const ready = writable && !textarea.disabled && prepared && rangeReady && presented && !blockedDialog && game?.isExperienceReady?.() === true;
        product.dataset.atriaPlayReadiness = ready ? 'ready' : terminalArchive || runtime.history ? 'read_only' : blockedDialog ? 'blocked_dialog' : preparationError ?? 'preparing';
        if (ready) markStartupReadiness('playReady', documentRef);
        recover.hidden = terminalArchive || (!runtime.failed && !runtime.history);
        recover.textContent = tl(runtime.failed ? 'Reload session' : 'Return to current story');
        const statusText = tl(terminalArchive ? 'This story has ended. Its history is read-only.' : runtime.failed
            ? 'This session needs recovery before you can continue.'
            : runtime.history ? 'Historical revisions are read-only.'
                : generation.state === 'preparing' ? 'Preparing reply…'
                    : generation.state === 'cancelling' ? 'Stopping…'
                        : generation.state === 'finalizing' ? 'Saving reply…' : generating() ? 'Generating…' : '');
        if (composerStatus.textContent !== statusText) composerStatus.textContent = statusText;
        paintSetupNotice(writable && !generating() && !runtime.history ? preparationError || null : null);
        queueMicrotask(() => {
            if (!disposed && following) scrollToLatest();
        });
    }

    let submitting = false;
    async function submitDraft({ revision } = {}) {
        const runtime = activeRuntime();
        if (revision && runtime?.snapshot?.revision?.revisionId !== revision) throw new Error('Composer revision changed');
        const originalDraft = textarea.value;
        const value = originalDraft.trim();
        if (submitting || generating()) throw new Error(tl('Generation is already running.'));
        if (!value || !runtimeWritable(runtime)) throw new Error(tl('Native Composer is not ready.'));
        const generate = globalThis.Atria?.getContext?.()?.generateNative;
        if (typeof generate !== 'function') throw new Error(tl('Native generation entrypoint is unavailable.'));
        submitting = true;
        textarea.value = ''; resizeInput(); following = true;
        runtimeError.hidden = true; composerStatus.textContent = tl('Generating…');
        const sessionId = runtime.snapshot.session.sessionId;
        const baseRevision = runtime.snapshot.revision.revisionId;
        const epoch = runtime.projectionEpoch;
        render();
        const scope = { sessionId, branchId: runtime.snapshot.revision.branchId, revisionId: baseRevision };
        let accepted = false;
        try { return await generate('normal', { input: value, scope, onInputAccepted: () => { accepted = true; } }); } finally {
            // Restore only unaccepted input. A committed user turn must never be sent twice.
            if (!accepted && activeRuntime() === runtime && runtime.snapshot.session.sessionId === sessionId
                && runtime.snapshot.revision.branchId === scope.branchId && runtime.projectionEpoch === epoch && !textarea.value) {
                textarea.value = originalDraft; resizeInput();
            }
            submitting = false; render();
        }
    }
    async function submitCommitted(snapshot) {
        const runtime = activeRuntime();
        const tail = snapshot?.timeline?.at(-1);
        if (submitting || generating() || !runtimeWritable(runtime)
            || runtime.snapshot.session.sessionId !== snapshot?.session?.sessionId
            || runtime.snapshot.revision.revisionId !== snapshot?.revision?.revisionId
            || tail?.role !== 'user') throw new Error('Committed Opening input is no longer current');
        const generate = globalThis.Atria?.getContext?.()?.generateNative;
        if (typeof generate !== 'function') throw new Error(tl('Native generation entrypoint is unavailable.'));
        submitting = true;
        textarea.value = ''; resizeInput(); following = true;
        const scope = { sessionId: snapshot.session.sessionId, branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId };
        try { return await generate('normal', { input: '', scope }); } finally { submitting = false; render(); }
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
        // AUTO/DISABLED use paragraphs; ENABLED also accepts plain Enter.
        const preference = Number(globalThis.Atria?.getContext?.()?.powerUserSettings?.send_on_enter ?? 0);
        if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.isComposing
            && event.keyCode !== 229 && (event.ctrlKey || event.metaKey || preference === 1)) {
            event.preventDefault();
            submit(event);
        }
    });

    const lifecycleTypes = Object.values(NATIVE_SESSION_LIFECYCLE);
    const unsubscribers = lifecycleTypes.map(type => onNativeSessionLifecycle(type, render));
    const readinessObserver = new MutationObserver(records => {
        if (records.some(record => record.type === 'attributes' ? record.target.tagName === 'DIALOG'
            : [...record.addedNodes, ...record.removedNodes].some(node => node.tagName === 'DIALOG' || node.querySelector?.('dialog')))) render();
    });
    readinessObserver.observe(documentRef.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    const bodyObserver = new MutationObserver(render);
    const unsubscribeRoute = navigation?.subscribe(render);
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
    const headless = createHeadlessConversation({ runtime: activeRuntime, composer: composerApi, stop: () => globalThis.Atria?.getContext?.()?.stopGeneration?.(), actions: { openPersonaSelector: openPicker } });
    const provisionalNode = documentRef.createElement('aside');
    provisionalNode.dataset.atriaGenerationProjection = 'true'; provisionalNode.setAttribute('aria-live', 'off');
    conversationComponent.append(provisionalNode);
    render();

    return Object.freeze({
        root: product,
        conversation,
        composer,
        textarea,
        composerApi,
        openPersonaSelector: openPicker,
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
            if (disposed) return;
            disposed = true;
            documentRef.removeEventListener('visibilitychange', onVisibility);
            documentRef.removeEventListener('atria-memory-pressure', onPressure);
            documentRef.removeEventListener('atria-native-experience-prepared', render);
            resetPreparation(); unsubscribeConfiguration();
            unsubscribeRoute?.();
            window.dispose(); resizeRows?.disconnect();
            clearSpeechControls(); picker?.close();
            documentRef.removeEventListener('atria-native-play-draft', updateDraft);
            documentRef.removeEventListener('atria-native-runtime-error', showRuntimeError);
            bodyObserver.disconnect(); readinessObserver.disconnect();
            for (const unsubscribe of unsubscribers) unsubscribe();
            composer.removeEventListener('submit', submit);
            for (const body of conversation.querySelectorAll('.atria-play-message__body')) releaseIllustrationSurface(body);
            product.remove();
        },
    });
}
