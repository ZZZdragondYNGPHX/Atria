import { translateShellText as tl } from '../atria-shell/localization.js';
import { runtimeRequest } from './runtime-client.js';
import { newPromptResource, resourceRef, PROMPT_TYPES, mountPromptEditor } from './prompt-authoring.js';
import { createStudioNativeId } from './studio-authoring.js';
import { mountNativeRegexRules } from './regex-authoring.js';
import { createAtriaIcon } from '../atria-shell/icons.js';

const PROGRAM = 'core.prompt-program', MODULE = 'core.prompt-module', GENERATION = 'core.generation-profile';
const clone = value => JSON.parse(JSON.stringify(value));
const idOf = entry => entry.resource[PROMPT_TYPES[entry.resourceType][1]];
const entryRef = entry => resourceRef(entry.resourceType, entry.resource, { scope: 'library' });

export function removePresetCategory(preset, categoryId) {
    const removed = new Set([categoryId]);
    let changed = true;
    while (changed) { changed = false; for (const c of preset.categories) if (removed.has(c.parentId) && !removed.has(c.id)) { removed.add(c.id); changed = true; } }
    const moduleIds = new Set(Object.entries(preset.moduleCategories).filter(([, category]) => removed.has(category)).map(([id]) => id));
    const next = clone(preset);
    next.categories = next.categories.filter(c => !removed.has(c.id));
    next.moduleCategories = Object.fromEntries(Object.entries(next.moduleCategories).filter(([id]) => !moduleIds.has(id)));
    next.entries = next.entries.filter(e => !moduleIds.has(idOf(e)));
    for (const entry of next.entries.filter(e => e.resourceType === PROGRAM)) {
        entry.resource.stages.forEach(s => { s.moduleRefs = s.moduleRefs.filter(r => !moduleIds.has(r.resourceId)); });
        entry.resource.derive = (entry.resource.derive || []).filter(op => !moduleIds.has(op.moduleId) && !moduleIds.has(op.replacementRef?.resourceId));
    }
    return { next, modules: preset.entries.filter(e => moduleIds.has(idOf(e))), affected: preset.entries.filter(e => e.resourceType === PROGRAM && (e.resource.stages.some(s => s.moduleRefs.some(r => moduleIds.has(r.resourceId))) || (e.resource.derive || []).some(op => moduleIds.has(op.moduleId) || moduleIds.has(op.replacementRef?.resourceId)))) };
}

