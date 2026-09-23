import { createAtriaStatePanel } from './primitives.js';
import { translateShellText } from './localization.js';
import { nativeProductClient } from '../native/product-client.js';

function createLocalizedStatePanel(documentRef, kind, options = {}) {
    return createAtriaStatePanel(documentRef, kind, {
        ...options,
        title: translateShellText(options.title),
        message: translateShellText(options.message),
    });
}

const THIRD_PARTY_EXTENSION_TYPES = new Set(['local', 'global']);

function savePlacement(documentRef, node) {
    if (!node?.parentNode) return null;
    const marker = documentRef.createComment(`atria-utility-placement:${node.id || node.tagName}`);
    node.parentNode.insertBefore(marker, node);
    return Object.freeze({
        marker,
        className: node.className,
        style: node.getAttribute('style'),
        hidden: node.hidden,
        ariaHidden: node.getAttribute('aria-hidden'),
    });
}

function restorePlacement(node, placement) {
    if (!node || !placement) return;
    if (placement.marker?.parentNode) placement.marker.replaceWith(node);
    node.className = placement.className;
    if (placement.style === null) node.removeAttribute('style');
    else node.setAttribute('style', placement.style);
    node.hidden = placement.hidden;
    if (placement.ariaHidden === null) node.removeAttribute('aria-hidden');
    else node.setAttribute('aria-hidden', placement.ariaHidden);
    delete node.dataset.atriaWorkspaceEmbedded;
}

function makeUtilityFrame(documentRef, {
    id,
    title,
    description,
}) {
    const root = documentRef.createElement('section');
    root.className = `atria-utility-workspace atria-utility-workspace--${id}`;
    root.dataset.atriaUtilityWorkspace = id;

    const header = documentRef.createElement('header');
    header.className = 'atria-utility-workspace__header';
    const copy = documentRef.createElement('div');
    const heading = documentRef.createElement('h2');
    heading.textContent = translateShellText(title);
    const detail = documentRef.createElement('p');
    detail.textContent = translateShellText(description);
    copy.append(heading, detail);
    const actions = documentRef.createElement('div');
    actions.className = 'atria-utility-workspace__actions';
    header.append(copy, actions);

    const body = documentRef.createElement('div');
    body.className = 'atria-utility-workspace__body';
    root.append(header, body);
    return { root, header, actions, body };
}

function makeButton(documentRef, label, {
    icon = '',
    title = label,
} = {}) {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'atria-utility-action';
    button.title = translateShellText(title);
    if (icon) {
        const node = documentRef.createElement('i');
        node.className = icon;
        node.setAttribute('aria-hidden', 'true');
        button.append(node);
    }
    const text = documentRef.createElement('span');
    text.textContent = translateShellText(label);
    button.append(text);
    return button;
}

export function isThirdPartyPlugin(name, type = '') {
    const id = String(name || '').trim();
    const normalizedType = String(type || '').trim().toLowerCase();
    return id.startsWith('third-party/') || THIRD_PARTY_EXTENSION_TYPES.has(normalizedType);
}

