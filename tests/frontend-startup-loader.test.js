import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const SCRIPT_URL = new URL('../public/script.js', import.meta.url);
const LOADER_URL = new URL('../public/scripts/loader.js', import.meta.url);
const ACTION_LOADER_URL = new URL('../public/scripts/action-loader.js', import.meta.url);

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
});
