import { translateShellText as tl } from './localization.js';

export function confirmAtriaDraftLeave(doc, root) {
    const query = { root, dirty: root.dataset.atriaDraftDirty === 'true' || Boolean(root.querySelector('[data-atria-draft-dirty="true"]')) };
    doc.dispatchEvent(new doc.defaultView.CustomEvent('atria-draft-query', { detail: query }));
    if (!query.dirty) return true;
    return doc.defaultView.confirm(tl('Leave this workspace and discard unsaved changes? Cancel to keep editing.'));
}

const EDITORS = '.atri-persona-editor, .atri-prompt-editor, .atri-library-revision-editor, .atri-runtime-form, .atria-studio-editor-surface, .atri-source-editor, .atri-studio-value-editor, .atria-project-agent-new-task, .atri-extension-editor, .atri-illustration-ui, .workspace-preset-editor, .workspace-agent-inspector';

/** Observe existing editable surfaces; never own or persist their draft values. */
export function observeAtriaDrafts({ document: doc, root }) {
    const originals = new WeakMap();
    const changed = new Map();
    const value = node => node.type === 'checkbox' || node.type === 'radio' ? node.checked : node.value;
    function remember(event) {
        const node = event.target;
        if (!node?.matches?.('input:not([type="search"]), textarea, select') || node.disabled || node.readOnly) return;
        const editor = node.closest(EDITORS);
        if (!editor || !root.contains(editor)) return;
        if (!originals.has(node)) originals.set(node, value(node));
    }
    function edit(event) {
        const node = event.target, editor = node.closest?.(EDITORS);
        if (!editor || !root.contains(editor) || !node.matches('input:not([type="search"]), textarea, select')) return;
        if (!originals.has(node)) originals.set(node, node.type === 'checkbox' ? node.defaultChecked : node.defaultValue ?? '');
        changed.set(node, editor);
    }
    function isDirty(scope = root) {
        let dirty = scope.dataset.atriaDraftDirty === 'true' || Boolean(scope.querySelector('[data-atria-draft-dirty="true"]'));
        for (const [node, editor] of changed) {
            if (!root.contains(editor) || !editor.contains(node)) { changed.delete(node); continue; }
            if (!scope.contains(editor) && !editor.contains(scope)) continue;
            const owner = node.closest('[data-atria-draft-dirty]');
            if (owner && editor.contains(owner)) continue;
            if (value(node) !== originals.get(node)) dirty = true;
        }
        return dirty;
    }
    function query(event) {
        if (event.detail.root === root || root.contains(event.detail.root) || event.detail.root.contains(root)) {
            event.detail.dirty ||= isDirty(event.detail.root);
        }
    }
    function committed(event) {
        for (const [node] of changed) if (event.target.contains(node)) { originals.set(node, value(node)); changed.delete(node); }
        if (event.target.hasAttribute('data-atria-draft-dirty')) event.target.dataset.atriaDraftDirty = 'false';
        for (const marker of event.target.querySelectorAll('[data-atria-draft-dirty]')) marker.dataset.atriaDraftDirty = 'false';
    }
    doc.addEventListener('atria-draft-committed', committed);
    doc.addEventListener('focusin', remember, true);
    doc.addEventListener('input', edit);
    doc.addEventListener('change', edit);
    doc.addEventListener('atria-draft-query', query);
    return { isDirty, reset: () => committed({ target: root }), dispose() {
        changed.clear();
        doc.removeEventListener('atria-draft-query', query);
        doc.removeEventListener('atria-draft-committed', committed);
        doc.removeEventListener('focusin', remember, true);
        doc.removeEventListener('input', edit);
        doc.removeEventListener('change', edit);
    } };
}

export function installAtriaWorkspaceLeaveGuard({ document: doc, navigation, shell }) {
    const observer = observeAtriaDrafts({ document: doc, root: shell.root });
    const removeGuard = navigation.addRouteGuard?.((next, current) => {
        if (next.domain === current.domain && next.child?.id === current.child?.id) return true;
        const scopes = [shell.root, ...doc.querySelectorAll('.atri-runtime[data-editor="true"]')];
        if (!scopes.every(scope => confirmAtriaDraftLeave(doc, scope))) return false;
        observer.reset();
        return true;
    });
    return { dispose() { removeGuard?.(); observer.dispose(); } };
}
