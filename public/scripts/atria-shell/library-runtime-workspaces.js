import {
    createAtriaRuntimeCard,
    createAtriaStatePanel,
} from './primitives.js';

export const LIBRARY_SECTIONS = Object.freeze([
    Object.freeze({ id: 'characters', label: 'Characters' }),
    Object.freeze({ id: 'games', label: 'Games' }),
    Object.freeze({ id: 'world-info', label: 'Worlds & Knowledge' }),
    Object.freeze({ id: 'skills', label: 'Skills' }),
]);

export const RUNTIME_SECTIONS = Object.freeze([
    Object.freeze({ id: 'overview', label: 'Overview' }),
    Object.freeze({ id: 'roles', label: 'Roles' }),
    Object.freeze({ id: 'connections', label: 'Connections' }),
    Object.freeze({ id: 'presets', label: 'Model / Prompt Presets' }),
    Object.freeze({ id: 'retrieval', label: 'Retrieval' }),
]);

function sectionById(list, id, fallbackId) {
    return list.find(item => item.id === id)
        || list.find(item => item.id === fallbackId)
        || list[0];
}

export function normalizeLibrarySection(route) {
    const childId = String(route?.child?.id || '').trim();
    if (childId.startsWith('character:')) return 'characters';
    return sectionById(LIBRARY_SECTIONS, childId || 'characters', 'characters').id;
}

export function normalizeRuntimeSection(route) {
    const childId = String(route?.child?.id || '').trim();
    return sectionById(RUNTIME_SECTIONS, childId || 'overview', 'overview').id;
}

function buildDomainFrame(documentRef, {
    domain,
    sections,
    activeSection,
    onNavigate,
}) {
    const root = documentRef.createElement('section');
    root.className = 'atria-domain-workspace';
    root.dataset.atriaDomainWorkspace = domain;

    const nav = documentRef.createElement('nav');
    nav.className = 'atria-domain-workspace__nav';
    nav.setAttribute('aria-label', domain === 'library' ? 'Library sections' : 'Runtime sections');

    const body = documentRef.createElement('div');
    body.className = 'atria-domain-workspace__body';

    for (const item of sections) {
        const button = documentRef.createElement('button');
        button.type = 'button';
        button.className = 'atria-domain-workspace__tab';
        button.dataset.atriaDomainSection = item.id;
        button.textContent = item.label;
        button.classList.toggle('is-selected', item.id === activeSection);
        button.setAttribute('aria-current', item.id === activeSection ? 'page' : 'false');
        button.addEventListener('click', () => onNavigate(item.id));
        nav.append(button);
    }

    root.append(nav, body);
    return { root, nav, body };
}

function updateDomainTabs(frame, activeSection) {
    for (const button of frame.nav.querySelectorAll('[data-atria-domain-section]')) {
        const selected = button.dataset.atriaDomainSection === activeSection;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-current', selected ? 'page' : 'false');
    }
}

function savePlacement(node) {
    return {
        parent: node.parentNode,
        nextSibling: node.nextSibling,
        className: node.getAttribute('class'),
        style: node.getAttribute('style'),
        ariaHidden: node.getAttribute('aria-hidden'),
    };
}

function restorePlacement(node, placement) {
    if (!node || !placement?.parent) return;
    if (placement.nextSibling?.parentNode === placement.parent) {
        placement.parent.insertBefore(node, placement.nextSibling);
    } else {
        placement.parent.append(node);
    }

    if (placement.className === null) node.removeAttribute('class');
    else node.setAttribute('class', placement.className);
    if (placement.style === null) node.removeAttribute('style');
    else node.setAttribute('style', placement.style);
    if (placement.ariaHidden === null) node.removeAttribute('aria-hidden');
    else node.setAttribute('aria-hidden', placement.ariaHidden);
    delete node.dataset.atriaWorkspaceEmbedded;
}

function characterLabel(context, id) {
    const numeric = Number(id);
    return String(context?.characters?.[numeric]?.name || `Character ${id}`).trim();
}

