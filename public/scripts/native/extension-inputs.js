// Native authored text fields opt into the same candidate workflow as Play.
// Extensions receive versioned text snapshots, never component state authority.
const listeners = new Set();
let active = null;
const notify = () => { for (const listener of listeners) { try { listener(); } catch { /* Observer only. */ } } };
export function registerExtensionInput(node, { current = () => true, submit } = {}) {
    const entry = { id: crypto.randomUUID(), node, current, submit, version: 0, composing: false };
    const events = ['focus', 'input', 'select', 'compositionstart', 'compositionend'];
    const change = event => {
        active = entry;
        if (event.type === 'input') entry.version++;
        if (event.type === 'compositionstart') entry.composing = true;
        if (event.type === 'compositionend') entry.composing = false;
        notify();
    };
    for (const type of events) node.addEventListener(type, change);
    return () => { for (const type of events) node.removeEventListener(type, change); if (active === entry) { active = null; notify(); } };
}
export function clearExtensionInput() { active = null; }
export function onExtensionInput(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function captureExtensionInput() {
    const entry = active;
    if (!entry?.node.isConnected || !entry.current()) return null;
    return { surfaceId: entry.id, version: entry.version, value: entry.node.value,
        selectionStart: entry.node.selectionStart ?? 0, selectionEnd: entry.node.selectionEnd ?? 0,
        disabled: Boolean(entry.node.disabled || entry.node.readOnly), composing: entry.composing };
}
export function applyExtensionInput(text, captured) {
    const current = captureExtensionInput();
    if (!current || current.disabled || current.composing || Object.keys(current).some(key => current[key] !== captured[key])) return false;
    const node = active.node;
    node.value = text;
    node.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertReplacementText', data: text }));
    node.focus();
    return true;
}
export function submitExtensionInput() {
    const current = captureExtensionInput();
    if (!current || current.disabled || current.composing || !active.submit) throw new Error('Use this input card’s submit action');
    return active.submit();
}
