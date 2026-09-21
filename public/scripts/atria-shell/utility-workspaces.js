import { createAtriaStatePanel } from './primitives.js';
import { translateShellText } from './localization.js';

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

export async function mountPluginsUtility({
    document: documentRef = globalThis.document,
    slot,
    body = slot,
    extensionAuthority,
} = {}) {
    const authority = await resolveExtensionAuthority(extensionAuthority);
    const frame = makeUtilityFrame(documentRef, {
        id: 'plugins',
        title: 'Plugins',
        description: 'Third-party frontend extensions. Atria built-in features stay with their owning product domains.',
    });

    const install = makeButton(documentRef, 'Install', { icon: 'fa-solid fa-plus' });
    install.addEventListener('click', () => documentRef.getElementById('third_party_extension_button')?.click?.());
    const manage = makeButton(documentRef, 'Advanced manager', { icon: 'fa-solid fa-puzzle-piece' });
    manage.addEventListener('click', () => documentRef.getElementById('extensions_details')?.click?.());
    const refresh = makeButton(documentRef, 'Refresh', { icon: 'fa-solid fa-rotate' });
    frame.actions.append(install, manage, refresh);

    const listHost = documentRef.createElement('div');
    listHost.className = 'atria-plugin-list-host';

    const serverSurface = documentRef.createElement('section');
    serverSurface.className = 'atria-plugin-server-surface';
    serverSurface.dataset.atriaPluginSurface = 'server';
    const serverTitle = documentRef.createElement('strong');
    serverTitle.textContent = translateShellText('Server plugins');
    const serverCopy = documentRef.createElement('p');
    serverCopy.textContent = translateShellText('Server plugins use Atria’s existing backend plugin loader and remain a separate server-managed surface. R7G does not mix them with frontend extensions or Atria built-ins, and does not invent client-side enable/disable state for them.');
    serverSurface.append(serverTitle, serverCopy);

    const compatibility = documentRef.createElement('details');
    compatibility.className = 'atria-plugin-compatibility';
    compatibility.dataset.atriaPluginCompatibility = 'true';
    const compatibilitySummary = documentRef.createElement('summary');
    compatibilitySummary.textContent = translateShellText('Extension compatibility settings');
    const compatibilityHint = documentRef.createElement('p');
    compatibilityHint.textContent = translateShellText('This is the existing extension settings DOM retained as a compatibility ABI for third-party integrations and deep historical forms.');
    const compatibilityBody = documentRef.createElement('div');
    compatibilityBody.className = 'atria-plugin-compatibility__body';
    compatibility.append(compatibilitySummary, compatibilityHint, compatibilityBody);

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
        compatibility.open = true;
        compatibility.scrollIntoView?.({ block: 'nearest' });
    }

    function render() {
        const plugins = classifyPluginEntries({
            extensionNames: authority.extensionNames || [],
            extensionTypes: authority.extensionTypes || {},
            disabledExtensions: authority.extension_settings?.disabledExtensions || [],
            getManifest: name => authority.getExtensionManifest?.(name),
        });
        renderPluginList(documentRef, listHost, plugins, authority, openCompatibility);
        frame.root.dataset.atriaPluginCount = String(plugins.length);
    }

    refresh.addEventListener('click', render);
    frame.body.append(listHost, serverSurface, compatibility);
    body.replaceChildren(frame.root);
    render();

    return {
        root: frame.root,
        dispose() {
            for (const [node, placement] of placements) restorePlacement(node, placement);
            frame.root.remove();
        },
    };
}

const SETTINGS_SECTIONS = Object.freeze([
    Object.freeze({ id: 'appearance', label: 'Appearance', target: 'UI-Theme-Block' }),
    Object.freeze({ id: 'language', label: 'Language', target: 'UI-language-block' }),
    Object.freeze({ id: 'interface', label: 'Interface & behavior', target: 'power-user-options-block' }),
]);

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
        description: 'Global appearance, language, accessibility and interaction preferences. Runtime and domain configuration live elsewhere.',
    });
    const placement = savePlacement(documentRef, settingsRoot);
    const accountControls = documentRef.getElementById('account_controls');
    const accountControlsHidden = accountControls?.hidden;

    const compatibility = documentRef.createElement('details');
    compatibility.className = 'atria-settings-compatibility';
    compatibility.dataset.atriaSettingsCompatibility = 'true';
    const compatibilitySummary = documentRef.createElement('summary');
    compatibilitySummary.textContent = translateShellText('Advanced & compatibility settings');
    const compatibilityHint = documentRef.createElement('p');
    compatibilityHint.textContent = translateShellText('Atria keeps the existing User Settings form as the authority for deep or low-frequency compatibility controls. MovingUI remains available here for legacy compatibility islands but does not control Atria Shell layout.');
    const compatibilityBody = documentRef.createElement('div');
    compatibilityBody.className = 'atria-settings-compatibility__body';
    compatibility.append(compatibilitySummary, compatibilityHint, compatibilityBody);

    const nav = documentRef.createElement('nav');
    nav.className = 'atria-settings-categories';
    nav.setAttribute('aria-label', translateShellText('Settings categories'));
    for (const section of SETTINGS_SECTIONS) {
        const button = makeButton(documentRef, section.label);
        button.dataset.atriaSettingsSection = section.id;
        button.addEventListener('click', () => {
            compatibility.open = true;
            queueMicrotask(() => {
                documentRef.getElementById(section.target)?.scrollIntoView?.({ block: 'start' });
            });
        });
        nav.append(button);
    }

    const accessibility = documentRef.createElement('div');
    accessibility.className = 'atria-settings-accessibility-note';
    accessibility.dataset.atriaSettingsSection = 'accessibility';
    const accessibilityTitle = documentRef.createElement('strong');
    accessibilityTitle.textContent = translateShellText('Accessibility');
    const accessibilityCopy = documentRef.createElement('span');
    accessibilityCopy.textContent = translateShellText('Accessibility behavior continues to use the existing Atria/SillyTavern accessibility controller and the same underlying controls.');
    accessibility.append(accessibilityTitle, accessibilityCopy);

    settingsRoot.dataset.atriaWorkspaceEmbedded = 'true';
    settingsRoot.classList.remove('closedDrawer');
    settingsRoot.classList.add('openDrawer');
    settingsRoot.hidden = false;
    settingsRoot.setAttribute('aria-hidden', 'false');
    if (accountControls) accountControls.hidden = true;

    compatibilityBody.append(settingsRoot);
    frame.body.append(nav, accessibility, compatibility);
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
    if (typeof authority.openUserProfile !== 'function') {
        const panel = createLocalizedStatePanel(documentRef, 'error', {
            title: 'Account',
            message: 'The existing account controller is unavailable.',
        });
        body.replaceChildren(panel);
        return { root: panel, dispose: () => panel.remove() };
    }

    const frame = makeUtilityFrame(documentRef, {
        id: 'account',
        title: 'Account',
        description: 'Identity, account-isolated storage, settings snapshots, backup and recovery continue to use the existing account controller.',
    });
    body.replaceChildren(frame.root);

    const mounted = await authority.openUserProfile({ container: frame.body });
    if (mounted) mounted.dataset.atriaAccountEmbedded = 'true';

    return {
        root: frame.root,
        dispose() {
            if (mounted) delete mounted.dataset.atriaAccountEmbedded;
            frame.root.remove();
        },
    };
}
