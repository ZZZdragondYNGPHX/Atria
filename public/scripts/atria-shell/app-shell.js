import {
    ATRIA_COMMAND_SHORTCUT,
    ATRIA_GLOBAL_UTILITIES,
    ATRIA_PRIMARY_DOMAINS,
    ATRIA_VIEWPORT_MODES,
} from './constants.js';
import { createAtriaShellEnvironment } from './environment.js';
import { createAtriaIcon } from './icons.js';
import { createAtriaNavigationAuthority } from './navigation-authority.js';
import {
    createAtriaPrimitive,
    createAtriaStatePanel,
    createAtriaStatusChip,
} from './primitives.js';
import { formatShellText, translateShellText } from './localization.js';

const SIDEBAR_UTILITIES = Object.freeze(['learning', 'plugins', 'diagnostics', 'settings']);
const MENU_UTILITIES = Object.freeze(['learning', 'settings', 'plugins', 'diagnostics', 'account']);
const SHEET_STATES = Object.freeze(['peek', 'half', 'full']);

const COMMAND_ICON_RULES = Object.freeze([
    [/^navigate\.play$/, 'play'],
    [/^navigate\.library$/, 'library'],
    [/^navigate\.build$/, 'build'],
    [/^navigate\.agents$/, 'agents'],
    [/^navigate\.runtime$/, 'runtime'],
    [/^workspace\.(agents|orchestration|agent-run|memory|agent-diagnostics)$/, 'agents'],
    [/^workspace\.build$/, 'build'],
    [/^workspace\.works$/, 'grid'],
    [/^workspace\.(worlds|world-info)$/, 'globe'],
    [/^workspace\.knowledge$/, 'book'],
    [/^workspace\.skills$/, 'wand'],
    [/^workspace\.runtime-overview$/, 'route'],
    [/^workspace\.connections$/, 'link'],
    [/^workspace\.generation-profiles$/, 'gauge'],
    [/^workspace\.prompt-programs$/, 'braces'],
    [/^workspace\.prompt-modules$/, 'stack'],
    [/^workspace\.diagnostics$/, 'diagnostics'],
    [/^workspace\.plugins$/, 'plugins'],
    [/^workspace\.settings$/, 'settings'],
    [/^workspace\.account$/, 'account'],
    [/^resource\.work\./, 'play'],
    [/^resource\.world\./, 'globe'],
    [/^resource\.knowledge\./, 'book'],
    [/^resource\.project\./, 'build'],
    [/^resource\.prompt\./, 'braces'],
    [/^runtime\.routes\./, 'route'],
    [/^runtime\.models\./, 'cube'],
    [/^runtime\.connections\./, 'link'],
]);

function translateLabel(translate, value) {
    return translateShellText(value, translate);
}

function element(documentRef, tag, className = '', text = null) {
    const node = documentRef.createElement(tag);
    if (className) node.className = className;
    if (text !== null && text !== undefined) node.textContent = String(text);
    return node;
}

function buttonElement(documentRef, className, label = '') {
    const button = element(documentRef, 'button', className);
    button.type = 'button';
    if (label) {
        button.setAttribute('aria-label', label);
        button.title = label;
    }
    return button;
}

function makeNavButton(documentRef, domain, translate, variant) {
    const label = translateLabel(translate, domain.label);
    const button = buttonElement(documentRef, `atria-shell-nav-button atria-shell-nav-button--${variant}`);
    button.dataset.atriaDomain = domain.id;
    button.setAttribute('aria-label', label);
    if (variant === 'rail') button.title = label;
    const icon = element(documentRef, 'span', 'atria-shell-nav-icon');
    icon.append(createAtriaIcon(documentRef, domain.glyph || domain.id, { size: variant === 'tab' ? 24 : 20 }));
    const text = element(documentRef, 'span', 'atria-shell-nav-label', label);
    button.append(icon, text);
    return button;
}

