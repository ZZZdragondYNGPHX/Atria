import { canonicalProseSelection, canonicalProseRanges } from '../../shared/native-safe-prose.js';
import { illustrationAnchorMatches } from '../../shared/native-illustration-contract.js';
import { renderNarrativeIllustrations } from './illustration-renderer.js';

// Host-owned registry. Packages opt in through their canonical prose binding;
// extensions get source identities, never arbitrary DOM write access through this API.
const surfaces = new Map(), listeners = new Set(), modes = new Map(), shadowStyles = new WeakSet();
const matches = (surface, scope) => surface.sessionId === scope.sessionId && surface.branchId === scope.branchId;
function paint(doc) {
    const ranges = [];
    for (const [root, surface] of surfaces) {
        if (root.ownerDocument !== doc || !root.isConnected) continue;
        const enabled = modes.get(doc)?.some(scope => matches(surface, scope));
        root.classList.toggle('atri-illustration-selectable', Boolean(enabled));
        if (!enabled) continue;
        for (const annotation of surface.state?.annotations ?? []) {
            if (annotation.deletedAt !== undefined || annotation.anchor.messageId !== surface.entry.messageId
                || annotation.anchor.variantId !== surface.entry.activeVariantId || !illustrationAnchorMatches(annotation.anchor, surface.entry.content)) continue;
            ranges.push(...canonicalProseRanges(root, annotation.anchor.start, annotation.anchor.end));
        }
    }
    const win = doc.defaultView;
    if (win.CSS?.highlights && win.Highlight) {
        if (ranges.length) win.CSS.highlights.set('atri-illustration', new win.Highlight(...ranges));
        else win.CSS.highlights.delete('atri-illustration');
    }
}
export function updateIllustrationSurface(root, surface) {
    if (!surface) { releaseIllustrationSurface(root); return; }
    const tree = root.getRootNode();
    if (tree.host && !shadowStyles.has(tree)) {
        const style = root.ownerDocument.createElement('style');
        style.textContent = '.atri-illustration-selectable { user-select:text; -webkit-user-select:text; } ::highlight(atri-illustration) { background:var(--atri-accent-soft); text-decoration:underline; text-decoration-color:var(--atri-accent-text); }';
        tree.append(style); shadowStyles.add(tree);
    }
    surfaces.set(root, surface);
    renderNarrativeIllustrations(root, surface.entry, surface.state);
    paint(root.ownerDocument);
    for (const listener of listeners) listener();
}
export function releaseIllustrationSurface(root) {
    if (!surfaces.delete(root)) return;
    root.classList.remove('atri-illustration-selectable');
    for (const figure of root.querySelectorAll('[data-atria-illustration]')) figure.remove();
    paint(root.ownerDocument);
}
export function onIllustrationSurfacesChanged(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function setIllustrationSelectionMode(doc, scope, enabled) {
    const active = (modes.get(doc) ?? []).filter(item => !matches(item, scope) || item.selectionOwner !== scope.selectionOwner);
    if (enabled) active.push(scope);
    if (active.length) modes.set(doc, active); else modes.delete(doc);
    paint(doc);
}
export function readIllustrationSelection(doc, scope) {
    const selection = doc.getSelection();
    if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return null;
    for (const [root, surface] of surfaces) {
        if (!root.isConnected || root.ownerDocument !== doc || !matches(surface, scope)) continue;
        let range = selection.getRangeAt(0);
        const tree = root.getRootNode();
        if (tree.host && selection.getComposedRanges) {
            const composed = selection.getComposedRanges({ shadowRoots: [tree] });
            if (composed.length !== 1) continue;
            range = doc.createRange(); range.setStart(composed[0].startContainer, composed[0].startOffset); range.setEnd(composed[0].endContainer, composed[0].endOffset);
        }
        const source = canonicalProseSelection(root, range);
        if (!source?.quote.trim()) continue;
        return { ...source, revisionId: surface.revisionId, messageId: surface.entry.messageId, variantId: surface.entry.activeVariantId };
    }
    return null;
}
export function repaintIllustrationSurfaces(scope, state) {
    for (const [root, surface] of surfaces) {
        if (!root.isConnected) { surfaces.delete(root); continue; }
        if (matches(surface, scope)) { surface.state = state; renderNarrativeIllustrations(root, surface.entry, state); }
    }
    for (const doc of new Set([...surfaces.keys()].map(root => root.ownerDocument))) paint(doc);
}

// Managed Play keeps extension controls above its composer. A custom Package
// can retain the viewport fallback without exposing its DOM to extensions.
export function illustrationToolbarInset(doc, scope) {
    for (const [root, surface] of surfaces) {
        if (root.ownerDocument !== doc || !root.isConnected || !matches(surface, scope) || !surface.controlsTop) continue;
        const top = surface.controlsTop();
        if (Number.isFinite(top) && top > 0) return Math.max(16, doc.defaultView.innerHeight - top + 12);
    }
    return 16;
}
