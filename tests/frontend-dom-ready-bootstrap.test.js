import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const SCRIPT_URL = new URL('../public/script.js', import.meta.url);

describe('frontend DOM-ready bootstrap gate', () => {
    test('does not wait for the full window load event', () => {
        const source = readFileSync(SCRIPT_URL, 'utf8');
        const gateStart = source.indexOf("await new Promise((resolve) => {");
        const gateEnd = source.indexOf("});", gateStart);
        const gate = source.slice(gateStart, gateEnd + 3);

        expect(gate).toContain("document.readyState !== 'loading'");
        expect(gate).toContain("document.addEventListener('DOMContentLoaded'");
        expect(gate).not.toContain("window.addEventListener('load'");
        expect(gate).not.toContain("document.readyState === 'complete'");
    });
});
