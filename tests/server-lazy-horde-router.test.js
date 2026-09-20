import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const STARTUP_URL = new URL('../src/server-startup.js', import.meta.url);

describe('lazy Horde server router', () => {
    test('keeps the AI Horde client out of server startup evaluation', () => {
        const source = readFileSync(STARTUP_URL, 'utf8');

        expect(source).not.toContain("import { router as hordeRouter } from './endpoints/horde.js'");
        expect(source).toContain("() => import('./endpoints/horde.js')");
        expect(source).toContain("{ exportName: 'router', label: 'horde' }");
    });
});
