import { createAtriaIcon } from './icons.js';
import { createAtriaStatePanel } from './primitives.js';
import {
    mountAccountUtility,
    mountPluginsUtility,
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

function createLocalizedStatePanel(documentRef, kind, options = {}) {
    return createAtriaStatePanel(documentRef, kind, {
        ...options,
        title: translateShellText(options.title),
        message: translateShellText(options.message),
    });
}

const AGENT_SECTION_LABELS = Object.freeze({
    home: 'Agents',
    orchestration: 'Orchestration',
    run: 'Run',
    memory: 'Memory',
    diagnostics: 'Diagnostics',
});

const AGENT_SECTION_DESCRIPTIONS = Object.freeze({
    orchestration: 'Configure orchestration presets, agents and workflows.',
    run: 'Inspect the current agent run, graph and execution timeline.',
    memory: 'Browse long-term memory, evidence and knowledge maintenance.',
    diagnostics: 'Inspect agent diagnostics, trace evidence and recovery details.',
});

const UTILITY_LABELS = Object.freeze({
    diagnostics: 'Diagnostics',
    plugins: 'Plugins',
    settings: 'Settings',
    account: 'Account',
});

function normalizeAgentSection(route) {
    const childId = String(route?.child?.id || '').trim();
    if (!childId) return 'home';
    if (childId === 'orchestration') return 'orchestration';
    if (childId === 'memory') return 'memory';
    if (childId === 'run') return 'run';
    if (childId === 'agent-diagnostics') return 'diagnostics';
    return 'home';
}

function routeDescriptor(route) {
    const childId = String(route?.child?.id || '').trim();
    if (childId.startsWith('utility.')) {
        const utilityId = childId.slice('utility.'.length);
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
        return Object.freeze({
            key: section === 'home' ? 'agents:home' : 'agents:workspace',
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
        message: 'This domain is reserved for the next staged R7 integration phase.',
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
    for (const section of ['orchestration', 'run', 'memory', 'diagnostics']) {
        const card = documentRef.createElement('button');
        card.type = 'button';
        card.className = 'atria-agents-hub__card';
        card.dataset.atriaAgentSection = section;

        const cardTitle = documentRef.createElement('strong');
        cardTitle.textContent = translateShellText(AGENT_SECTION_LABELS[section]);
        const description = documentRef.createElement('span');
        description.textContent = translateShellText(AGENT_SECTION_DESCRIPTIONS[section]);
        const symbol = createAtriaIcon(documentRef, { orchestration: 'agents', run: 'play', memory: 'library', diagnostics: 'diagnostics' }[section]);
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

    const panel = await import('../extensions/orchestrator/workspace/panel.js');
    if (!isCurrent()) return {};
    const root = panel.openWorkspace(descriptor.section, {
        container: slot,
        embedded: true,
        onNavigate: section => host.openAgentSection(section),
    });
    return {
        root,
        dismissTransient: () => panel.dismissWorkspaceTransient(),
        updateRoute(route) {
            panel.setWorkspaceSection(normalizeAgentSection(route), { focus: false });
        },
        dispose() {
            panel.destroyWorkspace();
        },
    };
}

async function mountBuildWorkspace(args) {
    const studio = await import('../native/studio-workspace.js');
    return studio.mountNativeStudioWorkspace(args);
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
        build: mountBuildWorkspace,
        library: mountLibraryDomainWorkspace,
        runtime: mountRuntimeDomainWorkspace,
        diagnostics: mountDiagnosticsWorkspace,
        plugins: mountPluginsUtility,
        settings: mountSettingsUtility,
        account: mountAccountUtility,
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
    let lastRouteSignature = JSON.stringify(navigation.getRoute());
    const commandDisposers = [];
    let productSearch = null;
    const refreshSearchOnOpen = () => { void productSearch?.refresh?.().catch(error => console.warn('[atria-shell] Search refresh failed', error)); };
    documentRef.addEventListener('atria-command-open', refreshSearchOnOpen);

    function contextState() {
        return navigation.getContext?.() || {
            open: false,
            sheetState: 'half',
        };
    }

    function setWorkspaceContext(descriptor) {
        const current = contextState();
        const detail = descriptor.kind === 'agents'
            ? formatShellText('Current Agents view: ${0}', [translateShellText(AGENT_SECTION_LABELS[descriptor.section] || descriptor.section)], undefined, 'atria.shell.context.agents')
            : descriptor.kind === 'build'
                ? translateShellText('Build projects and exact World / Knowledge dependencies use ProjectStore authority.')
                : descriptor.kind === 'library'
                    ? formatShellText('Library / ${0} uses exact Native Package, World, Knowledge, Prompt and Generation resources.', [translateShellText(descriptor.title)], undefined, 'atria.shell.context.library')
                    : descriptor.kind === 'runtime'
                        ? formatShellText('Runtime / ${0} uses Native routes and exact model, connection, Generation and Prompt resources.', [translateShellText(descriptor.title)], undefined, 'atria.shell.context.nativeRuntime')
                        : descriptor.kind === 'diagnostics'
                            ? translateShellText('Incidents, startup diagnostics and raw evidence use the existing diagnostics controller.')
                            : descriptor.kind === 'plugins'
                                ? translateShellText('Third-party plugins reuse the existing extension loader, manifests and enable/disable persistence.')
                                : descriptor.kind === 'settings'
                                    ? translateShellText('Global preferences reuse the existing User Settings controls and persistence authorities.')
                                    : descriptor.kind === 'account'
                                        ? translateShellText('Identity, snapshots, backup and account-isolated storage reuse the existing account controller.')
                                        : translateShellText('Workspace integration is staged for a later R7 phase.');
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

    async function activate(route, reason = 'workspace-route') {
        if (disposed) return;
        const descriptor = routeDescriptor(route);
        const token = ++sequence;

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

    function openAgentSection(section = 'home') {
        const normalized = String(section || 'home').trim().toLowerCase();
        if (navigation.getRoute().domain !== 'agents') {
            navigation.navigate('agents', {
                reason: 'workspace-agents',
                history: 'push',
            });
        }

        if (normalized === 'home' || !AGENT_SECTION_LABELS[normalized]) {
            if (navigation.getRoute().child) {
                navigation.clearChild({
                    history: 'push',
                    reason: 'workspace-agents-home',
                });
            }
            return navigation.getRoute();
        }

        const id = normalized === 'diagnostics' ? 'agent-diagnostics' : normalized;
        return navigation.navigateChild({
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
        const requested = String(section || 'works').trim().toLowerCase();
        const child = requested === 'worlds' || requested === 'knowledge'
            ? requested
            : null;
        const item = child
            ? LIBRARY_SECTIONS.find(candidate => candidate.id === 'worlds-knowledge')
            : LIBRARY_SECTIONS.find(candidate => candidate.id === requested) || LIBRARY_SECTIONS[0];
        if (navigation.getRoute().domain !== 'library') {
            navigation.navigate('library', {
                reason: 'workspace-library-domain',
                history: 'push',
            });
        }
        if (item.id === 'works' && !child) {
            if (navigation.getRoute().child) {
                return navigation.clearChild({
                    history: 'push',
                    reason: 'workspace-library-works',
                });
            }
            return navigation.getRoute();
        }
        return navigation.navigateChild({
            id: child || item.id,
            label: child === 'worlds' ? 'Worlds' : child === 'knowledge' ? 'Knowledge Bases' : item.label,
            kind: 'workspace',
        }, {
            reason: `workspace-library-${child || item.id}`,
            history: 'push',
        });
    }

    function openLibraryDetail(id, label, kind, reason) {
        if (navigation.getRoute().domain !== 'library') {
            navigation.navigate('library', {
                reason: reason + '-domain',
                history: 'push',
            });
        }
        return navigation.navigateChild({
            id,
            label: String(label || id),
            kind,
        }, {
            reason,
            history: 'push',
        });
    }

    function openLibraryWork(packageId, label = '') {
        return openLibraryDetail(
            `work:${String(packageId || '').trim()}`,
            label || 'Work',
            'detail',
            'workspace-library-work-detail',
        );
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

    function openLibraryResource(ref, label = '') {
        const sections = { 'core.prompt-program': 'prompt-programs', 'core.prompt-module': 'prompt-modules', 'core.generation-profile': 'generation-profiles' };
        const section = sections[ref?.resourceType];
        if (!section || !ref.resourceId || !ref.revision) return false;
        return openLibraryDetail(section + ':' + encodeURIComponent(JSON.stringify(ref)), label || ref.resourceId, 'detail', 'workspace-library-resource');
    }

    function openRuntimeSection(section = 'routes', resourceId = '') {
        const requestedId = String(section || 'routes').trim().toLowerCase();
        if (requestedId === 'profiles' || requestedId === 'presets') return openLibrarySection('generation-profiles');
        // Retrieval used to be a duplicate Runtime tab pointing at the same
        // Connection Manager. Keep callers compatible while routing to the
        // single Connections surface.
        const aliases = { overview: 'routes', roles: 'routes', retrieval: 'connections', presets: 'profiles', capabilities: 'models' };
        const id = aliases[requestedId] || requestedId;
        const item = RUNTIME_SECTIONS.find(candidate => candidate.id === id) || RUNTIME_SECTIONS[0];
        if (navigation.getRoute().domain !== 'runtime') {
            navigation.navigate('runtime', {
                reason: 'workspace-runtime-domain',
                history: 'push',
            });
        }
        if (item.id === 'routes' && !resourceId) {
            if (navigation.getRoute().child) {
                return navigation.clearChild({
                    history: 'push',
                    reason: 'workspace-runtime-overview',
                });
            }
            return navigation.getRoute();
        }
        return navigation.navigateChild({
            id: resourceId ? item.id + ':' + resourceId : item.id,
            label: item.label,
            kind: 'workspace',
        }, {
            reason: `workspace-runtime-${item.id}`,
            history: 'push',
        });
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
        if (route.domain !== 'build') {
            navigation.navigate('build', {
                reason: 'workspace-build-domain',
                history: 'push',
            });
        }
        return navigation.navigateChild({
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
        const utilityId = String(id || '').trim().toLowerCase();
        const label = UTILITY_LABELS[utilityId];
        if (!label) {
            throw new Error(`Unknown Atria workspace utility: ${id}`);
        }

        // Utilities are global surfaces, not children of whichever primary
        // domain happened to launch/search them. Canonicalize their parent to
        // the neutral Play host, then replace that same history entry with the
        // utility child route. This prevents e.g. Settings searched from
        // Agents from appearing as an Agents-owned page.
        const route = navigation.getRoute();
        if (route.domain !== 'play') {
            navigation.navigate('play', {
                reason: `workspace-utility-${utilityId}-host`,
                history: 'push',
            });
            return navigation.navigateChild({
                id: `utility.${utilityId}`,
                label,
                kind: 'workspace',
            }, {
                breadcrumb: [label],
                reason: `workspace-utility-${utilityId}`,
                history: 'replace',
            });
        }

        return navigation.navigateChild({
            id: `utility.${utilityId}`,
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
        openLibraryWork,
        openLibraryWorld,
        openLibraryKnowledge,
        openLibraryResource,
        openRuntimeSection,
        openBuild,
        openWorldInfo,
        openUtility,
        closeActive,
        refreshActive,
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
            productSearch?.dispose?.();
            productSearch = null;
            for (const dispose of commandDisposers.splice(0)) dispose();
            void disposeActive();
            clearOwnedContext();
            delete slot.dataset.atriaWorkspaceHost;
        },
    });

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
            id: 'workspace.orchestration',
            title: translateShellText('Open Orchestration Workspace'),
            description: translateShellText('Configure orchestration presets, agents and workflows.'),
            group: translateShellText('Workspaces'),
            keywords: ['agents', 'orchestration', 'presets', 'workflows'],
            run: () => openAgentSection('orchestration'),
        }),
        shell.registry.register({
            id: 'workspace.agent-run',
            title: translateShellText('Open Agent Run Workspace'),
            description: translateShellText('Inspect the current agent run, graph and execution timeline.'),
            group: translateShellText('Workspaces'),
            keywords: ['agents', 'run', 'graph', 'timeline'],
            run: () => openAgentSection('run'),
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
            id: 'workspace.skills',
            title: translateShellText('Open Skills Library'),
            description: translateShellText('Open the existing Skill Manager controller inside Library'),
            group: translateShellText('Workspaces'),
            keywords: ['library', 'skills'],
            run: () => openLibrarySection('skills'),
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
            id: 'workspace.generation-profiles',
            title: translateShellText('Open Generation Profiles'),
            description: translateShellText('Edit Native Generation resources'),
            group: translateShellText('Workspaces'),
            keywords: ['library', 'generation', 'profiles'],
            run: () => openLibrarySection('generation-profiles'),
        }),
        ...[['prompt-programs', 'Prompt Programs'], ['prompt-modules', 'Prompt Modules']].map(([id, title]) => shell.registry.register({
            id: 'workspace.' + id, title: translateShellText(title), group: translateShellText('Library'),
            keywords: ['library', 'prompt', id], run: () => openLibrarySection(id),
        })),
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
            title: translateShellText('Open Plugins'),
            description: translateShellText('Manage installed third-party extensions'),
            group: translateShellText('Utilities'),
            keywords: ['plugins', 'extensions', 'third-party'],
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
