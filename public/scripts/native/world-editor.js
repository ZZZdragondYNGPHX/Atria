import { nativeStudioClient } from './studio-client.js';
import { nativeProductClient } from './product-client.js';
import { knowledgeFormControls } from './knowledge-form-controls.js';
import { el, action, disclosure, feedback } from './library-ui.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

const clone = value => structuredClone(value);
const typeOf = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const empty = type => ({ string: '', number: 0, boolean: false, null: null, object: {}, array: [] })[type];
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function mountWorldEditor({ document: doc, root, value, label = 'World revision JSON', onReview, projectSource = null, library = null }) {
    let draft = clone(value); let source = ''; let advanced = false; let catalog = null;
    const revision = () => draft.revision || draft;
    const shell = el(doc, 'section', 'atri-world-editor atri-knowledge-fields', undefined, root);
    const toolbar = el(doc, 'div', 'atri-library-actions', undefined, shell);
    const body = el(doc, 'div', 'atri-knowledge-fields', undefined, shell);
    const status = el(doc, 'div', '', undefined, shell);
    const { input, checkbox } = knowledgeFormControls(doc, render);
    const toggle = action(doc, toolbar, 'Source', () => {
        if (advanced) { const parsed = JSON.parse(source); validate(parsed); draft = parsed; } else source = JSON.stringify(draft, null, 2);
        advanced = !advanced; render();
    });
    function validate(value) {
        const rev = value.revision || value;
        if (!plain(rev) || !plain(rev.schema ?? {}) || !plain(rev.baseline ?? {})) throw new TypeError(tl('World schema and baseline must be objects.'));
        for (const [key, available] of [['knowledgeBindingIds', catalog?.bindings], ['assetIds', catalog?.assets]]) {
            const ids = rev[key] || [];
            if (!Array.isArray(ids) || new Set(ids).size !== ids.length) throw new TypeError(key + ' ' + tl('must contain unique references'));
            for (const id of ids) if (!available?.some(item => item.id === id)) throw new TypeError(tl('Resolve missing dependencies before review.') + ' ' + id);
        }
        const visit = value => { if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError(tl('Enter a finite number.')); if (value && typeof value === 'object') Object.values(value).forEach(visit); }; visit(rev);
    }
    function properties(parent, object, path) {
        for (const [key, value] of Object.entries(object)) {
            const row = el(doc, 'div', 'atri-knowledge-rule', undefined, parent); const name = path + '.' + key;
            el(doc, 'h4', '', key, row);
            input(row, name + ' type', typeOf(value), next => { object[key] = empty(next); render(); }, 'text', ['string', 'number', 'boolean', 'null', 'object', 'array']);
            if (value && typeof value === 'object') properties(row, value, name);
            else if (typeof value === 'boolean') checkbox(row, name, value, next => { object[key] = next; });
            else if (value !== null) input(row, name, value, next => { object[key] = typeof value === 'number' ? next === '' ? NaN : Number(next) : next; }, typeof value === 'number' ? 'number' : 'text');
            action(doc, row, 'Remove field', () => { if (Array.isArray(object)) object.splice(Number(key), 1); else delete object[key]; render(); });
        }
        const controls = el(doc, 'div', 'atri-library-actions', undefined, parent);
        const name = Array.isArray(object) ? null : input(controls, path + ' new field', '', () => {});
        action(doc, controls, 'Add field', () => {
            const key = name ? name.value.trim() : String(object.length);
            if (!key || ['__proto__', 'constructor', 'prototype'].includes(key) || Object.hasOwn(object, key)) throw new TypeError(tl('Enter a new unique field name.'));
            object[key] = ''; render();
        });
    }
    function dependencies(parent, title, key, items) {
        const section = disclosure(doc, parent, title); section.open = true;
        const selected = revision()[key] ||= [];
        for (const item of items) {
            const row = el(doc, 'div', 'atri-library-version', undefined, section);
            checkbox(row, item.name, selected.includes(item.id), checked => {
                const ids = new Set(revision()[key]); if (checked) ids.add(item.id); else ids.delete(item.id); revision()[key] = [...ids];
            });
            el(doc, 'p', 'atri-library-meta', item.exact || tl('Project-owned source'), row);
            disclosure(doc, row, 'Details', { id: item.id, revision: item.exact, source: item.source });
        }
        for (const id of selected.filter(id => !items.some(item => item.id === id))) {
            const row = el(doc, 'div', 'atri-library-version', undefined, section); el(doc, 'p', '', tl('Missing dependency') + ' ' + id, row);
            action(doc, row, 'Remove missing reference', () => { revision()[key] = revision()[key].filter(value => value !== id); render(); });
        }
        if (!items.length) el(doc, 'p', 'atri-library-meta', tl(projectSource ? 'Attach or fork resources in Library before composing this World.' : 'No available dependencies. Create resources in Library first.'), section);
    }
    function render() {
        if (!catalog) return;
        body.replaceChildren(); toggle.textContent = tl(advanced ? 'Fields' : 'Source');
        if (advanced) input(body, label, source, value => { source = value; }, 'textarea').rows = 18;
        else {
            for (const [key, title] of [['baseline', 'World baseline'], ['schema', 'World schema']]) {
                const section = disclosure(doc, body, title); section.open = true;
                properties(section, revision()[key] ||= {}, key);
            }
            dependencies(body, 'Knowledge bindings', 'knowledgeBindingIds', catalog.bindings);
            dependencies(body, 'World assets', 'assetIds', catalog.assets);
        }
        action(doc, body, 'Review Changes', async () => {
            const next = advanced ? JSON.parse(source) : draft; validate(next);
            shell.inert = true;
            const rev = next.revision || next;
            const dependencies = [...catalog.bindings.filter(item => rev.knowledgeBindingIds?.includes(item.id)), ...catalog.assets.filter(item => rev.assetIds?.includes(item.id))];
            try { await onReview(clone(next), { dependencies }); } finally { shell.inert = false; }
        }, { primary: true });
    }
    async function load() {
        status.replaceChildren(); feedback(doc, status, tl('Loading dependencies…')); toggle.disabled = true;
        try {
            const entries = library || await nativeStudioClient.listLibraryResources();
            const allowedBindings = projectSource ? new Set(projectSource.dependencies.knowledgeBindings) : null;
            const bindings = await Promise.all(entries.filter(item => item.resourceType === 'core.knowledge-binding' && (!allowedBindings || allowedBindings.has(item.resourceId))).map(async item => {
                const { binding } = await nativeProductClient.getKnowledgeBinding(item.resourceId);
                return { id: item.resourceId, name: binding.metadata?.displayName || item.displayName, exact: binding.source.knowledgeRevisionId, source: binding.source.kind };
            }));
            for (const binding of projectSource?.knowledgeBindings || []) bindings.push({ id: binding.knowledgeBindingId, name: binding.metadata?.displayName || projectSource.knowledge.find(item => item.knowledgeBase.knowledgeBaseId === binding.source.knowledgeBaseId)?.knowledgeBase.displayName || binding.knowledgeBindingId, exact: binding.source.knowledgeRevisionId, source: 'project' });
            const assets = entries.filter(item => item.resourceType === 'core.asset' && (!projectSource || projectSource.dependencies.assets.some(ref => ref.assetId === item.resourceId && ref.contentHash === item.currentRevision))).map(item => ({ id: item.resourceId, name: item.displayName, exact: item.currentRevision, source: 'library' }));
            for (const item of projectSource?.assetFiles || []) assets.push({ id: item.assetId, name: item.logicalName || item.path, source: item.path });
            catalog = { bindings, assets }; status.replaceChildren(); toggle.disabled = false; render();
        } catch (error) { status.replaceChildren(); feedback(doc, status, error.message, true); action(doc, status, 'Try again', load); }
    }
    void load();
    return { getDraft: () => clone(draft) };
}
