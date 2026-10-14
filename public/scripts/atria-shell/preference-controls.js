import { translateShellText as tl } from './localization.js';
import { el, feedback } from '../native/library-ui.js';

const CONTROLS = Object.freeze({
    appearance: [['font_scale', 'Reading size', 'range']],
    language: [['language', 'Language', 'select', [['en', 'English'], ['zh-cn', '简体中文']]]],
    interface: [
        ['send_on_enter', 'Send on Enter', 'select', [[0, 'Automatic'], [-1, 'Use Ctrl / Cmd + Enter'], [1, 'Enter sends; Shift + Enter adds a line']]],
        ['auto_scroll_chat_to_bottom', 'Follow new story text', 'checkbox'],
        ['before_unload_guard_mode', 'Confirm before leaving', 'select', [['smart', 'When changes are unsaved'], ['always', 'Always'], ['off', 'Off']]],
    ],
    accessibility: [['reduced_motion', 'Reduce motion', 'checkbox'], ['fast_ui_mode', 'Reduce blur', 'checkbox']],
});

export function mountAtriaPreferenceControls({ document: doc, group, section, authority = globalThis.Atria?.getContext?.(), sample }) {
    const query = doc.defaultView.matchMedia?.('(prefers-reduced-motion: reduce)');
    const prefs = authority?.powerUserSettings || {};
    const values = CONTROLS[section] || [];
    const nodes = new Map();
    for (const [key, label, type, options] of values) {
        const row = el(doc, 'div', 'atria-preference-row', undefined, group);
        const wrapper = el(doc, 'label', '', undefined, row);
        el(doc, 'span', '', tl(label), wrapper);
        const input = el(doc, type === 'select' ? 'select' : 'input', '', undefined, wrapper);
        input.dataset.atriaPreference = key;
        input.name = key;
        input.autocomplete = 'off';
        input.setAttribute('aria-label', tl(label));
        if (type !== 'select') input.type = type;
        if (type === 'checkbox') input.setAttribute('role', 'switch');
        for (const [value, caption] of options || []) {
            const option = el(doc, 'option', '', key === 'language' ? caption : tl(caption), input); option.value = String(value);
        }
        const value = key === 'language' ? authority?.getCurrentLocale?.() || 'en' : prefs[key];
        if (type === 'checkbox') input.checked = Boolean(value);
        else input.value = String(value ?? (key === 'font_scale' ? 1 : options?.[0]?.[0] ?? ''));
        input.disabled = typeof authority?.updateAtriaPreference !== 'function' || key === 'language' && typeof authority?.setUiLanguage !== 'function';
        if (type === 'range') {
            input.min = '.5'; input.max = '1.5'; input.step = '.01';
            input.value = String(value ?? 1);
            if (sample) sample.style.fontSize = `${20 * Number(input.value)}px`;
            input.addEventListener('input', () => { if (sample) sample.style.fontSize = `${20 * Number(input.value)}px`; });
        }
        input.addEventListener('change', async () => {
            try {
                if (key === 'language') {
                    input.disabled = true; input.setAttribute('aria-busy', 'true');
                    await authority.setUiLanguage(input.value);
                } else authority.updateAtriaPreference(key, type === 'checkbox' ? input.checked : ['font_scale', 'send_on_enter'].includes(key) ? Number(input.value) : input.value);
            } catch {
                feedback(doc, row, 'Could not apply this setting. Try again.', true);
                if (key === 'language') input.value = authority.getCurrentLocale();
                else if (type === 'checkbox') input.checked = Boolean(prefs[key]);
            } finally {
                input.removeAttribute('aria-busy');
                if (key === 'language') input.disabled = false;
            }
        });
        nodes.set(key, input);
    }
    const syncMotion = () => {
        const input = nodes.get('reduced_motion');
        if (!input) return;
        input.checked = Boolean(prefs.reduced_motion || query?.matches);
        input.disabled = Boolean(query?.matches || typeof authority?.updateAtriaPreference !== 'function');
        input.title = query?.matches ? tl('Controlled by your operating system\'s reduced motion setting') : '';
    };
    syncMotion();
    query?.addEventListener?.('change', syncMotion);
    return { dispose() { query?.removeEventListener?.('change', syncMotion); } };
}
