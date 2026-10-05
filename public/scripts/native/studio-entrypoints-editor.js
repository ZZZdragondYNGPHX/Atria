import { formatShellText as fmt, translateShellText as t } from '../atria-shell/localization.js';
import { mountStudioValueEditor } from './studio-value-editor.js';

const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = new Set(['entryPointId', 'displayName', 'actorIds', 'worldIds', 'knowledgeBindingIds', 'primaryActorId', 'primaryWorldId', 'initialStateOverlay', 'initialTimeline', 'runtime', 'recommendations', 'orchestration', 'memory']);

// Local loss/identity/reference guards before the original human Workspace review.
// Source, Build and Session consumers retain their own authoritative validation.
export function validateStudioEntryPoints(entries, source) {
    if (!Array.isArray(entries) || !entries.length) throw new TypeError(t('EntryPoints must be a non-empty array.'));
    const ids = new Set();
    const declared = {
        actorIds: new Set((source.package.actors || []).map(item => item.actorId)),
        worldIds: new Set([...(source.worlds || []).map(item => item.world.worldId), ...(source.dependencies?.worlds || []).map(item => item.worldId)]),
        knowledgeBindingIds: new Set([...(source.knowledgeBindings || []).map(item => item.knowledgeBindingId), ...(source.dependencies?.knowledgeBindings || [])]),
    };
    function json(value, path) {
        if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError(path + ' ' + t('Enter a finite number.'));
        if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => json(child, path + '.' + key));
    }
    for (const entry of entries) {
        if (!plain(entry)) throw new TypeError(t('Each EntryPoint must be an object.'));
        const unknown = Object.keys(entry).filter(key => !keys.has(key));
        if (unknown.length) throw new TypeError(t('Unsupported EntryPoint fields. Remove them explicitly in Source before review:') + ' ' + unknown.join(', '));
        if (typeof entry.entryPointId !== 'string' || !/^entry_[0-9a-f]{32}$/.test(entry.entryPointId)) throw new TypeError('entryPointId ' + t('Use an exact Native EntryPoint ID.'));
        if (ids.has(entry.entryPointId)) throw new TypeError(t('Duplicate EntryPoint ID. Repair collection Source before review.') + ' ' + entry.entryPointId);
        ids.add(entry.entryPointId);
        if (typeof entry.displayName !== 'string' || !entry.displayName.length || entry.displayName.length > 256) throw new TypeError('displayName ' + fmt('Enter text between 1 and ${0} characters.', [256]));
        for (const [key, prefix, primary] of [['actorIds', 'actor', 'primaryActorId'], ['worldIds', 'world', 'primaryWorldId'], ['knowledgeBindingIds', 'kbind']]) {
            const values = entry[key] === undefined ? [] : entry[key];
            if (!Array.isArray(values) || new Set(values).size !== values.length || values.some(id => typeof id !== 'string' || !new RegExp('^' + prefix + '_[0-9a-f]{32}$').test(id))) throw new TypeError(key + ' ' + t('Use an ordered array of unique exact IDs.'));
            const missing = values.filter(id => !declared[key].has(id));
            if (missing.length) throw new TypeError(key + ' ' + t('References must be declared in the project before review:') + ' ' + missing.join(', '));
            if (primary && entry[primary] != null && !values.includes(entry[primary])) throw new TypeError(primary + ' ' + t('The primary ID must belong to its reference array.'));
        }
        if (entry.runtime?.experienceContract !== undefined) throw new TypeError(t('experienceContract belongs to Package.runtime.'));
        json(entry, 'EntryPoint');
    }
}

export function patchStudioEntryPoints(source, entryPointId, value, collection = false) {
    const next = clone(source);
    if (collection) next.package.entryPoints = value;
    else {
        const matches = next.package.entryPoints.map((entry, index) => entry.entryPointId === entryPointId ? index : -1).filter(index => index >= 0);
        if (matches.length !== 1) throw new TypeError(t('EntryPoint identity is ambiguous. Repair duplicate IDs in collection Source.'));
        next.package.entryPoints[matches[0]] = value;
    }
    validateStudioEntryPoints(next.package.entryPoints, next);
    return next;
}

