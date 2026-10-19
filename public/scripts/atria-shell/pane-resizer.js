import { translateShellText as tl, formatShellText as fmt } from './localization.js';

/** A separator changes presentation size only; the pane and its draft stay mounted. */
export function mountPaneResizer({ document: doc, root, pane, property, label, axis = 'x', side = 'end', min = 180, max = () => 600, enabled = () => true, onCollapse = () => {} }) {
    const win = doc.defaultView, controller = new win.AbortController();
    const handle = doc.createElement('div'); handle.className = 'atria-pane-separator'; handle.tabIndex = 0;
    handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', axis === 'x' ? 'vertical' : 'horizontal'); handle.setAttribute('aria-label', tl(label));
    handle.dataset.axis = axis; root.append(handle);
    const listen = (node, type, fn) => node.addEventListener(type, fn, { signal: controller.signal });
    const sign = side === 'start' ? -1 : 1;
    let drag = null;
    const dimension = box => axis === 'x' ? box.width : box.height;
    const limit = () => Math.max(min, max());
    function set(value) { root.style.setProperty(property, Math.round(Math.max(min, Math.min(limit(), value))) + 'px'); position(); }
    function position() {
        const a = root.getBoundingClientRect(), b = pane.getBoundingClientRect();
        handle.hidden = !enabled() || !b.width || !b.height;
        if (handle.hidden) return;
        if (axis === 'x') { handle.style.left = (side === 'end' ? b.right - a.left - 4 : b.left - a.left - 4) + 'px'; handle.style.top = b.top - a.top + 8 + 'px'; handle.style.height = Math.max(24, b.height - 16) + 'px'; } else { handle.style.top = (side === 'end' ? b.bottom - a.top - 4 : b.top - a.top - 4) + 'px'; handle.style.left = b.left - a.left + 8 + 'px'; handle.style.width = Math.max(24, b.width - 16) + 'px'; }
        const size = Math.round(dimension(b)); handle.setAttribute('aria-valuemin', String(min)); handle.setAttribute('aria-valuemax', String(limit())); handle.setAttribute('aria-valuenow', String(size)); handle.setAttribute('aria-valuetext', fmt('${0} pixels', [size]));
    }
    function end(cancel = false) {
        if (!drag) return;
        if (cancel) set(drag.size);
        const id = drag.id; drag = null; delete handle.dataset.atriaResizing;
        if (handle.hasPointerCapture?.(id)) handle.releasePointerCapture(id);
    }
    listen(handle, 'pointerdown', event => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault(); handle.focus({ preventScroll: true });
        drag = { id: event.pointerId, coordinate: axis === 'x' ? event.clientX : event.clientY, size: dimension(pane.getBoundingClientRect()) };
        handle.dataset.atriaResizing = 'true'; handle.setPointerCapture(event.pointerId);
    });
    listen(handle, 'pointermove', event => { if (drag?.id === event.pointerId) set(drag.size + sign * ((axis === 'x' ? event.clientX : event.clientY) - drag.coordinate)); });
    listen(handle, 'pointerup', () => end()); listen(handle, 'pointercancel', () => end(true)); listen(handle, 'lostpointercapture', () => end());
    listen(handle, 'keydown', event => {
        if (event.isComposing || event.keyCode === 229) return;
        const keys = axis === 'x' ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowUp: -1, ArrowDown: 1 };
        if (event.key in keys) set(dimension(pane.getBoundingClientRect()) + keys[event.key] * sign * (event.shiftKey ? 40 : 10));
        else if (event.key === 'Home') set(min);
        else if (event.key === 'End') set(limit());
        else if (event.key === 'Enter') onCollapse();
        else if (event.key === 'Escape' && drag) end(true);
        else return;
        event.preventDefault(); event.stopPropagation();
    });
    const observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(position) : null; observer?.observe(root); observer?.observe(pane);
    const mutations = new win.MutationObserver(position); mutations.observe(root, { attributes: true, attributeFilter: ['data-atria-viewport', 'data-tree-open', 'data-inspector-open', 'data-ai-open', 'data-activity-open', 'data-atria-studio-mobile-view'] });
    listen(win, 'resize', position); position();
    return { element: handle, refresh: position, reset() { root.style.removeProperty(property); position(); }, dispose() { end(); controller.abort(); observer?.disconnect(); mutations.disconnect(); handle.remove(); } };
}
