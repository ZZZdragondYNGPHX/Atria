import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const INDEX_URL = new URL('../public/index.html', import.meta.url);

describe('frontend critical module preload', () => {
    test('discovers the critical module graph from the document head', () => {
        const source = readFileSync(INDEX_URL, 'utf8');
        const headEnd = source.indexOf('</head>');
        expect(headEnd).toBeGreaterThan(0);

        const head = source.slice(0, headEnd);
        expect(head).toContain('<link rel="modulepreload" href="lib.core.bundle.js">');
        expect(head).toContain('<link rel="modulepreload" href="lib.js">');
        expect(head).toContain('<link rel="modulepreload" href="script.js">');
    });
});