export function mountStudioEntryPointsEditor({ document: doc, root, value, projectSource, onReview, collection = false }) {
    const note = (parent, text) => { const node = doc.createElement('p'); node.textContent = t(text); parent.append(node); return node; };
    const section = (parent, title, advanced = false) => {
        const node = doc.createElement(advanced ? 'details' : 'section'); node.className = 'atri-studio-entrypoints-section';
        const heading = doc.createElement(advanced ? 'summary' : 'h4'); heading.textContent = t(title); node.append(heading); parent.append(node); return node;
    };
    function renderFields({ parent, draft, renderValue, rerender }) {
        if (!plain(draft)) { note(parent, 'Each EntryPoint must be an object.'); return; }
        const identity = section(parent, 'EntryPoint identity');
        note(identity, draft.entryPointId || '');
        function textField(parent, key, title) {
            if (typeof draft[key] !== 'string') return;
            const label = doc.createElement('label'); label.className = 'atria-studio-field';
            const caption = doc.createElement('span'); caption.textContent = t(title);
            const input = doc.createElement('input'); input.name = key; input.setAttribute('aria-label', key); input.value = draft[key]; input.autocomplete = 'off';
            input.addEventListener('input', () => { draft[key] = input.value; input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); });
            label.append(caption, input); parent.append(label);
        }
        textField(identity, 'displayName', 'Name');
        // Setters project individual keys onto the value editor's one original draft.
        function structured(parent, key) {
            if (draft[key] === undefined) { note(parent, 'Not specified. Use Source to add, remove or change types.'); return; }
            const projection = {};
            Object.defineProperty(projection, key, { enumerable: true, get: () => draft[key], set: next => { draft[key] = next; } });
            renderValue(parent, projection, '', () => {});
        }
        const references = section(parent, 'EntryPoint references');
        note(references, 'Reference order is preserved. Use Source to remove or reorder IDs. Missing references stay visible until repaired.');
        for (const [key, title, primary, candidates] of [
            ['actorIds', 'Actors', 'primaryActorId', (projectSource.package.actors || []).map(item => ({ id: item.actorId, label: item.displayName }))],
            ['worldIds', 'Worlds', 'primaryWorldId', [
                ...(projectSource.worlds || []).map(item => ({ id: item.world.worldId, label: item.world.displayName, revision: item.revision.worldRevisionId })),
                ...(projectSource.dependencies?.worlds || []).map(item => ({ id: item.worldId, revision: item.worldRevisionId })),
            ]],
            ['knowledgeBindingIds', 'Knowledge bindings', null, [
                ...(projectSource.knowledgeBindings || []).map(item => ({ id: item.knowledgeBindingId, revision: [item.source?.knowledgeBaseId, item.source?.knowledgeRevisionId].filter(Boolean).join(' · ') })),
                ...(projectSource.dependencies?.knowledgeBindings || []).map(id => ({ id })),
            ]],
        ]) {
            const group = section(references, title, true); group.open = true; structured(group, key);
            for (const item of candidates) {
                const add = doc.createElement('button'); add.type = 'button'; add.textContent = fmt('Add reference: ${0}', [[item.label, item.id, item.revision].filter(Boolean).join(' · ')]);
                add.disabled = draft[key] !== undefined && !Array.isArray(draft[key]) || draft[key]?.includes?.(item.id);
                add.addEventListener('click', () => { draft[key] ??= []; draft[key].push(item.id); rerender(); }); group.append(add);
            }
            if (!primary) continue;
            const label = doc.createElement('label'); label.className = 'atria-studio-field';
            const caption = doc.createElement('span'); caption.textContent = t(primary === 'primaryActorId' ? 'Primary Actor (optional)' : 'Primary World (optional)');
            const select = doc.createElement('select'); select.name = primary; select.setAttribute('aria-label', primary);
            const values = ['', ...(Array.isArray(draft[key]) ? draft[key] : [])];
            if (draft[primary] != null && !values.includes(draft[primary])) values.push(draft[primary]);
            for (const id of values) { const option = doc.createElement('option'); option.value = id; const item = candidates.find(item => item.id === id); option.textContent = id ? [item?.label, id].filter(Boolean).join(' · ') : t('Not specified'); select.append(option); }
            select.value = draft[primary] ?? '';
            select.addEventListener('change', () => { if (select.value) draft[primary] = select.value; else delete draft[primary]; remove.disabled = draft[primary] === undefined; select.removeAttribute('aria-invalid'); select.removeAttribute('aria-describedby'); });
            label.append(caption, select); group.append(label);
            const remove = doc.createElement('button'); remove.type = 'button'; remove.textContent = t(primary === 'primaryActorId' ? 'Remove primary Actor' : 'Remove primary World'); remove.disabled = draft[primary] === undefined;
            remove.addEventListener('click', () => { delete draft[primary]; rerender(); }); group.append(remove);
        }
        note(references, 'Without a primary Actor, display may use the first Actor. A primary World is inferred only for a single World. These fallbacks are not saved.');
        const initial = section(parent, 'Initial state and messages');
        note(initial, 'Session start requires an object overlay and an array timeline; null uses the existing defaults. A non-empty multi-World overlay needs a primary World. Overlay merges shallowly into that World baseline.');
        note(initial, 'Message role, content, actorId, metadata, projection and envelope are checked at Session start. Protected identity and diagnostics metadata cannot be injected. Review is not a startup check.');
        structured(initial, 'initialStateOverlay'); structured(initial, 'initialTimeline');
        const advanced = section(parent, 'Advanced EntryPoint data', true);
        note(advanced, 'Use Source for optional fields and arbitrary JSON. Nested values are preserved; unsupported top-level fields must be removed explicitly. Fields already removed by project normalization cannot be recovered here.');
        note(advanced, 'Runtime experience uses the original Frontend contract. experienceContract belongs to Package.runtime. Preserved recommendations, orchestration and memory do not imply an active consumer.');
        textField(advanced, 'entryPointId', 'EntryPoint ID');
        note(advanced, 'Changing an ID does not rewrite scenarios, references or existing Sessions.');
        for (const key of ['runtime', 'recommendations', 'orchestration', 'memory']) structured(advanced, key);
    }
    const editor = mountStudioValueEditor({ document: doc, root, value,
        label: collection ? 'EntryPoints collection JSON' : 'EntryPoints resource JSON', startSource: collection,
        renderFields: collection ? undefined : renderFields,
        validate: parsed => patchStudioEntryPoints(projectSource, value?.entryPointId, parsed, collection), onReview,
    });
    root.lastElementChild.dataset.atriaStudioEntryPointsEditor = collection ? 'collection' : 'entrypoint';
    return editor;
}
