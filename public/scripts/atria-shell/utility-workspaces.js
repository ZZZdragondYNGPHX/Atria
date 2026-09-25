import { createAtriaStatePanel } from './primitives.js';
import { translateShellText } from './localization.js';
import { createAtriaIcon } from './icons.js';
import { el, action, disclosure, feedback } from '../native/library-ui.js';
import { permissionRow } from '../native/package-permissions.js';
import { nativeProductClient } from '../native/product-client.js';

export const ATRIA_THEME_CSS_EXAMPLE = ':root:root {\n  --atri-accent: #7c6aef;\n  --atri-canvas: #15131c;\n  --atri-surface-1: #201d29;\n  --atri-text-primary: #f5f3ff;\n}';

function createLocalizedStatePanel(documentRef, kind, options = {}) {
    return createAtriaStatePanel(documentRef, kind, {
        ...options,
        title: translateShellText(options.title),
        message: translateShellText(options.message),
    });
}

export const GLOBAL_PLUGINS = Object.freeze(['regex', 'search-tools']);

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
        ariaLabel: node.getAttribute('aria-label'),
        ariaDescribedBy: node.getAttribute('aria-describedby'),
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
    for (const [attribute, value] of [['aria-label', placement.ariaLabel], ['aria-describedby', placement.ariaDescribedBy]]) {
        if (value === null) node.removeAttribute(attribute);
        else node.setAttribute(attribute, value);
    }
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

export function classifyPluginEntries({ disabledPlugins = [] } = {}) {
    return GLOBAL_PLUGINS.map(name => ({ name, displayName: name === 'regex' ? 'Regex' : 'Search Tools', enabled: !disabledPlugins.includes(name) }));
}

async function resolveExtensionAuthority(extensionAuthority) {
    if (extensionAuthority) return extensionAuthority;
    return await import('../capability-host.js');
}

