/**
 * field-help.js — Shared "?" help button for generic field explanations.
 *
 * Three layers:
 *   Layer 1 (direct):       import { renderFieldHelpButton } from '/scripts/extensions/field-help.js';
 *   Layer 2 (atriaContext): const { renderFieldHelpButton } = atriaContext;
 *   Layer 3 (getContext):   const { renderFieldHelpButton } = Atria.getContext();
 *
 * Similar visual to preset-help (fa-circle-question) but plain title+body popup;
 * no preset-import side action. Body must be HTML-safe (call site's responsibility).
 */

import { escapeHtml } from '../utils.js';
import { translate } from '../i18n.js';

/**
 * @param {object} opts
 * @param {string} opts.title             Popup title (plain text).
 * @param {string} opts.bodyHtml          Popup body (HTML, caller must escape).
 * @param {string} [opts.targetSelectId]  Optional id of the field the help belongs to (for future auto-attach).
 * @returns {string} HTML string
 */
export function renderFieldHelpButton({ title, bodyHtml, targetSelectId = '' }) {
    const t = String(title || '');
    const b = String(bodyHtml || '');
    const target = targetSelectId ? ` data-atria-field-help-target="${escapeHtml(targetSelectId)}"` : '';
    return `<button type="button" class="atria-field-help" title="${escapeHtml(t)}" data-atria-field-help-title="${escapeHtml(t)}" data-atria-field-help-body="${escapeHtml(b)}"${target}><i class="fa-solid fa-circle-question"></i></button>`;
}

// One-shot delegated click handler
if (typeof jQuery !== 'undefined') {
    jQuery(document).off('click.atriaFieldHelp').on('click.atriaFieldHelp', '.atria-field-help', async function (event) {
        event.preventDefault();
        event.stopPropagation();
        const $btn = jQuery(this);
        const title = $btn.attr('data-atria-field-help-title') || '';
        const body = $btn.attr('data-atria-field-help-body') || '';
        try {
            const ctx = (typeof Atria !== 'undefined') ? Atria.getContext() : null;
            if (!ctx || typeof ctx.callGenericPopup !== 'function') return;
            const POPUP_TYPE = ctx.POPUP_TYPE || { TEXT: 1 };
            const wrapper = `<h4>${escapeHtml(title)}</h4><div>${body}</div>`;
            await ctx.callGenericPopup(wrapper, POPUP_TYPE.TEXT, '', {
                okButton: translate('Close'),
                allowVerticalScrolling: true,
                wide: false,
            });
        } catch (err) {
            console.warn('[field-help] popup failed:', err);
        }
    });
}

// Layer 2 exposure
if (typeof globalThis.atriaContext === 'object' && globalThis.atriaContext) {
    globalThis.atriaContext.renderFieldHelpButton = renderFieldHelpButton;
}
