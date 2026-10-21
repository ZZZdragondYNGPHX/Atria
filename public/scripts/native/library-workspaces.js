import { formatAtriaDate } from '../atria-shell/components.js';
import { createAtriaIcon } from '../atria-shell/icons.js';
import { ensureTaskBindings } from './task-binding-ui.js';
import { mountResourceSetup } from './resource-setup.js';
import { sessionTitleField, mountSessionRename } from './session-naming.js';
import { mountSaveDependencyRecovery } from './save-dependency-recovery.js';
import { permissionRow, renderPackageUpdateReview, mountWorkPermissions } from './package-permissions.js';
import { mountPackageLibraryList, mountPackageLibraryOriginal } from './package-library-resources.js';
import { resourceBundleExport, resourceLibraryCopy, mountResourceBundleImport } from './resource-bundle-controls.js';
import { mountLibraryRevisionHistory } from './library-revision-history.js';
import { nativeStudioClient } from './studio-client.js';
import { mountKnowledgeBindingManager } from './knowledge-binding-manager.js';
import { mountLibraryRevisionEditor } from './library-revision-editor.js';
import { mountKnowledgeEntryBrowser } from './knowledge-entry-browser.js';
import { createAtriaStatePanel } from '../atria-shell/primitives.js';
import { parseKnowledgeEntryChild, parsePackageOriginalChild } from '../atria-shell/library-route-ids.js';
import { translateShellText as tl } from '../atria-shell/localization.js';
import { arrayBufferToBase64, nativeProductClient as client } from './product-client.js';
import { el, action, heading, disclosure, field, cover, feedback, libraryError, confirmLibraryAction, referenceRemediation, worldParameterSummary } from './library-ui.js';

