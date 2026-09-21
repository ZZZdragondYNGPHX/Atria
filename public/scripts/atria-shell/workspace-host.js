import { createAtriaStatePanel } from './primitives.js';

const AGENT_SECTION_LABELS = Object.freeze({
    orchestration: 'Orchestration',
    run: 'Run',
    memory: 'Memory',
    diagnostics: 'Diagnostics',
});

function normalizeAgentSection(route) {
    const childId = String(route?.child?.id || '').trim();
    if (childId === 'memory') return 'memory';
    if (childId === 'run') return 'run';
    if (childId === 'agent-diagnostics') return 'diagnostics';
    return 'orchestration';
}

function routeDescriptor(route) {
    const childId = String(route?.child?.id || '').trim();
    if (childId === 'utility.diagnostics') {
        return Object.freeze({
            key: 'utility:diagnostics',
            kind: 'diagnostics',
            title: 'Diagnostics',
        });
    }
    if (route?.domain === 'agents') {
        const section = normalizeAgentSection(route);
        return Object.freeze({
            key: 'agents',
            kind: 'agents',
            section,
            title: section === 'orchestration' ? 'Agents' : AGENT_SECTION_LABELS[section],
        });
    }
    if (route?.domain === 'studio') {
        return Object.freeze({
            key: 'studio',
            kind: 'studio',
            title: 'Studio',
        });
    }
    if (route?.domain === 'library' && childId === 'world-info') {
        return Object.freeze({
            key: 'library:world-info',
            kind: 'world-info',
            title: 'World Info',
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
    heading.textContent = String(title || 'Workspace');
    root.append(heading);

    if (detail) {
        const paragraph = documentRef.createElement('p');
        paragraph.textContent = String(detail);
        root.append(paragraph);
    }
    return root;
}

function mountPlaceholder({ document: documentRef, slot, descriptor }) {
    const panel = createAtriaStatePanel(documentRef, 'empty', {
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

async function mountAgentsWorkspace({ slot, descriptor, host }) {
    const panel = await import('../extensions/orchestrator/workspace/panel.js');
    const root = panel.openWorkspace(descriptor.section, {
        container: slot,
        embedded: true,
        onNavigate: section => host.openAgentSection(section),
    });
    return {
        root,
        updateRoute(route) {
            panel.setWorkspaceSection(normalizeAgentSection(route), { focus: false });
        },
        dispose() {
            panel.destroyWorkspace();
        },
    };
}

async function mountStudioWorkspace({ document: documentRef, slot, host }) {
    const context = globalThis.Atria?.getContext?.();
    const requested = host.consumeStudioCharacter();
    const charId = requested ?? context?.characterId;
    if (charId === undefined || charId === null || charId === '' || Number(charId) < 0) {
        const panel = createAtriaStatePanel(documentRef, 'empty', {
            title: 'Game Studio',
            message: 'Select a character or game project to open the existing Game Studio controller.',
        });
        slot.replaceChildren(panel);
        return {
            root: panel,
            dispose() {
                panel.remove();
            },
        };
    }

    const studio = await import('../extensions/character-editor-assistant/studio/studio.js');
    const root = await studio.openCardAppStudio(charId, {
        container: slot,
        embedded: true,
    });
    return {
        root,
        dispose() {
            return studio.closeCardAppStudio();
        },
    };
}

async function mountWorldInfoWorkspace({ document: documentRef, slot }) {
    const worldInfo = await import('../world-info/workspace.js');
    const mounted = worldInfo.mountWorldInfoWorkspace(slot, { embedded: true });
    if (mounted) return mounted;

    const panel = createAtriaStatePanel(documentRef, 'loading', {
        title: 'World Info',
        message: 'World Info is still finishing its existing controller bootstrap.',
    });
    slot.replaceChildren(panel);
    return {
        root: panel,
        dispose() {
            panel.remove();
        },
    };
}

async function mountDiagnosticsWorkspace({ slot }) {
    const [diagnostics, user] = await Promise.all([
        import('../logging/workspace.js'),
        import('../user.js'),
    ]);
    return await diagnostics.openLogsWorkspace({
        canViewServerLogs: !user.accountsEnabled || user.isAdmin(),
        container: slot,
    });
}

export function createAtriaWorkspaceAdapters() {
    return Object.freeze({
        agents: mountAgentsWorkspace,
        studio: mountStudioWorkspace,
        'world-info': mountWorldInfoWorkspace,
        diagnostics: mountDiagnosticsWorkspace,
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
    let disposed = false;
    let sequence = 0;
    let active = null;
    let pendingStudioCharacter = null;
    let lastRouteSignature = JSON.stringify(navigation.getRoute());
    const commandDisposers = [];

    function contextState() {
        return navigation.getContext?.() || {
            open: false,
            sheetState: 'half',
        };
    }

    function setWorkspaceContext(descriptor) {
        const current = contextState();
        const detail = descriptor.kind === 'agents'
            ? `Current Agents view: ${AGENT_SECTION_LABELS[descriptor.section] || descriptor.section}`
            : descriptor.kind === 'studio'
                ? 'Project, editor and simulation details share the existing Studio controller.'
                : descriptor.kind === 'world-info'
                    ? 'World and entry details continue to use the existing World Info controller.'
                    : descriptor.kind === 'diagnostics'
                        ? 'Incidents, startup diagnostics and raw evidence use the existing diagnostics controller.'
                        : 'Workspace integration is staged for a later R7 phase.';
        shell.setContextContent(
            makeContextSummary(documentRef, descriptor.title, detail),
            {
                title: descriptor.title,
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
        slot.replaceChildren(createAtriaStatePanel(documentRef, 'loading', {
            title: descriptor.title,
            message: 'Opening workspace…',
        }));
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
                shell,
                navigation,
                slot,
                route,
                descriptor,
                host: api,
            });
        } catch (error) {
            if (token !== sequence || disposed) return;
            console.error('[atria-shell] Workspace mount failed', {
                workspace: descriptor.key,
                error,
            });
            slot.replaceChildren(createAtriaStatePanel(documentRef, 'error', {
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

    function openAgentSection(section = 'orchestration') {
        const normalized = String(section || 'orchestration').trim().toLowerCase();
        const route = navigation.getRoute();
        if (route.domain !== 'agents') {
            navigation.navigate('agents', {
                reason: 'workspace-agents',
                history: 'push',
            });
        }

        if (normalized === 'orchestration') {
            if (navigation.getRoute().child) {
                navigation.clearChild({
                    history: 'push',
                    reason: 'workspace-agents-orchestration',
                });
            }
            return navigation.getRoute();
        }

        const id = normalized === 'diagnostics' ? 'agent-diagnostics' : normalized;
        return navigation.navigateChild({
            id,
            label: AGENT_SECTION_LABELS[normalized] || normalized,
            kind: 'workspace',
        }, {
            reason: 'workspace-agents-section',
            history: 'push',
        });
    }

    function openStudio(characterId) {
        const hasExplicitCharacter = characterId !== undefined && characterId !== null && characterId !== '';
        if (hasExplicitCharacter) pendingStudioCharacter = characterId;

        const route = navigation.getRoute();
        if (route.domain === 'studio' && !route.child) {
            if (hasExplicitCharacter) refreshActive();
            return route;
        }
        return navigateToDomain('studio', { reason: 'workspace-studio' });
    }

    function openWorldInfo() {
        if (navigation.getRoute().domain !== 'library') {
            navigation.navigate('library', {
                reason: 'workspace-world-info-domain',
                history: 'push',
            });
        }
        return navigation.navigateChild({
            id: 'world-info',
            label: 'World Info',
            kind: 'workspace',
        }, {
            reason: 'workspace-world-info',
            history: 'push',
        });
    }

    function openUtility(id) {
        if (id !== 'diagnostics') {
            throw new Error(`Unknown Atria workspace utility: ${id}`);
        }
        return navigation.navigateChild({
            id: 'utility.diagnostics',
            label: 'Diagnostics',
            kind: 'workspace',
        }, {
            reason: 'workspace-utility-diagnostics',
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

    function consumeStudioCharacter() {
        const value = pendingStudioCharacter;
        pendingStudioCharacter = null;
        return value;
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
        const target = event.target?.closest?.('#WIDrawerIcon, #server_logs_button');
        if (!target) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (target.id === 'WIDrawerIcon') openWorldInfo();
        else openUtility('diagnostics');
    }

    const api = Object.freeze({
        openAgents: openAgentSection,
        openAgentSection,
        openStudio,
        openWorldInfo,
        openUtility,
        closeActive,
        refreshActive,
        consumeStudioCharacter,
        getActiveWorkspace: () => active?.descriptor || null,
        isActive: key => active?.descriptor?.key === String(key || ''),
        isMounted: () => !disposed,
        dispose() {
            if (disposed) return;
            disposed = true;
            sequence += 1;
            documentRef.removeEventListener('click', onLegacyClick, true);
            unsubscribeNavigation?.();
            for (const dispose of commandDisposers.splice(0)) dispose();
            void disposeActive();
            clearOwnedContext();
            delete slot.dataset.atriaWorkspaceHost;
        },
    });

    commandDisposers.push(
        shell.registry.register({
            id: 'workspace.agents',
            title: 'Open Agents Workspace',
            description: 'Open orchestration and agent runs',
            group: 'Workspaces',
            keywords: ['agents', 'orchestration', 'runs'],
            run: () => openAgentSection('orchestration'),
        }),
        shell.registry.register({
            id: 'workspace.memory',
            title: 'Open Memory Workspace',
            description: 'Open long-term memory inside Agents',
            group: 'Workspaces',
            keywords: ['memory', 'graph', 'agents'],
            run: () => openAgentSection('memory'),
        }),
        shell.registry.register({
            id: 'workspace.studio',
            title: 'Open Game Studio',
            description: 'Open the existing Atria Game Studio',
            group: 'Workspaces',
            keywords: ['studio', 'game', 'editor'],
            run: () => openStudio(),
        }),
        shell.registry.register({
            id: 'workspace.world-info',
            title: 'Open World Info Workspace',
            description: 'Open worlds and knowledge through the existing World Info controller',
            group: 'Workspaces',
            keywords: ['world', 'lorebook', 'knowledge'],
            run: () => openWorldInfo(),
        }),
        shell.registry.register({
            id: 'workspace.diagnostics',
            title: 'Open Diagnostics Workspace',
            description: 'Open incidents, startup diagnostics and logs',
            group: 'Workspaces',
            keywords: ['diagnostics', 'logs', 'startup', 'incidents'],
            run: () => openUtility('diagnostics'),
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