function mountCharactersWorkspace({ document: documentRef, body, route, host }) {
    const root = documentRef.getElementById('right-nav-panel');
    if (!root) {
        const panel = createAtriaStatePanel(documentRef, 'loading', {
            title: 'Characters',
            message: 'The existing Character controller is still booting.',
        });
        body.replaceChildren(panel);
        return { root: panel, dispose: () => panel.remove() };
    }

    const placement = savePlacement(root);
    root.dataset.atriaWorkspaceEmbedded = 'true';
    root.classList.remove('closedDrawer');
    root.classList.add('openDrawer');
    root.removeAttribute('aria-hidden');
    body.replaceChildren(root);

    const context = globalThis.Atria?.getContext?.();
    let applyingRoute = false;

    function showList() {
        documentRef.getElementById('rm_button_characters')?.click?.();
    }

    function applyRoute(nextRoute) {
        const childId = String(nextRoute?.child?.id || '');
        if (!childId.startsWith('character:')) {
            showList();
            return;
        }
        const id = Number(childId.slice('character:'.length));
        if (!Number.isInteger(id) || id < 0 || Number(context?.characterId) === id) return;
        applyingRoute = true;
        Promise.resolve(context?.selectCharacterById?.(id))
            .catch(error => console.warn('[atria-shell] Character detail route failed', error))
            .finally(() => { applyingRoute = false; });
    }

    function onCharacterClick(event) {
        if (applyingRoute) return;
        const card = event.target?.closest?.('.character_select');
        if (!card || !root.contains(card)) return;
        const raw = card.getAttribute('chid') ?? card.dataset?.chid;
        const id = Number(raw);
        if (!Number.isInteger(id) || id < 0) return;
        queueMicrotask(() => host.openLibraryCharacter(id, characterLabel(context, id)));
    }

    root.addEventListener('click', onCharacterClick);
    applyRoute(route);

    return {
        root,
        updateRoute(nextRoute) {
            applyRoute(nextRoute);
        },
        dispose() {
            root.removeEventListener('click', onCharacterClick);
            restorePlacement(root, placement);
        },
    };
}

async function mapWithConcurrency(items, concurrency, mapper) {
    const source = [...items];
    const output = new Array(source.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(concurrency, source.length) }, async () => {
        while (next < source.length) {
            const index = next++;
            output[index] = await mapper(source[index], index);
        }
    });
    await Promise.all(workers);
    return output;
}

async function mountGamesWorkspace({ document: documentRef, body, host }) {
    const loading = createAtriaStatePanel(documentRef, 'loading', {
        title: 'Games',
        message: 'Discovering existing Game Packages from the current character library…',
    });
    body.replaceChildren(loading);

    const context = globalThis.Atria?.getContext?.();
    const characters = Array.isArray(context?.characters) ? context.characters : [];
    const candidates = characters
        .map((character, index) => ({ character, index }))
        .filter(item => item.character && String(item.character.avatar || '').trim());

    const { GAME_PACKAGE_STATUS, loadGamePackage } = await import('../extensions/game-runtime/package-loader.js');
    const headers = context?.getRequestHeaders?.() || {};
    const discovered = await mapWithConcurrency(candidates, 4, async ({ character, index }) => {
        const avatar = String(character.avatar || '').trim();
        const packageId = avatar.endsWith('.png') ? avatar.slice(0, -4) : avatar;
        try {
            const state = await loadGamePackage(packageId, { headers });
            if (state.status === GAME_PACKAGE_STATUS.NONE) return null;
            return { character, index, packageId, state };
        } catch (error) {
            return {
                character,
                index,
                packageId,
                state: {
                    status: GAME_PACKAGE_STATUS.ERROR,
                    active: false,
                    manifest: null,
                    errors: [error?.message || String(error)],
                },
            };
        }
    });

    const games = discovered.filter(Boolean);
    const root = documentRef.createElement('section');
    root.className = 'atria-library-games';
    root.dataset.atriaLibraryGames = 'true';

    if (!games.length) {
        root.append(createAtriaStatePanel(documentRef, 'empty', {
            title: 'No Game Packages found',
            message: 'Narrative Cards remain in Characters. Game Studio authors Game Packages; Library only discovers and opens existing packages.',
        }));
        body.replaceChildren(root);
        return { root, dispose: () => root.remove() };
    }

    const grid = documentRef.createElement('div');
    grid.className = 'atria-library-games__grid';
    for (const game of games) {
        const manifest = game.state.manifest;
        const ready = game.state.status === GAME_PACKAGE_STATUS.READY;
        const card = createAtriaRuntimeCard(documentRef, {
            title: manifest?.name || game.character.name || game.packageId,
            description: manifest?.description || (ready
                ? 'Game Package attached to this character card.'
                : (game.state.errors?.[0] || 'Game Package requires attention.')),
            status: ready ? `v${manifest?.version || '?'} · ${manifest?.ui?.mode || 'runtime'}` : game.state.status,
            tone: ready ? 'success' : 'warning',
        });
        card.dataset.atriaGameCharacter = String(game.index);

        const actions = documentRef.createElement('div');
        actions.className = 'atria-domain-workspace__actions';

        const play = documentRef.createElement('button');
        play.type = 'button';
        play.textContent = 'Open in Play';
        play.disabled = !ready;
        play.addEventListener('click', async () => {
            await context?.selectCharacterById?.(game.index);
            host.openPlay();
        });

        const studio = documentRef.createElement('button');
        studio.type = 'button';
        studio.textContent = 'Open in Studio';
        studio.addEventListener('click', () => host.openStudio(game.index));

        actions.append(play, studio);
        card.append(actions);
        grid.append(card);
    }
    root.append(grid);
    body.replaceChildren(root);
    return { root, dispose: () => root.remove() };
}

