import { formatAtriaDate } from '../atria-shell/components.js';
import { translateShellText as t, formatShellText as f } from '../atria-shell/localization.js';
import { confirmAtriaDraftLeave } from '../atria-shell/workspace-leave-guard.js';
import { createIllustrationDraft, composeIllustrationPrompt, speakerDrawingCharacter } from '../../shared/illustration-plugin-contract.js';
import { supportsNegativePrompt } from '../../shared/image-service-catalog.js';
import { nativeAssetUrl } from './session-projection.js';
import { ILLUSTRATION_EXPERIENCE_CSS } from './illustration-style.js';
import { createIllustrationFlow, illustrationErrorText, isSettingsError } from './illustration-flow.js';
import { loadIllustrationConfig, illustrationReadiness, mountIllustrationSetup, updateIllustrationSettings } from './illustration-setup.js';
import { mountIllustrationCharacters } from './illustration-characters.js';
import { mountTagEditor } from './illustration-tags.js';
import { mountIllustrationRetouch } from './illustration-retouch.js';
import { el, icon, action, iconButton, field, input, details, facts, thumbUrl, phaseText } from './illustration-kit.js';

// While open, the panel/sheet sits above the shell's edge dock (z-index 44) but below shell dialogs.
const OPEN_LAYER = '45';
const TABS = [['story', 'This story'], ['gallery', 'Gallery'], ['characters', 'Cast'], ['settings', 'Settings']];

