import { translateShellText as tl } from '../atria-shell/localization.js';
import { runtimeRequest } from './runtime-client.js';
import { newPromptResource, resourceRef, PROMPT_TYPES, mountPromptEditor } from './prompt-authoring.js';
import { createStudioNativeId } from './studio-authoring.js';

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
        preset = await runtimeRequest('/presets/' + result.presetId); void host.refreshSearch?.(); renderDetail();
    };
    const open = async id => { const token = ++sequence; body.replaceChildren(); node('p', 'Loading exact resources…'); const value = await runtimeRequest('/presets/' + id); if (disposed || token !== sequence) return; preset = value; section = null; renderDetail(); };
    const create = async (value, importing = false) => { const result = await runtimeRequest('/presets', { method: 'POST', body: { preset: value, importing } }); await open(result.presetId); };
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
    function edit(entry, fresh = false, parent = null) {
        if (!parent) body.replaceChildren(); const draft = clone(entry);
        const entries = preset.entries.map(e => ({ ...e, ref: entryRef(e) }));
        mountPromptEditor({ document: doc, parent: parent || body, entry: { ...draft, ref: entryRef(draft) }, entries, librarySurface: true, presetSurface: true, onBack: () => { if (parent) section = null; renderDetail(); }, onSave: async resource => {
            if (resource[PROMPT_TYPES[entry.resourceType][1]] !== idOf(entry)) throw new Error(tl('Cannot change resource identity.'));
            const next = clone(preset); const item = { resourceType: entry.resourceType, resource };
            if (fresh) next.entries.push(item); else next.entries[next.entries.findIndex(e => idOf(e) === idOf(entry))] = item;
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
        body.replaceChildren(); const root = node('section'); root.className = 'atri-prompt-preset'; root.dataset.atriPromptPreset = preset.presetId;
        const nav = node('div', undefined, root); nav.className = 'atri-prompt-actions';
        button(nav, 'Back to presets', list);
        if (section) button(nav, 'Back to preset', () => { section = null; renderDetail(); });
        literal('h2', preset.entries.find(e => idOf(e) === preset.programId).resource.displayName, root);
        button(nav, 'Export preset', () => {
            const data = { format: preset.format, schemaVersion: 1, programId: preset.programId, categories: preset.categories, moduleCategories: preset.moduleCategories, entries: preset.entries };
            const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
            const a = node('a', undefined, root); a.href = url; a.download = preset.displayName.replace(/[^\p{L}\p{N}_ -]/gu, '_').slice(0, 80) + '.prompt-preset.json'; a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
        if (!section) {
            node('p', 'This preset owns its program, modules and generation settings. Changes affect only this preset.', root);
            const cards = node('div', undefined, root); cards.className = 'atri-preset-sections';
            for (const [type, label] of [[PROGRAM, 'Prompt Programs'], [MODULE, 'Prompt Modules'], [GENERATION, 'Generation Profiles']]) button(cards, label, () => { section = type; renderDetail(); });
            return;
        }
        node('h3', PROMPT_TYPES[section][0], root);
        if (section !== MODULE) {
            for (const e of preset.entries.filter(e => e.resourceType === section)) {
                const row = node('article', undefined, root); row.className = 'atri-prompt-resource'; edit(e, false, row);
            }
            return;
        }
        const tools = node('div', undefined, root); tools.className = 'atri-prompt-actions';
        button(tools, 'New module', () => edit({ resourceType: MODULE, resource: newPromptResource(MODULE) }, true));
        button(tools, 'Copy existing module', async () => {
            const entries = (await runtimeRequest('/resources')).filter(e => e.ref.resourceType === MODULE);
            if (disposed || !tools.isConnected) return;
            const panel = node('div', undefined, root); panel.className = 'atri-preset-category-form';
            const choice = select(panel, 'Existing module', [['', tl('Choose…')], ...entries.map((e, i) => [String(i), e.resource.displayName + ' · ' + e.ref.scope + ' · ' + e.ref.revision])]);
            button(panel, 'Copy into this preset', () => {
                if (!choice.value) { choice.focus(); return; }
                const resource = clone(entries[Number(choice.value)].resource);
                resource.promptModuleId = createStudioNativeId('pmod'); resource.revision = createStudioNativeId('rev');
                edit({ resourceType: MODULE, resource }, true);
            });
            choice.focus();
        });
        const form = node('div', undefined, root); form.className = 'atri-preset-category-form';
        const categoryName = field(form, 'Category name');
        const parent = select(form, 'Parent category', [['', tl('Top level')], ...preset.categories.map(c => [c.id, categoryPath(c.id)])]);
        button(form, 'Create category', async () => { if (!categoryName.value.trim()) { categoryName.focus(); return; } const next = clone(preset); next.categories.push({ id: createStudioNativeId('cat'), name: categoryName.value.trim(), parentId: parent.value || null }); await save(next); });
        const moduleRow = (entry, parent) => {
            const row = node('article', undefined, parent); row.className = 'atri-prompt-resource'; literal('h4', entry.resource.displayName, row);
            button(row, 'View / edit parameters', () => edit(entry));
            button(row, 'Delete module', async () => {
                const staging = clone(preset), categoryId = createStudioNativeId('cat');
                staging.categories.push({ id: categoryId, name: entry.resource.displayName, parentId: null }); staging.moduleCategories[idOf(entry)] = categoryId;
                const { next, modules, affected } = removePresetCategory(staging, categoryId);
                await confirmRemoval(next, modules, affected, entry.resource.displayName);
            }).classList.add('atri-library-button--danger');
            const target = select(row, 'Module category', [['', tl('Uncategorized')], ...preset.categories.map(c => [c.id, categoryPath(c.id)])], preset.moduleCategories[idOf(entry)]);
            button(row, 'Move module', async () => { const next = clone(preset); if (target.value) next.moduleCategories[idOf(entry)] = target.value; else delete next.moduleCategories[idOf(entry)]; await save(next); });
        };
        const branch = (parentId, container) => {
            for (const category of preset.categories.filter(c => (c.parentId || null) === parentId)) {
                const box = node('details', undefined, container); box.open = true; box.className = 'atri-preset-category';
                literal('summary', category.name, box);
                const controls = node('div', undefined, box); controls.className = 'atri-preset-category-form';
                const name = field(controls, 'Rename category', category.name);
                button(controls, 'Save category name', async () => { if (!name.value.trim()) return; const next = clone(preset); next.categories.find(c => c.id === category.id).name = name.value.trim(); await save(next); });
                button(controls, 'Delete category', async () => {
                    const { next, modules, affected } = removePresetCategory(preset, category.id);
                    await confirmRemoval(next, modules, affected, categoryPath(category.id));
                }).classList.add('atri-library-button--danger');
                preset.entries.filter(e => e.resourceType === MODULE && preset.moduleCategories[idOf(e)] === category.id).forEach(e => moduleRow(e, box));
                branch(category.id, box);
            }
        };
        branch(null, root);
        const uncategorized = preset.entries.filter(e => e.resourceType === MODULE && !preset.moduleCategories[idOf(e)]);
        if (uncategorized.length) { node('h4', 'Uncategorized', root); uncategorized.forEach(e => moduleRow(e, root)); }
        if (!preset.entries.some(e => e.resourceType === MODULE)) node('p', 'No modules yet. Create a module, then add it to the program.', root);
    }
    async function list() {
        const token = ++sequence; preset = null; body.replaceChildren(); node('p', 'Loading exact resources…');
        try {
            const presets = await runtimeRequest('/presets'); if (disposed || token !== sequence) return;
            body.replaceChildren(); const root = node('section'); root.className = 'atri-prompt-preset'; node('h2', 'Prompt Presets', root);
            const tools = node('div', undefined, root); tools.className = 'atri-prompt-actions';
            button(tools, 'New preset', () => { const program = newPromptResource(PROGRAM), generation = newPromptResource(GENERATION); return create({ format: 'atria.prompt-preset', schemaVersion: 1, programId: program.promptProgramId, categories: [], moduleCategories: {}, entries: [{ resourceType: PROGRAM, resource: program }, { resourceType: GENERATION, resource: generation }] }); });
            const file = field(root, 'Import preset'); file.type = 'file'; file.accept = '.json,application/json';
            button(root, 'Import selected preset', async () => { if (!file.files?.length) { file.focus(); return; } await create(JSON.parse(await file.files[0].text()), true); });
            if (!presets.length) node('p', 'No presets yet. Create a preset or import a file.', root);
            for (const preset of presets) { const row = node('article', undefined, root); row.className = 'atri-prompt-resource'; literal('h3', preset.displayName, row); button(row, 'Open preset', () => open(preset.presetId)); }
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
    return { updateRoute, dispose() { disposed = true; sequence++; } };
}
