export function getFocusableElements(root) {
    if (!root?.querySelectorAll) return [];
    return [...root.querySelectorAll([
        'button:not([disabled])',
        '[href]',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
    ].join(','))].filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
}

export function createFocusTrap(root, { onEscape = () => {} } = {}) {
    let restoreTarget = null;

    const keydown = event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            onEscape();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = getFocusableElements(root);
        if (!focusable.length) {
            event.preventDefault();
            root.focus?.();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    return {
        activate(opener = document.activeElement) {
            restoreTarget = opener instanceof HTMLElement ? opener : null;
            root.addEventListener('keydown', keydown);
            const first = getFocusableElements(root)[0];
            (first || root).focus?.();
        },
        deactivate({ restoreFocus = true } = {}) {
            root.removeEventListener('keydown', keydown);
            if (restoreFocus && restoreTarget?.isConnected) {
                restoreTarget.focus({ preventScroll: true });
            }
            restoreTarget = null;
        },
    };
}
