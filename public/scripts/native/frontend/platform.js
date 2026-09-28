export function createFrameScheduler(window, document) {
    const pending = new Map(); let ticket = null, sequence = 0, disposed = false;
    function flush(time) {
        ticket = null;
        const batch = [...pending]; pending.clear();
        for (const [, { callback, animation }] of batch) if (!disposed && (!animation || (!document.hidden && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches))) callback(time);
    }
    return {
        frame(callback, { animation = false } = {}) {
            if (disposed || pending.size >= 256) throw new Error('Frame scheduler unavailable');
            const id = ++sequence; pending.set(id, { callback, animation });
            ticket ??= window.requestAnimationFrame(flush);
            return () => pending.delete(id);
        },
        dispose() { disposed = true; pending.clear(); if (ticket !== null) window.cancelAnimationFrame(ticket); },
    };
}

export function createPresentationEnvironment(window, frame, changed) {
    const cleanups = [], queries = ['(prefers-reduced-motion: reduce)', '(prefers-color-scheme: dark)', '(pointer: coarse)', '(hover: hover)', '(forced-colors: active)'];
    const media = queries.map(query => window.matchMedia?.(query));
    let current;
    function update() {
        const rect = frame.getBoundingClientRect();
        current = { width: rect.width, height: rect.height, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
            orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait', device: window.innerWidth < 600 ? 'mobile' : 'desktop',
            reducedMotion: Boolean(media[0]?.matches), dark: Boolean(media[1]?.matches), touch: Boolean(media[2]?.matches), hover: Boolean(media[3]?.matches), forcedColors: Boolean(media[4]?.matches) };
        for (const [key, value] of Object.entries(current)) if (typeof value === 'number') frame.style.setProperty('--atria-' + key.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()), value + 'px');
        for (const edge of ['top', 'right', 'bottom', 'left']) frame.style.setProperty('--atria-safe-area-' + edge, 'env(safe-area-inset-' + edge + ', 0px)');
        changed?.(current);
    }
    window.addEventListener('resize', update); cleanups.push(() => window.removeEventListener('resize', update));
    for (const query of media) { query?.addEventListener('change', update); cleanups.push(() => query?.removeEventListener('change', update)); }
    const observer = window.ResizeObserver ? new window.ResizeObserver(update) : null;
    observer?.observe(frame); update();
    return { get: () => ({ ...current }), dispose() { observer?.disconnect(); cleanups.forEach(clean => clean()); } };
}

export function createNodeHandle(node, boundary, { window, scheduler, active, pointers }) {
    const cleanups = new Set();
    function check() { if (!active() || !node?.isConnected) throw new Error('Stale NodeRef'); }
    function measure() {
        check(); const rect = node.getBoundingClientRect(), root = boundary.getBoundingClientRect();
        const left = Math.max(0, Math.min(root.width, rect.left - root.left)), top = Math.max(0, Math.min(root.height, rect.top - root.top));
        return Object.freeze({ x: left, y: top, width: Math.max(0, Math.min(root.width, rect.right - root.left) - left),
            height: Math.max(0, Math.min(root.height, rect.bottom - root.top) - top), scrollTop: Math.max(0, node.scrollTop), scrollLeft: Math.max(0, node.scrollLeft), scrollHeight: Math.min(1e7, node.scrollHeight), scrollWidth: Math.min(1e7, node.scrollWidth) });
    }
    function observe(kind, callback) {
        check(); if (cleanups.size >= 16) throw new Error('NodeRef observer budget');
        let cancel = null;
        const update = () => { if (!cancel) cancel = scheduler.frame(() => { cancel = null; if (active() && node.isConnected) callback(kind === 'resize' ? measure() : { visible: measure().width > 0 && measure().height > 0 }); }); };
        const Observer = kind === 'resize' ? window.ResizeObserver : window.IntersectionObserver;
        if (!Observer) throw new Error('Observer unavailable');
        const observer = new Observer(update, kind === 'resize' ? undefined : { root: boundary }); observer.observe(node);
        const stop = () => { cancel?.(); observer.disconnect(); cleanups.delete(stop); }; cleanups.add(stop); return stop;
    }
    return { handle: Object.freeze({ measure, observeResize: callback => observe('resize', callback), observeVisibility: callback => observe('visibility', callback),
        capturePointer(id) { check(); if (!pointers.has(id)) throw new Error('Pointer is not owned by this Component'); node.setPointerCapture(id); },
        releasePointer(id) { check(); if (node.hasPointerCapture(id)) node.releasePointerCapture(id); },
    }), dispose() { [...cleanups].forEach(clean => clean()); for (const id of pointers) if (node?.hasPointerCapture?.(id)) node.releasePointerCapture(id); } };
}

export function focusable(root) {
    const out = [];
    for (const node of root.querySelectorAll('*')) {
        if (node.shadowRoot) out.push(...focusable(node.shadowRoot));
        if (node.matches('button,input,textarea,select,a,[tabindex]') && !node.disabled && node.tabIndex >= 0 && !node.hidden && node.getClientRects().length) out.push(node);
    }
    return out;
}
