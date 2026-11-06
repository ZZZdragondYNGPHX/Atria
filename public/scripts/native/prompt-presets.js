import { promptStageEntries, promptStageModuleRefs, promptProgramResourceRefs, mapPromptStageRefs, promptModuleRole } from '../../shared/prompt-module-order.js';
import { confirmAtriaDraftLeave } from '../atria-shell/workspace-leave-guard.js';
import { translateShellText as tl, formatShellText as formatProductText } from '../atria-shell/localization.js';
import { runtimeRequest } from './runtime-client.js';
import { newPromptResource, resourceRef, PROMPT_TYPES, mountPromptEditor, PROMPT_TARGET_LABELS } from './prompt-authoring.js';
import { createStudioNativeId } from './studio-authoring.js';
import { mountNativeRegexRules } from './regex-authoring.js';
import { createAtriaIcon } from '../atria-shell/icons.js';
import { PROMPT_TEMPLATES, newPromptPreset } from './prompt-templates.js';

const PROGRAM = 'core.prompt-program', MODULE = 'core.prompt-module';
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
    const removedEntries = new Set(preset.entries.filter(entry => entry.resourceType === PROGRAM).flatMap(entry => entry.resource.stages.flatMap(stage =>
        promptStageEntries(stage).filter(item => item.kind === 'module' && moduleIds.has(item.moduleRef.resourceId)).map(item => stage.stageId + '/' + item.entryId))));
    next.entries = next.entries.filter(e => !moduleIds.has(idOf(e)));
    for (const entry of next.entries.filter(e => e.resourceType === PROGRAM)) {
        entry.resource.stages.forEach(s => { if (s.entries) s.entries = s.entries.filter(item => item.kind !== 'module' || !moduleIds.has(item.moduleRef.resourceId)); else s.moduleRefs = s.moduleRefs.filter(r => !moduleIds.has(r.resourceId)); });
        entry.resource.derive = (entry.resource.derive || []).filter(op => !moduleIds.has(op.moduleId) && !moduleIds.has(op.replacementRef?.resourceId) && !moduleIds.has(op.entry?.moduleRef?.resourceId)
            && !removedEntries.has(op.stageId + '/' + (op.entryId ?? op.position?.before ?? op.position?.after)));
    }
    return { next, modules: preset.entries.filter(e => moduleIds.has(idOf(e))), affected: preset.entries.filter(e => e.resourceType === PROGRAM && (e.resource.stages.some(s => promptStageModuleRefs(s).some(r => moduleIds.has(r.resourceId))) || (e.resource.derive || []).some(op => moduleIds.has(op.moduleId) || moduleIds.has(op.replacementRef?.resourceId) || moduleIds.has(op.entry?.moduleRef?.resourceId) || removedEntries.has(op.stageId + '/' + (op.entryId ?? op.position?.before ?? op.position?.after))))) };
}

// A module only compiles in stages it names; placing it in a stage is enough to name it.
export function syncModuleStages(preset) {
    const used = new Map();
    for (const program of preset.entries.filter(e => e.resourceType === PROGRAM)) for (const stage of program.resource.stages)
        for (const ref of promptStageModuleRefs(stage)) used.set(ref.resourceId + ':' + ref.revision, [...(used.get(ref.resourceId + ':' + ref.revision) || []), stage.stageId]);
    for (const entry of preset.entries.filter(e => e.resourceType === MODULE)) {
        const stages = used.get(idOf(entry) + ':' + entry.resource.revision) || [];
        entry.resource.stages = [...new Set([...entry.resource.stages, ...stages])];
    }
    return preset;
}
const ACCEPTS = { 'context.fact': 'Facts & world info', 'context.history': 'Chat history', 'context.input': 'The player’s message', 'context.player-persona': 'Player persona', 'context.directive': 'Host instructions' };

