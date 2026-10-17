// Small DOM builders over the shared Atria components and CSS classes.
import { createAtriaButton, createAtriaNotice } from '../../atria-shell/components.js';

let fieldSequence = 0;

export function el(doc, tag, className = '', text = null, parent = null) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== null && text !== undefined) node.textContent = String(text);
    parent?.append(node);
    return node;
}

/** Labelled control. Hints and errors are associated for assistive tech. */
export function field(doc, label, control, { hint = '', parent = null, key = '' } = {}) {
    const wrap = el(doc, 'div', 'atria-field atria-orch-field', null, parent);
    const id = control.id || 'atria-orch-field-' + (++fieldSequence);
    control.id = id;
    if (key) control.dataset.field = key;
    const labelNode = el(doc, 'label', 'atria-field__label', label, wrap);
    labelNode.htmlFor = id;
    wrap.append(control);
    if (hint) {
        const hintNode = el(doc, 'span', 'atria-field__hint', hint, wrap);
        hintNode.id = id + '-hint';
        control.setAttribute('aria-describedby', hintNode.id);
    }
    return wrap;
}

export function input(doc, { value = '', type = 'text', min = null, max = null, mono = false, onCommit = null, placeholder = '' } = {}) {
    const node = el(doc, 'input', 'atria-input' + (mono ? ' atria-orch-mono' : ''));
    node.type = type;
    node.value = value ?? '';
    if (placeholder) node.placeholder = placeholder;
    if (type === 'number') { node.inputMode = 'numeric'; if (min !== null) node.min = String(min); if (max !== null) node.max = String(max); node.step = '1'; }
    // Commit on change (blur/Enter), so IME composition never commits halfway.
    if (onCommit) node.addEventListener('change', () => onCommit(type === 'number' ? Number(node.value) : node.value, node));
    return node;
}

export function textarea(doc, { value = '', mono = false, rows = 4, onCommit = null } = {}) {
    const node = el(doc, 'textarea', 'atria-textarea' + (mono ? ' atria-orch-mono' : ''));
    node.value = value ?? '';
    node.rows = rows;
    if (onCommit) node.addEventListener('change', () => onCommit(node.value, node));
    return node;
}

export function select(doc, options, { value = '', onCommit = null } = {}) {
    const node = el(doc, 'select', 'atria-select');
    for (const [optionValue, label, disabled] of options) {
        const option = el(doc, 'option', '', label, node);
        option.value = optionValue;
        if (disabled) option.disabled = true;
    }
    node.value = value ?? '';
    if (onCommit) node.addEventListener('change', () => onCommit(node.value, node));
    return node;
}

export function checkbox(doc, label, { checked = false, onCommit = null, parent = null, hint = '' } = {}) {
    const wrap = el(doc, 'label', 'atria-orch-check', null, parent);
    const box = el(doc, 'input', '', null, wrap);
    box.type = 'checkbox';
    box.checked = Boolean(checked);
    const text = el(doc, 'span', 'atria-orch-check__text', null, wrap);
    el(doc, 'span', '', label, text);
    if (hint) el(doc, 'span', 'atria-field__hint', hint, text);
    if (onCommit) box.addEventListener('change', () => onCommit(box.checked, box));
    return wrap;
}

export const button = (doc, label, onClick, options = {}) => createAtriaButton(doc, { label, onClick, size: 'sm', ...options });

/** Banner = cause + lawful way forward; actions are explicit buttons. */
export function banner(doc, { title, message, tone = 'info', actions = [] }) {
    const notice = createAtriaNotice(doc, { title, message, tone });
    notice.classList.add('atria-orch-banner');
    notice.dataset.tone = tone;
    if (actions.length) {
        const row = el(doc, 'div', 'atria-button-row atria-orch-banner__actions', null, notice);
        for (const action of actions) row.append(button(doc, action.label, action.onClick, { variant: action.variant ?? 'secondary' }));
    }
    notice.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
    return notice;
}

/** Remember focus by data-field across an inspector re-render. */
export function preserveFocus(doc, root, render) {
    const active = doc.activeElement, key = root.contains(active) ? active?.dataset?.field : null;
    const selection = key && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
    render();
    if (!key) return;
    const next = root.querySelector(`[data-field="${CSS.escape(key)}"]`);
    if (!next) return;
    next.focus({ preventScroll: true });
    if (selection && typeof next.setSelectionRange === 'function') { try { next.setSelectionRange(...selection); } catch { /* non-text input */ } }
}

/**
 * In-context confirmation: says what will change, defaults focus to keeping
 * things as they are, and resolves once. Escape or Back keeps things as they are.
 */
export function confirmInline(doc, host, { title, message, confirmLabel, cancelLabel, tone = 'warning', destructive = false }) {
    host.querySelector(':scope > .atria-orch-confirm')?.dispatchEvent(new doc.defaultView.CustomEvent('atria-orch-dismiss'));
    return new Promise(resolve => {
        const box = el(doc, 'div', 'atria-orch-confirm', null);
        box.dataset.tone = tone;
        box.setAttribute('role', 'alertdialog');
        const heading = el(doc, 'h3', 'atria-orch-confirm__title', title, box);
        heading.id = 'atria-orch-confirm-' + (++fieldSequence);
        const text = el(doc, 'p', '', message, box);
        text.id = heading.id + '-text';
        box.setAttribute('aria-labelledby', heading.id);
        box.setAttribute('aria-describedby', text.id);
        const row = el(doc, 'div', 'atria-button-row', null, box);
        const previous = doc.activeElement;
        const finish = value => {
            box.remove();
            if (previous?.isConnected) previous.focus({ preventScroll: true });
            resolve(value);
        };
        const yes = button(doc, confirmLabel, () => finish(true), { variant: destructive ? 'destructive' : 'primary' });
        const no = button(doc, cancelLabel, () => finish(false));
        row.append(yes, no);
        box.addEventListener('keydown', event => { if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); finish(false); } });
        box.addEventListener('atria-orch-dismiss', () => finish(false));
        host.prepend(box);
        box.scrollIntoView?.({ block: 'nearest' });
        no.focus({ preventScroll: true });
    });
}

/** Dismiss an open inline confirmation (Back / Escape owner). */
export function dismissInline(doc, host) {
    const box = host.querySelector(':scope > .atria-orch-confirm');
    if (!box) return false;
    box.dispatchEvent(new doc.defaultView.CustomEvent('atria-orch-dismiss'));
    return true;
}
