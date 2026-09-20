import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const STARTUP_URL = new URL('../src/server-startup.js', import.meta.url);

describe('lazy Stable Diffusion server router', () => {
    test('keeps the SD provider graph out of server startup evaluation', () => {
        const source = readFileSync(STARTUP_URL, 'utf8');

        expect(source).not.toContain("import { router as stableDiffusionRouter } from './endpoints/stable-diffusion.js'");
        expect(source).toContain("() => import('./endpoints/stable-diffusion.js')");
        expect(source).toContain("{ exportName: 'router', label: 'sd' }");
    });
});
