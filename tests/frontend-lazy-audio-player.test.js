import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const SCRIPT_URL = new URL('../public/script.js', import.meta.url);

describe('lazy audio player loading', () => {
    test('keeps audio-player out of the first static import graph', () => {
        const source = readFileSync(SCRIPT_URL, 'utf8');

        expect(source).not.toContain("from './scripts/audio-player.js'");
        expect(source).toContain("import('./scripts/audio-player.js')");
    });

    test('loads the player only from the audio attachment path and allows retry after failure', () => {
        const source = readFileSync(SCRIPT_URL, 'utf8');

        expect(source).toContain('function loadAudioPlayerModule()');
        expect(source).toContain('audioPlayerModulePromise = null;');
        expect(source).toContain("loadAudioPlayerModule()");
        expect(source).toContain("Failed to load audio player module");
    });
});
