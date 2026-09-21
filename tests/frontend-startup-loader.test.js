import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const SCRIPT_URL = new URL('../public/script.js', import.meta.url);
const LOADER_URL = new URL('../public/scripts/loader.js', import.meta.url);
const ACTION_LOADER_URL = new URL('../public/scripts/action-loader.js', import.meta.url);
const POWER_USER_URL = new URL('../public/scripts/power-user.js', import.meta.url);

describe('startup loader fast hide', () => {
    test('first-load path skips the visual fade while the default remains animated', () => {
        const script = readFileSync(SCRIPT_URL, 'utf8');
        const loader = readFileSync(LOADER_URL, 'utf8');
        const actionLoader = readFileSync(ACTION_LOADER_URL, 'utf8');

        expect(script).toContain('hideLoader({ immediate: true })');
        expect(loader).toContain('hideLoader({ immediate = false } = {})');
        expect(loader).toContain('legacyLoaderHandle.hide({ immediate })');
        expect(actionLoader).toContain('async hide({ immediate = false } = {})');
        expect(actionLoader).toContain('await hideOverlay({ immediate })');
        expect(actionLoader).toContain('if (immediate) {');
        expect(actionLoader).toContain('setTimeout(r, 500)');
    });

    test('removes the static preloader before awaiting loader popup cleanup', () => {
        const loader = readFileSync(LOADER_URL, 'utf8');
        const remove = loader.indexOf("document.getElementById('preloader')?.remove();");
        const awaitHide = loader.indexOf('await legacyLoaderHandle.hide({ immediate });');

        expect(remove).toBeGreaterThanOrEqual(0);
        expect(awaitHide).toBeGreaterThan(remove);
    });

    test('guards responsive autocomplete refresh until the widget is initialized', () => {
        const powerUser = readFileSync(POWER_USER_URL, 'utf8');

        expect(powerUser).toContain("const instance = control.autocomplete('instance');");
        expect(powerUser).toContain('if (!instance)');
        expect(powerUser).toContain("const widget = control.autocomplete('widget')[0];");
    });

    test('enforces static preloader removal again at APP_READY', () => {
        const script = readFileSync(SCRIPT_URL, 'utf8');
        const appReadyEvent = script.indexOf('await eventSource.emit(event_types.APP_READY);');
        const remove = script.indexOf("document.getElementById('preloader')?.remove();", appReadyEvent);
        const timing = script.indexOf("markClientStartupTiming('appReady');", appReadyEvent);

        expect(appReadyEvent).toBeGreaterThanOrEqual(0);
        expect(remove).toBeGreaterThan(appReadyEvent);
        expect(timing).toBeGreaterThan(remove);
    });
});
