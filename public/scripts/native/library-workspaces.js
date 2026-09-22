import {
    createAtriaRuntimeCard,
    createAtriaStatePanel,
} from '../atria-shell/primitives.js';
import { translateShellText } from '../atria-shell/localization.js';
import { arrayBufferToBase64, nativeProductClient } from './product-client.js';

function panel(documentRef, kind, title, message) {
    return createAtriaStatePanel(documentRef, kind, {
        title: translateShellText(title),
        message: translateShellText(message),
    });
}

function button(documentRef, label, onClick, { disabled = false, className = '' } = {}) {
    const node = documentRef.createElement('button');
    node.type = 'button';
    node.textContent = translateShellText(label);
    node.disabled = disabled;
    if (className) node.className = className;
    node.addEventListener('click', onClick);
    return node;
}

function confirmAction(message) {
    return typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : true;
}

function formatTime(value) {
    const time = Number(value || 0);
    return time ? new Date(time).toLocaleString() : '—';
}

function downloadBase64(documentRef, data, filename) {
    const binary = atob(String(data || ''));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const anchor = documentRef.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

function errorMessage(error) {
    const code = String(error?.code || '');
    if (code.includes('referenced')) return 'This item is still referenced by Native content or progress.';
    return error?.message || String(error);
}

function replaceWithError(documentRef, body, title, error) {
    body.replaceChildren(panel(documentRef, 'error', title, errorMessage(error)));
}

async function openNativeSession(host, sessionId) {
    const open = globalThis.Atria?.openNativeSession;
    if (typeof open !== 'function') {
        throw new Error('Native Session opener is unavailable');
    }
    await open(sessionId);
    host.openPlay();
}

function createActions(documentRef) {
    const actions = documentRef.createElement('div');
    actions.className = 'atria-domain-workspace__actions';
    return actions;
}

function createInstallSurface(documentRef, onInstalled) {
    const root = documentRef.createElement('section');
    root.className = 'atria-native-install';
    root.dataset.atriaNativeInstall = 'true';

    const label = documentRef.createElement('label');
    label.textContent = translateShellText('Install / Update .atria');
    const input = documentRef.createElement('input');
    input.type = 'file';
    input.accept = '.atria,application/octet-stream';
    label.append(input);

    const result = documentRef.createElement('div');
    result.className = 'atria-native-install__result';

    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        result.replaceChildren(panel(documentRef, 'loading', 'Package preflight', 'Reading package metadata…'));
        try {
            const data = arrayBufferToBase64(await file.arrayBuffer());
            const preflight = await nativeProductClient.preflightPackage(data);
            const card = createAtriaRuntimeCard(documentRef, {
                title: preflight.name,
                description: `v${preflight.version} · ${preflight.capabilities.join(', ') || 'no declared capabilities'}`,
                status: preflight.requiredPermissions.length
                    ? `${preflight.requiredPermissions.length} permission grant(s) required`
                    : 'Ready to install',
                tone: preflight.requiredPermissions.length ? 'warning' : 'success',
            });
            card.dataset.atriaPackagePreflight = preflight.packageId;

            const permissions = documentRef.createElement('div');
            permissions.className = 'atria-native-install__permissions';
            const granted = new Map();
            for (const permission of preflight.requiredPermissions) {
                const row = documentRef.createElement('label');
                const checkbox = documentRef.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = permission;
                granted.set(permission, checkbox);
                row.append(checkbox, documentRef.createTextNode(' ' + permission));
                permissions.append(row);
            }

            const actions = createActions(documentRef);
            const install = button(documentRef, 'Install / Update', async () => {
                install.disabled = true;
                try {
                    const missing = preflight.requiredPermissions.filter(permission => !granted.get(permission)?.checked);
                    if (missing.length) throw new Error('Grant required permissions before installation: ' + missing.join(', '));
                    await nativeProductClient.installPackage(data, preflight.requiredPermissions);
                    result.replaceChildren(panel(documentRef, 'success', 'Package installed', preflight.name));
                    await onInstalled?.();
                } catch (error) {
                    result.replaceChildren(panel(documentRef, 'error', 'Package install failed', errorMessage(error)));
                } finally {
                    install.disabled = false;
                }
            });
            actions.append(install);
            card.append(permissions, actions);
            result.replaceChildren(card);
        } catch (error) {
            result.replaceChildren(panel(documentRef, 'error', 'Package preflight failed', errorMessage(error)));
        }
    });

    root.append(label, result);
    return root;
}

