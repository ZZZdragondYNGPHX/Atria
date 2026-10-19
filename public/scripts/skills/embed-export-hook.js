/**
 * Skill embed export hook.
 *
 * Wires the export-side of the embed flow into Atria's existing preset
 * export event (OAI_PRESET_EXPORT_READY). The event fires from openai.js
 * with the preset body just before download; listeners can mutate the body
 * in place to attach extra fields (Atria's regex extension uses this same
 * pattern).
 *
 * UX: if the active preset has any preset-scope skills, surface a yes/no
 * confirm popup asking whether to include them. On yes, attach
 * `extensions.atria.embedded_skills_source`. If no skills exist for the
 * scope, this hook is a no-op (no spurious dialog).
 *
 * Character export goes through Atria's image-card serialization, which
 * doesn't currently emit a similar event. Until a CHARACTER_EXPORT_READY
 * hook lands, character-scope skills export piggybacks on the manual
 * "Pack to embed" path in the skill manager subpanel.
 */

import { packAndAttachSkillsForExport } from './embed-export-helper.js';

/**
 * Confirm-then-attach for preset export. Resolves to true if the user opted
 * in and the payload was attached, false otherwise. Errors are swallowed
 * (logged) so the download still proceeds with the original preset body.
 *
 * @param {object} opts
 * @param {object} opts.context - SillyTavern context
 * @param {object} opts.data - the preset JSON being exported (mutated in
 *   place when the user opts in). Renamed from `presetBody` to align with
 *   the `{data, presetName}` payload shape carried by
 *   OAI_PRESET_EXPORT_READY (mirrors OAI_PRESET_IMPORT_READY, openai.js:6910).
 * @param {string} opts.presetName - the real name of the preset being
 *   exported (card slot name in card-bound mode, global name otherwise).
 *   Provided by the event so the hook no longer needs to reach into
 *   `oai_settings.preset_settings_openai`, which is stale global while
 *   a card-bound ghost is selected (the root of the export identity drift).
 * @param {(s:string)=>string} [opts.t]
 * @returns {Promise<boolean>}
 */
export async function maybeAttachSkillsToPresetExport({ context, data, presetName, t = (s) => s } = {}) {
    if (!context || !context.skills) return false;
    if (!data || typeof data !== 'object') return false;
    const trimmedName = String(presetName || '').trim();
    if (!trimmedName) return false;

    const targetScope = { kind: 'preset', name: trimmedName };

    // Bail early if the scope has no skills — no popup, no payload, just
    // pass through. This is the dominant case for users who don't bind
    // skills to presets.
    let list;
    try {
        list = await context.skills.list({ scope: targetScope });
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[embed-export-hook] preset list failed:', e?.message || e);
        return false;
    }
    if (!Array.isArray(list) || list.length === 0) return false;

    // Ask the user. callGenericPopup returns POPUP_RESULT-shaped values;
    // we treat any truthy result as "yes". Falls back to false on missing API.
    const ok = await confirmIncludeSkills({ context, t, list, targetScope });
    if (!ok) return false;

    try {
        const payload = await packAndAttachSkillsForExport({
            context,
            targetScope,
            attachTo: data,
        });
        if (payload) {
            toast(t('Bundled ${0} skill(s) with this preset.').replace('${0}', String(list.length)), 'success');
            return true;
        }
    } catch (e) {
        toast(t('Failed to bundle skills with preset: ${0}').replace('${0}', e?.message || String(e)), 'error');
    }
    return false;
}

async function confirmIncludeSkills({ context, t, list, targetScope }) {
    if (!context.callGenericPopup || !context.POPUP_TYPE) return false;
    const names = list.map(s => s?.name).filter(Boolean);
    const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;',
    })[c]);
    const list_html = names.map(n => `<li>${escHtml(n)}</li>`).join('');
    const scope_label = `preset: ${escHtml(targetScope.name)}`;
    const html = `
<div class="atria_skill_export_confirm">
    <div>${escHtml(t('Include preset-scope skills in this export?'))}</div>
    <div class="atria_skill_export_confirm_scope"><b>${scope_label}</b></div>
    <ul class="atria_skill_export_confirm_list">${list_html}</ul>
</div>
    `;
    const result = await context.callGenericPopup(html, context.POPUP_TYPE.CONFIRM, '', {
        okButton: t('Include'),
        cancelButton: t('Skip'),
    });
    return isAffirmative(result);
}

function isAffirmative(result) {
    return result === 1 || result === true;
}

function toast(message, level) {
    if (typeof toastr === 'undefined') {
        // eslint-disable-next-line no-console
        console.warn('[embed-export-hook]', message);
        return;
    }
    if (level === 'error') toastr.error(String(message));
    else if (level === 'success') toastr.success(String(message));
    else toastr.info(String(message));
}
