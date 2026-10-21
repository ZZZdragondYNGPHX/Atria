import { parseAtriaColor, relativeLuminance } from './appearance.js';

export const THEME_FORMAT = 'atria-theme';
export const THEME_VERSION = 1;
export const DEFAULT_DAY = 'builtin:folio';
export const DEFAULT_NIGHT = 'builtin:nocturne';
const clone = value => JSON.parse(JSON.stringify(value));
export const sameThemeDocument = (a, b) => {
    const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([x], [y]) => x.localeCompare(y))) : item);
    return stable(a) === stable(b);
};
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const hex = color => '#' + ['r', 'g', 'b'].map(key => Math.round(color[key]).toString(16).padStart(2, '0')).join('');
export const mixColor = (a, b, amount) => {
    const x = parseAtriaColor(a), y = parseAtriaColor(b);
    return hex(Object.fromEntries(['r', 'g', 'b'].map(key => [key, x[key] * (1 - amount) + y[key] * amount])));
};
export function contrastRatio(a, b) {
    const x = relativeLuminance(parseAtriaColor(a)), y = relativeLuminance(parseAtriaColor(b));
    return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

/** A complete semantic palette, derived only from explicit theme inputs. */
export function createPalette({ appearance, canvas, surface, text, secondary, accent }) {
    const dark = appearance === 'dark';
    const onAccent = contrastRatio(accent, '#ffffff') >= contrastRatio(accent, '#151515') ? '#ffffff' : '#151515';
    const accentSoftStrong = mixColor(surface, accent, .22);
    let accentText = accent;
    for (let i = 0; i < 20 && Math.min(contrastRatio(accentText, surface), contrastRatio(accentText, accentSoftStrong)) < 4.5; i++) accentText = mixColor(accentText, text, .18);
    // Ledger tones keep one meaning each and stay legible on every surface:
    // info = draft/selection, committed = recorded fact, history = read-only
    // past, unknown = unverified/blocked. They are never success decoration.
    // A tone is checked against every ground it sits on: the surface, the canvas, the
    // raised fill and its own soft tint (badges, banners), not just the brightest one.
    const legible = color => {
        let result = color;
        const grounds = value => [surface, canvas, mixColor(surface, text, .09), mixColor(surface, value, .12)];
        for (let i = 0; i < 20 && grounds(result).some(ground => contrastRatio(result, ground) < 4.5); i++) result = mixColor(result, text, .15);
        return result;
    };
    const tone = (light, night) => legible(dark ? night : light);
    // Atrium ledger: 青 lapis, 玉 jade, 赭 umber, 黛 dai.
    const tones = { info: tone('#3b62b6', '#92b1f4'), committed: tone('#226f4e', '#7fcfa9'), history: tone('#866548', '#b39274'), unknown: tone('#6a5bb0', '#aa9fdd') };
    const accentState = amount => {
        let result = mixColor(accent, text, amount);
        for (let i = 0; i < 12 && contrastRatio(result, onAccent) < 4.5; i++) { amount *= .75; result = mixColor(accent, text, amount); }
        return result;
    };
    return {
        canvas, 'surface-1': surface, 'surface-2': mixColor(canvas, surface, .45), 'surface-3': mixColor(surface, text, .09), elevated: surface,
        'material-sidebar': surface, 'material-bar': surface, 'material-solid-sidebar': surface, 'material-solid-bar': canvas,
        'text-primary': text, 'text-secondary': secondary, 'text-tertiary': secondary, 'text-quaternary': mixColor(surface, text, .45),
        'text-on-accent': onAccent, 'text-on-ink': canvas, accent, 'accent-hover': accentState(.12), 'accent-pressed': accentState(.24),
        'accent-text': accentText, 'accent-soft': mixColor(surface, accent, .12), 'accent-soft-strong': accentSoftStrong,
        separator: mixColor(surface, text, .12), 'separator-strong': mixColor(surface, text, .5),
        fill: mixColor(surface, text, .04), 'fill-hover': mixColor(surface, text, .08), 'fill-pressed': mixColor(surface, text, .14), 'fill-strong': mixColor(surface, text, .2),
        'focus-ring': accentText,
        success: tones.committed, 'success-soft': mixColor(surface, tones.committed, .12),
        warning: tone('#935509', '#f3a85e'), 'warning-soft': mixColor(surface, dark ? '#f3a85e' : '#935509', .12),
        danger: tone('#bf4430', '#ef7f6d'), 'danger-soft': mixColor(surface, dark ? '#ef7f6d' : '#bf4430', .12),
        scrim: dark ? '#000000b3' : '#18182052', 'cover-ink': '#ffffff', ink: text,
        'ink-hover': mixColor(text, surface, .12), 'ink-pressed': mixColor(text, surface, .2), blue: dark ? '#83b7ff' : '#225cc5',
        ...Object.fromEntries(Object.entries(tones).flatMap(([name, value]) => [[name, value], [name + '-soft', mixColor(surface, value, .12)]])),
    };
}

function builtin(id, name, appearance, canvas, surface, text, secondary, accent, tuned = {}) {
    return Object.freeze({ format: THEME_FORMAT, version: 1, id: `builtin:${id}`, name, appearance,
        colors: Object.freeze({ ...createPalette({ appearance, canvas, surface, text, secondary, accent }), ...tuned }), css: Object.freeze({ enabled: false, text: '' }) });
}
export const BUILTIN_THEMES = Object.freeze([
    // 昼 Folio: rice-paper ground, ink text, gold recedes to ochre.
    builtin('folio', 'Folio', 'light', '#f5f1e8', '#fffdf8', '#1f1a14', '#574f45', '#94672b', {
        'surface-2': '#f8f5ee', 'surface-3': '#ece6da', 'text-tertiary': '#6b6254', 'text-quaternary': '#a39a8b',
        'fill-hover': '#ece6da', 'fill-pressed': '#e3dccd', ink: '#1f1a14', 'ink-hover': '#2a241c', 'ink-pressed': '#1b1712', 'text-on-ink': '#f7efe0',
    }),
    // 夜 Nocturne (default night): ink ground, warm ivory text, gold is the only warm light.
    builtin('nocturne', 'Nocturne', 'dark', '#0c0e14', '#171b25', '#f1ece2', '#c2bbaf', '#e6c391', {
        'surface-2': '#11141c', 'surface-3': '#1e2330', 'text-tertiary': '#9a9488', 'text-quaternary': '#6f6a62',
        'fill-hover': '#1e2330', 'fill-pressed': '#262c3a', ink: '#f1ece2', 'ink-hover': '#f4d9ae', 'ink-pressed': '#ddd6c9', 'text-on-ink': '#15120d',
    }),
    builtin('serene', 'Serene Canvas', 'light', '#f9f8f6', '#ffffff', '#1c1c1e', '#67676d', '#ff5a36'),
    builtin('azure', 'Azure', 'dark', '#11191e', '#1b2730', '#abc6df', '#9eafc0', '#8b9eff'),
    builtin('cappuccino', 'Cappuccino', 'dark', '#201c19', '#2d2723', '#f0e1cb', '#c0af9c', '#d4ac87'),
    builtin('celestial', 'Celestial Macaron', 'dark', '#11192b', '#1d2840', '#f2d2da', '#b9acc4', '#96dac3'),
    builtin('dark-lite', 'Dark Lite', 'dark', '#171717', '#242424', '#eee9e2', '#b5b0aa', '#ff936d'),
    builtin('dark-v', 'Dark V 1.0', 'dark', '#171d24', '#252e38', '#eeeae2', '#b2bac2', '#c2cb91'),
]);
export const THEME_COLOR_ROLES = Object.freeze(Object.keys(BUILTIN_THEMES[0].colors));

function keys(value, allowed, path) {
    if (!object(value)) throw new TypeError(`${path}: expected an object`);
    for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new TypeError(`${path}.${key}: unsupported field`);
}
function name(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 120 || /[<>:"/\\|?*\x00-\x1f]/.test(value)) throw new TypeError('name: use 1–120 characters without filename symbols');
    return value.trim();
}
export function validateNativeTheme(value) {
    keys(value, ['format', 'version', 'id', 'name', 'appearance', 'colors', 'css', 'compatibility'], 'theme');
    if (value.format !== THEME_FORMAT || value.version !== THEME_VERSION) throw new TypeError('version: unsupported Atria theme format');
    if (typeof value.id !== 'string' || !value.id.trim() || value.id.length > 160) throw new TypeError('id: missing theme identity');
    if (!['light', 'dark'].includes(value.appearance)) throw new TypeError('appearance: expected light or dark');
    name(value.name);
    keys(value.colors, THEME_COLOR_ROLES, 'colors');
    if (!Object.keys(value.colors).length) throw new TypeError('colors: provide at least one semantic color');
    for (const [role, color] of Object.entries(value.colors)) {
        if (typeof color !== 'string' || !parseAtriaColor(color)) throw new TypeError(`colors.${role}: invalid color`);
    }
    keys(value.css, ['enabled', 'text'], 'css');
    if (typeof value.css.enabled !== 'boolean' || typeof value.css.text !== 'string') throw new TypeError('css: expected enabled boolean and text string');
    if (value.compatibility !== undefined && !object(value.compatibility)) throw new TypeError('compatibility: expected an object');
    return clone(value);
}
export function resolveThemeColors(theme) {
    const base = BUILTIN_THEMES.find(item => item.appearance === theme.appearance).colors;
    const inputs = { ...base, ...theme.colors };
    // Related states follow edited base roles, then explicit advanced roles win.
    return { ...createPalette({ appearance: theme.appearance, canvas: inputs.canvas, surface: inputs['surface-1'], text: inputs['text-primary'], secondary: inputs['text-secondary'], accent: inputs.accent }), ...theme.colors };
}
export function convertLegacyTheme(value, { id = 'custom:import', cssEnabled = false } = {}) {
    if (!object(value) || 'format' in value || 'version' in value || typeof value.main_text_color !== 'string' || typeof value.blur_tint_color !== 'string') throw new TypeError('theme: unrecognized legacy format');
    const text = parseAtriaColor(value.main_text_color), tint = parseAtriaColor(value.blur_tint_color);
    if (!text || !tint) throw new TypeError('legacy colors: invalid text or panel color');
    const appearance = relativeLuminance(text) > .4 ? 'dark' : 'light';
    const base = BUILTIN_THEMES.find(item => item.appearance === appearance);
    const surface = hex(tint);
    const accent = parseAtriaColor(value.quote_text_color) ? hex(parseAtriaColor(value.quote_text_color)) : base.colors.accent;
    return { format: THEME_FORMAT, version: 1, id, name: name(value.name), appearance,
        colors: createPalette({ appearance, canvas: mixColor(surface, appearance === 'dark' ? '#000000' : '#ffffff', .2), surface, text: hex(text), secondary: mixColor(hex(text), surface, .22), accent }),
        css: { enabled: cssEnabled, text: typeof value.custom_css === 'string' ? value.custom_css : '' },
        compatibility: { source: 'legacy', raw: clone(value), notes: 'Colors adapted; missing roles completed. Layout, behavior and unknown fields preserved only.' } };
}
export function parseThemeImport(value, options) {
    if (object(value) && ('format' in value || 'version' in value)) return validateNativeTheme(value);
    return convertLegacyTheme(value, options);
}
export function uniqueThemeName(proposed, documents) {
    const base = name(proposed), used = new Set([...BUILTIN_THEMES, ...documents].map(item => item.name));
    if (!used.has(base)) return base;
    let suffix = 2;
    while (used.has(`${base.slice(0, 105)} (${suffix})`)) suffix++;
    return `${base.slice(0, 105)} (${suffix})`;
}
export function resolveThemeSelection(selection, themes, systemDark = false) {
    const appearance = selection.mode === 'system' ? systemDark ? 'dark' : 'light' : selection.mode;
    const id = appearance === 'dark' ? selection.night : selection.day;
    const found = themes.find(theme => theme.id === id && theme.appearance === appearance);
    const theme = found || BUILTIN_THEMES.find(item => item.id === (appearance === 'dark' ? DEFAULT_NIGHT : DEFAULT_DAY));
    return { theme, appearance, missing: found ? null : id, colors: resolveThemeColors(theme) };
}

/** Originals stay in NamedDocRepo; the snapshot also preserves unsaved legacy values. */
export function planThemeMigration(settings, documents, originals = []) {
    if (settings.power_user?.atria_theme?.version === 1) return null;
    // New accounts receive an explicit theme contract in default settings.
    // A historical firstRun flag only means onboarding is unfinished.
    const prefs = settings.power_user || {}, fresh = false;
    const assets = [];
    let night = DEFAULT_NIGHT;
    const selected = documents.find(item => item.name === prefs.theme);
    if (selected) {
        const shipped = originals.find(item => item.name === selected.name);
        const equal = shipped && sameThemeDocument(shipped, selected);
        const built = BUILTIN_THEMES.find(item => item.name === selected.name && item.appearance === 'dark');
        if (equal && built) night = built.id;
        else {
            try {
                const converted = convertLegacyTheme(selected, { id: 'migration:night' });
                if (converted.appearance === 'dark') {
                    converted.name = uniqueThemeName(`${selected.name} · migrated`, documents);
                    assets.push(converted); night = converted.id;
                }
            } catch { /* Original remains available; use the deterministic fallback. */ }
        }
    }
    let day = DEFAULT_DAY;
    if (!fresh && typeof prefs.custom_css === 'string' && prefs.custom_css) {
        const theme = clone(BUILTIN_THEMES.find(item => item.id === 'builtin:serene'));
        theme.id = 'migration:day'; theme.name = uniqueThemeName('Serene Canvas · migrated', documents);
        theme.css = { enabled: prefs.custom_css_enabled !== false, text: prefs.custom_css };
        theme.compatibility = { source: 'upgrade', raw: clone(prefs) };
        assets.push(theme); day = theme.id;
    }
    return { assets, selection: { version: 1, mode: fresh ? 'system' : 'light', day, night,
        migration: { version: 1, legacy: clone(prefs), notice: !fresh } } };
}