const actions = (doc, parent) => el(doc, 'div', 'atri-library-actions', undefined, parent);
const time = value => value ? formatAtriaDate(value) : '—';
function state(doc, root, kind, title, message) {
    const node = createAtriaStatePanel(doc, kind, { title: tl(title), message: tl(message) });
    root.append(node); return node;
}
function section(doc, root, title, marker) {
    const node = el(doc, 'section', 'atri-library-section', undefined, root);
    if (marker) node.dataset[marker] = 'true';
    el(doc, 'h3', '', tl(title), node); return node;
}
async function openSession(host, id) {
    if (!globalThis.Atria?.openNativeSession) throw new Error('Native Session opener is unavailable');
    await globalThis.Atria.openNativeSession(id); host.openPlay();
}
function download(doc, payload, filename) {
    const bytes = Uint8Array.from(atob(payload.data), char => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const anchor = el(doc, 'a'); anchor.href = url; anchor.download = payload.fileName || filename;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
}

function importSurface(doc, parent, kind, host) {
    const isPackage = kind === 'package';
    const root = el(doc, 'section', 'atri-library-import', undefined, parent);
    root.dataset[isPackage ? 'atriaNativeInstall' : 'atriaNativeSaveImport'] = 'true';
    heading(doc, root, isPackage ? 'Install / Update .atria' : 'Import .atriasave',
        isPackage ? 'Choose a work to review its permissions before installing.' : 'Import an Atria save. Its matching work must already be installed.');
    const input = field(doc, root, isPackage ? 'Choose an Atria work' : 'Choose an Atria save', '', 'file');
    input.accept = isPackage ? '.atria,application/octet-stream' : '.atriasave,application/octet-stream';
    const choose = action(doc, root, isPackage ? 'Choose an Atria work' : 'Choose an Atria save', () => input.click());
    const result = el(doc, 'div', 'atri-library-import-result', undefined, root);
    result.setAttribute('aria-live', 'polite');
    let sequence = 0; let processing = false;
    const reset = () => { if (processing) return; sequence++; input.value = ''; result.replaceChildren(); input.focus(); };
    action(doc, root, 'Cancel', () => { if (processing) return; sequence++; host.openLibrarySection('works'); });
    input.addEventListener('change', async () => {
        const file = input.files?.[0]; if (!file) return;
        const token = ++sequence;
        const current = () => token === sequence && root.isConnected;
        result.replaceChildren(); state(doc, result, 'loading', 'Checking file', 'Reading metadata…');
        try {
            if (file.size > (isPackage ? 128 : 64) * 1024 * 1024) throw new Error(tl('The file exceeds the supported size.'));
            const data = arrayBufferToBase64(await file.arrayBuffer());
            const inspect = async () => {
                const preflight = await (isPackage ? client.preflightPackage(data) : client.preflightSave(data));
                if (!current()) return;
                result.replaceChildren();
                const ready = isPackage || preflight.dependency?.status === 'ready';
                const review = el(doc, 'section', 'atri-library-import-review', undefined, result);
                review.dataset[isPackage ? 'atriaPackagePreflight' : 'atriaSavePreflight'] = isPackage ? preflight.packageId : preflight.dependency?.status || 'unknown';
                el(doc, 'h4', '', isPackage ? preflight.name : file.name, review);
                el(doc, 'p', '', isPackage ? `${tl('Version')} ${preflight.version}` : tl(ready ? 'Ready to import this save.' : 'Install the matching work in Library before importing this save.'), review);
                const grants = new Map();
                if (isPackage) renderPackageUpdateReview(doc, review, preflight);
                if (isPackage && (preflight.permissions?.length || preflight.requiredPermissions.length)) {
                    const permissions = el(doc, 'fieldset', 'atri-library-permissions', undefined, review);
                    el(doc, 'legend', '', tl('Requested permissions'), permissions);
                    for (const permission of preflight.permissions || preflight.requiredPermissions.map(permission => ({ permission, required: true }))) {
                        const checkbox = permissionRow(doc, permissions, permission, { checkbox: permission.required });
                        if (checkbox) grants.set(permission.permission, checkbox);
                    }
                }
                disclosure(doc, review, 'Details', isPackage ? { capabilities: preflight.capabilities, packageId: preflight.packageId, packageVersionId: preflight.packageVersionId } : preflight.dependency?.required || preflight.package);
                if (!ready) {
                    mountSaveDependencyRecovery({ document: doc, root: review, preflight, saveData: data, host, isCurrent: current, onReady: inspect }); return;
                }
                const passwordInput = isPackage ? null : field(doc, review, 'Save password (leave blank if none)', '', 'password');
                const controls = actions(doc, review);
                const submit = action(doc, controls, isPackage ? 'Install / Update' : 'Import Save', async () => {
                    if (!current()) return;
                    processing = true; input.disabled = choose.disabled = true;
                    try {
                        let imported;
                        if (isPackage) {
                            const missing = preflight.requiredPermissions.filter(permission => !grants.get(permission)?.checked);
                            if (missing.length) throw new Error(tl('Grant required permissions before installation:') + ' ' + missing.join(', '));
                            await client.installPackage(data, preflight.requiredPermissions, preflight.update?.previous?.packageVersionId || null);
                        } else {
                            const password = passwordInput.value; if (!current()) return;
                            // Dependencies may have changed since review; the service revalidates import too.
                            const checked = await client.preflightSave(data);
                            if (!current()) return;
                            if (checked.dependency?.status !== 'ready') { await inspect(); return; }
                            imported = await client.importSave(data, password);
                        }
                        if (!current()) return;
                        result.replaceChildren();
                        feedback(doc, result, tl(isPackage ? 'Work installed.' : 'Save imported.'));
                        // Keep the write receipt on screen. Opening/refresh failure must never replay a write.
                        action(doc, result, isPackage ? 'Open Work' : 'Open Session', () => isPackage
                            ? host.openLibraryWork(preflight.packageId, preflight.name)
                            : openSession(host, imported.session.sessionId), { primary: true });
                        if (isPackage) disclosure(doc, result, 'Details', { packageId: preflight.packageId, packageVersionId: preflight.packageVersionId, version: preflight.version });
                        action(doc, result, 'Choose another file', reset);
                        void host.refreshSearch?.();
                    } catch (error) {
                        if (!current()) return;
                        feedback(doc, controls, libraryError(error), true);
                        if (error.status === 409) action(doc, controls, 'Review file again', inspect);
                    } finally { processing = false; input.disabled = choose.disabled = false; }
                }, { primary: true });
                action(doc, controls, 'Cancel', reset);
                submit.focus();
            };
            await inspect();
        } catch (error) {
            if (!current()) return;
            result.replaceChildren(); feedback(doc, result, libraryError(error), true);
            action(doc, result, 'Try again', () => input.dispatchEvent(new doc.defaultView.Event('change')));
        }
    });
    return root;
}

function sessionRow(doc, parent, session, host, refresh, workName) {
    const dependency = session.dependency || { status: 'ready' }; const ready = dependency.status === 'ready';
    const row = el(doc, 'article', 'atri-library-row atri-library-session', undefined, parent);
    row.dataset.atriaSessionId = session.sessionId; row.dataset.atriaPackageDependency = dependency.status;
    const content = el(doc, 'div', 'atri-library-row-content', undefined, row);
    el(doc, 'h4', '', session.displayTitle || workName || tl('Untitled session'), content);
    el(doc, 'p', '', ready ? time(session.updatedAt) : tl('The matching work needs to be installed.'), content);
    el(doc, 'p', 'atri-library-meta', `${session.saveCount || 0} ${tl('Saves')}`, content);
    const controls = actions(doc, row);
    action(doc, controls, 'Continue', () => openSession(host, session.sessionId), { disabled: !ready, primary: true });
    const more = disclosure(doc, controls, 'Manage');
    mountSessionRename({ document: doc, root: more, session, onSaved: refresh });
    const resourceSetup = el(doc, 'div', '', undefined, more);
    action(doc, more, 'Worlds & Knowledge', () => mountResourceSetup({ document: doc, root: resourceSetup, packageId: session.packageId, sessionId: session.sessionId, host, onSaved: refresh }), { disabled: !ready });
    const extra = actions(doc, more);
    action(doc, extra, 'Export .atriasave', async () => download(doc, await client.exportSession(session.sessionId), `${session.displayTitle || session.sessionId}.atriasave`), { disabled: !ready });
    action(doc, extra, 'Delete', async () => {
        if (!await confirmLibraryAction('Delete this Native Session and all of its SavePoints?')) return;
        await client.deleteSession(session.sessionId); await refresh();
    }, { danger: true });
    if (!ready) {
        disclosure(doc, content, 'Dependency details', dependency.required || dependency);
        mountSaveDependencyRecovery({ document: doc, root: content, preflight: { dependency }, host,
            recheck: async () => (await client.listSessions(session.packageId)).find(item => item.sessionId === session.sessionId),
            onReady: async () => { await openSession(host, session.sessionId); } });
    }
    return row;
}

// Library-wide tools (search, import, install) live in the top bar's tool capsule
// when the shell offers it; standalone mounts keep them inline.
function libraryTools(doc, root, host, browseState, placeholder) {
    const bar = el(doc, 'div', 'atri-library-tools');
    const search = el(doc, 'label', 'atri-library-search', undefined, bar);
    const input = el(doc, 'input', '', undefined, search); input.type = 'search';
    input.value = browseState.query || ''; input.placeholder = tl(placeholder); input.setAttribute('aria-label', tl(placeholder));
    el(doc, 'kbd', '', '/', search).setAttribute('aria-hidden', 'true');
    action(doc, bar, 'Import .atriasave', () => host.openLibrarySection('import-save'));
    action(doc, bar, 'Install / Update .atria', () => host.openLibrarySection('install'), { primary: true });
    if (typeof host.setContextActions === 'function') host.setContextActions([bar]);
    else root.prepend(bar);
    return input;
}

function workStatus(doc, parent, work) {
    const line = el(doc, 'span', 'atri-library-work-status', undefined, parent);
    const ready = work.status === 'ready';
    const seal = el(doc, 'span', 'atria-seal', work.packageVersion?.version ? 'v' + work.packageVersion.version : '—', line);
    if (ready) seal.dataset.seal = 'current';
    const chip = el(doc, 'span', 'atri-library-chip', tl(ready ? 'Ready' : 'Unavailable'), line);
    chip.dataset.tone = ready ? 'ready' : 'missing';
    return line;
}

async function works(doc, root, host, refresh, browseState, selectedId = '') {
    const [workResult, sessionResult] = await Promise.allSettled([client.listWorks(), client.listSessions()]);
    const items = workResult.status === 'fulfilled' ? workResult.value : [];
    const sessions = sessionResult.status === 'fulfilled' ? sessionResult.value : [];
    const filter = libraryTools(doc, root, host, browseState, 'Search works');
    const nameOf = id => items.find(work => work.package.packageId === id)?.package.displayName;
    // Continue reading: the latest exact Sessions, only when their Work is ready.
    const resumable = sessions.filter(item => (item.dependency?.status || 'ready') === 'ready')
        .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)).slice(0, 3);
    if (resumable.length) {
        const resume = section(doc, root, 'Continue reading', 'atriaResume');
        const strip = el(doc, 'div', 'atri-library-resume', undefined, resume);
        resumable.forEach((session, index) => {
            const workName = nameOf(session.packageId);
            const card = el(doc, 'article', 'atri-library-resume-card', undefined, strip);
            card.dataset.atriaSessionId = session.sessionId;
            card.append(cover(doc, session.packageId, workName || ''));
            el(doc, 'strong', '', session.displayTitle || workName || tl('Untitled session'), card);
            el(doc, 'span', 'atri-library-meta', [workName, time(session.updatedAt)].filter(Boolean).join(' · '), card);
            const row = el(doc, 'div', 'atri-library-resume-row', undefined, card);
            el(doc, 'span', 'atri-library-meta', `${session.saveCount || 0} ${tl('Saves')}`, row);
            action(doc, row, 'Continue', () => openSession(host, session.sessionId), { primary: index === 0 });
        });
    }
    const shelf = section(doc, root, 'Works', 'atriaShelf');
    const head = el(doc, 'div', 'atri-library-shelf-head', undefined, shelf);
    head.append(shelf.querySelector('h3'));
    const count = el(doc, 'span', 'atri-library-meta', '', head); count.setAttribute('role', 'status');
    const scopes = el(doc, 'div', 'atria-segmented atri-library-scope', undefined, head);
    scopes.setAttribute('role', 'group'); scopes.setAttribute('aria-label', tl('Filter works'));
    const grid = el(doc, 'div', 'atri-library-posters', undefined, shelf); grid.dataset.atriaNativeWorks = 'true';
    const scopeTest = { all: () => true, ready: work => work.status === 'ready', attention: work => work.status !== 'ready' };
    browseState.scope = scopeTest[browseState.scope] ? browseState.scope : 'all';
    const render = () => {
        grid.replaceChildren();
        const query = filter.value.trim().toLowerCase();
        const matching = items.filter(item => scopeTest[browseState.scope](item) && `${item.package.displayName} ${item.manifest?.description || ''}`.toLowerCase().includes(query));
        count.textContent = `${matching.length} / ${items.length}`;
        for (const button of scopes.children) button.setAttribute('aria-pressed', String(button.dataset.scope === browseState.scope));
        if (workResult.status === 'rejected') {
            state(doc, grid, 'error', 'Library could not be loaded', libraryError(workResult.reason));
            action(doc, grid, 'Try again', refresh);
        } else if (!matching.length) state(doc, grid, 'empty', items.length ? 'No matching works' : 'No Works installed', items.length ? 'Try another search.' : 'Install an Atria work to begin your collection.');
        for (const work of matching) {
            const card = el(doc, 'article', 'atri-library-work', undefined, grid); card.dataset.atriaWorkId = work.package.packageId;
            const open = action(doc, card, 'Open', () => host.openLibraryWork(work.package.packageId, work.package.displayName));
            open.className = 'atri-library-work-open'; open.setAttribute('aria-label', tl('Open') + ' ' + work.package.displayName);
            if (work.package.packageId === selectedId) open.setAttribute('aria-current', 'true');
            open.replaceChildren(cover(doc, work.package.packageId, work.package.displayName));
            el(doc, 'h3', '', work.package.displayName, open);
            workStatus(doc, open, work);
        }
    };
    for (const [key, label] of [['all', 'All'], ['ready', 'Ready'], ['attention', 'Needs attention']]) {
        const button = el(doc, 'button', 'atria-segmented__item', tl(label), scopes); button.type = 'button'; button.dataset.scope = key;
        button.addEventListener('click', () => { browseState.scope = key; render(); });
    }
    filter.addEventListener('input', () => { browseState.query = filter.value; render(); }); render();
    if (sessionResult.status === 'rejected') {
        state(doc, root, 'error', 'Library could not be loaded', libraryError(sessionResult.reason));
        action(doc, root, 'Try again', refresh);
    }
}