async function mountWorldWorkspace({ document: documentRef, body }) {
    const worldInfo = await import('../world-info/workspace.js');
    const mounted = worldInfo.mountWorldInfoWorkspace(body, { embedded: true });
    if (mounted) return mounted;
    const panel = createAtriaStatePanel(documentRef, 'loading', {
        title: 'Worlds & Knowledge',
        message: 'World Info is still finishing its existing controller bootstrap.',
    });
    body.replaceChildren(panel);
    return { root: panel, dispose: () => panel.remove() };
}

async function mountSkillsWorkspace({ document: documentRef, body }) {
    const context = globalThis.Atria?.getContext?.();
    const skills = await import('../skills/skill-manager-panel.js');

    const root = documentRef.createElement('section');
    root.className = 'atria-skill-workspace-host';
    root.dataset.atriaWorkspaceEmbedded = 'true';
    body.replaceChildren(root);

    let release;
    let firstPopup = true;
    const lifecycle = new Promise(resolve => { release = resolve; });
    const embeddedContext = Object.create(context || null);
    const originalPopup = context?.callGenericPopup?.bind(context);
    embeddedContext.callGenericPopup = (html, type, title, options) => {
        if (!firstPopup) {
            if (!originalPopup) return Promise.resolve(null);
            return originalPopup(html, type, title, options);
        }
        firstPopup = false;
        root.innerHTML = String(html || '');
        return lifecycle;
    };

    const task = skills.openSkillManagerPanel({
        context: embeddedContext,
        t: context?.translate || (value => value),
    }).catch(error => {
        if (!root.isConnected) return;
        root.replaceChildren(createAtriaStatePanel(documentRef, 'error', {
            title: 'Skills',
            message: error?.message || String(error),
        }));
    });

    return {
        root,
        dispose() {
            release?.();
            void task;
            root.remove();
        },
    };
}

function renderOverviewCard(documentRef, root, options) {
    root.append(createAtriaRuntimeCard(documentRef, options));
}

