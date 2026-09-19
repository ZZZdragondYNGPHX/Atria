import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const EXTENSIONS_ENDPOINT_URL = new URL('../src/endpoints/extensions.js', import.meta.url);

describe('extension discovery startup cache', () => {
    test('covers the boot burst and invalidates only on filesystem mutations', () => {
        const source = readFileSync(EXTENSIONS_ENDPOINT_URL, 'utf8');

        expect(source).toContain('EXTENSION_DISCOVERY_CACHE_TTL_MS = 10_000');
        for (const path of ['/install', '/update', '/switch', '/move', '/delete']) {
            expect(source).toContain(`'${path}'`);
        }

        const mutationBlockStart = source.indexOf('const EXTENSION_DISCOVERY_MUTATION_PATHS');
        const mutationBlockEnd = source.indexOf(']);', mutationBlockStart);
        const mutationBlock = source.slice(mutationBlockStart, mutationBlockEnd);
        expect(mutationBlock).not.toContain("'/version'");
        expect(mutationBlock).not.toContain("'/branches'");
    });
});