// My stories: every exact Session, newest first; broken dependencies stay listed with recovery.
async function games(doc, root, host, refresh, browseState) {
    const [workResult, sessionResult] = await Promise.allSettled([client.listWorks(), client.listSessions()]);
    const items = workResult.status === 'fulfilled' ? workResult.value : [];
    const filter = libraryTools(doc, root, host, browseState, 'Search stories');
    heading(doc, root, 'My stories', 'Each story keeps the exact work version and starting point it began with.');
    const list = el(doc, 'div', 'atri-library-grouped-list', undefined, root); list.dataset.atriaMyGames = 'true';
    if (sessionResult.status === 'rejected') {
        state(doc, list, 'error', 'Library could not be loaded', libraryError(sessionResult.reason));
        action(doc, list, 'Try again', refresh); return;
    }
    const sessions = [...sessionResult.value].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    const nameOf = id => items.find(work => work.package.packageId === id)?.package.displayName;
    const render = () => {
        list.replaceChildren();
        const query = filter.value.trim().toLowerCase();
        const matching = sessions.filter(item => `${item.displayTitle || ''} ${nameOf(item.packageId) || ''}`.toLowerCase().includes(query));
        if (!matching.length) state(doc, list, 'empty', sessions.length ? 'No matching stories' : 'No game progress yet', sessions.length ? 'Try another search.' : 'Open a work and start a new story.');
        for (const item of matching) {
            const row = sessionRow(doc, list, item, host, refresh, nameOf(item.packageId));
            row.prepend(cover(doc, item.packageId, nameOf(item.packageId) || ''));
        }
    };
    filter.addEventListener('input', () => { browseState.query = filter.value; render(); }); render();
}

