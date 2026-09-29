import { describe, test, expect } from '@jest/globals';
import { observeSettings } from '../src/settings-observation.js';

describe('pure scoped settings observation', () => {
    test('does not mutate or seed and excludes secrets and generation configuration recursively', () => {
        const document = { ui: { theme: 'dark', token: 'hidden', nested: { api_key: 'hidden', font: 14 } }, connections: ['hidden'] };
        const before = JSON.stringify(document);
        expect(observeSettings(null).entries).toEqual([]);
        expect(observeSettings(document, { operation: 'get', path: 'ui' }).value).toEqual({ theme: 'dark', nested: { font: 14 } });
        expect(JSON.stringify(observeSettings(document, { operation: 'search' }))).not.toContain('hidden');
        expect(JSON.stringify(document)).toBe(before);
        expect(() => observeSettings(document, { operation: 'get' })).toThrow();
        for (const path of ['ui/token', '__proto__', 'connections']) expect(() => observeSettings(document, { operation: 'get', path })).toThrow();
    });
    test('catalog/search paginate paths without returning values', () => {
        const doc = { ui: { theme: 'private contents', font: 14 } };
        const page = observeSettings(doc, { operation: 'search', query: 'ui/', limit: 1 });
        expect(page.total).toBe(2); expect(page.nextOffset).toBe(1);
        expect(JSON.stringify(page)).not.toContain('private contents');
        expect(observeSettings(doc, { operation: 'get', path: 'ui/missing' }).found).toBe(false);
    });
});