function mountRuntimeOverview({ document: documentRef, body }) {
    const context = globalThis.Atria?.getContext?.();
    const extensionSettings = context?.extensionSettings || {};
    const profiles = Array.isArray(extensionSettings?.connectionManager?.profiles)
        ? extensionSettings.connectionManager.profiles
        : [];
    const gameApi = context?.getExtensionApi?.('game-runtime');
    const llmState = gameApi?.getLlmRuntimeState?.() || { active: false, roles: {}, packageId: '' };
    const roleConfigs = gameApi?.getModelRuntimeConfig?.()?.roles || llmState.roles || {};

    const root = documentRef.createElement('section');
    root.dataset.atriaPattern = 'runtime-status';
    root.dataset.atriaRuntimeOverview = 'true';

    const selectedId = extensionSettings?.connectionManager?.selectedProfile;
    const selected = profiles.find(profile => profile?.id === selectedId);
    const chatProfiles = profiles.filter(profile => ['cc', 'tc'].includes(String(profile?.mode || '')));
    const embedProfiles = profiles.filter(profile => profile?.mode === 'embed');
    const rerankProfiles = profiles.filter(profile => profile?.mode === 'rerank');
    const configuredRoles = Object.values(roleConfigs).filter(role => role?.primaryProfile).length;

    renderOverviewCard(documentRef, root, {
        title: 'Game Runtime',
        description: llmState.packageId
            ? `Active package: ${llmState.packageId}`
            : 'No Game Package is currently active.',
        status: llmState.active ? 'Active' : 'Idle',
        tone: llmState.active ? 'success' : 'neutral',
    });
    renderOverviewCard(documentRef, root, {
        title: 'Runtime Roles',
        description: `${configuredRoles} of ${Object.keys(roleConfigs).length} roles have an explicit primary connection profile.`,
        status: configuredRoles ? 'Configured' : 'Defaults',
    });
    renderOverviewCard(documentRef, root, {
        title: 'Connections',
        description: selected ? `Active profile: ${selected.name}` : 'No Connection Manager profile is active.',
        status: `${chatProfiles.length} chat profiles`,
    });
    renderOverviewCard(documentRef, root, {
        title: 'Retrieval',
        description: `${embedProfiles.length} embedding · ${rerankProfiles.length} rerank profiles`,
        status: embedProfiles.length || rerankProfiles.length ? 'Available' : 'Unconfigured',
    });

    body.replaceChildren(root);
    return { root, dispose: () => root.remove() };
}

async function mountRuntimeRoles({ document: documentRef, body }) {
    const context = globalThis.Atria?.getContext?.();
    const api = context?.getExtensionApi?.('game-runtime');
    if (!api?.getModelRuntimeConfig || !api?.setRuntimeRoleConfig) {
        const panel = createAtriaStatePanel(documentRef, 'loading', {
            title: 'Runtime Roles',
            message: 'The existing Game Runtime role controller is still booting.',
        });
        body.replaceChildren(panel);
        return { root: panel, dispose: () => panel.remove() };
    }

    const { getChatCompletionConnectionProfiles } = await import('../extensions/connection-manager/profile-resolver.js');
    const profiles = getChatCompletionConnectionProfiles();
    const config = api.getModelRuntimeConfig();

    const root = documentRef.createElement('section');
    root.className = 'atria-runtime-roles';
    root.dataset.atriaRuntimeRoles = 'true';

    for (const [roleId, role] of Object.entries(config.roles || {})) {
        const card = documentRef.createElement('article');
        card.className = 'atria-runtime-role-card';
        card.dataset.runtimeRole = roleId;

        const title = documentRef.createElement('h3');
        title.textContent = roleId.replaceAll('_', ' ');

        const primaryLabel = documentRef.createElement('label');
        primaryLabel.textContent = 'Primary connection';
        const primary = documentRef.createElement('select');
        primary.className = 'text_pole';
        const none = documentRef.createElement('option');
        none.value = '';
        none.textContent = 'Use global/default connection';
        primary.append(none);
        for (const profile of profiles) {
            const option = documentRef.createElement('option');
            option.value = profile.name;
            option.textContent = profile.name;
            option.selected = profile.name === role.primaryProfile;
            primary.append(option);
        }
        primaryLabel.append(primary);

        const fallbacksLabel = documentRef.createElement('label');
        fallbacksLabel.textContent = 'Fallback connections';
        const fallbacks = documentRef.createElement('select');
        fallbacks.className = 'text_pole';
        fallbacks.multiple = true;
        for (const profile of profiles) {
            const option = documentRef.createElement('option');
            option.value = profile.name;
            option.textContent = profile.name;
            option.selected = role.fallbackProfiles?.includes(profile.name);
            fallbacks.append(option);
        }
        fallbacksLabel.append(fallbacks);

        const limits = documentRef.createElement('div');
        limits.className = 'atria-runtime-role-card__limits';
        const timeout = documentRef.createElement('input');
        timeout.type = 'number';
        timeout.min = '1000';
        timeout.max = '600000';
        timeout.step = '1000';
        timeout.value = String(role.timeoutMs);
        timeout.setAttribute('aria-label', 'Timeout milliseconds');
        const retries = documentRef.createElement('input');
        retries.type = 'number';
        retries.min = '0';
        retries.max = '5';
        retries.value = String(role.retries);
        retries.setAttribute('aria-label', 'Retries');
        limits.append(timeout, retries);

        const meta = documentRef.createElement('small');
        meta.textContent = `Policy: ${role.reasoningPolicy} · tools: ${role.requirements?.tools ? 'required' : 'optional'} · structured output: ${role.requirements?.structuredOutput ? 'required' : 'optional'}`;

        async function persist() {
            try {
                const selectedFallbacks = [...fallbacks.selectedOptions]
                    .map(option => option.value)
                    .filter(name => name && name !== primary.value);
                api.setRuntimeRoleConfig(roleId, {
                    primaryProfile: primary.value,
                    fallbackProfiles: selectedFallbacks,
                    timeoutMs: Number(timeout.value),
                    retries: Number(retries.value),
                });
                card.dataset.saveState = 'saved';
            } catch (error) {
                card.dataset.saveState = 'error';
                console.warn('[atria-shell] Runtime Role update failed', roleId, error);
            }
        }

        primary.addEventListener('change', persist);
        fallbacks.addEventListener('change', persist);
        timeout.addEventListener('change', persist);
        retries.addEventListener('change', persist);

        card.append(title, primaryLabel, fallbacksLabel, limits, meta);
        root.append(card);
    }

    body.replaceChildren(root);
    return { root, dispose: () => root.remove() };
}