function createSessionCard(documentRef, session, host, refresh) {
    const dependency = session.dependency || { status: 'ready' };
    const ready = dependency.status === 'ready';
    const card = createAtriaRuntimeCard(documentRef, {
        title: session.displayTitle || 'Game progress',
        description: ready
            ? `Updated ${formatTime(session.updatedAt)}`
            : 'This Native Session is preserved, but its exact Package dependency is unavailable.',
        status: ready
            ? `${session.saveCount || 0} save(s) · Ready`
            : `Package dependency: ${dependency.status}`,
        tone: ready ? 'success' : 'warning',
    });
    card.dataset.atriaSessionId = session.sessionId;
    card.dataset.atriaPackageDependency = dependency.status;
    const actions = createActions(documentRef);
    actions.append(
        button(documentRef, 'Continue', () => openNativeSession(host, session.sessionId), { disabled: !ready }),
        button(documentRef, 'Export .atriasave', async () => {
            const exported = await nativeProductClient.exportSession(session.sessionId);
            downloadBase64(
                documentRef,
                exported.data,
                `${session.displayTitle || session.sessionId}.atriasave`,
            );
        }, { disabled: !ready }),
        button(documentRef, 'Delete', async () => {
            if (!confirmAction('Delete this Native Session and all of its SavePoints?')) return;
            await nativeProductClient.deleteSession(session.sessionId);
            await refresh();
        }),
    );
    if (!ready) {
        const details = documentRef.createElement('pre');
        details.className = 'atria-native-session-dependency';
        details.textContent = JSON.stringify(dependency.required || dependency, null, 2);
        card.append(details);
    }
    card.append(actions);
    return card;
}

function createSaveImportSurface(documentRef, host, onImported) {
    const root = documentRef.createElement('section');
    root.className = 'atria-native-save-import';
    root.dataset.atriaNativeSaveImport = 'true';
    const label = documentRef.createElement('label');
    label.textContent = translateShellText('Import .atriasave');
    const input = documentRef.createElement('input');
    input.type = 'file';
    input.accept = '.atriasave,application/octet-stream';
    label.append(input);
    const result = documentRef.createElement('div');
    result.className = 'atria-native-save-import__result';

    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        result.replaceChildren(panel(documentRef, 'loading', 'Save preflight', 'Checking Native Save dependencies…'));
        try {
            const data = arrayBufferToBase64(await file.arrayBuffer());
            const preflight = await nativeProductClient.preflightSave(data);
            const ready = preflight.dependency?.status === 'ready';
            const card = createAtriaRuntimeCard(documentRef, {
                title: 'Native Save',
                description: ready
                    ? 'Exact Package dependency is installed.'
                    : 'Install the exact Package version/content required by this Save before importing.',
                status: ready ? 'Ready to import' : `Package dependency: ${preflight.dependency?.status || 'unknown'}`,
                tone: ready ? 'success' : 'warning',
            });
            card.dataset.atriaSavePreflight = preflight.dependency?.status || 'unknown';
            if (!ready) {
                const required = documentRef.createElement('pre');
                required.textContent = JSON.stringify(
                    preflight.dependency?.required || preflight.package || {},
                    null,
                    2,
                );
                card.append(required);
            } else {
                const importActions = createActions(documentRef);
                importActions.append(button(documentRef, 'Import Save', async () => {
                    const snapshot = await nativeProductClient.importSave(data);
                    await onImported?.();
                    await openNativeSession(host, snapshot.session.sessionId);
                }));
                card.append(importActions);
            }
            result.replaceChildren(card);
        } catch (error) {
            result.replaceChildren(panel(documentRef, 'error', 'Save import failed', errorMessage(error)));
        }
    });
    root.append(label, result);
    return root;
}

