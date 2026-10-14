/** Presentation lifecycle only; callers retain navigation and business state. */
export function createAtriaPaperTransition({ root, panel, scrim, closedTransform, reducedMotion, instant }) {
    const windowRef = root.ownerDocument.defaultView;
    let sequence = 0;
    let desired = !root.hidden;
    let animations = [];
    let disposed = false;
    const cancel = () => { for (const animation of animations) animation.cancel(); animations = []; };
    function present(open, { immediate = false, retarget = false } = {}) {
        if (disposed || (desired === open && !retarget && root.hidden === !open)) return;
        const wasHidden = root.hidden;
        desired = open;
        const operation = ++sequence;
        const reduce = reducedMotion();
        const panelStyle = wasHidden ? null : windowRef.getComputedStyle(panel);
        const from = {
            opacity: wasHidden ? '0' : panelStyle.opacity,
            transform: wasHidden ? (reduce ? 'none' : closedTransform()) : panelStyle.transform,
        };
        const fromScrim = wasHidden ? '0' : windowRef.getComputedStyle(scrim).opacity;
        cancel();
        panel.style.transform = '';
        scrim.style.opacity = '';
        root.hidden = false;
        root.inert = !open;
        root.setAttribute('aria-hidden', String(!open));
        if (immediate || instant() || !panel.animate) {
            root.hidden = !open;
            return;
        }
        const tokens = windowRef.getComputedStyle(root);
        const duration = reduce ? 100 : open ? Number.parseFloat(tokens.getPropertyValue('--atri-duration-slow')) || 260 : 180;
        const easing = tokens.getPropertyValue('--atri-ease-sheet').trim() || 'cubic-bezier(.22,1,.36,1)';
        const target = { opacity: open ? '1' : '0', transform: reduce || open ? 'none' : closedTransform() };
        const animation = panel.animate([from, target], { duration, easing, fill: 'both' });
        const backdrop = scrim.animate([{ opacity: fromScrim }, { opacity: open ? '1' : '0' }], { duration, easing, fill: 'both' });
        animations = [animation, backdrop];
        animation.finished.then(() => {
            if (disposed || operation !== sequence) return;
            root.hidden = !desired;
            cancel();
        }).catch(() => {});
    }
    return Object.freeze({
        present,
        settle(velocity = 0) {
            const transform = windowRef.getComputedStyle(panel).transform;
            const backdropOpacity = windowRef.getComputedStyle(scrim).opacity;
            const start = typeof windowRef.DOMMatrixReadOnly === 'function' ? new windowRef.DOMMatrixReadOnly(transform === 'none' ? undefined : transform).m42 : 0;
            ++sequence; cancel(); panel.style.transform = ''; scrim.style.opacity = '';
            if (reducedMotion() || !panel.animate) return;
            const operation = sequence;
            const omega = 2 * Math.PI / .3;
            const frames = [];
            let duration = 0;
            for (let frame = 0; frame <= 60; frame++) {
                const time = frame / 60;
                const position = (start + (velocity + omega * start) * time) * Math.exp(-omega * time);
                frames.push({ transform: `translateY(${position}px)` });
                duration = time * 1000;
                if (frame > 5 && Math.abs(position) < .25) break;
            }
            frames[frames.length - 1].transform = 'none';
            const animation = panel.animate(frames, { duration, easing: 'linear', fill: 'both' });
            const backdrop = scrim.animate([{ opacity: backdropOpacity }, { opacity: '1' }], { duration: Math.min(duration, 180), easing: 'linear', fill: 'both' });
            animations = [animation, backdrop];
            animation.finished.then(() => { if (operation === sequence && !disposed) cancel(); }).catch(() => {});
        },
        freeze() {
            const transform = windowRef.getComputedStyle(panel).transform;
            const opacity = windowRef.getComputedStyle(scrim).opacity;
            ++sequence; cancel(); panel.style.transform = transform; scrim.style.opacity = opacity;
            return transform;
        },
        dispose() { disposed = true; ++sequence; cancel(); },
    });
}
