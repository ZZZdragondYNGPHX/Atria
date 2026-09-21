import { describe, expect, test } from '@jest/globals';

import {
    compileFormula,
    evaluateFormula,
    evaluateFormulaAst,
} from '../../public/scripts/extensions/game-runtime/logic/formula.js';

describe('Game Formula AST', () => {
    test('compiles inspectable AST with arithmetic precedence', () => {
        const ast = compileFormula('world.player.attack + args.bonus * 2');

        expect(ast).toEqual({
            type: 'binary',
            operator: '+',
            left: {
                type: 'reference',
                path: ['world', 'player', 'attack'],
            },
            right: {
                type: 'binary',
                operator: '*',
                left: {
                    type: 'reference',
                    path: ['args', 'bonus'],
                },
                right: {
                    type: 'literal',
                    value: 2,
                },
            },
        });
        expect(Object.isFrozen(ast)).toBe(true);
    });

    test('evaluates safe references, comparison, boolean logic and builtins', () => {
        const context = {
            world: {
                player: { hp: 17, maxHp: 20 },
            },
            args: { amount: 8 },
            selectors: { inCombat: true },
        };

        expect(evaluateFormula('clamp(world.player.hp + args.amount, 0, world.player.maxHp)', context)).toBe(20);
        expect(evaluateFormula('selectors.inCombat && world.player.hp < world.player.maxHp', context)).toBe(true);
        expect(evaluateFormula('round(2.4) + floor(2.9) + ceil(2.1) + abs(-3)', context)).toBe(10);
        expect(evaluateFormula('min(8, 3, 5) + max(1, 6, 2)', context)).toBe(9);
    });

    test('supports explicitly injected safe functions for later RNG primitives', () => {
        const ast = compileFormula('rng.int(1, 6) + 2');
        const value = evaluateFormulaAst(ast, {}, {
            functions: {
                'rng.int': (minimum, maximum) => {
                    expect([minimum, maximum]).toEqual([1, 6]);
                    return 4;
                },
            },
        });
        expect(value).toBe(6);
    });

    test('rejects unsafe references, unsupported syntax and non-finite arithmetic', () => {
        expect(() => compileFormula('window.location')).toThrow(/reference root/);
        expect(() => compileFormula('world.__proto__.x')).toThrow(/blocked path/);
        expect(() => compileFormula('world.hp ? 1 : 0')).toThrow(/unsupported token/);
        expect(() => evaluateFormula('1 / 0')).toThrow(/division by zero/);
        expect(() => evaluateFormula('world.name + 1', {
            world: { name: 'hero' },
        })).toThrow(/finite number/);
    });

    test('numeric builtins reject empty or inverted ranges instead of producing non-finite values', () => {
        expect(() => evaluateFormula('min()')).toThrow(/at least one argument/);
        expect(() => evaluateFormula('max()')).toThrow(/at least one argument/);
        expect(() => evaluateFormula('clamp(5, 10, 1)')).toThrow(/maximum must be >= minimum/);
        expect(() => compileFormula('1'.repeat(4097))).toThrow(/exceeds 4096/);
    });

    test('boolean operators require booleans instead of JavaScript truthiness', () => {
        expect(() => evaluateFormula('world.hp && true', {
            world: { hp: 1 },
        })).toThrow(/requires a boolean/);
    });
});
