import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const INDEX_URL = new URL('../public/index.html', import.meta.url);
const TYPES_URL = new URL('../public/global.d.ts', import.meta.url);

describe('unused izoomify startup dependency', () => {
    test('does not load or advertise the unused izoomify plugin', () => {
        const html = readFileSync(INDEX_URL, 'utf8');
        const types = readFileSync(TYPES_URL, 'utf8');

        expect(html).not.toContain('lib/jquery.izoomify.js');
        expect(types).not.toContain('izoomify(options?: any): JQuery;');
    });
});
