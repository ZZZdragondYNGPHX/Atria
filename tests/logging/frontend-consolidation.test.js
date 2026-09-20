import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

describe('frontend logging consolidation', () => {
    test('frontend-log-manager is a thin compatibility facade', () => {
        const source = readFileSync(new URL('../../public/scripts/frontend-log-manager.js', import.meta.url), 'utf8');
        expect(source).toContain("./logging/console-adapter.js");
        expect(source).toContain("./logging/fetch-adapter.js");
        expect(source).toContain("./logging/error-adapter.js");
        expect(source).toContain('frontendLogStore.query');
        expect(source).not.toContain('frontendLogBuffer');
        expect(source).not.toContain('globalThis.fetch = async');
        expect(source).not.toContain("window.addEventListener('error'");
    });
});
