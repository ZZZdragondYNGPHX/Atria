import { permissionRow, renderPackageUpdateReview, mountWorkPermissions } from './package-permissions.js';
import { mountPackageLibraryList, mountPackageLibraryOriginal } from './package-library-resources.js';
import { resourceBundleExport, mountResourceBundleImport } from './resource-bundle-controls.js';
import { mountLibraryRevisionHistory } from './library-revision-history.js';
import { renderResourceReferenceRows } from './resource-reference-rows.js';
import { nativeStudioClient } from './studio-client.js';
import { mountKnowledgeBindingManager } from './knowledge-binding-manager.js';
import { mountLibraryRevisionEditor } from './library-revision-editor.js';
import { createAtriaStatePanel } from '../atria-shell/primitives.js';
import { translateShellText as tl } from '../atria-shell/localization.js';
import { arrayBufferToBase64, nativeProductClient as client } from './product-client.js';
import { el, action, heading, disclosure, field, cover, feedback, libraryError, confirmLibraryAction, savePassword } from './library-ui.js';

const actions = (doc, parent) => el(doc, 'div', 'atri-library-actions', undefined, parent);
const time = value => value ? new Date(value).toLocaleString() : '—';
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

function importSurface(doc, parent, kind, host, refresh) {
    const isPackage = kind === 'package';
    const root = disclosure(doc, parent, isPackage ? 'Install / Update .atria' : 'Import .atriasave');
    root.classList.add('atri-library-import');
    root.dataset[isPackage ? 'atriaNativeInstall' : 'atriaNativeSaveImport'] = 'true';
    el(doc, 'p', '', tl(isPackage ? 'Choose a work to review its permissions before installing.' : 'Import an Atria save. Its matching work must already be installed.'), root);
    const input = field(doc, root, isPackage ? 'Choose an Atria work' : 'Choose an Atria save', '', 'file');
    input.accept = isPackage ? '.atria,application/octet-stream' : '.atriasave,application/octet-stream';
    action(doc, root, isPackage ? 'Choose an Atria work' : 'Choose an Atria save', () => input.click());
    const result = el(doc, 'div', 'atri-library-import-result', undefined, root);
    result.setAttribute('aria-live', 'polite');
    let sequence = 0;
    input.addEventListener('change', async () => {
        const file = input.files?.[0]; if (!file) return;
        const token = ++sequence;
        result.replaceChildren(); state(doc, result, 'loading', 'Checking file', 'Reading metadata…');
        try {
            const data = arrayBufferToBase64(await file.arrayBuffer());
            const preflight = await (isPackage ? client.preflightPackage(data) : client.preflightSave(data));
            if (token !== sequence || !root.isConnected) return;
            result.replaceChildren();
            const ready = isPackage || preflight.dependency?.status === 'ready';
            const review = el(doc, 'section', 'atri-library-import-review', undefined, result);
            review.dataset[isPackage ? 'atriaPackagePreflight' : 'atriaSavePreflight'] = isPackage ? preflight.packageId : preflight.dependency?.status || 'unknown';
            el(doc, 'h4', '', isPackage ? preflight.name : tl('Atria save'), review);
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
            disclosure(doc, review, 'Details', isPackage ? { capabilities: preflight.capabilities, packageId: preflight.packageId } : preflight.dependency?.required || preflight.package);
            if (!ready) return;
            const controls = actions(doc, review);
            action(doc, controls, isPackage ? 'Install / Update' : 'Import Save', async () => {
                if (token !== sequence) return;
                if (isPackage) {
                    const missing = preflight.requiredPermissions.filter(permission => !grants.get(permission)?.checked);
                    if (missing.length) throw new Error(tl('Grant required permissions before installation:') + ' ' + missing.join(', '));
                    await client.installPackage(data, preflight.requiredPermissions, preflight.update?.previous?.packageVersionId || null);
                    await refresh();
                } else {
                    const password = await savePassword(); if (password === false || password === null) return;
                    const imported = await client.importSave(data, password);
                    await openSession(host, imported.session.sessionId);
                }
            }, { primary: true });
        } catch (error) {
            if (token !== sequence) return;
            result.replaceChildren(); feedback(doc, result, libraryError(error), true);
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
    const extra = actions(doc, more);
    action(doc, extra, 'Export .atriasave', async () => download(doc, await client.exportSession(session.sessionId), `${session.displayTitle || session.sessionId}.atriasave`), { disabled: !ready });
    action(doc, extra, 'Delete', async () => {
        if (!await confirmLibraryAction('Delete this Native Session and all of its SavePoints?')) return;
        await client.deleteSession(session.sessionId); await refresh();
    }, { danger: true });
    if (!ready) disclosure(doc, content, 'Dependency details', dependency.required || dependency);
    return row;
}

async function works(doc, root, host, refresh) {
    const [items, sessions] = await Promise.all([client.listWorks(), client.listSessions()]);
    heading(doc, root, 'Works', 'Your collection of interactive stories.');
    const imports = el(doc, 'div', 'atri-library-imports', undefined, root);
    importSurface(doc, imports, 'package', host, refresh); importSurface(doc, imports, 'save', host, refresh);
    const filter = field(doc, root, 'Search works', '', 'search');
    const count = el(doc, 'p', 'atri-library-meta', '', root); count.setAttribute('role', 'status');
    const grid = el(doc, 'div', 'atri-library-posters', undefined, root); grid.dataset.atriaNativeWorks = 'true';
    const render = () => {
        grid.replaceChildren();
        const matching = items.filter(item => `${item.package.displayName} ${item.manifest?.description || ''}`.toLowerCase().includes(filter.value.trim().toLowerCase()));
        count.textContent = `${matching.length} ${tl('Works')}`;
        if (!matching.length) state(doc, grid, 'empty', items.length ? 'No matching works' : 'No Works installed', items.length ? 'Try another search.' : 'Install an Atria work to begin your collection.');
        for (const work of matching) {
            const card = el(doc, 'article', 'atri-library-work', undefined, grid); card.dataset.atriaWorkId = work.package.packageId;
            const open = action(doc, card, 'Open', () => host.openLibraryWork(work.package.packageId, work.package.displayName));
            open.className = 'atri-library-work-open'; open.setAttribute('aria-label', tl('Open') + ' ' + work.package.displayName);
            open.replaceChildren(cover(doc, work.package.packageId, work.package.displayName));
            el(doc, 'h3', '', work.package.displayName, open);
            el(doc, 'p', 'atri-library-meta', work.status === 'ready' ? `${tl('Version')} ${work.packageVersion?.version || '—'}` : tl('Unavailable'), card);
        }
    };
    filter.addEventListener('input', render); render();
    const games = section(doc, root, 'My Games', 'atriaMyGames');
    if (!sessions.length) state(doc, games, 'empty', 'No game progress yet', 'Open a work and start a new story.');
    sessions.forEach(item => sessionRow(doc, games, item, host, refresh, items.find(work => work.package.packageId === item.packageId)?.package.displayName));
}

async function workDetail(doc, root, host, id, refresh) {
    const work = await client.getWork(id); const manifest = work.manifest;
    const hero = el(doc, 'header', 'atri-library-work-hero', undefined, root); hero.dataset.atriaWorkDetail = id;
    hero.append(cover(doc, id, work.package.displayName));
    const content = el(doc, 'div', 'atri-library-hero-content', undefined, hero);
    heading(doc, content, work.package.displayName, manifest?.description || '', true);
    el(doc, 'p', 'atri-library-meta', `${tl('Version')} ${work.packageVersion?.version || '—'}`, content);
    if (work.status !== 'ready') state(doc, content, 'error', 'This work is unavailable', 'Reinstall the matching work to continue. Your progress is kept.');
    const entryPoints = manifest?.entryPoints || [];
    const selectLabel = el(doc, 'label', 'atri-library-field', tl('Starting point'), content);
    const selector = el(doc, 'select', '', undefined, selectLabel); selector.dataset.atriaEntryPointSelect = 'true';
    for (const entry of entryPoints) { const option = el(doc, 'option', '', entry.displayName, selector); option.value = entry.entryPointId; }
    selectLabel.hidden = entryPoints.length <= 1;
    const controls = actions(doc, content); const latest = work.sessions?.[0];
    if (latest) action(doc, controls, 'Continue', () => openSession(host, latest.sessionId), { disabled: latest.dependency?.status !== 'ready', primary: true });
    action(doc, controls, 'Start New', async () => {
        const created = await client.startWork(id, { packageVersionId: work.packageVersion.packageVersionId, entryPointId: selector.value || entryPoints[0]?.entryPointId });
        await openSession(host, created.session.sessionId);
    }, { disabled: work.status !== 'ready' || !entryPoints.length, primary: !latest });
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
            let createdSessionId = null;
            action(doc, review, 'Create Session on this version', async () => {
                if (!createdSessionId) {
                    const created = await client.startWork(id, { packageVersionId: version.packageVersionId, entryPointId: entries.value });
                    createdSessionId = created.session.sessionId; entries.disabled = true;
                }
                await openSession(host, createdSessionId);
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

async function worldKnowledge(doc, root, route, host) {
    const child = String(route?.child?.id || '');
    const knowledge = child === 'knowledge' || child.startsWith('knowledge:');
    const label = knowledge ? 'Knowledge Bases' : 'Worlds'; const singular = knowledge ? 'Knowledge Base' : 'World';
    const nav = el(doc, 'nav', 'atri-library-segments', undefined, root); nav.dataset.atriaWorldKnowledgeNav = 'true'; nav.setAttribute('aria-label', tl('Resource type'));
    for (const [key, text] of [['worlds', 'Worlds'], ['knowledge', 'Knowledge Bases']]) {
        const button = action(doc, nav, text, () => host.openLibrarySection(key)); button.setAttribute('aria-current', (knowledge ? key === 'knowledge' : key === 'worlds') ? 'page' : 'false');
    }
    const key = knowledge ? 'knowledgeBaseId' : 'worldId';
    const open = item => knowledge ? host.openLibraryKnowledge(item[key], item.displayName) : host.openLibraryWorld(item[key], item.displayName);
    if (child.startsWith('world:package:') || child.startsWith('knowledge:package:')) {
        const ref = JSON.parse(decodeURIComponent(child.split(':').slice(2).join(':')));
        await mountPackageLibraryOriginal({ document: doc, root, ref, host }); return;
    }
    if (child.startsWith('world:') || child.startsWith('knowledge:')) {
        const id = child.split(':').slice(1).join(':');
        const detail = await (knowledge ? client.getKnowledge(id) : client.getWorld(id));
        const resource = knowledge ? detail.knowledgeBase : detail.world;
        const hero = heading(doc, root, resource.displayName, tl(knowledge ? 'Knowledge available to your stories.' : 'A shared setting for your stories.'), true);
        hero.dataset[knowledge ? 'atriaKnowledgeDetail' : 'atriaWorldDetail'] = id;
        const revisionActions = actions(doc, root);
        resourceBundleExport(doc, revisionActions, { scope: 'library', resourceType: knowledge ? 'core.knowledge' : 'core.world', resourceId: id, revision: resource.currentRevisionId }, resource.displayName);
        action(doc, revisionActions, resource.currentRevisionId ? 'New revision' : 'Create first revision', () => {
            const reload = async saved => {
                root.replaceChildren(); await worldKnowledge(doc, root, route, host);
                if (saved) feedback(doc, root, tl('Saved immutable Library revision.') + ' ' + (saved.worldRevisionId || saved.knowledgeRevisionId));
            };
            root.replaceChildren();
            mountLibraryRevisionEditor({ document: doc, root, detail, knowledge, onClose: () => reload(), onSaved: reload });
        }, { primary: true });
        const manage = disclosure(doc, root, 'Manage resource');
        const name = field(doc, manage, singular + ' name', resource.displayName); name.required = true;
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
                renderResourceReferenceRows({ document: doc, root: blockers, references, host }); return;
            }
            if (!await confirmLibraryAction(knowledge ? 'Delete this Native Knowledge Base?' : 'Delete this Native World?')) return;
            await (knowledge ? client.deleteKnowledge(id) : client.deleteWorld(id)); host.openLibrarySection(knowledge ? 'knowledge' : 'worlds');
        }, { danger: true });
        if (knowledge) {
            const entries = section(doc, root, 'Entries', 'atriaKnowledgeEntries');
            for (const entry of detail.entries) {
                const article = el(doc, 'article', 'atri-library-knowledge-entry', undefined, entries); article.dataset.atriaKnowledgeEntryId = entry.knowledgeEntryId;
                el(doc, 'h4', '', entry.metadata?.title || tl('Knowledge entry'), article);
                el(doc, 'p', '', entry.content, article); disclosure(doc, article, 'Details', { knowledgeEntryId: entry.knowledgeEntryId, delivery: entry.delivery, discovery: entry.discovery });
            }
            if (!detail.entries.length) state(doc, entries, 'empty', 'No entries', 'This revision contains no Knowledge entries.');
            const bindings = section(doc, root, 'Bindings & references', 'atriaKnowledgeBindings');
            mountKnowledgeBindingManager({ document: doc, root: bindings, detail, host });
        }
        mountLibraryRevisionHistory({ document: doc, root, detail, knowledge, host, onReload: async () => { root.replaceChildren(); await worldKnowledge(doc, root, route, host); } });
        return;
    }
    const items = await (knowledge ? client.listKnowledge() : client.listWorlds());
    heading(doc, root, label, knowledge ? 'Keep reusable knowledge for your stories.' : 'The settings your stories share.');
    mountResourceBundleImport({ document: doc, root, host, onReload: async () => { root.replaceChildren(); await worldKnowledge(doc, root, route, host); } });
    const form = el(doc, 'form', 'atri-library-create', undefined, root);
    const name = field(doc, form, 'New ' + singular + ' name'); name.required = true;
    const create = action(doc, form, 'Create ' + singular, async () => {
        if (!name.value.trim()) { name.setCustomValidity(tl('Enter a name.')); name.reportValidity(); return; }
        const item = await (knowledge ? client.createKnowledge(name.value.trim()) : client.createWorld(name.value.trim()));
        open(item);
    }, { primary: true });
    name.addEventListener('input', () => name.setCustomValidity(''));
    form.addEventListener('submit', event => { event.preventDefault(); create.click(); });
    const search = field(doc, root, 'Search resources', '', 'search');
    const list = el(doc, 'div', 'atri-library-grouped-list', undefined, root); list.dataset[knowledge ? 'atriaKnowledgeLibrary' : 'atriaWorldLibrary'] = 'true';
    const render = () => {
        list.replaceChildren();
        const matching = items.filter(item => (knowledge ? item.knowledgeBase : item.world).displayName.toLowerCase().includes(search.value.toLowerCase()));
        if (!matching.length) state(doc, list, 'empty', items.length ? 'No matching resources' : 'No ' + label, items.length ? 'Try another search.' : 'Create a resource to get started.');
        for (const item of matching) {
            const resource = knowledge ? item.knowledgeBase : item.world;
            const row = el(doc, 'article', 'atri-library-row', undefined, list);
            const content = el(doc, 'div', 'atri-library-row-content', undefined, row);
            el(doc, 'h3', '', resource.displayName, content);
            el(doc, 'p', 'atri-library-meta', knowledge ? `${item.bindingCount} ${tl('Bindings')}` : tl(item.currentRevision ? 'Current revision available' : 'No revision'), content);
            action(doc, row, 'Open', () => open(resource));
        }
    };
    search.addEventListener('input', render); render();
    await mountPackageLibraryList({ document: doc, root, knowledge, host });
}

function mount({ document: doc, body, route, host }, mode) {
    let disposed = false; let sequence = 0; let currentRoute = route;
    async function render(nextRoute = currentRoute) {
        currentRoute = nextRoute;
        const token = ++sequence; body.replaceChildren();
        state(doc, body, 'loading', mode === 'works' ? 'Works' : 'Worlds & Knowledge', 'Loading your Library…');
        const root = el(doc, 'section', 'atria-native-library'); root.dataset.atriaNativeLibrary = mode;
        try {
            if (mode !== 'works') await worldKnowledge(doc, root, nextRoute, host);
            else if (String(nextRoute?.child?.id || '').startsWith('work:')) await workDetail(doc, root, host, nextRoute.child.id.slice(5), () => render());
            else await works(doc, root, host, () => render());
            if (!disposed && token === sequence) {
                body.replaceChildren(root);
                const title = root.querySelector('h2'); title?.setAttribute('tabindex', '-1');
                if (doc.activeElement === doc.body) title?.focus({ preventScroll: true });
            }
        } catch (error) {
            if (disposed || token !== sequence) return;
            body.replaceChildren(); state(doc, body, 'error', 'Library could not be loaded', libraryError(error));
            action(doc, body, 'Try again', () => render());
        }
    }
    void render(); return { updateRoute: next => { void render(next); }, dispose() { disposed = true; sequence++; } };
}
export function mountNativeWorksWorkspace(args) { return mount(args, 'works'); }
export function mountNativeWorldKnowledgeWorkspace(args) { return mount(args, 'worlds-knowledge'); }
