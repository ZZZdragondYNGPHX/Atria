import { translateShellText as tl } from './localization.js';

const EDITORS = '.atri-library-revision-editor, .atri-runtime-form, .atria-studio-editor-surface, .atri-source-editor, .atri-studio-value-editor';

/** Observe existing editable surfaces; never own or persist their draft values. */
export function installAtriaWorkspaceLeaveGuard({ document: doc, window: win, navigation, shell }) {
    const originals = new WeakMap();
    const changed = new Map();
    const value = node => node.type === 'checkbox' || node.type === 'radio' ? node.checked : node.value;
    function remember(event) {
        const node = event.target;
        if (!node?.matches?.('input:not([type="search"]), textarea, select') || node.disabled || node.readOnly) return;
        const editor = node.closest(EDITORS);
        if (!editor || !shell.root.contains(editor)) return;
        if (!originals.has(node)) originals.set(node, value(node));
    }
    function edit(event) {
        const node = event.target, editor = node.closest?.(EDITORS);
        if (!editor || !shell.root.contains(editor) || !node.matches('input:not([type="search"]), textarea, select')) return;
        if (!originals.has(node)) originals.set(node, node.type === 'checkbox' ? node.defaultChecked : node.defaultValue ?? '');
        changed.set(node, editor);
    }
    function guard(next, current) {
        if (next.domain === current.domain && next.child?.id === current.child?.id) return true;
        let dirty = Boolean(shell.root.querySelector('[data-atria-draft-dirty="true"]'));
        for (const [node, editor] of changed) {
            if (!shell.root.contains(editor)) { changed.delete(node); continue; }
            // Model-based editors distinguish content changes from selection controls.
            const owner = node.closest('[data-atria-draft-dirty]');
            if (owner && editor.contains(owner)) continue;
            if (editor.querySelector('[data-atria-draft-dirty]')) continue;
            // A field/Source switch may detach the node while its owner retains the draft.
            if (value(node) !== originals.get(node)) dirty = true;
        }
        if (!dirty) return true;
        const leave = win.confirm(tl('Leave this workspace and discard unsaved changes? Cancel to keep editing.'));
        if (leave) {
            changed.clear();
            for (const marker of shell.root.querySelectorAll('[data-atria-draft-dirty="true"]')) marker.dataset.atriaDraftDirty = 'false';
        }
        return leave;
    }
    function committed(event) {
        for (const [node] of changed) if (event.target.contains(node)) { originals.set(node, value(node)); changed.delete(node); }
        for (const marker of event.target.querySelectorAll('[data-atria-draft-dirty]')) marker.dataset.atriaDraftDirty = 'false';
    }
    doc.addEventListener('atria-draft-committed', committed);
    doc.addEventListener('focusin', remember, true);
    doc.addEventListener('input', edit);
    doc.addEventListener('change', edit);
    const removeGuard = navigation.addRouteGuard?.(guard);
    return { dispose() {
        removeGuard?.(); changed.clear();
        doc.removeEventListener('atria-draft-committed', committed);
        doc.removeEventListener('focusin', remember, true);
        doc.removeEventListener('input', edit);
        doc.removeEventListener('change', edit);
    } };
}
