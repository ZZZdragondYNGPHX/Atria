import { translateShellText as tl } from '../atria-shell/localization.js';
import { createAtriaIcon } from '../atria-shell/icons.js';
import { createNativeProductError } from './product-errors.js';

export function el(doc, tag, className = '', text, parent) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    parent?.append(node);
    return node;
}

export function libraryError(error) {
    if (error?.isNativeProductError) return error.message;
    if (error?.code?.startsWith('native_')) return createNativeProductError(error.code, error.status, error.details).message;
    if (String(error?.code || '').includes('referenced')) return tl('This item is still referenced by Native content or progress.');
    if (error?.status === 409) return tl('This item conflicts with existing data. Your current data has been kept.');
    return tl(error?.message || String(error));
}

export function feedback(doc, parent, text, danger = false) {
    parent.querySelector(':scope > .atri-library-feedback')?.remove();
    const node = el(doc, 'p', 'atri-library-feedback', tl(text), parent);
    node.setAttribute('role', danger ? 'alert' : 'status');
    if (danger) { node.tabIndex = -1; node.focus(); }
    return node;
}

export function action(doc, parent, label, handler, { disabled = false, primary = false, danger = false } = {}) {
    const node = el(doc, 'button', 'atri-library-button', tl(label), parent);
    node.type = 'button'; node.disabled = disabled;
    if (primary) node.classList.add('atri-library-button--primary');
    if (danger) node.classList.add('atri-library-button--danger');
    node.addEventListener('click', async event => {
        if (node.disabled) return;
        const hadFocus = doc.activeElement === node;
        node.disabled = true; node.setAttribute('aria-busy', 'true');
        try { await handler(event); } catch (error) { feedback(doc, parent, libraryError(error), true); await referenceRemediation(doc, parent, error); } finally {
            node.disabled = disabled; node.removeAttribute('aria-busy');
            if (hadFocus && node.isConnected && [doc.body, doc.documentElement].includes(doc.activeElement)) node.focus();
        }
    });
    return node;
}

export function heading(doc, parent, title, description, literal = false) {
    const header = el(doc, 'header', 'atri-library-heading', undefined, parent);
    el(doc, 'h2', '', literal ? title : tl(title), header);
    if (description) el(doc, 'p', '', literal ? description : tl(description), header);
    return header;
}

export function disclosure(doc, parent, label, value) {
    const node = el(doc, 'details', 'atri-library-details', undefined, parent);
    el(doc, 'summary', '', tl(label), node);
    if (value !== undefined) el(doc, 'pre', '', typeof value === 'string' ? value : JSON.stringify(value, null, 2), node);
    return node;
}

export function field(doc, parent, label, value = '', type = 'text') {
    const wrapper = el(doc, 'label', 'atri-library-field', undefined, parent);
    el(doc, 'span', '', tl(label), wrapper);
    const input = el(doc, 'input', '', undefined, wrapper);
    input.type = type; input.value = value; input.setAttribute('aria-label', tl(label));
    input.name = label.toLowerCase().replace(/\s+/g, '-'); input.autocomplete = 'off';
    return input;
}

export function cover(doc, id, title) {
    const node = el(doc, 'div', 'atri-library-cover');
    const hash = [...String(id)].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
    node.dataset.cover = String(hash % 4); node.setAttribute('aria-hidden', 'true');
    node.append(createAtriaIcon(doc, 'book', { size: 36 }));
    el(doc, 'span', '', title, node);
    return node;
}

export async function confirmLibraryAction(message) {
    const { Popup } = await import('../popup.js');
    return Boolean(await Popup.show.confirm(tl('Confirm deletion'), tl(message)));
}

export async function savePassword() {
    const { Popup, POPUP_TYPE } = await import('../popup.js');
    return new Popup(tl('Save password (leave blank if none)'), POPUP_TYPE.INPUT, '').show();
}

export async function referenceRemediation(doc, parent, error, host) {
    if (!parent || !(String(error?.code || '').includes('referenced') || error?.details?.references?.length || error?.details?.usedBy?.length || error?.details?.blockers?.length)) return;
    const { renderReferenceRemediation } = await import('./reference-remediation.js');
    await renderReferenceRemediation({ document: doc, root: parent, error, host });
}
