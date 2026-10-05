import { formatShellText as formatText, translateShellText as t } from '../atria-shell/localization.js';
import { mountStudioValueEditor } from './studio-value-editor.js';

const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const actorKeys = new Set(['actorId', 'displayName', 'role', 'profile', 'metadata']);
const profileFields = [
    ['description', 'Description'], ['personality', 'Personality'], ['scenario', 'Scenario'],
    ['examples', 'Examples'], ['mes_example', 'Legacy examples'],
    ['systemPrompt', 'System prompt'], ['postHistoryInstructions', 'Post-history instructions'],
];

// A pre-review guard, not a replacement for Project/Package validation.
export function validateStudioActors(actors, projectSource) {
    if (!Array.isArray(actors)) throw new TypeError(t('Actors must be an array.'));
    const ids = new Set();
    function json(value, path) {
        if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError(path + ' ' + t('Enter a finite number.'));
        if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => json(child, path + '.' + key));
    }
    for (const actor of actors) {
        if (!plain(actor)) throw new TypeError(t('Each Actor must be an object.'));
        const unknown = Object.keys(actor).filter(key => !actorKeys.has(key));
        if (unknown.length) throw new TypeError(t('Unsupported Actor fields. Remove them explicitly in Source before review:') + ' ' + unknown.join(', '));
        if (typeof actor.actorId !== 'string' || !/^actor_[0-9a-f]{32}$/.test(actor.actorId)) throw new TypeError('actorId ' + t('Use an exact Native Actor ID.'));
        if (ids.has(actor.actorId)) throw new TypeError('actorId ' + t('Duplicate Actor ID. Give each Actor a distinct ID in Source.') + ' ' + actor.actorId);
        ids.add(actor.actorId);
        for (const [key, max] of [['displayName', 256], ['role', 128]]) {
            if (key === 'role' && actor.role == null) continue;
            if (typeof actor[key] !== 'string' || !actor[key].length || actor[key].length > max) throw new TypeError(key + ' ' + formatText('Enter text between 1 and ${0} characters.', [max]));
        }
        for (const key of ['profile', 'metadata']) {
            if (actor[key] !== undefined && !plain(actor[key])) throw new TypeError(key + ' ' + t('Use a JSON object.'));
            json(actor[key], key);
        }
    }
    for (const entry of projectSource.package.entryPoints || []) {
        const references = [...(entry.actorIds || []), ...(entry.primaryActorId ? [entry.primaryActorId] : [])];
        const missing = references.filter(id => !ids.has(id));
        if (missing.length) throw new TypeError(t('Actor references must be resolved in EntryPoints before review:') + ' ' + entry.entryPointId + ' · ' + [...new Set(missing)].join(', '));
    }
}

export function patchStudioActors(projectSource, actorId, value, collection = false) {
    const next = clone(projectSource);
    if (collection) next.package.actors = value;
    else {
        const matches = next.package.actors.map((actor, index) => actor.actorId === actorId ? index : -1).filter(index => index >= 0);
        if (matches.length !== 1) throw new TypeError(t('Actor identity is ambiguous. Repair duplicate IDs in collection Source.'));
        next.package.actors[matches[0]] = value;
    }
    validateStudioActors(next.package.actors, next);
    return next;
}

