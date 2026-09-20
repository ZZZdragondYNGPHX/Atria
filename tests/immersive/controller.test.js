/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { createImmersiveController } from '../../public/scripts/immersive/controller.js';
import { normalizeImmersiveSettings, resolveImmersiveProfile } from '../../public/scripts/immersive/presentation.js';

describe('immersive presentation settings', () => {
    test('normalizes the deliberately small public settings surface', () => {
        expect(normalizeImmersiveSettings({
            immersive_mode_remember_state: false,
            immersive_mode_story_focus: false,
            immersive_mode_extensions_enabled: false,
            immersive_mode_visual_mode: 'enhanced',
            immersive_mode_hud_mode: 'minimal',
        })).toEqual({
            rememberState: false,
            storyFocus: false,
            extensionsEnabled: false,
            visualMode: 'enhanced',
            hudMode: 'minimal',
            reducedMotion: false,
        });
    });

    test('uses distinct desktop and mobile presentation profiles', () => {
        expect(resolveImmersiveProfile({ width: 1440 })).toBe('desktop');
        expect(resolveImmersiveProfile({ width: 700 })).toBe('mobile');
        expect(resolveImmersiveProfile({ mobile: true, width: 1440 })).toBe('mobile');
    });
});

describe('immersive controller', () => {
    test('construction does not read host settings before the app runtime is initialized', () => {
        document.body.innerHTML = '<button id="immersive_mode_toggle"><i id="immersiveModeIcon"></i><span id="immersiveModeLabel"></span></button>';
        const getSettings = jest.fn(() => {
            throw new ReferenceError('host settings are still in TDZ');
        });

        const controller = createImmersiveController({ document, window, getSettings });

        expect(getSettings).not.toHaveBeenCalled();
        controller.dispose();
    });

    beforeEach(() => {
        document.body.innerHTML = '<button id="immersive_mode_toggle"><i id="immersiveModeIcon"></i><span id="immersiveModeLabel"></span></button>';
        document.exitFullscreen = undefined;
        document.documentElement.requestFullscreen = undefined;
    });

    test('fullscreen rejection does not cancel the presentation layer', async () => {
        const settings = {
            immersive_mode_remember_state: true,
            immersive_mode_last_state: false,
        };
        document.documentElement.requestFullscreen = jest.fn().mockRejectedValue(new Error('blocked'));
        Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });

        const controller = createImmersiveController({
            document,
            window,
            getSettings: () => settings,
            saveSettings: jest.fn(),
        });

        await controller.setEnabled(true);

        expect(controller.isEnabled()).toBe(true);
        expect(document.body.classList.contains('atria-immersive-mode')).toBe(true);
        expect(settings.immersive_mode_last_state).toBe(true);
        controller.dispose();
    });

    test('leaving browser fullscreen keeps immersive presentation active', async () => {
        let fullscreenElement = null;
        Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
        Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement });
        document.documentElement.requestFullscreen = jest.fn(async () => {
            fullscreenElement = document.documentElement;
            document.dispatchEvent(new Event('fullscreenchange'));
        });

        const controller = createImmersiveController({ document, window });
        await controller.setEnabled(true);
        fullscreenElement = null;
        document.dispatchEvent(new Event('fullscreenchange'));

        expect(controller.isEnabled()).toBe(true);
        expect(document.body.classList.contains('atria-immersive-mode')).toBe(true);
        controller.dispose();
    });

    test('native fullscreen state changes do not toggle immersive presentation', async () => {
        window.AtriaAndroid = { setImmersiveModeEnabled: jest.fn() };
        const controller = createImmersiveController({ document, window });

        await controller.setEnabled(true, { useFullscreen: false, syncNative: false });
        controller.setNativeFullscreenState(true);
        controller.setNativeFullscreenState(false);

        expect(controller.isEnabled()).toBe(true);
        expect(document.body.classList.contains('atria-immersive-mode')).toBe(true);
        controller.dispose();
        delete window.AtriaAndroid;
    });

    test('remember-state setting controls persistence without controlling availability', async () => {
        const saveSettings = jest.fn();
        const settings = {
            immersive_mode_remember_state: false,
            immersive_mode_last_state: false,
        };
        const controller = createImmersiveController({
            document,
            window,
            getSettings: () => settings,
            saveSettings,
        });

        await controller.setEnabled(true, { useFullscreen: false });

        expect(controller.isEnabled()).toBe(true);
        expect(settings.immersive_mode_last_state).toBe(false);
        expect(saveSettings).not.toHaveBeenCalled();
        controller.dispose();
    });
});