async function renderWorks(documentRef, root, host, refresh) {
    const [works, sessions] = await Promise.all([
        nativeProductClient.listWorks(),
        nativeProductClient.listSessions(),
    ]);
    root.append(
        createInstallSurface(documentRef, refresh),
        createSaveImportSurface(documentRef, host, refresh),
    );

    const worksHeading = documentRef.createElement('h3');
    worksHeading.textContent = translateShellText('Works');
    root.append(worksHeading);
    if (!works.length) {
        root.append(panel(
            documentRef,
            'empty',
            'No Works installed',
            'Install a .atria Package to add a Work to your Native Library.',
        ));
    } else {
        const grid = documentRef.createElement('div');
        grid.className = 'atria-library-games__grid';
        grid.dataset.atriaNativeWorks = 'true';
        for (const work of works) {
            const manifest = work.manifest;
            const card = createAtriaRuntimeCard(documentRef, {
                title: work.package.displayName,
                description: manifest?.description || 'Native Package',
                status: work.status === 'ready'
                    ? `v${work.packageVersion?.version || '?'} · ${work.sessionCount} game(s)`
                    : work.status,
                tone: work.status === 'ready' ? 'success' : 'warning',
            });
            card.dataset.atriaWorkId = work.package.packageId;
            const actions = createActions(documentRef);
            actions.append(button(documentRef, 'Open', () => {
                host.openLibraryWork(work.package.packageId, work.package.displayName);
            }));
            card.append(actions);
            grid.append(card);
        }
        root.append(grid);
    }

    const gamesHeading = documentRef.createElement('h3');
    gamesHeading.textContent = translateShellText('My Games');
    root.append(gamesHeading);
    const games = documentRef.createElement('div');
    games.className = 'atria-library-games__grid';
    games.dataset.atriaMyGames = 'true';
    if (!sessions.length) {
        games.append(panel(documentRef, 'empty', 'No Native games yet', 'Start a Work EntryPoint to create a Native Session.'));
    } else {
        for (const session of sessions) games.append(createSessionCard(documentRef, session, host, refresh));
    }
    root.append(games);
}

async function renderWorkDetail(documentRef, root, host, packageId, refresh) {
    const work = await nativeProductClient.getWork(packageId);
    const manifest = work.manifest;
    const hero = createAtriaRuntimeCard(documentRef, {
        title: work.package.displayName,
        description: manifest?.description || 'Native Package',
        status: work.status === 'ready'
            ? `v${work.packageVersion?.version || '?'} · ${manifest?.entryPoints?.length || 0} EntryPoint(s)`
            : work.status,
        tone: work.status === 'ready' ? 'success' : 'warning',
    });
    hero.dataset.atriaWorkDetail = packageId;

    const actions = createActions(documentRef);
    const latest = work.sessions?.[0];
    if (latest) {
        actions.append(button(
            documentRef,
            'Continue',
            () => openNativeSession(host, latest.sessionId),
            { disabled: latest.dependency?.status !== 'ready' },
        ));
    }

    const entryPoints = manifest?.entryPoints || [];
    const selector = documentRef.createElement('select');
    selector.className = 'text_pole';
    selector.dataset.atriaEntryPointSelect = 'true';
    for (const entryPoint of entryPoints) {
        const option = documentRef.createElement('option');
        option.value = entryPoint.entryPointId;
        option.textContent = entryPoint.displayName;
        selector.append(option);
    }
    if (entryPoints.length > 1) actions.append(selector);
    actions.append(button(documentRef, 'Start New', async () => {
        const entryPointId = selector.value || entryPoints[0]?.entryPointId;
        if (!entryPointId) throw new Error('This Work has no EntryPoint');
        const created = await nativeProductClient.startWork(packageId, { entryPointId });
        await openNativeSession(host, created.session.sessionId);
    }, { disabled: work.status !== 'ready' }));
    actions.append(button(documentRef, 'Delete Work', async () => {
        if (!confirmAction('Delete this installed Work? Existing Native Sessions must be deleted first.')) return;
        try {
            await nativeProductClient.deleteWork(packageId);
            host.openLibrarySection('works');
        } catch (error) {
            hero.append(panel(documentRef, 'error', 'Work cannot be deleted', errorMessage(error)));
        }
    }));
    hero.append(actions);
    root.append(hero);

    const summary = documentRef.createElement('section');
    summary.className = 'atria-native-work-summary';
    summary.dataset.atriaWorkSummary = 'true';
    const heading = documentRef.createElement('h3');
    heading.textContent = translateShellText('Package information');
    const meta = documentRef.createElement('pre');
    meta.textContent = JSON.stringify({
        capabilities: manifest?.capabilities || [],
        permissions: manifest?.permissions || [],
        actors: (manifest?.actors || []).map(item => item.displayName),
        worlds: (manifest?.worlds || []).map(item => item.world?.displayName),
        knowledge: (manifest?.knowledge || []).map(item => item.knowledgeBase?.displayName),
    }, null, 2);
    summary.append(heading, meta);
    root.append(summary);

    const games = documentRef.createElement('section');
    games.dataset.atriaMyGames = 'true';
    const gamesHeading = documentRef.createElement('h3');
    gamesHeading.textContent = translateShellText('My Games');
    games.append(gamesHeading);
    if (!work.sessions?.length) {
        games.append(panel(documentRef, 'empty', 'No game progress yet', 'Start a new game from an EntryPoint.'));
    } else {
        for (const session of work.sessions) {
            games.append(createSessionCard(documentRef, session, host, refresh));
        }
    }
    root.append(games);
}