async function waitForConnectionManagerRoot(documentRef, timeoutMs = 6000) {
    const existing = documentRef.getElementById('atria-connection-manager-root');
    if (existing) return existing;
    if (typeof MutationObserver === 'undefined') return null;

    return await new Promise(resolve => {
        let settled = false;
        const finish = value => {
            if (settled) return;
            settled = true;
            observer.disconnect();
            clearTimeout(timer);
            resolve(value);
        };
        const observer = new MutationObserver(() => {
            const node = documentRef.getElementById('atria-connection-manager-root');
            if (node) finish(node);
        });
        observer.observe(documentRef.body, { childList: true, subtree: true });
        const timer = setTimeout(() => finish(null), timeoutMs);
    });
}

async function mountConnectionManagerWorkspace({ document: documentRef, body, section }) {
    const root = await waitForConnectionManagerRoot(documentRef);
    if (!root) {
        const panel = createAtriaStatePanel(documentRef, 'loading', {
            title: section === 'retrieval' ? 'Retrieval' : 'Connections',
            message: 'Connection Manager is still finishing its existing controller bootstrap.',
        });
        body.replaceChildren(panel);
        return { root: panel, dispose: () => panel.remove() };
    }

    const placement = savePlacement(root);
    root.dataset.atriaWorkspaceEmbedded = 'true';
    body.replaceChildren(root);

    function applyMode(nextSection) {
        const mode = nextSection === 'retrieval' ? 'embed' : 'chat';
        root.querySelector(`.connection_profile_mode_tab[data-mode="${mode}"]`)?.click?.();
    }
    applyMode(section);

    return {
        root,
        updateSection(nextSection) {
            applyMode(nextSection);
        },
        dispose() {
            restorePlacement(root, placement);
        },
    };
}

async function mountPresetWorkspace({ document: documentRef, body }) {
    const { getPresetManager } = await import('../preset-manager.js');
    const root = documentRef.createElement('section');
    root.className = 'atria-runtime-presets';
    root.dataset.atriaRuntimePresets = 'true';

    const definitions = [
        ['openai', 'Chat Completion'],
        ['textgenerationwebui', 'Text Completion'],
        ['context', 'Context'],
        ['instruct', 'Instruct'],
        ['sysprompt', 'System Prompt'],
        ['reasoning', 'Reasoning'],
    ];

    for (const [apiId, label] of definitions) {
        const manager = getPresetManager(apiId);
        if (!manager) continue;
        const names = manager.getAllPresets?.() || [];
        if (!names.length) continue;

        const row = documentRef.createElement('label');
        row.className = 'atria-runtime-preset-row';
        row.textContent = label;
        const select = documentRef.createElement('select');
        select.className = 'text_pole';
        const selected = manager.getSelectedPresetName?.() || '';
        for (const name of names) {
            const option = documentRef.createElement('option');
            option.value = name;
            option.textContent = name;
            option.selected = name === selected;
            select.append(option);
        }
        select.addEventListener('change', () => {
            const value = manager.findPreset?.(select.value);
            if (value !== undefined && value !== null) {
                void Promise.resolve(manager.selectPreset?.(value));
            }
        });
        row.append(select);
        root.append(row);
    }

    const advanced = documentRef.createElement('button');
    advanced.type = 'button';
    advanced.textContent = 'Open advanced preset forms';
    advanced.addEventListener('click', () => {
        documentRef.getElementById('leftNavDrawerIcon')?.closest?.('.drawer-toggle')?.click?.();
    });
    root.append(advanced);

    body.replaceChildren(root);
    return { root, dispose: () => root.remove() };
}

