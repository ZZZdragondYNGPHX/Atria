/** @jest-environment jsdom */
import { describe, expect, jest, test } from '@jest/globals';
import { mountAtriaPreferenceControls } from '../../public/scripts/atria-shell/preference-controls.js';

describe('Native preference controls', () => {
    test('the original font scale survives native range setup and only release persists it', () => {
        const group = document.createElement('section'), sample = document.createElement('p');
        const authority = { powerUserSettings: { font_scale: 1 }, updateAtriaPreference: jest.fn() };
        const controls = mountAtriaPreferenceControls({ document, group, section: 'appearance', authority, sample });
        const input = group.querySelector('input');
        expect(input.value).toBe('1'); expect(sample.style.fontSize).toBe('20px');
        input.value = '1.2'; input.dispatchEvent(new Event('input'));
        expect(sample.style.fontSize).toBe('24px'); expect(authority.updateAtriaPreference).not.toHaveBeenCalled();
        input.dispatchEvent(new Event('change'));
        expect(authority.updateAtriaPreference).toHaveBeenCalledWith('font_scale', 1.2);
        controls.dispose();
    });

    test('OS reduced motion locks effective state without replacing the manual preference', () => {
        let update;
        const query = { matches: true, addEventListener: (_name, listener) => update = listener, removeEventListener: jest.fn() };
        const original = window.matchMedia; window.matchMedia = () => query;
        const group = document.createElement('section');
        const authority = { powerUserSettings: { reduced_motion: false }, updateAtriaPreference: jest.fn() };
        const controls = mountAtriaPreferenceControls({ document, group, section: 'accessibility', authority });
        const input = group.querySelector('[data-atria-preference="reduced_motion"]');
        expect(input.checked).toBe(true); expect(input.disabled).toBe(true);
        expect(authority.powerUserSettings.reduced_motion).toBe(false);
        query.matches = false; update();
        expect(input.checked).toBe(false); expect(input.disabled).toBe(false);
        controls.dispose(); expect(query.removeEventListener).toHaveBeenCalledWith('change', update);
        window.matchMedia = original;
    });
});
