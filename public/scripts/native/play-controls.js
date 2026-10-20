import { formatAtriaDate } from '../atria-shell/components.js';
import { ensureTaskBindings, isTaskBindingFailure } from './task-binding-ui.js';
import { formatShellText as formatProductText } from '../atria-shell/localization.js';
import { mountSessionHistory } from './session-history.js';
import { mountSessionRename } from './session-naming.js';
import { mountSaveDependencyRecovery } from './save-dependency-recovery.js';
import { mountEmbeddedKnowledgePromotion } from './embedded-knowledge-promotion.js';
import { translateShellText as tl } from '../atria-shell/localization.js';
import {
    nativeProductClient,
} from './product-client.js';
import { NATIVE_SESSION_LIFECYCLE, onNativeSessionLifecycle } from './session-lifecycle.js';
import { createAtriaIcon } from '../atria-shell/icons.js';
import { mountPlayPromptControls } from './prompt-runtime-controls.js';
import { mountExperienceHealth } from './experience-health-ui.js';
import { mountSharedSessionPanel } from './shared-session-ui.js';
import { confirmAtriaDraftLeave } from '../atria-shell/workspace-leave-guard.js';
import { mountSessionAgentPanel } from './session-agent-panel.js';
import { nativePlayGenerationBusy } from './play-generation.js';
import { renderBeforeYouBegin } from './before-you-begin.js';

function actionButton(documentRef, label, handler, icon) {
    const node = documentRef.createElement('button');
    node.type = 'button';
    node.className = 'atria-native-play-actions__button';
    node.textContent = tl(label);
    if (icon) { node.prepend(createAtriaIcon(documentRef, icon, { size: 16 })); node.title = tl(label); }
    node.addEventListener('click', async event => {
        try { await handler(event); } catch (error) {
            node.dispatchEvent(new CustomEvent('atria-play-action-error', { bubbles: true, detail: error }));
        }
    });
    return node;
}

function text(value) {
    return String(value ?? '');
}

function preview(value, limit = 120) {
    const normalized = text(value).replace(/\s+/g, ' ').trim();
    return normalized.length > limit ? normalized.slice(0, limit - 1) + '…' : normalized;
}

function activeRuntime() {
    return globalThis.Atria?.nativeSessionRuntime || null;
}

function currentSessionId() {
    return activeRuntime()?.snapshot?.session?.sessionId || null;
}