async function workDetail(doc, root, host, id, refresh) {
    const work = await client.getWork(id); const manifest = work.manifest;
    const hero = el(doc, 'header', 'atri-library-work-hero', undefined, root); hero.dataset.atriaWorkDetail = id;
    const backdrop = cover(doc, id, ''); backdrop.classList.add('atri-library-hero-bg'); hero.append(backdrop, cover(doc, id, work.package.displayName));
    const content = el(doc, 'div', 'atri-library-hero-content', undefined, hero);
    const close = action(doc, hero, 'Close details', () => host.openLibrarySection('works'));
    close.classList.add('atri-library-detail-close');
    heading(doc, content, work.package.displayName, manifest?.description || '', true);
    el(doc, 'p', 'atri-library-meta', `${tl('Version')} ${work.packageVersion?.version || '—'}`, content);
    if (work.status !== 'ready') state(doc, content, 'error', 'This work is unavailable', 'Reinstall the matching work to continue. Your progress is kept.');
    const entryPoints = manifest?.entryPoints || [];
    const selectLabel = el(doc, 'label', 'atri-library-field', tl('Starting point'), content);
    const selector = el(doc, 'select', '', undefined, selectLabel); selector.dataset.atriaEntryPointSelect = 'true';
    for (const entry of entryPoints) { const option = el(doc, 'option', '', entry.displayName, selector); option.value = entry.entryPointId; }
    selectLabel.hidden = entryPoints.length <= 1;
    const title = sessionTitleField(doc, content);
    const controls = actions(doc, content); const latest = work.sessions?.[0];
    if (latest) action(doc, controls, 'Continue', () => openSession(host, latest.sessionId), { disabled: latest.dependency?.status !== 'ready', primary: true });
    const modelSetup = el(doc, 'div', '', undefined, content);
    action(doc, controls, 'Start New', async () => {
        const options = { displayTitle: title.value, packageVersionId: work.packageVersion.packageVersionId, entryPointId: selector.value || entryPoints[0]?.entryPointId };
        let created;
        const start = async () => { created ??= await client.startWork(id, options); await openSession(host, created.session.sessionId); };
        if (await ensureTaskBindings({ document: doc, root: modelSetup, manifest, packageId: id, packageVersionId: options.packageVersionId, host, onReady: start })) await start();
    }, { disabled: work.status !== 'ready' || !entryPoints.length, primary: !latest });
    const resourceSetup = el(doc, 'div', '', undefined, root);
    action(doc, controls, 'Configure Worlds & Knowledge', () => mountResourceSetup({ document: doc, root: resourceSetup, packageId: id, entryPointId: selector.value || entryPoints[0]?.entryPointId, host }), { disabled: work.status !== 'ready' });
    const info = section(doc, root, 'About this work', 'atriaWorkSummary');
    const facts = el(doc, 'dl', 'atri-library-facts', undefined, info);
    for (const [label, values] of [['Actors', manifest?.actors?.map(item => item.displayName)], ['Worlds', manifest?.worlds?.map(item => item.world?.displayName)], ['Knowledge Bases', manifest?.knowledge?.map(item => item.knowledgeBase?.displayName)]]) {
        el(doc, 'dt', '', tl(label), facts); el(doc, 'dd', '', values?.filter(Boolean).join(', ') || '—', facts);
    }
    mountWorkPermissions({ document: doc, root: info, work, onManage: () => { management.open = true; management.scrollIntoView?.({ block: 'start' }); } });
    disclosure(doc, info, 'Capabilities', manifest?.capabilities || []);
    disclosure(doc, info, 'Exact dependencies', {
        worlds: manifest?.worlds?.map(item => ({ worldId: item.world.worldId, worldRevisionId: item.revision.worldRevisionId })),
        knowledge: manifest?.knowledge?.map(item => ({ knowledgeBaseId: item.knowledgeBase.knowledgeBaseId, knowledgeRevisionId: item.revision.knowledgeRevisionId })),
        bindings: manifest?.knowledgeBindings || [],
        resources: manifest?.resources?.map(item => ({ resourceType: item.resourceType, origin: item.origin, revision: item.resource.revision })),
        runtime: manifest?.runtime,
    });
    const versions = section(doc, root, 'Installed versions');
    for (const version of work.versions || []) {
        const row = el(doc, 'div', 'atri-library-version', undefined, versions);
        el(doc, 'strong', '', version.version, row);
        if (version.packageVersionId === work.package.currentVersionId) el(doc, 'span', 'atri-library-meta', tl('Current'), row);
        disclosure(doc, row, 'Details', version);
        row.dataset.atriaInstalledVersion = version.packageVersionId;
        action(doc, row, 'Start from this version', async () => {
            row.querySelector('[data-atria-version-start]')?.remove();
            const exact = await client.getWorkVersion(id, version.packageVersionId);
            const review = el(doc, 'section', 'atri-library-section', undefined, row); review.dataset.atriaVersionStart = 'true';
            el(doc, 'h4', '', exact.manifest.name + ' · ' + exact.packageVersion.version, review);
            el(doc, 'p', '', tl(exact.current ? 'This is the current default version.' : 'This starts a separate Session on a non-default installed version.'), review);
            el(doc, 'p', '', tl('The default Work version and existing Sessions remain unchanged.'), review);
            const label = el(doc, 'label', 'atri-library-field', tl('Starting point'), review);
            const entries = el(doc, 'select', '', undefined, label); entries.setAttribute('aria-label', tl('Starting point'));
            for (const entry of exact.manifest.entryPoints) { const option = el(doc, 'option', '', entry.displayName, entries); option.value = entry.entryPointId; }
            const versionTitle = sessionTitleField(doc, review);
            const versionSetup = el(doc, 'div', '', undefined, review);
            let createdSessionId = null;
            action(doc, review, 'Create Session on this version', async () => {
                const start = async () => {
                    if (!createdSessionId) {
                        const created = await client.startWork(id, { displayTitle: versionTitle.value, packageVersionId: version.packageVersionId, entryPointId: entries.value });
                        createdSessionId = created.session.sessionId; entries.disabled = true; versionTitle.disabled = true;
                    }
                    await openSession(host, createdSessionId);
                };
                if (await ensureTaskBindings({ document: doc, root: versionSetup, manifest: exact.manifest, packageId: id, packageVersionId: version.packageVersionId, host, onReady: start })) await start();
            }, { primary: true, disabled: !exact.manifest.entryPoints.length });
            action(doc, review, 'Cancel', () => review.remove());
        });
    }
    const games = section(doc, root, 'My Games', 'atriaMyGames');
    if (!work.sessions?.length) state(doc, games, 'empty', 'No game progress yet', 'Start a new story from this work.');
    work.sessions?.forEach(item => sessionRow(doc, games, item, host, refresh, work.package.displayName));
    const management = disclosure(doc, root, 'Manage work');
    el(doc, 'p', '', tl('Export any progress you want to keep, then remove dependent Sessions before uninstalling this Work.'), management);
    action(doc, management, 'Review dependent Sessions', () => { games.scrollIntoView?.({ block: 'start' }); games.setAttribute('tabindex', '-1'); games.focus(); });
    action(doc, management, 'Delete Work', async () => {
        if (!await confirmLibraryAction('Delete this installed Work? Existing Native Sessions must be deleted first.')) return;
        await client.deleteWork(id); host.openLibrarySection('works');
    }, { danger: true });
}

