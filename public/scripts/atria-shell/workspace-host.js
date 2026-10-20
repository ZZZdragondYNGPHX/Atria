import { mountPaneResizer } from './pane-resizer.js';
import { buildAgentsFrame } from './agent-sections.js';
import { mountActivityIsland } from './activity-island.js';
import { mountExtensionsWorkspace } from '../native/extensions-workspace.js';
import { createAtriaIcon } from './icons.js';
import { createAtriaStatePanel } from './primitives.js';
import {
    mountAccountUtility,
    mountSettingsUtility,
} from './utility-workspaces.js';
import {
    LIBRARY_SECTIONS,
    RUNTIME_SECTIONS,
    mountLibraryDomainWorkspace,
    mountRuntimeDomainWorkspace,
    normalizeLibrarySection,
    normalizeRuntimeSection,
} from './library-runtime-workspaces.js';
import { formatShellText, translateShellText } from './localization.js';
import { createProductSearchIndex } from './product-search.js';
import { installAtriaWorkspaceLeaveGuard, confirmAtriaDraftLeave } from './workspace-leave-guard.js';

function createLocalizedStatePanel(documentRef, kind, options = {}) {
    return createAtriaStatePanel(documentRef, kind, {
        ...options,
        title: translateShellText(options.title),
        message: translateShellText(options.message),
    });
}

const AGENT_SECTION_LABELS = Object.freeze({
    home: 'Agents',
    plans: 'Plans',
    runs: 'Runs',
    memory: 'Memory',
    diagnostics: 'Diagnostics & replay',
});

const AGENT_SECTION_DESCRIPTIONS = Object.freeze({
    plans: 'Author agent graphs, validate them on the Host and publish immutable revisions.',
    runs: 'Follow Runs recorded by the Native Host: timeline, graph, fees and approvals.',
    memory: 'Browse long-term memory, evidence and knowledge maintenance.',
    diagnostics: 'Inspect agent diagnostics, trace evidence and recovery details.',
});

const UTILITY_LABELS = Object.freeze({
    diagnostics: 'Diagnostics',
    plugins: 'Extensions',
    settings: 'Settings',
    account: 'Account',
    storage: 'Storage center',
});

function normalizeAgentSection(route) {
    const childId = String(route?.child?.id || '').trim();
    if (!childId) return 'memory';
    if (['plans', 'runs'].includes(childId.split(':')[0])) return childId.split(':')[0];
    if (childId === 'memory') return 'memory';
    if (childId === 'agent-diagnostics') return 'diagnostics';
    return 'home';
}

function routeDescriptor(route) {
    const childId = String(route?.child?.id || '').trim();
    if (childId === 'skills' || childId.startsWith('skills:')) return { key: 'extensions:' + childId, kind: 'plugins', title: 'Extensions' };
    if (childId.startsWith('utility.')) {
        const utilityId = childId.slice('utility.'.length).split(':')[0];
        const title = UTILITY_LABELS[utilityId];
        if (title) {
            return Object.freeze({
                key: `utility:${utilityId}`,
                kind: utilityId,
                title,
            });
        }
    }
    if (route?.domain === 'agents') {
        const section = normalizeAgentSection(route);
        if (section === 'plans' || section === 'runs') return Object.freeze({ key: 'agents:v3', kind: 'agents-v3', section, title: AGENT_SECTION_LABELS[section] });
        return Object.freeze({
            key: 'agents:' + section,
            kind: 'agents',
            section,
            title: AGENT_SECTION_LABELS[section] || 'Agents',
        });
    }
    if (route?.domain === 'build') {
        return Object.freeze({
            key: 'build',
            kind: 'build',
            title: 'Build',
        });
    }
    if (route?.domain === 'library') {
        const section = normalizeLibrarySection(route);
        return Object.freeze({
            key: 'library',
            kind: 'library',
            section,
            title: LIBRARY_SECTIONS.find(item => item.id === section)?.label || 'Library',
        });
    }
    if (route?.domain === 'runtime') {
        const section = normalizeRuntimeSection(route);
        return Object.freeze({
            key: 'runtime',
            kind: 'runtime',
            section,
            title: RUNTIME_SECTIONS.find(item => item.id === section)?.label || 'Runtime',
        });
    }
    if (route?.domain === 'play') return null;
    return Object.freeze({
        key: `placeholder:${route?.domain || 'unknown'}`,
        kind: 'placeholder',
        title: String(route?.breadcrumb?.at?.(-1) || route?.domain || 'Workspace'),
    });
}

function makeContextSummary(documentRef, title, detail = '') {
    const root = documentRef.createElement('section');
    root.dataset.atriaWorkspaceContext = 'true';
    root.className = 'atria-workspace-context-summary';

    const heading = documentRef.createElement('strong');
    heading.textContent = translateShellText(title || 'Workspace');
    root.append(heading);

    if (detail) {
        const paragraph = documentRef.createElement('p');
        paragraph.textContent = translateShellText(detail);
        root.append(paragraph);
    }
    return root;
}

function mountPlaceholder({ document: documentRef, slot, descriptor }) {
    const panel = createLocalizedStatePanel(documentRef, 'empty', {
        title: descriptor.title,
        message: 'This workspace is unavailable. Choose a workspace from the navigation.',
    });
    slot.replaceChildren(panel);
    return {
        root: panel,
        dispose() {
            panel.remove();
        },
    };
}

