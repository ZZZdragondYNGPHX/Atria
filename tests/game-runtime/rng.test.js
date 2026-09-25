import { describe, expect, test } from '@jest/globals';

import { createDeterministicRng } from '../../public/scripts/native/experience/logic/rng.js';

describe('Deterministic Game RNG', () => {
    test('same seed and stream produce identical outcomes and trace', () => {
        const first = createDeterministicRng('turn:7');
        const second = createDeterministicRng('turn:7');

        const run = rng => ({
            float: rng.float(),
            int: rng.int(1, 20),
            dice: rng.dice(2, 6, 1),
            weighted: rng.weighted([
                { value: 'a', weight: 1 },
                { value: 'b', weight: 3 },
            ]),
            child: rng.stream('loot').int(1, 100),
        });

        expect(run(first)).toEqual(run(second));
        expect(first.trace()).toEqual(second.trace());
    });

    test('named streams are deterministic and isolated from root consumption order', () => {
        const first = createDeterministicRng('seed');
        first.float();
        const firstLoot = first.stream('loot').int(1, 100);

        const second = createDeterministicRng('seed');
        const secondLoot = second.stream('loot').int(1, 100);

        expect(firstLoot).toBe(secondLoot);
    });

    test('dice and weighted choice validate bounded deterministic inputs', () => {
        const rng = createDeterministicRng('validation');

        expect(() => rng.int(4, 3)).toThrow(/maximum/);
        expect(() => rng.int(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toThrow(/deterministic precision/);
        expect(() => rng.dice(0, 6)).toThrow(/>= 1/);
        expect(() => rng.weighted([])).toThrow(/non-empty/);
        expect(() => rng.weighted([{ value: 'x', weight: 0 }])).toThrow(/weight > 0/);
        expect(() => rng.weighted([
            { value: 'x', weight: Number.MAX_VALUE },
            { value: 'y', weight: Number.MAX_VALUE },
        ])).toThrow(/total weight must be finite/);
        expect(() => rng.stream('../unsafe')).toThrow(/stream name/);
    });

    test('trace records operation and stream provenance', () => {
        const rng = createDeterministicRng('trace');
        rng.int(1, 6);
        rng.stream('combat').dice(1, 20);

        expect(rng.trace()).toEqual([
            expect.objectContaining({
                stream: 'default',
                operation: 'int',
                minimum: 1,
                maximum: 6,
            }),
            expect.objectContaining({
                stream: 'default.combat',
                operation: 'dice',
                count: 1,
                sides: 20,
            }),
        ]);
    });
});
