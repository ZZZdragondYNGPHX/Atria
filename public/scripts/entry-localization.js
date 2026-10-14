// Entry pages read the same language preference and catalog as the app.
// Importing the app's i18n module here would boot its authenticated dependencies.
import { SHELL_TEXT_KEYS } from './atria-shell/localization.js';
export async function loadEntryLocalization({ storage, fetch: request = globalThis.fetch } = {}) {
    let requested = 'en';
    try { requested = (storage || globalThis.localStorage)?.getItem('language') || 'en'; } catch { /* English remains usable when storage is unavailable. */ }
    const locale = String(requested).toLowerCase().startsWith('zh') ? 'zh-cn' : 'en';
    let catalog = {};
    if (locale === 'zh-cn') {
        const response = await request('/locales/zh-cn.json');
        if (!response.ok) throw new Error('Could not load interface text. Try again.');
        catalog = await response.json();
    }
    return { locale, translate: text => catalog[SHELL_TEXT_KEYS[text] || text] || text };
}

export function applyEntryLocalization(documentRef, localization) {
    documentRef.documentElement.lang = localization.locale;
    for (const node of documentRef.querySelectorAll('[data-entry-text]')) node.textContent = localization.translate(node.dataset.entryText);
    for (const node of documentRef.querySelectorAll('[data-entry-label]')) node.setAttribute('aria-label', localization.translate(node.dataset.entryLabel));
    for (const node of documentRef.querySelectorAll('[data-entry-description]')) node.setAttribute('aria-description', localization.translate(node.dataset.entryDescription));
}
