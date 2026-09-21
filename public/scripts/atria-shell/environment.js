import { ATRIA_SHELL_BREAKPOINTS, ATRIA_VIEWPORT_MODES } from './constants.js';

function readDimension(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function resolveAtriaViewportMode(width) {
    const normalized = readDimension(width, ATRIA_SHELL_BREAKPOINTS.mediumMax + 1);
    if (normalized <= ATRIA_SHELL_BREAKPOINTS.compactMax) return ATRIA_VIEWPORT_MODES.COMPACT;
    if (normalized <= ATRIA_SHELL_BREAKPOINTS.mediumMax) return ATRIA_VIEWPORT_MODES.MEDIUM;
    return ATRIA_VIEWPORT_MODES.EXPANDED;
}

function isTextInput(element) {
    return Boolean(element?.matches?.('input, textarea, select, [contenteditable="true"]'));
}

function readEnvironment(windowRef) {
    const visualViewport = windowRef.visualViewport;
    const width = readDimension(visualViewport?.width, readDimension(windowRef.innerWidth, 1280));
    const height = readDimension(visualViewport?.height, readDimension(windowRef.innerHeight, 720));
    const layoutHeight = readDimension(windowRef.innerHeight, height);
    const mode = resolveAtriaViewportMode(width);
    const coarsePointer = Boolean(windowRef.matchMedia?.('(pointer: coarse)')?.matches);
    const reducedMotion = Boolean(windowRef.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    const keyboardGap = Math.max(0, layoutHeight - height);
    const keyboardOpen = mode !== ATRIA_VIEWPORT_MODES.EXPANDED
        && isTextInput(windowRef.document?.activeElement)
        && keyboardGap >= Math.max(120, Math.round(layoutHeight * 0.18));

    return Object.freeze({
        mode,
        orientation: width >= height ? 'landscape' : 'portrait',
        pointer: coarsePointer ? 'coarse' : 'fine',
        reducedMotion,
        keyboardOpen,
        width: Math.round(width),
        height: Math.round(height),
    });
}

function applyEnvironment(root, state) {
    root.dataset.atriaViewport = state.mode;
    root.dataset.atriaOrientation = state.orientation;
    root.dataset.atriaPointer = state.pointer;
    root.dataset.atriaKeyboard = state.keyboardOpen ? 'open' : 'closed';
    root.dataset.atriaReducedMotion = String(state.reducedMotion);
    root.style.setProperty('--atri-viewport-width', `${state.width}px`);
    root.style.setProperty('--atri-viewport-height', `${state.height}px`);
}

function sameEnvironment(left, right) {
    return Boolean(left && right)
        && left.mode === right.mode
        && left.orientation === right.orientation
        && left.pointer === right.pointer
        && left.reducedMotion === right.reducedMotion
        && left.keyboardOpen === right.keyboardOpen
        && left.width === right.width
        && left.height === right.height;
}

export function createAtriaShellEnvironment(root, { window: windowRef = globalThis.window } = {}) {
    if (!root || !windowRef) throw new Error('Atria shell environment requires a root and window');

    const listeners = new Set();
    let state = readEnvironment(windowRef);
    let disposed = false;
    let scheduled = false;
    applyEnvironment(root, state);

    function refresh() {
        scheduled = false;
        if (disposed) return state;

        const next = readEnvironment(windowRef);
        if (sameEnvironment(next, state)) return state;
        const previous = state;
        state = next;
        applyEnvironment(root, state);

        for (const listener of listeners) {
            try {
                listener(state, previous);
            } catch (error) {
                console.error('[atria-shell] Responsive listener failed', error);
            }
        }
        return state;
    }

    function scheduleRefresh() {
        if (scheduled || disposed) return;
        scheduled = true;
        if (typeof windowRef.requestAnimationFrame === 'function') {
            windowRef.requestAnimationFrame(refresh);
        } else {
            queueMicrotask(refresh);
        }
    }

    windowRef.addEventListener?.('resize', scheduleRefresh);
    windowRef.addEventListener?.('orientationchange', scheduleRefresh);
    windowRef.visualViewport?.addEventListener?.('resize', scheduleRefresh);
    windowRef.document?.addEventListener?.('focusin', scheduleRefresh);
    windowRef.document?.addEventListener?.('focusout', scheduleRefresh);

    return Object.freeze({
        get: () => state,
        refresh,
        subscribe(listener) {
            if (typeof listener !== 'function') throw new TypeError('Responsive listener must be a function');
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            listeners.clear();
            windowRef.removeEventListener?.('resize', scheduleRefresh);
            windowRef.removeEventListener?.('orientationchange', scheduleRefresh);
            windowRef.visualViewport?.removeEventListener?.('resize', scheduleRefresh);
            windowRef.document?.removeEventListener?.('focusin', scheduleRefresh);
            windowRef.document?.removeEventListener?.('focusout', scheduleRefresh);
        },
    });
}