export function mountNativeWorksWorkspace({ document: documentRef, body, route, host }) {
    let disposed = false;
    let sequence = 0;

    async function render(nextRoute = route) {
        const token = ++sequence;
        const root = documentRef.createElement('section');
        root.className = 'atria-native-library';
        root.dataset.atriaNativeLibrary = 'works';
        body.replaceChildren(panel(documentRef, 'loading', 'Works', 'Loading Native Works…'));
        try {
            const childId = String(nextRoute?.child?.id || '');
            if (childId.startsWith('work:')) {
                await renderWorkDetail(
                    documentRef,
                    root,
                    host,
                    childId.slice('work:'.length),
                    () => render(nextRoute),
                );
            } else {
                await renderWorks(documentRef, root, host, () => render(nextRoute));
            }
            if (!disposed && token === sequence) body.replaceChildren(root);
        } catch (error) {
            if (!disposed && token === sequence) replaceWithError(documentRef, body, 'Works', error);
        }
    }

    void render(route);
    return {
        updateRoute(nextRoute) {
            void render(nextRoute);
        },
        dispose() {
            disposed = true;
            sequence += 1;
        },
    };
}

function createRevisionBlock(documentRef, revision, { current = false } = {}) {
    const details = documentRef.createElement('details');
    details.className = 'atria-native-revision';
    details.dataset.atriaRevisionId = revision.worldRevisionId || revision.knowledgeRevisionId || '';
    if (current) details.open = true;
    const summary = documentRef.createElement('summary');
    summary.textContent = `${current ? 'Current · ' : ''}${revision.worldRevisionId || revision.knowledgeRevisionId} · ${formatTime(revision.createdAt)}`;
    const pre = documentRef.createElement('pre');
    pre.textContent = JSON.stringify(revision, null, 2);
    details.append(summary, pre);
    return details;
}

function addWorldKnowledgeNav(documentRef, root, mode, host) {
    const nav = documentRef.createElement('nav');
    nav.className = 'atria-domain-workspace__nav atria-native-world-knowledge__nav';
    nav.dataset.atriaWorldKnowledgeNav = 'true';
    const worlds = button(documentRef, 'Worlds', () => host.openLibrarySection('worlds'));
    const knowledge = button(documentRef, 'Knowledge Bases', () => host.openLibrarySection('knowledge'));
    worlds.classList.toggle('is-selected', mode === 'worlds');
    knowledge.classList.toggle('is-selected', mode === 'knowledge');
    nav.append(worlds, knowledge);
    root.append(nav);
}