// Worlds & Knowledge (K01–K11): resource list pane beside the editor, as in the
// design. The list stays put while a World, Knowledge Base or installed original is open.
async function worldKnowledge(doc, root, route, host, browseState = {}) {
    const child = String(route?.child?.id || '');
    const knowledge = child === 'knowledge' || child.startsWith('knowledge:');
    const original = parsePackageOriginalChild(child);
    root.classList.add('atri-library-resource-split');
    const pane = el(doc, 'aside', 'atri-library-resource-pane', undefined, root);
    pane.setAttribute('aria-label', tl(knowledge ? 'Knowledge Bases' : 'Worlds'));
    const main = el(doc, 'section', 'atri-library-resource-main', undefined, root);
    const opened = !original && (child.startsWith('world:') || child.startsWith('knowledge:'));
    const target = parseKnowledgeEntryChild(child);
    const selectedId = opened ? target?.knowledgeBaseId || child.split(':').slice(1).join(':') : '';
    const refresh = async () => { const next = doc.createElement('section'); await worldKnowledge(doc, next, route, host, browseState); if (root.isConnected) { root.replaceChildren(...next.childNodes); } };
    await Promise.all([
        // A list failure stays in the pane; an open resource remains usable.
        resourceList(doc, pane, knowledge, host, browseState, selectedId, refresh, original).catch(error => state(doc, pane, 'error', 'Library could not be loaded', libraryError(error))),
        original ? mountPackageLibraryOriginal({ document: doc, root: main, ref: original, host })
            : opened ? resourceDetail(doc, main, route, host, browseState) : Promise.resolve(resourceEmpty(doc, main, knowledge)),
    ]);
}

