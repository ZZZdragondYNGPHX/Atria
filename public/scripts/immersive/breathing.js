export function createImmersiveBreathing({
    document: documentRef = globalThis.document,
    idleMs = 4500,
} = {}) {
    let enabled = false;
    let timer = null;

    const schedule = () => {
        clearTimeout(timer);
        if (!enabled) return;
        timer = setTimeout(() => {
            if (!enabled) return;
            const active = documentRef.activeElement;
            if (active?.matches?.('input, textarea, select, [contenteditable="true"]')) {
                schedule();
                return;
            }
            documentRef.body.classList.add('atria-immersive-resting');
        }, idleMs);
    };

    const wake = () => {
        if (!enabled) return;
        documentRef.body.classList.remove('atria-immersive-resting');
        schedule();
    };

    for (const eventName of ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'focusin']) {
        documentRef.addEventListener(eventName, wake, { passive: eventName !== 'keydown' });
    }

    return {
        setEnabled(nextEnabled) {
            enabled = Boolean(nextEnabled);
            documentRef.body.classList.remove('atria-immersive-resting');
            if (enabled) schedule();
            else clearTimeout(timer);
        },
        wake,
        dispose() {
            clearTimeout(timer);
            documentRef.body.classList.remove('atria-immersive-resting');
            for (const eventName of ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'focusin']) {
                documentRef.removeEventListener(eventName, wake);
            }
        },
    };
}
