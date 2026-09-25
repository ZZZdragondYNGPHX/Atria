import { describe, expect, test } from '@jest/globals';

import { createWorldObservationProjector } from '../../public/scripts/native/experience/llm/observation.js';

describe('R5 World Observation projection', () => {
    test('exposes explicit projections instead of raw World State', () => {
        const projector = createWorldObservationProjector({
            projectors: [
                {
                    id: 'scene',
                    select(world) {
                        expect(Object.isFrozen(world)).toBe(true);
                        expect(Object.isFrozen(world.player)).toBe(true);
                        return {
                            location: world.scene.location,
                            danger: world.scene.danger,
                        };
                    },
                },
                {
                    id: 'player_condition',
                    select: world => ({
                        hp: world.player.hp,
                        maxHp: world.player.maxHp,
                    }),
                },
            ],
        });

        const observation = projector.project({
            world: {
                scene: {
                    location: 'inn',
                    danger: false,
                    internalSeed: 98765,
                },
                player: {
                    hp: 7,
                    maxHp: 10,
                    secretFlag: true,
                },
                hugeHiddenInventory: Array.from({ length: 100 }, (_, index) => index),
            },
        });

        expect(observation.views).toEqual({
            scene: {
                location: 'inn',
                danger: false,
            },
            player_condition: {
                hp: 7,
                maxHp: 10,
            },
        });
        expect(observation.internalSeed).toBeUndefined();
        expect(observation.views.hugeHiddenInventory).toBeUndefined();
        expect(JSON.stringify(observation)).not.toContain('secretFlag');
        expect(JSON.stringify(observation)).not.toContain('98765');
    });

    test('recent Event projection preserves authoritative facts but strips runtime internals', () => {
        const projector = createWorldObservationProjector({
            eventLimit: 2,
        });

        const observation = projector.project({
            world: { hidden: 'never exposed without projector' },
            events: [
                {
                    id: 'event:1',
                    seq: 1,
                    type: 'Moved',
                    payload: { location: 'road' },
                    branchPath: [0],
                    meta: {
                        command: { id: 'move', transactionId: 'tx:1' },
                        rngTrace: [{ value: 0.5 }],
                    },
                },
                {
                    id: 'event:2',
                    seq: 2,
                    type: 'DamageDealt',
                    payload: { amount: 3 },
                    branchPath: [0, 1],
                    meta: {
                        command: { id: 'attack', transactionId: 'tx:2' },
                        rule: { id: 'critical' },
                    },
                },
                {
                    id: 'event:3',
                    seq: 3,
                    type: 'ItemUsed',
                    payload: { item: 'potion' },
                    branchPath: [0, 1],
                    meta: {
                        command: { id: 'use_item', transactionId: 'tx:3' },
                    },
                },
            ],
        });

        expect(observation.views).toEqual({});
        expect(observation.recentEvents).toEqual([
            {
                id: 'event:2',
                type: 'DamageDealt',
                payload: { amount: 3 },
                provenance: {
                    commandId: 'attack',
                    ruleId: 'critical',
                },
            },
            {
                id: 'event:3',
                type: 'ItemUsed',
                payload: { item: 'potion' },
                provenance: {
                    commandId: 'use_item',
                },
            },
        ]);
        expect(JSON.stringify(observation)).not.toContain('branchPath');
        expect(JSON.stringify(observation)).not.toContain('rngTrace');
        expect(JSON.stringify(observation)).not.toContain('transactionId');
    });
});
