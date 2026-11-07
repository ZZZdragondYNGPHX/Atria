import { runtimeRequest } from './runtime-client.js';
import { formatShellText as fmt, translateShellText as tl } from '../atria-shell/localization.js';

// Functional roles are jobs Atria gives a model. They are not story characters
// and not chat message roles. Each job uses exactly one API preset; one preset
// can do any number of jobs. The server owns the assignment (role → preset).
export const MODEL_ROLES = Object.freeze([
    { id: 'role.narrator', label: 'Story narration', description: 'Writes the replies you read in Play.' },
    { id: 'role.intent_resolver', label: 'Understanding actions', description: 'Turns what you type into game actions in works with rules.' },
    { id: 'role.event_interpreter', label: 'Reading game events', description: 'Explains game events to the story in works with rules.' },
    { id: 'role.memory', label: 'Memory', description: 'Extracts and organizes memories after replies.' },
    { id: 'role.illustration_prompt', label: 'Image descriptions', description: 'Writes what an illustration should show.' },
    { id: 'role.orchestrator', label: 'Tools and extensions', description: 'Runs helpers that call tools, such as extensions.' },
    { id: 'role.studio', label: 'Studio', description: 'Builds and edits works in Studio.' },
]);
export const modelRoleLabel = id => tl(MODEL_ROLES.find(role => role.id === id)?.label ?? id.replace(/^role\./, ''));

/** Roles a preset currently serves, in display order. */
export const rolesOfPreset = (assignments, runtimeRouteId) => MODEL_ROLES.filter(role => assignments?.[role.id] === runtimeRouteId).map(role => role.id);

/** Saves one change against the fingerprint it was based on. */
export async function assignModelRoles(data, changes, signal) {
    const assignments = { ...data.roleAssignments.assignments, ...changes };
    const next = await runtimeRequest('/role-assignments', { method: 'PUT', signal,
        body: { assignments, expectedFingerprint: data.roleAssignments.fingerprint } });
    data.roleAssignments = next;
    return next;
}

/**
 * The "who does what" table. Every change saves at once and reports where it
 * went; there is no separate Save step to forget.
 */
export function mountModelRoles({ document: doc, parent, data, signal, onChanged, onReload }) {
    const section = doc.createElement('section'); section.className = 'atri-model-roles'; section.dataset.atriaModelRoles = 'true';
    const head = doc.createElement('header'); head.className = 'atri-model-roles__head'; section.append(head);
    const title = doc.createElement('h3'); title.id = 'atri-model-roles-title'; title.textContent = tl('Model roles'); head.append(title);
    const help = doc.createElement('p'); help.className = 'atri-runtime-help';
    help.textContent = tl('Each job uses one API preset. One preset can do several jobs.'); head.append(help);
    const status = doc.createElement('p'); status.className = 'atri-model-roles__status'; status.setAttribute('role', 'status');
    section.setAttribute('aria-labelledby', title.id);
    const table = doc.createElement('div'); table.className = 'atri-model-roles__list'; table.setAttribute('role', 'list'); section.append(table);
    const all = doc.createElement('div'); all.className = 'atri-model-roles__all'; section.append(all, status);
    parent.append(section);
    let busy = false;
    const presetName = id => data.routes.find(route => route.runtimeRouteId === id)?.displayName;
    async function save(changes, message) {
        if (busy) return;
        busy = true; section.setAttribute('aria-busy', 'true');
        for (const control of section.querySelectorAll('select')) control.disabled = true;
        try {
            await assignModelRoles(data, changes, signal);
            status.dataset.kind = 'ok'; status.textContent = message;
            onChanged?.();
        } catch (error) {
            status.dataset.kind = 'error';
            status.textContent = error.code === 'native_generation_configuration_conflict'
                ? tl('Roles were changed somewhere else. The current roles are shown; choose again.')
                : tl('Could not save the role. Nothing changed.');
            if (error.code === 'native_generation_configuration_conflict') await onReload?.();
        } finally { busy = false; section.removeAttribute('aria-busy'); render(); }
    }
    function render() {
        table.replaceChildren(); all.replaceChildren();
        const assignments = data.roleAssignments?.assignments ?? {};
        for (const role of MODEL_ROLES) {
            const row = doc.createElement('div'); row.className = 'atri-model-roles__row'; row.setAttribute('role', 'listitem'); row.dataset.role = role.id;
            const text = doc.createElement('div'); text.className = 'atri-model-roles__text'; row.append(text);
            const name = doc.createElement('label'); name.textContent = tl(role.label); name.htmlFor = 'atri-role-' + role.id.slice(5); text.append(name);
            const description = doc.createElement('small'); description.textContent = tl(role.description); text.append(description);
            const select = doc.createElement('select'); select.id = name.htmlFor; row.append(select);
            const current = assignments[role.id];
            if (!current) {
                const option = doc.createElement('option'); option.value = ''; option.textContent = tl('Choose a model…'); select.append(option);
                row.dataset.missing = 'true';
                const warning = doc.createElement('small'); warning.className = 'atri-model-roles__warning';
                warning.textContent = tl('No model yet — this job will not run.'); text.append(warning);
            }
            for (const route of data.routes) {
                const option = doc.createElement('option'); option.value = route.runtimeRouteId; option.textContent = route.displayName; select.append(option);
            }
            select.value = current ?? '';
            select.disabled = busy || !data.routes.length;
            select.addEventListener('change', () => {
                if (!select.value) return;
                void save({ [role.id]: select.value }, fmt('${0} now uses ${1}.', [tl(role.label), presetName(select.value)]));
            });
            table.append(row);
        }
        // One step for the common "one model for everything" setup.
        const used = new Set(Object.values(assignments));
        if (data.routes.length > 1 && (used.size > 1 || Object.keys(assignments).length < MODEL_ROLES.length)) {
            const label = doc.createElement('label'); label.textContent = tl('Use one preset for every job');
            const select = doc.createElement('select');
            const placeholder = doc.createElement('option'); placeholder.value = ''; placeholder.textContent = tl('Choose…'); select.append(placeholder);
            for (const route of data.routes) { const option = doc.createElement('option'); option.value = route.runtimeRouteId; option.textContent = route.displayName; select.append(option); }
            select.disabled = busy;
            select.addEventListener('change', () => {
                if (!select.value) return;
                void save(Object.fromEntries(MODEL_ROLES.map(role => [role.id, select.value])), fmt('Every job now uses ${0}.', [presetName(select.value)]));
            });
            label.append(select); all.append(label);
        }
    }
    render();
    return { refresh: render, element: section };
}