export function mountPromptPresets({ document: doc, body, host, route }) {
    let disposed = false, sequence = 0, preset = null, section = null;
    let categoryFilter = 'all', listPosition = null, closeMenu = () => {};
    const node = (tag, text, parent = body) => { const el = doc.createElement(tag); if (text !== undefined) el.textContent = tl(text); parent.append(el); return el; };
    const literal = (tag, text, parent) => { const el = node(tag, undefined, parent); el.textContent = text; return el; };
    const fail = error => { if (!disposed) { const el = node('p', error.message); el.setAttribute('role', 'alert'); } };
    const button = (parent, text, callback) => {
        const el = node('button', text, parent); el.type = 'button'; el.className = 'atri-library-button';
        el.addEventListener('click', async () => { el.disabled = true; try { await callback(); } catch (e) { fail(e); } finally { el.disabled = false; } }); return el;
    };
    const field = (parent, label, value = '') => { const wrap = node('label', label, parent); wrap.className = 'atri-library-field'; const el = node('input', undefined, wrap); el.value = value; el.setAttribute('aria-label', tl(label)); return el; };
    const select = (parent, label, values, value) => { const wrap = node('label', label, parent); wrap.className = 'atri-library-field'; const el = node('select', undefined, wrap); el.setAttribute('aria-label', tl(label)); for (const [id, title] of values) { const opt = node('option', undefined, el); opt.textContent = title; opt.value = id; } el.value = value || ''; return el; };
    const save = async next => {
        const result = await runtimeRequest('/presets/' + preset.presetId, { method: 'PUT', body: { preset: next, expectedRevision: preset.revision } });
        preset = await runtimeRequest('/presets/' + result.presetId); void host.refreshSearch?.(); renderDetail(); restoreListPosition();
    };
    const open = async id => { const token = ++sequence; closeMenu(); categoryFilter = 'all'; listPosition = null; body.replaceChildren(); node('p', 'Loading exact resources…'); const value = await runtimeRequest('/presets/' + id); if (disposed || token !== sequence) return; preset = value; section = null; renderDetail(); };
    const create = async (value, importing = false) => { const result = await runtimeRequest('/presets', { method: 'POST', body: { preset: value, importing } }); await open(result.presetId); };
    const exportPreset = value => {
        const data = { format: value.format, schemaVersion: 1, programId: value.programId, categories: value.categories, moduleCategories: value.moduleCategories, entries: value.entries, regexScripts: value.regexScripts || [] };
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const a = node('a'); a.href = url; a.download = value.displayName.replace(/[^\p{L}\p{N}_ -]/gu, '_').slice(0, 80) + '.prompt-preset.json'; a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const confirmRemoval = async (next, modules, affected, label) => {
        const content = node('div', undefined, doc.createDocumentFragment());
        node('p', 'Delete the selected items? Program references will be removed together. Pinned history remains available.', content);
        literal('h4', label, content);
        node('h4', 'Modules to delete', content); const list = node('ul', undefined, content); modules.forEach(e => literal('li', e.resource.displayName, list));
        node('h4', 'Affected programs', content); const programs = node('ul', undefined, content); affected.forEach(e => literal('li', e.resource.displayName, programs));
        const { Popup, POPUP_TYPE } = await import('../popup.js');
        const heading = doc.createElement('h3'); heading.textContent = tl('Confirm deletion'); content.prepend(heading);
        if (await new Popup(content, POPUP_TYPE.CONFIRM).show()) await save(next);
    };
    const categoryPath = id => { const c = preset.categories.find(c => c.id === id); return c ? (c.parentId ? categoryPath(c.parentId) + ' / ' : '') + c.name : tl('Uncategorized'); };
    const descendants = id => {
        const ids = new Set([id]);
        for (let size = 0; size !== ids.size;) { size = ids.size; for (const c of preset.categories) if (ids.has(c.parentId)) ids.add(c.id); }
        return ids;
    };
    const categoryOptions = () => {
        const result = [];
        const visit = (parent, depth) => { for (const c of preset.categories.filter(c => (c.parentId || null) === parent)) { result.push([c.id, `${'　'.repeat(depth)}${depth ? '└ ' : ''}${c.name}`]); visit(c.id, depth + 1); } };
        visit(null, 0); return result;
    };
    function rememberListPosition(moduleId = null) {
        const scroll = [];
        for (let el = body; el; el = el.parentElement) scroll.push([el, el.scrollTop, el.scrollLeft]);
        listPosition = { scroll, moduleId };
    }
    function restoreListPosition() {
        if (section !== MODULE || !listPosition) return;
        const row = [...body.querySelectorAll('[data-module-id]')].find(el => el.dataset.moduleId === listPosition.moduleId);
        (row?.querySelector('.atri-module-title') || body.querySelector('[data-category-filter]'))?.focus({ preventScroll: true });
        for (const [el, top, left] of listPosition.scroll) { el.scrollTop = top; el.scrollLeft = left; }
    }
    function menu(parent, label, actions) {
        const trigger = node('button', undefined, parent); trigger.type = 'button'; trigger.className = 'atri-library-button atri-preset-menu-trigger';
        trigger.setAttribute('aria-label', tl(label)); trigger.title = tl(label); trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-expanded', 'false');
        trigger.append(createAtriaIcon(doc, 'more', { size: 20 }));
        trigger.addEventListener('click', () => {
            const wasOpen = trigger.getAttribute('aria-expanded') === 'true'; closeMenu(); if (wasOpen) return;
            const popup = node('div', undefined, body); popup.className = 'atri-preset-menu'; popup.setAttribute('role', 'menu'); popup.setAttribute('aria-label', tl(label));
            popup.id = createStudioNativeId('menu'); trigger.setAttribute('aria-controls', popup.id);
            trigger.setAttribute('aria-expanded', 'true');
            const close = (focus = false) => {
                popup.remove(); trigger.setAttribute('aria-expanded', 'false'); trigger.removeAttribute('aria-controls');
                doc.removeEventListener('pointerdown', outside); doc.removeEventListener('keydown', keys); doc.removeEventListener('focusin', focusOutside);
                doc.defaultView.removeEventListener('resize', dismiss); doc.removeEventListener('scroll', scroll, true);
                if (focus && trigger.isConnected) trigger.focus({ preventScroll: true });
                closeMenu = () => {};
            };
            const outside = event => { if (!popup.contains(event.target) && !trigger.contains(event.target)) close(); };
            const focusOutside = event => { if (!popup.contains(event.target) && event.target !== trigger) close(); };
            const dismiss = () => close();
            const scroll = event => { if (!popup.contains(event.target)) close(); };
            const items = actions.map(([text, run, danger]) => {
                const item = button(popup, text, async () => { close(true); await run(); }); item.setAttribute('role', 'menuitem');
                if (danger) item.classList.add('atri-library-button--danger'); return item;
            });
            const keys = event => {
                if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
                const index = items.indexOf(doc.activeElement);
                if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                    event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length; items[next].focus();
                }
            };
            const rect = trigger.getBoundingClientRect();
            popup.style.left = Math.max(8, Math.min(rect.right - popup.offsetWidth, doc.defaultView.innerWidth - popup.offsetWidth - 8)) + 'px';
            popup.style.top = Math.max(8, Math.min(rect.bottom + 4, doc.defaultView.innerHeight - popup.offsetHeight - 8)) + 'px';
            closeMenu = close; doc.addEventListener('pointerdown', outside); doc.addEventListener('keydown', keys); doc.addEventListener('focusin', focusOutside);
            doc.defaultView.addEventListener('resize', dismiss); doc.addEventListener('scroll', scroll, true); items[0]?.focus({ preventScroll: true });
        });
        return trigger;
    }
    async function categoryDialog(category = null, moving = false) {
        rememberListPosition();
        const content = node('div', undefined, doc.createDocumentFragment()); content.className = 'atri-preset-category-form';
        node('h3', category ? moving ? 'Move category' : 'Rename category' : 'Create category', content);
        const name = moving ? null : field(content, 'Category name', category?.name || '');
        const excluded = category ? descendants(category.id) : new Set();
        const parentId = category ? category.parentId || '' : preset.categories.some(c => c.id === categoryFilter) ? categoryFilter : '';
        const parent = category && !moving ? null : select(content, 'Parent category', [['', tl('Top level')], ...categoryOptions().filter(([id]) => !excluded.has(id))], parentId);
        if (name) { name.required = true; name.addEventListener('input', () => name.setCustomValidity('')); }
        const { Popup, POPUP_TYPE, POPUP_RESULT } = await import('../popup.js');
        const result = await new Popup(content, POPUP_TYPE.CONFIRM, '', { onClosing: popup => {
            if (popup.result !== POPUP_RESULT.AFFIRMATIVE || !name || name.value.trim()) return true;
            name.setCustomValidity(tl('Enter a category name.')); name.reportValidity(); name.focus(); return false;
        } }).show();
        if (result !== POPUP_RESULT.AFFIRMATIVE) return;
        const next = clone(preset);
        if (category) { const target = next.categories.find(c => c.id === category.id); if (name) target.name = name.value.trim(); if (parent) target.parentId = parent.value || null; } else next.categories.push({ id: createStudioNativeId('cat'), name: name.value.trim(), parentId: parent.value || null });
        await save(next);
    }
    async function moveModule(entry) {
        rememberListPosition(idOf(entry));
        const content = node('div', undefined, doc.createDocumentFragment()); content.className = 'atri-preset-category-form';
        node('h3', 'Move module', content); literal('p', entry.resource.displayName, content);
        const target = select(content, 'Module category', [['', tl('Uncategorized')], ...categoryOptions()], preset.moduleCategories[idOf(entry)]);
        const { Popup, POPUP_TYPE, POPUP_RESULT } = await import('../popup.js');
        if (await new Popup(content, POPUP_TYPE.CONFIRM).show() !== POPUP_RESULT.AFFIRMATIVE) return;
        const next = clone(preset); if (target.value) next.moduleCategories[idOf(entry)] = target.value; else delete next.moduleCategories[idOf(entry)]; await save(next);
    }
    function edit(entry, fresh = false, parent = null) {
        closeMenu(); if (!parent && section === MODULE) rememberListPosition(idOf(entry));
        if (!parent) body.replaceChildren(); const draft = clone(entry);
        const entries = preset.entries.map(e => ({ ...e, ref: entryRef(e) }));
        mountPromptEditor({ document: doc, parent: parent || body, entry: { ...draft, ref: entryRef(draft) }, entries, librarySurface: true, presetSurface: true, onBack: () => { if (parent) section = null; renderDetail(); restoreListPosition(); }, onSave: async resource => {
            if (resource[PROMPT_TYPES[entry.resourceType][1]] !== idOf(entry)) throw new Error(tl('Cannot change resource identity.'));
            const next = clone(preset); const item = { resourceType: entry.resourceType, resource };
            if (fresh) next.entries.push(item); else next.entries[next.entries.findIndex(e => idOf(e) === idOf(entry))] = item;
            if (fresh && entry.resourceType === MODULE && next.categories.some(c => c.id === categoryFilter)) next.moduleCategories[idOf(entry)] = categoryFilter;
            // Exact references inside this editable preset follow the edited module.
            for (const program of next.entries.filter(e => e.resourceType === PROGRAM)) {
                for (const stage of program.resource.stages) stage.moduleRefs = stage.moduleRefs.map(r => r.resourceId === idOf(entry) ? entryRef(item) : r);
                if (program.resource.parentRef?.resourceId === idOf(entry)) program.resource.parentRef = entryRef(item);
                for (const op of program.resource.derive || []) if (op.replacementRef?.resourceId === idOf(entry)) op.replacementRef = entryRef(item);
            }
            await save(next);
        } });
    }
    function renderDetail() {
        if (disposed) return;
        closeMenu();
        body.replaceChildren(); const root = node('section'); root.className = 'atri-prompt-preset'; root.dataset.atriPromptPreset = preset.presetId;
        const nav = node('div', undefined, root); nav.className = 'atri-prompt-actions';
        button(nav, 'Back to presets', list);
        if (section) button(nav, 'Back to preset', () => { section = null; renderDetail(); });
        literal('h2', preset.entries.find(e => idOf(e) === preset.programId).resource.displayName, root);
        if (!section) {
            node('p', 'This preset owns its program, modules, generation settings and Regex rules. Changes affect only this preset.', root);
            const cards = node('div', undefined, root); cards.className = 'atri-preset-sections';
            for (const [type, label] of [[PROGRAM, 'Prompt Programs'], [MODULE, 'Prompt Modules'], [GENERATION, 'Generation Profiles']]) button(cards, label, () => { section = type; renderDetail(); });
            button(cards, 'Preset Regex', () => { section = 'regex'; renderDetail(); });
            return;
        }
        if (section === 'regex') {
            node('h3', 'Preset Regex', root);
            const owner = preset;
            mountNativeRegexRules({ parent: root, scripts: owner.regexScripts || [], save: async regexScripts => {
                if (preset !== owner) throw new Error(tl('Preset changed. Reopen the editor.'));
                await save({ ...owner, regexScripts });
            } });
            return;
        }
        node('h3', PROMPT_TYPES[section][0], root);
        if (section !== MODULE) {
            for (const e of preset.entries.filter(e => e.resourceType === section)) {
                const row = node('article', undefined, root); row.className = 'atri-prompt-resource'; edit(e, false, row);
            }
            return;
        }
        const toolbar = node('div', undefined, root); toolbar.className = 'atri-module-toolbar';
        if (!['all', 'uncategorized'].includes(categoryFilter) && !preset.categories.some(c => c.id === categoryFilter)) categoryFilter = 'all';
        const filter = select(toolbar, 'Filter by category', [['all', tl('All modules')], ['uncategorized', tl('Uncategorized')], ...categoryOptions()], categoryFilter);
        filter.dataset.categoryFilter = '';
        filter.addEventListener('change', () => { categoryFilter = filter.value; listPosition = null; renderDetail(); body.querySelector('[data-category-filter]')?.focus({ preventScroll: true }); });
        const category = preset.categories.find(c => c.id === categoryFilter);
        const categoryMenu = menu(toolbar, 'Category actions', category ? [
            ['Rename category', () => categoryDialog(category)],
            ['Move category', () => categoryDialog(category, true)],
            ['Delete category', async () => { rememberListPosition(); const { next, modules, affected } = removePresetCategory(preset, category.id); await confirmRemoval(next, modules, affected, categoryPath(category.id)); }, true],
        ] : []);
        categoryMenu.disabled = !category;
        menu(nav, 'Module list actions', [
            ['Create category', () => categoryDialog()],
            ['New module', () => edit({ resourceType: MODULE, resource: newPromptResource(MODULE) }, true)],
        ]).classList.add('atri-module-create');
        const included = descendants(categoryFilter);
        const modules = preset.entries.filter(e => e.resourceType === MODULE && (categoryFilter === 'all' || (categoryFilter === 'uncategorized' ? !preset.moduleCategories[idOf(e)] : included.has(preset.moduleCategories[idOf(e)]))));
        for (const entry of modules) {
            const row = node('article', undefined, root); row.className = 'atri-prompt-resource atri-module-row'; row.dataset.moduleId = idOf(entry);
            const heading = node('h4', undefined, row);
            const title = button(heading, '', () => edit(entry)); title.textContent = entry.resource.displayName; title.classList.add('atri-module-title');
            menu(row, 'Module actions', [
                ['View / edit parameters', () => edit(entry)],
                ['Move module', () => moveModule(entry)],
                ['Delete module', async () => {
                    rememberListPosition();
                    const staging = clone(preset), categoryId = createStudioNativeId('cat');
                    staging.categories.push({ id: categoryId, name: entry.resource.displayName, parentId: null }); staging.moduleCategories[idOf(entry)] = categoryId;
                    const { next, modules, affected } = removePresetCategory(staging, categoryId);
                    await confirmRemoval(next, modules, affected, entry.resource.displayName);
                }, true],
            ]);
            literal('p', categoryPath(preset.moduleCategories[idOf(entry)]), row);
        }
        if (!modules.length) node('p', preset.entries.some(e => e.resourceType === MODULE) ? 'No modules in this category.' : 'No modules yet. Create a module, then add it to the program.', root);
    }
    async function list() {
        const token = ++sequence; closeMenu(); listPosition = null; preset = null; body.replaceChildren(); node('p', 'Loading exact resources…');
        try {
            const presets = await runtimeRequest('/presets'); if (disposed || token !== sequence) return;
            body.replaceChildren(); const root = node('section'); root.className = 'atri-prompt-preset'; node('h2', 'Prompt Presets', root);
            const tools = node('div', undefined, root); tools.className = 'atri-prompt-actions';
            button(tools, 'New preset', () => { const program = newPromptResource(PROGRAM), generation = newPromptResource(GENERATION); return create({ format: 'atria.prompt-preset', schemaVersion: 1, programId: program.promptProgramId, categories: [], moduleCategories: {}, entries: [{ resourceType: PROGRAM, resource: program }, { resourceType: GENERATION, resource: generation }] }); });
            const file = field(root, 'Import preset'); file.type = 'file'; file.accept = '.json,application/json';
            button(root, 'Import selected preset', async () => { if (!file.files?.length) { file.focus(); return; } await create(JSON.parse(await file.files[0].text()), true); });
            if (!presets.length) node('p', 'No presets yet. Create a preset or import a file.', root);
            for (const preset of presets) {
                const row = node('article', undefined, root); row.className = 'atri-prompt-resource'; row.dataset.atriPresetId = preset.presetId;
                literal('h3', preset.displayName, row); button(row, 'Open preset', () => open(preset.presetId));
                button(row, 'Export preset', async () => exportPreset(await runtimeRequest('/presets/' + preset.presetId)));
                button(row, 'Delete preset', async () => {
                    const { Popup, POPUP_TYPE } = await import('../popup.js');
                    if (await new Popup(tl('Delete this preset and its Regex rules? Pinned Prompt history remains available.'), POPUP_TYPE.CONFIRM).show()) {
                        await runtimeRequest('/presets/' + preset.presetId, { method: 'DELETE', body: { expectedRevision: preset.revision } });
                        await list();
                    }
                }).classList.add('atri-library-button--danger');
            }
            const existing = node('details', undefined, root); node('summary', 'Existing resources — migrate into an independent preset', existing);
            button(existing, 'Choose existing resources', async () => {
                const entries = await runtimeRequest('/resources'); existing.replaceChildren(); node('summary', 'Existing resources — migrate into an independent preset', existing);
                const options = type => entries.filter(e => e.ref.resourceType === type).map((e, i) => [String(i), e.resource.displayName + ' · ' + e.ref.scope + ' · ' + e.ref.revision]);
                const programs = entries.filter(e => e.ref.resourceType === PROGRAM), generations = entries.filter(e => e.ref.resourceType === GENERATION);
                const program = select(existing, 'Prompt Programs', options(PROGRAM), '0'); const generation = select(existing, 'Generation Profiles', [['', tl('Default')], ...options(GENERATION)]);
                button(existing, 'Create independent preset', async () => {
                    if (!programs[Number(program.value)]) throw new Error(tl('Choose a Prompt program.'));
                    const selected = [], seen = new Set();
                    const visit = entry => {
                        const key = JSON.stringify(entry.ref); if (seen.has(key)) return; seen.add(key);
                        if (entry.ref.resourceType === PROGRAM) {
                            const refs = [entry.resource.parentRef, ...entry.resource.stages.flatMap(s => s.moduleRefs), ...(entry.resource.derive || []).map(op => op.replacementRef)].filter(Boolean);
                            for (const ref of refs) { const found = entries.find(e => Object.keys(ref).every(k => e.ref[k] === ref[k])); if (!found) throw new Error(tl('Missing exact dependency')); visit(found); }
                        }
                        selected.push({ resourceType: entry.ref.resourceType, resource: entry.resource });
                    };
                    const chosen = programs[Number(program.value)]; visit(chosen);
                    selected.push({ resourceType: GENERATION, resource: generation.value ? generations[Number(generation.value)].resource : newPromptResource(GENERATION) });
                    await create({ format: 'atria.prompt-preset', schemaVersion: 1, programId: chosen.resource.promptProgramId, entries: selected, categories: [], moduleCategories: {} }, true);
                });
            });
        } catch (e) { fail(e); button(body, 'Retry resources', list); }
    }
    // Old links remain readable during migration; all new navigation uses presets.
    const updateRoute = next => {
        const id = next?.child?.id;
        if (id?.startsWith('prompt-presets:')) void open(decodeURIComponent(id.slice('prompt-presets:'.length))).catch(fail);
        else void list();
    };
    updateRoute(route);
    return { updateRoute, dispose() { closeMenu(); disposed = true; sequence++; } };
}
