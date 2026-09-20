import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const STARTUP_URL = new URL('../src/server-startup.js', import.meta.url);

describe('lazy search server router', () => {
    test('keeps Cheerio-backed search endpoint out of server startup evaluation', () => {
        const source = readFileSync(STARTUP_URL, 'utf8');

        expect(source).not.toContain("import { router as searchRouter } from './endpoints/search.js'");
        expect(source).toContain("() => import('./endpoints/search.js')");
        expect(source).toContain("{ exportName: 'router', label: 'search' }");
    });
});
