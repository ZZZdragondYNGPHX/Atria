const MOBILE_MAX_WIDTH = 599;
const TABLET_MAX_WIDTH = 1023;

function mediaMatches(windowRef, query) {
    try {
        return Boolean(windowRef?.matchMedia?.(query)?.matches);
    } catch {
        return false;
    }
}

function resolveViewport(windowRef) {
    const width = Number(windowRef?.innerWidth) || 0;
    const height = Number(windowRef?.innerHeight) || 0;
    return { width, height };
}

function resolveEnvironment(windowRef) {
    const { width, height } = resolveViewport(windowRef);
    const device = width <= MOBILE_MAX_WIDTH
        ? 'mobile'
        : (width <= TABLET_MAX_WIDTH ? 'tablet' : 'desktop');
    const orientation = width > height ? 'landscape' : 'portrait';
    const touch = (
        Number(windowRef?.navigator?.maxTouchPoints) > 0
        || mediaMatches(windowRef, '(any-pointer: coarse)')
    );
    const keyboard = (
        mediaMatches(windowRef, '(any-pointer: fine)')
        || !touch
    );

    return Object.freeze({
        device,
        orientation,
        touch,
        keyboard,
        width,
        height,
    });
}

function applyEnvironment(root, environment) {
    root.dataset.atriaGameDevice = environment.device;
    root.dataset.atriaGameOrientation = environment.orientation;
    root.dataset.atriaGameTouch = String(environment.touch);
    root.dataset.atriaGameKeyboard = String(environment.keyboard);

    if (root.style?.setProperty) {
        root.style.setProperty('--atria-game-viewport-width', environment.width + 'px');
        root.style.setProperty('--atria-game-viewport-height', environment.height + 'px');
        root.style.setProperty('--atria-game-safe-area-top', 'env(safe-area-inset-top, 0px)');
        root.style.setProperty('--atria-game-safe-area-right', 'env(safe-area-inset-right, 0px)');
        root.style.setProperty('--atria-game-safe-area-bottom', 'env(safe-area-inset-bottom, 0px)');
        root.style.setProperty('--atria-game-safe-area-left', 'env(safe-area-inset-left, 0px)');
    }
}

export function createResponsiveEnvironment(root, options = {}) {
    const windowRef = options.window || globalThis.window;
    if (!root?.dataset) {
        throw new Error('Responsive Game UI contract requires a root element');
    }
    if (!windowRef) {
        throw new Error('Responsive Game UI contract requires a window');
    }

    const listeners = new Set();
    let current = resolveEnvironment(windowRef);
    applyEnvironment(root, current);

    function refresh() {
        const next = resolveEnvironment(windowRef);
        const changed = (
            next.device !== current.device
            || next.orientation !== current.orientation
            || next.touch !== current.touch
            || next.keyboard !== current.keyboard
            || next.width !== current.width
            || next.height !== current.height
        );
        const previous = current;
        current = next;
        applyEnvironment(root, current);

        if (changed) {
            for (const listener of listeners) listener(current, previous);
        }
        return current;
    }

    const onResize = () => refresh();
    windowRef.addEventListener?.('resize', onResize);
    windowRef.addEventListener?.('orientationchange', onResize);

    let disposed = false;
    return Object.freeze({
        get() {
            return current;
        },
        refresh,
        subscribe(listener) {
            if (typeof listener !== 'function') {
                throw new Error('Responsive environment listener must be a function');
            }
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            listeners.clear();
            windowRef.removeEventListener?.('resize', onResize);
            windowRef.removeEventListener?.('orientationchange', onResize);
        },
    });
}