function mountAgentsHub({ document: documentRef, slot, host }) {
    const root = documentRef.createElement('section');
    root.className = 'atria-agents-hub';
    root.dataset.atriaAgentsHub = 'true';

    const heading = documentRef.createElement('header');
    heading.className = 'atria-agents-hub__heading';
    const title = documentRef.createElement('h2');
    title.textContent = translateShellText('Agents');
    const hint = documentRef.createElement('p');
    hint.textContent = translateShellText('Shape how your agents work, then follow what they do.');
    heading.append(title, hint);

    const grid = documentRef.createElement('div');
    grid.className = 'atria-agents-hub__grid';
    for (const section of ['plans', 'runs', 'memory', 'diagnostics']) {
        const card = documentRef.createElement('button');
        card.type = 'button';
        card.className = 'atria-agents-hub__card';
        card.dataset.atriaAgentSection = section;

        const cardTitle = documentRef.createElement('strong');
        cardTitle.textContent = translateShellText(AGENT_SECTION_LABELS[section]);
        const description = documentRef.createElement('span');
        description.textContent = translateShellText(AGENT_SECTION_DESCRIPTIONS[section]);
        const symbol = createAtriaIcon(documentRef, { plans: 'agents', runs: 'timeline', memory: 'library', diagnostics: 'diagnostics' }[section]);
        symbol.classList.add('atria-agents-hub__card-icon');
        card.append(symbol, cardTitle, description);
        card.addEventListener('click', () => host.openAgentSection(section));
        grid.append(card);
    }

    root.append(heading, grid);
    slot.replaceChildren(root);
    return {
        root,
        dispose() {
            root.remove();
        },
    };
}

async function mountAgentsWorkspace({ document: documentRef, slot, descriptor, host, isCurrent = () => true }) {
    if (descriptor.section === 'home') {
        return mountAgentsHub({ document: documentRef, slot, host });
    }

    // Memory and diagnostics share the Agents tab frame with Runs and Plans.
    const frame = buildAgentsFrame(documentRef, { active: descriptor.section, onSelect: section => host.openAgentSection(section) });
    slot.replaceChildren(frame.root);
    if (descriptor.section === 'diagnostics') {
        const diagnostics = await mountDiagnosticsWorkspace({ document: documentRef, slot: frame.body, isCurrent });
        return { ...diagnostics, root: frame.root, dispose() { diagnostics?.dispose?.(); frame.root.remove(); } };
    }
    const { createMemoryWorkspace } = await import('../agents/memory/workspace.js');
    if (!isCurrent()) return {};
    const root = documentRef.createElement('section'), inspector = documentRef.createElement('aside');
    root.className = 'atria-memory-workspace'; inspector.className = 'atria-memory-inspector';
    if (!documentRef.getElementById('atria-memory-css')) {
        const css = documentRef.createElement('link'); css.id = 'atria-memory-css'; css.rel = 'stylesheet';
        css.href = '/css/atria-memory.css'; documentRef.head.append(css);
    }
    const layout = documentRef.createElement('div'); layout.className = 'atria-memory-layout';
    layout.append(root, inspector); frame.body.replaceChildren(layout);
    const resize = mountPaneResizer({ document: documentRef, root: layout, pane: inspector, label: translateShellText('Resize memory inspector'), property: '--atria-memory-inspector-width', axis: 'x', side: 'start',
        min: 260, max: () => Math.min(560, layout.clientWidth - 360),
        enabled: () => !inspector.hidden && layout.clientWidth > 760,
        onCollapse: () => { inspector.hidden = true; root.querySelector('[data-memory-view="knowledge"]')?.focus(); } });
    const el = (tag, text, parent, className = '') => {
        const node = documentRef.createElement(tag); node.className = className;
        if (text !== undefined) node.textContent = translateShellText(text);
        parent?.append(node); return node;
    };
    const button = (parent, text, action) => { const node = el('button', text, parent); node.type = 'button'; node.addEventListener('click', action); return node; };
    const controls = new documentRef.defaultView.AbortController();
    const closeInspector = () => inspector.querySelector('.workspace-inspector-close')?.click();
    documentRef.addEventListener('atria-workspace-back', event => {
        if (!inspector.hidden) { closeInspector(); event.preventDefault(); }
    }, { signal: controls.signal });
    const syncInspector = () => {
        const modal = !inspector.hidden && documentRef.defaultView.innerWidth <= 760;
        inspector.setAttribute('role', modal ? 'dialog' : 'complementary'); inspector.setAttribute('aria-label', translateShellText('Memory details'));
        if (modal) inspector.setAttribute('aria-modal', 'true'); else inspector.removeAttribute('aria-modal');
        root.inert = modal;
    };
    const inspectorObserver = new documentRef.defaultView.MutationObserver(syncInspector); inspectorObserver.observe(inspector, { attributes: true, attributeFilter: ['hidden'] });
    documentRef.defaultView.addEventListener('resize', syncInspector, { signal: controls.signal });
    documentRef.addEventListener('keydown', event => {
        if (event.key !== 'Tab' || inspector.hidden || documentRef.defaultView.innerWidth > 760) return;
        const nodes = [...inspector.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href]')].filter(node => node.getClientRects().length);
        if (!nodes.length) return;
        const index = nodes.indexOf(documentRef.activeElement);
        if (index < 0 || event.shiftKey && index === 0 || !event.shiftKey && index === nodes.length - 1) { event.preventDefault(); (event.shiftKey ? nodes.at(-1) : nodes[0]).focus(); }
    }, { signal: controls.signal });
    const memory = createMemoryWorkspace({ getContext: () => globalThis.Atria.getContext() })(root, {
        el, button, inspector, getView: () => ({ recalls: [], memoryUsers: () => [] }),
    });
    return { root, dispose() { if (typeof memory === 'function') memory(); else memory?.dispose?.(); controls.abort(); inspectorObserver.disconnect(); resize.dispose(); frame.root.remove(); } };
}