function downloadBase64(documentRef, payload) {
    const binary = atob(payload.data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    const url = URL.createObjectURL(new Blob([bytes], {
        type: payload.mediaType || 'application/octet-stream',
    }));
    const anchor = documentRef.createElement('a');
    anchor.href = url;
    anchor.download = payload.fileName || 'save.atriasave';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}


export function mountNativePlayControls({
    document: documentRef = globalThis.document,
    root,
    navigation,
    accountStorage,
} = {}) {
    if (!documentRef?.body || !root) throw new Error('Native Play controls require document and host root');

    const landing = documentRef.createElement('section');
    landing.className = 'atria-native-play-landing';
    landing.dataset.atriaNativePlayLanding = 'true';
    landing.hidden = true;

    const toolbar = documentRef.createElement('div');
    toolbar.id = 'atria-native-play-actions';
    toolbar.className = 'atria-native-play-actions';
    toolbar.hidden = true;
    toolbar.dataset.atriaNativePlayActions = 'true';

    const status = documentRef.createElement('div');
    status.className = 'atria-native-play-actions__status';
    status.setAttribute('role', 'status');

    const drawer = documentRef.createElement('section');
    drawer.className = 'atria-native-play-drawer';
    drawer.hidden = true;
    drawer.dataset.atriaNativePlayDrawer = 'true';
    drawer.setAttribute('aria-label', tl('Session inspector'));

    const drawerHeader = documentRef.createElement('div');
    drawerHeader.className = 'atria-native-play-drawer__header';
    const drawerTitle = documentRef.createElement('h3');
    let returnFocus = null;
    let drawerRequest = 0;
    let disposed = false;
    let resumeAttempted = false;
    let rememberedSession = null;
    let routeEpoch = 0;
    const recentRoute = () => navigation?.getRoute()?.child?.id === 'recent-stories';
    const readingRoute = () => navigation?.getRoute()?.domain === 'play' && !navigation.getRoute().child;
    const returnToReading = () => navigation?.navigate('play', { child: null, reason: 'return-to-reading' });
    const recentStories = actionButton(documentRef, 'Recent stories', () => {
        navigation?.navigate('play', { child: { id: 'recent-stories', label: tl('Recent stories'), kind: 'workspace' }, reason: 'recent-stories' });
    });
    let experiencePanel = null;
    let historyPanel = null;
    const drawerWrites = new Map();
    const writable = () => Boolean(activeRuntime()?.active && !activeRuntime()?.history && !activeRuntime()?.failed && activeRuntime()?.snapshot?.states?.atri_run?.status !== 'dead' && !busy && !nativePlayGenerationBusy(activeRuntime()));
    let unsubscribeNavigation = null;
    let inspectorWasOpen = false;
    let drawerSessionId = null;
    const shell = () => globalThis.Atria?.shell?.getShell?.();
    function hideDrawer() {
        if (!confirmAtriaDraftLeave(documentRef, drawer)) return;
        experiencePanel?.dispose(); experiencePanel = null;
        historyPanel?.atriaHistory?.dispose(); historyPanel = null;
        drawerWrites.clear();
        drawerRequest++;
        if (shell()?.slots?.dock?.contains(drawer)) shell().setDockOpen(false);
        else drawer.hidden = true;
        if (returnFocus?.isConnected) returnFocus.focus();
    }
    function openDrawer(title) {
        drawerSessionId = currentSessionId();
        experiencePanel?.dispose(); experiencePanel = null;
        historyPanel?.atriaHistory?.dispose(); historyPanel = null;
        drawerWrites.clear();
        if (!drawer.contains(documentRef.activeElement)) {
            returnFocus = documentRef.activeElement?.closest?.('.atria-play-more')?.querySelector('summary') || documentRef.activeElement;
        }
        const dock = shell()?.slots?.dock;
        if (dock && drawer.parentNode !== dock) dock.append(drawer);
        drawer.hidden = false;
        drawerHeader.hidden = Boolean(dock);
        drawerTitle.textContent = tl(title);
        const navigation = globalThis.Atria?.shell?.getNavigation?.();
        if (navigation && !unsubscribeNavigation) {
            unsubscribeNavigation = navigation.subscribe(({ context, route }) => {
                if (route.domain !== 'play' && !drawer.hidden) {
                    drawer.hidden = true;
                    drawerRequest++;
                }
                if (!context.open && inspectorWasOpen && route.domain === 'play' && returnFocus?.isConnected) returnFocus.focus();
                inspectorWasOpen = context.open;
            });
        }
        if (navigation) navigation.setContext({ title: tl(title), open: true }, { reason: 'play-inspector' });
        else shell()?.setDockOpen(true);
        if (dock) drawerBody.focus();
        else closeDrawer.focus();
        return ++drawerRequest;
    }
    toolbar.addEventListener('click', event => {
        if (event.target.closest('button') && !drawer.hidden && !confirmAtriaDraftLeave(documentRef, drawer)) {
            event.preventDefault(); event.stopImmediatePropagation();
        }
    }, true);
    const closeDrawer = actionButton(documentRef, 'Close', hideDrawer);
    drawerHeader.append(drawerTitle, closeDrawer);

    const drawerBody = documentRef.createElement('div');
    drawerBody.className = 'atria-native-play-drawer__body';
    drawerBody.tabIndex = -1;
    drawer.append(drawerHeader, drawerBody);
    const reportActionError = event => {
        status.textContent = event.detail?.message || String(event.detail);
        if (!landing.hidden) {
            const message = documentRef.createElement('p'); message.setAttribute('role', 'alert');
            message.textContent = status.textContent; landing.prepend(message);
        }
    };
    root.addEventListener('atria-play-action-error', reportActionError);
    drawer.addEventListener('atria-play-action-error', reportActionError);

    let busy = false;
    async function run(label, operation) {
        if (busy) return;
        busy = true;
        sync();
        status.textContent = tl(label) + '…';
        try {
            const result = await operation();
            status.textContent = label.startsWith('Saving') || label === 'Quick saving' ? tl('Saved') : '';
            return result;
        } catch (error) {
            status.textContent = error?.message || String(error);
            if (!landing.hidden) {
                const failure = documentRef.createElement('p');
                failure.setAttribute('role', 'alert');
                failure.textContent = status.textContent;
                landing.prepend(failure);
            }
        } finally {
            busy = false;
            sync();
        }
    }

    async function ask(title, value = '') {
        const { Popup, POPUP_TYPE } = await import('../popup.js');
        return new Popup(tl(title), POPUP_TYPE.INPUT, value).show();
    }

    function appendPortableImport(target) {
        target.append(actionButton(documentRef, 'Import save', () => globalThis.Atria?.shell?.getWorkspaceHost?.()?.openLibrarySection('import-save')));
    }

    async function showTimeline() {
        const runtime = activeRuntime();
        if (!runtime?.active) return;
        const request = openDrawer('History & saves');
        drawerBody.textContent = tl('Loading…');
        try {
            const base = runtime.snapshot;
            const detail = await nativeProductClient.getSession(base.session.sessionId);
            if (disposed || request !== drawerRequest || activeRuntime() !== runtime || runtime.snapshot !== base) return;
            const mutate = (label, operation) => run(label, async () => {
                if (activeRuntime() !== runtime || runtime.snapshot !== base || !runtime.active || runtime.history || runtime.failed || nativePlayGenerationBusy(runtime)) throw new Error(tl('Historical revisions are read-only.'));
                return operation();
            });
            const writeButton = (label, handler) => {
                const button = actionButton(documentRef, label, handler); drawerWrites.set(button, () => writable() && activeRuntime() === runtime && runtime.snapshot === base); button.disabled = !writable(); return button;
            };

            drawerBody.replaceChildren();
            const mode = documentRef.createElement('p'); mode.setAttribute('role', 'status');
            mode.textContent = tl(runtime.history ? 'Historical revisions are read-only.' : 'Live'); drawerBody.append(mode);

            const portableActions = documentRef.createElement('div');
            portableActions.className = 'atria-domain-workspace__actions';
            portableActions.append(actionButton(documentRef, 'Export Session .atriasave', () => run(
                'Exporting session',
                async () => downloadBase64(
                    documentRef,
                    await nativeProductClient.exportSession(detail.snapshot.session.sessionId),
                ),
            )));
            drawerBody.append(portableActions);
            mountSessionRename({ document: documentRef, root: drawerBody, session: detail.snapshot.session });
            const automatic = documentRef.createElement('details'), summary = documentRef.createElement('summary');
            summary.textContent = tl('Automatic saves'); automatic.append(summary);
            const policy = base.session.autoSavePolicy ?? { enabled: true, intervalMs: 300000, retain: 12 };
            const interval = documentRef.createElement('input'), retain = documentRef.createElement('input'), enabled = documentRef.createElement('input');
            enabled.type = 'checkbox'; enabled.checked = policy.enabled; enabled.setAttribute('aria-label', tl('Enable automatic saves'));
            interval.type = 'number'; interval.min = '1'; interval.value = String(policy.intervalMs / 60000); interval.setAttribute('aria-label', tl('Save interval in minutes'));
            retain.type = 'number'; retain.min = '1'; retain.max = '1000'; retain.value = String(policy.retain); retain.setAttribute('aria-label', tl('Automatic save count'));
            automatic.append(enabled, interval, retain, writeButton('Save settings', () => mutate('Saving', async () => {
                await runtime.setExperienceMetadata({ autoSavePolicy: { enabled: enabled.checked, intervalMs: Math.round(Number(interval.value) * 60000), retain: Number(retain.value) } });
                await showTimeline();
            }))); drawerBody.append(automatic);
            appendPortableImport(drawerBody);

            const savesTitle = documentRef.createElement('h4');
            savesTitle.textContent = tl('Saves');
            drawerBody.append(savesTitle);
            if (!detail.saves.length) {
                const empty = documentRef.createElement('p');
                empty.textContent = tl('No saves yet. Save a moment to return to it later.');
                drawerBody.append(empty);
            }
            for (const save of detail.saves) {
                const row = documentRef.createElement('div');
                row.className = 'atria-native-play-drawer__row';
                row.dataset.atriaSaveId = save.saveId;
                const label = documentRef.createElement('span');
                label.textContent = `${save.displayName || save.kind} · ${formatAtriaDate(save.createdAt)}`;
                const saveActions = documentRef.createElement('div');
                saveActions.className = 'atria-native-play-timeline-row__actions';
                const load = writeButton('Load', () => mutate('Loading save', async () => {
                    await runtime.restoreSavePoint(save.saveId);
                    await showTimeline();
                }));
                const exportSave = actionButton(documentRef, 'Export', () => run('Exporting save', async () => (
                    downloadBase64(
                        documentRef,
                        await nativeProductClient.exportSave(detail.snapshot.session.sessionId, save.saveId),
                    )
                )));
                saveActions.append(load, exportSave);
                row.append(label, saveActions);
                drawerBody.append(row);
            }

            const embedded = (detail.snapshot.knowledge?.bindings || []).filter(binding => (
                binding.source?.kind === 'session'
            ));
            if (embedded.length) {
                const embeddedTitle = documentRef.createElement('h4');
                embeddedTitle.textContent = tl('Embedded Knowledge');
                drawerBody.append(embeddedTitle);
                for (const binding of embedded) mountEmbeddedKnowledgePromotion({ document: documentRef, root: drawerBody, detail, binding, host: globalThis.Atria?.shell?.getWorkspaceHost?.() });
            }

            const timelineTitle = documentRef.createElement('h4');
            timelineTitle.textContent = tl('Story timeline');
            drawerBody.append(timelineTitle);
            const timeline = (base.timeline || []).slice(-50);
            timeline.forEach((entry, index) => {
                const row = documentRef.createElement('article');
                row.className = 'atria-native-play-timeline-row';
                row.dataset.atriaTimelineMessageId = entry.messageId;
                const content = documentRef.createElement('div');
                content.className = 'atria-native-play-timeline-row__content';
                content.textContent = `${entry.sequence + 1 || index + 1}. ${entry.role}: ${preview(entry.content)}`;
                const rowActions = documentRef.createElement('div');
                rowActions.className = 'atria-native-play-timeline-row__actions';
                row.append(content, rowActions);
                drawerBody.append(row);
            });

            historyPanel = mountSessionHistory({ document: documentRef, root: drawerBody, sessionId: detail.snapshot.session.sessionId,
                getContext: () => ({ sessionId: currentSessionId(), revisionId: activeRuntime()?.snapshot?.revision?.revisionId,
                    branchId: activeRuntime()?.snapshot?.revision?.branchId, isHistory: activeRuntime()?.history,
                    busy: busy || nativePlayGenerationBusy(activeRuntime()) || activeRuntime()?.failed,
                    canWrite: writable(), canFork: Boolean(activeRuntime()?.active && !activeRuntime()?.failed && activeRuntime()?.snapshot?.states?.atri_run?.status !== 'dead' && !busy && !nativePlayGenerationBusy(activeRuntime())),
                    tailMessageId: activeRuntime()?.snapshot?.timeline?.at(-1)?.messageId }),
                onMetadata: options => runtime.setExperienceMetadata(options),
                onSwitchBranch: async branchId => { await runtime.switchBranch(branchId); hideDrawer(); },
                onInspect: async revisionId => {
                    await globalThis.Atria.openNativeSession(detail.snapshot.session.sessionId, { revisionId }); hideDrawer();
                } });
        } catch (error) {
            if (disposed || request !== drawerRequest) return;
            drawerBody.textContent = error?.message || String(error);
            drawerBody.append(actionButton(documentRef, 'Try again', showTimeline));
        }
    }

    function showContext() {
        const runtime = activeRuntime();
        openDrawer('Context');
        drawerBody.replaceChildren();
        const plan = runtime?.currentContextPlan?.();
        const summary = documentRef.createElement('p');
        summary.textContent = plan
            ? formatProductText('${0} items included · ${1} excluded', [plan.included?.length || 0, plan.rejected?.length || 0])
            : tl('Send a message to see the context used for a reply.');
        const details = documentRef.createElement('details');
        const label = documentRef.createElement('summary'); label.textContent = tl('Details');
        const pre = documentRef.createElement('pre');
        pre.dataset.atriaContextPlan = 'true';
        pre.textContent = plan ? JSON.stringify(plan, null, 2) : tl('No context compiled yet.');
        details.append(label, pre);
        drawerBody.append(summary, details);
    }

    async function renderLanding() {
        landing.replaceChildren();
        const hero = documentRef.createElement('header');
        hero.className = 'atria-play-landing-header';
        const title = documentRef.createElement('h1');
        title.textContent = tl('A story to return to');
        const description = documentRef.createElement('p');
        description.textContent = tl('Pick up where you left off, or find somewhere new.');
        const browse = actionButton(documentRef, 'Browse Library', () => (
            globalThis.Atria?.shell?.getWorkspaceHost?.()?.openLibrarySection?.('works')
        ));
        browse.classList.add('atria-play-primary');
        hero.append(title, description, browse);
        if (activeRuntime()?.active) hero.append(actionButton(documentRef, 'Return to reading', returnToReading));
        landing.append(hero);
        const content = documentRef.createElement('div');
        content.className = 'atria-play-landing-content';
        content.setAttribute('aria-busy', 'true');
        const loading = documentRef.createElement('p');
        loading.setAttribute('role', 'status');
        loading.textContent = tl('Finding your stories…');
        content.append(loading);
        landing.append(content);
        appendPortableImport(landing);
        try {
            const [sessionResult, workResult] = await Promise.allSettled([
                nativeProductClient.listSessions(), nativeProductClient.listWorks(),
            ]);
            if (disposed || !content.isConnected) return;
            content.replaceChildren();
            const sessions = sessionResult.status === 'fulfilled' ? sessionResult.value : [];
            const works = workResult.status === 'fulfilled' ? workResult.value : [];
            if (!resumeAttempted && readingRoute() && !activeRuntime()?.active) {
                resumeAttempted = true;
                let savedId;
                try { savedId = accountStorage?.getItem('atriaLastReading'); } catch { /* Browser storage may be unavailable. */ }
                const available = sessions.filter(item => item.dependency?.status === 'ready');
                const last = available.find(item => item.sessionId === savedId) || available[0];
                if (last) {
                    const epoch = routeEpoch;
                    try {
                        await globalThis.Atria.openNativeSession(last.sessionId, {
                            acceptGuard: () => !disposed && epoch === routeEpoch && readingRoute() && !activeRuntime()?.active,
                        });
                        if (!disposed && epoch === routeEpoch && activeRuntime()?.active) { sync(); return; }
                    } catch (error) {
                        if (!disposed && epoch === routeEpoch && readingRoute()) {
                            const failure = documentRef.createElement('p'); failure.setAttribute('role', 'alert');
                            failure.textContent = tl('Could not reopen your last story. Choose a story below to try again.'); content.append(failure);
                        }
                    }
                }
            }
            // First steps stay visible until a model is connected and a story exists. They load
            // beside the story list, never in front of it.
            const beginSlot = documentRef.createElement('div'); content.append(beginSlot);
            void renderBeforeYouBegin({ document: documentRef, root: beginSlot, works, host: globalThis.Atria?.shell?.getWorkspaceHost?.(), onChanged: renderLanding }).then(begin => {
                if (disposed || !beginSlot.isConnected) return;
                if (begin.complete && sessions.length) beginSlot.remove();
                // One primary action per screen: while setup is incomplete, its next step leads.
                else if (!begin.complete) browse.classList.remove('atria-play-primary');
            }, () => beginSlot.remove());
            const section = (label, className) => {
                const group = documentRef.createElement('section');
                const heading = documentRef.createElement('h2'); heading.textContent = tl(label);
                const items = documentRef.createElement('div'); items.className = className;
                group.append(heading, items); content.append(group); return items;
            };
            const continued = section('Continue', 'atria-play-session-list');
            if (sessionResult.status === 'rejected') {
                const error = documentRef.createElement('p'); error.setAttribute('role', 'alert'); error.textContent = tl('Your stories could not be loaded.') + ' ' + sessionResult.reason.message;
                continued.append(error, actionButton(documentRef, 'Try again', renderLanding));
            } else if (!sessions.length) {
                const empty = documentRef.createElement('p');
                empty.textContent = tl('Your next story is waiting in Library. Start a work to keep your progress here.');
                continued.append(empty);
            }
            for (const session of sessions.slice(0, 5)) {
                const row = documentRef.createElement('article');
                row.className = 'atria-play-session-card';
                row.dataset.atriaLandingSession = session.sessionId;
                const label = documentRef.createElement('h3');
                label.textContent = session.displayTitle || works.find(work => work.package.packageId === session.packageId)?.package.displayName || tl('Untitled session');
                const meta = documentRef.createElement('p');
                const ready = !session.dependency || session.dependency.status === 'ready';
                meta.textContent = ready ? (session.updatedAt ? formatAtriaDate(session.updatedAt) : tl('Ready when you are')) : tl('The matching work needs to be installed.');
                const open = actionButton(documentRef, 'Continue', () => run('Opening session', async () => {
                    await globalThis.Atria.openNativeSession(session.sessionId);
                    returnToReading();
                }));
                open.disabled = !ready;
                open.prepend(createAtriaIcon(documentRef, 'play', { size: 18 }));
                row.append(label, meta, open); continued.append(row);
                if (!ready) mountSaveDependencyRecovery({ document: documentRef, root: row, preflight: { dependency: session.dependency },
                    host: globalThis.Atria?.shell?.getWorkspaceHost?.(),
                    recheck: async () => (await nativeProductClient.listSessions(session.packageId)).find(item => item.sessionId === session.sessionId),
                    onReady: () => globalThis.Atria.openNativeSession(session.sessionId) });
            }
            const recent = section('Recent works', 'atria-play-work-shelf');
            if (workResult.status === 'rejected') {
                const error = documentRef.createElement('p'); error.setAttribute('role', 'alert'); error.textContent = tl('Your stories could not be loaded.') + ' ' + workResult.reason.message;
                recent.append(error, actionButton(documentRef, 'Try again', renderLanding));
            } else if (!works.length) {
                const empty = documentRef.createElement('p');
                empty.textContent = tl('Installed works will appear here.'); recent.append(empty);
            }
            for (const work of works.slice(0, 5)) {
                const row = documentRef.createElement('article');
                row.className = 'atria-play-work';
                row.dataset.atriaLandingWork = work.package.packageId;
                const open = actionButton(documentRef, 'Open', () => (
                    globalThis.Atria?.shell?.getWorkspaceHost?.()?.openLibraryWork?.(
                        work.package.packageId, work.package.displayName,
                    )
                ));
                open.classList.add('atria-play-work-cover');
                open.setAttribute('aria-label', tl('Open') + ' ' + work.package.displayName);
                const hash = [...work.package.packageId].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
                open.dataset.cover = String(hash % 4);
                open.replaceChildren(createAtriaIcon(documentRef, 'book', { size: 36 }));
                const label = documentRef.createElement('h3'); label.textContent = work.package.displayName;
                row.append(open, label); recent.append(row);
            }
        } catch (error) {
            if (disposed || !content.isConnected) return;
            const message = documentRef.createElement('p');
            message.setAttribute('role', 'alert');
            message.textContent = tl('Your stories could not be loaded.') + ' ' + (error?.message || String(error));
            content.replaceChildren(message, actionButton(documentRef, 'Try again', renderLanding));
        } finally {
            content.setAttribute('aria-busy', 'false');
        }
    }

    const save = actionButton(documentRef, 'Save', async () => {
        const base = activeRuntime()?.snapshot; const sessionId = base?.session.sessionId;
        if (!sessionId || !writable()) return;
        const displayName = await ask('Save name');
        if (displayName === false || displayName === null || activeRuntime()?.snapshot !== base || !writable()) return;
        void run('Saving', () => nativeProductClient.createSave(sessionId, {
            kind: 'manual',
            displayName, expectedRevisionId: base.revision.revisionId,
        }));
    }, 'save');
    save.classList.add('atria-native-play-actions__button--save');
    const quickSave = actionButton(documentRef, 'Quick Save', () => {
        const sessionId = currentSessionId();
        if (!sessionId) return;
        void run('Quick saving', () => nativeProductClient.createSave(sessionId, { kind: 'quick', expectedRevisionId: activeRuntime()?.snapshot?.revision?.revisionId }));
    }, 'save');
    const load = actionButton(documentRef, 'Load', () => {
        void showTimeline();
    }, 'restore');
    const timeline = actionButton(documentRef, 'History & saves', () => {
        void showTimeline();
    }, 'history');
    const context = actionButton(documentRef, 'Context', showContext, 'context');
    const promptControls = actionButton(documentRef, 'Prompt choices', () => {
        openDrawer('Prompt choices'); drawerBody.replaceChildren();
        void mountPlayPromptControls(documentRef, drawerBody);
    }, 'tune');

    const more = documentRef.createElement('details');
    more.className = 'atria-play-more';
    const moreLabel = documentRef.createElement('summary');
    moreLabel.setAttribute('aria-label', tl('More'));
    moreLabel.title = tl('More');
    moreLabel.append(createAtriaIcon(documentRef, 'more', { size: 18 }));
    const moreActions = documentRef.createElement('div');
    moreActions.className = 'atria-play-more-actions';
    const health = actionButton(documentRef, 'Experience health', () => {
        openDrawer('Experience health');
        experiencePanel = mountExperienceHealth({ document: documentRef, root: drawerBody, runtime: activeRuntime() });
    }, 'gauge');
    const sharing = actionButton(documentRef, 'Shared session', () => {
        openDrawer('Shared session');
        experiencePanel = mountSharedSessionPanel({ document: documentRef, root: drawerBody, runtime: activeRuntime() });
    }, 'users');
    const goals = actionButton(documentRef, 'Goals & feedback', () => {
        openDrawer('Goals & feedback');
        experiencePanel = mountSessionAgentPanel({ root: drawerBody, runtime: activeRuntime() });
    }, 'flow');
    // Returning to the story list never cancels generation; the session stays open.
    recentStories.prepend(createAtriaIcon(documentRef, 'arrow-l', { size: 16 }));
    const separator = () => { const node = documentRef.createElement('div'); node.className = 'atria-play-more-actions__sep'; node.setAttribute('role', 'separator'); return node; };
    moreActions.append(health, sharing, goals, separator(), quickSave, load, separator(), recentStories);
    moreActions.addEventListener('click', () => {
        more.open = false;
        if (moreActions.contains(documentRef.activeElement)) moreLabel.focus();
    });
    more.append(moreLabel, moreActions);
    more.addEventListener('keydown', event => {
        if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
        if (event.key === 'Escape' && more.open) {
            event.preventDefault(); event.stopPropagation();
            more.open = false; moreLabel.focus();
        }
    });
    const dismissMore = event => {
        if (more.open && !more.contains(event.target)) more.open = false;
    };
    documentRef.addEventListener('pointerdown', dismissMore);
    more.addEventListener('focusout', event => {
        // During blur, activeElement may temporarily be body before the next
        // control receives focus. Keep internal pointer/Tab transitions open
        // so the destination button can receive its click.
        if (!more.contains(event.relatedTarget)) more.open = false;
    });
    const divider = documentRef.createElement('span'); divider.className = 'atria-native-play-actions__divider'; divider.setAttribute('aria-hidden', 'true');
    toolbar.append(status, timeline, context, promptControls, divider, save, more);
    root.prepend(landing);
    // The session crumbs and tools live in the shell top bar while a story is read.
    const sessionHeader = root.querySelector('[data-atria-play-session-header]');
    root.prepend(toolbar);
    const placeInTopBar = () => {
        const slots = shell()?.slots;
        if (slots?.contextBar && toolbar.parentNode !== slots.contextBar) slots.contextBar.prepend(toolbar);
        if (sessionHeader && slots?.toolbarLeading && sessionHeader.parentNode !== slots.toolbarLeading) slots.toolbarLeading.append(sessionHeader);
    };
    root.append(drawer);
    const bindingNotice = documentRef.createElement('section'); bindingNotice.className = 'atri-library-section';
    bindingNotice.dataset.atriaTaskBindingRecovery = 'true'; bindingNotice.hidden = true;
    const bindingMessage = documentRef.createElement('p'); bindingMessage.setAttribute('role', 'status');
    bindingMessage.textContent = tl('This work still needs its model purposes configured. Your story is kept.');
    bindingNotice.append(bindingMessage, actionButton(documentRef, 'Configure model purposes', async () => {
        const runtime = activeRuntime(); const base = runtime?.snapshot; if (!base) return;
        openDrawer('Configure model purposes'); drawerBody.replaceChildren();
        const setup = documentRef.createElement('div'); drawerBody.append(setup);
        await ensureTaskBindings({ document: documentRef, root: setup, manifest: base.manifest,
            packageId: base.session.packageId, packageVersionId: base.session.packageVersionId, force: true,
            isCurrent: () => !disposed && activeRuntime()?.snapshot?.session.sessionId === base.session.sessionId,
            onReady: async () => {
                const api = globalThis.Atria?.getContext?.()?.getCapabilityApi?.('game-runtime');
                const result = await api?.reloadPackage?.();
                if (!result || result.status !== 'ready') throw new Error('Experience could not restart. Check Experience health.');
                hideDrawer();
            } });
    }));
    root.prepend(bindingNotice);
    function syncBindings() {
        const state = globalThis.Atria?.getContext?.()?.getCapabilityApi?.('game-runtime')?.getPackageState?.();
        bindingNotice.hidden = !activeRuntime()?.active || state?.sessionId !== currentSessionId() || !isTaskBindingFailure(state?.errors);
    }
    documentRef.defaultView?.addEventListener('atria:game-package-changed', syncBindings);

    let landingRender = null;
    let wasActive = null;
    function sync() {
        if (drawerSessionId && drawerSessionId !== currentSessionId()) { hideDrawer(); drawerSessionId = null; }
        syncBindings();
        const active = documentRef.body.dataset.atriaNativeSessionActive === 'true';
        const playRoute = !navigation || navigation.getRoute()?.domain === 'play';
        toolbar.hidden = !active || recentRoute() || !playRoute;
        placeInTopBar();
        if (sessionHeader) sessionHeader.hidden = toolbar.hidden;
        landing.hidden = active && !recentRoute();
        if (!landing.hidden) {
            drawer.hidden = true;
            status.textContent = '';
            if (!landingRender && wasActive !== !landing.hidden) {
                landingRender = renderLanding().finally(() => {
                    landingRender = null;
                });
            }
        }
        wasActive = !landing.hidden;
        if (active && !activeRuntime()?.history && !activeRuntime()?.failed && rememberedSession !== currentSessionId()) {
            rememberedSession = currentSessionId(); resumeAttempted = true;
            try { accountStorage?.setItem('atriaLastReading', rememberedSession); } catch { /* Reading remains available without browser storage. */ }
        }
        const canWrite = writable();
        for (const [button, allowed] of drawerWrites) button.disabled = !allowed();
        historyPanel?.atriaHistory?.syncCapabilities();
        save.disabled = !canWrite;
        quickSave.disabled = !canWrite;
        load.disabled = !active;
        timeline.disabled = !active;
        context.disabled = !active;
    }

    const observer = new MutationObserver(sync);
    observer.observe(documentRef.body, {
        attributes: true,
        attributeFilter: ['data-atria-native-session-active', 'data-generating'],
    });
    const unsubscribers = Object.values(NATIVE_SESSION_LIFECYCLE).map(type => onNativeSessionLifecycle(type, sync));
    documentRef.addEventListener('atria-native-play-draft', sync);
    const unsubscribeRoute = navigation?.subscribe(() => {
        routeEpoch += 1;
        if (readingRoute() && !resumeAttempted && !activeRuntime()?.active) wasActive = null;
        sync();
    });
    sync();

    return Object.freeze({
        root: toolbar,
        landing,
        drawer,
        sync,
        dispose() {
            experiencePanel?.dispose(); experiencePanel = null;
            historyPanel?.atriaHistory?.dispose(); historyPanel = null;
            drawerWrites.clear();
            disposed = true;
            documentRef.removeEventListener('pointerdown', dismissMore);
            documentRef.removeEventListener('atria-native-play-draft', sync);
            root.removeEventListener('atria-play-action-error', reportActionError);
            drawer.removeEventListener('atria-play-action-error', reportActionError);
            unsubscribeNavigation?.();
            unsubscribeRoute?.();
            drawerRequest++;
            for (const unsubscribe of unsubscribers) unsubscribe();
            observer.disconnect();
            documentRef.defaultView?.removeEventListener('atria:game-package-changed', syncBindings);
            bindingNotice.remove();
            if (sessionHeader?.parentNode !== root) sessionHeader?.remove();
            toolbar.remove();
            landing.remove();
            drawer.remove();
        },
    });
}
