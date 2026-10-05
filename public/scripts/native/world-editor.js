import { formatShellText as fmt, translateShellText as tl } from '../atria-shell/localization.js';
import { nativeStudioClient } from './studio-client.js';
import { nativeProductClient } from './product-client.js';
import { knowledgeFormControls } from './knowledge-form-controls.js';
import { el, action, disclosure } from './library-ui.js';

const clone = value => structuredClone(value);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const typeOf = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const empty = type => ({ string: '', number: 0, boolean: false, null: null, object: {}, array: [] })[type];
const rootKeys = ['worldId', 'displayName', 'currentRevisionId', 'createdAt', 'updatedAt'];
const contentKeys = ['schema', 'baseline', 'knowledgeBindingIds', 'assetIds', 'metadata'];

// Pre-review UI guards; Project/Library services retain authoritative validation.
export function validateWorldEditorValue(value, snapshot = false) {
    const keys = (object, allowed, path) => {
        if (!plain(object)) throw new TypeError(path + ' ' + tl('Use a JSON object.'));
        const unknown = Object.keys(object).filter(key => !allowed.includes(key));
        if (unknown.length) throw new TypeError(path + ' ' + tl('Unsupported World fields. Remove them explicitly in Source:') + ' ' + unknown.join(', '));
    };
    const id = (value, prefix, path) => {
        if (typeof value !== 'string' || !new RegExp('^' + prefix + '_[0-9a-f]{32}$').test(value)) throw new TypeError(path + ' ' + tl('Use an exact Native ID.'));
    };
    const json = (value, path) => {
        if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError(path + ' ' + tl('Enter a finite number.'));
        if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => json(child, path + '.' + key));
    };
    const rev = snapshot ? value?.revision : value;
    if (snapshot) {
        keys(value, ['world', 'revision'], 'World snapshot'); keys(value.world, rootKeys, 'world');
        id(value.world.worldId, 'world', 'world.worldId'); id(value.world.currentRevisionId, 'worldv', 'world.currentRevisionId');
        if (typeof value.world.displayName !== 'string' || !value.world.displayName.length || value.world.displayName.length > 256) throw new TypeError('world.displayName ' + fmt('Enter text between 1 and ${0} characters.', [256]));
        keys(rev, [...contentKeys, 'worldId', 'worldRevisionId', 'createdAt'], 'revision');
        id(rev.worldId, 'world', 'revision.worldId'); id(rev.worldRevisionId, 'worldv', 'revision.worldRevisionId');
        if (rev.worldId !== value.world.worldId || rev.worldRevisionId !== value.world.currentRevisionId) throw new TypeError(tl('World snapshot identities and revision pin must match.'));
        for (const [object, names] of [[value.world, ['createdAt', 'updatedAt']], [rev, ['createdAt']]]) for (const key of names) {
            if (object[key] != null && (!Number.isSafeInteger(object[key]) || object[key] < 0)) throw new TypeError(key + ' ' + tl('Use a non-negative epoch-millisecond integer.'));
        }
    } else keys(rev, contentKeys, 'World content');
    for (const key of ['schema', 'baseline', 'metadata']) if (rev[key] !== undefined && !plain(rev[key])) throw new TypeError(key + ' ' + tl('Use a JSON object.'));
    for (const [key, prefix] of [['knowledgeBindingIds', 'kbind'], ['assetIds', 'asset']]) {
        const values = rev[key] === undefined ? [] : rev[key];
        if (!Array.isArray(values) || new Set(values).size !== values.length) throw new TypeError(key + ' ' + tl('Use an ordered array of unique exact IDs.'));
        values.forEach(value => id(value, prefix, key));
    }
    json(value, 'World');
}

