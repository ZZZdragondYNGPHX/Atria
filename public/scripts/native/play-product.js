import { markStartupReadiness } from './startup-readiness.js';
import { runtimeRequest, onRuntimeConfigurationChanged } from './runtime-client.js';
import { mountSpeechControls } from './speech-controls.js';
import { ConversationWindow } from './conversation-window.js';
import { nativeAssetUrl } from './session-projection.js';
import { openPersonaSelector } from './persona-ui.js';
import { openHostExternal } from './frontend/external.js';
import { createHeadlessConversation } from './frontend/conversation.js';
import { createPresetContentPanel } from './preset-content-panel.js';
import { processNativeDisplayRegex } from './regex-display-runtime.js';
import { getRegexScripts, REGEX_RUNTIME_SCRIPTS_CHANGED_EVENT } from '../extensions/regex/engine.js';
import { renderSafeProse } from '../../shared/native-safe-prose.js';
import { nativePlayGenerationBusy } from './play-generation.js';
import { updateIllustrationSurface, releaseIllustrationSurface } from './illustration-surfaces.js';
import { translateShellText as tl, formatShellText } from '../atria-shell/localization.js';
import { publicParticipant } from '../../shared/native-participant.js';
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
    if (entry?.participant?.kind === 'speaker') return entry.participant.displayName;
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
    role.textContent = tl(entry?.role === 'user' ? 'You' : entry?.role === 'system' ? 'System' : entry?.participant?.kind === 'speaker' ? 'Speaker' : 'Narrator');
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
    // Key hint follows the real send preference.
    const keyHint = documentRef.createElement('span');
    keyHint.className = 'atria-play-composer__hint';
    const renderKeyHint = () => {
        const enterSends = Number(globalThis.Atria?.getContext?.()?.powerUserSettings?.send_on_enter ?? 0) === 1;
        const key = label => { const node = documentRef.createElement('kbd'); node.textContent = label; return node; };
        keyHint.replaceChildren(...(enterSends ? [key('Enter')] : [key('Ctrl'), key('Enter')]), ' ' + tl('Send'));
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
    // The streaming reply reads like the committed one: same column, same prose,
    // revealed at a steady pace so network bursts never jump the page.
    const typewriter = (() => {
        const node = documentRef.createElement('article');
        node.className = 'atria-play-message'; node.dataset.role = 'assistant';
        node.dataset.atriaDraft = 'true'; node.dataset.atriaGenerationProjection = 'true';
        node.setAttribute('aria-live', 'off'); node.setAttribute('aria-busy', 'true');
        const body = documentRef.createElement('div'); body.className = 'atria-play-message__body';
        node.append(body);
        let target = '', shown = 0, frame = 0, last = 0;
        const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches || documentRef.body.classList.contains('reduced-motion');
        const paint = () => {
            renderSafeProse(body, target.slice(0, shown), { openExternal: openHostExternal });
            if (following) conversation.scrollTop = conversation.scrollHeight;
        };
        const step = time => {
            frame = 0;
            // Wall-clock based: a slow or throttled frame catches up instead of slowing the reveal.
            const elapsed = last ? Math.min(1000, time - last) : 16; last = time;
            const backlog = target.length - shown;
            if (backlog <= 0) return;
            // ~45 chars/s baseline, accelerating with the backlog so the reveal never lags far behind.
            shown = Math.min(target.length, shown + Math.max(1, Math.round(elapsed * (0.045 + backlog / 1200))));
            paint();
            frame = requestAnimationFrame(step);
        };
        return {
            get visible() { return node.isConnected && !node.hidden; },
            update(text, state) {
                if (!text) {
                    if (frame) cancelAnimationFrame(frame);
                    frame = 0; last = 0; target = ''; shown = 0;
                    node.remove(); body.replaceChildren();
                    return;
                }
                node.dataset.generationState = state;
                if (!text.startsWith(target.slice(0, shown))) shown = 0;
                target = text;
                if (node.nextSibling !== bottomSpace) conversation.insertBefore(node, bottomSpace);
                if (reduced()) { shown = target.length; paint(); return; }
                if (!frame && shown < target.length) { last = 0; frame = requestAnimationFrame(step); }
            },
        };
    })();
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
    let draftRevision = 0, composingDraft = false;
    textarea.addEventListener('input', () => { draftRevision++; resizeInput(); });
    textarea.addEventListener('compositionstart', () => { composingDraft = true; });
    textarea.addEventListener('compositionend', () => { composingDraft = false; });
    const generating = () => nativePlayGenerationBusy(activeRuntime());
    let regexVersion = 0, displayRules = getRegexScripts({ allowedOnly: true });
    const displayRequests = new Map();
    const regexChanged = () => { regexVersion++; displayRules = getRegexScripts({ allowedOnly: true }); render(); };
    documentRef.defaultView.addEventListener(REGEX_RUNTIME_SCRIPTS_CHANGED_EVENT, regexChanged);
    const updateDraft = event => {
        draftText = String(event.detail?.text || '');
        render();
    };
    documentRef.addEventListener('atria-native-play-draft', updateDraft);
    const runtimeError = documentRef.createElement('div');
    runtimeError.className = 'atri-runtime-notice'; runtimeError.hidden = true;
    runtimeError.setAttribute('role', 'alert');
    const showRuntimeError = event => {
        if (documentRef.body.dataset.atriaGameFullActive === 'true') {
            globalThis.toastr?.error(event.detail.message, '', { timeOut: 0, extendedTimeOut: 0, closeButton: true, preventDuplicates: true });
        }
        runtimeError.replaceChildren(); runtimeError.hidden = false;
        const message = documentRef.createElement('p'); message.textContent = event.detail.message;
        runtimeError.append(message);
        if (event.detail.target) {
            const action = documentRef.createElement('button'); action.type = 'button';
            action.className = 'atria-native-play-actions__button';
            const host = () => globalThis.Atria?.shell?.getWorkspaceHost?.();
            const labels = { plans: 'Open the plan library', routes: 'Open API presets', connections: 'Open services', models: 'Open models', profiles: 'Open API presets', diagnostics: 'Open diagnostics' };
            action.textContent = tl(labels[event.detail.target] ?? 'Open Runtime');
            action.addEventListener('click', () => event.detail.target === 'plans' ? host()?.openAgentSection('plans') : host()?.openRuntimeSection(event.detail.target));
            runtimeError.append(action);
        }
    };
    composerComponent.append(runtimeError);
    documentRef.addEventListener('atria-native-runtime-error', showRuntimeError);


    function render() {
        if (disposed) return;
        const runtime = activeRuntime();
        if (!generating()) draftText = '';
        const snapshot = runtime?.snapshot || null;
        contentPanel.update(snapshot);
        const active = Boolean(snapshot && runtime?.active);
        product.hidden = !active || navigation?.getRoute()?.child?.id === 'recent-stories';
        if (!active) {
            for (const request of displayRequests.values()) request.abort(); displayRequests.clear();
            resetPreparation();
            product.dataset.atriaPlayReadiness = 'inactive';
            window.clear(); resizeRows?.disconnect();
            clearSpeechControls(); renderedSession = null;
            draftText = '';
            runtimeError.hidden = true;
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
        textarea.placeholder = tl(snapshot.timeline?.at(-1)?.role === 'user' && !generating() ? 'Send to get a reply, or write more…' : 'What do you do?');
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
            for (const request of displayRequests.values()) request.abort(); displayRequests.clear();
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
        let failedResponse = conversation.querySelector('[data-preset-failed-response]');
        if (generation.originalResponse) {
            if (!failedResponse) {
                failedResponse = documentRef.createElement('details'); failedResponse.dataset.presetFailedResponse = 'true';
                const summary = documentRef.createElement('summary'); summary.textContent = tl('The reply was not in the expected format · view original'); failedResponse.append(summary);
                failedResponse.addEventListener('toggle', () => {
                    failedResponse.querySelector('pre')?.remove();
                    if (failedResponse.open) { const pre = documentRef.createElement('pre'); pre.style.whiteSpace = 'pre-wrap'; pre.textContent = failedResponse.originalResponse; failedResponse.append(pre); }
                }); conversation.append(failedResponse);
            }
            failedResponse.originalResponse = generation.originalResponse;
        } else failedResponse?.remove();
        const provisional = generation.text || draftText;
        const existing = new Map([...conversation.querySelectorAll('[data-atria-message-id]')]
            .map(node => [node.dataset.atriaMessageId, node]));
        conversation.querySelector('.atria-play-conversation__empty')?.remove();
        entries.forEach((entry, index) => {
            const id = text(entry.messageId);
            if (committedEntries.get(id)?.participant) entry = { ...entry, participant: publicParticipant(committedEntries.get(id)) };
            let node = existing.get(id);
            if (!node) {
                node = messageNode(documentRef, snapshot, { ...committedEntries.get(id), ...entry });
                // The committed reply replaces its streamed draft in place, without a second entrance.
                if (entry.role === 'assistant' && typewriter.visible) node.dataset.atriaFromDraft = 'true';
            }
            node.dataset.sequence = String(entry.sequence ?? window.from + index);
            node.setAttribute('aria-posinset', String(Number(node.dataset.sequence) + 1)); node.setAttribute('aria-setsize', String(window.total));
            existing.delete(id);
            if (entry.role === 'assistant' && (entry.participant?.kind === 'speaker' || snapshot.manifest.runtime?.experienceContract?.informationRuntime?.narration?.expression)) {
                const speakerId = entry.participant?.participantId ?? (committedEntries.get(id)?.participant ? publicParticipant(committedEntries.get(id)).participantId : entry.actorId);
                if (speechControls.has(id) && speechControls.get(id).actorId !== speakerId) { speechControls.get(id).dispose(); speechControls.delete(id); }
                if (!speechControls.has(id)) speechControls.set(id, mountSpeechControls({ document: documentRef, container: node, runtime: activeRuntime, messageId: id, actorId: speakerId }));
                speechControls.get(id).refresh();
            }

            const body = node.querySelector('.atria-play-message__body');
            const displayContent = entry.displayContent ?? entry.content;
            const depth = Math.max(0, window.total - Number(node.dataset.sequence) - 1);
            const viewIdentity = JSON.stringify([committedEntries.get(id)?.activeVariantId, regexVersion, depth]);
            if (body.dataset.canonicalText !== text(displayContent) || body.dataset.regexIdentity !== viewIdentity) {
                displayRequests.get(body)?.abort();
                const request = new AbortController(); displayRequests.set(body, request);
                delete body.dataset.regexTransformed;
                renderSafeProse(body, text(displayContent), { openExternal: openHostExternal }); body.dataset.canonicalText = text(displayContent); body.dataset.regexIdentity = viewIdentity;
                void processNativeDisplayRegex(text(displayContent), displayRules, { region: 'prose', depth, placement: entry.role === 'user' ? 1 : 2 }, { signal: request.signal }).then(result => {
                    if (disposed || request.signal.aborted || displayRequests.get(body) !== request || !body.isConnected) return;
                    displayRequests.delete(body);
                    if (result.value !== text(displayContent)) {
                        releaseIllustrationSurface(body);
                        renderSafeProse(body, result.value, { openExternal: openHostExternal });
                        body.dataset.regexTransformed = 'true';
                    }
                    node.querySelector('[data-regex-diagnostic]')?.remove();
                    if (result.diagnostics.length) {
                        const diagnostic = documentRef.createElement('p'); diagnostic.dataset.regexDiagnostic = 'true'; diagnostic.textContent = tl('A display rule could not finish; showing the original text.') + ' ' + result.diagnostics.map(item => item.ruleId + ' · ' + item.code).join('；'); node.append(diagnostic);
                    }
                });
            }
            if (body.dataset.regexTransformed || text(displayContent) !== text(committedEntries.get(id)?.content)) releaseIllustrationSurface(body);
            else updateIllustrationSurface(body, { sessionId, branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId, entry: committedEntries.get(entry.messageId), state: snapshot.illustrations, controlsTop: () => composerComponent.getBoundingClientRect().top });
            const variant = window.variants.find(item => item.variantId === committedEntries.get(id)?.activeVariantId);
            const presetMetadata = variant?.metadata?.runtime?.extra?.preset_content;
            if (presetMetadata) {
                let button = node.querySelector('[data-preset-content]');
                if (!button) { button = documentRef.createElement('button'); button.type = 'button'; button.className = 'atria-play-message__extras'; button.dataset.presetContent = 'true'; node.querySelector('header').append(button); }
                const count = variant.projection?.flow.filter(item => item.kind === 'block').length ?? 0;
                button.textContent = formatShellText(presetMetadata.status === 'partial' ? 'Extras · ${0} · format problem' : 'Extras · ${0}', [count]);
                button.dataset.problem = String(presetMetadata.status === 'partial');
                button.onclick = () => { void contentPanel.open(committedEntries.get(id), variant, button); };
            } else node.querySelector('[data-preset-content]')?.remove();
            if (!node.querySelector('[data-atria-message-blocks]')) {
                const blocks = (blocksByMessage.get(entry.messageId) ?? []).filter(block => !['preset.content', 'preset.diagnostic'].includes(block.type));
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
        for (const node of existing.values()) { resizeRows?.unobserve(node); speechControls.get(node.dataset.atriaMessageId)?.dispose(); speechControls.delete(node.dataset.atriaMessageId); const body = node.querySelector('.atria-play-message__body'); displayRequests.get(body)?.abort(); displayRequests.delete(body); releaseIllustrationSurface(body); node.remove(); }
        conversation.append(bottomSpace);
        topSpace.style.height = window.offset(window.from) + 'px';
        bottomSpace.style.height = Math.max(0, window.offset(window.total) - window.offset(window.from + entries.length)) + 'px';
        conversation.setAttribute('aria-live', following ? 'polite' : 'off');
        typewriter.update(generating() ? provisional : '', generation.state);
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
        const personaName = runtime.snapshot.states?.atri_player_persona?.solo?.snapshot.name || tl('Choose Persona');
        // The icon keeps the chip recognisable when compact layouts hide its text.
        if (persona.dataset.label !== personaName) { persona.dataset.label = personaName; persona.replaceChildren(createAtriaIcon(documentRef, 'person', { size: 15 }), personaName); }
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
        // Nothing typed: answer a message still waiting for a reply (for example after a failed turn); otherwise a no-op.
        const awaitingReply = !value && runtime?.snapshot?.timeline?.at(-1)?.role === 'user';
        if (!value && !awaitingReply) return null;
        if (!runtimeWritable(runtime)) throw new Error(tl('This story cannot take a new turn right now.'));
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
        try { return await generate('normal', { input: '', scope, operation: snapshot.entryPoint?.actorIds.length > 1 ? 'group-opening' : 'opening' }); } finally { submitting = false; render(); }
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
        async assist(operation, actorId) {
            const runtime = activeRuntime(), snapshot = runtime?.snapshot;
            if (!['impersonate', 'actor-reply'].includes(operation) || submitting || generating() || !runtimeWritable(runtime)) throw new Error('当前不可生成候选');
            if (operation === 'actor-reply' && snapshot.manifest.runtime?.experienceContract?.taskRuntime?.turn) throw new Error('此作品的角色回应由任务合同管理');
            const generate = globalThis.Atria?.getContext?.()?.generateNative;
            if (typeof generate !== 'function') throw new Error('Native generation entrypoint is unavailable');
            const scope = { sessionId: snapshot.session.sessionId, branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId };
            submitting = true; render();
            try { return await generate(operation === 'impersonate' ? 'impersonate' : 'normal', { input: '', scope, operation, actorId }); } finally { submitting = false; render(); }
        },
        getDraft: () => textarea.value,
        isComposing: () => composingDraft,
        captureDraft: () => ({ revision: draftRevision, value: textarea.value, sessionId: activeRuntime()?.snapshot?.session?.sessionId }),
        offerDraft(value, captured) {
            if (this.applyDraft(value, captured)) return true;
            textarea.parentElement.querySelector('[data-draft-candidate]')?.remove();
            const candidate = documentRef.createElement('details'), summary = documentRef.createElement('summary');
            candidate.dataset.draftCandidate = 'true'; summary.textContent = '代写完成 · 草稿已变更，点击查看候选';
            const preview = documentRef.createElement('pre'); preview.textContent = value;
            const apply = documentRef.createElement('button'); apply.type = 'button'; apply.textContent = '使用此候选';
            apply.addEventListener('click', () => {
                if (composingDraft || captured.sessionId !== activeRuntime()?.snapshot?.session?.sessionId) { summary.textContent = '当前无法应用此候选'; return; }
                this.setDraft(value); candidate.remove(); textarea.focus();
            });
            const dismiss = documentRef.createElement('button'); dismiss.type = 'button'; dismiss.textContent = '关闭'; dismiss.addEventListener('click', () => candidate.remove());
            candidate.append(summary, preview, apply, dismiss); textarea.before(candidate); return false;
        },
        applyDraft(value, captured) {
            if (composingDraft || captured.revision !== draftRevision || captured.value !== textarea.value || captured.sessionId !== activeRuntime()?.snapshot?.session?.sessionId) return false;
            this.setDraft(value); return true;
        },
        setDraft(value) { if (typeof value !== 'string' || value.length > 65536 || composingDraft) throw new Error('Invalid Composer draft'); draftRevision++; textarea.value = value; resizeInput(); },
        appendDraft(value) { this.setDraft(textarea.value + value); },
        clearDraft() { draftRevision++; textarea.value = ''; resizeInput(); },
        focus() { textarea.focus(); }, submit: submitDraft, submitCommitted,
    });
    const contentPanel = createPresetContentPanel({ document: documentRef, runtime: activeRuntime, composer: () => composerApi });
    const headless = createHeadlessConversation({ runtime: activeRuntime, composer: composerApi, stop: () => globalThis.Atria?.getContext?.()?.stopGeneration?.(), actions: { openPersonaSelector: openPicker } });
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
            contentPanel.dispose();
            documentRef.defaultView.removeEventListener(REGEX_RUNTIME_SCRIPTS_CHANGED_EVENT, regexChanged);
            for (const request of displayRequests.values()) request.abort(); displayRequests.clear();
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