export function classifyPluginEntries({
    extensionNames = [],
    extensionTypes = {},
    disabledExtensions = [],
    getManifest = () => null,
} = {}) {
    const disabled = new Set(Array.isArray(disabledExtensions) ? disabledExtensions : []);
    return extensionNames
        .filter(name => isThirdPartyPlugin(name, extensionTypes?.[name]))
        .map(name => {
            const manifest = getManifest(name) || {};
            return Object.freeze({
                name,
                type: String(extensionTypes?.[name] || ''),
                enabled: !disabled.has(name),
                displayName: String(manifest.display_name || name.replace(/^third-party\//, '')),
                version: String(manifest.version || ''),
                author: Array.isArray(manifest.author)
                    ? manifest.author.join(', ')
                    : String(manifest.author || ''),
                description: String(manifest.description || ''),
            });
        })
        .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

async function resolveExtensionAuthority(extensionAuthority) {
    if (extensionAuthority) return extensionAuthority;
    return await import('../extensions.js');
}

function renderPluginList(documentRef, container, plugins, authority, onOpenSettings) {
    container.replaceChildren();
    if (!plugins.length) {
        container.append(createLocalizedStatePanel(documentRef, 'empty', {
            title: 'No third-party plugins installed',
            message: 'Atria built-in features are intentionally excluded from Plugins.',
        }));
        return;
    }

    const list = documentRef.createElement('div');
    list.className = 'atria-plugin-list';
    for (const plugin of plugins) {
        const card = documentRef.createElement('article');
        card.className = 'atria-plugin-card';
        card.dataset.atriaPlugin = plugin.name;

        const titleRow = documentRef.createElement('div');
        titleRow.className = 'atria-plugin-card__title-row';
        const title = documentRef.createElement('strong');
        title.textContent = plugin.displayName;
        const scope = documentRef.createElement('span');
        scope.className = 'atria-plugin-card__scope';
        scope.textContent = plugin.type || translateShellText('Third-party extension');
        titleRow.append(title, scope);

        const metadata = documentRef.createElement('small');
        metadata.className = 'atria-plugin-card__metadata';
        metadata.textContent = [plugin.version && `v${plugin.version}`, plugin.author]
            .filter(Boolean)
            .join(' · ') || 'Third-party extension';

        const description = documentRef.createElement('p');
        description.textContent = plugin.description || translateShellText('No description provided by this plugin.');

        const controls = documentRef.createElement('div');
        controls.className = 'atria-plugin-card__controls';
        const toggleLabel = documentRef.createElement('label');
        toggleLabel.className = 'atria-plugin-toggle';
        const toggle = documentRef.createElement('input');
        toggle.type = 'checkbox';
        toggle.checked = plugin.enabled;
        toggle.dataset.pluginName = plugin.name;
        const toggleText = documentRef.createElement('span');
        toggleText.textContent = translateShellText(plugin.enabled ? 'Enabled' : 'Disabled');
        toggleLabel.append(toggle, toggleText);

        toggle.addEventListener('change', async () => {
            const desired = toggle.checked;
            toggle.disabled = true;
            card.dataset.saveState = 'saving';
            try {
                if (desired) await authority.enableExtension(plugin.name, false);
                else await authority.disableExtension(plugin.name, false);
                toggleText.textContent = translateShellText(desired ? 'Enabled' : 'Disabled');
                card.dataset.saveState = 'saved';
            } catch (error) {
                toggle.checked = !desired;
                toggleText.textContent = translateShellText(toggle.checked ? 'Enabled' : 'Disabled');
                card.dataset.saveState = 'error';
                console.error('[atria-shell] Plugin toggle failed', {
                    plugin: plugin.name,
                    error,
                });
            } finally {
                toggle.disabled = false;
            }
        });

        const settings = makeButton(documentRef, 'Compatibility settings', {
            icon: 'fa-solid fa-sliders',
            title: 'Open the existing extension settings surface',
        });
        settings.addEventListener('click', onOpenSettings);
        controls.append(toggleLabel, settings);
        card.append(titleRow, metadata, description, controls);
        list.append(card);
    }
    container.append(list);
}

function nativePluginRecords(works = []) {
    const records = [];
    for (const work of Array.isArray(works) ? works : []) {
        const packageId = String(work?.package?.packageId || '').trim();
        const packageName = String(work?.package?.displayName || work?.manifest?.name || packageId).trim();
        for (const plugin of work?.manifest?.runtime?.plugins || []) {
            const pluginId = String(plugin?.pluginId || '').trim();
            if (!pluginId) continue;
            records.push({
                pluginId,
                version: String(plugin?.version || ''),
                packageId,
                packageName,
                capabilities: Array.isArray(plugin?.packageRuntime?.capabilities)
                    ? plugin.packageRuntime.capabilities
                    : [],
                contributions: Array.isArray(plugin?.packageRuntime?.contributions)
                    ? plugin.packageRuntime.contributions
                    : [],
            });
        }
    }
    return records.sort((left, right) => (
        left.pluginId.localeCompare(right.pluginId)
        || left.packageName.localeCompare(right.packageName)
    ));
}

function renderNativePlugins(documentRef, container, records) {
    container.replaceChildren();
    if (!records.length) {
        container.append(createLocalizedStatePanel(documentRef, 'empty', {
            title: 'No Native plugins declared',
            message: 'Installed exact PackageVersions do not currently declare Package Runtime plugins.',
        }));
        return;
    }

    const list = documentRef.createElement('div');
    list.className = 'atria-plugin-list';
    for (const record of records) {
        const card = documentRef.createElement('article');
        card.className = 'atria-plugin-card';
        card.dataset.atriaNativePlugin = record.pluginId;

        const titleRow = documentRef.createElement('div');
        titleRow.className = 'atria-plugin-card__title-row';
        const title = documentRef.createElement('strong');
        title.textContent = record.pluginId;
        const scope = documentRef.createElement('span');
        scope.className = 'atria-plugin-card__scope';
        scope.textContent = 'Package Runtime';
        titleRow.append(title, scope);

        const metadata = documentRef.createElement('small');
        metadata.className = 'atria-plugin-card__metadata';
        metadata.textContent = [
            record.version && `v${record.version}`,
            record.packageName,
        ].filter(Boolean).join(' · ');

        const description = documentRef.createElement('p');
        const capabilities = record.capabilities.length
            ? record.capabilities.join(', ')
            : 'declarative contributions only';
        description.textContent = `${record.contributions.length} contribution(s) · ${capabilities}`;

        card.append(titleRow, metadata, description);
        list.append(card);
    }
    container.append(list);
}

export async function mountPluginsUtility({
    document: documentRef = globalThis.document,
    slot,
    body = slot,
    extensionAuthority,
    productClient = nativeProductClient,
} = {}) {
    const frame = makeUtilityFrame(documentRef, {
        id: 'plugins',
        title: 'Plugins',
        description: 'Native Plugin capabilities and exact Package Runtime contributions. Legacy extensions remain isolated under Advanced.',
    });

    const refresh = makeButton(documentRef, 'Refresh', { icon: 'fa-solid fa-rotate' });
    frame.actions.append(refresh);

    const nativeSection = documentRef.createElement('section');
    nativeSection.className = 'atria-native-plugin-surface';
    nativeSection.dataset.atriaPluginSurface = 'native';
    const nativeTitle = documentRef.createElement('h3');
    nativeTitle.textContent = 'Native Plugins';
    const nativeHint = documentRef.createElement('p');
    nativeHint.textContent = 'Read-only projection from installed exact PackageVersions. Activation and permissions remain owned by the A5 Plugin Platform.';
    const nativeList = documentRef.createElement('div');
    nativeList.className = 'atria-native-plugin-list-host';
    nativeSection.append(nativeTitle, nativeHint, nativeList);

    const legacy = documentRef.createElement('details');
    legacy.className = 'atria-plugin-compatibility';
    legacy.dataset.atriaLegacyPlugins = 'true';
    const legacySummary = documentRef.createElement('summary');
    legacySummary.textContent = 'Advanced · Legacy extensions';
    const legacyHint = documentRef.createElement('p');
    legacyHint.textContent = 'SillyTavern-compatible frontend/server extension surfaces are retained only as a compatibility island.';
    const legacyBody = documentRef.createElement('div');
    legacyBody.className = 'atria-plugin-legacy-body';
    legacy.append(legacySummary, legacyHint, legacyBody);

    const authority = await resolveExtensionAuthority(extensionAuthority);
    const legacyList = documentRef.createElement('div');
    legacyList.className = 'atria-plugin-list-host';

    const serverSurface = documentRef.createElement('section');
    serverSurface.className = 'atria-plugin-server-surface';
    serverSurface.dataset.atriaPluginSurface = 'server';
    const serverTitle = documentRef.createElement('strong');
    serverTitle.textContent = translateShellText('Server plugins');
    const serverCopy = documentRef.createElement('p');
    serverCopy.textContent = 'Server-managed compatibility plugins are not Native Package Runtime plugins.';
    serverSurface.append(serverTitle, serverCopy);

    const compatibility = documentRef.createElement('details');
    compatibility.className = 'atria-plugin-compatibility';
    compatibility.dataset.atriaPluginCompatibility = 'true';
    const compatibilitySummary = documentRef.createElement('summary');
    compatibilitySummary.textContent = translateShellText('Extension compatibility settings');
    const compatibilityBody = documentRef.createElement('div');
    compatibilityBody.className = 'atria-plugin-compatibility__body';
    compatibility.append(compatibilitySummary, compatibilityBody);

    const compatibilityNodes = [
        documentRef.getElementById('extensions_settings'),
        documentRef.getElementById('extensions_settings2'),
    ].filter(Boolean);
    const placements = compatibilityNodes.map(node => [node, savePlacement(documentRef, node)]);
    for (const node of compatibilityNodes) {
        node.dataset.atriaWorkspaceEmbedded = 'true';
        compatibilityBody.append(node);
    }

    function openCompatibility() {
        legacy.open = true;
        compatibility.open = true;
        compatibility.scrollIntoView?.({ block: 'nearest' });
    }

    function renderLegacy() {
        const plugins = classifyPluginEntries({
            extensionNames: authority.extensionNames || [],
            extensionTypes: authority.extensionTypes || {},
            disabledExtensions: authority.extension_settings?.disabledExtensions || [],
            getManifest: name => authority.getExtensionManifest?.(name),
        });
        renderPluginList(documentRef, legacyList, plugins, authority, openCompatibility);
        frame.root.dataset.atriaLegacyPluginCount = String(plugins.length);
    }

    async function renderNative() {
        nativeList.replaceChildren(createLocalizedStatePanel(documentRef, 'loading', {
            title: 'Native Plugins',
            message: 'Reading installed exact PackageVersions…',
        }));
        try {
            const works = await productClient.listWorks();
            const records = nativePluginRecords(works);
            renderNativePlugins(documentRef, nativeList, records);
            frame.root.dataset.atriaNativePluginCount = String(records.length);
        } catch (error) {
            nativeList.replaceChildren(createLocalizedStatePanel(documentRef, 'error', {
                title: 'Native Plugins',
                message: error?.message || String(error),
            }));
        }
    }

    const installLegacy = makeButton(documentRef, 'Install Legacy Extension', { icon: 'fa-solid fa-plus' });
    installLegacy.addEventListener('click', () => documentRef.getElementById('third_party_extension_button')?.click?.());
    const manageLegacy = makeButton(documentRef, 'Legacy Extension Manager', { icon: 'fa-solid fa-puzzle-piece' });
    manageLegacy.addEventListener('click', () => documentRef.getElementById('extensions_details')?.click?.());
    const legacyActions = documentRef.createElement('div');
    legacyActions.className = 'atria-domain-workspace__actions';
    legacyActions.append(installLegacy, manageLegacy);
    legacyBody.append(legacyActions, legacyList, serverSurface, compatibility);

    refresh.addEventListener('click', () => {
        renderLegacy();
        void renderNative();
    });
    frame.body.append(nativeSection, legacy);
    body.replaceChildren(frame.root);
    renderLegacy();
    await renderNative();

    return {
        root: frame.root,
        dispose() {
            for (const [node, placement] of placements) restorePlacement(node, placement);
            frame.root.remove();
        },
    };
}

function createProductSettingCard(documentRef, {
    id,
    title,
    description,
    value = '',
    onOpenAdvanced,
}) {
    const card = documentRef.createElement('article');
    card.className = 'atria-product-setting-card';
    card.dataset.atriaSettingsSection = id;
    const heading = documentRef.createElement('h3');
    heading.textContent = translateShellText(title);
    const copy = documentRef.createElement('p');
    copy.textContent = description;
    card.append(heading, copy);
    if (value) {
        const current = documentRef.createElement('strong');
        current.className = 'atria-product-setting-card__value';
        current.textContent = value;
        card.append(current);
    }
    const open = makeButton(documentRef, 'Advanced controls', { icon: 'fa-solid fa-sliders' });
    open.addEventListener('click', onOpenAdvanced);
    card.append(open);
    return card;
}

export function mountSettingsUtility({
    document: documentRef = globalThis.document,
    slot,
    body = slot,
} = {}) {
    const settingsRoot = documentRef.getElementById('user-settings-block');
    if (!settingsRoot) {
        const panel = createLocalizedStatePanel(documentRef, 'loading', {
            title: 'Settings',
            message: 'The existing User Settings controller is still booting.',
        });
        body.replaceChildren(panel);
        return { root: panel, dispose: () => panel.remove() };
    }

    const frame = makeUtilityFrame(documentRef, {
        id: 'settings',
        title: 'Settings',
        description: 'Atria product preferences. Deep SillyTavern-compatible controls remain available under Advanced.',
    });
    const placement = savePlacement(documentRef, settingsRoot);
    const accountControls = documentRef.getElementById('account_controls');
    const accountControlsHidden = accountControls?.hidden;

    const compatibility = documentRef.createElement('details');
    compatibility.className = 'atria-settings-compatibility';
    compatibility.dataset.atriaSettingsCompatibility = 'true';
    const compatibilitySummary = documentRef.createElement('summary');
    compatibilitySummary.textContent = 'Advanced · Compatibility controls';
    const compatibilityHint = documentRef.createElement('p');
    compatibilityHint.textContent = 'These controls keep the existing persistence authority but are not the Atria product layout.';
    const compatibilityBody = documentRef.createElement('div');
    compatibilityBody.className = 'atria-settings-compatibility__body';
    compatibility.append(compatibilitySummary, compatibilityHint, compatibilityBody);

    const openAdvanced = targetId => {
        compatibility.open = true;
        queueMicrotask(() => documentRef.getElementById(targetId)?.scrollIntoView?.({ block: 'start' }));
    };

    const languageSource = documentRef.getElementById('ui_language_select');
    const grid = documentRef.createElement('section');
    grid.className = 'atria-product-settings-grid';
    grid.dataset.atriaSettingsPrimary = 'true';
    grid.append(
        createProductSettingCard(documentRef, {
            id: 'appearance',
            title: 'Appearance',
            description: 'Theme, typography and visual density.',
            onOpenAdvanced: () => openAdvanced('UI-Theme-Block'),
        }),
        createProductSettingCard(documentRef, {
            id: 'language',
            title: 'Language',
            description: 'Language used by the Atria and compatibility interfaces.',
            value: languageSource?.selectedOptions?.[0]?.textContent || languageSource?.value || '',
            onOpenAdvanced: () => openAdvanced('UI-language-block'),
        }),
        createProductSettingCard(documentRef, {
            id: 'interface',
            title: 'Interface & behavior',
            description: 'Interaction, generation and low-frequency interface behavior.',
            onOpenAdvanced: () => openAdvanced('power-user-options-block'),
        }),
        createProductSettingCard(documentRef, {
            id: 'accessibility',
            title: 'Accessibility',
            description: 'Accessibility preferences continue to use the existing settings persistence authority.',
            onOpenAdvanced: () => openAdvanced('power-user-options-block'),
        }),
    );

    settingsRoot.dataset.atriaWorkspaceEmbedded = 'true';
    settingsRoot.classList.remove('closedDrawer');
    settingsRoot.classList.add('openDrawer');
    settingsRoot.hidden = false;
    settingsRoot.setAttribute('aria-hidden', 'false');
    if (accountControls) accountControls.hidden = true;
    compatibilityBody.append(settingsRoot);

    frame.body.append(grid, compatibility);
    body.replaceChildren(frame.root);

    return {
        root: frame.root,
        dispose() {
            if (accountControls) accountControls.hidden = accountControlsHidden;
            restorePlacement(settingsRoot, placement);
            frame.root.remove();
        },
    };
}

export async function mountAccountUtility({
    document: documentRef = globalThis.document,
    slot,
    body = slot,
    accountAuthority,
} = {}) {
    const authority = accountAuthority || await import('../user.js');
    const frame = makeUtilityFrame(documentRef, {
        id: 'account',
        title: 'Account',
        description: 'Identity, account-isolated storage and recovery entry points.',
    });

    const grid = documentRef.createElement('section');
    grid.className = 'atria-account-overview';
    grid.dataset.atriaAccountPrimary = 'true';

    const handle = typeof authority.getCurrentUserHandle === 'function'
        ? authority.getCurrentUserHandle()
        : '';
    const cards = [
        ['Identity', handle || (authority.accountsEnabled ? 'Signed-in account' : 'Local account mode')],
        ['Storage', 'Account-isolated Atria data and Native content use the existing server storage authority.'],
        ['Settings snapshots', 'Create, inspect and restore settings snapshots from Advanced account tools.'],
        ['Backup & recovery', 'Backup, sync and destructive recovery actions remain permission-gated by the account controller.'],
    ];
    for (const [title, detail] of cards) {
        const card = documentRef.createElement('article');
        card.className = 'atria-account-card';
        const heading = documentRef.createElement('h3');
        heading.textContent = title;
        const copy = documentRef.createElement('p');
        copy.textContent = detail;
        card.append(heading, copy);
        grid.append(card);
    }

    const advanced = documentRef.createElement('details');
    advanced.className = 'atria-account-advanced';
    advanced.dataset.atriaAccountAdvanced = 'true';
    const summary = documentRef.createElement('summary');
    summary.textContent = 'Advanced · Account, snapshots and backup';
    const advancedBody = documentRef.createElement('div');
    advancedBody.className = 'atria-account-advanced__body';
    advanced.append(summary, advancedBody);

    let mounted = null;
    let loading = null;
    async function mountAdvanced() {
        if (mounted || loading || typeof authority.openUserProfile !== 'function') return;
        loading = Promise.resolve(authority.openUserProfile({ container: advancedBody }))
            .then(node => {
                mounted = node || advancedBody.firstElementChild || null;
                if (mounted) mounted.dataset.atriaAccountEmbedded = 'advanced';
            })
            .catch(error => {
                advancedBody.replaceChildren(createLocalizedStatePanel(documentRef, 'error', {
                    title: 'Account',
                    message: error?.message || String(error),
                }));
            })
            .finally(() => {
                loading = null;
            });
        await loading;
    }
    advanced.addEventListener('toggle', () => {
        if (advanced.open) void mountAdvanced();
    });

    frame.body.append(grid, advanced);
    body.replaceChildren(frame.root);

    return {
        root: frame.root,
        mountAdvanced,
        dispose() {
            if (mounted) delete mounted.dataset.atriaAccountEmbedded;
            frame.root.remove();
        },
    };
}
