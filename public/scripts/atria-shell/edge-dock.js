import { createAtriaIcon } from './icons.js';

/** Presentation only; AppShell owns navigation, modal state and business data. */
export function createAtriaEdgeDock({ document: documentRef, window: windowRef, root, rail, bottomNavigation, environment, menu, tl, getInputMode, isBlocked, openMenu, closeMenu }) {
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
    grip.append(createAtriaIcon(document, 'grip', { size: 18 }));
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
    const guides = ['left', 'right', 'top', 'bottom'].map(edge => { const node = make('div', 'atria-edge-dock-guide'); node.dataset.edge = edge; node.setAttribute('aria-hidden', 'true'); viewport.append(node); return node; });
    const reveal = make('button', 'atria-skip-link atria-edge-dock-reveal');
    reveal.type = 'button';
    reveal.textContent = tl('Show navigation');
    root.prepend(reveal);
    const safeProbe = make('div', 'atria-edge-dock-safe');
    viewport.append(safeProbe);
    let dock = rail, mode = '', edge = 'left', visible = false, gesture = null, pendingReveal = 0, pendingHide = 0, frame = null, motion = null, suppressedClick = null, dead = false;
    const edges = { desktop: 'left', touch: 'bottom' };
    // Guideline §3.4 default: visible, and hidden only while a story is being read.
    let displayMode = 'reading', magnify = true, movedByLastGesture = false;
    try {
        const saved = JSON.parse(windowRef.localStorage.getItem('atria.navigation.layout') || 'null');
        if (['left', 'right', 'top', 'bottom'].includes(saved?.edge)) edges.desktop = saved.edge;
        if (['auto', 'always', 'reading'].includes(saved?.displayMode)) displayMode = saved.displayMode;
        if (typeof saved?.magnify === 'boolean') magnify = saved.magnify;
    } catch { /* Device layout is optional; navigation remains usable. */ }
    const persist = () => { try { windowRef.localStorage.setItem('atria.navigation.layout', JSON.stringify({ edge: edges.desktop, displayMode, magnify })); } catch { /* Device storage may be unavailable. */ } };
    const restingVisible = () => size().mode === 'compact' || displayMode === 'always' || displayMode === 'reading' && root.dataset.atriaReading !== 'true';
    let pose = { x: 0, y: 0, vx: 0, vy: 0 }, destination = { x: 0, y: 0 }, lastPointer = { x: -1, y: -1 };
    let layoutAnimations = [], measured = { w: 0, h: 0 }, safe = { top: 0, bottom: 0, left: 0, right: 0 };
    const size = () => environment.get();
    const reduced = { get matches() { return size().reducedMotion || document.body.classList.contains('reduced-motion'); } };
    const syncLabels = () => {
        grip.setAttribute('aria-label', tl('Navigation options. Drag to another edge, or use the arrow keys.'));
        grip.setAttribute('aria-haspopup', 'menu');
        grip.title = tl('Drag to an edge. Keyboard: Left, Right, Up or Down.');
        handle.setAttribute('aria-label', tl('Show navigation; hold to move'));
        note(tl('Navigation position') + ': ' + edgeName(edge));
        for (const button of positionButtons) {
            button.hidden = size().mode === 'compact' && button.dataset.edge !== 'bottom';
            button.setAttribute('aria-checked', String(button.dataset.edge === edge));
        }
    };
    const edgeName = value => ({ left: tl('left edge'), right: tl('right edge'), top: tl('top edge'), bottom: tl('bottom edge') })[value];
    const touch = () => mode === 'touch';
    const note = text => { live.textContent = text; };
    const cancelTimers = () => { clearTimeout(pendingReveal); clearTimeout(pendingHide); pendingReveal = pendingHide = 0; };
    const focusWithin = () => getInputMode() === 'keyboard' && (dock.contains(document.activeElement) || menu.contains(document.activeElement));
    const blocked = () => Boolean(gesture || isBlocked() || focusWithin());
    const box = () => measured;
    function targets(open = visible) {
        const { w, h } = box(), gap = touch() ? 16 : 20, bottom = Math.max(16, safe.bottom + 8);
        const off = touch() ? 12 : 64;
        if (edge === 'top') return { x: size().width / 2, y: open ? 72 + safe.top + h / 2 : -h / 2 - off };
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
        handle.hidden = size().keyboardOpen || (visible && !gesture && !suppressedClick);
        handle.dataset.captured = String(Boolean(gesture || suppressedClick));
        handle.setAttribute('aria-expanded', String(visible));
        reveal.setAttribute('aria-expanded', String(visible));
        measured = { w: dock.offsetWidth, h: dock.offsetHeight };
        // A resting Dock reserves its edge so content never runs underneath it.
        // A Dock revealed over hidden mode floats instead, so summoning it
        // never reflows the page being read or edited.
        const reserve = mode === 'desktop' && restingVisible() ? (['top', 'bottom'].includes(edge) ? measured.h : measured.w) + 32 : 0;
        for (const side of ['left', 'right', 'top', 'bottom']) root.style.setProperty(`--atri-dock-inset-${side}`, `${side === edge ? reserve : 0}px`);
    }
    function paint() {
        dock.style.visibility = 'visible';
        dock.style.transform = `translate3d(${pose.x}px,${pose.y}px,0) translate(-50%,-50%)`;
        const a = targets(true), b = targets(false), progress = ['top', 'bottom'].includes(edge) ? (b.y - pose.y) / (b.y - a.y) : (pose.x - b.x) / (a.x - b.x);
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
            const progress = ['top', 'bottom'].includes(edge) ? (hidden.y - value.y) / (hidden.y - shown.y) : (value.x - hidden.x) / (shown.x - hidden.x);
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
        if (!open && !size().keyboardOpen && restingVisible()) open = true;
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
        return edge === 'left' ? point.x <= 8 : edge === 'right' ? point.x >= size().width - 8 : edge === 'top' ? point.y <= 8 : point.y >= size().height - 8;
    }
    function scheduleHide() {
        if (touch() || blocked() || restingVisible())
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
        edge = size().mode === 'compact' ? 'bottom' : next;
        edges[mode] = next; persist(); resetMagnification();
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
        return [['left', px], ['right', size().width - px], ['top', py], ['bottom', size().height - py]].sort((a, b) => a[1] - b[1])[0][0];
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
        resetMagnification();
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
                const inward = edge === 'left' ? dx : edge === 'right' ? -dx : edge === 'top' ? dy : -dy, tangent = ['top', 'bottom'].includes(edge) ? Math.abs(dx) : Math.abs(dy);
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
            const inward = edge === 'left' ? dx : edge === 'right' ? -dx : edge === 'top' ? dy : -dy, travel = Math.hypot(g.shown.x - g.hidden.x, g.shown.y - g.hidden.y);
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
        movedByLastGesture = g.kind === 'move';
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
            edge = compact ? 'bottom' : edges[mode];
            dock.classList.add('atria-edge-dock');
            dock.prepend(grip);
            dock.prepend(skin);
            visible = restingVisible();
        }
        root.dataset.atriaEdgeDock = 'true';
        const s = windowRef.getComputedStyle(safeProbe);
        safe = { top: parseFloat(s.paddingTop) || 0, bottom: parseFloat(s.paddingBottom) || 0, left: parseFloat(s.paddingLeft) || 0, right: parseFloat(s.paddingRight) || 0 };
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
    // Dock options open from the grip (guidelines §3.4): edge, visibility, magnify.
    const positionButtons = [], displayButtons = [], menuItems = [];
    const section = node => { node.dataset.atriaMenuSection = 'dock'; menu.append(node); return node; };
    const heading = text => { const node = section(make('div', 'atria-shell-menu__heading')); node.textContent = tl(text); };
    heading('Navigation position');
    const edgeRow = section(make('div', 'atria-shell-menu__segmented'));
    edgeRow.setAttribute('role', 'group');
    edgeRow.setAttribute('aria-label', tl('Navigation position'));
    for (const e of ['left', 'bottom', 'right', 'top']) {
        const button = make('button', 'atria-shell-menu__segment');
        button.type = 'button';
        button.dataset.edge = e;
        button.dataset.atriaMenuSection = 'dock';
        button.textContent = tl({ left: 'Left', right: 'Right', top: 'Top', bottom: 'Bottom' }[e]);
        button.setAttribute('aria-label', tl({ left: 'Left edge', right: 'Right edge', top: 'Top edge', bottom: 'Bottom edge' }[e]));
        button.setAttribute('role', 'menuitemradio');
        listen(button, 'click', event => chooseEdge(size().mode === 'compact' ? 'bottom' : e, { instant: event.detail === 0 }));
        edgeRow.append(button);
        positionButtons.push(button); menuItems.push(button);
    }
    section(make('div', 'atria-shell-menu__separator')).setAttribute('role', 'separator');
    heading('Navigation visibility');
    for (const [value, label, hint] of [['reading', 'Smart', 'Hide while reading'], ['always', 'Always visible', 'Reserve its edge'], ['auto', 'Auto hide', 'Reveal at the edge']]) {
        const button = section(make('button', 'atria-shell-menu__item')); button.type = 'button';
        const text = make('span', 'atria-shell-menu__label'); text.textContent = tl(label);
        const note = make('span', 'atria-shell-menu__hint'); note.textContent = tl(hint);
        button.append(text, note);
        button.setAttribute('role', 'menuitemradio'); button.setAttribute('aria-checked', String(displayMode === value));
        listen(button, 'click', () => { displayMode = value; persist(); for (const control of displayButtons) control.setAttribute('aria-checked', String(control === button)); closeMenu(); show(restingVisible(), { instant: true, force: true }); if (!restingVisible()) scheduleHide(); state(); });
        displayButtons.push(button); menuItems.push(button);
    }
    section(make('div', 'atria-shell-menu__separator')).setAttribute('role', 'separator');
    const magnifyButton = section(make('button', 'atria-shell-menu__item')); magnifyButton.type = 'button';
    magnifyButton.setAttribute('role', 'menuitemcheckbox');
    const magnifyText = make('span', 'atria-shell-menu__label'); magnifyText.textContent = tl('Magnify on hover');
    const magnifyNote = make('span', 'atria-shell-menu__hint'); magnifyNote.textContent = tl('Mouse only');
    magnifyButton.append(magnifyText, magnifyNote);
    const syncMagnify = () => magnifyButton.setAttribute('aria-checked', String(magnify));
    listen(magnifyButton, 'click', () => { magnify = !magnify; persist(); syncMagnify(); if (!magnify) resetMagnification(); });
    syncMagnify(); menuItems.push(magnifyButton);
    const dockNote = section(make('p', 'atria-shell-menu__note'));
    dockNote.textContent = tl('Drag the grip to another edge, or use the arrow keys on it.');
    function resetMagnification() {
        for (const icon of dock.querySelectorAll('.atria-shell-nav-icon')) icon.style.removeProperty('transform');
    }
    for (const nav of [rail, bottomNavigation]) {
        listen(nav, 'pointermove', event => {
            if (!magnify || touch() || reduced.matches || gesture || event.pointerType === 'touch') { resetMagnification(); return; }
            const horizontal = ['top', 'bottom'].includes(edge);
            for (const button of nav.querySelectorAll('[data-atria-domain]')) {
                const box = button.getBoundingClientRect(), distance = Math.abs((horizontal ? event.clientX - box.left - box.width / 2 : event.clientY - box.top - box.height / 2));
                const scale = 1 + .28 * Math.max(0, 1 - distance / 100) ** 2;
                button.querySelector('.atria-shell-nav-icon').style.transform = `scale(${scale})`;
            }
        }, { passive: true });
        listen(nav, 'pointerleave', resetMagnification);
    }
    for (const node of [grip, handle]) {
        listen(node, 'pointerdown', event => {
            if (isBlocked() || size().keyboardOpen || size().mode === 'compact')
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
            if (node === grip && !movedByLastGesture) openMenu({ anchor: grip, edge });
            else if (event.detail === 0)
                show(!visible, { instant: true, force: true });
        });
        listen(node, 'keydown', event => {
            if (event.isComposing || event.keyCode === 229)
                return;
            const e = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'top', ArrowDown: 'bottom' }[event.key];
            if (e) {
                event.preventDefault();
                chooseEdge(size().mode === 'compact' ? 'bottom' : e, { instant: true });
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
            cancelGesture({ instant: true }); resetMagnification();
            for (const a of layoutAnimations)
                a.cancel();
            moveTo(targets(), true);
        }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    refresh();
    return Object.freeze({
        refresh,
        positionButtons: [...positionButtons, ...displayButtons],
        menuItems,
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
            // Release or take the edge reservation at once; the Dock itself may hide later.
            state();
            if (restingVisible()) show(true);
            else if (touch())
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
            for (const side of ['left', 'right', 'top', 'bottom']) root.style.removeProperty(`--atri-dock-inset-${side}`);
        },
    });
}
