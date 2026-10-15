import { expect, test } from '@jest/globals';
import { BUILTIN_THEMES, contrastRatio, convertLegacyTheme, parseThemeImport, planThemeMigration, resolveThemeSelection, THEME_COLOR_ROLES, validateNativeTheme } from '../../public/scripts/atria-shell/theme-model.js';

const legacy = { name: 'Dark Lite', main_text_color: '#eeeeee', blur_tint_color: '#171717', custom_css: 'body { --legacy: 1; }', font_scale: 1, mystery: { retained: true } };

test('all six builtins resolve complete roles and readable text, controls and statuses', () => {
    expect(BUILTIN_THEMES.map(theme => theme.name)).toEqual(['Serene Canvas', 'Azure', 'Cappuccino', 'Celestial Macaron', 'Dark Lite', 'Dark V 1.0']);
    for (const theme of BUILTIN_THEMES) {
        expect(Object.keys(validateNativeTheme(theme).colors)).toEqual(THEME_COLOR_ROLES);
        for (const text of ['text-primary', 'text-secondary', 'accent-text', 'success', 'warning', 'danger']) expect(contrastRatio(theme.colors[text], theme.colors['surface-1'])).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(theme.colors['text-on-accent'], theme.colors.accent)).toBeGreaterThanOrEqual(4.5);
        for (const role of ['accent-hover', 'accent-pressed']) expect(contrastRatio(theme.colors['text-on-accent'], theme.colors[role])).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(theme.colors['accent-text'], theme.colors['accent-soft-strong'])).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(theme.colors['text-on-ink'], theme.colors.ink)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(theme.colors['separator-strong'], theme.colors['surface-1'])).toBeGreaterThanOrEqual(3);
    }
});
test('mode and slot identity remain independent, missing selections survive fallback', () => {
    const selection = { mode: 'light', day: 'builtin:serene', night: 'builtin:azure' };
    expect(resolveThemeSelection(selection, BUILTIN_THEMES, true).theme.name).toBe('Serene Canvas');
    selection.mode = 'system';
    expect(resolveThemeSelection(selection, BUILTIN_THEMES, true).theme.name).toBe('Azure');
    selection.night = 'deleted';
    expect(resolveThemeSelection(selection, BUILTIN_THEMES, true)).toMatchObject({ missing: 'deleted', theme: { name: 'Dark Lite' } });
    expect(selection.night).toBe('deleted');
});
test('legacy imports keep full originals and never execute behavior or enable CSS', () => {
    const theme = convertLegacyTheme(legacy);
    expect(theme.compatibility.raw).toEqual(legacy);
    expect(theme.font_scale).toBeUndefined();
    expect(theme.css).toEqual({ enabled: false, text: legacy.custom_css });
});
test('native parsing refuses future versions, unknown fields and malformed roles', () => {
    const theme = JSON.parse(JSON.stringify(BUILTIN_THEMES[0]));
    expect(() => parseThemeImport({ ...theme, version: 2 })).toThrow(/version/);
    expect(() => parseThemeImport({ ...theme, ignored: true })).toThrow(/ignored/);
    expect(() => parseThemeImport({ ...theme, colors: { canvas: 'bad' } })).toThrow(/canvas/);
    expect(() => parseThemeImport({ ...theme, css: { enabled: true, text: '', unknown: 1 } })).toThrow(/unknown/);
});
test('upgrade preserves visible light CSS, old unsaved colors and modified same-name assets', () => {
    const settings = { firstRun: false, power_user: { theme: 'Dark Lite', font_scale: 1.25, custom_css: ':root { --x: 1; }', main_text_color: '#abc' } };
    const result = planThemeMigration(settings, [legacy], [{ ...legacy, mystery: 'original' }]);
    expect(result.selection).toMatchObject({ mode: 'light', day: 'migration:day', night: 'migration:night' });
    expect(result.selection.migration.legacy).toEqual(settings.power_user);
    expect(result.assets[0].compatibility.raw).toEqual(legacy);
    expect(result.assets[1].css.enabled).toBe(true);
    expect(settings.power_user.font_scale).toBe(1.25);
    expect(planThemeMigration({ power_user: { atria_theme: result.selection } }, [])).toBeNull();
});
