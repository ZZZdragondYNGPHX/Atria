import { describe, expect, test } from '@jest/globals';

import { createCommandRegistry } from '../../public/scripts/extensions/game-runtime/logic/command-registry.js';

function damageCommand() {
    return {
        id: 'damage',
        description: 'Apply deterministic damage',
        argsSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['amount'],
            properties: {
                amount: { type: 'integer', minimum: 1, maximum: 20 },
            },
        },
        execute({ args }) {
            return [{
                type: 'DamageDealt',
                payload: { amount: args.amount },
            }];
        },
    };
}

describe('Game Command Registry', () => {
    test('registers typed commands and validates arguments', () => {
        const registry = createCommandRegistry([damageCommand()]);

        expect(registry.list()).toEqual([{
            id: 'damage',
            description: 'Apply deterministic damage',
            argsSchema: damageCommand().argsSchema,
        }]);
        expect(registry.validate('damage', { amount: 4 })).toMatchObject({
            ok: true,
            errors: [],
            args: { amount: 4 },
        });
        expect(registry.validate('damage', { amount: 0 })).toMatchObject({
            ok: false,
        });
        expect(registry.validate('damage', { amount: 4, hidden: true }).errors.join(' ')).toMatch(/unexpected property/);
    });

    test('keeps LLM exposure opt-in and validates metadata', () => {
        const registry = createCommandRegistry([
            {
                ...damageCommand(),
                llm: { expose: true },
            },
            {
                id: 'internal_only',
                execute() {
                    return [];
                },
            },
        ]);

        expect(registry.list()).toEqual([
            {
                id: 'damage',
                description: 'Apply deterministic damage',
                argsSchema: damageCommand().argsSchema,
                llm: { expose: true },
            },
            {
                id: 'internal_only',
                argsSchema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {},
                },
            },
        ]);

        expect(() => createCommandRegistry([{
            id: 'bad_llm',
            llm: { expose: 'yes' },
            execute() {
                return [];
            },
        }])).toThrow(/llm\.expose must be a boolean/);

        expect(() => createCommandRegistry([{
            id: 'bad_llm_field',
            llm: { expose: true, stateWriter: true },
            execute() {
                return [];
            },
        }])).toThrow(/unknown field/);
    });

    test('rejects duplicate and malformed command definitions', () => {
        expect(() => createCommandRegistry([
            damageCommand(),
            damageCommand(),
        ])).toThrow(/Duplicate command id/);

        expect(() => createCommandRegistry([{
            id: 'Damage Command',
            execute() {
                return [];
            },
        }])).toThrow(/Command id must match/);
    });

    test('unknown commands fail closed', () => {
        const registry = createCommandRegistry([damageCommand()]);
        expect(registry.validate('missing', {})).toEqual({
            ok: false,
            errors: ["Unknown command 'missing'"],
            command: null,
            args: null,
        });
    });
});
