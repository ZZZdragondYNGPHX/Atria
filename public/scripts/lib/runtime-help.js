import { translateShellText as tl } from '../atria-shell/localization.js';
import { escapeHtml } from '../utils.js';

export function renderRuntimeHelpButton() {
    const label = escapeHtml(tl('Runtime route help'));
    return `<button type="button" class="menu_button menu_button_small" data-atria-runtime-route-help title="${label}" aria-label="${label}"><i class="fa-solid fa-circle-question" aria-hidden="true"></i></button>`;
}
globalThis.document?.addEventListener('click', event => {
    if (!event.target?.closest?.('[data-atria-runtime-route-help]')) return;
    event.preventDefault();
    globalThis.Atria?.shell?.getWorkspaceHost?.()?.openRuntimeSection('routes');
});