function makeUtilityButton(documentRef, utility, translate) {
    const label = translateLabel(translate, utility.label);
    const button = buttonElement(documentRef, 'atria-shell-utility-button', label);
    button.dataset.atriaUtility = utility.id;
    const icon = element(documentRef, 'span', 'atria-shell-nav-icon');
    icon.append(createAtriaIcon(documentRef, utility.glyph || utility.id, { size: 20 }));
    button.append(icon, element(documentRef, 'span', 'atria-shell-utility-label', label));
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

function isApplePlatform(windowRef) {
    const platform = String(
        windowRef?.navigator?.userAgentData?.platform
        || windowRef?.navigator?.platform
        || '',
    );
    return /mac|iphone|ipad|ipod/i.test(platform);
}

function commandIconName(command) {
    const id = String(command?.id || '');
    for (const [pattern, icon] of COMMAND_ICON_RULES) {
        if (pattern.test(id)) return icon;
    }
    return 'chevron-right';
}

function hasMeaningfulContent(node) {
    for (const child of node.childNodes) {
        if (child.nodeType === 1) return true;
        if (child.nodeType === 3 && String(child.textContent || '').trim()) return true;
    }
    return false;
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

    const tl = value => translateLabel(translate, value);
    const shortcutLabel = isApplePlatform(windowRef) ? '⌘K' : 'Ctrl K';

    const root = createAtriaPrimitive(documentRef, 'AppShell', {
        tag: 'div',
        role: 'application',
        ariaLabel: 'Atria',
    });
    root.id = 'atria-app-shell';
    root.dataset.atriaShellMounted = 'true';

    // Sidebar (Expanded) / icon rail (Medium) — one element, two presentations.
    const rail = createAtriaPrimitive(documentRef, 'NavigationRail', {
        tag: 'nav',
        className: 'atria-sidebar',
        ariaLabel: tl('Primary navigation'),
    });
    const brand = element(documentRef, 'div', 'atria-sidebar__brand atria-shell-brand');
    const brandMark = element(documentRef, 'span', 'atria-brand-mark');
    brandMark.setAttribute('aria-hidden', 'true');
    const brandImage = element(documentRef, 'img', 'atria-brand-mark__image');
    brandImage.src = 'img/logo.png';
    brandImage.alt = '';
    brandImage.decoding = 'async';
    brandMark.append(brandImage);
    brand.append(brandMark, element(documentRef, 'span', 'atria-brand-wordmark', 'Atria'));
    const railItems = element(documentRef, 'div', 'atria-sidebar__items atria-shell-nav-items');
    const railFooter = element(documentRef, 'div', 'atria-sidebar__footer');
    rail.append(brand, railItems, railFooter);

    // Toolbar — one bar for location, context actions, search and inspector.
    const globalBar = createAtriaPrimitive(documentRef, 'GlobalBar', {
        tag: 'header',
        className: 'atria-toolbar',
        ariaLabel: tl('Global controls'),
    });
    const toolbarLeading = element(documentRef, 'div', 'atria-toolbar__leading');
    const backButton = buttonElement(documentRef, 'atria-toolbar__back', tl('Back'));
    backButton.hidden = true;
    const backLabel = element(documentRef, 'span', 'atria-toolbar__back-label');
    backButton.append(createAtriaIcon(documentRef, 'chevron-left', { size: 20 }), backLabel);
    const titleGroup = element(documentRef, 'div', 'atria-toolbar__titles');
    const title = element(documentRef, 'h1', 'atria-toolbar__title', tl('Play'));
    title.id = 'atria-shell-title';
    titleGroup.append(title);
    toolbarLeading.append(backButton, titleGroup);

    const contextBar = createAtriaPrimitive(documentRef, 'ContextBar', {
        tag: 'div',
        role: 'toolbar',
        className: 'atria-toolbar__trailing',
        ariaLabel: tl('Context controls'),
    });
    const contextActions = element(documentRef, 'div', 'atria-context-bar__actions');
    const runtimeChip = createAtriaStatusChip(documentRef, { label: '', tone: 'neutral' });
    runtimeChip.classList.add('atria-toolbar__status');
    runtimeChip.hidden = true;
    const commandUtility = ATRIA_GLOBAL_UTILITIES.find(item => item.id === 'command');
    const searchButton = buttonElement(documentRef, 'atria-toolbar-search', tl('Search'));
    searchButton.dataset.atriaUtility = commandUtility.id;
    searchButton.title = `${tl('Search')} (${shortcutLabel})`;
    const searchKey = element(documentRef, 'kbd', 'atria-toolbar-search__shortcut', shortcutLabel);
    searchKey.setAttribute('aria-hidden', 'true');
    searchButton.append(
        createAtriaIcon(documentRef, 'search', { size: 17 }),
        element(documentRef, 'span', 'atria-toolbar-search__label', tl('Search')),
        searchKey,
    );
    const menuButton = buttonElement(documentRef, 'atria-icon-button atria-toolbar__menu', tl('Account & Settings'));
    menuButton.setAttribute('aria-haspopup', 'menu');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.append(createAtriaIcon(documentRef, 'account', { size: 22 }));
    const inspectorToggle = buttonElement(documentRef, 'atria-icon-button atria-toolbar__inspector', tl('Show inspector'));
    inspectorToggle.setAttribute('aria-pressed', 'false');
    inspectorToggle.setAttribute('aria-controls', 'atria-context-dock');
    inspectorToggle.hidden = true;
    inspectorToggle.append(createAtriaIcon(documentRef, 'inspector', { size: 20 }));
    contextBar.append(contextActions, runtimeChip, searchButton, inspectorToggle, menuButton);
    globalBar.append(toolbarLeading, contextBar);

    // Focus area: Stage (Play) and Workspace (every other surface).
    const focus = createAtriaPrimitive(documentRef, 'FocusArea', {
        tag: 'main',
        ariaLabel: tl('Atria focus area'),
    });
    const stage = createAtriaPrimitive(documentRef, 'Stage', {
        tag: 'section',
        ariaLabel: tl('Play stage'),
    });
    stage.id = 'atria-stage';
    stage.append(createAtriaStatePanel(documentRef, 'empty', {
        title: tl('Play'),
        message: tl('The Native Conversation Host mounts here when Play owns the Stage.'),
    }));
    const workspace = createAtriaPrimitive(documentRef, 'Workspace', {
        tag: 'section',
        ariaLabel: tl('Workspace'),
    });
    workspace.id = 'atria-workspace';
    workspace.hidden = true;
    const focusBody = element(documentRef, 'div', 'atria-focus-area__body');
    focusBody.append(stage, workspace);
    focus.append(focusBody);

    // Inspector (Dock primitive). Closed by default; content decides visibility
    // of the toolbar toggle.
    const dock = createAtriaPrimitive(documentRef, 'Dock', {
        tag: 'aside',
        className: 'atria-inspector',
        ariaLabel: tl('Inspector'),
    });
    dock.id = 'atria-context-dock';
    const dockHeader = element(documentRef, 'div', 'atria-dock__header');
    const dockTitle = element(documentRef, 'strong', 'atria-dock__title', tl('Context'));
    const dockClose = buttonElement(documentRef, 'atria-icon-button atria-dock__close', tl('Close inspector'));
    dockClose.append(createAtriaIcon(documentRef, 'close', { size: 18 }));
    dockHeader.append(dockTitle, dockClose);
    const dockBody = element(documentRef, 'div', 'atria-dock__body');
    dock.append(dockHeader, dockBody);

    const bottomNavigation = createAtriaPrimitive(documentRef, 'BottomNavigation', {
        tag: 'nav',
        className: 'atria-tab-bar',
        ariaLabel: tl('Primary navigation'),
    });

    const transientLayer = element(documentRef, 'div', 'atria-transient-layer');
    transientLayer.dataset.atriaShellLayer = 'transient';

    const recovery = createAtriaPrimitive(documentRef, 'HostRecovery', {
        tag: 'div',
        ariaLabel: tl('Host recovery'),
    });
    recovery.dataset.atriaShellLayer = 'recovery';

    // Compact context sheet.
    const sheet = createAtriaPrimitive(documentRef, 'Sheet', {
        tag: 'section',
        role: 'dialog',
        ariaLabel: tl('Context sheet'),
    });
    sheet.hidden = true;
    sheet.id = 'atria-context-sheet';
    sheet.setAttribute('aria-modal', 'true');
    const sheetScrim = buttonElement(documentRef, 'atria-sheet-scrim', tl('Close sheet'));
    sheetScrim.tabIndex = -1;
    const sheetPanel = element(documentRef, 'div', 'atria-sheet-panel');
    const sheetGrip = element(documentRef, 'div', 'atria-sheet-grip');
    const sheetHandle = element(documentRef, 'div', 'atria-sheet-handle');
    sheetHandle.setAttribute('aria-hidden', 'true');
    sheetGrip.append(sheetHandle);
    const sheetHeader = element(documentRef, 'div', 'atria-sheet-header');
    const sheetTitle = element(documentRef, 'strong', 'atria-sheet-title', tl('Context'));
    const sheetClose = buttonElement(documentRef, 'atria-icon-button atria-sheet-close', tl('Close sheet'));
    sheetClose.append(createAtriaIcon(documentRef, 'close', { size: 18 }));
    sheetHeader.append(sheetTitle, sheetClose);
    const sheetBody = element(documentRef, 'div', 'atria-sheet-body');
    sheetPanel.append(sheetGrip, sheetHeader, sheetBody);
    sheet.append(sheetScrim, sheetPanel);
    transientLayer.append(sheet);

    // Search / Command surface.
    const commandSurface = element(documentRef, 'section', 'atria-command-surface');
    commandSurface.hidden = true;
    commandSurface.setAttribute('role', 'dialog');
    commandSurface.setAttribute('aria-modal', 'true');
    commandSurface.setAttribute('aria-label', tl('Command'));
    const commandScrim = buttonElement(documentRef, 'atria-command-scrim', tl('Close command'));
    commandScrim.tabIndex = -1;
    const commandPanel = element(documentRef, 'div', 'atria-command-panel');
    const commandField = element(documentRef, 'div', 'atria-command-field');
    const commandInput = element(documentRef, 'input', 'atria-command-input');
    commandInput.type = 'search';
    commandInput.placeholder = tl('Search Atria');
    commandInput.autocomplete = 'off';
    commandInput.spellcheck = false;
    commandInput.setAttribute('aria-label', tl('Search commands'));
    commandInput.setAttribute('role', 'combobox');
    commandInput.setAttribute('aria-autocomplete', 'list');
    commandInput.setAttribute('aria-expanded', 'true');
    commandInput.setAttribute('aria-controls', 'atria-command-results');
    const commandCancel = buttonElement(documentRef, 'atria-command-cancel');
    commandCancel.textContent = tl('Cancel');
    commandField.append(createAtriaIcon(documentRef, 'search', { size: 20, className: 'atria-command-field__icon' }), commandInput, commandCancel);
    const commandList = element(documentRef, 'div', 'atria-command-results');
    commandList.id = 'atria-command-results';
    commandList.setAttribute('role', 'listbox');
    commandList.setAttribute('aria-label', tl('Results'));
    const commandFooter = element(documentRef, 'div', 'atria-command-footer');
    commandFooter.setAttribute('aria-hidden', 'true');
    for (const [keys, label] of [['↑ ↓', 'Navigate'], ['↵', 'Open'], ['esc', 'Close']]) {
        const hint = element(documentRef, 'span', 'atria-command-footer__hint');
        hint.append(element(documentRef, 'kbd', '', keys), element(documentRef, 'span', '', tl(label)));
        commandFooter.append(hint);
    }
    const searchStatus = element(documentRef, 'div', 'atria-command-search-status');
    searchStatus.setAttribute('role', 'status');
    commandPanel.append(commandField, searchStatus, commandList, commandFooter);
    commandSurface.append(commandScrim, commandPanel);
    transientLayer.append(commandSurface);

    // Compact account & settings menu.
    const menuLayer = element(documentRef, 'div', 'atria-shell-menu-layer');
    menuLayer.hidden = true;
    const menuScrim = buttonElement(documentRef, 'atria-shell-menu-scrim', tl('Close menu'));
    menuScrim.tabIndex = -1;
    const menu = element(documentRef, 'div', 'atria-shell-menu');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', tl('Account & Settings'));
    menuLayer.append(menuScrim, menu);
    transientLayer.append(menuLayer);

    root.append(rail, globalBar, focus, dock, bottomNavigation, transientLayer, recovery);
    documentRef.body.append(root);

    const environment = createAtriaShellEnvironment(root, { window: windowRef });
    const ownsNavigation = !navigation;
    const navigationAuthority = navigation || createAtriaNavigationAuthority({
        window: windowRef,
        initialDomain,
    });
    const navButtons = new Map();
    const utilityButtons = new Map();
    let commandOpen = false;
    let commandDisposers = [];
    let commandResults = [];
    let activeCommandIndex = 0;
    let commandReturnFocus = null;
    let menuOpen = false;
    let disposed = false;
    let lastRouteSignature = '';
    let sheetDrag = null;

    if (!navigationAuthority.getContext().initialized) {
        navigationAuthority.setContext({
            open: false,
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

    function isCompact(viewport = environment.get()) {
        return viewport.mode === ATRIA_VIEWPORT_MODES.COMPACT;
    }

    function activeUtilityId(route = navigationAuthority.getRoute()) {
        const childId = String(route.child?.id || '');
        return childId.startsWith('utility.') ? childId.slice('utility.'.length) : null;
    }

    function updateDomainPresentation(route = navigationAuthority.getRoute()) {
        const utilityId = activeUtilityId(route);
        for (const [domainId, buttons] of navButtons.entries()) {
            // Global utilities are their own routed surfaces. Do not visually
            // leave the caller's primary domain selected while a searched
            // utility is being displayed.
            const selected = !utilityId && domainId === route.domain;
            for (const button of buttons) {
                button.classList.toggle('is-selected', selected);
                button.setAttribute('aria-current', selected ? 'page' : 'false');
            }
        }
        for (const [id, button] of utilityButtons.entries()) {
            const selected = utilityId === id;
            button.classList.toggle('is-selected', selected);
            button.setAttribute('aria-current', selected ? 'page' : 'false');
        }

        const domain = ATRIA_PRIMARY_DOMAINS.find(item => item.id === route.domain);
        const domainLabel = tl(domain?.label || route.domain);
        const utility = ATRIA_GLOBAL_UTILITIES.find(item => item.id === utilityId);
        const childLabel = route.child
            ? route.child.kind === 'detail' ? String(route.child.label || route.child.id) : tl(route.child.label || route.breadcrumb.at(-1) || route.child.id)
            : '';
        let titleText = domainLabel;
        let back = null;
        if (utility) {
            titleText = tl(utility.label);
            back = { label: '', compactOnly: true };
        } else if (route.child?.kind === 'detail') {
            titleText = childLabel;
            back = { label: domainLabel, compactOnly: false };
        } else if (route.domain === 'agents' && route.child) {
            titleText = childLabel;
            back = { label: domainLabel, compactOnly: false };
        }
        title.textContent = titleText;
        backLabel.textContent = back?.label || '';
        backButton.dataset.atriaBackScope = back?.compactOnly ? 'compact' : 'all';
        backButton.hidden = !back || (back.compactOnly && !isCompact());
        const backName = back?.label
            ? formatShellText('Back to ${0}', [back.label], translate, 'atria.shell.backTo')
            : tl('Back');
        backButton.setAttribute('aria-label', backName);
        backButton.title = backName;

        root.dataset.atriaDomain = route.domain;
        root.dataset.atriaRouteKind = utility ? 'utility' : route.child?.kind || 'root';

        const playActive = route.domain === 'play' && !utilityId;
        stage.hidden = !playActive;
        workspace.hidden = playActive;
    }

    function navigate(domainId, options = {}) {
        closeMenu();
        const route = navigationAuthority.navigate(domainId, options);
        return route.domain;
    }

    function navigateUp() {
        const route = navigationAuthority.getRoute();
        if (!route.child) return false;
        if (navigationAuthority.canGoBackWithinAtria()) return navigationAuthority.back();
        navigationAuthority.clearChild({ history: 'replace', reason: 'toolbar-back' });
        return true;
    }

    backButton.addEventListener('click', navigateUp);

    for (const domain of ATRIA_PRIMARY_DOMAINS) {
        const railButton = makeNavButton(documentRef, domain, translate, 'rail');
        const bottomButton = makeNavButton(documentRef, domain, translate, 'tab');
        railButton.addEventListener('click', () => navigate(domain.id, { reason: 'rail' }));
        bottomButton.addEventListener('click', () => navigate(domain.id, { reason: 'bottom-navigation' }));
        railItems.append(railButton);
        bottomNavigation.append(bottomButton);
        navButtons.set(domain.id, [railButton, bottomButton]);
    }

    function updateInspectorToggle(contextState = navigationAuthority.getContext()) {
        const available = hasMeaningfulContent(dockBody);
        inspectorToggle.hidden = !available;
        const open = Boolean(contextState.open);
        inspectorToggle.setAttribute('aria-pressed', String(open));
        inspectorToggle.classList.toggle('is-selected', open);
        const label = open ? tl('Hide inspector') : tl('Show inspector');
        inspectorToggle.setAttribute('aria-label', label);
        inspectorToggle.title = label;
    }

    function updateContextPresentation(
        contextState = navigationAuthority.getContext(),
        viewport = environment.get(),
    ) {
        const compact = isCompact(viewport);
        const contextTitle = tl(contextState.title);
        dock.dataset.atriaOpen = String(contextState.open);
        dockTitle.textContent = contextTitle;
        sheetTitle.textContent = contextTitle;
        updateInspectorToggle(contextState);

        if (compact) {
            dock.hidden = true;
            if (contextState.open) {
                if (dockBody.parentNode !== sheetBody) {
                    sheetBody.replaceChildren();
                    sheetBody.append(dockBody);
                }
                sheet.setAttribute('aria-label', tl(contextState.title || 'Context sheet'));
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
    inspectorToggle.addEventListener('click', () => setDockOpen(!navigationAuthority.getContext().open));

    const dockObserverType = windowRef.MutationObserver || globalThis.MutationObserver;
    const dockObserver = typeof dockObserverType === 'function'
        ? new dockObserverType(() => updateInspectorToggle())
        : null;
    dockObserver?.observe(dockBody, { childList: true, characterData: true, subtree: false });

    // Large titles: while a page's own large title (data-atria-large-title) is
    // on screen the toolbar title steps back; it returns once the page title
    // scrolls out of view. Only added subtrees are inspected, so streaming
    // Conversation updates stay cheap.
    const largeTitles = new Set();
    const visibleLargeTitles = new Set();
    const intersectionObserverType = windowRef.IntersectionObserver || globalThis.IntersectionObserver;
    const largeTitleObserver = typeof intersectionObserverType === 'function'
        ? new intersectionObserverType(entries => {
            for (const entry of entries) {
                if (entry.isIntersecting) visibleLargeTitles.add(entry.target);
                else visibleLargeTitles.delete(entry.target);
            }
            updateLargeTitleState();
        })
        : null;

    function updateLargeTitleState() {
        if (visibleLargeTitles.size) root.dataset.atriaLargeTitle = 'visible';
        else delete root.dataset.atriaLargeTitle;
    }

    function trackLargeTitle(node) {
        if (largeTitles.has(node)) return;
        largeTitles.add(node);
        largeTitleObserver.observe(node);
    }

    function onFocusMutations(records) {
        if (disposed) return;
        let removed = false;
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.matches('[data-atria-large-title]')) trackLargeTitle(node);
                for (const title of node.querySelectorAll('[data-atria-large-title]')) trackLargeTitle(title);
            }
            if (record.removedNodes.length) removed = true;
        }
        if (removed) {
            for (const node of largeTitles) {
                if (node.isConnected) continue;
                largeTitleObserver.unobserve(node);
                largeTitles.delete(node);
                visibleLargeTitles.delete(node);
            }
        }
        updateLargeTitleState();
    }

    const focusObserver = largeTitleObserver && typeof dockObserverType === 'function'
        ? new dockObserverType(onFocusMutations)
        : null;
    focusObserver?.observe(focus, { childList: true, subtree: true });

    function updateResponsiveChrome(state) {
        const compact = isCompact(state);
        rail.hidden = compact;
        bottomNavigation.hidden = !compact;
        menuButton.hidden = !compact;
        if (!compact) closeMenu();
        commandSurface.dataset.atriaCommandPresentation = compact ? 'sheet' : 'palette';
        commandPanel.dataset.atriaPrimitive = compact ? 'CommandSheet' : 'CommandPalette';
        if (backButton.dataset.atriaBackScope === 'compact') {
            backButton.hidden = !compact;
        }
        updateContextPresentation(navigationAuthority.getContext(), state);
    }

    environment.subscribe(updateResponsiveChrome);
    updateResponsiveChrome(environment.get());

    function setActiveCommand(index, { scroll = true } = {}) {
        if (!commandResults.length) {
            activeCommandIndex = 0;
            commandInput.removeAttribute('aria-activedescendant');
            return;
        }
        const count = commandResults.length;
        activeCommandIndex = ((index % count) + count) % count;
        commandResults.forEach((button, position) => {
            const active = position === activeCommandIndex;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', String(active));
        });
        const active = commandResults[activeCommandIndex];
        commandInput.setAttribute('aria-activedescendant', active.id);
        if (scroll) active.scrollIntoView?.({ block: 'nearest' });
    }

    function renderCommands() {
        const coverageOpen = Boolean(searchStatus.querySelector('details')?.open);
        searchStatus.replaceChildren();
        const status = registry.getSearchStatus?.();
        if (status?.loading) searchStatus.append(element(documentRef, 'span', '', tl('Refreshing search…')));
        if (status?.failures?.length) {
            searchStatus.append(element(documentRef, 'span', '', tl('Some results unavailable')));
            const retry = buttonElement(documentRef, 'atria-command-cancel', tl('Retry'));
            retry.textContent = tl('Retry');
            retry.addEventListener('click', () => { void status.retry(); });
            searchStatus.append(retry);
        }
        if (status?.domains) {
            const details = element(documentRef, 'details');
            details.open = coverageOpen;
            details.append(element(documentRef, 'summary', '', tl('Search coverage')));
            details.append(element(documentRef, 'p', '', status.domains.map(tl).join(' · ')));
            for (const failure of status.failures || []) details.append(element(documentRef, 'p', '', [tl(failure.domain), failure.owner, failure.message].filter(Boolean).join(' · ')));
            searchStatus.append(details);
        }
        commandList.replaceChildren();
        commandResults = [];
        const commands = registry.search(commandInput.value, commandContext());
        if (!commands.length) {
            const empty = createAtriaStatePanel(documentRef, 'empty', {
                title: tl('No results'),
                message: tl('Try a different search.'),
            });
            empty.classList.add('atria-command-empty');
            commandList.append(empty);
            setActiveCommand(0);
            return;
        }

        // Group in order of first appearance so the top hit stays first.
        const groups = new Map();
        for (const command of commands) {
            const group = String(command.group || 'General');
            if (!groups.has(group)) groups.set(group, []);
            groups.get(group).push(command);
        }

        for (const [group, items] of groups) {
            const section = element(documentRef, 'div', 'atria-command-group');
            section.setAttribute('role', 'group');
            const heading = element(documentRef, 'div', 'atria-command-group__title', tl(group));
            heading.id = `atria-command-group-${groups.size}-${commandResults.length}`;
            section.setAttribute('aria-labelledby', heading.id);
            section.append(heading);

            for (const command of items) {
                const index = commandResults.length;
                const button = element(documentRef, 'button', 'atria-command-result');
                button.type = 'button';
                button.tabIndex = -1;
                button.id = `atria-command-option-${index}`;
                button.dataset.atriaCommandId = command.id;
                button.setAttribute('role', 'option');
                button.setAttribute('aria-selected', 'false');

                const icon = element(documentRef, 'span', 'atria-command-result__icon');
                icon.append(createAtriaIcon(documentRef, commandIconName(command), { size: 18 }));
                const text = element(documentRef, 'span', 'atria-command-result__text');
                text.append(element(documentRef, 'span', 'atria-command-result__title', command.literalTitle ? command.title : tl(command.title)));
                const description = command.description ? command.literalDescription ? command.description : tl(command.description) : '';
                if (description) {
                    text.append(element(documentRef, 'span', 'atria-command-result__subtitle', description));
                }
                button.append(icon, text);

                if (command.shortcut) {
                    button.append(element(documentRef, 'kbd', 'atria-command-result__shortcut', command.shortcut));
                }

                button.addEventListener('pointermove', () => {
                    if (activeCommandIndex !== index) setActiveCommand(index, { scroll: false });
                });
                button.addEventListener('click', async () => {
                    closeCommand({ restoreFocus: false });
                    try {
                        await registry.execute(command.id, commandContext());
                    } catch (error) {
                        console.error('[atria-shell] Command execution failed', {
                            command: command.id,
                            error,
                        });
                    }
                });
                section.append(button);
                commandResults.push(button);
            }
            commandList.append(section);
        }
        setActiveCommand(Math.min(activeCommandIndex, commandResults.length - 1), { scroll: false });
    }

    function openCommand() {
        if (commandOpen) return false;
        closeMenu();
        commandOpen = true;
        commandReturnFocus = documentRef.activeElement;
        commandSurface.hidden = false;
        activeCommandIndex = 0;
        documentRef.dispatchEvent(new windowRef.CustomEvent('atria-command-open'));
        renderCommands();
        queueMicrotask(() => commandInput.focus());
        return true;
    }

    function closeCommand({ restoreFocus = true } = {}) {
        if (!commandOpen) return false;
        commandOpen = false;
        commandSurface.hidden = true;
        commandInput.value = '';
        commandInput.removeAttribute('aria-activedescendant');
        const target = commandReturnFocus;
        commandReturnFocus = null;
        if (restoreFocus && target?.isConnected && typeof target.focus === 'function') {
            try {
                target.focus({ preventScroll: true });
            } catch {
                // Focus restoration is best effort.
            }
        }
        return true;
    }

    commandInput.addEventListener('input', () => {
        activeCommandIndex = 0;
        renderCommands();
    });
    commandInput.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeCommand();
            return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveCommand(activeCommandIndex + (event.key === 'ArrowDown' ? 1 : -1));
            return;
        }
        if (event.key !== 'Enter') return;
        const target = commandResults[activeCommandIndex] || commandList.querySelector('[data-atria-command-id]');
        if (!target) return;
        event.preventDefault();
        target.click();
    });
    commandPanel.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const focusable = [commandInput, commandCancel].filter(node => node.offsetParent !== null || node === commandInput);
        const index = focusable.indexOf(documentRef.activeElement);
        event.preventDefault();
        const next = focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length] || commandInput;
        next.focus();
    });
    commandScrim.addEventListener('click', () => closeCommand());
    commandCancel.addEventListener('click', () => closeCommand());
    searchButton.addEventListener('click', () => openCommand());

    // Compact account & settings menu.
    const menuItems = [];
    function openMenu() {
        if (menuOpen) return false;
        menuOpen = true;
        menuLayer.hidden = false;
        menuButton.setAttribute('aria-expanded', 'true');
        queueMicrotask(() => menuItems[0]?.focus());
        return true;
    }

    function closeMenu({ restoreFocus = false } = {}) {
        if (!menuOpen) return false;
        menuOpen = false;
        menuLayer.hidden = true;
        menuButton.setAttribute('aria-expanded', 'false');
        if (restoreFocus) menuButton.focus?.();
        return true;
    }

    menuButton.addEventListener('click', () => {
        if (menuOpen) closeMenu();
        else openMenu();
    });
    menuScrim.addEventListener('click', () => closeMenu({ restoreFocus: true }));
    menu.addEventListener('keydown', event => {
        const index = menuItems.indexOf(documentRef.activeElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            menuItems[(index + step + menuItems.length) % menuItems.length]?.focus();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            closeMenu({ restoreFocus: true });
        } else if (event.key === 'Tab') {
            closeMenu();
        }
    });

    function closeSheet() {
        if (!navigationAuthority.getContext().open) return false;
        navigationAuthority.closeContext({ reason: 'context-sheet-close' });
        return true;
    }

    sheetScrim.addEventListener('click', closeSheet);
    sheetClose.addEventListener('click', closeSheet);
    sheetPanel.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const nodes = [...sheetPanel.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, a[href], [tabindex="0"]')]
            .filter(node => node.getClientRects().length && node.tabIndex >= 0);
        const first = nodes[0];
        const last = nodes.at(-1);
        if (event.shiftKey && (documentRef.activeElement === first || !nodes.includes(documentRef.activeElement))) {
            event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && documentRef.activeElement === last) {
            event.preventDefault(); first?.focus();
        }
    });

    function stepSheet(direction) {
        const current = navigationAuthority.getContext().sheetState;
        const index = SHEET_STATES.indexOf(current);
        const next = index + direction;
        if (next < 0) {
            closeSheet();
            return;
        }
        const state = SHEET_STATES[Math.min(SHEET_STATES.length - 1, next)];
        navigationAuthority.setContext({ sheetState: state }, { reason: 'context-sheet-resize' });
    }

    function onSheetPointerDown(event) {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (event.target?.closest?.('button')) return;
        sheetDrag = { pointerId: event.pointerId, startY: event.clientY, delta: 0 };
        sheet.dataset.atriaSheetDragging = 'true';
        sheetPanel.setPointerCapture?.(event.pointerId);
    }

    function onSheetPointerMove(event) {
        if (!sheetDrag || event.pointerId !== sheetDrag.pointerId) return;
        sheetDrag.delta = event.clientY - sheetDrag.startY;
        const offset = sheetDrag.delta < 0 ? Math.max(sheetDrag.delta, -48) / 3 : sheetDrag.delta;
        sheetPanel.style.transform = `translateY(${offset}px)`;
    }

    function onSheetPointerUp(event) {
        if (!sheetDrag || event.pointerId !== sheetDrag.pointerId) return;
        const { delta } = sheetDrag;
        sheetDrag = null;
        delete sheet.dataset.atriaSheetDragging;
        sheetPanel.style.transform = '';
        sheetPanel.releasePointerCapture?.(event.pointerId);
        if (delta > 72) stepSheet(-1);
        else if (delta < -48) stepSheet(1);
    }

    for (const handle of [sheetGrip, sheetHeader]) {
        handle.addEventListener('pointerdown', onSheetPointerDown);
    }
    sheetPanel.addEventListener('pointermove', onSheetPointerMove);
    sheetPanel.addEventListener('pointerup', onSheetPointerUp);
    sheetPanel.addEventListener('pointercancel', onSheetPointerUp);

    function openSheet(content, {
        state = 'half',
        ariaLabel = 'Context sheet',
    } = {}) {
        setNodeContent(dockBody, content);
        navigationAuthority.setContext({
            title: String(ariaLabel || 'Context sheet'),
            open: true,
            sheetState: SHEET_STATES.includes(state) ? state : 'half',
        }, { reason: 'context-sheet-open' });
        return sheet;
    }

    function dismissContextForBack() {
        if (!isCompact() || sheet.hidden || !navigationAuthority.getContext().open) return false;
        return closeSheet();
    }

    function dismissCommandForBack() {
        return closeMenu({ restoreFocus: true }) || closeCommand();
    }

    function dismissChildRouteForBack(kind) {
        const learning = new documentRef.defaultView.CustomEvent('atria-learning-back', { cancelable: true });
        if (!documentRef.dispatchEvent(learning)) return true;
        // Give the active Workspace controller its transient panels before
        // consuming the existing Navigation Authority child route (Escape/Back).
        const transient = new documentRef.defaultView.CustomEvent('atria-workspace-back', { cancelable: true });
        if (!workspace.dispatchEvent(transient)) return true;
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
            menuOpen
            || (
                isCompact()
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
        // Native modal frames own their Escape before the inspector or routes.
        if (documentRef.querySelector('dialog[open]')) return;
        const playMore = root.querySelector('.atria-play-more[open], .atria-game-recovery-panel[open]');
        if (playMore) {
            playMore.open = false;
            playMore.querySelector('summary')?.focus();
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }

        const consumeEscape = () => {
            event.preventDefault();
            event.stopImmediatePropagation();
        };

        if (closeMenu({ restoreFocus: true })) {
            consumeEscape();
            return;
        }
        if (dismissContextForBack()) {
            consumeEscape();
            return;
        }
        if (closeCommand()) {
            consumeEscape();
            return;
        }
        if (dismissChildRouteForBack('detail')) {
            consumeEscape();
        }
    }

    documentRef.addEventListener('keydown', onKeyDown, true);

    function runUtility(utility) {
        const handler = utilities[utility.id];
        if (typeof handler === 'function') handler(api);
    }

    for (const utilityId of [...SIDEBAR_UTILITIES, 'account']) {
        const utility = ATRIA_GLOBAL_UTILITIES.find(item => item.id === utilityId);
        if (!utility) continue;
        const button = makeUtilityButton(documentRef, utility, translate);
        if (utilityId === 'account') button.classList.add('atria-sidebar__account');
        if (typeof utilities[utility.id] === 'function') {
            button.addEventListener('click', () => runUtility(utility));
        } else {
            button.disabled = true;
            button.title = `${tl(utility.label)} — ${tl('Unavailable')}`;
        }
        railFooter.append(button);
        utilityButtons.set(utility.id, button);
    }

    for (const utilityId of MENU_UTILITIES) {
        const utility = ATRIA_GLOBAL_UTILITIES.find(item => item.id === utilityId);
        if (!utility) continue;
        const item = element(documentRef, 'button', 'atria-shell-menu__item');
        item.type = 'button';
        item.setAttribute('role', 'menuitem');
        item.dataset.atriaUtilityShortcut = utility.id;
        const icon = element(documentRef, 'span', 'atria-shell-menu__icon');
        icon.append(createAtriaIcon(documentRef, utility.glyph || utility.id, { size: 20 }));
        item.append(icon, element(documentRef, 'span', 'atria-shell-menu__label', tl(utility.label)));
        const available = typeof utilities[utility.id] === 'function';
        item.disabled = !available;
        item.addEventListener('click', () => {
            closeMenu();
            runUtility(utility);
        });
        menu.append(item);
        menuItems.push(item);
    }

    for (const domain of ATRIA_PRIMARY_DOMAINS) {
        commandDisposers.push(registry.register({
            id: `navigate.${domain.id}`,
            title: formatShellText('Go to ${0}', [tl(domain.label)], translate, 'atria.shell.command.goToDomain'),
            description: formatShellText('Open the ${0} domain', [tl(domain.label)], translate, 'atria.shell.command.openDomain'),
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
            closeMenu();
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
        setRuntimeStatus(label, tone = 'neutral', statusTitle = '') {
            const text = tl(label);
            runtimeChip.textContent = text;
            runtimeChip.dataset.tone = tone;
            runtimeChip.title = tl(statusTitle);
            runtimeChip.hidden = !text;
        },
        setDockContent(content, {
            title: contextTitle = 'Context',
            open = true,
            state = 'half',
        } = {}) {
            setNodeContent(dockBody, content);
            navigationAuthority.setContext({
                title: String(contextTitle || 'Context'),
                open: Boolean(open),
                sheetState: SHEET_STATES.includes(state) ? state : 'half',
            }, { reason: 'context-content' });
            updateInspectorToggle();
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
            isCompact()
            && navigationAuthority.getContext().open
            && !sheet.hidden
        ),
        openCommand,
        closeCommand: () => closeCommand(),
        isCommandOpen: () => commandOpen,
        openMenu,
        closeMenu: () => closeMenu(),
        isMenuOpen: () => menuOpen,
        dismissContextForBack,
        dismissCommandForBack,
        dismissDetailRouteForBack: () => dismissChildRouteForBack('detail'),
        dismissWorkspaceChildRouteForBack: () => dismissChildRouteForBack('workspace'),
        navigateBack: () => navigationAuthority.back(),
        navigateUp,
        hasEscapePriorityLayer,
        destroy() {
            if (disposed) return;
            disposed = true;
            closeMenu();
            closeCommand({ restoreFocus: false });
            closeSheet();
            dockObserver?.disconnect();
            focusObserver?.disconnect();
            largeTitleObserver?.disconnect();
            largeTitles.clear();
            visibleLargeTitles.clear();
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