export function mountPromptPresets({ document: doc, body, host, route }) {
    let disposed = false, sequence = 0, preset = null, section = null;
    let lastReceipt = null;
    let categoryFilter = 'all', listPosition = null, closeMenu = () => {};
    const editorFoldStates = new Map();
    let split = null, pane = null, detailPane = null, listToken = 0;
    const ensureSplit = () => {
        if (split?.isConnected) return;
        split = doc.createElement('section'); split.className = 'atria-native-library atri-library-resource-split atri-prompt-presets';
        pane = doc.createElement('aside'); pane.className = 'atri-library-resource-pane'; pane.setAttribute('aria-label', tl('Prompt Presets'));
        detailPane = doc.createElement('section'); detailPane.className = 'atri-library-resource-main';
        split.append(pane, detailPane); body.replaceChildren(split);
    };
    const main = () => { ensureSplit(); return detailPane; };
    const node = (tag, text, parent = main()) => { const el = doc.createElement(tag); if (text !== undefined) el.textContent = tl(text); parent.append(el); return el; };
    const literal = (tag, text, parent) => { const el = node(tag, undefined, parent); el.textContent = text; return el; };
    const fail = error => { if (!disposed) { const el = node('p', error.message); el.setAttribute('role', 'alert'); } };
    const button = (parent, text, callback) => {
        const el = node('button', text, parent); el.type = 'button'; el.className = 'atri-library-button';
        el.addEventListener('click', async () => { if (el.disabled) return; el.disabled = true; try { await callback(); } catch (e) { fail(e); } finally { el.disabled = false; } }); return el;
    };
    const detail = () => {
        main().replaceChildren(); const root = node('section'); root.className = 'atri-prompt-preset';
        const nav = node('div', undefined, root); nav.className = 'atri-prompt-actions';
        button(nav, 'Back to presets', () => { if (confirmAtriaDraftLeave(doc, body)) return list(); }).classList.add('atri-library-detail-close');
        return { root, nav };
    };
    const field = (parent, label, value = '') => { const wrap = node('label', label, parent); wrap.className = 'atri-library-field'; const el = node('input', undefined, wrap); el.value = value; el.setAttribute('aria-label', tl(label)); return el; };
    const select = (parent, label, values, value) => { const wrap = node('label', label, parent); wrap.className = 'atri-library-field'; const el = node('select', undefined, wrap); el.setAttribute('aria-label', tl(label)); for (const [id, title] of values) { const opt = node('option', undefined, el); opt.textContent = title; opt.value = id; } el.value = value || ''; return el; };
    const save = async next => {
        const token = sequence;
        let receipt;
        const refresh = async () => {
            const saved = await runtimeRequest('/presets/' + receipt.presetId);
            if (disposed || token !== sequence) return;
            preset = saved; lastReceipt = receipt; renderDetail(); restoreListPosition();
        };
        try {
            await runtimeRequest('/presets/' + preset.presetId, { method: 'PUT', body: { preset: syncModuleStages(next), expectedRevision: preset.revision }, onCommitted: async result => {
                receipt = result;
                if (disposed || token !== sequence) return;
                body.dispatchEvent(new doc.defaultView.CustomEvent('atria-draft-committed', { bubbles: true }));
                await refresh();
            } });
        } catch (error) {
            if (!receipt) throw error;
            if (disposed || token !== sequence) return;
            const { root } = detail();
            node('p', 'Saved. The view could not be refreshed.', root).setAttribute('role', 'status');
            literal('p', error.message, root).setAttribute('role', 'alert');
            button(root, 'Try again', refresh);
        }
    };
    const markSelected = () => { for (const row of pane?.querySelectorAll('[data-atri-preset-id]') || []) row.setAttribute('aria-current', String(row.dataset.atriPresetId === preset?.presetId)); };
    const open = async id => {
        const token = ++sequence; closeMenu(); categoryFilter = 'all'; listPosition = null; lastReceipt = null;
        if (!pane?.isConnected || !pane.childElementCount) void renderPresetList();
        const { root } = detail();
        const loading = node('p', 'Loading exact resources…', root); loading.setAttribute('role', 'status');
        try {
            const value = await runtimeRequest('/presets/' + id); if (disposed || token !== sequence) return;
            preset = value; section = null; renderDetail(); markSelected();
        } catch (error) {
            if (disposed || token !== sequence) return;
            loading.remove(); throw error;
        }
    };
    const create = async (value, importing = false) => {
        // Importing a file twice must not produce look-alike presets: number the new name.
        const mains = importing && Array.isArray(value?.entries) ? value.entries.filter(e => e.resourceType === PROGRAM && e.resource?.promptProgramId === value.programId && typeof e.resource.displayName === 'string') : [];
        if (mains.length) {
            const taken = new Set((await runtimeRequest('/presets')).map(item => item.displayName));
            const base = mains.at(-1).resource.displayName; let name = base, n = 2;
            while (taken.has(name)) name = base + ' (' + n++ + ')';
            for (const entry of mains) entry.resource.displayName = name;
        }
        const result = await runtimeRequest('/presets', { method: 'POST', body: { preset: value, importing } }); await open(result.presetId); await renderPresetList(); };
    const exportPreset = value => {
        const data = { format: value.format, schemaVersion: 1, programId: value.programId, ...(value.programRevision ? { programRevision: value.programRevision } : {}), categories: value.categories, moduleCategories: value.moduleCategories, entries: value.entries, regexScripts: value.regexScripts || [] };
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const a = node('a'); a.href = url; a.download = value.displayName.replace(/[^\p{L}\p{N}_ -]/gu, '_').slice(0, 80) + '.prompt-preset.json'; a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
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
        for (let el = body; el; el = el.parentElement) scroll.push([el, el.scrollTop, el.scrollLeft, el.scrollHeight > el.clientHeight && /^(auto|scroll)$/.test(doc.defaultView.getComputedStyle(el).overflowY)]);
        const row = [...body.querySelectorAll('[data-module-id]')].find(el => el.dataset.moduleId === moduleId);
        listPosition = { scroll, moduleId, rowTop: row?.getBoundingClientRect().top };
    }
    function restoreListPosition() {
        if (section !== MODULE || !listPosition) return;
        const row = [...body.querySelectorAll('[data-module-id]')].find(el => el.dataset.moduleId === listPosition.moduleId);
        (row?.querySelector('.atri-module-title') || body.querySelector('[data-category-filter]'))?.focus({ preventScroll: true });
        for (const [el, top, left] of listPosition.scroll) { el.scrollTop = top; el.scrollLeft = left; }
        if (row && Number.isFinite(listPosition.rowTop)) {
            let remaining = row.getBoundingClientRect().top - listPosition.rowTop;
            for (const [el, , , scrollable] of listPosition.scroll) {
                if (!scrollable || Math.abs(remaining) < .5) continue;
                const before = el.scrollTop; el.scrollTop += remaining; remaining -= el.scrollTop - before;
            }
        }
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
            const scroll = event => {
                if (popup.contains(event.target)) return;
                const current = trigger.getBoundingClientRect();
                if (Math.abs(current.top - rect.top) > .5 || Math.abs(current.left - rect.left) > .5) close();
            };
            const items = actions.map(([text, run, danger]) => {
                const item = button(popup, text, async () => { close(true); await run(); }); item.setAttribute('role', 'menuitem');
                if (danger) item.classList.add('atri-library-button--danger'); return item;
            });
            const keys = event => {
                if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
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
        if (!editorFoldStates.has(idOf(entry))) editorFoldStates.set(idOf(entry), new Map());
        mountPromptEditor({ document: doc, parent: parent || body, entry: { ...draft, ref: entryRef(draft) }, entries, foldState: editorFoldStates.get(idOf(entry)), librarySurface: true, presetSurface: true, onBack: () => { if (parent) section = null; renderDetail(); restoreListPosition(); }, onSave: async (resource, upgrade) => {
            if (resource[PROMPT_TYPES[entry.resourceType][1]] !== idOf(entry)) throw new Error(tl('Cannot change resource identity.'));
            const next = clone(preset); const item = { resourceType: entry.resourceType, resource };
            if (fresh) next.entries.push(item); else next.entries[next.entries.findIndex(e => e.resourceType === entry.resourceType && idOf(e) === idOf(entry) && e.resource.revision === entry.resource.revision)] = item;
            if (upgrade) next.entries.push(...upgrade.dependencies.map(item => ({ resourceType: item.ref.resourceType, resource: item.resource })));
            if (fresh && entry.resourceType === MODULE && next.categories.some(c => c.id === categoryFilter)) next.moduleCategories[idOf(entry)] = categoryFilter;
            if (entry.resourceType === PROGRAM && idOf(entry) === next.programId && (!next.programRevision || next.programRevision === entry.resource.revision)) next.programRevision = resource.revision;
            const sameEntry = r => r.resourceType === entry.resourceType && r.resourceId === idOf(entry) && r.revision === entry.resource.revision;
            // Exact references inside this editable preset follow the edited module.
            for (const program of next.entries.filter(e => e.resourceType === PROGRAM)) {
                program.resource.stages = program.resource.stages.map(stage => mapPromptStageRefs(stage, r => sameEntry(r) ? entryRef(item) : r));
                if (program.resource.parentRef && sameEntry(program.resource.parentRef)) program.resource.parentRef = entryRef(item);
                for (const op of program.resource.derive || []) {
                    if (op.replacementRef && sameEntry(op.replacementRef)) op.replacementRef = entryRef(item);
                    if (op.entry?.kind === 'module' && sameEntry(op.entry.moduleRef)) op.entry.moduleRef = entryRef(item);
                }
            }
            if (upgrade) {
                const used = new Set();
                const visit = resource => {
                    const ref = entryRef({ resourceType: PROGRAM, resource }), key = JSON.stringify(ref);
                    if (used.has(key)) return; used.add(key);
                    if (resource.parentRef) {
                        const parent = next.entries.find(item => item.resourceType === PROGRAM && idOf(item) === resource.parentRef.resourceId && item.resource.revision === resource.parentRef.revision);
                        if (parent) visit(parent.resource);
                    }
                };
                const main = next.entries.find(item => item.resourceType === PROGRAM && idOf(item) === next.programId && item.resource.revision === next.programRevision);
                visit(main.resource);
                next.entries = next.entries.filter(item => item.resourceType !== PROGRAM || used.has(JSON.stringify(entryRef(item))));
            }
            await save(next);
        } });
    }
    function renderDetail() {
        if (disposed) return;
        closeMenu();
        const { root, nav } = detail(); root.dataset.atriPromptPreset = preset.presetId;
        if (section) button(nav, 'Back to preset', () => { if (confirmAtriaDraftLeave(doc, body)) { section = null; renderDetail(); } });
        literal('h2', preset.entries.find(e => idOf(e) === preset.programId && (!preset.programRevision || e.resource.revision === preset.programRevision)).resource.displayName, root);
        root.dataset.atriPresetRevision = preset.revision;
        if (lastReceipt?.presetId === preset.presetId) {
            // API presets follow the preset on save; name them so the effect is visible.
            const followed = (lastReceipt.followedBy || []).map(item => item.displayName);
            const receipt = literal('p', followed.length ? formatProductText('Saved. ${0} use this version from the next request.', [followed.join(', ')]) : tl('Saved.'), root);
            receipt.className = 'atri-library-feedback'; receipt.setAttribute('role', 'status');
        }
        if (!section) { renderOverview(root); return; }
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
            ['Delete category', async () => { rememberListPosition(); const { next } = removePresetCategory(preset, category.id); await save(next); }, true],
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
                    const { next } = removePresetCategory(staging, categoryId);
                    await save(next);
                }, true],
            ]);
            literal('p', categoryPath(preset.moduleCategories[idOf(entry)]), row);
        }
        if (!modules.length) node('p', preset.entries.some(e => e.resourceType === MODULE) ? 'No modules in this category.' : 'No modules yet. Create a module, then add it to the program.', root);
    }
    // The preset at a glance: what is sent, in order, with one switch per block.
    // A switch writes the same derive operation the advanced editor shows.
    function renderOverview(root) {
        node('p', 'What this preset sends to the model, in order. Switch a block off to skip it, or open it to change its text. Models and their settings are chosen in API presets.', root).className = 'atri-preset-intro';
        const usage = node('section', undefined, root); usage.className = 'atri-preset-usage'; void renderUsage(usage);
        const main = preset.entries.find(e => e.resourceType === PROGRAM && idOf(e) === preset.programId && (!preset.programRevision || e.resource.revision === preset.programRevision));
        const modules = preset.entries.filter(e => e.resourceType === MODULE);
        const disabled = new Set((main.resource.derive || []).filter(op => op.op === 'disable' && op.entryId).map(op => op.stageId + '/' + op.entryId));
        const blocks = node('ol', undefined, root); blocks.className = 'atri-preset-overview';
        for (const stage of main.resource.stages) for (const item of promptStageEntries(stage)) {
            const row = node('li', undefined, blocks); row.className = 'atri-preset-block';
            const off = disabled.has(stage.stageId + '/' + item.entryId);
            row.dataset.off = String(off);
            const toggle = node('input', undefined, node('label', undefined, row)); toggle.type = 'checkbox'; toggle.checked = !off; toggle.className = 'atri-preset-switch';
            const text = node('div', undefined, row);
            if (item.kind === 'module') {
                const module = modules.find(e => idOf(e) === item.moduleRef.resourceId && e.resource.revision === item.moduleRef.revision);
                const name = module?.resource.displayName || item.moduleRef.resourceId;
                toggle.setAttribute('aria-label', formatProductText('Send “${0}”', [name]));
                literal('strong', name, text);
                literal('small', module ? tl(PROMPT_TARGET_LABELS[module.resource.target] || module.resource.target) + ' · ' + promptModuleRole(module.resource) : '', text);
                if (module) literal('p', module.resource.body.replace(/\s+/g, ' ').slice(0, 160) + (module.resource.body.length > 160 ? '…' : ''), text);
                if (module) button(row, 'Edit text', () => { section = MODULE; edit(module); });
            } else {
                const label = item.accepts.map(kind => tl(ACCEPTS[kind] || kind)).join(' · ');
                toggle.setAttribute('aria-label', formatProductText('Send “${0}”', [label]));
                literal('strong', label, text); node('small', 'Story context, inserted by Atria', text);
            }
            toggle.addEventListener('change', async () => {
                toggle.disabled = true;
                const next = clone(preset);
                const program = next.entries.find(e => e.resourceType === PROGRAM && idOf(e) === idOf(main) && e.resource.revision === main.resource.revision);
                program.resource.derive = (program.resource.derive || []).filter(op => !(op.op === 'disable' && op.stageId === stage.stageId && op.entryId === item.entryId));
                if (!toggle.checked) program.resource.derive.push({ op: 'disable', stageId: stage.stageId, entryId: item.entryId });
                try { await save(next); } catch (error) { toggle.checked = !toggle.checked; toggle.disabled = false; fail(error); }
            });
        }
        if (!blocks.childElementCount) node('p', 'This preset sends nothing yet. Open Structure & order to add blocks.', root);
        const cards = node('div', undefined, root); cards.className = 'atri-preset-sections';
        for (const [id, label, hint] of [[PROGRAM, 'Structure & order', 'Stages, order, conditions and typed parameters'], [MODULE, 'Text blocks', 'Every block’s text, grouped in categories'], ['regex', 'Text replacements', 'Regex rules applied to input and output']]) {
            const card = button(cards, label, () => { section = id; renderDetail(); });
            node('small', hint, card);
        }
        const footer = node('div', undefined, root); footer.className = 'atri-prompt-actions atri-preset-footer';
        const current = preset;
        button(footer, 'Export preset', async () => exportPreset(await runtimeRequest('/presets/' + current.presetId)));
        button(footer, 'Delete preset', async () => {
            const { routes } = await runtimeRequest('/configuration');
            const using = routes.filter(item => item.promptProgramRef?.resourceId === current.presetId).map(item => item.displayName);
            const { Popup, POPUP_TYPE, POPUP_RESULT } = await import('../popup.js');
            const message = using.length ? formatProductText('Delete “${0}”? ${1} keep using its last version until you choose another prompt preset.', [current.displayName, using.join(', ')]) : formatProductText('Delete “${0}”?', [current.displayName]);
            if (await new Popup(message, POPUP_TYPE.CONFIRM, '', { okButton: tl('Delete'), cancelButton: tl('Cancel') }).show() !== POPUP_RESULT.AFFIRMATIVE) return;
            await runtimeRequest('/presets/' + current.presetId, { method: 'DELETE', body: { expectedRevision: current.revision } });
            await list();
        }).classList.add('atri-library-button--danger');
    }
    async function renderUsage(parent) {
        const presetId = preset.presetId;
        try {
            const { routes } = await runtimeRequest('/configuration');
            if (disposed || preset?.presetId !== presetId || !parent.isConnected) return;
            const using = routes.filter(item => item.promptProgramRef?.resourceId === presetId);
            literal('p', using.length ? formatProductText('Used by ${0}.', [using.map(item => item.displayName).join(', ')]) : tl('No API preset uses this preset yet.'), parent);
            const others = routes.filter(item => !using.includes(item));
            if (!others.length) return;
            const row = node('div', undefined, parent); row.className = 'atri-prompt-actions';
            const choose = select(row, 'Use with', [['', tl('Choose an API preset…')], ...others.map(item => [item.runtimeRouteId, item.displayName])], '');
            button(row, 'Use this preset', async () => {
                if (!choose.value) { choose.focus(); return; }
                await runtimeRequest('/api-presets/' + encodeURIComponent(choose.value) + '/prompt-preset', { method: 'PUT', body: { presetId } });
                parent.replaceChildren(); await renderUsage(parent);
            });
        } catch { if (parent.isConnected) node('p', 'Could not load API presets.', parent); }
    }
    function emptyDetail() {
        main().replaceChildren();
        const empty = node('div'); empty.className = 'atri-library-resource-empty';
        node('p', 'Select a preset to edit, or create a new one.', empty);
    }
    async function list() {
        ++sequence; closeMenu(); listPosition = null; preset = null; emptyDetail();
        await renderPresetList();
    }
    // The pane: create, import, the preset list and migration of existing resources.
    async function renderPresetList() {
        const token = ++listToken; ensureSplit();
        pane.replaceChildren(); node('p', 'Loading exact resources…', pane);
        try {
            const presets = await runtimeRequest('/presets'); if (disposed || token !== listToken) return;
            pane.replaceChildren(); const root = node('section', undefined, pane); root.className = 'atri-prompt-preset atri-prompt-preset-list'; node('h2', 'Prompt Presets', root);
            // Your presets come first; creating and importing are one compact row below them.
            const rows = node('div', undefined, root);
            const tools = node('div', undefined, root); tools.className = 'atri-prompt-actions';
            const template = select(tools, 'Start from', PROMPT_TEMPLATES.map(([id, label]) => [id, tl(label)]), 'blank');
            button(tools, 'New preset', () => create(newPromptPreset(template.value)));
            // Choosing the file is the import; there is no second confirm step.
            const file = doc.createElement('input'); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true; tools.append(file);
            file.addEventListener('change', () => { const chosen = file.files?.[0]; file.value = ''; if (chosen) void chosen.text().then(text => create(JSON.parse(text), true)).catch(fail); });
            button(tools, 'Import preset…', () => file.click());
            if (!presets.length) node('p', 'No presets yet. Create a preset or import a file.', rows);
            for (const preset of presets) {
                const row = node('article', undefined, rows); row.className = 'atri-prompt-resource atri-library-row'; row.dataset.atriPresetId = preset.presetId;
                row.prepend(createAtriaIcon(doc, 'layers', { size: 16 }));
                literal('h3', preset.displayName, row); button(row, 'Open preset', () => open(preset.presetId));
                // Rows only open; export and delete live on the preset's page.
                row.addEventListener('click', event => { if (!event.target.closest('button, details')) void open(preset.presetId).catch(fail); });
            }
            const existing = node('details', undefined, root); node('summary', 'Existing resources — migrate into an independent preset', existing);
            button(existing, 'Choose existing resources', async () => {
                const entries = await runtimeRequest('/resources'); existing.replaceChildren(); node('summary', 'Existing resources — migrate into an independent preset', existing);
                const options = type => entries.filter(e => e.ref.resourceType === type).map((e, i) => [String(i), e.resource.displayName + ' · ' + e.ref.scope + ' · ' + e.ref.revision]);
                const programs = entries.filter(e => e.ref.resourceType === PROGRAM);
                const program = select(existing, 'Prompt Programs', options(PROGRAM), '0');
                button(existing, 'Create independent preset', async () => {
                    if (!programs[Number(program.value)]) throw new Error(tl('Choose a Prompt program.'));
                    const selected = [], seen = new Set();
                    const visit = entry => {
                        const key = JSON.stringify(entry.ref); if (seen.has(key)) return; seen.add(key);
                        if (entry.ref.resourceType === PROGRAM) {
                            const refs = promptProgramResourceRefs(entry.resource);
                            for (const ref of refs) { const found = entries.find(e => Object.keys(ref).every(k => e.ref[k] === ref[k])); if (!found) throw new Error(tl('Missing exact dependency')); visit(found); }
                        }
                        selected.push({ resourceType: entry.ref.resourceType, resource: entry.resource });
                    };
                    const chosen = programs[Number(program.value)]; visit(chosen);
                    await create({ format: 'atria.prompt-preset', schemaVersion: 1, programId: chosen.resource.promptProgramId, programRevision: chosen.resource.revision, entries: selected, categories: [], moduleCategories: {} }, true);
                });
            });
            markSelected();
        } catch (e) { if (disposed || token !== listToken) return; pane.replaceChildren(); const alert = node('p', e.message, pane); alert.setAttribute('role', 'alert'); button(pane, 'Retry resources', renderPresetList); }
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