function resourceEmpty(doc, main, knowledge) {
    const empty = el(doc, 'div', 'atri-library-resource-empty', undefined, main);
    empty.append(createAtriaIcon(doc, knowledge ? 'book' : 'globe', { size: 22 }));
    el(doc, 'p', '', tl(knowledge ? 'Select a Knowledge Base to edit, or create a new one.' : 'Select a World to edit, or create a new one.'), empty);
}

async function resourceDetail(doc, root, route, host, browseState = {}) {
    const child = String(route?.child?.id || '');
    const knowledge = child === 'knowledge' || child.startsWith('knowledge:');
    const target = parseKnowledgeEntryChild(child);
    const id = target?.knowledgeBaseId || child.split(':').slice(1).join(':');
    const detail = await (knowledge ? client.getKnowledge(id, target?.revisionId) : client.getWorld(id));
    const resource = knowledge ? detail.knowledgeBase : detail.world;
    const hero = heading(doc, root, resource.displayName, tl(knowledge ? 'Knowledge available to your stories.' : 'A shared setting for your stories.'), true);
    hero.dataset[knowledge ? 'atriaKnowledgeDetail' : 'atriaWorldDetail'] = id;
    action(doc, hero, 'Close details', () => host.openLibrarySection(knowledge ? 'knowledge' : 'worlds')).classList.add('atri-library-detail-close');
    if (target) {
        const entry = detail.entries.find(item => item.knowledgeEntryId === target.entryId);
        if (!entry) throw new Error(tl('Knowledge entry unavailable'));
        const article = el(doc, 'article', 'atri-library-knowledge-entry', undefined, root);
        article.dataset.atriaKnowledgeEntryId = entry.knowledgeEntryId;
        el(doc, 'h4', '', entry.metadata?.title || tl('Knowledge entry'), article);
        el(doc, 'p', '', entry.content, article);
        disclosure(doc, article, 'Details', { knowledgeRevisionId: target.revisionId, knowledgeEntryId: target.entryId });
        action(doc, actions(doc, root), 'Open Knowledge Base', () => host.openLibraryKnowledge(id, resource.displayName));
        article.tabIndex = -1; queueMicrotask(() => article.focus());
        return;
    }
    const ref = { scope: 'library', resourceType: knowledge ? 'core.knowledge' : 'core.world', resourceId: id, revision: resource.currentRevisionId };
    const editRevision = (initialEntryId, entryEnabled, entryAction) => {
        const reload = async saved => {
            const next = doc.createElement('section');
            await resourceDetail(doc, next, route, host, browseState);
            if (!root.isConnected) return;
            root.replaceChildren(...next.childNodes);
            if (initialEntryId) [...root.querySelectorAll('[data-atria-knowledge-entry-id]')].find(row => row.dataset.atriaKnowledgeEntryId === initialEntryId)?.querySelector('summary')?.focus();
            if (saved) feedback(doc, root, tl('Saved immutable Library revision.') + ' ' + (saved.worldRevisionId || saved.knowledgeRevisionId));
        };
        root.replaceChildren();
        mountLibraryRevisionEditor({ document: doc, root, detail, knowledge, initialEntryId, entryEnabled, entryAction, browseState, onClose: () => reload(), onSaved: reload });
    };
    // One primary action; copies and exports are secondary, and rename/delete sit at the end.
    const revisionActions = actions(doc, root);
    action(doc, revisionActions, resource.currentRevisionId ? 'New revision' : 'Create first revision', () => editRevision(), { primary: true });
    resourceLibraryCopy(doc, revisionActions, ref, host, 'Duplicate');
    resourceBundleExport(doc, revisionActions, ref, resource.displayName);
    if (knowledge) {
        const entries = section(doc, root, 'Entries', 'atriaKnowledgeEntries');
        el(doc, 'p', 'atri-library-meta', tl('Entry changes are drafts. Review and save a new immutable revision; existing bindings keep their exact revision.'), entries);
        action(doc, entries, 'Add entry', () => editRevision(undefined, undefined, 'add'), { primary: true });
        mountKnowledgeEntryBrowser({ document: doc, root: entries, entries: detail.entries, state: browseState, onDelete: entry => editRevision(entry.knowledgeEntryId, undefined, 'delete'), onEdit: entry => editRevision(entry.knowledgeEntryId), onToggle: (entry, enabled) => editRevision(entry.knowledgeEntryId, enabled) });
        if (!detail.entries.length) state(doc, entries, 'empty', 'No entries', 'This revision contains no Knowledge entries.');
        const bindings = section(doc, root, 'Bindings & references', 'atriaKnowledgeBindings');
        mountKnowledgeBindingManager({ document: doc, root: bindings, detail, host });
    } else worldParameterSummary(doc, root, detail.currentRevision);
    mountLibraryRevisionHistory({ document: doc, root, detail, knowledge, host, onReload: async () => { root.replaceChildren(); await resourceDetail(doc, root, route, host, browseState); } });
    const manage = disclosure(doc, root, 'Manage resource');
    const name = field(doc, manage, knowledge ? 'Knowledge Base name' : 'World name', resource.displayName); name.required = true;
    const controls = actions(doc, manage);
    action(doc, controls, knowledge ? 'Rename Knowledge Base' : 'Rename World', async () => {
        if (!name.value.trim()) { name.setCustomValidity(tl('Enter a name.')); name.reportValidity(); return; }
        name.setCustomValidity('');
        const updated = await (knowledge ? client.updateKnowledge(id, name.value.trim()) : client.updateWorld(id, name.value.trim()));
        hero.querySelector('h2').textContent = updated.displayName; name.value = updated.displayName;
        feedback(doc, controls, tl('Saved'));
    });
    name.addEventListener('input', () => name.setCustomValidity(''));
    action(doc, controls, knowledge ? 'Delete Knowledge Base' : 'Delete World', async () => {
        controls.querySelector('[data-atria-delete-blockers]')?.remove();
        const references = await nativeStudioClient.getResourceReferences({ scope: 'library', resourceType: knowledge ? 'core.knowledge' : 'core.world', resourceId: id }, { reverse: true });
        if (references.length) {
            const blockers = el(doc, 'section', 'atri-library-section', undefined, controls); blockers.dataset.atriaDeleteBlockers = 'true';
            el(doc, 'h4', '', tl('Resolve references before deleting'), blockers);
            await referenceRemediation(doc, blockers, { details: { references } }, host); return;
        }
        if (!await confirmLibraryAction(knowledge ? 'Delete this Native Knowledge Base?' : 'Delete this Native World?')) return;
        await (knowledge ? client.deleteKnowledge(id) : client.deleteWorld(id)); host.openLibrarySection(knowledge ? 'knowledge' : 'worlds');
    }, { danger: true });
}

