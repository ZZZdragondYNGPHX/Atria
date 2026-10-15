import { createAtriaIconButton } from './atria-shell/components.js';
import { translateShellText as tl } from './atria-shell/localization.js';

export function prefersStorageReducedMotion() {
    return matchMedia('(prefers-reduced-motion: reduce)').matches
        || document.body.classList.contains('reduced-motion')
        || Boolean(document.querySelector('[data-atria-reduced-motion="true"]'));
}

/** Native dialogs retain focus/inert semantics; explicit edges also avoid browser-chrome Tab escape. */
export function containStorageDialogFocus(dialog, event) {
    if (event.key !== 'Tab' || event.target.closest('dialog') !== dialog) return;
    const controls = [...dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]')]
        .filter(control => control.getClientRects().length && control.closest('dialog') === dialog);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

/** Presentation only. Resource identity, qualification and actions remain owned by StorageCenterPanel. */
export class StorageCenterDrawer {
    constructor(parent, keyboard) {
        this.keyboard = keyboard;
        this.abort = new AbortController();
        const signal = this.abort.signal;
        this.dialog = document.createElement('dialog');
        this.dialog.className = 'storage-center-drawer';
        this.dialog.setAttribute('aria-labelledby', 'storage-center-detail-title');
        this.header = document.createElement('header');
        this.header.className = 'storage-center-drawer-header';
        this.title = document.createElement('h2');
        this.title.id = 'storage-center-detail-title';
        this.closeButton = createAtriaIconButton(document, { label: tl('Close details'), icon: 'close', onClick: () => this.close() });
        this.header.append(this.title, this.closeButton);
        this.body = document.createElement('div');
        this.body.className = 'storage-center-drawer-body';
        this.dialog.append(this.header, this.body);
        parent.append(this.dialog);
        this.dialog.addEventListener('keydown', event => containStorageDialogFocus(this.dialog, event), { signal });
        this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); }, { signal });
        this.header.addEventListener('pointerdown', event => this.startDrag(event), { signal });
        this.header.addEventListener('pointermove', event => this.moveDrag(event), { signal });
        this.header.addEventListener('pointerup', event => this.endDrag(event), { signal });
        this.header.addEventListener('pointercancel', event => this.endDrag(event, true), { signal });
        this.media = matchMedia('(prefers-reduced-motion: reduce)');
        const settle = () => {
            if (!prefersStorageReducedMotion()) return;
            this.animation?.cancel(); this.spring = null; this.drag = null;
            parent.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
            this.dialog.style.transform = '';
            if (this.closing) this.close(true);
        };
        this.media.addEventListener('change', settle, { signal });
        this.preferenceObserver = new MutationObserver(settle);
        this.preferenceObserver.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class', 'data-atria-reduced-motion'] });
        window.addEventListener('resize', () => {
            this.animation?.cancel(); this.spring = null; this.drag = null; this.dialog.style.transform = '';
            if (this.closing) this.close(true);
        }, { signal });
    }
    get axis() { return matchMedia('(max-width: 760px)').matches ? 'Y' : 'X'; }
    get dimension() { return this.axis === 'Y' ? this.dialog.offsetHeight : this.dialog.offsetWidth; }
    get position() {
        const transform = getComputedStyle(this.dialog).transform;
        if (transform === 'none') return 0;
        const matrix = new DOMMatrixReadOnly(transform);
        return this.axis === 'Y' ? matrix.m42 : matrix.m41;
    }
    get motion() { return !this.keyboard() && !prefersStorageReducedMotion(); }
    open(title, content) {
        const wasOpen = this.dialog.open, from = wasOpen ? this.position : this.dimension;
        this.generation = (this.generation || 0) + 1;
        this.animation?.cancel(); this.spring = null; this.closing = false;
        this.title.textContent = title;
        this.body.replaceChildren(content);
        this.dialog.style.transform = '';
        if (!wasOpen) this.dialog.showModal();
        const distance = wasOpen ? from : this.dimension;
        if (this.motion) this.animation = this.dialog.animate([
            { transform: `translate${this.axis}(${distance}px)`, opacity: .7 }, { transform: `translate${this.axis}(0)`, opacity: 1 },
        ], { duration: 220, easing: 'cubic-bezier(.22,1,.36,1)' });
        this.closeButton.focus({ preventScroll: true });
    }
    close(immediate = false) {
        if (!this.dialog.open) return;
        const generation = this.generation = (this.generation || 0) + 1;
        const from = this.position, distance = this.dimension;
        this.animation?.cancel(); this.spring = null; this.drag = null; this.closing = true;
        this.dialog.style.transform = '';
        if (immediate || !this.motion) { this.dialog.close(); this.closing = false; return; }
        const animation = this.animation = this.dialog.animate([
            { transform: `translate${this.axis}(${from}px)`, opacity: 1 },
            { transform: `translate${this.axis}(${distance + 12}px)`, opacity: .7 },
        ], { duration: 160, easing: 'cubic-bezier(.23,1,.32,1)' });
        animation.finished.then(() => {
            if (generation !== this.generation) return;
            this.dialog.close(); animation.cancel(); this.closing = false;
        }).catch(() => { /* Retargeted or interrupted by direct manipulation. */ });
    }
    startDrag(event) {
        if (event.button !== 0 || this.drag || event.target.closest('button') || prefersStorageReducedMotion()) return;
        const from = this.position, axis = this.axis;
        let velocity = 0;
        if (this.spring) {
            const { start, b, w, v } = this.spring, time = (performance.now() - start) / 1000;
            velocity = (v - w * b * time) * Math.exp(-w * time);
        }
        this.generation++; this.animation?.cancel(); this.spring = null; this.closing = false;
        this.dialog.style.transform = `translate${axis}(${from}px)`;
        this.drag = { pointer: event.pointerId, axis, from, position: from, velocity, start: axis === 'Y' ? event.clientY : event.clientX, samples: [[performance.now(), from]], active: false };
        this.header.setPointerCapture(event.pointerId);
    }
    moveDrag(event) {
        const drag = this.drag;
        if (!drag || drag.pointer !== event.pointerId) return;
        const delta = (drag.axis === 'Y' ? event.clientY : event.clientX) - drag.start;
        if (!drag.active && Math.abs(delta) < 8) return;
        drag.active = true;
        const raw = drag.from + delta, dimension = drag.axis === 'Y' ? innerHeight : innerWidth;
        drag.position = raw < 0 ? raw * dimension * .55 / (dimension + .55 * Math.abs(raw)) : raw;
        this.dialog.style.transform = `translate${drag.axis}(${drag.position}px)`;
        const now = performance.now();
        drag.samples.push([now, drag.position]); drag.samples = drag.samples.filter(([time]) => now - time < 85);
    }
    endDrag(event, cancelled = false) {
        const drag = this.drag;
        if (!drag || event.pointerId !== drag.pointer) return;
        this.drag = null;
        if (this.header.hasPointerCapture(event.pointerId)) this.header.releasePointerCapture(event.pointerId);
        const first = drag.samples[0], last = drag.samples.at(-1), elapsed = last[0] - first[0];
        const velocity = !drag.active || performance.now() - last[0] > 80 ? 0 : elapsed > 0 ? (last[1] - first[1]) / elapsed * 1000 : drag.velocity;
        const dimension = this.dimension, projected = drag.position + velocity / 1000 * .998 / (1 - .998);
        const dismiss = !cancelled && (projected > dimension * .35 || drag.position > dimension * .55);
        this.settle(drag.position, Math.max(-2400, Math.min(2400, velocity)), dismiss ? dimension + 12 : 0, dismiss);
    }
    settle(from, velocity, target, dismiss) {
        const generation = ++this.generation, w = 2 * Math.PI / .3, a = from - target, b = velocity + w * a;
        this.spring = { start: performance.now(), b, w, v: velocity };
        this.closing = dismiss;
        // One set of compositor keyframes, critically damped, carrying release velocity.
        // 500ms is a gesture settling window; ordinary entrances/exits stay below 300ms.
        const keyframes = Array.from({ length: 31 }, (_, index) => {
            const time = index / 60, position = index === 30 ? target : target + (a + b * time) * Math.exp(-w * time);
            return { transform: `translate${this.axis}(${position}px)` };
        });
        this.dialog.style.transform = '';
        const animation = this.animation = this.dialog.animate(keyframes, { duration: 500, easing: 'linear', fill: 'forwards' });
        animation.finished.then(() => {
            if (generation !== this.generation) return;
            if (dismiss) this.dialog.close();
            animation.cancel(); this.spring = null; this.closing = false;
        }).catch(() => { /* A new pointer resumes from the current presentation value. */ });
    }
    destroy() {
        this.generation++; this.animation?.cancel(); this.abort.abort(); this.preferenceObserver.disconnect();
        if (this.dialog.open) this.dialog.close();
        this.dialog.remove();
    }
}
