import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const INIT_URL = new URL('../public/init.js', import.meta.url);

describe('frontend bootstrap loading', () => {
    test('starts lib and app module graphs before awaiting either one', () => {
        const source = readFileSync(INIT_URL, 'utf8');
        const libStart = source.indexOf("const libImport = import('./lib.js')");
        const appStart = source.indexOf("const appImport = import('./script.js')");
        const join = source.indexOf('await Promise.all([libImport, appImport])');

        expect(libStart).toBeGreaterThanOrEqual(0);
        expect(appStart).toBeGreaterThanOrEqual(0);
        expect(join).toBeGreaterThan(appStart);
        expect(join).toBeGreaterThan(libStart);
        expect(source).not.toContain("await import('./lib.js')");
        expect(source).not.toContain("await import('./script.js')");
    });
});
