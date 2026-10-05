import { confirmAtriaDraftLeave, observeAtriaDrafts } from '../atria-shell/workspace-leave-guard.js';
import { mountIllustrationSettings } from './illustration-settings-ui.js';
import { el, action, field, feedback, confirmLibraryAction } from './library-ui.js';
import { nativeExtensionsClient } from './extensions-client.js';
import { nativeProductClient } from './product-client.js';
import { runtimeRequest } from './runtime-client.js';
import { translateShellText as tl } from '../atria-shell/localization.js';
import { mountSkillsWorkspace } from '../atria-shell/library-runtime-workspaces.js';
import { mountPluginsUtility } from '../atria-shell/utility-workspaces.js';

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
    const tabs = extensionTabs(doc, root, [['skills', 'Skills'], ['plugins', 'Plugins']], 'skills', show);
    root.append(content);
    async function show(tab) {
        if (!confirmAtriaDraftLeave(doc, content)) return;
        const token = ++sequence; child?.dispose(); child = null;
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
                : mountExtensionPlugins({ document: doc, body: mount, ...dependencies });
        } catch (error) { if (!disposed && token === sequence) feedback(doc, mount, error.message, true); }
        if (disposed || token !== sequence) controller?.dispose(); else child = controller;
    }
    void show('skills');
    return { root, dispose() { disposed = true; sequence++; drafts.dispose(); child?.dispose(); root.remove(); } };
}