async function renderWorlds(documentRef, root, route, host) {
    const childId = String(route?.child?.id || '');
    if (childId.startsWith('world:')) {
        const worldId = childId.slice('world:'.length);
        const detail = await nativeProductClient.getWorld(worldId);
        const hero = createAtriaRuntimeCard(documentRef, {
            title: detail.world.displayName,
            description: 'Native World authority',
            status: `${detail.revisions.length} revision(s)`,
            tone: 'success',
        });
        hero.dataset.atriaWorldDetail = worldId;
        const actions = createActions(documentRef);
        const rename = documentRef.createElement('input');
        rename.className = 'text_pole';
        rename.value = detail.world.displayName;
        rename.setAttribute('aria-label', translateShellText('World name'));
        actions.append(
            rename,
            button(documentRef, 'Rename World', async () => {
                const updated = await nativeProductClient.updateWorld(worldId, rename.value);
                hero.querySelector('.atria-runtime-card__title').textContent = updated.displayName;
                rename.value = updated.displayName;
            }),
            button(documentRef, 'Delete World', async () => {
                if (!confirmAction('Delete this Native World?')) return;
                await nativeProductClient.deleteWorld(worldId);
                host.openLibrarySection('worlds');
            }),
        );
        hero.append(actions);
        root.append(hero);
        const history = documentRef.createElement('section');
        history.dataset.atriaWorldRevisionHistory = 'true';
        const title = documentRef.createElement('h3');
        title.textContent = translateShellText('Revision history');
        history.append(title);
        for (const revision of [...detail.revisions].reverse()) {
            history.append(createRevisionBlock(documentRef, revision, {
                current: revision.worldRevisionId === detail.world.currentRevisionId,
            }));
        }
        root.append(history);
        return;
    }

    const worlds = await nativeProductClient.listWorlds();
    const create = createActions(documentRef);
    const name = documentRef.createElement('input');
    name.className = 'text_pole';
    name.placeholder = translateShellText('New World name');
    create.append(
        name,
        button(documentRef, 'Create World', async () => {
            await nativeProductClient.createWorld(name.value);
            host.openLibrarySection('worlds');
        }),
    );
    root.append(create);
    const grid = documentRef.createElement('div');
    grid.className = 'atria-library-games__grid';
    grid.dataset.atriaWorldLibrary = 'true';
    if (!worlds.length) {
        root.append(panel(documentRef, 'empty', 'No Worlds', 'Native Worlds created or imported into your Library appear here.'));
        return;
    }
    for (const item of worlds) {
        const card = createAtriaRuntimeCard(documentRef, {
            title: item.world.displayName,
            description: 'Native World',
            status: item.currentRevision ? 'Revision ' + item.currentRevision.worldRevisionId : 'No revision',
        });
        const actions = createActions(documentRef);
        actions.append(button(documentRef, 'Open', () => host.openLibraryWorld(item.world.worldId, item.world.displayName)));
        card.append(actions);
        grid.append(card);
    }
    root.append(grid);
}

