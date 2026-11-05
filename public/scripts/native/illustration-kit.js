import { createAtriaButton } from '../atria-shell/components.js';
import { createAtriaIcon } from '../atria-shell/icons.js';
import { translateShellText as t } from '../atria-shell/localization.js';

// Small DOM helpers for the illustration experience. Text is always set
// through textContent; labels are translated by the caller.
export function el(doc, tag, { className = '', text, attrs = {}, on = {} } = {}, children = []) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    for (const [key, value] of Object.entries(attrs)) if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value === true ? '' : String(value));
    for (const [type, handler] of Object.entries(on)) node.addEventListener(type, handler);
    for (const child of children.flat()) if (child) node.append(child);
    return node;
}
export const icon = (doc, name, size = 18) => createAtriaIcon(doc, name, { size });
export function action(doc, label, onClick, { variant = 'secondary', icon: iconName = '', size = 'md', iconOnly = false } = {}) {
    const button = createAtriaButton(doc, { label, icon: iconName, variant, size, iconOnly });
    button.addEventListener('click', async event => {
        if (button.getAttribute('aria-busy') === 'true') return;
        button.setAttribute('aria-busy', 'true');
        try { await onClick(event); } finally { button.removeAttribute('aria-busy'); }
    });
    return button;
}
export function iconButton(doc, label, name, onClick) {
    return el(doc, 'button', { className: 'atri-ill-icon-btn', attrs: { type: 'button', 'aria-label': label, title: label }, on: { click: onClick } }, [icon(doc, name)]);
}
export function field(doc, label, control, hint = '') {
    const id = 'atri-ill-' + doc.defaultView.crypto.randomUUID().slice(0, 8);
    control.id = id;
    return el(doc, 'div', { className: 'atri-ill-field' }, [el(doc, 'label', { text: label, attrs: { for: id } }), control, hint ? el(doc, 'small', { text: hint }) : null]);
}
export function input(doc, value, onCommit, { type = 'text', placeholder = '', multiline = false, list = '' } = {}) {
    const node = el(doc, multiline ? 'textarea' : 'input', { attrs: { placeholder, autocomplete: 'off', ...(multiline ? {} : { type }), ...(list ? { list } : {}) } });
    node.value = value ?? '';
    node.addEventListener('change', () => onCommit(node.value));
    return node;
}
export function select(doc, value, choices, onChange) {
    const node = el(doc, 'select');
    for (const [id, label] of choices) node.append(el(doc, 'option', { text: label, attrs: { value: id } }));
    node.value = value ?? '';
    node.addEventListener('change', () => onChange(node.value));
    return node;
}
/** Segmented control: buttons with aria-pressed inside a labelled group. */
export function segmented(doc, label, value, choices, onChange) {
    const group = el(doc, 'div', { className: 'atri-ill-seg', attrs: { role: 'group', 'aria-label': label } });
    const buttons = choices.map(([id, text, disabled]) => el(doc, 'button', { className: 'atri-ill-seg-option', text, attrs: { type: 'button', 'aria-pressed': String(id === value), disabled: Boolean(disabled) },
        on: { click: async event => { for (const item of buttons) item.setAttribute('aria-pressed', String(item === event.currentTarget)); await onChange(id); } } }));
    group.append(...buttons);
    return group;
}
export function toggle(doc, label, checked, onChange) {
    const box = el(doc, 'input', { className: 'atri-ill-switch', attrs: { type: 'checkbox', role: 'switch', 'aria-label': label } });
    box.checked = Boolean(checked);
    box.addEventListener('change', () => onChange(box.checked));
    return box;
}
export function check(doc, label, checked, onChange) {
    const box = el(doc, 'input', { attrs: { type: 'checkbox' } }); box.checked = Boolean(checked);
    box.addEventListener('change', () => onChange(box.checked));
    return el(doc, 'label', { className: 'atri-ill-check' }, [box, el(doc, 'span', { text: label })]);
}
export function section(doc, title, { step = null, done = false, aside = null } = {}, children = []) {
    return el(doc, 'section', { className: 'atri-ill-section', attrs: { 'aria-label': title } }, [
        el(doc, 'header', {}, [step === null ? null : el(doc, 'span', { className: 'atri-ill-step', text: done ? '✓' : String(step), attrs: { 'data-done': String(done), 'aria-hidden': 'true' } }),
            el(doc, 'h3', { text: title }), aside]),
        ...children,
    ]);
}
export const details = (doc, summary, children = []) => el(doc, 'details', { className: 'atri-ill-details' }, [el(doc, 'summary', { text: summary }), ...children]);
export function facts(doc, rows) {
    return el(doc, 'dl', { className: 'atri-ill-facts' }, rows.filter(([, value]) => value !== undefined && value !== null && value !== '').flatMap(([label, value]) => [el(doc, 'dt', { text: label }), el(doc, 'dd', { text: String(value) })]));
}
export const thumbUrl = (context, imageVersionId) => '/api/native/generation/visual/gallery/thumbnail?' + new URLSearchParams({ sessionId: context.sessionId, branchId: context.branchId, imageVersionId });
export const phaseText = task => ({ writing: t('Writing the image description…'), drawing: task?.step === 'preparing' ? t('Preparing…') : task?.step === 'cancelling' ? t('Cancelling…') : t('Drawing…'),
    confirm: t('Waiting for your confirmation'), failed: task?.error || t('Failed'), cancelled: t('Cancelled'), done: t('New image ready') })[task?.phase] ?? '';
