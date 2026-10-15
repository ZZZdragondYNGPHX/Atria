/**
 * Atria appearance resolver.
 *
 * Projects the theme authority into existing semantic tokens and browser chrome.
 */

export const ATRIA_APPEARANCES = Object.freeze({
    DARK: 'dark',
    LIGHT: 'light',
});

/** Browser chrome color per appearance; mirrors --atri-canvas in atria-tokens.css. */
export const ATRIA_CHROME_COLORS = Object.freeze({
    dark: '#0e0f12',
    light: '#f9f8f6',
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
    if (parts.length < 3 || parts.length > 4 || parts.some(part => !/^[+-]?(?:\d*\.)?\d+%?$/.test(part))) return null;
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

export function installAtriaAppearance({
    document: documentRef = globalThis.document,
    window: windowRef = globalThis.window,
    authority = () => globalThis.Atria?.getContext?.()?.atriaThemes,
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
    let disposed = false;
    const query = windowRef.matchMedia?.('(prefers-color-scheme: dark)');
    const paletteStyle = documentRef.createElement('style'); paletteStyle.id = 'atria-theme-tokens';
    const cssStyle = documentRef.createElement('style'); cssStyle.id = 'atria-theme-css';
    documentRef.head.append(paletteStyle, cssStyle);
    const legacyStyle = documentRef.getElementById('custom-style');
    const legacyCss = legacyStyle?.textContent;
    let safeCss = new URLSearchParams(windowRef.location?.search || '').get('atriaNoThemeCss') === '1';

    function apply() {
        if (disposed) return current;
        const service = authority();
        const resolved = service?.effective(Boolean(query?.matches));
        const next = resolved?.appearance || ATRIA_APPEARANCES.LIGHT;
        current = next;
        root.setAttribute('data-atria-appearance', next);
        const colors = resolved?.colors || {};
        paletteStyle.textContent = resolved ? `:root:root { ${Object.entries(colors).map(([role, value]) => `--atri-${role}: ${value};`).join('\n')}\n--atri-highlight: inset 0 0 0 .5px ${next === 'dark' ? '#ffffff18' : '#ffffffdd'};\n--atri-shadow-1: 0 20px 40px -10px #000000${next === 'dark' ? '45' : '0d'};\n--atri-shadow-2: 0 12px 32px #000000${next === 'dark' ? '66' : '14'};\n--atri-shadow-3: 0 28px 72px #000000${next === 'dark' ? '80' : '1f'}; }` : '';
        if (service) {
            const legacy = documentRef.getElementById('custom-style');
            if (legacy) legacy.textContent = '';
            cssStyle.textContent = !safeCss && resolved.theme.css.enabled ? resolved.theme.css.text : '';
            root.dataset.atriaTheme = resolved.theme.id;
            root.dataset.atriaThemeCssSuppressed = String(safeCss);
        }
        const chrome = windowRef.getComputedStyle?.(root).getPropertyValue('--atri-canvas').trim() || colors.canvas || ATRIA_CHROME_COLORS[next];
        themeMeta?.setAttribute('content', chrome);
        try { windowRef.AtriaAndroid?.setSystemBarsColor?.(chrome, chrome); } catch { /* Browser theme stays usable without a platform bridge. */ }
        for (const listener of listeners) {
            try {
                listener(next);
            } catch (error) {
                console.error('[atria-shell] Appearance listener failed', error);
            }
        }
        return current;
    }

    function recover(event) {
        if (event.isComposing || !event.ctrlKey || !event.altKey || !event.shiftKey || event.code !== 'KeyR') return;
        safeCss = true; apply();
    }

    apply();

    query?.addEventListener?.('change', apply);
    documentRef.addEventListener('atria-theme-changed', apply);
    documentRef.addEventListener('keydown', recover, true);

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
            query?.removeEventListener?.('change', apply);
            documentRef.removeEventListener('atria-theme-changed', apply);
            documentRef.removeEventListener('keydown', recover, true);
            paletteStyle.remove(); cssStyle.remove();
            delete root.dataset.atriaTheme;
            delete root.dataset.atriaThemeCssSuppressed;
            if (legacyStyle && legacyCss !== undefined) legacyStyle.textContent = legacyCss;
            listeners.clear();
            if (previous === null) root.removeAttribute('data-atria-appearance');
            else root.setAttribute('data-atria-appearance', previous);
            if (themeMeta && previousThemeColor !== null) themeMeta.setAttribute('content', previousThemeColor);
        },
    });
}