export async function mountPluginsUtility({
    document: doc = globalThis.document, slot, body = slot, extensionAuthority,
    productClient = nativeProductClient, host = globalThis.Atria?.shell?.getWorkspaceHost?.(),
} = {}) {
    const frame = makeUtilityFrame(doc, { id: 'plugins', title: 'Plugins', description: 'Work capabilities and your global tools.' });
    body.replaceChildren(frame.root);
    let disposed = false, loading = false;
    const placements = [], listeners = [];
    const refresh = makeButton(doc, 'Refresh', { icon: 'fa-solid fa-rotate' }); frame.actions.append(refresh);
    const works = el(doc, 'section', 'atria-native-plugin-surface', undefined, frame.body); works.dataset.atriaPluginSurface = 'work';
    el(doc, 'h3', '', translateShellText('Work Plugins'), works);
    el(doc, 'p', '', translateShellText('Included with an exact installed Work version. Manage permissions and dependencies with that Work.'), works);
    const workList = el(doc, 'div', 'atria-native-plugin-list-host', undefined, works);
    const globals = el(doc, 'section', 'atria-plugin-list', undefined, frame.body); globals.dataset.atriaPluginSurface = 'global';
    el(doc, 'h3', '', translateShellText('Global Plugins'), globals);
    const authority = await resolveExtensionAuthority(extensionAuthority);
    if (!body.contains(frame.root)) return { root: frame.root, dispose() { frame.root.remove(); } };
    for (const plugin of classifyPluginEntries({ disabledPlugins: authority.capabilitySettings?.disabledPlugins || [] })) {
        const card = el(doc, 'article', 'atria-plugin-card', undefined, globals); card.dataset.atriaPlugin = plugin.name;
        el(doc, 'h4', '', translateShellText(plugin.displayName), card);
        el(doc, 'p', '', translateShellText(plugin.name === 'regex' ? 'Transform text with your saved rules. Runs locally without a network permission.' : 'Search and visit external sources using your configured providers. Review provider access in its settings.'), card);
        const label = el(doc, 'label', 'atria-plugin-toggle', undefined, card), toggle = el(doc, 'input', '', undefined, label);
        toggle.type = 'checkbox'; toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-label', translateShellText(plugin.displayName)); toggle.checked = plugin.enabled;
        const state = el(doc, 'span', '', translateShellText(plugin.enabled ? 'Enabled' : 'Disabled'), label);
        const status = el(doc, 'p', 'atria-plugin-feedback', undefined, card); status.setAttribute('role', 'status');
        toggle.addEventListener('change', async () => {
            const desired = toggle.checked; toggle.disabled = true; card.dataset.saveState = 'saving';
            try {
                await (desired ? authority.enableGlobalPlugin(plugin.name, false) : authority.disableGlobalPlugin(plugin.name, false));
                if (disposed) return;
                state.textContent = translateShellText(desired ? 'Enabled' : 'Disabled'); card.dataset.saveState = 'saved';
                status.textContent = translateShellText('Saved. Reload Atria to apply plugin changes.');
            } catch {
                if (disposed) return;
                toggle.checked = !desired; card.dataset.saveState = 'error'; status.textContent = translateShellText('Could not save this change. Try again.');
            } finally { toggle.disabled = false; }
        });
        const settings = disclosure(doc, card, 'Plugin settings'); settings.dataset.atriaGlobalPluginSettings = plugin.name;
        const mountSettings = () => {
            if (settings.querySelector('[data-atria-workspace-embedded]')) return;
            const node = doc.getElementById(plugin.name === 'regex' ? 'regex_container' : 'search_tools_settings');
            if (!node || !node.childElementCount) {
                settings.querySelector('.atri-library-feedback')?.remove();
                feedback(doc, settings, translateShellText('Settings are unavailable. Enable this plugin and reload Atria, then retry.'));
                return;
            }
            settings.querySelector('.atri-library-feedback')?.remove();
            placements.push([node, savePlacement(doc, node)]); node.dataset.atriaWorkspaceEmbedded = 'true'; settings.append(node);
            // Preserve the existing handlers while making the retained drawer keyboard-operable.
            for (const header of node.querySelectorAll('.inline-drawer-header.inline-drawer-toggle')) {
                if (header.matches('button, summary, a, input')) continue;
                const attributes = ['role', 'tabindex', 'aria-expanded'].map(name => [name, header.getAttribute(name)]);
                const sync = () => header.setAttribute('aria-expanded', String(Boolean(header.querySelector('.inline-drawer-icon.up, .fa-circle-chevron-up'))));
                header.setAttribute('role', 'button'); header.tabIndex = 0; sync();
                const observer = new MutationObserver(sync); observer.observe(header, { subtree: true, attributes: true, attributeFilter: ['class'] });
                const keydown = event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); header.click(); } };
                header.addEventListener('keydown', keydown);
                listeners.push(() => { observer.disconnect(); header.removeEventListener('keydown', keydown); for (const [name, value] of attributes) { if (value === null) header.removeAttribute(name); else header.setAttribute(name, value); } });
            }
        };
        settings.addEventListener('toggle', () => { if (settings.open) mountSettings(); });
        action(doc, settings, 'Retry settings', mountSettings);
    }
    function renderVersion(parent, work, exact) {
        const manifest = exact.manifest, plugins = manifest.runtime?.plugins || [];
        for (const plugin of plugins) {
            const card = el(doc, 'article', 'atria-plugin-card', undefined, parent); card.dataset.atriaNativePlugin = plugin.pluginId;
            el(doc, 'h4', '', plugin.displayName || translateShellText('Work plugin'), card);
            el(doc, 'p', 'atria-plugin-card__metadata', manifest.name + ' · ' + manifest.version + ' · ' + plugin.version, card);
            el(doc, 'p', '', translateShellText('Installed with this Work version'), card);
            const deps = disclosure(doc, card, 'Plugin dependencies');
            if (!plugin.dependencies?.length) el(doc, 'p', '', translateShellText('No plugin dependencies'), deps);
            for (const dependency of plugin.dependencies || []) {
                const target = plugins.find(value => value.pluginId === dependency.pluginId && value.version === dependency.version);
                el(doc, 'p', '', (target?.displayName || translateShellText('Unavailable dependency')) + ' · ' + dependency.version + ' · ' + translateShellText(target ? 'Included' : dependency.optional ? 'Optional' : 'Required'), deps);
                disclosure(doc, deps, 'Details', dependency);
            }
            const permissions = disclosure(doc, card, 'Work permissions');
            for (const permission of manifest.permissions || []) permissionRow(doc, permissions, permission, { installed: true });
            if (!manifest.permissions?.length) el(doc, 'p', '', translateShellText('This version declares no permissions.'), permissions);
            el(doc, 'p', '', translateShellText('Permissions use installation-time consent. Required declarations are accepted when installing; optional declarations have no separate stored grant.'), permissions);
            action(doc, card, 'Manage owning Work', () => host?.openLibraryWork(work.package.packageId, manifest.name));
            disclosure(doc, card, 'Details', { packageId: work.package.packageId, packageVersionId: exact.packageVersion.packageVersionId, plugin });
        }
        return plugins.length;
    }
    async function load() {
        if (loading || disposed) return; loading = true; refresh.disabled = true;
        workList.replaceChildren(createLocalizedStatePanel(doc, 'loading', { title: 'Work Plugins', message: 'Loading plugins from your installed works…' }));
        try {
            const inventory = await productClient.listWorks(); if (disposed) return;
            workList.replaceChildren(); let count = 0, failures = 0;
            for (const item of inventory) {
                const group = el(doc, 'section', 'atria-plugin-list', undefined, workList);
                try {
                    const work = await productClient.getWork(item.package.packageId); if (disposed) return;
                    const results = await Promise.allSettled(work.versions.map(version => productClient.getWorkVersion(work.package.packageId, version.packageVersionId)));
                    if (disposed) return;
                    for (const result of results) {
                        if (result.status === 'fulfilled') count += renderVersion(group, work, result.value);
                        else failures++;
                    }
                } catch { failures++; }
            }
            if (!count && !failures) workList.append(createLocalizedStatePanel(doc, 'empty', { title: 'No Work plugins yet', message: 'Plugins included with your installed works will appear here.' }));
            if (failures) { feedback(doc, workList, translateShellText('Some Work versions could not be loaded. Results may be incomplete.'), true); action(doc, workList, 'Try again', load); }
            frame.root.dataset.atriaNativePluginCount = String(count);
        } catch {
            if (!disposed) { workList.replaceChildren(); feedback(doc, workList, translateShellText('Work plugins could not be loaded.'), true); action(doc, workList, 'Try again', load); }
        } finally { loading = false; refresh.disabled = false; }
    }
    refresh.addEventListener('click', load); await load();
    return { root: frame.root, dispose() { disposed = true; for (const remove of listeners) remove(); for (const [node, placement] of placements) restorePlacement(node, placement); frame.root.remove(); } };
}

