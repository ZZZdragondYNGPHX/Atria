import { confirmAtriaDraftLeave, observeAtriaDrafts } from '../atria-shell/workspace-leave-guard.js';
import { mountIllustrationSettings } from './illustration-settings-ui.js';
import { el, action, field, feedback, libraryError } from './library-ui.js';
import { nativeExtensionsClient, extensionFileUrl } from './extensions-client.js';
import { createExtensionSdk } from './extension-sdk.js';
import { readExtensionBundle } from '../../shared/generation-extension-contract.js';
import { nativeProductClient } from './product-client.js';
import { runtimeRequest } from './runtime-client.js';
import { translateShellText as tl } from '../atria-shell/localization.js';
import { mountSkillsWorkspace } from '../atria-shell/library-runtime-workspaces.js';
import { mountPluginsUtility } from '../atria-shell/utility-workspaces.js';

// Per-browser convenience only: reopening Extensions returns to the last tab used.
function rememberedTab(key) { try { return globalThis.sessionStorage?.getItem('atria.extensions.tab.' + key) || null; } catch { return null; } }
function rememberTab(key, value) { try { globalThis.sessionStorage?.setItem('atria.extensions.tab.' + key, value); } catch { /* storage unavailable */ } }

export function extensionTabs(doc, parent, items, selected, change) {
    const nav = el(doc, 'nav', 'atria-domain-workspace__tabs', undefined, parent);
    nav.setAttribute('aria-label', tl('Extensions'));
    for (const [id, label] of items) {
        const button = action(doc, nav, label, () => change(id));
        button.dataset.extensionTab = id;
        button.classList.toggle('is-selected', id === selected);
        button.setAttribute('aria-current', id === selected ? 'page' : 'false');
    }
    return nav;
}

/** One manager; the historical utility route remains a deep-link alias. */
export function mountExtensionsWorkspace({ document: doc = document, body, slot = body, route, ...dependencies } = {}) {
    body ||= slot;
    const root = el(doc, 'section', 'atria-utility-workspace atri-extensions');
    root.dataset.atriaUtilityWorkspace = 'extensions'; body.replaceChildren(root);
    el(doc, 'h2', '', tl('Extensions'), root);
    const drafts = observeAtriaDrafts({ document: doc, root });
    let child, disposed = false, sequence = 0;
    const content = el(doc, 'div', 'atri-extensions-content');
    // `utility.plugins:official` deep-links to the official plugins (e.g. illustration advanced settings).
    const pluginKind = route?.child?.id?.split(':')[1] === 'official' ? 'official' : null;
    const initialTab = pluginKind ? 'plugins' : rememberedTab('extensions') ?? 'skills';
    const tabs = extensionTabs(doc, root, [['skills', 'Skills'], ['plugins', 'Plugins']], initialTab, show);
    root.append(content);
    async function show(tab) {
        if (!confirmAtriaDraftLeave(doc, content)) return;
        const token = ++sequence; child?.dispose(); child = null; rememberTab('extensions', tab);
        for (const button of tabs.children) {
            button.classList.toggle('is-selected', button.dataset.extensionTab === tab);
            button.setAttribute('aria-current', button.dataset.extensionTab === tab ? 'page' : 'false');
        }
        // Detached mounts cannot replace a newer tab while awaiting imports.
        const mount = el(doc, 'div', 'atri-extensions-content'); content.replaceChildren(mount);
        let controller;
        try {
            controller = tab === 'skills'
                ? await mountSkillsWorkspace({ document: doc, body: mount, route, organization: true })
                : mountExtensionPlugins({ document: doc, body: mount, ...(pluginKind ? { kind: pluginKind } : {}), ...dependencies });
        } catch (error) { if (!disposed && token === sequence) feedback(doc, mount, error.message, true); }
        if (disposed || token !== sequence) controller?.dispose(); else child = controller;
    }
    void show(initialTab);
    return { root, dispose() { disposed = true; sequence++; drafts.dispose(); child?.dispose(); root.remove(); } };
}

