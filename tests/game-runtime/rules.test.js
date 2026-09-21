import { describe, expect, test } from '@jest/globals';

import { createRulesEngine } from '../../public/scripts/extensions/game-runtime/logic/rules.js';

function projectEvents(events) {
    const state = { hp: 10, dead: false, kills: 0 };
    for (const event of events) {
        if (event.type === 'DamageDealt') state.hp -= event.payload.amount;
        if (event.type === 'EntityDied') state.dead = true;
        if (event.type === 'QuestKillIncremented') state.kills += 1;
    }
    if (state.hp < 0) state.hp = 0;
    return { state };
}

describe('Game Rules Engine', () => {
    test('applies matching rules in deterministic priority/id order and chains derived events', async () => {
        const engine = createRulesEngine([
            {
                id: 'quest.kill',
                on: 'EntityDied',
                emit() {
                    return [{ type: 'QuestKillIncremented', payload: { amount: 1 } }];
                },
            },
            {
                id: 'death.b',
                on: 'DamageDealt',
                priority: 20,
                when({ state }) {
                    return state.hp <= 0;
                },
                emit() {
                    return [];
                },
            },
            {
                id: 'death.a',
                on: 'DamageDealt',
                priority: 10,
                when({ state }) {
                    return state.hp <= 0;
                },
                emit() {
                    return [{ type: 'EntityDied', payload: {} }];
                },
            },
        ]);

        const result = await engine.process([
            { type: 'DamageDealt', payload: { amount: 12 } },
        ], {
            project: async events => projectEvents(events),
            beforeState: { hp: 10, dead: false, kills: 0 },
            context: { transactionId: 'tx:1' },
        });

        expect(result.events.map(event => event.type)).toEqual([
            'DamageDealt',
            'EntityDied',
            'QuestKillIncremented',
        ]);
        expect(result.state).toEqual({ hp: 0, dead: true, kills: 1 });
        expect(result.trace).toEqual([
            {
                ruleId: 'death.a',
                sourceEventType: 'DamageDealt',
                sourceEventIndex: 0,
                status: 'emitted',
                emittedTypes: ['EntityDied'],
            },
            {
                ruleId: 'death.b',
                sourceEventType: 'DamageDealt',
                sourceEventIndex: 0,
                status: 'no_change',
                emittedTypes: [],
            },
            {
                ruleId: 'quest.kill',
                sourceEventType: 'EntityDied',
                sourceEventIndex: 1,
                status: 'emitted',
                emittedTypes: ['QuestKillIncremented'],
            },
        ]);
    });

    test('records condition-false trace entries', async () => {
        const engine = createRulesEngine([{
            id: 'death',
            on: 'DamageDealt',
            when({ state }) {
                return state.hp <= 0;
            },
            emit() {
                return [{ type: 'EntityDied', payload: {} }];
            },
        }]);

        const result = await engine.process([
            { type: 'DamageDealt', payload: { amount: 2 } },
        ], {
            project: async events => projectEvents(events),
        });

        expect(result.events).toHaveLength(1);
        expect(result.trace[0]).toMatchObject({
            ruleId: 'death',
            status: 'condition_false',
        });
    });

    test('bounded derived-event guard stops cyclic rules deterministically', async () => {
        const engine = createRulesEngine([{
            id: 'cycle',
            on: 'Ping',
            emit() {
                return [{ type: 'Ping', payload: {} }];
            },
        }], { maxDerivedEvents: 3 });

        await expect(engine.process([
            { type: 'Ping', payload: {} },
        ], {
            project: async () => ({ state: {} }),
        })).rejects.toThrow(/maximum derived events/);
    });

    test('rejects malformed rule definitions', () => {
        expect(() => createRulesEngine([{ id: 'bad rule', on: 'X', emit() {} }])).toThrow(/Rule id/);
        expect(() => createRulesEngine([{ id: 'ok', on: [], emit() {} }])).toThrow(/non-empty on/);
        expect(() => createRulesEngine([
            { id: 'same', on: 'X', emit() {} },
            { id: 'same', on: 'Y', emit() {} },
        ])).toThrow(/Duplicate rule id/);
    });
});
