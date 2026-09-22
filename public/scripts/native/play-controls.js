import {
    arrayBufferToBase64,
    nativeProductClient,
} from './product-client.js';

function actionButton(documentRef, label, handler) {
    const node = documentRef.createElement('button');
    node.type = 'button';
    node.className = 'atria-native-play-actions__button';
    node.textContent = label;
    node.addEventListener('click', handler);
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

    const sheld = root.querySelector('#sheld');
    const previousSheldDisplay = sheld?.style?.display ?? '';

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

    const drawer = documentRef.createElement('section');
    drawer.className = 'atria-native-play-drawer';
    drawer.hidden = true;
    drawer.dataset.atriaNativePlayDrawer = 'true';

    const drawerHeader = documentRef.createElement('div');
    drawerHeader.className = 'atria-native-play-drawer__header';
    const drawerTitle = documentRef.createElement('h3');
    const closeDrawer = actionButton(documentRef, 'Close', () => {
        drawer.hidden = true;
    });
    drawerHeader.append(drawerTitle, closeDrawer);

    const drawerBody = documentRef.createElement('div');
    drawerBody.className = 'atria-native-play-drawer__body';
    drawer.append(drawerHeader, drawerBody);

    async function run(label, operation) {
        status.textContent = label + '…';
        try {
            const result = await operation();
            status.textContent = '';
            return result;
        } catch (error) {
            status.textContent = error?.message || String(error);
            throw error;
        }
    }

    async function importPortableSave(file, target) {
        target.textContent = 'Inspecting .atriasave…';
        const data = arrayBufferToBase64(await file.arrayBuffer());
        const preflight = await nativeProductClient.preflightSave(data);
        target.replaceChildren();

        const message = documentRef.createElement('pre');
        message.dataset.atriaSavePreflight = preflight.dependency?.status || 'unknown';
        message.textContent = dependencyMessage(preflight);
        target.append(message);

        if (preflight.dependency?.status !== 'ready') return;

        const importButton = actionButton(documentRef, 'Import & Open', async () => {
            importButton.disabled = true;
            try {
                const password = typeof globalThis.prompt === 'function'
                    ? globalThis.prompt('Save password (leave blank if none)', '') || undefined
                    : undefined;
                const imported = await nativeProductClient.importSave(data, password);
                await globalThis.Atria.openNativeSession(imported.session.sessionId);
                drawer.hidden = true;
            } catch (error) {
                const failure = documentRef.createElement('pre');
                failure.textContent = error?.message || String(error);
                target.append(failure);
            } finally {
                importButton.disabled = false;
            }
        });
        target.append(importButton);
    }

    function appendPortableImport(documentTarget) {
        const section = documentRef.createElement('section');
        section.className = 'atria-native-portable-save';
        const title = documentRef.createElement('h4');
        title.textContent = 'Import .atriasave';
        const input = documentRef.createElement('input');
        input.type = 'file';
        input.accept = '.atriasave,application/octet-stream';
        input.dataset.atriaSaveImport = 'true';
        const result = documentRef.createElement('div');
        result.className = 'atria-native-portable-save__result';
        input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (file) void importPortableSave(file, result);
        });
        section.append(title, input, result);
        documentTarget.append(section);
    }

    async function showTimeline() {
        const runtime = activeRuntime();
        if (!runtime?.active) return;
        drawer.hidden = false;
        drawerTitle.textContent = 'Timeline / Saves';
        drawerBody.textContent = 'Loading…';
        try {
            const detail = await nativeProductClient.getSession(runtime.snapshot.session.sessionId);
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
            savesTitle.textContent = 'Saves';
            drawerBody.append(savesTitle);
            if (!detail.saves.length) {
                const empty = documentRef.createElement('p');
                empty.textContent = 'No SavePoints yet.';
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
                embeddedTitle.textContent = 'Embedded Knowledge';
                drawerBody.append(embeddedTitle);
                for (const binding of embedded) {
                    const row = documentRef.createElement('div');
                    row.className = 'atria-native-play-drawer__row';
                    row.dataset.atriaEmbeddedKnowledge = binding.knowledgeBindingId;
                    const label = documentRef.createElement('span');
                    label.textContent = binding.knowledgeBindingId;
                    const promote = actionButton(documentRef, 'Save to my Library', async () => {
                        promote.disabled = true;
                        const displayName = typeof globalThis.prompt === 'function'
                            ? globalThis.prompt('Knowledge Base name', '') || undefined
                            : undefined;
                        try {
                            await nativeProductClient.promoteKnowledge(detail.snapshot.session.sessionId, {
                                revisionId: detail.snapshot.revision.revisionId,
                                knowledgeBindingId: binding.knowledgeBindingId,
                                displayName,
                            });
                            promote.textContent = 'Saved to Library';
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
            timelineTitle.textContent = 'Committed Timeline';
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
                    drawer.hidden = true;
                })));
                if (entry.role === 'user' && index > 0) {
                    rowActions.append(actionButton(documentRef, 'Re-enter Turn', () => run('Re-entering turn', async () => {
                        await globalThis.Atria.reenterNativeTurn(index);
                        drawer.hidden = true;
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
            drawerBody.textContent = error?.message || String(error);
        }
    }

    function showContext() {
        const runtime = activeRuntime();
        drawer.hidden = false;
        drawerTitle.textContent = 'Context diagnostics';
        drawerBody.replaceChildren();
        const plan = runtime?.currentContextPlan?.();
        const pre = documentRef.createElement('pre');
        pre.dataset.atriaContextPlan = 'true';
        pre.textContent = plan
            ? JSON.stringify(plan, null, 2)
            : 'No ContextPlan has been compiled for the current revision yet.';
        drawerBody.append(pre);
    }

    async function renderLanding() {
        landing.replaceChildren();
        const title = documentRef.createElement('h2');
        title.textContent = 'Play';
        const description = documentRef.createElement('p');
        description.textContent = 'Continue a Native game, start from Library, or import an .atriasave.';
        landing.append(title, description);

        const hostActions = documentRef.createElement('div');
        hostActions.className = 'atria-domain-workspace__actions';
        hostActions.append(actionButton(documentRef, 'Browse Library', () => (
            globalThis.Atria?.shell?.getWorkspaceHost?.()?.openLibrarySection?.('works')
        )));
        landing.append(hostActions);
        appendPortableImport(landing);

        try {
            const [sessions, works] = await Promise.all([
                nativeProductClient.listSessions(),
                nativeProductClient.listWorks(),
            ]);
            const recentTitle = documentRef.createElement('h3');
            recentTitle.textContent = 'Continue';
            landing.append(recentTitle);
            if (sessions.length) {
                for (const session of sessions.slice(0, 5)) {
                    const row = documentRef.createElement('div');
                    row.className = 'atria-native-play-drawer__row';
                    row.dataset.atriaLandingSession = session.sessionId;
                    const label = documentRef.createElement('span');
                    label.textContent = session.displayTitle || session.sessionId;
                    row.append(label, actionButton(documentRef, 'Continue', () => (
                        globalThis.Atria.openNativeSession(session.sessionId)
                    )));
                    landing.append(row);
                }
            } else {
                const empty = documentRef.createElement('p');
                empty.textContent = 'No Native game progress yet.';
                landing.append(empty);
            }

            const worksTitle = documentRef.createElement('h3');
            worksTitle.textContent = 'Recent Works';
            landing.append(worksTitle);
            for (const work of works.slice(0, 5)) {
                const row = documentRef.createElement('div');
                row.className = 'atria-native-play-drawer__row';
                row.dataset.atriaLandingWork = work.package.packageId;
                const label = documentRef.createElement('span');
                label.textContent = work.package.displayName;
                row.append(label, actionButton(documentRef, 'Open', () => (
                    globalThis.Atria?.shell?.getWorkspaceHost?.()?.openLibraryWork?.(
                        work.package.packageId,
                        work.package.displayName,
                    )
                )));
                landing.append(row);
            }
        } catch (error) {
            const failure = documentRef.createElement('pre');
            failure.textContent = error?.message || String(error);
            landing.append(failure);
        }
    }

    const retry = actionButton(documentRef, 'Retry Reply', () => run('Retrying reply', () => (
        globalThis.Atria.retryNativeReply()
    )));
    const reenter = actionButton(documentRef, 'Re-enter Turn', () => {
        const index = latestIndex('user');
        if (index <= 0) {
            status.textContent = 'No re-enterable committed user turn is available.';
            return;
        }
        void run('Re-entering turn', () => globalThis.Atria.reenterNativeTurn(index));
    });
    const restart = actionButton(documentRef, 'Restart From Here', () => {
        void showTimeline();
    });
    const save = actionButton(documentRef, 'Save', () => {
        const sessionId = currentSessionId();
        if (!sessionId) return;
        const displayName = typeof globalThis.prompt === 'function'
            ? globalThis.prompt('Save name', '') || undefined
            : undefined;
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

    toolbar.append(retry, reenter, restart, save, quickSave, load, timeline, context, status);
    root.prepend(landing, toolbar);
    root.append(drawer);

    let landingRender = null;
    function sync() {
        const active = documentRef.body.dataset.atriaNativeSessionActive === 'true';
        toolbar.hidden = !active;
        landing.hidden = active;
        if (sheld) sheld.style.display = active ? previousSheldDisplay : 'none';
        if (!active) {
            drawer.hidden = true;
            status.textContent = '';
            if (!landingRender) {
                landingRender = renderLanding().finally(() => {
                    landingRender = null;
                });
            }
        }
        const runtime = activeRuntime();
        const writable = Boolean(active && runtime?.active && !runtime.history && !runtime.failed);
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
        attributeFilter: ['data-atria-native-session-active'],
    });
    sync();

    return Object.freeze({
        root: toolbar,
        landing,
        drawer,
        sync,
        dispose() {
            observer.disconnect();
            if (sheld) sheld.style.display = previousSheldDisplay;
            toolbar.remove();
            landing.remove();
            drawer.remove();
        },
    });
}
