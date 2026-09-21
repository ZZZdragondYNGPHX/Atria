import {
    ATRIA_COMMAND_SHORTCUT,
    ATRIA_GLOBAL_UTILITIES,
    ATRIA_PRIMARY_DOMAINS,
    ATRIA_VIEWPORT_MODES,
} from './constants.js';
import { createAtriaShellEnvironment } from './environment.js';
import { createAtriaNavigationAuthority } from './navigation-authority.js';
import {
    createAtriaPrimitive,
    createAtriaStatePanel,
    createAtriaStatusChip,
} from './primitives.js';

function translateLabel(translate, value) {
    if (typeof translate !== 'function') return String(value);
    try {
        return String(translate(value) ?? value);
    } catch {
        return String(value);
    }
}

function makeIcon(documentRef, className) {
    const icon = documentRef.createElement('i');
    icon.className = className;
    icon.setAttribute('aria-hidden', 'true');
    return icon;
}

function makeNavButton(documentRef, domain, translate) {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'atria-shell-nav-button';
    button.dataset.atriaDomain = domain.id;
    button.title = translateLabel(translate, domain.label);
    button.setAttribute('aria-label', translateLabel(translate, domain.label));
    button.append(makeIcon(documentRef, domain.icon));

    const label = documentRef.createElement('span');
    label.className = 'atria-shell-nav-label';
    label.textContent = translateLabel(translate, domain.label);
    button.append(label);
    return button;
}

function makeUtilityButton(documentRef, utility, translate) {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'atria-shell-utility-button';
    button.dataset.atriaUtility = utility.id;
    button.title = translateLabel(translate, utility.label);
    button.setAttribute('aria-label', translateLabel(translate, utility.label));
    button.append(makeIcon(documentRef, utility.icon));

    const label = documentRef.createElement('span');
    label.className = 'atria-shell-utility-label';
    label.textContent = translateLabel(translate, utility.label);
    button.append(label);
    return button;
}

function setNodeContent(node, content) {
    node.replaceChildren();
    if (content === undefined || content === null) return;
    if (typeof content === 'string' || typeof content === 'number') {
        node.textContent = String(content);
        return;
    }
    node.append(content);
}

function isCommandShortcut(event) {
    if (String(event.key || '').toLowerCase() !== ATRIA_COMMAND_SHORTCUT.key) return false;
    return Boolean(event.metaKey || event.ctrlKey);
}

function commandSubtitle(command) {
    return [command.group, command.description].filter(Boolean).join(' · ');
}

