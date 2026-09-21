import { describe, expect, test } from '@jest/globals';

import {
    buildGameBranchPath,
    getGameBranchId,
    isGameBranchPathCompatible,
    normalizeGameBranchPath,
} from '../../public/scripts/extensions/game-runtime/world/branch.js';

describe('Game World branch mapping', () => {
    test('maps chat floor swipe ids into a deterministic branch path', () => {
        const chat = [
            { swipe_id: 0 },
            { swipe_id: 2 },
            {},
            { swipe_id: 1 },
        ];
        expect(buildGameBranchPath(chat)).toEqual([0, 2, 0, 1]);
        expect(getGameBranchId(buildGameBranchPath(chat))).toBe('swipes:0.2.0.1');
    });

    test('historical lineage is compatible only with an exact active prefix', () => {
        expect(isGameBranchPathCompatible([0, 1], [0, 1, 2])).toBe(true);
        expect(isGameBranchPathCompatible([0, 1, 2], [0, 1])).toBe(false);
        expect(isGameBranchPathCompatible([0, 1], [0, 2, 0])).toBe(false);
    });

    test('rejects malformed explicit branch paths', () => {
        expect(() => normalizeGameBranchPath([0, -1])).toThrow();
        expect(() => normalizeGameBranchPath([0, 1.5])).toThrow();
    });
});