export function mountExtensionPlugins({ document: doc = document, body, client = nativeExtensionsClient,
    productClient = nativeProductClient, presets = () => runtimeRequest('/presets'), runtime = globalThis.Atria?.extensions,
    kind: initialKind = rememberedTab('plugins') ?? 'local', ...dependencies } = {}) {
    const root = el(doc, 'section', 'atri-extension-plugins', undefined, body);
    const drafts = observeAtriaDrafts({ document: doc, root });
    let kind = initialKind, disposed = false, sequence = 0, builtins, saving = false, receipt = null, settingsOwner;
    const tabs = extensionTabs(doc, root, [['local', 'Installed from file'], ['external', 'From Git'], ['official', 'Official'], ['builtin', 'Built-in tools']], kind, async next => { if (saving || !confirmAtriaDraftLeave(doc, content)) return; kind = next; await load(); });
    const tools = el(doc, 'div', 'atria-utility-workspace__actions', undefined, root);
    const content = el(doc, 'div', 'atri-extension-list', undefined, root);
    const runtimeStatus = el(doc, 'p', '', undefined, root); runtimeStatus.setAttribute('role', 'status');
    function status() {
        const state = runtime?.getStatus();
        runtimeStatus.textContent = state?.error || '';
        for (const node of content.querySelectorAll('[data-extension-status]')) {
            const item = state?.plugins?.find(item => item.id === node.dataset.extensionStatus);
            const label = { active: 'Running now', activating: 'Starting…', failed: 'Could not start' }[item?.state] ?? item?.state;
            node.textContent = item ? tl(label) + (item.error ? ': ' + item.error : '') : tl('Not running on this screen');
        }
    }
    // The extensions host may initialize after a deep-linked mount; attach once it exists.
    let unsubscribe = runtime?.subscribe(status);
    const attach = () => { if (unsubscribe || disposed) return; runtime = globalThis.Atria?.extensions; unsubscribe = runtime?.subscribe(status); status(); };
    if (!unsubscribe) doc.defaultView?.addEventListener('atria-extensions-ready', attach, { once: true });
    async function load() {
        const token = ++sequence; builtins?.dispose(); builtins = null; await settingsOwner?.dispose(); settingsOwner = null; rememberTab('plugins', kind);
        tools.replaceChildren(); content.replaceChildren(); feedback(doc, content, 'Loading…');
        for (const button of tabs.children) { const active = button.dataset.extensionTab === kind; button.classList.toggle('is-selected', active); button.setAttribute('aria-current', active ? 'page' : 'false'); }
        action(doc, tools, 'Refresh', () => { if (!saving && confirmAtriaDraftLeave(doc, content)) return load(); });
        try {
            if (kind === 'official') {
                content.replaceChildren();
                builtins = mountIllustrationSettings({ document: doc, parent: content });
                el(doc, 'p', '', '', builtins.root).dataset.extensionStatus = 'atri_official_illustration';
                status(); return;
            }
            if (kind === 'builtin') {
                const mount = el(doc, 'div'); content.replaceChildren(mount);
                const value = await mountPluginsUtility({ document: doc, body: mount, productClient, ...dependencies, builtinsOnly: true });
                if (disposed || token !== sequence) value?.dispose(); else builtins = value;
                return;
            }
            if (kind === 'local') {
                // Importing a file is the trust decision: the plugin is saved switched on and
                // running everywhere. A same-named plugin is updated in place, so its settings,
                // dictionaries and scope stay attached to the same plugin id.
                const upload = el(doc, 'input'); upload.type = 'file'; upload.hidden = true;
                upload.accept = '.js,.atria-plugin,text/javascript,application/json'; tools.append(upload);
                action(doc, tools, 'Import plugin file…', () => upload.click(), { primary: true });
                action(doc, tools, 'Write a script', () => edit());
                upload.addEventListener('change', async () => {
                    const file = upload.files?.[0]; upload.value = ''; if (!file) return;
                    try {
                        if (!/\.(js|atria-plugin)$/i.test(file.name) || file.size > 8 * 1024 * 1024) throw new Error('Choose a .atria-plugin package or a .js script (up to 8 MB).');
                        const source = await file.text();
                        if (disposed || token !== sequence) return;
                        receipt = await importLocal(source, file.name);
                        await load();
                    } catch (error) { feedback(doc, tools, libraryError(error), true); }
                });
            } else {
                const url = field(doc, tools, 'HTTPS repository URL', '', 'url');
                action(doc, tools, 'Install', async () => { receipt = await client.install(url.value.trim()); await load(); });
            }
            const list = await client.list();
            if (disposed || token !== sequence) return;
            content.replaceChildren();
            const matches = list.filter(item => item.kind === kind);
            if (!matches.length) feedback(doc, content, kind === 'local' ? 'No plugins yet. Import a .atria-plugin file to add one.' : 'No extensions in this category.');
            for (const item of matches) {
                const card = el(doc, 'article', 'atria-plugin-card', undefined, content); card.dataset.extensionId = item.id;
                const head = el(doc, 'div', 'atria-plugin-card__title-row', undefined, card);
                el(doc, 'h3', '', item.name, head);
                const toggle = el(doc, 'label', 'atri-extension-switch', undefined, head);
                const box = el(doc, 'input', '', undefined, toggle); box.type = 'checkbox'; box.checked = item.enabled; box.setAttribute('role', 'switch');
                const toggleText = el(doc, 'span', '', tl(item.enabled ? 'On' : 'Off'), toggle);
                box.setAttribute('aria-label', tl('Turn on') + ' ' + item.name);
                box.addEventListener('change', async () => {
                    box.disabled = true;
                    try {
                        const current = await client.get(item.id);
                        const { revision, ...next } = current; next.enabled = box.checked;
                        await client.save(next, revision);
                        if (!disposed && token === sequence) await load();
                    } catch (error) { box.checked = !box.checked; box.disabled = false; toggleText.textContent = tl(box.checked ? 'On' : 'Off'); feedback(doc, card, libraryError(error), true); }
                });
                el(doc, 'p', 'atria-plugin-card__scope', scopeSummary(item.targets), card);
                if (item.sourceUrl) el(doc, 'p', 'atria-plugin-card__metadata', item.sourceUrl, card);
                el(doc, 'p', 'atria-plugin-card__metadata', '', card).dataset.extensionStatus = item.id;
                const controls = el(doc, 'div', 'atria-plugin-card__actions', undefined, card);
                if (item.manifest?.settings) action(doc, controls, 'Settings', () => configure(item), { primary: true });
                action(doc, controls, item.manifest ? 'Where it runs' : 'Edit', () => edit(item.id));
                if (kind === 'external') action(doc, controls, 'Update', async () => {
                    if (!disposed && token === sequence) { receipt = await client.install(item.sourceUrl, { id: item.id, expectedRevision: item.revision }); await load(); }
                });
                action(doc, controls, 'Remove', async () => {
                    if (!disposed && token === sequence) { await client.remove(item.id, item.revision); await load(); }
                }, { danger: true });
            }
            if (receipt) { feedback(doc, content, typeof receipt === 'string' ? receipt : 'Saved successfully.'); receipt = null; }
            status();
        } catch (error) { if (!disposed && token === sequence) { content.replaceChildren(); feedback(doc, content, receipt ? 'Saved, but the list could not refresh. Reload to see the saved version.' : error.message, true); } }
    }
    function scopeSummary(targets) {
        if (!targets || targets.global) return tl('Runs in every story.');
        const count = targets.presets.length + targets.works.length;
        return count ? tl('Runs only in chosen works and prompt presets') + ` (${count})` : tl('Not set to run anywhere yet. Choose where it runs.');
    }
    async function importLocal(source, fileName) {
        const bundle = /\.atria-plugin$/i.test(fileName);
        const imported = bundle ? readExtensionBundle(source) : null;
        const name = (imported?.manifest.name ?? fileName.replace(/\.(js|atria-plugin)$/i, '')).trim().slice(0, 100);
        const files = imported?.files ?? { 'index.js': source };
        const entrypoint = imported?.manifest.entrypoint ?? 'index.js';
        const existing = (await client.list()).find(item => item.kind === 'local' && item.name === name);
        if (existing) {
            const { revision, ...current } = await client.get(existing.id);
            await client.save({ ...current, files, entrypoint }, revision);
            return tl('Updated') + ` “${name}”. ` + tl('Its settings and where it runs were kept.');
        }
        await client.save({ name, kind: 'local', enabled: true, targets: { global: true, presets: [], works: [] }, entrypoint, files, sourceUrl: null });
        return tl('Added') + ` “${name}”. ` + tl('It is on and runs in every story.');
    }
    async function configure(item) {
        if (!confirmAtriaDraftLeave(doc, content)) return;
        const token = ++sequence;
        tools.replaceChildren(); content.replaceChildren();
        action(doc, tools, '返回插件', load);
        const mount = el(doc, 'div', 'atri-extension-settings', undefined, content);
        settingsOwner = createExtensionSdk({ plugin: item, context: { configuration: true, sessionId: null, historical: false, ready: false },
            document: doc, root: mount, isCurrent: () => !disposed && sequence === token,
            nativeApi: () => null, subscribe: () => () => {}, report: error => feedback(doc, mount, error.message, true) });
        try {
            const module = await import(extensionFileUrl(item));
            if (disposed || token !== sequence) return;
            if (typeof module.configure !== 'function') throw new Error('插件未提供设置入口');
            const cleanup = await module.configure(settingsOwner.sdk);
            if (cleanup) settingsOwner.sdk.onDispose(cleanup);
        } catch (error) { if (!disposed && token === sequence) feedback(doc, mount, error.message, true); }
    }
    async function edit(id, source = 'export function activate(atria) {\n    // Register resources with atria.onDispose or use the SDK helpers.\n}\n', suggestedName = '', bundle = false) {
        if (saving || !confirmAtriaDraftLeave(doc, content)) return;
        const token = ++sequence;
        const [record, works, promptPresets] = await Promise.all([id ? client.get(id) : null, productClient.listWorks(), presets()]);
        if (disposed || token !== sequence) return;
        const imported = bundle ? readExtensionBundle(source) : null;
        const value = record || { name: imported?.manifest.name ?? suggestedName, kind: 'local', enabled: false, targets: { global: false, presets: [], works: [] }, entrypoint: imported?.manifest.entrypoint ?? 'index.js', files: imported?.files ?? { 'index.js': source }, sourceUrl: null };
        tools.replaceChildren(); content.replaceChildren();
        const form = el(doc, 'fieldset', 'atri-extension-editor', undefined, content);
        el(doc, 'legend', '', tl(id ? 'Edit extension' : 'New script'), form);
        const name = field(doc, form, 'Name', value.name); name.maxLength = 100;
        const enabled = field(doc, form, 'On', '', 'checkbox'); enabled.checked = id ? value.enabled : true;
        const scope = el(doc, 'fieldset', '', undefined, form); el(doc, 'legend', '', tl('Where it runs'), scope);
        const radio = (label, checked) => {
            const wrapper = el(doc, 'label', 'atri-library-field atri-extension-choice', undefined, scope);
            const input = el(doc, 'input', '', undefined, wrapper); input.type = 'radio'; input.name = 'extension-scope'; input.checked = checked;
            el(doc, 'span', '', tl(label), wrapper); return input;
        };
        const everywhere = !id || value.targets.global;
        const global = radio('Every story', everywhere);
        const limited = radio('Only in the works and prompt presets I choose', !everywhere);
        const choices = el(doc, 'div', 'atri-extension-choices', undefined, scope);
        const sync = () => { choices.hidden = global.checked; };
        global.addEventListener('change', sync); limited.addEventListener('change', sync); sync();
        const selections = {};
        for (const [key, label, rows] of [
            ['works', 'Works', works.map(item => ({ id: item.package.packageId, name: item.package.displayName }))],
            ['presets', 'Prompt presets', promptPresets.map(item => ({ id: item.presetId, name: item.displayName }))],
        ]) {
            const group = el(doc, 'fieldset', '', undefined, choices); el(doc, 'legend', '', tl(label), group);
            const byId = new Map(rows.map(item => [item.id, item]));
            for (const selected of value.targets[key]) if (!byId.has(selected)) byId.set(selected, { id: selected, name: tl('Unavailable') });
            selections[key] = [];
            if (!byId.size) el(doc, 'p', '', tl('No items available.'), group);
            // Same-named items stay distinguishable by a short id suffix instead of the full id.
            const names = rows.reduce((counts, item) => counts.set(item.name, (counts.get(item.name) ?? 0) + 1), new Map());
            for (const item of byId.values()) {
                const text = !item.name ? item.id : names.get(item.name) > 1 ? `${item.name} (${item.id.slice(-6)})` : item.name;
                const input = field(doc, group, text, '', 'checkbox'); input.title = item.id;
                input.value = item.id; input.checked = value.targets[key].includes(item.id); selections[key].push(input);
            }
        }
        let code;
        if (value.kind === 'local' && !value.files['atria.extension.json']) {
            const label = el(doc, 'label', 'atri-library-field', tl('JavaScript'), form);
            code = el(doc, 'textarea', 'atri-extension-code', undefined, label); code.value = value.files['index.js']; code.spellcheck = false;
        } else {
            if (value.sourceUrl) el(doc, 'p', '', value.sourceUrl, form);
            const files = el(doc, 'details', '', undefined, form); el(doc, 'summary', '', tl('Plugin files'), files);
            for (const [path, text] of Object.entries(value.files)) { const file = el(doc, 'details', '', undefined, files); el(doc, 'summary', '', path, file); el(doc, 'pre', '', text, file); }
        }
        const save = action(doc, form, 'Save', async () => {
            if (saving) return;
            saving = true; form.disabled = true;
            const navDisabled = [...tabs.children].map(button => button.disabled); [...tabs.children].forEach(button => button.disabled = true);
            let saved = false;
            try {
                const { revision: _revision, ...next } = value;
                next.name = name.value.trim(); next.enabled = enabled.checked;
                next.targets = { global: global.checked, presets: selections.presets.filter(input => input.checked).map(input => input.value), works: selections.works.filter(input => input.checked).map(input => input.value) };
                if (code) next.files = { 'index.js': code.value };
                receipt = await client.save(next, record?.revision ?? null); saved = true;
                form.dispatchEvent(new doc.defaultView.CustomEvent('atria-draft-committed', { bubbles: true }));
                if (!disposed && token === sequence) { await load(); tools.querySelector('button')?.focus(); }
            } catch (error) {
                if (!disposed && token === sequence) feedback(doc, form, error.status === 409 ? 'This extension changed elsewhere. Your draft is kept. Cancel and reopen it to load the current version.' : error.message, true);
            } finally { saving = false; form.disabled = saved; [...tabs.children].forEach((button, index) => button.disabled = navDisabled[index]); }
        }, { primary: true });
        save.dataset.extensionSave = 'true';
        action(doc, form, 'Cancel', async () => { if (saving || !confirmAtriaDraftLeave(doc, content)) return; await load(); tools.querySelector('button')?.focus(); });
        name.focus();
    }
    void load();
    return { root, dispose() { disposed = true; sequence++; drafts.dispose(); unsubscribe?.(); builtins?.dispose(); void settingsOwner?.dispose(); root.remove(); } };
}