async function mountLibrarySection(args) {
    const section = normalizeLibrarySection(args.route);
    if (section === 'characters') return mountCharactersWorkspace(args);
    if (section === 'games') return await mountGamesWorkspace(args);
    if (section === 'world-info') return await mountWorldWorkspace(args);
    return await mountSkillsWorkspace(args);
}

async function mountRuntimeSection(args) {
    const section = normalizeRuntimeSection(args.route);
    if (section === 'overview') return mountRuntimeOverview(args);
    if (section === 'roles') return await mountRuntimeRoles(args);
    if (section === 'connections' || section === 'retrieval') {
        return await mountConnectionManagerWorkspace({ ...args, section });
    }
    return await mountPresetWorkspace(args);
}

function createDomainController({
    document: documentRef,
    slot,
    route,
    host,
    domain,
    sections,
    normalizeSection,
    mountSection,
}) {
    let disposed = false;
    let sequence = 0;
    let sectionController = null;
    let currentSection = normalizeSection(route);

    const frame = buildDomainFrame(documentRef, {
        domain,
        sections,
        activeSection: currentSection,
        onNavigate: section => (
            domain === 'library'
                ? host.openLibrarySection(section)
                : host.openRuntimeSection(section)
        ),
    });
    slot.replaceChildren(frame.root);

    async function activate(nextRoute) {
        if (disposed) return;
        const nextSection = normalizeSection(nextRoute);
        updateDomainTabs(frame, nextSection);

        if (currentSection === nextSection && sectionController) {
            sectionController.updateRoute?.(nextRoute);
            sectionController.updateSection?.(nextSection);
            return;
        }

        currentSection = nextSection;
        const token = ++sequence;
        await Promise.resolve(sectionController?.dispose?.());
        if (disposed || token !== sequence) return;

        frame.body.replaceChildren(createAtriaStatePanel(documentRef, 'loading', {
            title: sectionById(sections, nextSection, sections[0].id).label,
            message: 'Opening existing controller…',
        }));

        let mounted;
        try {
            mounted = await mountSection({
                document: documentRef,
                body: frame.body,
                slot,
                route: nextRoute,
                host,
            });
        } catch (error) {
            if (disposed || token !== sequence) return;
            const panel = createAtriaStatePanel(documentRef, 'error', {
                title: sectionById(sections, nextSection, sections[0].id).label,
                message: error?.message || String(error),
            });
            frame.body.replaceChildren(panel);
            mounted = { root: panel, dispose: () => panel.remove() };
        }

        if (disposed || token !== sequence) {
            await Promise.resolve(mounted?.dispose?.());
            return;
        }
        sectionController = mounted || {};
    }

    void activate(route);

    return {
        root: frame.root,
        updateRoute(nextRoute) {
            void activate(nextRoute);
        },
        dispose() {
            disposed = true;
            sequence += 1;
            const previous = sectionController;
            sectionController = null;
            void Promise.resolve(previous?.dispose?.());
            frame.root.remove();
        },
    };
}

export function mountLibraryDomainWorkspace(args) {
    return createDomainController({
        ...args,
        domain: 'library',
        sections: LIBRARY_SECTIONS,
        normalizeSection: normalizeLibrarySection,
        mountSection: mountLibrarySection,
    });
}

export function mountRuntimeDomainWorkspace(args) {
    return createDomainController({
        ...args,
        domain: 'runtime',
        sections: RUNTIME_SECTIONS,
        normalizeSection: normalizeRuntimeSection,
        mountSection: mountRuntimeSection,
    });
}
