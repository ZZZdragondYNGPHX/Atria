import { translateShellText as tl } from './localization.js';
import { el } from '../native/library-ui.js';

const CONTROLS = Object.freeze({
    appearance: [['font_scale', 'Interface size', 'range']],
    reading: [
        ['font_scale', 'Interface size', 'range'],
        ['send_on_enter', 'Send on Enter', 'select', [[0, 'Automatic'], [-1, 'Use Ctrl / Cmd + Enter'], [1, 'Enter sends; Shift + Enter adds a line']]],
    ],
    general: [
        ['language', 'Language', 'select', [['en', 'English'], ['zh-cn', '简体中文']]],
        ['before_unload_guard_mode', 'Confirm before leaving', 'select', [['smart', 'When changes are unsaved'], ['always', 'Always'], ['off', 'Off']]],
    ],
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
    const rows = new Map();
    let disposed = false;
    for (const [key, label, type, options] of values) {
        const row = el(doc, 'div', 'atria-preference-row', undefined, group);
        row.dataset.settingId = key;
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
        const status = el(doc, 'p', 'atria-preference-status', '', row); status.setAttribute('role', 'status');
        const retry = el(doc, 'button', 'atri-library-button', tl('Retry save'), row); retry.type = 'button'; retry.hidden = true;
        const help = key === 'font_scale' ? 'Changes text size throughout the Atria interface. Applied when you release the slider.' : key === 'language' ? 'Language is saved in this browser. Atria reloads after the change.' : '';
        if (help) el(doc, 'p', 'atria-setting-description', tl(help), row);
        async function persist() {
            if (disposed) return;
            const revision = (row._revision || 0) + 1; row._revision = revision;
            row.dataset.saveState = 'saving'; status.textContent = tl('Saving…'); retry.hidden = true;
            try {
                if (key === 'language') {
                    input.disabled = true; input.setAttribute('aria-busy', 'true');
                    await authority.setUiLanguage(input.value);
                } else await authority.updateAtriaPreference(key, type === 'checkbox' ? input.checked : ['font_scale', 'send_on_enter'].includes(key) ? Number(input.value) : input.value);
                if (disposed || row._revision !== revision) return;
                row.dataset.saveState = 'saved'; status.textContent = tl('Saved.');
            } catch (error) {
                if (disposed || row._revision !== revision) return;
                row.dataset.saveState = 'error'; status.textContent = tl(key === 'language' ? 'Could not change the language. Check browser storage and retry.' : 'Could not save this setting. Your change is still applied; retry to save it.'); retry.hidden = false;
            } finally {
                if (!disposed && row._revision === revision) {
                    input.removeAttribute('aria-busy');
                    if (key === 'language') input.disabled = false;
                }
            }
        }
        input.addEventListener('change', persist);
        retry.addEventListener('click', persist);
        nodes.set(key, input);
        rows.set(key, { row, input, status, retry });
    }
    const syncMotion = () => {
        const input = nodes.get('reduced_motion');
        if (!input) return;
        input.checked = Boolean(prefs.reduced_motion || query?.matches);
        input.disabled = Boolean(query?.matches || typeof authority?.updateAtriaPreference !== 'function');
        input.title = query?.matches ? tl('Controlled by your operating system\'s reduced motion setting') : '';
    };
    syncMotion();
    function sync(event) {
        if (disposed) return;
        for (const [key, { row, input, status, retry }] of rows) {
            if (event?.detail?.key && event.detail.key !== key) continue;
            if (key !== 'language' && doc.activeElement !== input) {
                if (input.type === 'checkbox') input.checked = Boolean(prefs[key]); else input.value = String(prefs[key] ?? input.value);
            }
            const state = authority?.getPreferenceSaveState?.(key);
            if (['saving', 'saved', 'error'].includes(state?.status)) {
                row.dataset.saveState = state.status;
                status.textContent = tl(state.status === 'saving' ? 'Saving…' : state.status === 'saved' ? 'Saved.' : 'Could not save this setting. Your change is still applied; retry to save it.');
                retry.hidden = state.status !== 'error';
            }
        }
        syncMotion();
    }
    sync();
    doc.addEventListener('atria-preference-save', sync);
    doc.addEventListener('atria-preference-changed', sync);
    query?.addEventListener?.('change', syncMotion);
    return { dispose() { disposed = true; doc.removeEventListener('atria-preference-save', sync); doc.removeEventListener('atria-preference-changed', sync); query?.removeEventListener?.('change', syncMotion); } };
}