async function resourceList(doc, root, knowledge, host, browseState, selectedId, refresh, selectedOriginal = null) {
    const nav = el(doc, 'nav', 'atri-library-segments', undefined, root); nav.dataset.atriaWorldKnowledgeNav = 'true'; nav.setAttribute('aria-label', tl('Resource type'));
    for (const [key, text] of [['worlds', 'Worlds'], ['knowledge', 'Knowledge Bases']]) {
        const button = action(doc, nav, text, () => host.openLibrarySection(key)); button.setAttribute('aria-current', (knowledge ? key === 'knowledge' : key === 'worlds') ? 'page' : 'false');
    }
    const key = knowledge ? 'knowledgeBaseId' : 'worldId';
    const open = item => knowledge ? host.openLibraryKnowledge(item[key], item.displayName) : host.openLibraryWorld(item[key], item.displayName);
    const items = await (knowledge ? client.listKnowledge() : client.listWorlds());
    // Toolbar (K01): search beside one "New" button; the name form opens only when asked for.
    const toolbar = el(doc, 'div', 'atri-library-pane-toolbar', undefined, root);
    const search = field(doc, toolbar, 'Search resources', browseState.query || '', 'search');
    search.placeholder = tl(knowledge ? 'Search Knowledge Bases' : 'Search Worlds');
    const form = el(doc, 'form', 'atri-library-create', undefined, root); form.hidden = true;
    const newButton = action(doc, toolbar, knowledge ? 'New Knowledge Base' : 'New World', () => {
        form.hidden = false; newButton.setAttribute('aria-expanded', 'true'); name.focus();
    }, { primary: true });
    newButton.prepend(createAtriaIcon(doc, 'plus', { size: 15 }));
    newButton.setAttribute('aria-expanded', 'false');
    const name = field(doc, form, knowledge ? 'New Knowledge Base name' : 'New World name'); name.required = true;
    const formActions = el(doc, 'div', 'atri-library-actions', undefined, form);
    const create = action(doc, formActions, knowledge ? 'Create Knowledge Base' : 'Create World', async () => {
        if (!name.value.trim()) { name.setCustomValidity(tl('Enter a name.')); name.reportValidity(); return; }
        const item = await (knowledge ? client.createKnowledge(name.value.trim()) : client.createWorld(name.value.trim()));
        open(item);
    }, { primary: true });
    const closeForm = () => { form.hidden = true; name.value = ''; name.setCustomValidity(''); newButton.setAttribute('aria-expanded', 'false'); newButton.focus(); };
    action(doc, formActions, 'Cancel', closeForm);
    form.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closeForm(); } });
    name.addEventListener('input', () => name.setCustomValidity(''));
    form.addEventListener('submit', event => { event.preventDefault(); create.click(); });
    const list = el(doc, 'div', 'atri-library-grouped-list', undefined, root); list.dataset[knowledge ? 'atriaKnowledgeLibrary' : 'atriaWorldLibrary'] = 'true';
    const render = () => {
        list.replaceChildren();
        // "Mine" is one group of the list; installed originals follow as their own group,
        // so an empty "mine" is a note, not an empty state for the whole page.
        el(doc, 'h3', 'atri-library-group-title', tl(knowledge ? 'My Knowledge Bases' : 'My Worlds'), list);
        const matching = items.filter(item => (knowledge ? item.knowledgeBase : item.world).displayName.toLowerCase().includes(search.value.toLowerCase()));
        if (!items.length) el(doc, 'p', 'atri-library-meta', tl('None yet. Create one with “New”, or copy an installed original below.'), list);
        else if (!matching.length) state(doc, list, 'empty', 'No matching resources', 'Try another search.');
        for (const item of matching) {
            const resource = knowledge ? item.knowledgeBase : item.world;
            const row = el(doc, 'article', 'atri-library-row', undefined, list);
            row.prepend(createAtriaIcon(doc, knowledge ? 'book' : 'globe', { size: 16 }));
            if ((resource[key]) === selectedId) row.setAttribute('aria-current', 'true');
            row.addEventListener('click', event => { if (!event.target.closest('button')) open(resource); });
            const content = el(doc, 'div', 'atri-library-row-content', undefined, row);
            el(doc, 'h3', '', resource.displayName, content);
            el(doc, 'p', 'atri-library-meta', knowledge ? `${item.bindingCount} ${tl('Bindings')}` : tl(item.currentRevision ? 'Current revision available' : 'No revision'), content);
            action(doc, row, 'Open', () => open(resource));
        }
    };
    search.addEventListener('input', () => { browseState.query = search.value; render(); }); render();
    await mountPackageLibraryList({ document: doc, root, knowledge, host, selected: selectedOriginal });
    // Importing a bundle is the rarer path; it follows the lists.
    mountResourceBundleImport({ document: doc, root, host, onReload: refresh });
}

