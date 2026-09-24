import { createAtriaStatePanel } from './primitives.js';
import { translateShellText, formatShellText } from './localization.js';
import { createAtriaIcon } from './icons.js';
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
    if (icon) button.append(createAtriaIcon(documentRef, icon.includes('rotate') ? 'retry' : icon.includes('plus') ? 'plus' : 'settings'));
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
            message: 'Install an extension to add tools to your workspace.',
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
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('aria-label', plugin.displayName);
        const feedback = documentRef.createElement('p');
        feedback.className = 'atria-plugin-feedback';
        feedback.setAttribute('role', 'status');
        toggle.dataset.pluginName = plugin.name;
        const toggleText = documentRef.createElement('span');
        toggleText.textContent = translateShellText(plugin.enabled ? 'Enabled' : 'Disabled');
        toggleLabel.append(toggle, toggleText);

        toggle.addEventListener('change', async () => {
            const desired = toggle.checked;
            toggle.disabled = true;
            card.dataset.saveState = 'saving';
            feedback.textContent = translateShellText('Saving…');
            try {
                if (desired) await authority.enableExtension(plugin.name, false);
                else await authority.disableExtension(plugin.name, false);
                toggleText.textContent = translateShellText(desired ? 'Enabled' : 'Disabled');
                card.dataset.saveState = 'saved';
                feedback.textContent = translateShellText('Saved. Reload Atria to apply extension changes.');
            } catch (error) {
                toggle.checked = !desired;
                toggleText.textContent = translateShellText(toggle.checked ? 'Enabled' : 'Disabled');
                card.dataset.saveState = 'error';
                feedback.textContent = translateShellText('Could not save this change. Try again.');
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
        card.append(titleRow, metadata, description, controls, feedback);
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
                packageVersionId: String(work?.package?.currentVersionId || ''),
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
            title: 'No Native plugins yet',
            message: 'Plugins included with your installed works will appear here.',
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
            : translateShellText('Declared contributions');
        description.textContent = formatShellText('${0} contributions', [record.contributions.length], undefined, 'atria.utilities.contributions') + ' · ' + capabilities;

        const details = documentRef.createElement('details');
        const summary = documentRef.createElement('summary');
        summary.textContent = translateShellText('Details');
        const evidence = documentRef.createElement('pre');
        evidence.textContent = JSON.stringify({ packageId: record.packageId, packageVersionId: record.packageVersionId, capabilities: record.capabilities, contributions: record.contributions }, null, 2);
        details.append(summary, evidence);
        card.append(titleRow, metadata, description, details);
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
        description: 'Explore the capabilities included with your works.',
    });

    const refresh = makeButton(documentRef, 'Refresh', { icon: 'fa-solid fa-rotate' });
    frame.actions.append(refresh);

    const nativeSection = documentRef.createElement('section');
    nativeSection.className = 'atria-native-plugin-surface';
    nativeSection.dataset.atriaPluginSurface = 'native';
    const nativeTitle = documentRef.createElement('h3');
    nativeTitle.textContent = translateShellText('Native Plugins');
    const nativeHint = documentRef.createElement('p');
    nativeHint.textContent = translateShellText('Included with installed works. Each work manages its own plugin permissions.');
    const nativeList = documentRef.createElement('div');
    nativeList.className = 'atria-native-plugin-list-host';
    nativeSection.append(nativeTitle, nativeHint, nativeList);

    const legacy = documentRef.createElement('details');
    legacy.className = 'atria-plugin-compatibility';
    legacy.dataset.atriaLegacyPlugins = 'true';
    const legacySummary = documentRef.createElement('summary');
    legacySummary.textContent = translateShellText('Advanced · Legacy extensions');
    const legacyHint = documentRef.createElement('p');
    legacyHint.textContent = translateShellText('Manage installed extensions and their settings.');
    const legacyBody = documentRef.createElement('div');
    legacyBody.className = 'atria-plugin-legacy-body';
    legacy.append(legacySummary, legacyHint, legacyBody);

    body.replaceChildren(frame.root);
    const authority = await resolveExtensionAuthority(extensionAuthority);
    if (!body.contains(frame.root)) return { root: frame.root, dispose() { frame.root.remove(); } };
    const legacyList = documentRef.createElement('div');
    legacyList.className = 'atria-plugin-list-host';

    const serverSurface = documentRef.createElement('section');
    serverSurface.className = 'atria-plugin-server-surface';
    serverSurface.dataset.atriaPluginSurface = 'server';
    const serverTitle = documentRef.createElement('strong');
    serverTitle.textContent = translateShellText('Server plugins');
    const serverCopy = documentRef.createElement('p');
    serverCopy.textContent = translateShellText('Server plugins are managed by your server administrator.');
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

    // Bridge existing extension drawers; their original click handlers remain the authority.
    const drawerHeaders = [...compatibilityBody.querySelectorAll('.inline-drawer-toggle.inline-drawer-header')]
        .filter(node => !node.matches('button, summary, a, input'));
    const drawerAttributes = drawerHeaders.map(node => [node, ['role', 'tabindex', 'aria-expanded'].map(name => [name, node.getAttribute(name)])]);
    const syncDrawers = () => {
        for (const node of drawerHeaders) {
            node.setAttribute('role', 'button');
            node.tabIndex = 0;
            node.setAttribute('aria-expanded', String(Boolean(node.querySelector('.inline-drawer-icon.up, .fa-circle-chevron-up'))));
        }
    };
    syncDrawers();
    const drawerObserver = new MutationObserver(syncDrawers);
    drawerObserver.observe(compatibilityBody, { subtree: true, attributes: true, attributeFilter: ['class'] });
    const onDrawerKey = event => {
        if (!['Enter', ' '].includes(event.key) || !drawerHeaders.includes(event.target)) return;
        event.preventDefault();
        event.target.click();
    };
    compatibilityBody.addEventListener('keydown', onDrawerKey);

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

    let disposed = false;
    let refreshing = false;
    async function renderNative() {
        if (disposed || refreshing) return;
        refreshing = true;
        refresh.disabled = true;
        nativeList.replaceChildren(createLocalizedStatePanel(documentRef, 'loading', {
            title: 'Native Plugins',
            message: 'Loading plugins from your installed works…',
        }));
        try {
            const works = await productClient.listWorks();
            if (disposed) return;
            const records = nativePluginRecords(works);
            renderNativePlugins(documentRef, nativeList, records);
            frame.root.dataset.atriaNativePluginCount = String(records.length);
        } catch (error) {
            nativeList.replaceChildren(createLocalizedStatePanel(documentRef, 'error', {
                title: 'Native Plugins',
                message: error?.message || String(error),
            }));
        } finally {
            refreshing = false;
            refresh.disabled = false;
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
    renderLegacy();
    await renderNative();

    return {
        root: frame.root,
        dispose() {
            disposed = true;
            drawerObserver.disconnect();
            compatibilityBody.removeEventListener('keydown', onDrawerKey);
            for (const [node, attributes] of drawerAttributes) {
                for (const [name, value] of attributes) {
                    if (value === null) node.removeAttribute(name);
                    else node.setAttribute(name, value);
                }
            }
            for (const [node, placement] of placements) restorePlacement(node, placement);
            frame.root.remove();
        },
    };
}

// Preference-only host bridge: move existing controls with their event handlers and
// persistence, never the unfiltered User Settings drawer or generation controls.
export const PREFERENCE_CONTROLS = Object.freeze({
    appearance: ['themes', 'color-picker-block', 'font_scale'],
    language: ['UI-language-block'],
    interface: ['send_on_enter', 'auto_scroll_chat_to_bottom', 'auto_save_msg_edits', 'confirm_message_delete', 'before_unload_guard_mode'],
    accessibility: ['reduced_motion', 'fast_ui_mode'],
});

export function mountSettingsUtility({ document: documentRef = globalThis.document, slot, body = slot, host } = {}) {
    const frame = makeUtilityFrame(documentRef, {
        id: 'settings', title: 'Settings', description: 'Make Atria feel right for you.',
    });
    const grid = documentRef.createElement('section');
    grid.className = 'atria-preference-groups';
    grid.dataset.atriaSettingsPrimary = 'true';
    const placements = [];
    const titles = { appearance: 'Appearance', language: 'Language', interface: 'Interface & behavior', accessibility: 'Accessibility' };
    for (const [id, controlIds] of Object.entries(PREFERENCE_CONTROLS)) {
        const group = documentRef.createElement('section');
        group.className = 'atria-preference-group';
        group.dataset.atriaSettingsSection = id;
        const title = documentRef.createElement('h3');
        title.textContent = translateShellText(titles[id]);
        const controls = documentRef.createElement('div');
        controls.className = 'atria-preference-rows';
        group.append(title, controls);
        for (const controlId of controlIds) {
            const control = documentRef.getElementById(controlId);
            if (!control) continue;
            const node = control.matches('input, select') ? (control.closest('label') || control) : control;
            if (placements.some(([old]) => old === node)) continue;
            const placement = savePlacement(documentRef, node);
            if (!placement) continue;
            placements.push([node, placement]);
            const row = documentRef.createElement(controlId === 'color-picker-block' ? 'details' : 'div');
            row.className = 'atria-preference-row';
            if (controlId === 'color-picker-block') {
                row.dataset.atriaSettingsCompatibility = 'preferences-only';
                const summary = documentRef.createElement('summary');
                summary.textContent = translateShellText('Advanced appearance controls');
                row.append(summary);
            }
            if (node.matches('input, select')) {
                const label = documentRef.createElement('label');
                const text = documentRef.createElement('span');
                text.textContent = translateShellText({ themes: 'Theme', font_scale: 'Font Scale', send_on_enter: 'Send on Enter', before_unload_guard_mode: 'Confirm before leaving' }[controlId] || controlId);
                label.append(text, node); row.append(label);
            } else row.append(node);
            controls.append(row);
        }
        if (!controls.childElementCount) {
            controls.append(createLocalizedStatePanel(documentRef, 'empty', { title: titles[id], message: 'Preference controls are not available yet. Reopen Settings after startup.' }));
        }
        grid.append(group);
    }
    const destinations = documentRef.createElement('nav');
    destinations.className = 'atria-utility-related';
    destinations.setAttribute('aria-label', translateShellText('Related settings'));
    for (const [label, action] of [
        ['Open Runtime Routes', () => host?.openRuntimeSection('routes')],
        ['Prompt Programs', () => host?.openLibrarySection('prompt-programs')],
        ['Storage & privacy', () => host?.openUtility('account')],
        ['Diagnostics', () => host?.openUtility('diagnostics')],
    ]) {
        const button = makeButton(documentRef, label);
        button.addEventListener('click', action);
        destinations.append(button);
    }
    frame.body.append(grid, destinations);
    body.replaceChildren(frame.root);
    return { root: frame.root, dispose() {
        for (const [node, placement] of placements.reverse()) restorePlacement(node, placement);
        frame.root.remove();
    } };
}

export async function mountAccountUtility({ document: documentRef = globalThis.document, slot, body = slot, accountAuthority } = {}) {
    const frame = makeUtilityFrame(documentRef, { id: 'account', title: 'Account', description: 'Your profile, data and recovery options.' });
    frame.body.dataset.atriaAccountPrimary = 'true';
    let disposed = false;
    let loading = false;
    async function loadProfile() {
        if (loading || disposed) return;
        loading = true;
        const mount = documentRef.createElement('div');
        frame.body.replaceChildren(createLocalizedStatePanel(documentRef, 'loading', { title: 'Account', message: 'Loading your profile…' }));
        try {
            // The account controller owns identity, permissions and every action.
            const authority = accountAuthority || await import('../user.js');
            if (disposed) return;
            const profile = await authority.openUserProfile({ container: mount });
            if (disposed) return;
            if (profile) profile.dataset.atriaAccountEmbedded = 'true';
            frame.body.replaceChildren(mount);
        } catch (error) {
            if (disposed) return;
            const panel = createLocalizedStatePanel(documentRef, 'error', { title: 'Could not load your profile', message: error?.message || String(error) });
            const retry = makeButton(documentRef, 'Try again');
            retry.addEventListener('click', loadProfile);
            panel.append(retry);
            frame.body.replaceChildren(panel);
        } finally { loading = false; }
    }
    body.replaceChildren(frame.root);
    void loadProfile();
    return { root: frame.root, dispose() { disposed = true; frame.root.remove(); } };
}
