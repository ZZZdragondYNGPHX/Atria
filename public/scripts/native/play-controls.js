import { translateShellText as tl } from '../atria-shell/localization.js';
import {
    arrayBufferToBase64,
    nativeProductClient,
} from './product-client.js';
import { NATIVE_SESSION_LIFECYCLE, onNativeSessionLifecycle } from './session-lifecycle.js';
import { createAtriaIcon } from '../atria-shell/icons.js';

function actionButton(documentRef, label, handler) {
    const node = documentRef.createElement('button');
    node.type = 'button';
    node.className = 'atria-native-play-actions__button';
    node.textContent = tl(label);
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

function latestIndex(role) {
    const timeline = activeRuntime()?.snapshot?.timeline || [];
    for (let index = timeline.length - 1; index >= 0; index--) {
        if (timeline[index]?.role === role) return index;
    }
    return -1;
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

function dependencyMessage(preflight) {
    const dependency = preflight?.dependency;
    if (!dependency || dependency.status === 'ready') return 'Exact Package dependency is installed.';
    const required = dependency.required || {};
    return [
        dependency.status === 'missing'
            ? 'Required Package is not installed.'
            : 'Installed Package does not match this Save.',
        `packageId: ${required.packageId || 'unknown'}`,
        `packageVersionId: ${required.packageVersionId || 'unknown'}`,
        `version: ${required.packageVersion || 'unknown'}`,
        `content hash: ${required.packageContentHash || 'unknown'}`,
        'Install/update that exact .atria Package in Library before importing.',
    ].join('\n');
}

export function mountNativePlayControls({
    document: documentRef = globalThis.document,
    root,
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
    drawer.setAttribute('aria-label', 'Session inspector');

    const drawerHeader = documentRef.createElement('div');
    drawerHeader.className = 'atria-native-play-drawer__header';
    const drawerTitle = documentRef.createElement('h3');
    let returnFocus = null;
    let drawerRequest = 0;
    let disposed = false;
    let unsubscribeNavigation = null;
    let inspectorWasOpen = false;
    const shell = () => globalThis.Atria?.shell?.getShell?.();
    function hideDrawer() {
        drawerRequest++;
        if (shell()?.slots?.dock?.contains(drawer)) shell().setDockOpen(false);
        else drawer.hidden = true;
        if (returnFocus?.isConnected) returnFocus.focus();
    }
    function openDrawer(title) {
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
        status.textContent = tl(label + '…');
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

    async function importPortableSave(file, target) {
        target.textContent = tl('Inspecting .atriasave…');
        const data = arrayBufferToBase64(await file.arrayBuffer());
        const preflight = await nativeProductClient.preflightSave(data);
        target.replaceChildren();

        const message = documentRef.createElement('p');
        message.dataset.atriaSavePreflight = preflight.dependency?.status || 'unknown';
        message.textContent = preflight.dependency?.status === 'ready'
            ? tl('Ready to import this save.') : tl('Install the matching work in Library before importing this save.');
        target.append(message);
        if (preflight.dependency?.status !== 'ready') {
            const details = documentRef.createElement('details');
            const label = documentRef.createElement('summary'); label.textContent = tl('Details');
            const pre = documentRef.createElement('pre'); pre.textContent = dependencyMessage(preflight);
            details.append(label, pre); target.append(details);
        }

        if (preflight.dependency?.status !== 'ready') return;

        const importButton = actionButton(documentRef, 'Import & Open', async () => {
            importButton.disabled = true;
            try {
                const password = await ask('Save password (leave blank if none)');
                if (password === false || password === null) return;
                const imported = await nativeProductClient.importSave(data, password);
                await globalThis.Atria.openNativeSession(imported.session.sessionId);
                hideDrawer();
            } catch (error) {
                const failure = documentRef.createElement('p');
                failure.setAttribute('role', 'alert');
                failure.textContent = error?.status === 409
                    ? tl('This save conflicts with existing session data. Import into a separate account to keep both versions.')
                    : tl('Could not import this save. Check the file and password, then try again.');
                target.append(failure);
            } finally {
                importButton.disabled = false;
            }
        });
        target.append(importButton);
    }

    function appendPortableImport(documentTarget) {
        const section = documentRef.createElement('details');
        section.className = 'atria-native-portable-save';
        const title = documentRef.createElement('summary');
        title.textContent = tl('Import save');
        const input = documentRef.createElement('input');
        input.type = 'file';
        input.accept = '.atriasave,application/octet-stream';
        input.dataset.atriaSaveImport = 'true';
        input.setAttribute('aria-label', tl('Choose an Atria save'));
        const result = documentRef.createElement('div');
        result.className = 'atria-native-portable-save__result';
        result.setAttribute('role', 'status');
        input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (file) void importPortableSave(file, result).catch(error => {
                result.textContent = error?.message || String(error);
            });
        });
        section.append(title, input, result);
        documentTarget.append(section);
    }

    async function showTimeline() {
        const runtime = activeRuntime();
        if (!runtime?.active) return;
        const request = openDrawer('Timeline & Saves');
        drawerBody.textContent = tl('Loading…');
        try {
            const detail = await nativeProductClient.getSession(runtime.snapshot.session.sessionId);
            if (disposed || request !== drawerRequest) return;
            drawerBody.replaceChildren();

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
                label.textContent = `${save.displayName || save.kind} · ${new Date(save.createdAt).toLocaleString()}`;
                const saveActions = documentRef.createElement('div');
                saveActions.className = 'atria-native-play-timeline-row__actions';
                const load = actionButton(documentRef, 'Load', () => run('Loading save', async () => {
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
                for (const binding of embedded) {
                    const row = documentRef.createElement('div');
                    row.className = 'atria-native-play-drawer__row';
                    row.dataset.atriaEmbeddedKnowledge = binding.knowledgeBindingId;
                    const label = documentRef.createElement('span');
                    label.textContent = binding.knowledgeBindingId;
                    const promote = actionButton(documentRef, 'Save to my Library', async () => {
                        promote.disabled = true;
                        const displayName = await ask('Knowledge Base name');
                        if (displayName === false || displayName === null) { promote.disabled = false; return; }
                        try {
                            await nativeProductClient.promoteKnowledge(detail.snapshot.session.sessionId, {
                                revisionId: detail.snapshot.revision.revisionId,
                                knowledgeBindingId: binding.knowledgeBindingId,
                                displayName,
                            });
                            promote.textContent = tl('Saved to Library');
                        } catch (error) {
                            status.textContent = error?.message || String(error);
                            promote.disabled = false;
                        }
                    });
                    row.append(label, promote);
                    drawerBody.append(row);
                }
            }

            const timelineTitle = documentRef.createElement('h4');
            timelineTitle.textContent = tl('Story timeline');
            drawerBody.append(timelineTitle);
            const timeline = detail.snapshot.timeline || [];
            timeline.forEach((entry, index) => {
                const row = documentRef.createElement('article');
                row.className = 'atria-native-play-timeline-row';
                row.dataset.atriaTimelineMessageId = entry.messageId;
                const content = documentRef.createElement('div');
                content.className = 'atria-native-play-timeline-row__content';
                content.textContent = `${index + 1}. ${entry.role}: ${preview(entry.content)}`;
                const rowActions = documentRef.createElement('div');
                rowActions.className = 'atria-native-play-timeline-row__actions';
                rowActions.append(actionButton(documentRef, 'Restart From Here', () => run('Restarting', async () => {
                    await globalThis.Atria.restartNativeFrom(index);
                    hideDrawer();
                })));
                if (entry.role === 'user' && index > 0) {
                    rowActions.append(actionButton(documentRef, 'Re-enter Turn', () => run('Re-entering turn', async () => {
                        await globalThis.Atria.reenterNativeTurn(index);
                        hideDrawer();
                    })));
                }
                row.append(content, rowActions);
                drawerBody.append(row);
            });

            const branches = documentRef.createElement('details');
            const branchesSummary = documentRef.createElement('summary');
            branchesSummary.textContent = `Branches & revisions (${detail.branches.length} / ${detail.revisions.length})`;
            const branchesPre = documentRef.createElement('pre');
            branchesPre.textContent = JSON.stringify({
                branches: detail.branches,
                revisions: detail.revisions,
            }, null, 2);
            branches.append(branchesSummary, branchesPre);
            drawerBody.append(branches);
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
            ? `${plan.included?.length || 0} items included · ${plan.rejected?.length || 0} excluded`
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
            const [sessions, works] = await Promise.all([
                nativeProductClient.listSessions(), nativeProductClient.listWorks(),
            ]);
            if (disposed || !content.isConnected) return;
            content.replaceChildren();
            const section = (label, className) => {
                const group = documentRef.createElement('section');
                const heading = documentRef.createElement('h2'); heading.textContent = tl(label);
                const items = documentRef.createElement('div'); items.className = className;
                group.append(heading, items); content.append(group); return items;
            };
            const continued = section('Continue', 'atria-play-session-list');
            if (!sessions.length) {
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
                meta.textContent = ready ? (session.updatedAt ? new Date(session.updatedAt).toLocaleString() : tl('Ready when you are')) : tl('The matching work needs to be installed.');
                const open = actionButton(documentRef, 'Continue', () => run('Opening session', async () => {
                    await globalThis.Atria.openNativeSession(session.sessionId);
                }));
                open.disabled = !ready;
                open.prepend(createAtriaIcon(documentRef, 'play', { size: 18 }));
                row.append(label, meta, open); continued.append(row);
            }
            const recent = section('Recent works', 'atria-play-work-shelf');
            if (!works.length) {
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

    const retry = actionButton(documentRef, 'Retry Reply', () => run('Retrying reply', () => (
        globalThis.Atria.retryNativeReply()
    )));
    const reenter = actionButton(documentRef, 'Re-enter Turn', () => {
        const index = latestIndex('user');
        if (index <= 0) {
            status.textContent = tl('No re-enterable committed user turn is available.');
            return;
        }
        void run('Re-entering turn', () => globalThis.Atria.reenterNativeTurn(index));
    });
    const restart = actionButton(documentRef, 'Restart From Here', () => {
        void showTimeline();
    });
    const save = actionButton(documentRef, 'Save', async () => {
        const sessionId = currentSessionId();
        if (!sessionId) return;
        const displayName = await ask('Save name');
        if (displayName === false || displayName === null) return;
        void run('Saving', () => nativeProductClient.createSave(sessionId, {
            kind: 'manual',
            displayName,
        }));
    });
    const quickSave = actionButton(documentRef, 'Quick Save', () => {
        const sessionId = currentSessionId();
        if (!sessionId) return;
        void run('Quick saving', () => nativeProductClient.createSave(sessionId, { kind: 'quick' }));
    });
    const load = actionButton(documentRef, 'Load', () => {
        void showTimeline();
    });
    const timeline = actionButton(documentRef, 'Timeline', () => {
        void showTimeline();
    });
    const context = actionButton(documentRef, 'Context', showContext);

    const more = documentRef.createElement('details');
    more.className = 'atria-play-more';
    const moreLabel = documentRef.createElement('summary');
    moreLabel.textContent = tl('More');
    const moreActions = documentRef.createElement('div');
    moreActions.className = 'atria-play-more-actions';
    moreActions.append(retry, reenter, restart, quickSave, load);
    moreActions.addEventListener('click', () => {
        more.open = false;
        if (moreActions.contains(documentRef.activeElement)) moreLabel.focus();
    });
    more.append(moreLabel, moreActions);
    more.addEventListener('keydown', event => {
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
    toolbar.append(timeline, context, save, more, status);
    root.prepend(landing);
    const sessionHeader = root.querySelector('[data-atria-play-session-header]');
    if (sessionHeader) sessionHeader.append(toolbar);
    else root.prepend(toolbar);
    root.append(drawer);

    let landingRender = null;
    let wasActive = null;
    function sync() {
        const active = documentRef.body.dataset.atriaNativeSessionActive === 'true';
        toolbar.hidden = !active;
        landing.hidden = active;
        if (!active) {
            drawer.hidden = true;
            status.textContent = '';
            if (!landingRender && wasActive !== false) {
                landingRender = renderLanding().finally(() => {
                    landingRender = null;
                });
            }
        }
        wasActive = active;
        const runtime = activeRuntime();
        const writable = Boolean(active && runtime?.active && !runtime.history && !runtime.failed && !busy && documentRef.body.dataset.generating !== 'true');
        retry.disabled = !writable || latestIndex('assistant') < 0;
        reenter.disabled = !writable || latestIndex('user') <= 0;
        restart.disabled = !writable || !(runtime?.snapshot?.timeline?.length);
        save.disabled = !writable;
        quickSave.disabled = !writable;
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
    sync();

    return Object.freeze({
        root: toolbar,
        landing,
        drawer,
        sync,
        dispose() {
            disposed = true;
            documentRef.removeEventListener('pointerdown', dismissMore);
            root.removeEventListener('atria-play-action-error', reportActionError);
            drawer.removeEventListener('atria-play-action-error', reportActionError);
            unsubscribeNavigation?.();
            drawerRequest++;
            for (const unsubscribe of unsubscribers) unsubscribe();
            observer.disconnect();
            toolbar.remove();
            landing.remove();
            drawer.remove();
        },
    });
}
