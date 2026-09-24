/** @jest-environment jsdom */

import { expect, test } from '@jest/globals';
import { installAtriaAppearance, resolveAtriaAppearance } from '../../public/scripts/atria-shell/appearance.js';

test('appearance follows the existing theme and restores chrome on disposal', async () => {
    const root = document.documentElement;
    root.style.setProperty('--SmartThemeBlurTintColor', 'rgb(20, 20, 20)');
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#123456';
    document.head.append(meta);
    const appearance = installAtriaAppearance({ document, window });
    try {
        expect(appearance.get()).toBe('dark');
        root.style.setProperty('--SmartThemeBlurTintColor', 'rgb(255, 255, 255)');
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(root.dataset.atriaAppearance).toBe('light');
        expect(meta.content).toBe('#f6f6f8');
    } finally {
        appearance.dispose();
        root.style.removeProperty('--SmartThemeBlurTintColor');
    }
    expect(root.hasAttribute('data-atria-appearance')).toBe(false);
    expect(meta.content).toBe('#123456');
    meta.remove();
});

test('transparent themes use text contrast and invalid colors fall back to dark', () => {
    expect(resolveAtriaAppearance({ tint: 'rgba(255, 255, 255, 0)', text: '#111' })).toBe('light');
    expect(resolveAtriaAppearance({ tint: 'rgba(0, 0, 0, 0)', text: '#eee' })).toBe('dark');
    expect(resolveAtriaAppearance({ tint: 'invalid', text: 'invalid' })).toBe('dark');
});
