import { describe, expect, test } from '@jest/globals';

import { createCommandRegistry } from '../../public/scripts/native/experience/logic/command-registry.js';
import { runCommandValidators } from '../../public/scripts/native/experience/logic/validators.js';

describe('Game Command Validators', () => {
    test('runs validators in order and collects deterministic rejection messages', async () => {
        const order = [];
        const result = await runCommandValidators([
            ({ args }) => {
                order.push('first');
                return args.amount <= 10 || 'amount exceeds limit';
            },
            ({ world }) => {
                order.push('second');
                return world.locked ? 'world is locked' : true;
            },
        ], {
            command: { id: 'spend' },
            args: { amount: 12 },
            world: { locked: true },
        });

        expect(order).toEqual(['first', 'second']);
        expect(result).toEqual({
            ok: false,
            errors: ['amount exceeds limit', 'world is locked'],
        });
    });

    test('surfaces validator execution failures as runtime errors', async () => {
        await expect(runCommandValidators([
            () => {
                throw new Error('boom');
            },
        ], {
            command: { id: 'x' },
            args: {},
            world: {},
        })).rejects.toThrow(/validator 0 failed: boom/i);
    });

    test('command registry rejects non-function validators', () => {
        expect(() => createCommandRegistry([{
            id: 'bad',
            validators: [true],
            execute() {
                return [];
            },
        }])).toThrow(/validators must be an array of functions/);
    });
});