// Preference-only host bridge: move existing controls with their event handlers and
// persistence, never the unfiltered User Settings drawer or generation controls.
export const PREFERENCE_CONTROLS = Object.freeze({
    appearance: ['UI-presets-block', 'color-picker-block', 'customCSS', 'font_scale'],
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
            const row = documentRef.createElement(['color-picker-block', 'customCSS'].includes(controlId) ? 'details' : 'div');
            row.className = 'atria-preference-row';
            if (['color-picker-block', 'customCSS'].includes(controlId)) {
                row.dataset.atriaSettingsCompatibility = 'preferences-only';
                const summary = documentRef.createElement('summary');
                summary.textContent = translateShellText(controlId === 'customCSS' ? 'Custom CSS' : 'Advanced appearance controls');
                row.append(summary);
                if (controlId === 'customCSS') {
                    const help = documentRef.createElement('p');
                    help.id = 'atria-custom-theme-help';
                    help.textContent = translateShellText('Edit Atria tokens below, then update the theme or save as a new theme.');
                    const example = documentRef.createElement('pre');
                    example.textContent = ATRIA_THEME_CSS_EXAMPLE;
                    node.setAttribute('aria-label', translateShellText('Custom CSS'));
                    node.setAttribute('aria-describedby', help.id);
                    row.append(help, example);
                }
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
