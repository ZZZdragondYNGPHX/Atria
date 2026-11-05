import { translateShellText as t, formatShellText as f } from '../atria-shell/localization.js';
import { el, icon } from './illustration-kit.js';

// Atria's own small set of common composition tags. Labels translate; the tag text is what the model receives.
export const TAG_GROUPS = [
    ['Framing', [['Close-up', 'close-up'], ['Upper body', 'upper body'], ['Full body', 'full body'], ['Wide shot', 'wide shot'], ['From above', 'from above'], ['From below', 'from below']]],
    ['Lighting', [['Soft light', 'soft lighting'], ['Backlight', 'backlighting'], ['Golden hour', 'golden hour'], ['Night', 'night'], ['Candlelight', 'candlelight'], ['Rain', 'rain']]],
    ['Mood', [['Calm', 'calm atmosphere'], ['Tense', 'tense atmosphere'], ['Melancholy', 'melancholic'], ['Warm', 'warm atmosphere'], ['Mysterious', 'mysterious']]],
];
export const splitTags = text => String(text ?? '').split(/[,，\n]+/).map(tag => tag.trim()).filter(Boolean);
export const joinTags = tags => tags.join(', ');

/** Editable tag blocks for an image description. `onChange` receives the joined text. */
export function mountTagEditor(doc, { value, onChange, label }) {
    let tags = splitTags(value);
    const list = el(doc, 'div', { className: 'atri-ill-tags', attrs: { role: 'group', 'aria-label': label } });
    const entry = el(doc, 'input', { className: 'atri-ill-tag-input', attrs: { type: 'text', placeholder: t('Add a tag, then press Enter'), 'aria-label': t('Add a tag'), autocomplete: 'off' } });
    const commit = () => onChange(joinTags(tags));
    const add = text => { const next = splitTags(text); if (!next.length) return; tags = [...tags, ...next]; render(); commit(); };
    function render() {
        const seen = new Map(); for (const tag of tags) seen.set(tag.toLowerCase(), (seen.get(tag.toLowerCase()) ?? 0) + 1);
        list.replaceChildren(...tags.map((tag, index) => el(doc, 'span', { className: 'atri-ill-tag', attrs: { 'data-duplicate': String(seen.get(tag.toLowerCase()) > 1) } }, [
            el(doc, 'span', { text: tag }),
            el(doc, 'button', { className: 'atri-ill-tag-remove', attrs: { type: 'button', 'aria-label': f('Remove “${0}”', [tag]), title: t('Remove') }, on: { click: () => { tags.splice(index, 1); render(); commit(); entry.focus(); } } }, [icon(doc, 'close', 12)]),
        ])), entry);
        dedupe.hidden = ![...seen.values()].some(count => count > 1);
    }
    entry.addEventListener('keydown', event => {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); const text = entry.value; entry.value = ''; add(text); entry.focus(); } else if (event.key === 'Backspace' && !entry.value && tags.length) { tags.pop(); render(); commit(); }
    });
    entry.addEventListener('blur', () => { const text = entry.value; if (text.trim()) { entry.value = ''; add(text); } });
    entry.addEventListener('paste', event => { const text = event.clipboardData?.getData('text') ?? ''; if (/[,，\n]/.test(text)) { event.preventDefault(); add(text); } });
    list.addEventListener('click', event => { if (event.target === list) entry.focus(); });
    const dedupe = el(doc, 'button', { className: 'atri-ill-preset-tag', text: t('Remove duplicates'), attrs: { type: 'button' }, on: { click: () => {
        const seen = new Set(); tags = tags.filter(tag => !seen.has(tag.toLowerCase()) && seen.add(tag.toLowerCase())); render(); commit();
    } } });
    const quick = el(doc, 'details', { className: 'atri-ill-details' }, [el(doc, 'summary', { text: t('Common tags') }), el(doc, 'div', { className: 'atri-ill-stack' },
        TAG_GROUPS.map(([group, items]) => el(doc, 'div', { className: 'atri-ill-presets', attrs: { role: 'group', 'aria-label': t(group) } }, [
            el(doc, 'span', { className: 'atri-ill-muted', text: t(group) }),
            ...items.map(([name, tag]) => el(doc, 'button', { className: 'atri-ill-preset-tag', text: t(name), attrs: { type: 'button', title: tag }, on: { click: () => add(tag) } })),
        ])))]);
    render();
    return { root: el(doc, 'div', { className: 'atri-ill-stack' }, [list, el(doc, 'div', { className: 'atri-ill-row' }, [dedupe]), quick]), get value() { return joinTags(tags); } };
}
