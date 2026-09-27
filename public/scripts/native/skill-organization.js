import { extensionsRequest } from './extensions-client.js';
import { el, action, field, feedback, confirmLibraryAction } from './library-ui.js';
import { skillEntryKey, skillInvocationMode, SKILL_INVOCATION_PATHS } from '../../shared/extension-contract.js';
import { translateShellText as tl } from '../atria-shell/localization.js';

/** Presentation only: preferences use the shared ExtensionsStore revision. */
export function createSkillOrganization({ request = extensionsRequest, confirm = confirmLibraryAction } = {}) {
    let query = '', filter = 'all', busy = false;
    const collapsed = new Set();
    async function render(mount, skills, refresh) {
        const doc = mount.ownerDocument;
        const body = mount.querySelector('.atria_skill_manager_body');
        if (!body) return;
        mount.querySelector('.atria_skill_manager > header')?.remove();
        let snapshot;
        try { snapshot = await request('/settings'); } catch (error) { feedback(doc, mount, error.message, true); return; }
        if (!mount.isConnected || !mount.contains(body)) return;
        const controls = el(doc, 'div', 'atri-skill-organization'); body.before(controls);
        async function save(change) {
            if (busy) return;
            busy = true;
            const focusedRow = doc.activeElement?.closest('[data-skill-name]');
            const focusedName = focusedRow?.dataset.skillName, focusedScope = focusedRow?.dataset.skillScope;
            const value = structuredClone(snapshot.value); change(value);
            try {
                snapshot = await request('/settings', { method: 'PUT', body: { value, expectedRevision: snapshot.revision } });
                await refresh();
                const row = [...mount.querySelectorAll('[data-skill-name]')].find(node => node.dataset.skillName === focusedName && node.dataset.skillScope === focusedScope);
                const summary = row?.querySelector(':scope > details > summary');
                (summary || mount.querySelector('.atri-skill-organization input'))?.focus({ preventScroll: true });
            } catch (error) {
                feedback(doc, controls, error.status === 409 ? 'Skill settings changed elsewhere. Refresh before trying again.' : error.message, true);
            } finally { busy = false; }
        }
        const search = field(doc, controls, 'Search Skills', query, 'search');
        const filterLabel = el(doc, 'label', 'atri-library-field', tl('Folder'), controls);
        const folderFilter = el(doc, 'select', '', undefined, filterLabel); folderFilter.setAttribute('aria-label', tl('Folder'));
        for (const item of [{ id: 'all', name: tl('All folders') }, { id: '', name: tl('Unfiled') }, ...snapshot.value.folders]) {
            const option = el(doc, 'option', '', item.name, folderFilter); option.value = item.id;
        }
        folderFilter.value = filter;
        const create = el(doc, 'details', 'atri-library-details', undefined, controls);
        el(doc, 'summary', '', tl('New folder'), create);
        const folderName = field(doc, create, 'New folder'); folderName.maxLength = 80;
        action(doc, create, 'Create folder', async () => {
            const name = folderName.value.trim(); if (!name) { folderName.focus(); return; }
            await save(value => value.folders.push({ id: 'folder_' + crypto.randomUUID().replaceAll('-', ''), name }));
        });
        const rows = [...body.querySelectorAll('[data-skill-name]')];
        body.replaceChildren();
        const groups = new Map();
        for (const folder of [{ id: '', name: tl('Unfiled') }, ...snapshot.value.folders]) {
            const group = el(doc, 'details', 'atri-library-details', undefined, body); group.open = !collapsed.has(folder.id); group.dataset.skillFolder = folder.id;
            el(doc, 'summary', '', folder.name, group);
            group.addEventListener('toggle', () => { if (group.open) collapsed.delete(folder.id); else collapsed.add(folder.id); });
            if (folder.id) {
                const manage = el(doc, 'details', 'atri-library-details', undefined, group);
                el(doc, 'summary', '', tl('Folder'), manage);
                const name = field(doc, manage, 'Folder name', folder.name); name.maxLength = 80;
                action(doc, manage, 'Rename folder', async () => { if (name.value.trim()) await save(value => { value.folders.find(item => item.id === folder.id).name = name.value.trim(); }); });
                action(doc, manage, 'Delete folder', async () => {
                    if (await confirm('Delete this folder? Its Skills will move to Unfiled.')) await save(value => {
                        value.folders = value.folders.filter(item => item.id !== folder.id);
                        for (const pref of Object.values(value.skills)) if (pref.folderId === folder.id) pref.folderId = null;
                        if (filter === folder.id) filter = 'all';
                    });
                }, { danger: true });
            }
            groups.set(folder.id, group);
        }
        for (const row of rows) {
            const entry = skills.find(item => item.name === row.dataset.skillName && skillEntryKey(item) === skillEntryKey({ name: row.dataset.skillName, scope: JSON.parse(row.dataset.skillScope) }));
            if (!entry) continue;
            const key = skillEntryKey(entry), pref = snapshot.value.skills[key];
            const folderId = groups.has(pref?.folderId) ? pref.folderId : '';
            groups.get(folderId).append(row);
            el(doc, 'p', 'atria_skill_scope_badge', [entry.scope.kind, entry.scope.displayName || entry.scope.projectId || entry.scope.packageId || entry.scope.name || entry.scope.characterFile, entry.scope.packageVersionId].filter(Boolean).join(' · '), row.querySelector('.atria_skill_row_main'));
            const settings = el(doc, 'details', 'atri-library-details', undefined, row);
            el(doc, 'summary', '', tl('Folder and invocation paths'), settings);
            el(doc, 'p', '', tl('Paths control loading within the existing scope and permission rules.'), settings);
            const selectors = {};
            function select(label, choices, selected) {
                const wrapper = el(doc, 'label', 'atri-library-field', tl(label), settings);
                const input = el(doc, 'select', '', undefined, wrapper); input.setAttribute('aria-label', tl(label));
                for (const [value, text] of choices) { const option = el(doc, 'option', '', tl(text), input); option.value = value; }
                input.value = selected; return input;
            }
            const folder = select('Folder', [['', 'Unfiled'], ...snapshot.value.folders.map(item => [item.id, item.name])], folderId);
            for (const path of SKILL_INVOCATION_PATHS) selectors[path] = select({ narrative: 'Narrative', studio: 'Studio', agents: 'Agents' }[path], [['off', 'Off'], ['on-demand', 'On demand'], ['always', 'Always']], skillInvocationMode(entry, snapshot.value, path));
            action(doc, settings, 'Save Skill settings', () => save(value => {
                value.skills[key] = { ...value.skills[key], folderId: folder.value || null, paths: Object.fromEntries(SKILL_INVOCATION_PATHS.map(path => [path, selectors[path].value])) };
            }));
        }
        const empty = feedback(doc, body, 'No matching Skills.');
        function applyFilter() {
            let count = 0;
            for (const [id, group] of groups) {
                group.hidden = filter !== 'all' && filter !== id;
                for (const row of group.querySelectorAll('[data-skill-name]')) {
                    row.hidden = !row.textContent.toLocaleLowerCase().includes(query.toLocaleLowerCase());
                    if (!group.hidden && !row.hidden) count++;
                }
            }
            empty.hidden = count > 0;
        }
        search.addEventListener('input', () => { query = search.value; applyFilter(); });
        folderFilter.addEventListener('change', () => { filter = folderFilter.value; applyFilter(); });
        applyFilter();
    }
    return { render };
}