async function renderKnowledge(documentRef, root, route, host) {
    const childId = String(route?.child?.id || '');
    if (childId.startsWith('knowledge:')) {
        const knowledgeBaseId = childId.slice('knowledge:'.length);
        const detail = await nativeProductClient.getKnowledge(knowledgeBaseId);
        const hero = createAtriaRuntimeCard(documentRef, {
            title: detail.knowledgeBase.displayName,
            description: 'Native KnowledgeBase authority',
            status: `${detail.entries.length} entries · ${detail.revisions.length} revisions`,
            tone: 'success',
        });
        hero.dataset.atriaKnowledgeDetail = knowledgeBaseId;
        const actions = createActions(documentRef);
        const rename = documentRef.createElement('input');
        rename.className = 'text_pole';
        rename.value = detail.knowledgeBase.displayName;
        rename.setAttribute('aria-label', translateShellText('Knowledge Base name'));
        actions.append(
            rename,
            button(documentRef, 'Rename Knowledge Base', async () => {
                const updated = await nativeProductClient.updateKnowledge(knowledgeBaseId, rename.value);
                hero.querySelector('.atria-runtime-card__title').textContent = updated.displayName;
                rename.value = updated.displayName;
            }),
            button(documentRef, 'Delete Knowledge Base', async () => {
                if (!confirmAction('Delete this Native Knowledge Base?')) return;
                await nativeProductClient.deleteKnowledge(knowledgeBaseId);
                host.openLibrarySection('knowledge');
            }),
        );
        hero.append(actions);
        root.append(hero);

        const entries = documentRef.createElement('section');
        entries.dataset.atriaKnowledgeEntries = 'true';
        const entriesTitle = documentRef.createElement('h3');
        entriesTitle.textContent = translateShellText('Entries');
        entries.append(entriesTitle);
        for (const entry of detail.entries) {
            const card = createAtriaRuntimeCard(documentRef, {
                title: entry.metadata?.title || entry.knowledgeEntryId,
                description: entry.content,
                status: entry.delivery?.visibility?.join(', ') || 'default visibility',
            });
            card.dataset.atriaKnowledgeEntryId = entry.knowledgeEntryId;
            entries.append(card);
        }
        if (!detail.entries.length) entries.append(panel(documentRef, 'empty', 'No entries', 'This revision contains no Knowledge entries.'));
        root.append(entries);

        const bindings = documentRef.createElement('section');
        bindings.dataset.atriaKnowledgeBindings = 'true';
        const bindingsTitle = documentRef.createElement('h3');
        bindingsTitle.textContent = translateShellText('Bindings & references');
        bindings.append(bindingsTitle);
        for (const item of detail.bindings) {
            const card = createAtriaRuntimeCard(documentRef, {
                title: item.binding.knowledgeBindingId,
                description: `${item.binding.mode} · ${item.binding.enabled ? 'enabled' : 'disabled'}`,
                status: `${item.references.length} reference(s)`,
            });
            const pre = documentRef.createElement('pre');
            pre.textContent = JSON.stringify(item.references, null, 2);
            card.append(pre);
            bindings.append(card);
        }
        if (!detail.bindings.length) bindings.append(panel(documentRef, 'empty', 'No Library bindings', 'This Knowledge Base has no Library-owned bindings.'));
        root.append(bindings);

        const history = documentRef.createElement('section');
        history.dataset.atriaKnowledgeRevisionHistory = 'true';
        const historyTitle = documentRef.createElement('h3');
        historyTitle.textContent = translateShellText('Revision history');
        history.append(historyTitle);
        for (const revision of [...detail.revisions].reverse()) {
            history.append(createRevisionBlock(documentRef, revision, {
                current: revision.knowledgeRevisionId === detail.knowledgeBase.currentRevisionId,
            }));
        }
        root.append(history);
        return;
    }

    const bases = await nativeProductClient.listKnowledge();
    const create = createActions(documentRef);
    const name = documentRef.createElement('input');
    name.className = 'text_pole';
    name.placeholder = translateShellText('New Knowledge Base name');
    create.append(
        name,
        button(documentRef, 'Create Knowledge Base', async () => {
            await nativeProductClient.createKnowledge(name.value);
            host.openLibrarySection('knowledge');
        }),
    );
    root.append(create);
    const grid = documentRef.createElement('div');
    grid.className = 'atria-library-games__grid';
    grid.dataset.atriaKnowledgeLibrary = 'true';
    if (!bases.length) {
        root.append(panel(documentRef, 'empty', 'No Knowledge Bases', 'Native Knowledge Bases saved to your Library appear here.'));
        return;
    }
    for (const item of bases) {
        const card = createAtriaRuntimeCard(documentRef, {
            title: item.knowledgeBase.displayName,
            description: 'Native KnowledgeBase',
            status: `${item.bindingCount} binding(s)`,
        });
        const actions = createActions(documentRef);
        actions.append(button(documentRef, 'Open', () => (
            host.openLibraryKnowledge(item.knowledgeBase.knowledgeBaseId, item.knowledgeBase.displayName)
        )));
        card.append(actions);
        grid.append(card);
    }
    root.append(grid);
}

function worldKnowledgeMode(route) {
    const id = String(route?.child?.id || '');
    return id === 'knowledge' || id.startsWith('knowledge:') ? 'knowledge' : 'worlds';
}

export function mountNativeWorldKnowledgeWorkspace({ document: documentRef, body, route, host }) {
    let disposed = false;
    let sequence = 0;

    async function render(nextRoute = route) {
        const token = ++sequence;
        const mode = worldKnowledgeMode(nextRoute);
        const root = documentRef.createElement('section');
        root.className = 'atria-native-library atria-native-world-knowledge';
        root.dataset.atriaNativeLibrary = 'worlds-knowledge';
        addWorldKnowledgeNav(documentRef, root, mode, host);
        body.replaceChildren(panel(
            documentRef,
            'loading',
            mode === 'worlds' ? 'Worlds' : 'Knowledge Bases',
            'Loading Native Library…',
        ));
        try {
            if (mode === 'worlds') await renderWorlds(documentRef, root, nextRoute, host);
            else await renderKnowledge(documentRef, root, nextRoute, host);
            if (!disposed && token === sequence) body.replaceChildren(root);
        } catch (error) {
            if (!disposed && token === sequence) replaceWithError(
                documentRef,
                body,
                mode === 'worlds' ? 'Worlds' : 'Knowledge Bases',
                error,
            );
        }
    }

    void render(route);
    return {
        updateRoute(nextRoute) {
            void render(nextRoute);
        },
        dispose() {
            disposed = true;
            sequence += 1;
        },
    };
}
