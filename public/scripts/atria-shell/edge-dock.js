/** Presentation only; AppShell owns navigation, modal state and business data. */
export function createAtriaEdgeDock({ document: documentRef, window: windowRef, root, rail, bottomNavigation, environment, menu, tl, getInputMode, isBlocked, closeMenu }) {
    const document = documentRef;
    const abort = new windowRef.AbortController();
    const listen = (node, type, handler, options = {}) => node.addEventListener(type, handler, { ...options, signal: abort.signal });
    const make = (tag, className) => { const node = document.createElement(tag); node.className = className; return node; };
    const viewport = make('div', 'atria-edge-dock-viewport');
    root.append(viewport);
    viewport.append(rail, bottomNavigation);
    const skin = make('span', 'atria-edge-dock-skin');
    skin.setAttribute('aria-hidden', 'true');
    const grip = make('button', 'atria-edge-dock-grip');
    grip.type = 'button';
    grip.innerHTML = '<span aria-hidden="true">\u283F</span>';
    const handle = make('button', 'atria-edge-dock-handle');
    handle.type = 'button';
    viewport.append(handle);
    const hint = make('div', 'atria-edge-dock-hint');
    hint.hidden = true;
    viewport.append(hint);
    const live = make('div', 'atria-visually-hidden');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    viewport.append(live);
    const guides = ['left', 'right', 'bottom'].map(edge => { const node = make('div', 'atria-edge-dock-guide'); node.dataset.edge = edge; node.setAttribute('aria-hidden', 'true'); viewport.append(node); return node; });
    const reveal = make('button', 'atria-skip-link atria-edge-dock-reveal');
    reveal.type = 'button';
    reveal.textContent = tl('Show navigation');
    root.prepend(reveal);
    const safeProbe = make('div', 'atria-edge-dock-safe');
    viewport.append(safeProbe);
    let dock = rail, mode = '', edge = 'left', visible = false, gesture = null, pendingReveal = 0, pendingHide = 0, frame = null, motion = null, suppressedClick = null, dead = false;
    const edges = { desktop: 'left', touch: 'bottom' };
    let pose = { x: 0, y: 0, vx: 0, vy: 0 }, destination = { x: 0, y: 0 }, lastPointer = { x: -1, y: -1 };
    let layoutAnimations = [], measured = { w: 0, h: 0 }, safe = { bottom: 0, left: 0, right: 0 };
    const size = () => environment.get();
    const reduced = { get matches() { return size().reducedMotion || document.body.classList.contains('reduced-motion'); } };
    const syncLabels = () => {
        grip.setAttribute('aria-label', tl(mode === 'touch' ? 'Hide navigation; hold to move' : 'Drag navigation to another edge'));
        grip.title = tl('Drag to an edge. Keyboard: Left, Right or Down.');
        handle.setAttribute('aria-label', tl('Show navigation; hold to move'));
        note(tl('Navigation position') + ': ' + edgeName(edge));
        for (const button of positionButtons) {
            button.setAttribute('aria-checked', String(button.dataset.edge === edge));
        }
    };
    const edgeName = value => ({ left: tl('left edge'), right: tl('right edge'), bottom: tl('bottom edge') })[value];
    const touch = () => mode === 'touch';
    const note = text => { live.textContent = text; };
    const cancelTimers = () => { clearTimeout(pendingReveal); clearTimeout(pendingHide); pendingReveal = pendingHide = 0; };
    const focusWithin = () => getInputMode() === 'keyboard' && (dock.contains(document.activeElement) || menu.contains(document.activeElement));
    const blocked = () => Boolean(gesture || isBlocked() || focusWithin());
    const box = () => measured;
    function targets(open = visible) {
        const { w, h } = box(), gap = touch() ? 16 : 20, bottom = Math.max(16, safe.bottom + 8);
        const off = touch() ? 12 : 64;
        if (edge === 'bottom')
            return { x: size().width / 2, y: open ? size().height - bottom - h / 2 : size().height + h / 2 + off };
        return { x: open ? (edge === 'left' ? gap + safe.left + w / 2 : size().width - gap - safe.right - w / 2) : (edge === 'left' ? -w / 2 - off : size().width + w / 2 + off), y: Math.max(h / 2 + 12, Math.min(size().height - h / 2 - 12, size().height * 0.53)) };
    }
    function state() {
        if (dead)
            return;
        root.dataset.atriaDockInput = mode;
        dock.dataset.edge = edge;
        handle.dataset.edge = edge;
        dock.inert = !visible || gesture?.kind === 'reveal';
        dock.setAttribute('aria-hidden', String(!visible));
        handle.hidden = size().keyboardOpen || !touch() || (visible && !gesture && !suppressedClick);
        handle.dataset.captured = String(Boolean(gesture || suppressedClick));
        handle.setAttribute('aria-expanded', String(visible));
        reveal.setAttribute('aria-expanded', String(visible));
        measured = { w: dock.offsetWidth, h: dock.offsetHeight };
    }
    function paint() {
        dock.style.visibility = 'visible';
        dock.style.transform = `translate3d(${pose.x}px,${pose.y}px,0) translate(-50%,-50%)`;
        const a = targets(true), b = targets(false), progress = edge === 'bottom' ? (b.y - pose.y) / (b.y - a.y) : (pose.x - b.x) / (a.x - b.x);
        dock.style.opacity = touch() && gesture?.kind !== 'move' ? String(Math.max(0, Math.min(1, progress * 3))) : '1';
    }
    // Sample the same critical spring as paper-transition, then let WAAPI compose
    // it while startup/navigation occupies the main thread. Interruptions recover
    // the presentation transform and analytically carry its current velocity.
    function sample(time, seed, target) {
        const omega = 2 * Math.PI / .3;
        const decay = Math.exp(-omega * time);
        const dx = seed.x - target.x, dy = seed.y - target.y;
        const cx = seed.vx + omega * dx, cy = seed.vy + omega * dy;
        return {
            x: target.x + (dx + cx * time) * decay,
            y: target.y + (dy + cy * time) * decay,
            vx: (seed.vx - omega * cx * time) * decay,
            vy: (seed.vy - omega * cy * time) * decay,
        };
    }
    function stopSpring() {
        if (!frame) return;
        const elapsed = Math.max(0, Number(frame.currentTime) || 0) / 1000;
        pose = sample(elapsed, motion.seed, motion.target);
        const matrix = windowRef.getComputedStyle(dock).transform;
        if (windowRef.DOMMatrixReadOnly && matrix !== 'none') {
            const current = new windowRef.DOMMatrixReadOnly(matrix);
            pose.x = current.m41 + measured.w / 2;
            pose.y = current.m42 + measured.h / 2;
        }
        frame.cancel();frame = null;motion = null;
        paint();
    }
    function moveTo(target, instant = false) {
        stopSpring();
        destination = target;
        if (instant || reduced.matches || !dock.animate) {
            pose = { ...pose, ...target, vx: 0, vy: 0 };paint();
            dock.dataset.state = visible ? 'visible' : 'hidden';return;
        }
        const seed = { ...pose }, frames = [];
        const shown = targets(true), hidden = targets(false);
        let duration = 0;
        for (let index = 0; index <= 60; index++) {
            const time = index / 60, value = sample(time, seed, target);
            const progress = edge === 'bottom' ? (hidden.y - value.y) / (hidden.y - shown.y) : (value.x - hidden.x) / (shown.x - hidden.x);
            frames.push({ transform: `translate3d(${value.x}px,${value.y}px,0) translate(-50%,-50%)`, opacity: touch() ? String(Math.max(0, Math.min(1, progress * 3))) : '1' });
            duration = time * 1000;
            if (index > 5 && Math.hypot(value.x - target.x, value.y - target.y) < .3 && Math.hypot(value.vx, value.vy) < 3) break;
        }
        frames[frames.length - 1] = { transform: `translate3d(${target.x}px,${target.y}px,0) translate(-50%,-50%)`, opacity: touch() && !visible ? '0' : '1' };
        motion = { seed, target };
        const animation = dock.animate(frames, { duration, easing: 'linear', fill: 'both' });
        frame = animation;
        animation.finished.then(() => {
            if (dead || frame !== animation) return;
            pose = { ...pose, ...destination, vx: 0, vy: 0 };paint();
            frame = null;motion = null;animation.cancel();
            dock.dataset.state = visible ? 'visible' : 'hidden';
        }).catch(() => {});
    }
    function show(open, { instant = false, force = false } = {}) {
        if (!open && !force && blocked())
            return;
        cancelTimers();
        if (!open && dock.contains(document.activeElement))
            document.activeElement.blur();
        visible = open;
        state();
        dock.dataset.state = open ? 'revealing' : 'hiding';
        moveTo(targets(), instant);
    }
    function inDock(point) { const r = dock.getBoundingClientRect(); return point.x >= r.left - 12 && point.x <= r.right + 12 && point.y >= r.top - 12 && point.y <= r.bottom + 12; }
    function nearEdge(point) {
        if (point.x < 0 || point.y < 0 || point.x > size().width || point.y > size().height)
            return false;
        return edge === 'left' ? point.x <= 8 : edge === 'right' ? point.x >= size().width - 8 : point.y >= size().height - 8;
    }
    function scheduleHide() {
        if (touch() || blocked())
            return;
        clearTimeout(pendingHide);
        pendingHide = setTimeout(() => {
            pendingHide = 0;
            if (!blocked() && !inDock(lastPointer) && !nearEdge(lastPointer)) {
                if (frame)
                    scheduleHide();
                else
                    show(false);
            }
        }, 600);
    }
    function pointerMoved(event) {
        if (event.pointerType === 'touch' || touch() || gesture || isBlocked() || size().keyboardOpen)
            return;
        lastPointer = { x: event.clientX, y: event.clientY };
        if (nearEdge(lastPointer)) {
            clearTimeout(pendingHide);
            pendingHide = 0;
            if (!visible && !pendingReveal)
                pendingReveal = setTimeout(() => {
                    pendingReveal = 0;
                    if (nearEdge(lastPointer))
                        show(true);
                }, 150);
        } else {
            clearTimeout(pendingReveal);
            pendingReveal = 0;
            if (visible) {
                if (inDock(lastPointer)) {
                    clearTimeout(pendingHide);
                    pendingHide = 0;
                } else if (!pendingHide)
                    scheduleHide();
            }
        }
    }
    function morph(next, { instant = false } = {}) {
        const nodes = [skin, ...dock.querySelectorAll('button'), ...dock.querySelectorAll('.atria-sidebar__brand')], before = new Map(nodes.map(el => [el, el.getBoundingClientRect()]));
        for (const animation of layoutAnimations)
            animation.cancel();
        layoutAnimations = [];
        edge = next;
        edges[mode] = next;
        state();
        paint();
        if (!instant && !reduced.matches) {
            for (const el of nodes) {
                const a = before.get(el), b = el.getBoundingClientRect();
                if (!a.width || !b.width)
                    continue;
                const from = el === skin ? `translate(${a.x - b.x}px,${a.y - b.y}px) scale(${a.width / b.width},${a.height / b.height})` : `translate(${a.x - b.x}px,${a.y - b.y}px)`;
                el.style.transformOrigin = 'top left';
                layoutAnimations.push(el.animate([{ transform: from }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.23,1,.32,1)' }));
            }
        }
    }
    function chooseEdge(next, { instant = false } = {}) {
        cancelGesture();
        closeMenuLocal();
        show(true, { instant });
        morph(next, { instant });
        moveTo(targets(true), instant);
        syncLabels();
        note(tl('Dock moved to the ') + edgeName(next));
        if (!touch())
            scheduleHide();
    }
    function nearest(x, y, vx = 0, vy = 0) {
        const px = Math.max(0, Math.min(size().width, x + (vx / 1000) * 0.99 / (1 - 0.99))), py = Math.max(0, Math.min(size().height, y + (vy / 1000) * 0.99 / (1 - 0.99)));
        return [['left', px], ['right', size().width - px], ['bottom', size().height - py]].sort((a, b) => a[1] - b[1])[0][0];
    }
    function guide(candidate) {
        for (const el of guides)
            el.dataset.selected = String(el.dataset.edge === candidate);
        hint.hidden = !candidate;
        if (candidate)
            hint.textContent = tl('Release to dock at the ') + edgeName(candidate) + tl(' \u00B7 Esc cancels');
    }
    function beginDrag() {
        if (!gesture)
            return;
        closeMenuLocal();
        if (!visible)
            show(true, { instant: true });
        stopSpring();
        gesture.kind = 'move';
        gesture.originPose = { x: pose.x, y: pose.y };
        gesture.originPointer = { x: gesture.x, y: gesture.y };
        gesture.samples = [{ x: gesture.x, y: gesture.y, t: performance.now() }];
        dock.dataset.state = 'dragging';
        state();
        guide(edge);
        note(tl('Move the Dock. Release near an edge; Escape cancels.'));
    }
    function pointerDown(event) {
        if (!event.isPrimary || event.button !== 0) {
            cancelGesture();
            return;
        }
        if (gesture)
            return;
        event.preventDefault();
        cancelTimers();
        stopSpring();
        gesture = { id: event.pointerId, node: event.currentTarget, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, kind: 'pending', beforeEdge: edge, beforeVisible: visible, samples: [] };
        event.currentTarget.setPointerCapture(event.pointerId);
        state();
        if (touch())
            gesture.hold = setTimeout(beginDrag, 450);
    }
    function pointerMove(event) {
        const g = gesture;
        if (!g || g.id !== event.pointerId)
            return;
        g.x = event.clientX;
        g.y = event.clientY;
        const dx = g.x - g.startX, dy = g.y - g.startY;
        if (g.kind === 'pending' && Math.hypot(dx, dy) > 9) {
            clearTimeout(g.hold);
            if (!touch()) {
                beginDrag();
                g.originPointer = { x: g.startX, y: g.startY };
            } else {
                const inward = edge === 'left' ? dx : edge === 'right' ? -dx : -dy, tangent = edge === 'bottom' ? Math.abs(dx) : Math.abs(dy);
                if (Math.abs(inward) < tangent) {
                    g.kind = 'cancelled';
                    return;
                }
                g.kind = 'reveal';
                g.shown = targets(true);
                g.hidden = targets(false);
                dock.dataset.state = 'tracking';
            }
        }
        if (g.kind === 'move') {
            pose.x = g.originPose.x + g.x - g.originPointer.x;
            pose.y = g.originPose.y + g.y - g.originPointer.y;
            paint();
            const time = performance.now();
            g.samples.push({ x: g.x, y: g.y, t: time });
            g.samples = g.samples.filter(s => time - s.t < 90);
            const first = g.samples[0], dt = Math.max(16, time - first.t) / 1000;
            pose.vx = (g.x - first.x) / dt;
            pose.vy = (g.y - first.y) / dt;
            g.candidate = nearest(pose.x, pose.y, pose.vx, pose.vy);
            guide(g.candidate);
        } else if (g.kind === 'reveal') {
            const inward = edge === 'left' ? dx : edge === 'right' ? -dx : -dy, travel = Math.hypot(g.shown.x - g.hidden.x, g.shown.y - g.hidden.y);
            g.progress = Math.max(0, Math.min(1, (g.beforeVisible ? 1 : 0) + inward / Math.max(44, travel)));
            pose.x = g.hidden.x + (g.shown.x - g.hidden.x) * g.progress;
            pose.y = g.hidden.y + (g.shown.y - g.hidden.y) * g.progress;
            pose.vx = pose.vy = 0;
            paint();
        }
    }
    function release(g) {
        clearTimeout(g.hold);
        gesture = null;
        guide(null);
        if (g.node.hasPointerCapture(g.id))
            g.node.releasePointerCapture(g.id);
        suppressedClick = { id: g.id, x: g.x, y: g.y, until: performance.now() + 600 };
        const token = suppressedClick;
        setTimeout(() => {
            if (!dead && suppressedClick === token) {
                suppressedClick = null;
                state();
            }
        }, 600);
        state();
    }
    function pointerUp(event) {
        const g = gesture;
        if (!g || g.id !== event.pointerId)
            return;
        lastPointer = { x: event.clientX, y: event.clientY };
        release(g);
        if (g.kind === 'move') {
            morph(g.candidate || nearest(pose.x, pose.y), {});
            visible = true;
            state();
            dock.dataset.state = 'revealing';
            moveTo(targets(true));
            syncLabels();
            note(tl('Dock moved to the ') + edgeName(edge));
            if (!touch())
                scheduleHide();
        } else if (g.kind === 'reveal')
            show(g.progress >= (g.beforeVisible ? 0.65 : 0.35), { force: true });
        else if (g.kind === 'pending' && touch())
            show(!g.beforeVisible, { force: true });
        else
            show(g.beforeVisible, { force: true });
    }
    function cancelGesture({ instant = false } = {}) {
        const g = gesture;
        if (!g)
            return;
        release(g);
        if (edge !== g.beforeEdge)
            morph(g.beforeEdge, { instant });
        visible = g.beforeVisible;
        state();
        moveTo(targets(), instant);
        note(tl('Move cancelled. The Dock returned to its previous position.'));
    }
    function closeMenuLocal() { closeMenu(); }
    function outside(event) {
        if (!visible || gesture || isBlocked() || dock.contains(event.target) || menu.contains(event.target) || event.target === handle || event.target === reveal)
            return;
        if (touch())
            show(false, { force: true });
        else
            scheduleHide();
    }
    function refresh() {
        if (dead)
            return;
        cancelTimers();
        cancelGesture({ instant: true });
        if (reduced.matches) {
            for (const animation of layoutAnimations) animation.cancel();
        }
        const compact = size().mode === 'compact', next = compact || size().pointer === 'coarse' ? 'touch' : 'desktop';
        const nextDock = compact ? bottomNavigation : rail, changed = mode !== next || dock !== nextDock;
        if (changed) {
            closeMenu();
            dock.inert = true;
            dock.removeAttribute('data-edge');
            dock.classList.remove('atria-edge-dock');
            dock = nextDock;
            mode = next;
            edge = edges[mode];
            dock.classList.add('atria-edge-dock');
            dock.prepend(grip);
            dock.prepend(skin);
            visible = false;
        }
        root.dataset.atriaEdgeDock = 'true';
        const s = windowRef.getComputedStyle(safeProbe);
        safe = { bottom: parseFloat(s.paddingBottom) || 0, left: parseFloat(s.paddingLeft) || 0, right: parseFloat(s.paddingRight) || 0 };
        state();
        syncLabels();
        moveTo(targets(), true);
        handle.hidden = handle.hidden || size().keyboardOpen;
        if (size().keyboardOpen) {
            closeMenu();
            show(false, { instant: true, force: true });
            handle.hidden = true;
        }
    }
    const positionButtons = [];
    const caption = make('div', 'atria-shell-menu__heading');
    caption.textContent = tl('Navigation position');
    menu.append(caption);
    for (const e of ['left', 'right', 'bottom']) {
        const button = make('button', 'atria-shell-menu__item');
        button.type = 'button';
        button.dataset.edge = e;
        button.textContent = tl({ left: 'Left edge', right: 'Right edge', bottom: 'Bottom edge' }[e]);
        button.setAttribute('role', 'menuitemradio');
        listen(button, 'click', event => chooseEdge(e, { instant: event.detail === 0 }));
        menu.append(button);
        positionButtons.push(button);
    }
    for (const node of [grip, handle]) {
        listen(node, 'pointerdown', event => {
            if (isBlocked() || size().keyboardOpen)
                return;
            pointerDown(event);
        });
        listen(node, 'pointermove', pointerMove);
        listen(node, 'pointerup', pointerUp);
        listen(node, 'pointercancel', () => cancelGesture());
        listen(node, 'lostpointercapture', () => cancelGesture());
        listen(node, 'contextmenu', event => event.preventDefault());
        listen(node, 'click', event => {
            event.preventDefault();
            event.stopPropagation();
            if (event.detail === 0)
                show(!visible, { instant: true, force: true });
        });
        listen(node, 'keydown', event => {
            if (event.isComposing || event.keyCode === 229)
                return;
            const e = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'bottom' }[event.key];
            if (e) {
                event.preventDefault();
                chooseEdge(e, { instant: true });
                grip.focus({ preventScroll: true });
            }
        });
    }
    for (const node of [rail, bottomNavigation]) {
        listen(node, 'pointerleave', scheduleHide);
        listen(node, 'focusin', () => {
            cancelTimers();
            if (!visible)
                show(true, { instant: true });
        });
        listen(node, 'focusout', () => queueMicrotask(() => {
            if (!dead && getInputMode() === 'keyboard' && !focusWithin())
                scheduleHide();
        }));
    }
    listen(document, 'pointerdown', () => { suppressedClick = null; }, { capture: true });
    listen(document, 'click', event => {
        const old = suppressedClick;
        suppressedClick = null;
        if (old)
            state();
        if (old && performance.now() < old.until && event.pointerId === old.id && Math.hypot(event.clientX - old.x, event.clientY - old.y) < 12) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }, { capture: true });
    listen(document, 'pointermove', pointerMoved, { passive: true });
    listen(document, 'pointerdown', outside);
    listen(document, 'pointerdown', event => {
        if (gesture && event.pointerId !== gesture.id)
            cancelGesture();
    });
    listen(document, 'pointerleave', () => { lastPointer = { x: -100, y: -100 }; scheduleHide(); });
    const suspend = () => { cancelGesture({ instant: true }); closeMenu(); show(false, { instant: true, force: true }); };
    listen(document, 'visibilitychange', () => {
        if (document.hidden)
            suspend();
    });
    listen(windowRef, 'blur', suspend);
    listen(reveal, 'click', () => {
        if (isBlocked())
            return;
        show(true, { instant: true });
        dock.querySelector('[data-atria-domain]')?.focus({ preventScroll: true });
    });
    const unsubscribe = environment.subscribe(refresh);
    const observer = new windowRef.MutationObserver(() => {
        if (reduced.matches) {
            cancelGesture({ instant: true });
            for (const a of layoutAnimations)
                a.cancel();
            moveTo(targets(), true);
        }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    refresh();
    return Object.freeze({
        refresh,
        positionButtons,
        show: () => { show(true, { instant: getInputMode() === 'keyboard' }); },
        reveal: () => { show(true, { instant: true }); dock.querySelector('[data-atria-domain]')?.focus({ preventScroll: true }); },
        getEdge: () => edge,
        isDragging: () => Boolean(gesture),
        escape() {
            if (gesture) {
                cancelGesture({ instant: true });
                return true;
            }
            if (!visible)
                return false;
            show(false, { instant: true, force: true });
            reveal.focus({ preventScroll: true });
            return true;
        },
        navigated() {
            if (touch())
                show(false, { force: true });
            else
                scheduleHide();
        },
        dispose() {
            cancelGesture({ instant: true });
            cancelTimers();
            stopSpring();
            for (const a of layoutAnimations)
                a.cancel();
            dead = true;
            abort.abort();
            unsubscribe();
            observer.disconnect();
            delete root.dataset.atriaEdgeDock;
        },
    });
}
