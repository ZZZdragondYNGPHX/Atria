/** @jest-environment jsdom */

import { expect, test } from '@jest/globals';
import { installAtriaAppearance, resolveAtriaAppearance } from '../../public/scripts/atria-shell/appearance.js';

test('Serene Canvas remains light without changing stored theme and restores chrome on disposal', async () => {
    const root = document.documentElement;
    root.style.setProperty('--SmartThemeBlurTintColor', 'rgb(20, 20, 20)');
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#123456';
    document.head.append(meta);
    const appearance = installAtriaAppearance({ document, window, authority: () => null });
    try {
        expect(appearance.get()).toBe('light');
        expect(root.style.getPropertyValue('--SmartThemeBlurTintColor')).toBe('rgb(20, 20, 20)');
        root.style.setProperty('--SmartThemeBlurTintColor', 'rgb(255, 255, 255)');
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(root.dataset.atriaAppearance).toBe('light');
        expect(meta.content).toBe('#f9f8f6');
    } finally {
        appearance.dispose();
        root.style.removeProperty('--SmartThemeBlurTintColor');
    }
    expect(root.hasAttribute('data-atria-appearance')).toBe(false);
    expect(meta.content).toBe('#123456');
    meta.remove();
});

test('native projection follows system, updates colors/CSS and removes its listeners and styles', () => {
    const original = window.matchMedia;
    let systemChanged;
    const query = { matches: true, addEventListener: (_event, listener) => { systemChanged = listener; }, removeEventListener() {} };
    window.matchMedia = () => query;
    const service = { effective: dark => ({ appearance: dark ? 'dark' : 'light', colors: { canvas: dark ? '#171717' : '#f9f8f6' }, theme: { id: 'test', css: { enabled: true, text: ':root { --test: 1; }' } } }) };
    const projection = installAtriaAppearance({ document, window, authority: () => service });
    expect(projection.get()).toBe('dark');
    expect(document.querySelector('#atria-theme-css').textContent).toContain('--test');
    query.matches = false; systemChanged(); expect(projection.get()).toBe('light');
    document.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, altKey: true, shiftKey: true, code: 'KeyR' }));
    expect(document.querySelector('#atria-theme-css').textContent).toBe('');
    projection.dispose(); expect(document.querySelector('#atria-theme-tokens')).toBeNull();
    window.matchMedia = original;
});

test('transparent themes use text contrast and invalid colors fall back to dark', () => {
    expect(resolveAtriaAppearance({ tint: 'rgba(255, 255, 255, 0)', text: '#111' })).toBe('light');
    expect(resolveAtriaAppearance({ tint: 'rgba(0, 0, 0, 0)', text: '#eee' })).toBe('dark');
    expect(resolveAtriaAppearance({ tint: 'invalid', text: 'invalid' })).toBe('dark');
});
