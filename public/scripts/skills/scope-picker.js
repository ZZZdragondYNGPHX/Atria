/** Shared picker for writable Native Skill owners. Package originals remain read-only. */

import { ensureSkillI18n } from './i18n.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;',
})[c]);

export function buildScopePickerHtml({
    title,
    t,
    suggestKind = 'global',
    projects = [], suggestProject = '',
} = {}) {
    const kindRadio = (value, label) => {
        const checked = (suggestKind === 'project' ? 'project' : 'global') === value ? ' checked' : '';
        return `<label class="atria_skill_scope_kind_option">
            <input type="radio" name="atria_skill_scope_kind" value="${value}"${checked}>
            ${esc(t(label))}
        </label>`;
    };
    const projectOptions = projects.length
        ? projects.map(item => `<option value="${esc(item.projectId)}"${item.projectId === suggestProject ? ' selected' : ''}>${esc(item.displayName || item.projectId)}</option>`).join('')
        : `<option value="" disabled selected>${esc(t('No projects available. Create one in Build.'))}</option>`;
    return `
<div class="atria_skill_scope_picker">
    <div class="atria_skill_scope_picker_title">${esc(title)}</div>
    <div class="atria_skill_scope_picker_kinds">
        ${kindRadio('global', 'Global')}
        ${kindRadio('project', 'Project')}
    </div>
    <div data-skill-scope-row="project"${suggestKind !== 'project' ? ' hidden' : ''}>
        <label class="atria_skill_scope_field"><span class="atria_skill_scope_field_label">${esc(t('Project'))}</span>
        <select class="text_pole" data-skill-scope-project>${projectOptions}</select></label>
    </div>
    <p>${esc(t('Package originals are read-only. Publish changes from the source project.'))}</p>

</div>
    `;
}

/**
 * Open the scope picker popup and resolve to the chosen scope. Returns
 * `null` when the user cancels.
 *
 * @param {object} context - Original popup and Native Skill client context.
 * @param {(s:string) => string} t - i18n helper.
 * @param {string} title - dialog header text.
 * @param {object|null} suggestScope - pre-fill defaults.
 * @returns {Promise<object|null>}
 */
export async function pickTargetScope(context, t = (s) => s, title = '', suggestScope = null) {
    if (!context) return null;
    ensureSkillI18n();
    const Popup = context.Popup;
    const POPUP_RESULT = context.POPUP_RESULT;
    const POPUP_TYPE = context.POPUP_TYPE;
    if (!Popup || !POPUP_RESULT || !POPUP_TYPE) {
        if (typeof toastr !== 'undefined') {
            toastr.error(String(t('Popup API missing — cannot pick scope.')));
        }
        return null;
    }

    const suggestKind = suggestScope?.kind === 'project' ? 'project' : 'global';
    let projects = [];
    try { if (context.skills?.listOwners) projects = (await context.skills.listOwners())?.projects ?? []; } catch { if (typeof toastr !== 'undefined') toastr.error(t('Could not load project scopes. Reopen the picker to retry.')); }
    const suggestProject = suggestScope?.projectId || projects[0]?.projectId || '';
    const html = buildScopePickerHtml({ title, t, suggestKind, projects, suggestProject });

    let chosen = null;
    const popup = new Popup(html, POPUP_TYPE.CONFIRM, '', {
        okButton: t('OK'),
        cancelButton: t('Cancel'),
        wider: true,
        onClosing: (p) => {
            if (p.result !== POPUP_RESULT.AFFIRMATIVE) return true;
            const dlg = p.dlg;
            const kind = dlg.querySelector('input[name="atria_skill_scope_kind"]:checked')?.value || 'global';
            if (kind === 'global') {
                chosen = { kind: 'global' };
                return true;
            }
            if (kind === 'project') {
                const projectId = dlg.querySelector('[data-skill-scope-project]')?.value;
                if (!projects.some(item => item.projectId === projectId)) {
                    if (typeof toastr !== 'undefined') toastr.error(t('Choose an existing project.'));
                    return false;
                }
                chosen = { kind: 'project', projectId }; return true;
            }
            return false;
        },
    });

    const popupPromise = popup.show();

    // After the popup renders, wire kind-radio show/hide.
    const dlg = popup.dlg;
    if (dlg) {
        const projectRow = dlg.querySelector('[data-skill-scope-row="project"]');
        const applyKindVisibility = (kind) => {
            if (projectRow) projectRow.hidden = kind !== 'project';
        };
        dlg.querySelectorAll('input[name="atria_skill_scope_kind"]').forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.checked) applyKindVisibility(radio.value);
            });
        });
        applyKindVisibility(suggestKind);
    }

    const result = await popupPromise;
    if (result !== POPUP_RESULT.AFFIRMATIVE) return null;
    return chosen;
}