export function mountWorldEditor({ document: doc, root, value, label = 'World revision JSON', onReview, projectSource = null, library = null, validate: validateTarget = () => {}, isCurrent = () => true }) {
    let draft = clone(value), source = '', advanced = false, disposed = false, loadSequence = 0;
    const snapshot = projectSource !== null;
    const initialDraft = JSON.stringify(draft);
    const revision = () => snapshot ? draft?.revision : draft;
    const shell = el(doc, 'section', 'atri-world-editor atri-knowledge-fields', undefined, root);
    const current = () => !disposed && root.contains(shell) && isCurrent();
    const toolbar = el(doc, 'div', 'atri-library-actions', undefined, shell);
    const body = el(doc, 'div', 'atri-knowledge-fields', undefined, shell);
    const status = el(doc, 'div', '', undefined, shell);
    const { input, checkbox } = knowledgeFormControls(doc, render);
    let catalog = { bindings: [], assets: [] }, catalogComplete = false;
    const dependencySections = new Map();
    const local = () => ({
        bindings: (projectSource?.knowledgeBindings || []).map(binding => ({ id: binding.knowledgeBindingId, name: binding.metadata?.displayName || binding.knowledgeBindingId, exact: binding.source.knowledgeRevisionId, source: 'project', state: 'ready' })),
        assets: (projectSource?.assetFiles || []).map(item => ({ id: item.assetId, name: item.logicalName || item.path, source: item.path, state: 'ready' })),
    });
    function markDirty() { shell.dataset.atriaDraftDirty = String(JSON.stringify(draft) !== initialDraft || advanced && source !== JSON.stringify(draft, null, 2)); }
    for (const event of ['input', 'change', 'click']) shell.addEventListener(event, () => queueMicrotask(markDirty));
    const note = (parent, text) => el(doc, 'p', 'atri-library-meta', tl(text), parent);
    const toggle = action(doc, toolbar, 'Source', () => {
        if (advanced) { const parsed = JSON.parse(source); validateWorldEditorValue(parsed, snapshot); draft = parsed; } else source = JSON.stringify(draft, null, 2);
        advanced = !advanced; render(); toggle.focus();
    });
    function validate(next) {
        validateWorldEditorValue(next, snapshot); validateTarget(next);
        const rev = snapshot ? next.revision : next;
        if (!projectSource) for (const [key, available] of [['knowledgeBindingIds', catalog.bindings], ['assetIds', catalog.assets]]) {
            for (const id of rev[key] || []) if (!catalogComplete || !available.some(item => item.id === id && item.state === 'ready')) throw new TypeError(tl('Resolve unavailable dependencies before review.') + ' ' + id);
        }
    }
    function properties(parent, object, path) {
        for (const [key, value] of Object.entries(object)) {
            const row = el(doc, 'div', 'atri-knowledge-rule', undefined, parent), name = path + '.' + key;
            el(doc, 'h4', '', key, row);
            input(row, fmt('${0} type', [name]), typeOf(value), next => { Object.defineProperty(object, key, { value: empty(next), enumerable: true, writable: true, configurable: true }); render(); }, 'text', ['string', 'number', 'boolean', 'null', 'object', 'array']);
            if (value && typeof value === 'object') properties(row, value, name);
            else if (typeof value === 'boolean') checkbox(row, name, value, next => { object[key] = next; });
            else if (value !== null) {
                const control = input(row, name, value, next => { object[key] = typeof value === 'number' ? next === '' ? NaN : Number(next) : next; }, typeof value === 'number' ? 'number' : 'text');
                if (typeof value === 'number') { control.step = 'any'; control.required = true; }
            }
            action(doc, row, 'Remove field', () => { if (Array.isArray(object)) object.splice(Number(key), 1); else delete object[key]; render(); });
        }
        const controls = el(doc, 'div', 'atri-library-actions', undefined, parent);
        const name = Array.isArray(object) ? null : input(controls, fmt('${0} new field', [path]), '', () => {});
        action(doc, controls, 'Add field', () => {
            const key = name ? name.value.trim() : String(object.length);
            if (!key || ['__proto__', 'constructor', 'prototype'].includes(key) || Object.hasOwn(object, key)) throw new TypeError(tl('Enter a new unique field name.'));
            object[key] = ''; render();
        });
    }
    function structured(parent, key, title) {
        const section = disclosure(doc, parent, title); section.open = true;
        const rev = revision();
        if (rev?.[key] === undefined) {
            note(section, 'Not specified. Opening Fields does not add defaults.');
            action(doc, section, fmt('Add ${0}', [tl(title)]), () => { rev[key] = {}; render(); });
        } else if (plain(rev[key])) properties(section, rev[key], key);
        else note(section, 'Use Source to repair this object. The original value is kept.');
        if (rev?.[key] !== undefined) action(doc, section, fmt('Remove ${0}', [tl(title)]), () => { delete rev[key]; render(); });
    }
    function dependencies(section, key, items) {
        section.replaceChildren();
        const rev = revision(), selected = Array.isArray(rev?.[key]) ? rev[key] : [];
        if (rev?.[key] !== undefined && !Array.isArray(rev[key])) note(section, 'Use Source to repair this reference array.');
        for (const item of items) {
            const row = el(doc, 'div', 'atri-library-version', undefined, section);
            const control = checkbox(row, item.name, selected.includes(item.id), checked => {
                const ids = new Set(Array.isArray(rev[key]) ? rev[key] : []); if (checked) ids.add(item.id); else ids.delete(item.id); rev[key] = [...ids];
            });
            control.disabled = item.state !== 'ready' && !projectSource || rev?.[key] !== undefined && !Array.isArray(rev[key]);
            note(row, [item.id, item.exact, item.source].filter(Boolean).join(' · '));
            if (item.state !== 'ready') note(row, 'Dependency unavailable. Its declared reference is kept.');
            disclosure(doc, row, 'Details', { id: item.id, revision: item.exact, source: item.source, status: item.state });
        }
        for (const id of selected.filter(id => !items.some(item => item.id === id))) {
            const row = el(doc, 'div', 'atri-library-version', undefined, section);
            note(row, (catalogComplete ? tl('Missing dependency') : tl('Dependency unavailable. Its declared reference is kept.')) + ' ' + id);
            action(doc, row, catalogComplete ? 'Remove missing reference' : 'Remove reference', () => { rev[key] = rev[key].filter(value => value !== id); render(); });
        }
        if (!items.length) note(section, projectSource ? 'Attach or fork resources in Library before composing this World.' : 'No available dependencies. Create resources in Library first.');
    }
    function render() {
        body.replaceChildren(); dependencySections.clear(); toggle.textContent = tl(advanced ? 'Fields' : 'Source'); toggle.setAttribute('aria-pressed', String(advanced));
        if (advanced) input(body, label, source, next => { source = next; }, 'textarea').rows = 18;
        else {
            if (snapshot && plain(draft?.world)) {
                const identity = disclosure(doc, body, 'World identity'); identity.open = true;
                note(identity, draft.world.worldId);
                input(identity, 'World name', draft.world.displayName, next => { draft.world.displayName = next; });
                note(identity, 'Project edits do not publish Library revisions or change existing Sessions.');
            }
            if (plain(revision())) {
                structured(body, 'baseline', 'World baseline'); structured(body, 'schema', 'World schema');
                for (const [key, title, items] of [['knowledgeBindingIds', 'Knowledge bindings', catalog.bindings], ['assetIds', 'World assets', catalog.assets]]) {
                    const section = disclosure(doc, body, title); section.open = true;
                    const content = el(doc, 'div', '', undefined, section); dependencySections.set(key, content); dependencies(content, key, items);
                }
                note(body, 'Bindings retain their exact Knowledge source. A binding ID is not an immutable binding revision. Asset references retain their declared hash or project file.');
                const advancedFields = disclosure(doc, body, 'Advanced World data');
                if (snapshot && plain(draft?.world)) {
                    for (const [object, key, name] of [[draft.world, 'worldId', 'world.worldId'], [draft.world, 'currentRevisionId', 'world.currentRevisionId'], [draft.revision, 'worldId', 'revision.worldId'], [draft.revision, 'worldRevisionId', 'revision.worldRevisionId']]) input(advancedFields, name, object[key], next => { object[key] = next; });
                    note(advancedFields, 'Use Source for timestamps and explicit identity changes. Both snapshot identities and the revision pin must agree; references and Sessions are not rewritten.');
                }
                structured(advancedFields, 'metadata', 'World metadata');
            } else note(body, 'Use Source to repair this object. The original value is kept.');
        }
        action(doc, body, 'Review Changes', async () => {
            const next = advanced ? JSON.parse(source) : draft; validate(next);
            shell.inert = true;
            const rev = snapshot ? next.revision : next;
            const dependencies = [...catalog.bindings.filter(item => rev.knowledgeBindingIds?.includes(item.id)), ...catalog.assets.filter(item => rev.assetIds?.includes(item.id))];
            try { if (current()) await onReview(clone(next), { dependencies }); } finally { shell.inert = false; }
        }, { primary: true });
        markDirty();
    }
    async function load() {
        const sequence = ++loadSequence;
        status.replaceChildren(); note(status, 'Loading dependencies…');
        let entries, listFailed = false;
        try { entries = library ?? await nativeStudioClient.listLibraryResources(); } catch { entries = []; listFailed = true; }
        if (!current() || sequence !== loadSequence) return;
        const locals = local(), allowed = projectSource?.dependencies?.knowledgeBindings;
        const bindingItems = projectSource ? (allowed || []).map(id => entries.find(item => item.resourceType === 'core.knowledge-binding' && item.resourceId === id) || { resourceId: id, displayName: id }) : entries.filter(item => item.resourceType === 'core.knowledge-binding');
        const results = await Promise.allSettled(bindingItems.map(async item => {
            const { binding } = await nativeProductClient.getKnowledgeBinding(item.resourceId);
            return { id: item.resourceId, name: binding.metadata?.displayName || item.displayName, exact: binding.source.knowledgeRevisionId, source: binding.source.kind, state: 'ready' };
        }));
        if (!current() || sequence !== loadSequence) return;
        catalog = {
            bindings: [...locals.bindings, ...results.map((result, index) => result.status === 'fulfilled' ? result.value : { id: bindingItems[index].resourceId, name: bindingItems[index].displayName, state: 'unavailable' })],
            assets: [...locals.assets, ...(projectSource ? (projectSource.dependencies?.assets || []).map(ref => ({ id: ref.assetId, name: entries.find(item => item.resourceType === 'core.asset' && item.resourceId === ref.assetId)?.displayName || ref.assetId, exact: ref.contentHash, source: 'library', state: listFailed ? 'unavailable' : 'ready' })) : entries.filter(item => item.resourceType === 'core.asset').map(item => ({ id: item.resourceId, name: item.displayName, exact: item.currentRevision, source: 'library', state: 'ready' })))],
        };
        catalogComplete = !listFailed; status.replaceChildren();
        if (listFailed || results.some(result => result.status === 'rejected')) {
            const error = note(status, 'Some dependencies could not load. Local fields and Source remain editable.'); error.setAttribute('role', 'alert');
            action(doc, status, 'Try again', load);
        }
        for (const [key, section] of dependencySections) dependencies(section, key, key === 'assetIds' ? catalog.assets : catalog.bindings);
    }
    catalog = local(); render(); void load();
    return { getDraft: () => clone(draft), getSource: () => advanced ? source : JSON.stringify(draft, null, 2), dispose: () => { disposed = true; loadSequence++; } };
}