export function createAtriaAppShell({
    document: documentRef = globalThis.document,
    window: windowRef = globalThis.window,
    registry,
    navigation,
    translate,
    utilities = {},
    initialDomain = 'play',
} = {}) {
    if (!documentRef?.body || !documentRef.createElement) {
        throw new Error('Atria AppShell requires a document with a body');
    }
    if (!windowRef) throw new Error('Atria AppShell requires a window');
    if (!registry?.register || !registry?.search || !registry?.execute) {
        throw new Error('Atria AppShell requires a command registry');
    }
    if (documentRef.getElementById('atria-app-shell')) {
        throw new Error('Atria AppShell is already mounted');
    }

    const root = createAtriaPrimitive(documentRef, 'AppShell', {
        tag: 'div',
        role: 'application',
        ariaLabel: 'Atria',
    });
    root.id = 'atria-app-shell';
    root.dataset.atriaShellMounted = 'true';

    const rail = createAtriaPrimitive(documentRef, 'NavigationRail', {
        tag: 'nav',
        ariaLabel: 'Primary navigation',
    });
    const railBrand = documentRef.createElement('div');
    railBrand.className = 'atria-shell-brand';
    railBrand.setAttribute('aria-label', 'Atria');
    railBrand.textContent = 'A';
    const railItems = documentRef.createElement('div');
    railItems.className = 'atria-shell-nav-items';
    rail.append(railBrand, railItems);

    const globalBar = createAtriaPrimitive(documentRef, 'GlobalBar', {
        tag: 'header',
        ariaLabel: 'Global controls',
    });
    const context = documentRef.createElement('div');
    context.className = 'atria-global-bar__context';
    const breadcrumb = documentRef.createElement('div');
    breadcrumb.className = 'atria-global-bar__breadcrumb';
    breadcrumb.textContent = 'Atria / Play';
    const runtimeChip = createAtriaStatusChip(documentRef, {
        label: 'Runtime ready',
        tone: 'success',
    });
    context.append(breadcrumb, runtimeChip);

    const utilitiesContainer = documentRef.createElement('div');
    utilitiesContainer.className = 'atria-global-bar__utilities';
    globalBar.append(context, utilitiesContainer);

    const focus = createAtriaPrimitive(documentRef, 'FocusArea', {
        tag: 'main',
        ariaLabel: 'Atria focus area',
    });
    const contextBar = createAtriaPrimitive(documentRef, 'ContextBar', {
        tag: 'div',
        role: 'toolbar',
        ariaLabel: 'Context controls',
    });
    const contextTitle = documentRef.createElement('strong');
    contextTitle.className = 'atria-context-bar__title';
    contextTitle.textContent = translateLabel(translate, 'Play');
    const contextActions = documentRef.createElement('div');
    contextActions.className = 'atria-context-bar__actions';
    contextBar.append(contextTitle, contextActions);

    const stage = createAtriaPrimitive(documentRef, 'Stage', {
        tag: 'section',
        ariaLabel: 'Play stage',
    });
    stage.id = 'atria-stage';
    stage.append(createAtriaStatePanel(documentRef, 'empty', {
        title: 'Play',
        message: 'The Native Conversation Host mounts here when the staged R7 preview is enabled.',
    }));

    const workspace = createAtriaPrimitive(documentRef, 'Workspace', {
        tag: 'section',
        ariaLabel: 'Workspace',
    });
    workspace.id = 'atria-workspace';
    workspace.hidden = true;

    const focusBody = documentRef.createElement('div');
    focusBody.className = 'atria-focus-area__body';
    focusBody.append(stage, workspace);
    focus.append(contextBar, focusBody);

    const dock = createAtriaPrimitive(documentRef, 'Dock', {
        tag: 'aside',
        ariaLabel: 'Context dock',
    });
    dock.id = 'atria-context-dock';
    const dockHeader = documentRef.createElement('div');
    dockHeader.className = 'atria-dock__header';
    const dockTitle = documentRef.createElement('strong');
    dockTitle.textContent = 'Context';
    const dockClose = documentRef.createElement('button');
    dockClose.type = 'button';
    dockClose.className = 'atria-icon-button';
    dockClose.title = 'Close dock';
    dockClose.setAttribute('aria-label', 'Close dock');
    dockClose.append(makeIcon(documentRef, 'fa-solid fa-xmark'));
    dockHeader.append(dockTitle, dockClose);
    const dockBody = documentRef.createElement('div');
    dockBody.className = 'atria-dock__body';
    dockBody.append(createAtriaStatePanel(documentRef, 'empty', {
        title: 'Context Dock',
        message: 'Timeline, Inspector, World, Runtime and evidence panels can mount here.',
    }));
    dock.append(dockHeader, dockBody);

    const bottomNavigation = createAtriaPrimitive(documentRef, 'BottomNavigation', {
        tag: 'nav',
        ariaLabel: 'Primary navigation',
    });

    const transientLayer = documentRef.createElement('div');
    transientLayer.className = 'atria-transient-layer';
    transientLayer.dataset.atriaShellLayer = 'transient';

    const recovery = createAtriaPrimitive(documentRef, 'HostRecovery', {
        tag: 'div',
        ariaLabel: 'Host recovery',
    });
    recovery.dataset.atriaShellLayer = 'recovery';

    const sheet = createAtriaPrimitive(documentRef, 'Sheet', {
        tag: 'section',
        role: 'dialog',
        ariaLabel: 'Context sheet',
    });
    sheet.hidden = true;
    sheet.id = 'atria-context-sheet';
    const sheetScrim = documentRef.createElement('button');
    sheetScrim.type = 'button';
    sheetScrim.className = 'atria-sheet-scrim';
    sheetScrim.setAttribute('aria-label', 'Close sheet');
    const sheetPanel = documentRef.createElement('div');
    sheetPanel.className = 'atria-sheet-panel';
    const sheetHandle = documentRef.createElement('div');
    sheetHandle.className = 'atria-sheet-handle';
    sheetHandle.setAttribute('aria-hidden', 'true');
    const sheetBody = documentRef.createElement('div');
    sheetBody.className = 'atria-sheet-body';
    sheetPanel.append(sheetHandle, sheetBody);
    sheet.append(sheetScrim, sheetPanel);
    transientLayer.append(sheet);

    const commandSurface = documentRef.createElement('section');
    commandSurface.className = 'atria-command-surface';
    commandSurface.hidden = true;
    commandSurface.setAttribute('role', 'dialog');
    commandSurface.setAttribute('aria-modal', 'true');
    commandSurface.setAttribute('aria-label', 'Command');
    const commandScrim = documentRef.createElement('button');
    commandScrim.type = 'button';
    commandScrim.className = 'atria-command-scrim';
    commandScrim.setAttribute('aria-label', 'Close command');
    const commandPanel = documentRef.createElement('div');
    commandPanel.className = 'atria-command-panel';
    const commandInput = documentRef.createElement('input');
    commandInput.type = 'search';
    commandInput.className = 'atria-command-input';
    commandInput.placeholder = 'Search commands';
    commandInput.setAttribute('aria-label', 'Search commands');
    const commandList = documentRef.createElement('div');
    commandList.className = 'atria-command-results';
    commandList.setAttribute('role', 'listbox');
    commandPanel.append(commandInput, commandList);
    commandSurface.append(commandScrim, commandPanel);
    transientLayer.append(commandSurface);

    root.append(rail, globalBar, focus, dock, bottomNavigation, transientLayer, recovery);
    documentRef.body.append(root);

    const environment = createAtriaShellEnvironment(root, { window: windowRef });
    const ownsNavigation = !navigation;
    const navigationAuthority = navigation || createAtriaNavigationAuthority({
        window: windowRef,
        initialDomain,
    });
    const navButtons = new Map();
    let commandOpen = false;
    let commandDisposers = [];
    let disposed = false;
    let lastRouteSignature = '';

    if (!navigationAuthority.getContext().initialized) {
        navigationAuthority.setContext({
            open: environment.get().mode !== ATRIA_VIEWPORT_MODES.COMPACT,
            initialized: true,
        }, { reason: 'shell-mount' });
    }

    function commandContext() {
        return Object.freeze({
            shell: api,
            domain: navigationAuthority.getRoute().domain,
            viewport: environment.get(),
        });
    }

    function updateDomainPresentation(route = navigationAuthority.getRoute()) {
        for (const [domainId, buttons] of navButtons.entries()) {
            const selected = domainId === route.domain;
            for (const button of buttons) {
                button.classList.toggle('is-selected', selected);
                button.setAttribute('aria-current', selected ? 'page' : 'false');
            }
        }

        const domain = ATRIA_PRIMARY_DOMAINS.find(item => item.id === route.domain);
        const labels = route.breadcrumb.length
            ? route.breadcrumb.map(value => translateLabel(translate, value))
            : [translateLabel(translate, domain?.label || route.domain)];
        breadcrumb.textContent = ['Atria', ...labels].join(' / ');
        contextTitle.textContent = labels.at(-1) || translateLabel(translate, domain?.label || route.domain);

        const playActive = route.domain === 'play';
        stage.hidden = !playActive;
        workspace.hidden = playActive;
        if (!playActive) {
            const label = translateLabel(translate, domain?.label || route.domain);
            workspace.replaceChildren(createAtriaStatePanel(documentRef, 'empty', {
                title: route.child?.label
                    ? `${label} / ${route.child.label}`
                    : `${label} Workspace`,
                message: 'R7D owns navigation only. First-class workspace controllers connect in later R7 phases.',
            }));
        }
    }

    function navigate(domainId, options = {}) {
        const route = navigationAuthority.navigate(domainId, options);
        return route.domain;
    }

    for (const domain of ATRIA_PRIMARY_DOMAINS) {
        const railButton = makeNavButton(documentRef, domain, translate);
        const bottomButton = makeNavButton(documentRef, domain, translate);
        railButton.addEventListener('click', () => navigate(domain.id, { reason: 'rail' }));
        bottomButton.addEventListener('click', () => navigate(domain.id, { reason: 'bottom-navigation' }));
        railItems.append(railButton);
        bottomNavigation.append(bottomButton);
        navButtons.set(domain.id, [railButton, bottomButton]);
    }

    function updateContextPresentation(
        contextState = navigationAuthority.getContext(),
        viewport = environment.get(),
    ) {
        const compact = viewport.mode === ATRIA_VIEWPORT_MODES.COMPACT;
        dock.dataset.atriaOpen = String(contextState.open);
        dockTitle.textContent = contextState.title;

        if (compact) {
            dock.hidden = true;
            if (contextState.open) {
                if (dockBody.parentNode !== sheetBody) {
                    sheetBody.replaceChildren();
                    sheetBody.append(dockBody);
                }
                sheet.setAttribute('aria-label', contextState.title || 'Context sheet');
                sheet.dataset.atriaSheetState = contextState.sheetState;
                sheet.hidden = false;
            } else {
                sheet.hidden = true;
                if (dockBody.parentNode !== dock) dock.append(dockBody);
            }
            return;
        }

        if (dockBody.parentNode !== dock) dock.append(dockBody);
        sheet.hidden = true;
        dock.hidden = !contextState.open;
    }

    function setDockOpen(value) {
        navigationAuthority.setContext(
            { open: Boolean(value) },
            { reason: 'context-toggle' },
        );
        return navigationAuthority.getContext().open;
    }

    dockClose.addEventListener('click', () => setDockOpen(false));

    function updateResponsiveChrome(state) {
        const compact = state.mode === ATRIA_VIEWPORT_MODES.COMPACT;
        rail.hidden = compact;
        bottomNavigation.hidden = !compact;
        commandSurface.dataset.atriaCommandPresentation = compact ? 'sheet' : 'palette';
        commandPanel.dataset.atriaPrimitive = compact ? 'CommandSheet' : 'CommandPalette';
        updateContextPresentation(navigationAuthority.getContext(), state);
    }

    environment.subscribe(updateResponsiveChrome);
    updateResponsiveChrome(environment.get());

    function renderCommands() {
        commandList.replaceChildren();
        const commands = registry.search(commandInput.value, commandContext());
        if (!commands.length) {
            commandList.append(createAtriaStatePanel(documentRef, 'empty', {
                title: 'No commands',
                message: 'Try a different search.',
            }));
            return;
        }

        for (const command of commands) {
            const button = documentRef.createElement('button');
            button.type = 'button';
            button.className = 'atria-command-result';
            button.dataset.atriaCommandId = command.id;
            button.setAttribute('role', 'option');

            const title = documentRef.createElement('span');
            title.className = 'atria-command-result__title';
            title.textContent = command.title;
            const subtitle = documentRef.createElement('span');
            subtitle.className = 'atria-command-result__subtitle';
            subtitle.textContent = commandSubtitle(command);
            button.append(title, subtitle);

            if (command.shortcut) {
                const shortcut = documentRef.createElement('kbd');
                shortcut.textContent = command.shortcut;
                button.append(shortcut);
            }

            button.addEventListener('click', async () => {
                closeCommand();
                try {
                    await registry.execute(command.id, commandContext());
                } catch (error) {
                    console.error('[atria-shell] Command execution failed', {
                        command: command.id,
                        error,
                    });
                }
            });
            commandList.append(button);
        }
    }

    function openCommand() {
        if (commandOpen) return false;
        commandOpen = true;
        commandSurface.hidden = false;
        renderCommands();
        queueMicrotask(() => commandInput.focus());
        return true;
    }

    function closeCommand() {
        if (!commandOpen) return false;
        commandOpen = false;
        commandSurface.hidden = true;
        commandInput.value = '';
        return true;
    }

    commandInput.addEventListener('input', renderCommands);
    commandInput.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeCommand();
            return;
        }
        if (event.key !== 'Enter') return;
        const first = commandList.querySelector('[data-atria-command-id]');
        if (!first) return;
        event.preventDefault();
        first.click();
    });
    commandScrim.addEventListener('click', closeCommand);

    function closeSheet() {
        if (!navigationAuthority.getContext().open) return false;
        navigationAuthority.closeContext({ reason: 'context-sheet-close' });
        return true;
    }

    sheetScrim.addEventListener('click', closeSheet);

    function openSheet(content, {
        state = 'half',
        ariaLabel = 'Context sheet',
    } = {}) {
        setNodeContent(dockBody, content);
        navigationAuthority.setContext({
            title: String(ariaLabel || 'Context sheet'),
            open: true,
            sheetState: ['peek', 'half', 'full'].includes(state) ? state : 'half',
        }, { reason: 'context-sheet-open' });
        return sheet;
    }

    function dismissContextForBack() {
        const compact = environment.get().mode === ATRIA_VIEWPORT_MODES.COMPACT;
        if (!compact || sheet.hidden || !navigationAuthority.getContext().open) return false;
        return closeSheet();
    }

    function dismissCommandForBack() {
        return closeCommand();
    }

    function dismissChildRouteForBack(kind) {
        const route = navigationAuthority.getRoute();
        if (!route.child || route.child.kind !== kind) return false;
        if (navigationAuthority.canGoBackWithinAtria()) {
            return navigationAuthority.back();
        }
        navigationAuthority.clearChild({
            history: 'replace',
            reason: `${kind}-back`,
        });
        return true;
    }

    function hasEscapePriorityLayer() {
        const route = navigationAuthority.getRoute();
        return (
            (
                environment.get().mode === ATRIA_VIEWPORT_MODES.COMPACT
                && !sheet.hidden
                && navigationAuthority.getContext().open
            )
            || commandOpen
            || route.child?.kind === 'detail'
        );
    }

    function onKeyDown(event) {
        if (isCommandShortcut(event)) {
            event.preventDefault();
            if (commandOpen) closeCommand();
            else openCommand();
            return;
        }

        if (event.key !== 'Escape') return;

        const consumeEscape = () => {
            event.preventDefault();
            event.stopImmediatePropagation();
        };

        if (dismissContextForBack()) {
            consumeEscape();
            return;
        }
        if (dismissCommandForBack()) {
            consumeEscape();
            return;
        }
        if (dismissChildRouteForBack('detail')) {
            consumeEscape();
        }
    }

    documentRef.addEventListener('keydown', onKeyDown, true);

    const commandUtility = makeUtilityButton(
        documentRef,
        ATRIA_GLOBAL_UTILITIES.find(item => item.id === 'command'),
        translate,
    );
    commandUtility.addEventListener('click', openCommand);
    utilitiesContainer.append(commandUtility);

    for (const utility of ATRIA_GLOBAL_UTILITIES.filter(item => item.id !== 'command')) {
        const button = makeUtilityButton(documentRef, utility, translate);
        const handler = utilities[utility.id];
        if (typeof handler === 'function') {
            button.addEventListener('click', () => handler(api));
        } else {
            button.disabled = true;
            button.title = `${translateLabel(translate, utility.label)} — available in a later R7 phase`;
        }
        utilitiesContainer.append(button);
    }

    for (const domain of ATRIA_PRIMARY_DOMAINS) {
        commandDisposers.push(registry.register({
            id: `navigate.${domain.id}`,
            title: `Go to ${domain.label}`,
            description: `Open the ${domain.label} domain`,
            group: 'Navigation',
            keywords: [domain.label, domain.id, 'navigate', 'open'],
            run: () => navigate(domain.id, { reason: 'command-navigation' }),
        }));
    }

    const unsubscribeRegistry = registry.subscribe(() => {
        if (commandOpen) renderCommands();
    });

    const unsubscribeNavigation = navigationAuthority.subscribe((state) => {
        const routeSignature = JSON.stringify(state.route);
        if (routeSignature !== lastRouteSignature) {
            lastRouteSignature = routeSignature;
            updateDomainPresentation(state.route);
        }
        updateContextPresentation(state.context, environment.get());
    });

    const initialNavigationState = navigationAuthority.getState();
    lastRouteSignature = JSON.stringify(initialNavigationState.route);
    updateDomainPresentation(initialNavigationState.route);
    updateContextPresentation(initialNavigationState.context, environment.get());

    const api = Object.freeze({
        root,
        registry,
        navigation: navigationAuthority,
        environment,
        slots: Object.freeze({
            stage,
            workspace,
            dock: dockBody,
            contextBar: contextActions,
            transient: transientLayer,
            recovery,
        }),
        navigate,
        navigateChild: (child, options) => navigationAuthority.navigateChild(child, options),
        getActiveDomain: () => navigationAuthority.getRoute().domain,
        getRoute: () => navigationAuthority.getRoute(),
        setBreadcrumb(parts) {
            navigationAuthority.setBreadcrumb(
                Array.isArray(parts)
                    ? parts
                    : [String(parts || '').trim()].filter(Boolean),
            );
        },
        setRuntimeStatus(label, tone = 'neutral', title = '') {
            runtimeChip.textContent = String(label);
            runtimeChip.dataset.tone = tone;
            runtimeChip.title = String(title);
        },
        setDockContent(content, {
            title = 'Context',
            open = true,
            state = 'half',
        } = {}) {
            setNodeContent(dockBody, content);
            navigationAuthority.setContext({
                title: String(title || 'Context'),
                open: Boolean(open),
                sheetState: ['peek', 'half', 'full'].includes(state) ? state : 'half',
            }, { reason: 'context-content' });
            return dockBody;
        },
        setContextContent(content, options = {}) {
            return api.setDockContent(content, options);
        },
        setDockOpen,
        isDockOpen: () => navigationAuthority.getContext().open,
        openSheet,
        closeSheet,
        isContextSheetOpen: () => (
            environment.get().mode === ATRIA_VIEWPORT_MODES.COMPACT
            && navigationAuthority.getContext().open
            && !sheet.hidden
        ),
        openCommand,
        closeCommand,
        isCommandOpen: () => commandOpen,
        dismissContextForBack,
        dismissCommandForBack,
        dismissDetailRouteForBack: () => dismissChildRouteForBack('detail'),
        dismissWorkspaceChildRouteForBack: () => dismissChildRouteForBack('workspace'),
        navigateBack: () => navigationAuthority.back(),
        hasEscapePriorityLayer,
        destroy() {
            if (disposed) return;
            disposed = true;
            closeCommand();
            closeSheet();
            documentRef.removeEventListener('keydown', onKeyDown, true);
            unsubscribeRegistry();
            unsubscribeNavigation();
            for (const dispose of commandDisposers.splice(0)) dispose();
            environment.dispose();
            if (ownsNavigation) navigationAuthority.dispose();
            root.remove();
        },
    });

    return api;
}
