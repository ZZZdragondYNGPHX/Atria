import { describe, expect, test } from '@jest/globals';

import { getVersion } from '../src/util.js';

describe('process-local version metadata cache', () => {
    test('reuses one in-flight/resolved version promise for the process lifetime', async () => {
        const firstPromise = getVersion();
        const secondPromise = getVersion();

        expect(secondPromise).toBe(firstPromise);

        const [first, second] = await Promise.all([firstPromise, secondPromise]);
        expect(second).toBe(first);
        expect(Object.isFrozen(first)).toBe(true);
        expect(first.pkgVersion).toBeTruthy();
        expect(first.agent).toContain('Atria:');
    });
});