export async function activate(sdk) {
    const doc = globalThis.document, win = doc.defaultView;
    const context = sdk.context;
    const writable = Boolean(context.sessionId && !context.historical);
    const root = el(doc, 'div', { className: 'atri-ill', attrs: { 'data-atria-official-illustration': 'true' } });
    sdk.ui.mount(root); sdk.ui.style(ILLUSTRATION_EXPERIENCE_CSS);
    const shellRoot = globalThis.Atria?.shell?.getRoot?.();
    if (shellRoot) { shellRoot.append(root); Object.assign(root.style, { position: 'absolute', inset: '0', zIndex: '5', pointerEvents: 'none' }); }

    let config = null, ready = null, open = false, tab = 'story', detailId = null, focusVersion = null, editing = false, disposed = false;
    let pending = null, view = null, retouch = null, statusTimer = null, lastView = '';
    let suggestions = [], suggestionsLoaded = false;

    // ── Floating controls ────────────────────────────────────────────────
    // Compact icon launcher. Drag it to either side; the spot is a per-viewer convenience.
    const launcher = el(doc, 'button', { className: 'atri-ill-launcher', attrs: { type: 'button', 'aria-expanded': 'false', 'aria-haspopup': 'dialog', 'aria-controls': 'atri-ill-panel',
        'aria-label': t('Illustrations'), title: t('Illustrations · drag to move'), 'aria-keyshortcuts': 'Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight' },
        on: { click: event => { if (dragMoved) { event.preventDefault(); dragMoved = false; return; } if (open) close(); else void show(); } } }, [icon(doc, 'image', 19)]);
    const dot = el(doc, 'span', { className: 'atri-ill-dot', attrs: { hidden: true, 'aria-hidden': 'true' } }); launcher.append(dot);
    const chip = el(doc, 'button', { className: 'atri-ill-chip', attrs: { type: 'button', hidden: true, 'aria-label': t('Illustrate'), title: t('Illustrate') + ' (Alt+I)' },
        on: { mousedown: event => event.preventDefault(), click: () => void illustrateSelection() } }, [icon(doc, 'sparkles', 17)]);
    chip.setAttribute('aria-keyshortcuts', 'Alt+I');
    const SPOT_KEY = 'atria.illustrations.launcher';
    let spot = null, dragMoved = false;
    try { const saved = JSON.parse(win.localStorage.getItem(SPOT_KEY) || 'null'); if (saved && ['left', 'right'].includes(saved.side) && Number.isFinite(saved.bottom)) spot = saved; } catch { /* storage unavailable */ }
    function applySpot() {
        launcher.dataset.side = spot?.side ?? 'right';
        if (spot) launcher.style.setProperty('--atri-ill-launch-bottom', Math.max(16, Math.min(win.innerHeight - 112, spot.bottom)) + 'px');
        else launcher.style.removeProperty('--atri-ill-launch-bottom');
        placePanel();
    }
    // The right-hand panel ends just above the bottom launcher; a launcher raised beside it would be covered, so the panel opens on the left instead.
    function placePanel() {
        const sheet = root.querySelector('.atri-ill-panel');
        if (!sheet) return;
        const button = launcher.getBoundingClientRect(), panelBottom = win.innerHeight - (parseFloat(win.getComputedStyle(root).getPropertyValue('--atri-ill-inset')) || 16) - 52;
        sheet.dataset.side = launcher.dataset.side === 'right' && button.top < panelBottom ? 'left' : 'right';
    }
    function saveSpot(next) {
        spot = next; applySpot();
        try { if (next) win.localStorage.setItem(SPOT_KEY, JSON.stringify(next)); else win.localStorage.removeItem(SPOT_KEY); } catch { /* storage unavailable */ }
    }
    applySpot();
    launcher.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        const start = { x: event.clientX, y: event.clientY }, rect = launcher.getBoundingClientRect();
        const grab = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        let dragging = false; dragMoved = false;
        const move = moveEvent => {
            if (!dragging && Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y) < 6) return;
            if (!dragging) { dragging = true; launcher.dataset.dragging = 'true'; doc.documentElement.style.userSelect = 'none'; doc.getSelection()?.removeAllRanges(); }
            const left = Math.max(8, Math.min(win.innerWidth - rect.width - 8, moveEvent.clientX - grab.x));
            const top = Math.max(8, Math.min(win.innerHeight - rect.height - 8, moveEvent.clientY - grab.y));
            Object.assign(launcher.style, { left: left + 'px', top: top + 'px', right: 'auto', bottom: 'auto' });
        };
        const end = upEvent => {
            win.removeEventListener('pointermove', move); win.removeEventListener('pointerup', end); win.removeEventListener('pointercancel', end);
            if (!dragging) return;
            // The click that follows this pointerup is the drop, not a press; clear the flag if none arrives.
            dragMoved = true; win.setTimeout(() => { dragMoved = false; }, 0); delete launcher.dataset.dragging; doc.documentElement.style.removeProperty('user-select');
            const box = launcher.getBoundingClientRect();
            for (const key of ['left', 'top', 'right', 'bottom']) launcher.style.removeProperty(key);
            // Snap to the nearer side; the height is kept.
            saveSpot({ side: upEvent.clientX < win.innerWidth / 2 ? 'left' : 'right', bottom: Math.round(win.innerHeight - box.bottom) });
        };
        // Track on the window: a quick first move can leave the 44px button before any capture.
        win.addEventListener('pointermove', move); win.addEventListener('pointerup', end); win.addEventListener('pointercancel', end);
    });
    // Keyboard: Alt+Arrow moves the launcher, Alt+Home puts it back.
    launcher.addEventListener('keydown', event => {
        if (!event.altKey || event.ctrlKey || event.metaKey) return;
        const current = spot ?? { side: 'right', bottom: Math.round(win.innerHeight - launcher.getBoundingClientRect().bottom) };
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') saveSpot({ ...current, side: event.key === 'ArrowLeft' ? 'left' : 'right' });
        else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') saveSpot({ ...current, bottom: current.bottom + (event.key === 'ArrowUp' ? 48 : -48) });
        else if (event.key === 'Home') saveSpot(null);
        else return;
        event.preventDefault(); event.stopPropagation();
    });
    sdk.events.listen(win, 'resize', applySpot);
    const panel = el(doc, 'aside', { className: 'atri-ill-panel', attrs: { id: 'atri-ill-panel', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'atri-ill-title', hidden: true, 'data-atria-owns-escape': 'true' } });
    root.append(launcher, chip, panel);
    for (const node of [launcher, chip, panel]) node.style.pointerEvents = 'auto';
    // Arrow keys inside the panel (tabs, versions, sliders) must not reach the story's swipe shortcuts.
    panel.addEventListener('keydown', event => { if (event.key.startsWith('Arrow')) event.stopPropagation(); });
    // A reading preference for this viewer: hide every generated image in the story without
    // changing which version each passage shows.
    const VIEW_KEY = 'atria.illustrations.hidden';
    let imagesHidden = false;
    try { imagesHidden = win.localStorage.getItem(VIEW_KEY) === 'true'; } catch { /* storage unavailable */ }
    const visibility = el(doc, 'button', { className: 'atri-ill-icon-btn', attrs: { type: 'button', 'aria-label': t('Hide images in the story'), title: t('Hide images in the story') },
        on: { click: () => {
            imagesHidden = !imagesHidden; try { win.localStorage.setItem(VIEW_KEY, String(imagesHidden)); } catch { /* storage unavailable */ }
            applyImageVisibility(); say(imagesHidden ? t('Images are hidden in the story. Nothing was deleted.') : t('Images are shown in the story.'));
        } } });
    function applyImageVisibility() {
        doc.documentElement.classList.toggle('atri-illustrations-hidden', imagesHidden);
        visibility.setAttribute('aria-pressed', String(imagesHidden));
        visibility.replaceChildren(icon(doc, imagesHidden ? 'eye-off' : 'eye'));
    }
    applyImageVisibility();
    sdk.onDispose(() => doc.documentElement.classList.remove('atri-illustrations-hidden'));
    const head = el(doc, 'div', { className: 'atri-ill-head' }, [el(doc, 'h2', { text: t('Illustrations'), attrs: { id: 'atri-ill-title' } }), visibility, iconButton(doc, t('Close'), 'close', () => close())]);
    const tabs = el(doc, 'div', { className: 'atri-ill-tabs', attrs: { role: 'tablist', 'aria-label': t('Illustration sections') } });
    const status = el(doc, 'div', { className: 'atri-ill-status', attrs: { role: 'status', 'aria-live': 'polite' } });
    const body = el(doc, 'div', { className: 'atri-ill-body', attrs: { role: 'tabpanel', tabindex: '-1' } });
    panel.append(head, tabs, status, body);

    const say = (text, kind = 'info', actionLabel = null, onAction = null) => {
        clearTimeout(statusTimer);
        status.replaceChildren(...(text ? [el(doc, 'span', { text }), actionLabel ? action(doc, actionLabel, onAction, { size: 'sm', variant: 'plain' }) : null] : []).filter(Boolean));
        status.dataset.kind = kind; status.setAttribute('role', kind === 'error' ? 'alert' : 'status');
        if (text && kind !== 'error') statusTimer = setTimeout(() => { if (!disposed) status.replaceChildren(); }, 6000);
    };
    const report = error => say(illustrationErrorText(error), 'error', isSettingsError(error?.code) ? t('Open settings') : null, () => switchTab('settings'));

    // ── State helpers ────────────────────────────────────────────────────
    const snapshot = () => sdk.illustrations.snapshot();
    const annotations = () => snapshot().state.annotations.filter(item => item.deletedAt === undefined);
    const imagesOf = id => snapshot().state.images.filter(image => image.annotationId === id).sort((a, b) => a.createdAt - b.createdAt);
    const annotationOf = id => snapshot().state.annotations.find(item => item.annotationId === id);
    const flow = createIllustrationFlow({ sdk, readSettings: async () => (await sdk.illustrations.settings.read()).value,
        saveConsent: consent => updateIllustrationSettings(settings => { settings.costConsents = [...(settings.costConsents ?? []).filter(item => item.targetFingerprint !== consent.targetFingerprint), consent]; }),
        onChange: annotationId => {
            dot.hidden = !flow.activeCount();
            const task = flow.get(annotationId);
            if (task?.phase === 'done') say(annotationOf(annotationId)?.selectedImageVersionId === task.newVersionId ? t('The illustration is in your story.') : t('New version ready. Choose it under Versions to show it in the story.'), 'success');
            if (task?.phase === 'cancelled') say(t('Cancelled. Nothing was added to the story.'));
            if (task?.phase === 'failed' && !(open && detailId === annotationId)) say(task.error, 'error', isSettingsError(task.errorCode) ? t('Open settings') : t('Open'), () => isSettingsError(task.errorCode) ? switchTab('settings') : openDetail(annotationId));
            if (open && !editing && !retouch && (tab === 'story' || tab === 'gallery') && (detailId === null || detailId === annotationId)) render();
        } });
    sdk.onDispose(() => flow.dispose());
    async function refreshConfig() { try { config = await loadIllustrationConfig(); ready = illustrationReadiness(config, context.packageId); } catch { config = null; ready = null; } }

    // ── Selection → one-click illustration ──────────────────────────────
    const navigation = globalThis.Atria?.shell?.getNavigation?.();
    const syncVisibility = () => {
        const route = navigation?.getRoute();
        root.hidden = !context.sessionId || Boolean(route && (route.domain !== 'play' || route.child?.id?.startsWith('utility.') || route.child?.id?.startsWith('skills')));
        if (root.hidden && open) close({ restoreFocus: false });
    };
    const unsubscribe = navigation?.subscribe(syncVisibility); sdk.onDispose(() => unsubscribe?.()); syncVisibility();
    if (writable) sdk.illustrations.setSelectionMode(true);
    function placeChip() {
        root.style.setProperty('--atri-ill-inset', sdk.illustrations.toolbarInset() + 'px');
        const selection = writable ? sdk.illustrations.selection() : null;
        if (selection) pending = selection; else if (!chip.contains(doc.activeElement)) pending = null;
        const range = pending && doc.getSelection()?.rangeCount ? doc.getSelection().getRangeAt(0) : null;
        const rect = range?.getBoundingClientRect();
        if (!pending || !rect || (!rect.width && !rect.height)) { chip.hidden = true; return; }
        chip.hidden = false;
        const width = chip.offsetWidth || 120, height = chip.offsetHeight || 36, gap = 10;
        const x = Math.min(win.innerWidth - width - 12, Math.max(12, rect.left + rect.width / 2 - width / 2));
        const above = rect.top - height - gap, y = above > 60 ? above : Math.min(win.innerHeight - height - 12, rect.bottom + gap);
        Object.assign(chip.style, { left: x + 'px', top: y + 'px' });
    }
    for (const type of ['selectionchange', 'pointerup', 'keyup']) sdk.events.listen(doc, type, placeChip);
    // The composer settles after resize (rotation, keyboard); measure the inset again on the next frame.
    sdk.events.listen(win, 'resize', () => { placeChip(); win.requestAnimationFrame(() => { if (!disposed) placeChip(); }); }); sdk.events.listen(win, 'scroll', placeChip, { capture: true, passive: true });
    sdk.illustrations.onSurfacesChanged(placeChip);
    async function illustrateSelection() {
        if (!pending || !writable) return;
        const selection = { ...pending }; pending = null; chip.hidden = true; doc.getSelection()?.removeAllRanges();
        await illustrateAnchor(selection);
    }
    /** Selected or suggested passage → annotation → description → image. */
    async function illustrateAnchor(selection) {
        try {
            // The same passage opens its existing illustration instead of adding a duplicate.
            const existing = annotations().find(item => item.anchor.messageId === selection.messageId && item.anchor.variantId === selection.variantId
                && item.anchor.start === selection.start && item.anchor.end === selection.end);
            if (existing) { openDetail(existing.annotationId); return; }
            await refreshConfig();
            const settings = config?.settings ?? (await sdk.illustrations.settings.read()).value;
            const { draft } = createIllustrationDraft(selection.quote, settings, context.packageId);
            const speaker = sdk.illustrations.speaker(selection);
            // A named speaker who appears in the passage joins it even without a saved appearance.
            if (speaker && selection.quote.includes(speaker.displayName) && !draft.characters.some(item => item.character.name === speaker.displayName)) draft.characters.push({ character: speakerDrawingCharacter(speaker), dynamicPrompt: '', clothing: '' });
            const result = await sdk.illustrations.command('createAnnotation', { ...selection, draft, expectedHead: snapshot().head });
            const annotationId = result.state.annotations.at(-1).annotationId;
            if (!ready?.service) { openDetail(annotationId); say(t('Choose an image service first. Your passage is saved.'), 'error', t('Open settings'), () => switchTab('settings')); return; }
            if (!ready.writes) { editing = true; openDetail(annotationId); say(ready.manual ? t('Write what to draw, then press Draw.') : t('No model is set to write descriptions. Write one yourself, or choose a model in settings.'), ready.manual ? 'info' : 'error'); return; }
            openDetail(annotationId);
            void flow.illustrate(annotationId);
        } catch (error) { show(); report(error); }
    }
    // Alt+I illustrates the selection from the keyboard.
    sdk.events.listen(doc, 'keydown', event => {
        if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyI' && pending) { event.preventDefault(); void illustrateSelection(); }
    });
    // Images in the story open their illustration.
    sdk.events.listen(doc, 'click', event => {
        const figure = event.target?.closest?.('[data-atria-illustration]');
        if (figure && event.target.tagName === 'IMG') { openDetail(figure.dataset.atriaIllustration); }
    });
    // The panel owns Escape while open, before the shell's route handling.
    sdk.events.listen(win, 'keydown', event => {
        if (event.key !== 'Escape' || !open || event.isComposing || event.keyCode === 229) return;
        if (!panel.contains(doc.activeElement) && doc.activeElement !== doc.body && doc.activeElement !== launcher) return;
        event.preventDefault(); event.stopImmediatePropagation();
        if (retouch) { closeRetouch(); return; }
        if (detailId && tab === 'story' || detailId && tab === 'gallery') { detailId = null; editing = false; render(); body.focus(); return; }
        close();
    }, { capture: true });

    // ── Panel lifecycle ──────────────────────────────────────────────────
    async function show(nextTab = null) {
        if (!open) { open = true; placePanel(); panel.hidden = false; root.style.zIndex = OPEN_LAYER; launcher.setAttribute('aria-expanded', 'true'); }
        await refreshConfig(); void loadSuggestions();
        if (nextTab) tab = nextTab; else if (!detailId && ready && !ready.service && !annotations().length) tab = 'settings';
        render(); placeChip();
        if (!panel.contains(doc.activeElement)) (panel.querySelector('[aria-selected=true]') ?? body).focus();
    }
    function close({ restoreFocus = true } = {}) {
        if (retouch && !confirmAtriaDraftLeave(doc, retouch.root)) return;
        closeRetouch(false);
        open = false; editing = false; remember(); panel.hidden = true; root.style.zIndex = '5'; launcher.setAttribute('aria-expanded', 'false'); disposeView();
        if (restoreFocus) launcher.focus();
    }
    function switchTab(next) { if (retouch && !confirmAtriaDraftLeave(doc, retouch.root)) return; closeRetouch(false); tab = next; detailId = null; editing = false; if (!open) void show(next); else render(); }
    function openDetail(annotationId, versionId = null) { closeRetouch(false); detailId = annotationId; focusVersion = versionId; if (tab !== 'gallery') tab = 'story'; if (!open) void show(); else render(); }
    function disposeView() { view?.dispose?.(); view = null; }
    function closeRetouch(rerender = true) { if (!retouch) return; retouch.dispose(); retouch = null; panel.dataset.wide = 'false'; if (rerender && open) render(); }

    function renderTabs() {
        const count = annotations().length;
        tabs.replaceChildren(...TABS.map(([id, label]) => el(doc, 'button', { className: 'atri-ill-tab', attrs: { type: 'button', role: 'tab', 'aria-selected': String(tab === id), tabindex: tab === id ? '0' : '-1' },
            on: { click: () => switchTab(id), keydown: event => {
                const index = TABS.findIndex(([key]) => key === id), next = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : null;
                if (next === null) return; event.preventDefault(); const target = TABS[(next + TABS.length) % TABS.length][0]; switchTab(target); tabs.querySelector('[aria-selected=true]')?.focus();
            } } }, [el(doc, 'span', { text: t(label) }), id === 'story' && count ? el(doc, 'span', { className: 'atri-ill-count', text: String(count) }) : null])));
    }
    // The host restarts plugins after Runtime changes; keep the reader where they were.
    const UI_KEY = 'atria.illustrations.panel';
    const remember = () => { try { win.sessionStorage.setItem(UI_KEY, JSON.stringify({ sessionId: context.sessionId, open, tab, detailId })); } catch { /* storage unavailable */ } };
    function render() {
        remember();
        if (disposed || !open) return;
        renderTabs(); disposeView();
        const key = tab + ':' + (detailId ?? '') + ':' + Boolean(retouch) + ':' + editing, scroll = key === lastView ? body.scrollTop : 0; lastView = key;
        body.replaceChildren();
        if (retouch) { body.append(retouch.root); return; }
        if (tab === 'settings') {
            const setup = mountIllustrationSetup({ document: doc, parent: body, packageId: context.packageId, onChanged: async next => { config = next; ready = illustrationReadiness(next, context.packageId); },
                openAdvanced: () => navigation?.navigate('play', { child: { id: 'utility.plugins:official', label: t('Extensions'), kind: 'workspace' }, reason: 'illustration-advanced', history: 'push' }) });
            view = setup; return;
        }
        if (tab === 'characters') { view = mountIllustrationCharacters({ document: doc, parent: body, packageId: context.packageId, say, participants: () => sdk.illustrations.participants() }); return; }
        if (detailId && annotationOf(detailId)) renderDetail(detailId); else { detailId = null; tab === 'gallery' ? renderGallery() : renderStory(); }
        body.scrollTop = scroll;
    }

    // ── Story tab ────────────────────────────────────────────────────────
    function renderStory() {
        if (ready && !ready.service) body.append(el(doc, 'div', { className: 'atri-ill-card atri-ill-stack' }, [el(doc, 'h3', { text: t('Set up illustrations') }),
            el(doc, 'p', { className: 'atri-ill-muted', text: t('Choose an image service and an art style. It takes about a minute.') }),
            el(doc, 'div', {}, [action(doc, t('Start setup'), () => switchTab('settings'), { variant: 'primary', icon: 'arrow-r' })])]));
        if (writable) body.append(el(doc, 'div', { className: 'atri-ill-hint', attrs: { style: 'margin:12px 0' } }, [icon(doc, 'sparkles'), el(doc, 'p', { text: t('Select a passage in the story, then choose “Illustrate”. The picture appears right below it.') })]));
        else body.append(el(doc, 'p', { className: 'atri-ill-muted', text: t('This is a past version of the story. Illustrations are read-only here.') }));
        renderSuggestions();
        const items = annotations().sort((a, b) => b.createdAt - a.createdAt);
        if (!items.length) { body.append(el(doc, 'div', { className: 'atri-ill-empty' }, [icon(doc, 'image', 30), el(doc, 'p', { text: t('No illustrations in this story yet.') })])); return; }
        const list = el(doc, 'ul', { className: 'atri-ill-list', attrs: { 'aria-label': t('Illustrations in this story') } });
        for (const annotation of items) {
            const images = imagesOf(annotation.annotationId), task = flow.get(annotation.annotationId), active = flow.isActive(annotation.annotationId);
            const shown = images.find(image => image.imageVersionId === annotation.selectedImageVersionId);
            const preview = shown ?? images.at(-1);
            const stateText = active || task?.phase === 'failed' ? phaseText(task) : shown ? t('In the story') : images.length ? t('Hidden from the story') : t('No image yet');
            const kind = active ? 'busy' : task?.phase === 'failed' ? 'error' : shown ? 'done' : '';
            list.append(el(doc, 'li', {}, [el(doc, 'button', { className: 'atri-ill-item', attrs: { type: 'button' }, on: { click: () => openDetail(annotation.annotationId) } }, [
                el(doc, 'span', { className: 'atri-ill-thumb', attrs: { 'data-busy': String(active) } }, [preview ? el(doc, 'img', { attrs: { src: thumbUrl(context, preview.imageVersionId), alt: '', loading: 'lazy', decoding: 'async' } }) : icon(doc, 'image', 20)]),
                el(doc, 'span', {}, [el(doc, 'span', { className: 'atri-ill-quote', text: annotation.anchor.quote }), el(doc, 'span', { className: 'atri-ill-state', text: stateText, attrs: { 'data-kind': kind } })]),
            ])]));
        }
        body.append(list);
    }

    // ── Suggested passages (Director, “Suggest passages” mode) ───────────
    const SUGGESTION_LIMIT = 3;
    const suggesting = () => writable && config?.settings?.enabled !== false && config?.settings?.director?.mode === 'semi';
    const overlaps = (anchor, other) => anchor.messageId === other.messageId && anchor.variantId === other.variantId && anchor.start < other.end && other.start < anchor.end;
    async function loadSuggestions() {
        if (!suggesting()) { suggestions = []; suggestionsLoaded = false; return; }
        try {
            // Scan records each committed turn once; later calls only list pending shots.
            const shots = await sdk.illustrations.visual('director', 'scan');
            suggestions = shots.filter(shot => shot.status === 'awaiting_review' || shot.status === 'awaiting_approval').sort((a, b) => b.score.score - a.score.score);
        } catch { suggestions = []; }
        suggestionsLoaded = true;
        if (open && tab === 'story' && !detailId && !retouch) render();
    }
    function renderSuggestions() {
        if (!suggesting() || !suggestionsLoaded) return;
        const taken = annotations().map(item => item.anchor);
        const visible = suggestions.filter(shot => !taken.some(anchor => overlaps(shot.source.anchor, anchor))).slice(0, SUGGESTION_LIMIT);
        if (!visible.length) return;
        const skip = async shot => {
            try { await sdk.illustrations.visual('director', 'skip', { shotId: shot.shotId }); suggestions = suggestions.filter(item => item.shotId !== shot.shotId); render(); } catch (error) { report(error); }
        };
        body.append(el(doc, 'section', { className: 'atri-ill-suggest', attrs: { 'aria-labelledby': 'atri-ill-suggest-title' } }, [
            el(doc, 'h3', { text: t('Suggested passages'), attrs: { id: 'atri-ill-suggest-title' } }),
            el(doc, 'ul', { className: 'atri-ill-suggest-list' }, visible.map(shot => el(doc, 'li', { className: 'atri-ill-suggest-item' }, [
                el(doc, 'p', { className: 'atri-ill-quote', text: shot.source.anchor.quote }),
                el(doc, 'div', { className: 'atri-ill-row' }, [
                    action(doc, t('Illustrate'), () => { suggestions = suggestions.filter(item => item.shotId !== shot.shotId); const { contentHash: _hash, ...anchor } = shot.source.anchor; void illustrateAnchor(anchor); }, { size: 'sm', variant: 'primary', icon: 'sparkles' }),
                    action(doc, t('Skip'), () => skip(shot), { size: 'sm', variant: 'plain' })]),
            ])))]));
    }

    // ── Gallery tab ──────────────────────────────────────────────────────
    function renderGallery() {
        const live = new Set(annotations().map(item => item.annotationId));
        const selected = new Set(annotations().map(item => item.selectedImageVersionId).filter(Boolean));
        const images = snapshot().state.images.filter(image => live.has(image.annotationId)).sort((a, b) => b.createdAt - a.createdAt);
        if (!images.length) { body.append(el(doc, 'div', { className: 'atri-ill-empty' }, [icon(doc, 'grid', 30), el(doc, 'p', { text: t('Images you create in this story appear here.') })])); return; }
        body.append(el(doc, 'p', { className: 'atri-ill-muted', text: f('${0} images in this story. Open one to choose which version the story shows.', [images.length]), attrs: { style: 'margin-bottom:12px' } }),
            el(doc, 'div', { className: 'atri-ill-grid' }, images.map(image => el(doc, 'button', { className: 'atri-ill-tile', attrs: { type: 'button', 'aria-label': f('Open image: ${0}', [annotationOf(image.annotationId)?.anchor.quote.slice(0, 40) ?? '']) },
                on: { click: () => openDetail(image.annotationId, image.imageVersionId) } }, [el(doc, 'img', { attrs: { src: thumbUrl(context, image.imageVersionId), alt: '', loading: 'lazy', decoding: 'async' } }),
                selected.has(image.imageVersionId) ? el(doc, 'em', { text: t('In story') }) : null]))));
    }

    // ── Detail ───────────────────────────────────────────────────────────
    function renderDetail(annotationId) {
        const annotation = annotationOf(annotationId), images = imagesOf(annotationId), task = flow.get(annotationId), active = flow.isActive(annotationId);
        const shownId = annotation.selectedImageVersionId;
        const viewing = images.find(image => image.imageVersionId === (focusVersion ?? task?.newVersionId ?? shownId)) ?? images.find(image => image.imageVersionId === shownId) ?? images.at(-1);
        const deleted = annotation.deletedAt !== undefined, canEdit = writable && !deleted;
        body.append(el(doc, 'button', { className: 'atri-ill-back', attrs: { type: 'button' }, on: { click: () => { detailId = null; editing = false; render(); } } }, [icon(doc, 'chevron-left', 16), el(doc, 'span', { text: tab === 'gallery' ? t('Gallery') : t('All illustrations') })]));
        const quote = el(doc, 'blockquote', { className: 'atri-ill-quote', text: annotation.anchor.quote, attrs: { 'data-full': 'true' } });
        body.append(quote);
        // Stage: progress, confirmation, failure or the image itself.
        const stage = el(doc, 'div', { className: 'atri-ill-stage', attrs: { 'data-busy': String(active && task.phase !== 'confirm') } });
        if (active && task.phase !== 'confirm') {
            const steps = task.withWriting ? [['writing', t('Describe')], ['drawing', t('Draw')]] : [['drawing', t('Draw')]];
            const at = steps.findIndex(([id]) => id === task.phase);
            stage.append(el(doc, 'div', { className: 'atri-ill-progress', attrs: { role: 'status' } }, [
                steps.length < 2 ? null : el(doc, 'div', { className: 'atri-ill-steps' }, steps.map(([id, label], index) => el(doc, 'span', { text: (index < at ? '✓ ' : '') + label, attrs: { 'data-state': index < at ? 'done' : index === at ? 'active' : 'todo' } }))),
                el(doc, 'p', { text: phaseText(task) }),
                el(doc, 'p', { className: 'atri-ill-muted', text: t('You can keep reading. The image appears in the story when it is ready.') }),
                task.step !== 'cancelling' && task.operationId ? action(doc, t('Cancel'), async () => { try { await flow.cancel(annotationId); } catch (error) { report(error); } }, { size: 'sm', icon: 'stop' }) : null]));
        } else if (task?.phase === 'confirm') {
            stage.dataset.confirm = 'true'; stage.append(confirmBox(annotationId, task));
        } else if (viewing) {
            stage.append(el(doc, 'img', { attrs: { src: nativeAssetUrl(viewing.assetId), alt: viewing.alt || annotation.anchor.quote, width: viewing.width, height: viewing.height, decoding: 'async' } }));
        } else stage.append(el(doc, 'div', { className: 'atri-ill-progress' }, [icon(doc, 'image', 30), el(doc, 'p', { className: 'atri-ill-muted', text: t('No image yet.') })]));
        body.append(stage);
        if (task?.phase === 'failed') body.append(el(doc, 'div', { className: 'atri-ill-confirm', attrs: { role: 'alert', style: 'background:var(--soft-vermilion);border-color:transparent' } }, [
            el(doc, 'p', { text: task.error }), el(doc, 'div', { className: 'atri-ill-row' }, [
                isSettingsError(task.errorCode) ? action(doc, t('Open settings'), () => switchTab('settings'), { size: 'sm', variant: 'primary' }) : null,
                canEdit ? action(doc, t('Try again'), () => { flow.dismiss(annotationId); return annotation.draft?.prompt?.trim() && !/route_|prompt_invalid|context_budget/.test(task.errorCode ?? '') ? flow.redraw(annotationId) : flow.illustrate(annotationId, { rewrite: Boolean(ready?.writes) }); }, { size: 'sm', icon: 'retry' }) : null,
                action(doc, t('Dismiss'), () => { flow.dismiss(annotationId); render(); }, { size: 'sm', variant: 'plain' })])]));
        // Versions: choosing one shows it in the story.
        if (images.length > 1 || (images.length === 1 && !shownId)) {
            body.append(el(doc, 'p', { className: 'atri-ill-muted', text: t('Versions — choose one to show it in the story') }));
            body.append(el(doc, 'div', { className: 'atri-ill-versions', attrs: { role: 'group', 'aria-label': t('Versions') } }, images.map((image, index) => el(doc, 'button', { className: 'atri-ill-version',
                attrs: { type: 'button', 'aria-pressed': String(image === viewing), 'aria-current': image.imageVersionId === shownId ? 'true' : null, disabled: !canEdit,
                    'aria-label': f('Version ${0}${1}', [index + 1, image.imageVersionId === shownId ? t(' (in the story)') : '']) },
                on: { click: async () => { focusVersion = image.imageVersionId; try { if (image.imageVersionId !== shownId) { await sdk.illustrations.command('selectImageVersion', { annotationId, imageVersionId: image.imageVersionId, expectedHead: snapshot().head }); say(t('The story now shows this version.')); } } catch (error) { report(error); } render(); } } },
            [el(doc, 'img', { attrs: { src: thumbUrl(context, image.imageVersionId), alt: '', loading: 'lazy' } })]))));
        }
        if (canEdit && !active) {
            const primary = el(doc, 'div', { className: 'atri-ill-row', attrs: { style: 'margin-top:12px' } });
            const hasPrompt = Boolean(annotation.draft?.prompt?.trim());
            if (!images.length) primary.append(action(doc, ready?.writes ? t('Illustrate') : t('Draw'), () => (ready?.writes ? flow.illustrate(annotationId) : hasPrompt ? flow.redraw(annotationId) : (editing = true, render())), { variant: 'primary', icon: 'sparkles' }));
            else {
                primary.append(action(doc, t('Draw again'), () => (hasPrompt ? flow.redraw(annotationId) : flow.illustrate(annotationId)), { variant: 'primary', icon: 'retry' }));
                if (ready?.writes) primary.append(action(doc, t('New scene'), () => flow.illustrate(annotationId), { icon: 'sparkles' }));
            }
            primary.append(el(doc, 'span', { className: 'atri-ill-spacer' }));
            const editToggle = action(doc, t('Edit description'), () => { editing = !editing; render(); }, { variant: 'plain', icon: 'pencil', size: 'sm' });
            editToggle.setAttribute('aria-expanded', String(editing));
            primary.append(editToggle);
            body.append(primary);
            if (editing) body.append(editor(annotation));
            const more = el(doc, 'div', { className: 'atri-ill-row', attrs: { style: 'margin-top:8px' } });
            if (viewing) more.append(action(doc, t('Retouch an area'), () => openRetouch(annotation, viewing), { variant: 'plain', icon: 'brush', size: 'sm' }));
            if (shownId) more.append(action(doc, t('Hide from story'), async () => { try { await sdk.illustrations.command('selectImageVersion', { annotationId, imageVersionId: null, expectedHead: snapshot().head }); say(t('Hidden from the story. The image is kept here.')); render(); } catch (error) { report(error); } }, { variant: 'plain', icon: 'eye', size: 'sm' }));
            else if (viewing) more.append(action(doc, t('Show in story'), async () => { try { await sdk.illustrations.command('selectImageVersion', { annotationId, imageVersionId: viewing.imageVersionId, expectedHead: snapshot().head }); say(t('Shown in the story.')); render(); } catch (error) { report(error); } }, { variant: 'plain', icon: 'eye', size: 'sm' }));
            more.append(deleteControl(annotation));
            body.append(more);
        }
        if (viewing) body.append(details(doc, t('Details'), [facts(doc, [[t('Created'), formatAtriaDate(viewing.createdAt)], [t('Model'), viewing.requestSnapshot?.target?.model ?? viewing.parameters?.model],
            [t('Size'), viewing.width && viewing.height ? viewing.width + ' × ' + viewing.height : ''], [t('Service'), viewing.requestSnapshot?.connection?.displayName]]),
        el(doc, 'pre', { text: [viewing.prompt, viewing.negativePrompt ? '\n' + t('Avoid:') + ' ' + viewing.negativePrompt : ''].join('') })]));
    }
    function confirmBox(annotationId, task) {
        const cost = task.preview.cost, known = cost.kind !== 'unknown' && cost.upperBound !== null;
        const quota = (task.preview.quotas ?? []).find(item => item.perDay && item.model !== '*') ?? (task.preview.quotas ?? []).find(item => item.perDay) ?? null;
        const counted = !known && Boolean(quota);
        const currency = cost.currency || config?.budget?.value?.currency || 'USD';
        let amount = known ? cost.upperBound : 0.05, remember = false;
        const amountInput = input(doc, String(amount), value => { amount = Math.max(0, Number(value) || 0); }, { type: 'number' });
        amountInput.addEventListener('input', () => { amount = Math.max(0, Number(amountInput.value) || 0); });
        const box = el(doc, 'div', { className: 'atri-ill-confirm', attrs: { role: 'group', 'aria-label': t('Confirm cost') } }, [
            el(doc, 'strong', { text: known ? f('This image costs up to ${0} ${1}.', [cost.upperBound, currency]) : counted ? f('This uses 1 of today’s ${0} requests for ${1} (${2} used).', [quota.perDay, quota.model === '*' ? t('this service') : quota.model, quota.used.day]) : t('This service may charge for each image.') }),
            known || counted ? null : el(doc, 'p', { className: 'atri-ill-muted', text: t('Atria cannot see its price, so it counts the amount below against your daily limit.') }),
            known || counted ? null : field(doc, f('Count this image as (${0})', [currency]), amountInput),
            (task.preview.externalAssetIds ?? []).length ? el(doc, 'p', { className: 'atri-ill-muted', text: t('Your source image and the painted area will be sent to this service.') }) : null,
            (() => { const box = el(doc, 'input', { attrs: { type: 'checkbox' } }); box.addEventListener('change', () => { remember = box.checked; }); return el(doc, 'label', { className: 'atri-ill-check' }, [box, el(doc, 'span', { text: t('Don’t ask again for this service') })]); })(),
            el(doc, 'div', { className: 'atri-ill-row' }, [
                action(doc, t('Draw'), () => { if (counted) amount = 0; else if (!known && !(amount > 0)) { say(t('Enter an amount above 0.'), 'error'); amountInput.focus(); return; } flow.answer(annotationId, { maxCost: known ? cost.upperBound : amount, currency, remember }); }, { variant: 'primary' }),
                action(doc, t('Cancel'), () => flow.answer(annotationId, null), { variant: 'plain' })]),
        ]);
        queueMicrotask(() => box.querySelector('button[data-variant=primary]')?.focus());
        return box;
    }
    function editor(annotation) {
        const draft = structuredClone(annotation.draft ?? createIllustrationDraft(annotation.anchor.quote, config?.settings ?? { characters: [], works: {}, preset: { style: '', quality: '', negativePrompt: '', parameters: {} } }, context.packageId).draft);
        const library = (config?.settings.characters ?? []).filter(item => item.enabled);
        const people = el(doc, 'div', { className: 'atri-ill-presets', attrs: { role: 'group', 'aria-label': t('Characters in this image') } });
        const drawPeople = () => {
            people.replaceChildren(...draft.characters.map(item => el(doc, 'span', { className: 'atri-ill-tag' }, [el(doc, 'span', { text: item.character.name }),
                el(doc, 'button', { className: 'atri-ill-char-remove', attrs: { type: 'button', 'aria-label': f('Remove ${0}', [item.character.name]) }, on: { click: () => { draft.characters = draft.characters.filter(current => current !== item); drawPeople(); } } }, [icon(doc, 'close', 12)])])));
            const options = library.filter(item => !draft.characters.some(current => current.character.id === item.id));
            if (options.length) {
                const picker = el(doc, 'select', { attrs: { 'aria-label': t('Add a character'), style: 'width:auto;min-height:30px' } }, [el(doc, 'option', { text: t('+ Add character'), attrs: { value: '' } }), ...options.map(item => el(doc, 'option', { text: item.name, attrs: { value: item.id } }))]);
                picker.addEventListener('change', () => { const character = library.find(item => item.id === picker.value); if (character) { draft.characters.push({ character: structuredClone(character), dynamicPrompt: '', clothing: character.defaultClothing }); drawPeople(); } });
                people.append(picker);
            }
            if (!draft.characters.length && !options.length) people.append(el(doc, 'span', { className: 'atri-ill-muted', text: t('Add characters in the Cast tab to keep their looks consistent.') }));
        };
        drawPeople();
        const tagEditor = mountTagEditor(doc, { value: draft.prompt || composeIllustrationPrompt(draft), label: t('Description'), onChange: value => { draft.prompt = value; } });
        const save = async thenDraw => {
            draft.prompt = tagEditor.value;
            if (thenDraw && !draft.prompt.trim()) { say(t('Add an image description first.'), 'error'); return; }
            const current = annotationOf(annotation.annotationId);
            await sdk.illustrations.command('updateAnnotation', { annotationId: annotation.annotationId, draft, imageSelection: current.imageSelection ?? { imageTargetId: null, imageRenderingId: null }, expectedHead: snapshot().head });
            editing = false;
            if (thenDraw) void flow.redraw(annotation.annotationId); else { say(t('Description saved.')); render(); }
        };
        const negative = ready?.connection ? supportsNegativePrompt(ready.connection.providerAdapter) : true;
        return el(doc, 'div', { className: 'atri-ill-card atri-ill-stack', attrs: { style: 'margin-top:12px' } }, [
            el(doc, 'div', { className: 'atri-ill-field' }, [el(doc, 'span', { text: t('Who is in it') }), people, el(doc, 'small', { text: t('Their saved appearance is added to the description.') })]),
            el(doc, 'div', { className: 'atri-ill-field' }, [el(doc, 'span', { text: t('What to draw') }), tagEditor.root, el(doc, 'small', { text: negative ? t('Short English tags work best for most models.') : t('This service also understands full sentences.') })]),
            el(doc, 'div', { className: 'atri-ill-row' }, [action(doc, t('Save and draw'), async () => { try { await save(true); } catch (error) { report(error); } }, { variant: 'primary', icon: 'sparkles' }),
                action(doc, t('Save'), async () => { try { await save(false); } catch (error) { report(error); } }),
                action(doc, t('Cancel'), () => { editing = false; render(); }, { variant: 'plain' })]),
        ]);
    }
    function deleteControl(annotation) {
        const wrap = el(doc, 'span', { className: 'atri-ill-row' });
        const ask = action(doc, t('Delete illustration'), () => {
            wrap.replaceChildren(el(doc, 'span', { className: 'atri-ill-muted', text: t('Remove it from the story?') }),
                action(doc, t('Delete'), async () => { try { await sdk.illustrations.command('deleteAnnotation', { annotationId: annotation.annotationId, expectedHead: snapshot().head }); detailId = null; say(t('Illustration deleted.')); render(); } catch (error) { report(error); } }, { variant: 'destructive', size: 'sm' }),
                action(doc, t('Keep'), () => { wrap.replaceChildren(ask); ask.focus(); }, { variant: 'plain', size: 'sm' }));
            wrap.querySelector('[data-variant=destructive]')?.focus();
        }, { variant: 'plain', icon: 'trash', size: 'sm' });
        wrap.append(ask); return wrap;
    }
    async function openRetouch(annotation, image) {
        try {
            panel.dataset.wide = 'true';
            retouch = await mountIllustrationRetouch({ document: doc, sdk, annotation, image, report, flow,
                onDone: () => { closeRetouch(); }, onSubmitted: () => { closeRetouch(); say(t('Retouching… the new version will appear here.')); } });
            render();
        } catch (error) { panel.dataset.wide = 'false'; retouch = null; report(error); }
    }

    // Reconnect to tasks that were running before a reload, then keep the launcher honest.
    await refreshConfig();
    if (writable) await flow.resume();
    dot.hidden = !flow.activeCount();
    placeChip();
    try { const saved = JSON.parse(win.sessionStorage.getItem(UI_KEY) ?? 'null'); if (saved?.open && saved.sessionId === context.sessionId) { detailId = saved.detailId ?? null; await show(saved.tab); } } catch { /* storage unavailable */ }
    return () => { disposed = true; clearTimeout(statusTimer); disposeView(); closeRetouch(false); flow.dispose(); };
}