export function mountExtensionPlugins({ document: doc = document, body, client = nativeExtensionsClient,
    productClient = nativeProductClient, presets = () => runtimeRequest('/presets'), runtime = globalThis.Atria?.extensions,
    confirm = confirmLibraryAction, ...dependencies } = {}) {
    const root = el(doc, 'section', 'atri-extension-plugins', undefined, body);
    const drafts = observeAtriaDrafts({ document: doc, root });
    let kind = 'external', disposed = false, sequence = 0, builtins, saving = false, receipt = null;
    const tabs = extensionTabs(doc, root, [['external', 'External plugins'], ['local', 'Local scripts'], ['builtin', 'Built-in tools'], ['official', '官方插件']], kind, async next => { if (saving || !confirmAtriaDraftLeave(doc, content)) return; kind = next; await load(); });
    const tools = el(doc, 'div', 'atria-utility-workspace__actions', undefined, root);
    const content = el(doc, 'div', 'atri-extension-list', undefined, root);
    const runtimeStatus = el(doc, 'p', '', undefined, root); runtimeStatus.setAttribute('role', 'status');
    function status() {
        const state = runtime?.getStatus();
        runtimeStatus.textContent = state?.error || '';
        for (const node of content.querySelectorAll('[data-extension-status]')) {
            const item = state?.plugins?.find(item => item.id === node.dataset.extensionStatus);
            node.textContent = item ? tl(item.state) + (item.error ? ': ' + item.error : '') : tl('Inactive in the current context');
        }
    }
    const unsubscribe = runtime?.subscribe(status);
    async function load() {
        const token = ++sequence; builtins?.dispose(); builtins = null;
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
                action(doc, tools, 'New script', () => edit());
                const upload = field(doc, tools, 'Import JavaScript', '', 'file'); upload.accept = '.js,text/javascript';
                upload.addEventListener('change', async () => {
                    const file = upload.files?.[0]; if (!file) return;
                    try {
                        if (!/\.js$/i.test(file.name) || file.size > 4 * 1024 * 1024) throw new Error(tl('Choose a JavaScript file up to 4 MiB.'));
                        const source = await file.text();
                        if (!disposed && token === sequence) await edit(null, source, file.name.replace(/\.js$/i, ''));
                    } catch (error) { feedback(doc, tools, error.message, true); }
                    upload.value = '';
                });
            } else {
                const url = field(doc, tools, 'HTTPS repository URL', '', 'url');
                action(doc, tools, 'Install', async () => { receipt = await client.install(url.value.trim()); await load(); });
            }
            const list = await client.list();
            if (disposed || token !== sequence) return;
            content.replaceChildren();
            const matches = list.filter(item => item.kind === kind);
            if (!matches.length) feedback(doc, content, 'No extensions in this category.');
            for (const item of matches) {
                const card = el(doc, 'article', 'atria-plugin-card', undefined, content); card.dataset.extensionId = item.id;
                el(doc, 'h3', '', item.name, card);
                el(doc, 'p', '', tl(item.enabled ? 'Enabled' : 'Disabled'), card);
                if (item.sourceUrl) el(doc, 'p', '', item.sourceUrl, card);
                el(doc, 'p', '', '', card).dataset.extensionStatus = item.id;
                action(doc, card, 'Edit', () => edit(item.id));
                if (kind === 'external') action(doc, card, 'Update', async () => {
                    if (await confirm('Update this plugin? It will be disabled until you enable it again.')) { receipt = await client.install(item.sourceUrl, { id: item.id, expectedRevision: item.revision }); await load(); }
                });
                action(doc, card, 'Delete', async () => {
                    if (await confirm('Delete this extension?')) { await client.remove(item.id, item.revision); await load(); }
                }, { danger: true });
            }
            if (receipt) { feedback(doc, content, 'Saved successfully.'); receipt = null; }
            status();
        } catch (error) { if (!disposed && token === sequence) { content.replaceChildren(); feedback(doc, content, receipt ? 'Saved, but the list could not refresh. Reload to see the saved version.' : error.message, true); } }
    }
    async function edit(id, source = 'export function activate(atria) {\n    // Register resources with atria.onDispose or use the SDK helpers.\n}\n', suggestedName = '') {
        if (saving || !confirmAtriaDraftLeave(doc, content)) return;
        const token = ++sequence;
        const [record, works, promptPresets] = await Promise.all([id ? client.get(id) : null, productClient.listWorks(), presets()]);
        if (disposed || token !== sequence) return;
        const value = record || { name: suggestedName, kind: 'local', enabled: false, targets: { global: false, presets: [], works: [] }, entrypoint: 'index.js', files: { 'index.js': source }, sourceUrl: null };
        tools.replaceChildren(); content.replaceChildren();
        const form = el(doc, 'fieldset', 'atri-extension-editor', undefined, content);
        el(doc, 'legend', '', tl(id ? 'Edit extension' : 'New script'), form);
        const name = field(doc, form, 'Name', value.name); name.maxLength = 100;
        const enabled = field(doc, form, 'Enabled', '', 'checkbox'); enabled.checked = value.enabled;
        el(doc, 'p', '', tl('Extensions run trusted JavaScript in Atria. Enable only code you trust.'), form);
        const scope = el(doc, 'fieldset', '', undefined, form); el(doc, 'legend', '', tl('Run in these scopes'), scope);
        el(doc, 'p', '', tl('Any matching scope activates this script once. Work covers the entire Package.'), scope);
        const global = field(doc, scope, 'Global', '', 'checkbox'); global.checked = value.targets.global;
        const selections = {};
        for (const [key, label, rows] of [
            ['presets', 'Prompt presets', promptPresets.map(item => ({ id: item.presetId, name: item.displayName }))],
            ['works', 'Works', works.map(item => ({ id: item.package.packageId, name: item.package.displayName }))],
        ]) {
            const group = el(doc, 'fieldset', '', undefined, scope); el(doc, 'legend', '', tl(label), group);
            const byId = new Map(rows.map(item => [item.id, item]));
            for (const selected of value.targets[key]) if (!byId.has(selected)) byId.set(selected, { id: selected, name: tl('Unavailable') });
            selections[key] = [];
            if (!byId.size) el(doc, 'p', '', tl('No items available.'), group);
            for (const item of byId.values()) {
                const input = field(doc, group, `${item.name || item.id} · ${item.id}`, '', 'checkbox');
                input.value = item.id; input.checked = value.targets[key].includes(item.id); selections[key].push(input);
            }
        }
        let code;
        if (value.kind === 'local') {
            const label = el(doc, 'label', 'atri-library-field', tl('JavaScript'), form);
            code = el(doc, 'textarea', 'atri-extension-code', undefined, label); code.value = value.files['index.js']; code.spellcheck = false;
        } else {
            el(doc, 'p', '', value.sourceUrl, form);
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
    return { root, dispose() { disposed = true; sequence++; drafts.dispose(); unsubscribe?.(); builtins?.dispose(); root.remove(); } };
}