async function mountAgentsV3Workspace(args) {
    const { mountAgentsV3 } = await import('../native/orchestration/agents-v3.js');
    if (!args.isCurrent()) return {};
    // Section routes are resolved from the live route, never the cached descriptor.
    return mountAgentsV3({ ...args, route: args.navigation.getRoute() });
}

async function mountBuildWorkspace(args) {
    const studio = await import('../native/studio-workspace.js');
    return studio.mountNativeStudioWorkspace(args);
}

// Storage center (P-02): a full utility page; the scope switch joins the top bar.
async function mountStorageUtility({ document: documentRef, slot, shell, route, isCurrent = () => true }) {
    const { mountStorageCenterPage } = await import('../storage-management.js');
    if (!isCurrent()) return {};
    const holder = documentRef.createElement('section');
    holder.className = 'atria-utility-workspace atria-storage-utility';
    slot.replaceChildren(holder);
    const initialScope = String(route?.child?.id || '').endsWith(':browser') ? 'browser' : 'server';
    return mountStorageCenterPage(holder, { initialScope, toolbar: shell?.slots?.toolbarLeading || null });
}

async function mountDiagnosticsWorkspace({ slot, isCurrent = () => true }) {
    const [diagnostics, user] = await Promise.all([
        import('../logging/workspace.js'),
        import('../user.js'),
    ]);
    if (!isCurrent()) return {};
    return await diagnostics.openLogsWorkspace({
        canViewServerLogs: !user.accountsEnabled || user.isAdmin(),
        container: slot,
    });
}

export function createAtriaWorkspaceAdapters() {
    return Object.freeze({
        agents: mountAgentsWorkspace,
        'agents-v3': mountAgentsV3Workspace,
        build: mountBuildWorkspace,
        library: mountLibraryDomainWorkspace,
        runtime: mountRuntimeDomainWorkspace,
        diagnostics: mountDiagnosticsWorkspace,
        plugins: mountExtensionsWorkspace,
        settings: mountSettingsUtility,
        account: mountAccountUtility,
        storage: mountStorageUtility,
        placeholder: mountPlaceholder,
    });
}

