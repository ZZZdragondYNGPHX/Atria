/**
 * Atria appearance resolver.
 *
 * The existing theme authority (SmartTheme colors written onto the root
 * element by the theme controller) decides whether Atria renders its light or
 * dark palette. Atria does not persist a separate appearance preference; it
 * only derives `data-atria-appearance` from the active theme and follows live
 * theme changes.
 */

export const ATRIA_APPEARANCES = Object.freeze({
    DARK: 'dark',
    LIGHT: 'light',
});

/** Browser chrome color per appearance; mirrors --atri-canvas in atria-tokens.css. */
export const ATRIA_CHROME_COLORS = Object.freeze({
    dark: '#0e0f12',
    light: '#f6f6f8',
});

const HEX_PATTERN = /^#([0-9a-f]{3,8})$/i;
const FUNCTION_PATTERN = /^rgba?\(([^)]+)\)$/i;

function clampChannel(value) {
    return Math.min(255, Math.max(0, value));
}

export function parseAtriaColor(value) {
    const input = String(value || '').trim();
    if (!input) return null;

    const hex = HEX_PATTERN.exec(input);
    if (hex) {
        let digits = hex[1];
        if (digits.length === 3 || digits.length === 4) {
            digits = [...digits].map(digit => digit + digit).join('');
        }
        if (digits.length !== 6 && digits.length !== 8) return null;
        const channel = index => Number.parseInt(digits.slice(index, index + 2), 16);
        return {
            r: channel(0),
            g: channel(2),
            b: channel(4),
            a: digits.length === 8 ? channel(6) / 255 : 1,
        };
    }

    const functional = FUNCTION_PATTERN.exec(input);
    if (!functional) return null;
    const parts = functional[1]
        .replace(/\//g, ' ')
        .split(/[\s,]+/)
        .filter(Boolean);
    if (parts.length < 3) return null;
    const read = (part, scale) => {
        if (part.endsWith('%')) return Number.parseFloat(part) / 100 * scale;
        return Number.parseFloat(part);
    };
    const [r, g, b] = parts.slice(0, 3).map(part => clampChannel(read(part, 255)));
    const alpha = parts[3] === undefined ? 1 : read(parts[3], 1);
    if (![r, g, b, alpha].every(Number.isFinite)) return null;
    return { r, g, b, a: Math.min(1, Math.max(0, alpha)) };
}

export function relativeLuminance(color) {
    if (!color) return 0;
    const linear = channel => {
        const normalized = channel / 255;
        return normalized <= 0.03928
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
}

/**
 * Decide the Atria appearance for a theme.
 *
 * The panel tint is the strongest signal when it is reasonably opaque; a very
 * transparent tint defers to the body text color (dark text implies a light
 * theme).
 */
export function resolveAtriaAppearance({ tint, text } = {}) {
    const tintColor = typeof tint === 'string' ? parseAtriaColor(tint) : tint;
    const textColor = typeof text === 'string' ? parseAtriaColor(text) : text;
    if (tintColor && tintColor.a >= 0.35) {
        return relativeLuminance(tintColor) > 0.4 ? ATRIA_APPEARANCES.LIGHT : ATRIA_APPEARANCES.DARK;
    }
    if (textColor) {
        return relativeLuminance(textColor) < 0.25 ? ATRIA_APPEARANCES.LIGHT : ATRIA_APPEARANCES.DARK;
    }
    return ATRIA_APPEARANCES.DARK;
}

function readThemeAppearance(documentRef, windowRef) {
    const root = documentRef?.documentElement;
    if (!root) return ATRIA_APPEARANCES.DARK;
    const style = windowRef?.getComputedStyle?.(root);
    return resolveAtriaAppearance({
        tint: style?.getPropertyValue?.('--SmartThemeBlurTintColor') || root.style?.getPropertyValue?.('--SmartThemeBlurTintColor'),
        text: style?.getPropertyValue?.('--SmartThemeBodyColor') || root.style?.getPropertyValue?.('--SmartThemeBodyColor'),
    });
}

export function installAtriaAppearance({
    document: documentRef = globalThis.document,
    window: windowRef = globalThis.window,
} = {}) {
    const root = documentRef?.documentElement;
    if (!root) {
        return Object.freeze({
            get: () => ATRIA_APPEARANCES.DARK,
            refresh: () => ATRIA_APPEARANCES.DARK,
            subscribe: () => () => {},
            dispose() {},
        });
    }

    const previous = root.getAttribute('data-atria-appearance');
    const themeMeta = documentRef.querySelector?.('meta[name="theme-color"]') || null;
    const previousThemeColor = themeMeta?.getAttribute('content') ?? null;
    const listeners = new Set();
    let current = null;
    let scheduled = false;
    let disposed = false;

    function apply() {
        scheduled = false;
        if (disposed) return current;
        const next = readThemeAppearance(documentRef, windowRef);
        if (next === current) return current;
        current = next;
        root.setAttribute('data-atria-appearance', next);
        themeMeta?.setAttribute('content', ATRIA_CHROME_COLORS[next] || ATRIA_CHROME_COLORS.dark);
        for (const listener of listeners) {
            try {
                listener(next);
            } catch (error) {
                console.error('[atria-shell] Appearance listener failed', error);
            }
        }
        return current;
    }

    function schedule() {
        if (scheduled || disposed) return;
        scheduled = true;
        queueMicrotask(apply);
    }

    apply();

    const ObserverType = windowRef?.MutationObserver || globalThis.MutationObserver;
    const observer = typeof ObserverType === 'function' ? new ObserverType(schedule) : null;
    observer?.observe(root, { attributes: true, attributeFilter: ['style', 'class'] });

    return Object.freeze({
        get: () => current,
        refresh: apply,
        subscribe(listener) {
            if (typeof listener !== 'function') throw new TypeError('Appearance listener must be a function');
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            observer?.disconnect();
            listeners.clear();
            if (previous === null) root.removeAttribute('data-atria-appearance');
            else root.setAttribute('data-atria-appearance', previous);
            if (themeMeta && previousThemeColor !== null) themeMeta.setAttribute('content', previousThemeColor);
        },
    });
}
