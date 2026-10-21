import { renderResourceReferenceRows } from './resource-reference-rows.js';
import { promptStageEntries, promptStageModuleRefs, promptProgramResourceRefs, mapPromptStageRefs } from '../../shared/prompt-module-order.js';
import { confirmAtriaDraftLeave } from '../atria-shell/workspace-leave-guard.js';
import { translateShellText as tl, formatShellText as formatProductText } from '../atria-shell/localization.js';
import { runtimeRequest } from './runtime-client.js';
import { newPromptResource, resourceRef, PROMPT_TYPES, mountPromptEditor } from './prompt-authoring.js';
import { createStudioNativeId } from './studio-authoring.js';
import { mountNativeRegexRules } from './regex-authoring.js';
import { createAtriaIcon } from '../atria-shell/icons.js';
import { createAtriaFileDrop } from '../atria-shell/components.js';
import { PROMPT_TEMPLATES, newPromptPreset } from './prompt-templates.js';

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

export function mountPromptPresets({ document: doc, body, host, route }) {
    let disposed = false, sequence = 0, preset = null, section = null;
    let lastReceipt = null;
    // Outline selection by stable identity, so it survives the revision a save creates.
    let focus = null, focusBody = false, revealEditor = false;
    // Editor view and Details panel persist while moving through the outline.
    const workbenchState = { view: 'write', inspectorOpen: doc.defaultView?.matchMedia?.('(min-width: 1280px)').matches ?? true };
    let categoryFilter = 'all', listPosition = null, closeMenu = () => {}, adoptionRefs = [];
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
            await runtimeRequest('/presets/' + preset.presetId, { method: 'PUT', body: { preset: next, expectedRevision: preset.revision }, onCommitted: async result => {
                receipt = result; adoptionRefs = preset.refs ?? [];
                if (disposed || token !== sequence) return;
                body.dispatchEvent(new doc.defaultView.CustomEvent('atria-draft-committed', { bubbles: true }));
                await refresh();
            } });
        } catch (error) {
            if (!receipt) throw error;
            if (disposed || token !== sequence) return;
            main().replaceChildren();
            node('p', 'Saved. The view could not be refreshed.').setAttribute('role', 'status');
            literal('p', error.message, main()).setAttribute('role', 'alert');
            button(main(), 'Try again', refresh);
        }
    };
    const markSelected = () => { for (const row of pane?.querySelectorAll('[data-atri-preset-id]') || []) row.setAttribute('aria-current', String(row.dataset.atriPresetId === preset?.presetId)); };
    const open = async id => {
        const token = ++sequence; closeMenu(); categoryFilter = 'all'; listPosition = null; lastReceipt = null; adoptionRefs = [];
        if (!pane?.isConnected || !pane.childElementCount) void renderPresetList();
        main().replaceChildren(); node('p', 'Loading exact resources…');
        const value = await runtimeRequest('/presets/' + id); if (disposed || token !== sequence) return;
        if (preset?.presetId !== value.presetId) { focus = null; focusBody = false; }
        preset = value; section = null; renderDetail(); markSelected();
    };
    // A created or imported preset appears in the list at once, selected.
    const create = async (value, importing = false) => {
        const result = await runtimeRequest('/presets', { method: 'POST', body: { preset: value, importing } });
        focusBody = !importing;
        await renderPresetList(); await open(result.presetId);
    };
    const exportPreset = value => {
        const data = { format: value.format, schemaVersion: 1, programId: value.programId, ...(value.programRevision ? { programRevision: value.programRevision } : {}), categories: value.categories, moduleCategories: value.moduleCategories, entries: value.entries, regexScripts: value.regexScripts || [] };
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
            const popup = node('div', undefined, body); popup.className = 'atri-preset-menu'; popup.dataset.atriaOwnsEscape = 'true'; popup.setAttribute('role', 'menu'); popup.setAttribute('aria-label', tl(label));
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
        const inWorkbench = parent?.dataset.atriPromptWorkbench === 'true';
        const editor = mountPromptEditor({ document: doc, parent: parent || body, entry: { ...draft, ref: entryRef(draft) }, entries, foldState: editorFoldStates.get(idOf(entry)), librarySurface: true, presetSurface: true, workbench: inWorkbench ? workbenchState : null, onBack: inWorkbench ? null : () => { if (parent) section = null; renderDetail(); restoreListPosition(); }, onSave: async (resource, upgrade) => {
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
        // A text block that was just created opens ready for writing.
        if (inWorkbench && focusBody) {
            focusBody = false;
            const text = editor.querySelector('textarea.atri-prompt-body');
            if (text) { text.focus({ preventScroll: true }); text.scrollIntoView?.({ block: 'center' }); }
        }
        return editor;
    }
    // The program that defines this preset (its exact revision when pinned).
    const mainProgram = (value = preset) => value.entries.find(e => e.resourceType === PROGRAM && idOf(e) === value.programId && (!value.programRevision || e.resource.revision === value.programRevision));
    const moduleFor = ref => preset.entries.find(e => e.resourceType === MODULE && idOf(e) === ref.resourceId && e.resource.revision === ref.revision)
        || preset.entries.find(e => e.resourceType === MODULE && idOf(e) === ref.resourceId);
    const ANCHOR_SOURCES = { 'context.fact': 'Facts', 'context.history': 'History', 'context.input': 'Input', 'context.player-persona': 'Player persona', 'context.directive': 'Host instructions' };
    async function addTextBlock(stageIndex) {
        const next = clone(preset); const program = mainProgram(next);
        const stage = program.resource.stages[stageIndex];
        const module = newPromptResource(MODULE); module.displayName = tl('New text block'); module.stages = [stage.stageId];
        next.entries.push({ resourceType: MODULE, resource: module });
        const ref = resourceRef(MODULE, module, { scope: 'library' });
        if (stage.entries) {
            // New writing follows the stage's last text block, ahead of its context anchors.
            const last = stage.entries.map(item => item.kind).lastIndexOf('module');
            stage.entries.splice(last + 1, 0, { entryId: createStudioNativeId('step'), kind: 'module', moduleRef: ref });
        } else stage.moduleRefs.push(ref);
        focus = { type: MODULE, id: module.promptModuleId }; focusBody = true;
        await save(next);
    }
    async function addStage() {
        const next = clone(preset); const stages = mainProgram(next).resource.stages;
        let index = stages.length + 1; while (stages.some(stage => stage.stageId === 'stage.step' + index)) index++;
        stages.push({ stageId: 'stage.step' + index, moduleRefs: [] });
        focus = { type: PROGRAM, id: next.programId };
        await save(next);
    }
    // Outline (blueprint §6.4): the program's stages and entries in their stored order,
    // then the preset's generation settings, Regex and module library.
    function renderWorkbench(root) {
        const program = mainProgram();
        const layout = node('div', undefined, root); layout.className = 'atri-prompt-workbench';
        const outline = node('nav', undefined, layout); outline.className = 'atri-prompt-outline'; outline.setAttribute('aria-label', tl('Prompt outline'));
        const pane = node('section', undefined, layout); pane.className = 'atri-prompt-workbench__editor'; pane.dataset.atriPromptWorkbench = 'true';
        const firstModule = program?.resource.stages.flatMap(stage => promptStageEntries(stage)).find(item => item.kind === 'module' && moduleFor(item.moduleRef));
        if (!focus) focus = firstModule ? { type: MODULE, id: firstModule.moduleRef.resourceId } : { type: PROGRAM, id: preset.programId };
        const select = next => { if (!confirmAtriaDraftLeave(doc, pane)) return; focus = next; revealEditor = true; renderDetail(); };
        const item = (parent, label, target, { icon, meta, literalLabel = false, markCurrent = true } = {}) => {
            const row = node('button', undefined, parent); row.type = 'button'; row.className = 'atri-prompt-outline__item';
            if (icon) row.append(createAtriaIcon(doc, icon, { size: 15 }));
            const text = node('span', undefined, row); text.textContent = literalLabel ? label : tl(label);
            if (meta) { const small = node('small', undefined, row); small.textContent = meta; }
            const current = markCurrent && target && focus?.type === target.type && focus.id === target.id;
            row.setAttribute('aria-current', String(Boolean(current)));
            if (target) row.addEventListener('click', () => select(target));
            return row;
        };
        if (program?.resource.parentRef) {
            const inherited = node('p', 'Inherits stages from its parent program. Inherited entries are edited through the program’s derive operations.', outline);
            inherited.className = 'atri-prompt-outline__note';
        }
        (program?.resource.stages || []).forEach((stage, stageIndex) => {
            const group = node('div', undefined, outline); group.className = 'atri-prompt-outline__stage';
            item(group, formatProductText('Stage ${0}', [stageIndex + 1], undefined, 'atria.product.stageIndex'), { type: PROGRAM, id: preset.programId },
                { icon: 'layers' }).classList.add('atri-prompt-outline__stage-title');
            for (const entry of promptStageEntries(stage)) {
                if (entry.kind === 'module') {
                    const module = moduleFor(entry.moduleRef);
                    item(group, module?.resource.displayName || entry.moduleRef.resourceId, module ? { type: MODULE, id: idOf(module) } : null,
                        { icon: 'document', literalLabel: true, meta: module ? undefined : tl('Not in this preset') });
                } else {
                    // Context anchors are filled by the Host at run time; they are configured on the stage.
                    const sources = entry.accepts.map(kind => tl(ANCHOR_SOURCES[kind] || kind)).join(', ');
                    item(group, formatProductText('Context: ${0}', [sources || tl('none')]), { type: PROGRAM, id: preset.programId }, { icon: 'link', literalLabel: true, markCurrent: false })
                        .classList.add('atri-prompt-outline__anchor');
                }
            }
            const add = node('button', 'Add text block', group); add.type = 'button'; add.className = 'atri-prompt-outline__add';
            add.prepend(createAtriaIcon(doc, 'plus', { size: 14 }));
            add.addEventListener('click', async () => { if (add.disabled || !confirmAtriaDraftLeave(doc, pane)) return; add.disabled = true; try { await addTextBlock(stageIndex); } catch (error) { add.disabled = false; fail(error); } });
        });
        if (program) {
            const addStageButton = node('button', 'Add stage', outline); addStageButton.type = 'button'; addStageButton.className = 'atri-prompt-outline__add';
            addStageButton.prepend(createAtriaIcon(doc, 'plus', { size: 14 }));
            addStageButton.addEventListener('click', async () => { if (addStageButton.disabled || !confirmAtriaDraftLeave(doc, pane)) return; addStageButton.disabled = true; try { await addStage(); } catch (error) { addStageButton.disabled = false; fail(error); } });
        }
        const tools = node('div', undefined, outline); tools.className = 'atri-prompt-outline__tools';
        const generation = preset.entries.find(e => e.resourceType === GENERATION);
        if (generation) item(tools, 'Generation settings', { type: GENERATION, id: idOf(generation) }, { icon: 'tune' });
        item(tools, 'Regex rules', null, { icon: 'braces', meta: String((preset.regexScripts || []).length) }).onclick = () => { if (confirmAtriaDraftLeave(doc, pane)) { section = 'regex'; renderDetail(); } };
        item(tools, 'Module library', null, { icon: 'stack', meta: String(preset.entries.filter(e => e.resourceType === MODULE).length) }).onclick = () => { if (confirmAtriaDraftLeave(doc, pane)) { section = MODULE; renderDetail(); } };
        const selected = preset.entries.find(e => e.resourceType === focus.type && idOf(e) === focus.id && (focus.type !== PROGRAM || e === program)) || program;
        if (selected) edit(selected, false, pane);
        // Narrow layouts stack the outline above the editor; bring the chosen item's editor into view.
        if (revealEditor && doc.defaultView.matchMedia?.('(max-width: 959px)').matches) pane.scrollIntoView?.({ block: 'start' });
        revealEditor = false;
    }
    function renderDetail() {
        if (disposed) return;
        closeMenu();
        main().replaceChildren(); const root = node('section'); root.className = 'atri-prompt-preset'; root.dataset.atriPromptPreset = preset.presetId;
        const nav = node('div', undefined, root); nav.className = 'atri-prompt-actions';
        // One way back: from a tool view to the outline, from the outline to all prompts.
        const back = section
            ? button(nav, 'Back to outline', () => { if (confirmAtriaDraftLeave(doc, body)) { section = null; renderDetail(); } })
            : button(nav, 'All prompts', () => { if (confirmAtriaDraftLeave(doc, body)) return list(); });
        back.classList.add('atri-library-detail-close', 'atri-prompt-back');
        back.prepend(createAtriaIcon(doc, 'chevron-left', { size: 16 }));
        literal('h2', preset.entries.find(e => idOf(e) === preset.programId && (!preset.programRevision || e.resource.revision === preset.programRevision)).resource.displayName, root);
        root.dataset.atriPresetRevision = preset.revision;
        if (lastReceipt?.presetId === preset.presetId) {
            const version = String(lastReceipt.revision);
            const receipt = literal('p', formatProductText('Saved. Preset version ${0}.', [version.slice(0, 12)]), root);
            receipt.title = version;
            receipt.className = 'atri-library-feedback'; receipt.setAttribute('role', 'status');
            button(root, 'Review pinned consumers', async () => {
                const references = (await Promise.all(adoptionRefs.filter(ref => [PROGRAM, GENERATION].includes(ref.resourceType)).map(ref => runtimeRequest('/resources/used-by', { method: 'POST', body: ref })))).flat();
                const panel = node('section', undefined, root); node('p', 'Saving keeps consumer versions pinned. Open each owner to adopt this revision through its existing controls.', panel);
                const unique = [...new Map(references.map(item => [JSON.stringify([item.node, item.edge]), item])).values()];
                renderResourceReferenceRows({ document: doc, root: panel, references: unique, host });
            });
        }
        if (!section) { renderWorkbench(root); return; }
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
    // Template gallery (blueprint §4.5): a starting point per kind of writing; nothing runs.
    const TEMPLATE_NOTES = {
        blank: 'One stage and nothing written yet.',
        skeleton: 'A neutral intent with places for facts, persona, history and the reader’s input.',
        roleplay: 'Narrates scenes and voices characters, leaving the player’s choices to the player.',
        writing: 'Writes requested passages in a steady voice, tense and viewpoint.',
        agent: 'Completes tasks with the tools actually available and reports real results.',
    };
    function chooseTemplate(trigger) {
        const dialog = doc.createElement('dialog'); dialog.className = 'atria-onboard atri-prompt-templates';
        dialog.setAttribute('aria-labelledby', 'atri-prompt-templates-title');
        const head = node('header', undefined, dialog); head.className = 'atria-onboard__head';
        node('span', undefined, head).className = 'atria-onboard__spacer';
        const close = node('button', undefined, head); close.type = 'button'; close.className = 'atria-onboard__close'; close.setAttribute('aria-label', tl('Close'));
        close.append(createAtriaIcon(doc, 'close', { size: 18 }));
        const title = node('h2', 'New prompt', dialog); title.className = 'atria-onboard__title'; title.id = 'atri-prompt-templates-title'; title.tabIndex = -1;
        node('p', 'Start from a template. Everything it adds is ordinary, editable text.', dialog).className = 'atria-onboard__lead';
        const grid = node('div', undefined, dialog); grid.className = 'atria-onboard__body atria-onboard__services';
        const status = node('p', undefined, dialog); status.className = 'atria-onboard__status'; status.hidden = true;
        const finish = () => { dialog.close(); dialog.remove(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
        close.addEventListener('click', finish);
        dialog.addEventListener('cancel', event => { event.preventDefault(); finish(); });
        for (const [id, label] of PROMPT_TEMPLATES) {
            const card = node('button', undefined, grid); card.type = 'button'; card.className = 'atria-onboard__service';
            node('strong', label, card); node('span', TEMPLATE_NOTES[id], card);
            card.addEventListener('click', async () => {
                if (dialog.dataset.busy) return; dialog.dataset.busy = 'true'; card.setAttribute('aria-busy', 'true');
                try { await create(newPromptPreset(id)); finish(); } catch (error) {
                    status.hidden = false; status.dataset.tone = 'danger'; status.setAttribute('role', 'alert'); status.textContent = error.message;
                } finally { delete dialog.dataset.busy; card.removeAttribute('aria-busy'); }
            });
        }
        doc.body.append(dialog); dialog.showModal(); title.focus({ preventScroll: true });
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
            pane.replaceChildren(); const root = node('section', undefined, pane); root.className = 'atri-prompt-preset atri-prompt-preset-list';
            const head = node('header', undefined, root); head.className = 'atri-prompt-list-head';
            node('h2', 'Prompts', head);
            const newPrompt = button(head, 'New prompt', () => chooseTemplate(newPrompt));
            newPrompt.classList.add('atri-library-button--primary'); newPrompt.prepend(createAtriaIcon(doc, 'plus', { size: 15 }));
            root.append(createAtriaFileDrop(doc, { label: 'Import preset', hint: 'Drop a preset .json here or choose one', accept: '.json,application/json',
                onFile: async file => {
                    let parsed;
                    try { parsed = JSON.parse(await file.text()); } catch { throw new Error(tl('This file is not valid preset JSON.')); }
                    await create(parsed, true);
                } }));
            if (!presets.length) node('p', 'No presets yet. Create a preset or import a file.', root);
            for (const preset of presets) {
                const row = node('article', undefined, root); row.className = 'atri-prompt-resource atri-library-row'; row.dataset.atriPresetId = preset.presetId;
                row.prepend(createAtriaIcon(doc, 'layers', { size: 16 }));
                literal('h3', preset.displayName, row); button(row, 'Open preset', () => open(preset.presetId));
                row.addEventListener('click', event => { if (!event.target.closest('button, details')) void open(preset.presetId).catch(fail); });
                // Row actions live in a menu that stays in place: hover-revealed buttons
                // shifted under a tap and turned "open" into "export" on touch screens.
                menu(row, 'Preset actions', [
                    ['Export preset', async () => exportPreset(await runtimeRequest('/presets/' + preset.presetId))],
                    ['Delete preset', async () => {
                        const { Popup, POPUP_TYPE } = await import('../popup.js');
                        if (await new Popup(tl('Delete this preset and its Regex rules? Pinned Prompt history remains available.'), POPUP_TYPE.CONFIRM).show()) {
                            await runtimeRequest('/presets/' + preset.presetId, { method: 'DELETE', body: { expectedRevision: preset.revision } });
                            await list();
                        }
                    }, true],
                ]);
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
                            const refs = promptProgramResourceRefs(entry.resource);
                            for (const ref of refs) { const found = entries.find(e => Object.keys(ref).every(k => e.ref[k] === ref[k])); if (!found) throw new Error(tl('Missing exact dependency')); visit(found); }
                        }
                        selected.push({ resourceType: entry.ref.resourceType, resource: entry.resource });
                    };
                    const chosen = programs[Number(program.value)]; visit(chosen);
                    selected.push({ resourceType: GENERATION, resource: generation.value ? generations[Number(generation.value)].resource : newPromptResource(GENERATION) });
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
