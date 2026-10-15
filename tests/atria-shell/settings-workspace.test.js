/** @jest-environment jsdom */
import { expect, jest, test } from '@jest/globals';
import { mountSettingsUtility } from '../../public/scripts/atria-shell/settings-workspace.js';
import { createAtriaThemeService } from '../../public/scripts/atria-shell/theme-service.js';

function mount() {
    document.body.replaceChildren();
    const slot = document.createElement('main'); document.body.append(slot);
    const power = { atria_theme: { version: 1, mode: 'light', day: 'builtin:serene', night: 'builtin:dark-lite' } };
    const service = createAtriaThemeService({ prefs: power, documents: [], saveSettings: async () => true, createId: () => 'test-copy' });
    const authority = { atriaThemes: service, powerUserSettings: power, updateAtriaPreference: jest.fn(async () => true) };
    const controller = mountSettingsUtility({ document, slot, authority });
    return { slot, service, controller, authority };
}
test('search opens the original advanced control, with one handler and preserved query', () => {
    const { slot, controller } = mount();
    const original = slot.querySelector('.atria-theme-css-editor');
    const search = slot.querySelector('input[type="search"]'); search.value = 'CSS'; search.dispatchEvent(new Event('input'));
    expect(slot.querySelectorAll('.atria-settings-search-result')).toHaveLength(1);
    slot.querySelector('.atria-settings-search-result').click();
    expect(slot.querySelector('[data-setting-id="theme-css"]').open).toBe(true);
    expect(document.activeElement).toBe(slot.querySelector('[data-setting-id="theme-css"] summary'));
    expect(slot.querySelector('.atria-theme-css-editor')).toBe(original);
    expect(slot.querySelector('[data-settings-page]').dataset.settingsPage).toBe('appearance');
    slot.querySelector('.atria-settings-back').click();
    expect(search.value).toBe('CSS'); expect(slot.querySelector('.atria-settings-results').hidden).toBe(false);
    controller.dispose();
});
test('pure browsing cancels on category leave; edited CSS marks the existing leave guard', () => {
    const { slot, service, controller } = mount();
    service.previewTheme('builtin:azure');
    expect(service.effective().appearance).toBe('dark');
    slot.querySelector('[data-settings-category="reading"]').click();
    expect(service.getState().preview).toBeNull();
    expect(service.effective().appearance).toBe('light');
    slot.querySelector('[data-settings-category="appearance"]').click();
    const css = slot.querySelector('.atria-theme-css-editor'); css.value = ':root {}'; css.dispatchEvent(new Event('input'));
    expect(slot.querySelector('[data-atria-settings-section="appearance"]').dataset.atriaDraftDirty).toBe('true');
    controller.dispose(); expect(service.getState().preview).toBeNull();
});