export function mountStudioActorsEditor({ document: doc, root, value, projectSource, onReview, collection = false }) {
    const note = (parent, text) => { const node = doc.createElement('p'); node.textContent = t(text); parent.append(node); return node; };
    const section = (parent, title, advanced = false) => {
        const node = doc.createElement(advanced ? 'details' : 'section');
        node.className = 'atri-studio-actors-section';
        const heading = doc.createElement(advanced ? 'summary' : 'h4'); heading.textContent = t(title);
        node.append(heading); parent.append(node); return node;
    };
    function renderFields({ parent, draft, renderValue, rerender }) {
        if (!plain(draft)) { note(parent, 'Each Actor must be an object.'); note(parent, 'Use Source to add, remove or change types. Non-text profile values stay in structured data.'); return; }
        function textField(parent, key, title, object, multiline = false, update) {
            const row = doc.createElement('label'); row.className = 'atria-studio-field';
            const caption = doc.createElement('span'); caption.textContent = t(title);
            const input = doc.createElement(multiline ? 'textarea' : 'input'); input.name = key; input.setAttribute('aria-label', key); input.autocomplete = 'off';
            input.value = object ?? ''; if (multiline) input.rows = 4;
            input.addEventListener('input', () => { update(input.value); input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); });
            row.append(caption, input); parent.append(row);
        }
        const identity = section(parent, 'Actor identity');
        const id = note(identity, draft.actorId || ''); id.className = 'atri-studio-actor-id';
        textField(identity, 'displayName', 'Name', draft.displayName, false, next => { draft.displayName = next; });
        if (draft.role == null || typeof draft.role === 'string') {
            const remove = doc.createElement('button'); remove.type = 'button'; remove.textContent = t('Remove role'); remove.disabled = draft.role === undefined;
            textField(identity, 'role', 'Role (optional)', draft.role, false, next => { draft.role = next; remove.disabled = false; });
            remove.addEventListener('click', () => { delete draft.role; rerender(); parent.querySelector('[name="role"]')?.focus(); });
            identity.append(remove);
        }
        const profile = section(parent, 'Profile');
        note(profile, 'Examples is used when present and non-null; otherwise legacy examples is used. Both keys are preserved.');
        const editable = new Set();
        if (draft.profile === undefined || plain(draft.profile)) {
            for (const [key, title] of profileFields.slice(0, 5)) {
                if (draft.profile?.[key] !== undefined && typeof draft.profile[key] !== 'string') continue;
                editable.add(key);
                textField(profile, 'profile.' + key, title, draft.profile?.[key], true, next => {
                    draft.profile ??= {}; draft.profile[key] = next;
                });
            }
        }
        const prompts = section(parent, 'Advanced prompts', true);
        note(prompts, 'Prompt delivery depends on the work’s existing consumers. Editing here does not select a player Persona.');
        if (draft.profile === undefined || plain(draft.profile)) {
            for (const [key, title] of profileFields.slice(5)) {
                if (draft.profile?.[key] !== undefined && typeof draft.profile[key] !== 'string') continue;
                editable.add(key);
                textField(prompts, 'profile.' + key, title, draft.profile?.[key], true, next => { draft.profile ??= {}; draft.profile[key] = next; });
            }
        }
        const advanced = section(parent, 'Structured data and identity', true);
        note(advanced, 'Use Source to add, remove or change types. Non-text profile values stay in structured data.');
        textField(advanced, 'actorId', 'Actor ID', draft.actorId, false, next => { draft.actorId = next; });
        if (draft.role != null && typeof draft.role !== 'string') {
            const role = {};
            Object.defineProperty(role, 'role', { enumerable: true, get: () => draft.role, set: next => { draft.role = next; } });
            renderValue(advanced, role, '', () => {});
        }
        {
            if (plain(draft.profile)) {
                // Render a projection with setters pointing at the single original draft.
                const extra = Object.fromEntries(Object.entries(draft.profile).filter(([key]) => !editable.has(key)));
                for (const key of Object.keys(extra)) Object.defineProperty(extra, key, { enumerable: true, get: () => draft.profile[key], set: next => { draft.profile[key] = next; } });
                renderValue(advanced, extra, 'profile', () => {});
            } else if (draft.profile !== undefined) note(advanced, 'Use a JSON object.');
            if (plain(draft.metadata)) renderValue(advanced, draft.metadata, 'metadata', () => {});
            else if (draft.metadata !== undefined) note(advanced, 'Use a JSON object.');
        }
        const uses = (projectSource.package.entryPoints || []).filter(entry => entry.actorIds?.includes(value.actorId) || entry.primaryActorId === value.actorId);
        const references = section(parent, 'Actor references', true);
        note(references, 'EntryPoint references are shown here. Validate and Build also check information and voice constraints; Used By is not a complete consumer list.');
        for (const entry of uses) note(references, entry.displayName + ' · ' + entry.entryPointId);
    }
    const editor = mountStudioValueEditor({
        document: doc, root, value, label: collection ? 'Actors collection JSON' : 'Actors resource JSON',
        startSource: collection, renderFields: collection ? undefined : renderFields,
        validate: parsed => patchStudioActors(projectSource, value.actorId, parsed, collection), onReview,
    });
    root.lastElementChild.dataset.atriaStudioActorsEditor = collection ? 'collection' : 'actor';
    return editor;
}
