import { expect, jest, test } from '@jest/globals';
import { createAtriaThemeService } from '../../public/scripts/atria-shell/theme-service.js';

function fixture({ selection = { version: 1, mode: 'system', day: 'builtin:serene', night: 'builtin:dark-lite' }, prefs = {}, settings } = {}) {
    const power = { ...prefs, ...(selection ? { atria_theme: selection } : {}) }, stored = { selection: selection && structuredClone(selection), themes: [] };
    const save = jest.fn(async () => { stored.selection = structuredClone(power.atria_theme); return true; });
    const write = jest.fn(async theme => { stored.themes = [...stored.themes.filter(item => item.name !== theme.name), structuredClone(theme)]; });
    const service = createAtriaThemeService({ prefs: power, settings: settings || { power_user: structuredClone(power) }, saveSettings: save, writeAsset: write, deleteAsset: jest.fn(), readState: async () => stored });
    return { service, power, stored, save, write };
}
test('night browsing confirms only the slot, and system is recomputed after confirm/cancel', async () => {
    const { service, power } = fixture(); await service.initialize();
    service.previewTheme('builtin:azure');
    expect(service.effective(false).theme.name).toBe('Azure');
    power.font_scale = 1.25;
    service.cancel();
    expect(service.effective(true).theme.name).toBe('Dark Lite');
    expect(power.font_scale).toBe(1.25);
    service.previewTheme('builtin:azure'); await service.confirm();
    expect(power.atria_theme).toMatchObject({ mode: 'system', night: 'builtin:azure' });
    expect(service.effective(false).theme.name).toBe('Serene Canvas');
    expect(service.effective(true).theme.name).toBe('Azure');
});
test('a partial asset success retries only selection and preserves a stable copy', async () => {
    const { service, save, write, stored } = fixture(); await service.initialize();
    service.previewTheme('builtin:azure'); service.editTheme({ css: { enabled: false, text: 'body {}' } });
    save.mockResolvedValueOnce(false);
    await expect(service.confirm()).rejects.toThrow('Theme asset saved');
    expect(write).toHaveBeenCalledTimes(1); expect(stored.themes).toHaveLength(1);
    expect(service.getState().preview.assetSaved).toBe(true);
    await service.confirm();
    expect(write).toHaveBeenCalledTimes(1); expect(service.getState().preview).toBeNull();
});
test('asset failure retains draft; lost response is read before any retry', async () => {
    const { service, write, stored } = fixture(); await service.initialize();
    service.previewTheme('builtin:azure'); service.editTheme({ css: { enabled: true, text: ':root {}' } });
    write.mockRejectedValueOnce(new Error('offline'));
    await expect(service.confirm()).rejects.toThrow('offline');
    expect(service.getState().preview.dirty).toBe(true);
    write.mockImplementationOnce(async theme => { stored.themes.push(structuredClone(theme)); throw new Error('response lost'); });
    await service.confirm(); expect(stored.themes).toHaveLength(1);
});
test('migration retries durable assets, retains originals and does not reset later choices', async () => {
    const prefs = { font_scale: 1.25, custom_css: 'body { color: red; }', theme: 'unknown' };
    const { service, write, save, power } = fixture({ selection: null, prefs });
    save.mockResolvedValueOnce(false);
    await expect(service.initialize()).rejects.toThrow('selection');
    expect(service.effective(true).appearance).toBe('light');
    expect(service.effective().theme.css.text).toBe(prefs.custom_css);
    await service.retryMigration();
    expect(write).toHaveBeenCalledTimes(1);
    expect(power.atria_theme.mode).toBe('light');
    expect(power.font_scale).toBe(1.25);
    expect(power.custom_css).toBe(prefs.custom_css);
});
test('unknown native imports fail without writes; importing never applies or rewrites selection', async () => {
    const { service, write, power } = fixture(); await service.initialize();
    await expect(service.importTheme({ format: 'atria-theme', version: 2 })).rejects.toThrow('version');
    expect(write).not.toHaveBeenCalled();
    const theme = await service.importTheme({ name: 'Azure', main_text_color: '#ddd', blur_tint_color: '#172129', custom_css: 'body {}', font_scale: .6 });
    expect(theme.name).toBe('Azure (2)'); expect(theme.css.enabled).toBe(false);
    expect(service.effective().theme.name).toBe('Serene Canvas');
    expect(power.atria_theme.night).toBe('builtin:dark-lite');
});
test('while saving, confirm cannot duplicate requests and cancellation cannot retract a write', async () => {
    const { service, save } = fixture(); await service.initialize();
    let finish; save.mockImplementationOnce(() => new Promise(resolve => finish = resolve));
    service.previewTheme('builtin:azure'); const pending = service.confirm();
    expect(service.cancel()).toBe(false);
    await expect(service.confirm()).rejects.toThrow('in progress');
    finish(true); await pending;
    expect(service.getState().preview).toBeNull();
});