export function createAtriaWorkspaceHost({
    document: documentRef = globalThis.document,
    window: windowRef = globalThis.window,
    shell,
    navigation = shell?.navigation,
    adapters = createAtriaWorkspaceAdapters(),
} = {}) {
    if (!documentRef?.createElement || !shell?.slots?.workspace || !navigation?.subscribe) {
        throw new Error('Atria WorkspaceHost requires the mounted AppShell and Navigation Authority');
    }

    const slot = shell.slots.workspace;
    const dismissTransient = event => {
        if (active?.controller?.dismissTransient?.() === true) event.preventDefault();
    };
    slot.addEventListener('atria-workspace-back', dismissTransient);
    let disposed = false;
    let sequence = 0;
    let active = null;
    let contextActionNodes = [];
    let runtimeRepair = null;
    let lastRouteSignature = JSON.stringify(navigation.getRoute());
    const commandDisposers = [];
    let productSearch = null;
    const leaveGuard = installAtriaWorkspaceLeaveGuard({ document: documentRef, window: windowRef, navigation, shell });
    const refreshSearchOnOpen = event => { if (event.detail?.refresh === false) return; void productSearch?.refresh?.().catch(error => console.warn('[atria-shell] Search refresh failed', error)); };
    documentRef.addEventListener('atria-command-open', refreshSearchOnOpen);

    function contextState() {
        return navigation.getContext?.() || {
            open: false,
            sheetState: 'half',
        };
    }

    function setWorkspaceContext(descriptor) {
        // Plan and Run surfaces put their own Inspector into the Shell dock.
        if (descriptor.kind === 'agents-v3') { if (active?.controller?.ownsContext) active.controller.refreshContext?.(); return; }
        const current = contextState();
        const detail = descriptor.kind === 'agents'
            ? formatShellText('Current Agents view: ${0}', [translateShellText(AGENT_SECTION_LABELS[descriptor.section] || descriptor.section)], undefined, 'atria.shell.context.agents')
            : descriptor.kind === 'build'
                ? translateShellText('Edit project resources, compare pending changes, and preview or build your Work.')
                : descriptor.kind === 'library'
                    ? formatShellText('Library / ${0}: browse saved resources and their revisions.', [translateShellText(descriptor.title)])
                    : descriptor.kind === 'runtime'
                        ? formatShellText('Runtime / ${0}: configure requests and review their results.', [translateShellText(descriptor.title)])
                        : descriptor.kind === 'diagnostics'
                            ? translateShellText('Find recent problems and open their reports.')
                            : descriptor.kind === 'plugins'
                                ? translateShellText('Manage Skills, external plugins, local scripts and built-in tools.')
                                : descriptor.kind === 'settings'
                                    ? translateShellText('Choose appearance, language, reading and interaction preferences.')
                                    : descriptor.kind === 'account'
                                        ? translateShellText('Manage your account, settings snapshots, backups and storage.')
                                        : translateShellText('Choose a workspace from the navigation.');
        shell.setContextContent(
            makeContextSummary(documentRef, descriptor.title, detail),
            {
                title: translateShellText(descriptor.title),
                open: Boolean(current.open),
                state: current.sheetState,
            },
        );
    }

    function clearOwnedContext() {
        const currentNode = shell.slots.dock?.querySelector?.('[data-atria-workspace-context="true"]');
        if (!currentNode) return;
        shell.slots.dock.replaceChildren();
        navigation.setContext?.({
            title: 'Context',
            open: contextState().open,
        }, { reason: 'workspace-context-release' });
    }

    function disposeActive() {
        const previous = active;
        active = null;
        if (!previous) return Promise.resolve();
        try {
            return Promise.resolve(previous.controller?.dispose?.());
        } catch (error) {
            console.warn('[atria-shell] Workspace dispose failed', error);
            return Promise.resolve();
        }
    }

    const matchesRepairOrigin = route => runtimeRepair && route.domain === runtimeRepair.route.domain && route.child?.id === runtimeRepair.route.child?.id;
    function showRepairReturn() {
        slot.querySelector('[data-atria-runtime-repair-return]')?.remove();
        if (!runtimeRepair) return;
        const button = documentRef.createElement('button'); button.type = 'button';
        button.className = 'atri-library-button'; button.dataset.atriaRuntimeRepairReturn = 'true';
        button.textContent = translateShellText('Return to model setup');
        button.addEventListener('click', returnFromRuntimeRepair); slot.prepend(button);
    }
    function returnFromRuntimeRepair() {
        if (!runtimeRepair) return;
        const route = runtimeRepair.route;
        return navigation.navigate(route.domain, { child: route.child, reason: 'runtime-repair-return', history: 'push' });
    }
    function releaseRuntimeRepair() {
        const previous = runtimeRepair; runtimeRepair = null;
        if (previous?.origin && previous.origin !== active) previous.origin.controller?.dispose?.();
        previous?.holding?.remove();
    }
    function openRuntimeRepair(section, onReturn) {
        if (!runtimeRepair) runtimeRepair = { route: navigation.getRoute(), origin: active, onReturn, holding: null };
        const route = openRuntimeSection(section);
        if (route?.domain !== 'runtime' && !runtimeRepair?.holding) runtimeRepair = null;
        return route;
    }

    async function activate(route, reason = 'workspace-route') {
        if (disposed) return;
        const descriptor = routeDescriptor(route);
        const token = ++sequence;
        if (matchesRepairOrigin(route) && runtimeRepair.holding) {
            await disposeActive();
            if (token !== sequence || disposed) return;
            const repair = runtimeRepair; runtimeRepair = null;
            active = repair.origin;
            slot.replaceChildren(...repair.holding.childNodes); repair.holding.remove();
            slot.dataset.atriaWorkspaceHost = active.descriptor.key; setWorkspaceContext(active.descriptor);
            await repair.onReturn?.();
            return;
        }
        if (matchesRepairOrigin(route) && !runtimeRepair.origin) {
            const repair = runtimeRepair; runtimeRepair = null;
            await disposeActive();
            if (token !== sequence || disposed) return;
            slot.replaceChildren(); slot.dataset.atriaWorkspaceHost = 'idle'; clearOwnedContext();
            await repair.onReturn?.(); return;
        }
        if (runtimeRepair && !matchesRepairOrigin(route)) {
            const repairDomain = descriptor?.kind === 'runtime' || descriptor?.kind === 'library' && !/^work:/.test(route.child?.id || '');
            if (!repairDomain) releaseRuntimeRepair();
            else if (!runtimeRepair.holding && active === runtimeRepair.origin && active) {
                const holding = documentRef.createElement('section'); holding.hidden = true; holding.inert = true;
                holding.dataset.atriaRuntimeRepairOrigin = 'true'; holding.append(...slot.childNodes); shell.root.append(holding);
                runtimeRepair.holding = holding; active = null;
            }
        }

        if (!descriptor) {
            await disposeActive();
            if (token !== sequence || disposed) return;
            slot.replaceChildren();
            slot.dataset.atriaWorkspaceHost = 'idle';
            clearOwnedContext();
            return;
        }

        if (active?.descriptor?.key === descriptor.key) {
            active.descriptor = descriptor;
            active.controller?.updateRoute?.(route, reason);
            setWorkspaceContext(descriptor);
            showRepairReturn();
            return;
        }

        await disposeActive();
        if (token !== sequence || disposed) return;

        slot.dataset.atriaWorkspaceHost = descriptor.key;
        const loading = createLocalizedStatePanel(documentRef, 'loading', {
            title: descriptor.title,
            message: 'Opening workspace…',
        });
        slot.replaceChildren(loading);
        setWorkspaceContext(descriptor);

        const adapter = adapters[descriptor.kind] || adapters.placeholder;
        if (typeof adapter !== 'function') {
            throw new Error(`Missing Atria workspace adapter: ${descriptor.kind}`);
        }

        let controller;
        try {
            controller = await adapter({
                document: documentRef,
                window: windowRef,
                isCurrent: () => token === sequence && !disposed,
                shell,
                navigation,
                slot,
                route,
                descriptor,
                host: api,
            });
            // Append-style adapters (Agents) do not replace the host placeholder.
            // Remove only this activation's node, never another route's content.
            loading.remove();
        } catch (error) {
            if (token !== sequence || disposed) return;
            console.error('[atria-shell] Workspace mount failed', {
                workspace: descriptor.key,
                error,
            });
            slot.replaceChildren(createLocalizedStatePanel(documentRef, 'error', {
                title: descriptor.title,
                message: error?.message || String(error),
            }));
            controller = null;
        }

        if (token !== sequence || disposed) {
            await Promise.resolve(controller?.dispose?.());
            return;
        }

        active = {
            descriptor,
            controller: controller || {},
        };
        showRepairReturn();
    }

    function navigateToDomain(domain, {
        reason = 'workspace-navigation',
        history = 'push',
    } = {}) {
        if (navigation.getRoute().domain === domain && !navigation.getRoute().child) {
            return navigation.getRoute();
        }
        return navigation.navigate(domain, { history, reason });
    }

    function navigateToChild(domain, child, options) {
        if (navigation.getRoute().domain !== domain) return navigation.navigate(domain, { ...options, child });
        return navigation.navigateChild(child, options);
    }

    function openAgentSection(section = 'home') {
        const normalized = String(section || 'home').trim().toLowerCase();
        if (normalized === 'home' || !AGENT_SECTION_LABELS[normalized]) {
            return navigateToDomain('agents', { reason: 'workspace-agents-home' });
        }

        const id = normalized === 'diagnostics' ? 'agent-diagnostics' : normalized;
        return navigateToChild('agents', {
            id,
            label: AGENT_SECTION_LABELS[normalized],
            kind: 'workspace',
        }, {
            reason: `workspace-agents-${normalized}`,
            history: 'push',
        });
    }

    function openPlay() {
        return navigateToDomain('play', { reason: 'workspace-play' });
    }

    function openLibrarySection(section = 'works') {
        if (section === 'skills') return openUtility('plugins');
        const raw = String(section || 'works').trim().toLowerCase();
        const requested = ['prompt-programs', 'prompt-modules', 'generation-profiles'].includes(raw) ? 'prompt-presets' : raw;
        const flows = { install: 'Install / Update .atria', 'import-save': 'Import .atriasave' };
        const child = requested === 'worlds' || requested === 'knowledge' || flows[requested] ? requested : null;
        const item = child
            ? LIBRARY_SECTIONS.find(candidate => candidate.id === (flows[requested] ? 'works' : 'worlds-knowledge'))
            : LIBRARY_SECTIONS.find(candidate => candidate.id === requested) || LIBRARY_SECTIONS[0];
        const target = item.id === 'works' && !child ? null : {
            id: child || item.id,
            label: flows[child] || (child === 'worlds' ? 'Worlds' : child === 'knowledge' ? 'Knowledge Bases' : item.label),
            kind: 'workspace',
        };
        const options = { reason: `workspace-library-${child || item.id}`, history: 'push' };
        if (navigation.getRoute().domain !== 'library') return navigation.navigate('library', { ...options, child: target });
        if (target) return navigation.navigateChild(target, options);
        return navigation.getRoute().child ? navigation.clearChild(options) : navigation.getRoute();
    }

    function openLibraryDetail(id, label, kind, reason) {
        const child = {
            id,
            label: String(label || id),
            kind,
        };
        return navigateToChild('library', child, { reason, history: 'push' });
    }

    function openLibraryWork(packageId, label = '') {
        return openLibraryDetail(
            `work:${String(packageId || '').trim()}`,
            label || 'Work',
            'detail',
            'workspace-library-work-detail',
        );
    }

    function openLibraryPersona(ref, label = '') {
        return openLibraryDetail(ref ? 'persona:' + [ref.personaId, ref.revisionId, ref.contentIdentity].join(':') : 'persona:new', label || translateShellText(ref ? 'Personas' : 'New Persona'), 'detail', 'workspace-library-persona-detail');
    }

    function openLibraryWorld(worldId, label = '') {
        return openLibraryDetail(
            `world:${String(worldId || '').trim()}`,
            label || 'World',
            'detail',
            'workspace-library-world-detail',
        );
    }

    function openLibraryKnowledge(knowledgeBaseId, label = '') {
        return openLibraryDetail(
            `knowledge:${String(knowledgeBaseId || '').trim()}`,
            label || 'Knowledge Base',
            'detail',
            'workspace-library-knowledge-detail',
        );
    }

    async function openSession(sessionId, options = {}) {
        await globalThis.Atria.openNativeSession(sessionId, options);
        return openPlay();
    }

    function openKnowledgeEntry(knowledgeBaseId, revisionId, entryId, label) {
        return openLibraryDetail('knowledge:entry:' + encodeURIComponent(JSON.stringify({ knowledgeBaseId, revisionId, entryId })), label, 'detail', 'workspace-knowledge-entry');
    }

    function openSkill(scope, name) {
        return navigateToChild('play', { id: 'skills:' + encodeURIComponent(JSON.stringify({ scope, name })), label: 'Extensions', kind: 'workspace' }, { history: 'push', reason: 'workspace-skill' });
    }

    function openPlan(planId, label = '') {
        return navigateToChild('agents', { id: 'plans:' + String(planId || '').trim(), label: label || 'Plan', kind: 'detail' }, { history: 'push', reason: 'workspace-agents-plan' });
    }

    function openLibraryResource(ref, label = '') {
        if (ref?.scope === 'package' && ['core.world', 'core.knowledge'].includes(ref.resourceType) && ref.resourceId && ref.revision && ref.packageId && ref.packageVersionId) {
            return openLibraryDetail((ref.resourceType === 'core.world' ? 'world' : 'knowledge') + ':package:' + encodeURIComponent(JSON.stringify(ref)), label || ref.resourceId, 'detail', 'workspace-library-package-original');
        }
        const sections = { 'core.prompt-program': 'prompt-programs', 'core.prompt-module': 'prompt-modules', 'core.generation-profile': 'generation-profiles' };
        const section = sections[ref?.resourceType];
        if (!section || !ref.resourceId || !ref.revision) return false;
        return openLibraryDetail(section + ':' + encodeURIComponent(JSON.stringify(ref)), label || ref.resourceId, 'detail', 'workspace-library-resource');
    }

    function openPromptPreset(presetId) {
        return openLibraryDetail('prompt-presets:' + encodeURIComponent(presetId), translateShellText('Prompt Presets'), 'detail', 'workspace-prompt-preset');
    }

    function openRuntimeSection(section = 'routes', resourceId = '') {
        const requestedId = String(section || 'routes').trim().toLowerCase();
        if (requestedId === 'profiles' || requestedId === 'presets') return openLibrarySection('generation-profiles');
        const aliases = { roles: 'routes', presets: 'profiles', capabilities: 'models' };
        const id = aliases[requestedId] || requestedId;
        const item = RUNTIME_SECTIONS.find(candidate => candidate.id === id) || RUNTIME_SECTIONS[0];
        // Overview is the Runtime landing page; every other section is an explicit child.
        const child = item.id === 'overview' && !resourceId ? null : {
            id: resourceId ? item.id + ':' + resourceId : item.id,
            label: item.label, kind: 'workspace',
        };
        const options = { reason: `workspace-runtime-${item.id}`, history: 'push' };
        if (navigation.getRoute().domain !== 'runtime') return navigation.navigate('runtime', { ...options, child });
        return child ? navigation.navigateChild(child, options) : navigation.clearChild(options);
    }

    function openBuild(projectId = null, label = '') {
        const id = String(projectId || '').trim();
        const route = navigation.getRoute();
        if (!id) {
            if (route.domain !== 'build') {
                return navigateToDomain('build', { reason: 'workspace-build' });
            }
            if (route.child) {
                return navigation.clearChild({
                    history: 'push',
                    reason: 'workspace-build-projects',
                });
            }
            return route;
        }
        return navigateToChild('build', {
            id: `project:${id}`,
            label: String(label || 'Project'),
            kind: 'detail',
        }, {
            reason: 'workspace-build-project-detail',
            history: 'push',
        });
    }

    function openWorldInfo() {
        return openLibrarySection('worlds');
    }

    function openUtility(id) {
        const requested = String(id || '').trim().toLowerCase();
        const utilityId = requested.split(':')[0];
        const label = UTILITY_LABELS[utilityId];
        if (!label) {
            throw new Error(`Unknown Atria workspace utility: ${id}`);
        }

        // Global utilities belong to the neutral Play host. Commit the full
        // destination together so a rejected leave preserves the current owner.
        return navigateToChild('play', {
            id: `utility.${requested}`,
            label,
            kind: 'workspace',
        }, {
            breadcrumb: [label],
            reason: `workspace-utility-${utilityId}`,
            history: 'push',
        });
    }

    function closeActive() {
        const route = navigation.getRoute();
        if (route.child) {
            if (navigation.canGoBackWithinAtria?.()) return navigation.back();
            return navigation.clearChild({
                history: 'replace',
                reason: 'workspace-close',
            });
        }
        if (route.domain !== 'play') {
            return navigation.navigate('play', {
                reason: 'workspace-close',
                history: 'push',
            });
        }
        return route;
    }

    function refreshActive() {
        if (disposed) return;
        const previous = active;
        active = null;
        void Promise.resolve(previous?.controller?.dispose?.())
            .catch(error => console.warn('[atria-shell] Workspace refresh dispose failed', error))
            .finally(() => activate(navigation.getRoute(), 'workspace-refresh'));
    }
    function refreshForResourceChange() {
        const query = { root: slot, dirty: slot.dataset.atriaDraftDirty === 'true' || Boolean(slot.querySelector('[data-atria-draft-dirty="true"]')) };
        documentRef.dispatchEvent(new windowRef.CustomEvent('atria-draft-query', { detail: query }));
        if (!query.dirty && slot.dataset.atriaSavePending !== 'true' && !slot.querySelector('[data-atria-save-pending="true"]')) { refreshActive(); return; }
        if (slot.querySelector('[data-resource-change-notice]')) return;
        const notice = documentRef.createElement('p'); notice.className = 'atri-library-feedback'; notice.dataset.resourceChangeNotice = 'true'; notice.setAttribute('role', 'status');
        notice.textContent = translateShellText('This resource changed in storage. Your draft is kept; reload before saving.');
        const reload = documentRef.createElement('button'); reload.type = 'button'; reload.className = 'atri-library-button'; reload.textContent = translateShellText('Reload resource');
        reload.addEventListener('click', () => { if (confirmAtriaDraftLeave(documentRef, slot)) refreshActive(); }); notice.append(reload); slot.prepend(notice);
    }

    function onLegacyClick(event) {
        if (disposed || event.defaultPrevented) return;
        const target = event.target?.closest?.([
            '#rightNavDrawerIcon',
            '#WIDrawerIcon',
            '#server_logs_button',
            '#API-status-top',
            '#leftNavDrawerIcon',
            '#sys-settings-button .drawer-toggle',
            '#extensions-settings-button .drawer-toggle',
            '#user-settings-button .drawer-toggle',
            '#account_button',
            '[data-atria-action="manage-skills"]',
        ].join(', '));
        if (!target) return;

        event.preventDefault();
        event.stopImmediatePropagation();

        if (target.id === 'rightNavDrawerIcon') openLibrarySection('works');
        else if (target.id === 'WIDrawerIcon') openLibrarySection('worlds');
        else if (target.id === 'server_logs_button') openUtility('diagnostics');
        else if (target.id === 'account_button') openUtility('account');
        else if (target.closest?.('#extensions-settings-button')) openUtility('plugins');
        else if (target.closest?.('#user-settings-button')) openUtility('settings');
        else if (target.matches?.('[data-atria-action="manage-skills"]')) openLibrarySection('skills');
        else if (target.id === 'leftNavDrawerIcon') openLibrarySection('prompt-programs');
        else openRuntimeSection('connections');
    }

    const api = Object.freeze({
        openPlay,
        openAgents: openAgentSection,
        openAgentSection,
        openLibrarySection,
        openPromptPreset,
        openLibraryWork,
        openLibraryWorld,
        openLibraryPersona,
        openLibraryKnowledge,
        openSession,
        openKnowledgeEntry,
        openSkill,
        openPlan,
        openLibraryResource,
        openRuntimeSection,
        openRuntimeRepair, returnFromRuntimeRepair, hasRuntimeRepair: () => Boolean(runtimeRepair),
        openBuild,
        openProjectTask: (projectId, taskId, label) => navigateToChild('build', { id: 'project:' + projectId + ':task:' + taskId, label: label || 'Project task', kind: 'detail' }, { history: 'push', reason: 'workspace-project-task' }),
        openRun: runId => navigateToChild('agents', { id: 'runs:' + runId, label: 'Run', kind: 'detail' }, { history: 'push', reason: 'workspace-agent-run' }),
        openWorldInfo,
        openUtility,
        // Domain tools for the current page, shown in the top bar's tool capsule.
        // Only the nodes set here are replaced; Play keeps its own tools there.
        setContextActions(nodes = []) {
            for (const node of contextActionNodes) node.remove();
            contextActionNodes = nodes.filter(Boolean);
            shell.slots.contextBar?.append(...contextActionNodes);
        },
        closeActive,
        refreshActive,
        refreshForResourceChange,
        refreshSearch: () => productSearch?.refresh?.(),
        getActiveWorkspace: () => active?.descriptor || null,
        isActive: key => active?.descriptor?.key === String(key || ''),
        isMounted: () => !disposed,
        dispose() {
            if (disposed) return;
            disposed = true;
            slot.removeEventListener('atria-workspace-back', dismissTransient);
            sequence += 1;
            documentRef.removeEventListener('click', onLegacyClick, true);
            documentRef.removeEventListener('atria-command-open', refreshSearchOnOpen);
            unsubscribeNavigation?.();
            leaveGuard.dispose();
            releaseRuntimeRepair();
            activity.dispose();
            productSearch?.dispose?.();
            productSearch = null;
            for (const dispose of commandDisposers.splice(0)) dispose();
            void disposeActive();
            clearOwnedContext();
            delete slot.dataset.atriaWorkspaceHost;
        },
    });

    const activity = mountActivityIsland({ document: documentRef, window: windowRef, shell, host: api });

    productSearch = createProductSearchIndex({
        registry: shell.registry,
        host: api,
    });

    commandDisposers.push(
        shell.registry.register({
            id: 'workspace.agents',
            title: translateShellText('Open Agents Workspace'),
            description: translateShellText('Open orchestration and agent runs'),
            group: translateShellText('Workspaces'),
            keywords: ['agents', 'orchestration', 'runs'],
            run: () => openAgentSection('home'),
        }),
        shell.registry.register({
            id: 'workspace.plans',
            title: translateShellText('Open Agent Plans'),
            description: translateShellText('Author agent graphs, validate them on the Host and publish immutable revisions.'),
            group: translateShellText('Workspaces'),
            keywords: ['agents', 'plans', 'graph', 'orchestration', 'publish'],
            run: () => openAgentSection('plans'),
        }),
        shell.registry.register({
            id: 'workspace.runs',
            title: translateShellText('Open Agent Runs'),
            description: translateShellText('Follow Runs recorded by the Native Host: timeline, graph, fees and approvals.'),
            group: translateShellText('Workspaces'),
            keywords: ['agents', 'runs', 'timeline', 'approval', 'fees'],
            run: () => openAgentSection('runs'),
        }),
        shell.registry.register({
            id: 'workspace.memory',
            title: translateShellText('Open Memory Workspace'),
            description: translateShellText('Open long-term memory inside Agents'),
            group: translateShellText('Workspaces'),
            keywords: ['memory', 'graph', 'agents'],
            run: () => openAgentSection('memory'),
        }),
        shell.registry.register({
            id: 'workspace.agent-diagnostics',
            title: translateShellText('Open Agent Diagnostics'),
            description: translateShellText('Inspect agent diagnostics, trace evidence and recovery details.'),
            group: translateShellText('Workspaces'),
            keywords: ['agents', 'diagnostics', 'trace', 'recovery'],
            run: () => openAgentSection('diagnostics'),
        }),
        shell.registry.register({
            id: 'workspace.build',
            title: translateShellText('Open Build Projects'),
            description: translateShellText('Open Native ProjectStore build projects'),
            group: translateShellText('Workspaces'),
            keywords: ['build', 'projects', 'world', 'knowledge', 'package'],
            run: () => openBuild(),
        }),
        shell.registry.register({
            id: 'workspace.works',
            title: translateShellText('Open Works Library'),
            description: translateShellText('Browse installed Native Works and game progress'),
            group: translateShellText('Workspaces'),
            keywords: ['library', 'works', 'packages', 'games'],
            run: () => openLibrarySection('works'),
        }),
        shell.registry.register({
            id: 'workspace.worlds',
            title: translateShellText('Open Worlds Library'),
            description: translateShellText('Browse Native Worlds and immutable revision history'),
            group: translateShellText('Workspaces'),
            keywords: ['library', 'worlds', 'revisions'],
            run: () => openLibrarySection('worlds'),
        }),
        shell.registry.register({
            id: 'workspace.knowledge',
            title: translateShellText('Open Knowledge Library'),
            description: translateShellText('Browse Native Knowledge Bases, entries, bindings and references'),
            group: translateShellText('Workspaces'),
            keywords: ['library', 'knowledge', 'bindings', 'entries'],
            run: () => openLibrarySection('knowledge'),
        }),
        shell.registry.register({
            id: 'workspace.runtime-overview',
            title: translateShellText('Open Runtime Routes'),
            description: translateShellText('Configure Native model and prompt routes'),
            group: translateShellText('Workspaces'),
            keywords: ['runtime', 'overview', 'health'],
            run: () => openRuntimeSection('routes'),
        }),
        shell.registry.register({
            id: 'workspace.connections',
            title: translateShellText('Open Runtime Connections'),
            description: translateShellText('Configure Native provider endpoints and Secret references'),
            group: translateShellText('Workspaces'),
            keywords: ['runtime', 'connections', 'providers', 'models'],
            run: () => openRuntimeSection('connections'),
        }),
        shell.registry.register({
            id: 'workspace.prompt-presets',
            title: translateShellText('Prompt Presets'),
            description: translateShellText('Prompt Presets'),
            group: translateShellText('Workspaces'),
            keywords: ['library', 'generation', 'profiles'],
            run: () => openLibrarySection('prompt-presets'),
        }),
        shell.registry.register({
            id: 'workspace.world-info',
            title: translateShellText('Open World Info Workspace'),
            description: translateShellText('Open worlds and knowledge through the existing World Info controller'),
            group: translateShellText('Workspaces'),
            keywords: ['world', 'lorebook', 'knowledge'],
            run: () => openWorldInfo(),
        }),
        shell.registry.register({
            id: 'workspace.diagnostics',
            title: translateShellText('Open Diagnostics Workspace'),
            description: translateShellText('Open incidents, startup diagnostics and logs'),
            group: translateShellText('Workspaces'),
            keywords: ['diagnostics', 'logs', 'startup', 'incidents'],
            run: () => openUtility('diagnostics'),
        }),
        shell.registry.register({
            id: 'workspace.plugins',
            title: translateShellText('Open Extensions'),
            description: translateShellText('Manage Skills, external plugins, local scripts and built-in tools.'),
            group: translateShellText('Utilities'),
            keywords: ['extensions', 'skills', 'plugins', 'scripts', 'regex', 'search'],
            run: () => openUtility('plugins'),
        }),
        shell.registry.register({
            id: 'workspace.settings',
            title: translateShellText('Open Settings'),
            description: translateShellText('Open global appearance, language and interaction preferences'),
            group: translateShellText('Utilities'),
            keywords: ['settings', 'appearance', 'language', 'accessibility'],
            run: () => openUtility('settings'),
        }),
        shell.registry.register({
            id: 'workspace.account',
            title: translateShellText('Open Account'),
            description: translateShellText('Open identity, snapshots, backup and account storage'),
            group: translateShellText('Utilities'),
            keywords: ['account', 'profile', 'backup', 'snapshots'],
            run: () => openUtility('account'),
        }),
    );

    documentRef.addEventListener('click', onLegacyClick, true);
    const unsubscribeNavigation = navigation.subscribe(state => {
        const signature = JSON.stringify(state.route);
        if (signature === lastRouteSignature) return;
        lastRouteSignature = signature;
        void activate(state.route, 'navigation');
    });
    void activate(navigation.getRoute(), 'initial');

    return api;
}

export { normalizeAgentSection, routeDescriptor };
