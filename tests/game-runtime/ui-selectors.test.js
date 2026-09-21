import { describe, expect, test } from '@jest/globals';

import { createSelectorRuntime } from '../../public/scripts/extensions/game-runtime/ui/selectors.js';

describe('Game UI Selector Runtime', () => {
    test('projects read-only values and only notifies on actual changes', () => {
        let world = {
            player: { hp: 10, maxHp: 20 },
            hidden: { secret: 99 },
        };
        const notifications = [];
        const selectors = createSelectorRuntime({
            getWorldState: () => world,
            definitions: [
                {
                    id: 'player.hp',
                    select(state) {
                        expect(Object.isFrozen(state)).toBe(true);
                        expect(Object.isFrozen(state.player)).toBe(true);
                        return state.player.hp;
                    },
                },
                {
                    id: 'player.health_ratio',
                    select(state) {
                        return state.player.hp / state.player.maxHp;
                    },
                },
            ],
        });

        selectors.subscribe('player.hp', (next, previous) => {
            notifications.push([next, previous]);
        });

        expect(selectors.snapshot()).toEqual({
            'player.hp': 10,
            'player.health_ratio': 0.5,
        });
        expect(selectors.refresh()).toEqual([]);

        world = {
            player: { hp: 7, maxHp: 20 },
            hidden: { secret: 123 },
        };
        expect(selectors.refresh()).toEqual(['player.hp', 'player.health_ratio']);
        expect(selectors.get('player.hp')).toBe(7);
        expect(notifications).toEqual([[7, 10]]);
    });

    test('does not expose undeclared world paths', () => {
        const selectors = createSelectorRuntime({
            getWorldState: () => ({ hp: 10, secret: 42 }),
            definitions: [{ id: 'hp', select: state => state.hp }],
        });

        expect(selectors.list()).toEqual(['hp']);
        expect(() => selectors.get('secret')).toThrow(/Unknown selector/);
    });
});