function mount({ document: doc, body, route, host, browseStates = new Map() }, mode) {
    let disposed = false; let sequence = 0; let currentRoute = route;
    const titles = { works: 'Works', games: 'My stories' };
    async function render(nextRoute = currentRoute) {
        currentRoute = nextRoute;
        const token = ++sequence; body.replaceChildren();
        state(doc, body, 'loading', titles[mode] || 'Worlds & Knowledge', 'Loading your Library…');
        const root = el(doc, 'section', 'atria-native-library'); root.dataset.atriaNativeLibrary = mode;
        const child = String(nextRoute?.child?.id || '');
        try {
            const key = mode !== 'worlds-knowledge' ? mode : child.startsWith('knowledge') ? 'knowledge' : 'worlds';
            if (!browseStates.has(key)) browseStates.set(key, {});
            // Pages without Library-wide tools clear the top bar; the shelf views set their own.
            if (mode === 'worlds-knowledge' || child === 'install' || child === 'import-save') host.setContextActions?.([]);
            if (mode === 'worlds-knowledge') await worldKnowledge(doc, root, nextRoute, host, browseStates.get(key));
            else if (mode === 'games') await games(doc, root, host, () => render(), browseStates.get(key));
            else if (child === 'install' || child === 'import-save') importSurface(doc, root, child === 'install' ? 'package' : 'save', host);
            else if (child.startsWith('work:')) {
                // The shelf stays in place; the selected Work opens in the detail pane beside it.
                const id = child.slice(5);
                root.classList.add('atri-library-split');
                const main = el(doc, 'div', 'atri-library-main', undefined, root);
                const aside = el(doc, 'aside', 'atri-library-detail', undefined, root);
                aside.setAttribute('aria-label', tl('Work details'));
                await Promise.all([works(doc, main, host, () => render(), browseStates.get(key), id), workDetail(doc, aside, host, id, () => render())]);
            } else await works(doc, root, host, () => render(), browseStates.get(key));
            if (!disposed && token === sequence) {
                body.replaceChildren(root);
                const title = root.querySelector('h2'); title?.setAttribute('tabindex', '-1');
                if (doc.activeElement === doc.body || child.startsWith('work:')) title?.focus({ preventScroll: true });
            }
        } catch (error) {
            if (disposed || token !== sequence) return;
            body.replaceChildren(); state(doc, body, 'error', 'Library could not be loaded', libraryError(error));
            action(doc, body, 'Try again', () => render());
        }
    }
    void render();
    return { updateRoute: next => { void render(next); }, dispose() { disposed = true; sequence++; host.setContextActions?.([]); } };
}
export function mountNativeWorksWorkspace(args) { return mount(args, 'works'); }
export function mountNativeGamesWorkspace(args) { return mount(args, 'games'); }
export function mountNativeWorldKnowledgeWorkspace(args) { return mount(args, 'worlds-knowledge'); }
