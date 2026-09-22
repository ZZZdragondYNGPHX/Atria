import { nativeProductClient } from './product-client.js';

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

function currentRevisionId() {
    return activeRuntime()?.snapshot?.revision?.revisionId || null;
}

function latestIndex(role) {
    const timeline = activeRuntime()?.snapshot?.timeline || [];
    for (let index = timeline.length - 1; index >= 0; index--) {
        if (timeline[index]?.role === role) return index;
    }
    return -1;
}

export function mountNativePlayControls({
    document: documentRef = globalThis.document,
    root,
} = {}) {
    if (!documentRef?.body || !root) throw new Error('Native Play controls require document and host root');

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

    async function showTimeline() {
        const runtime = activeRuntime();
        if (!runtime?.active) return;
        drawer.hidden = false;
        drawerTitle.textContent = 'Timeline';
        drawerBody.textContent = 'Loading…';
        try {
            const detail = await nativeProductClient.getSession(runtime.snapshot.session.sessionId);
            drawerBody.replaceChildren();

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
                const load = actionButton(documentRef, 'Load', () => run('Loading save', async () => {
                    await runtime.restoreSavePoint(save.saveId);
                    await showTimeline();
                }));
                row.append(label, load);
                drawerBody.append(row);
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
    root.prepend(toolbar);
    root.append(drawer);

    function sync() {
        const active = documentRef.body.dataset.atriaNativeSessionActive === 'true';
        toolbar.hidden = !active;
        if (!active) {
            drawer.hidden = true;
            status.textContent = '';
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
        drawer,
        sync,
        dispose() {
            observer.disconnect();
            toolbar.remove();
            drawer.remove();
        },
    });
}
