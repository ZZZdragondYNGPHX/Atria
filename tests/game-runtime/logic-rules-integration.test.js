import { describe, expect, jest, test } from '@jest/globals';

import { createGameLogicRuntime } from '../../public/scripts/extensions/game-runtime/logic/runtime.js';
import { createSessionWorldTestAdapter } from './helpers/session-world-adapter.js';

function makePersistence() {
    let value = null;
    let writes = 0;
    return {
        async read() {
            return value == null ? null : structuredClone(value);
        },
        async update(updater) {
            const next = await updater(value == null ? null : structuredClone(value));
            value = structuredClone(next);
            writes += 1;
            return structuredClone(value);
        },
        get writes() {
            return writes;
        },
    };
}

const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['hp', 'dead', 'kills'],
    properties: {
        hp: { type: 'integer', minimum: 0, maximum: 20 },
        dead: { type: 'boolean' },
        kills: { type: 'integer', minimum: 0 },
    },
};

const reducers = {
    DamageDealt(state, event) {
        return {
            ...state,
            hp: Math.max(0, state.hp - event.payload.amount),
        };
    },
    EntityDied(state) {
        return { ...state, dead: true };
    },
    QuestKillIncremented(state) {
        return { ...state, kills: state.kills + 1 };
    },
};

const rules = [
    {
        id: 'death',
        on: 'DamageDealt',
        when({ state }) {
            return state.hp === 0 && state.dead === false;
        },
        emit() {
            return [{ type: 'EntityDied', payload: {} }];
        },
    },
    {
        id: 'quest.kill',
        on: 'EntityDied',
        emit() {
            return [{ type: 'QuestKillIncremented', payload: {} }];
        },
    },
];

async function makeRuntime(commands) {
    const persistence = makePersistence();
    const world = createSessionWorldTestAdapter({
        initialState: { hp: 10, dead: false, kills: 0 },
        schema,
        reducers,
        persistence,
    });
    await world.load();
    return {
        persistence,
        world,
        logic: createGameLogicRuntime({
            world,
            commands,
            rules,
            rngSeed: 'rules-integration',
        }),
    };
}

describe('Game Logic validators/rules transaction integration', () => {
    test('semantic validator rejects before command handler and persistence', async () => {
        const execute = jest.fn(() => [{ type: 'DamageDealt', payload: { amount: 1 } }]);
        const { persistence, world, logic } = await makeRuntime([{
            id: 'guarded',
            argsSchema: {
                type: 'object',
                additionalProperties: false,
                properties: {},
            },
            validators: [
                ({ world: state }) => state.dead === false || 'dead actors cannot act',
                () => 'blocked by fixture',
            ],
            execute,
        }]);

        await expect(logic.dispatch('guarded', {})).rejects.toThrow(/blocked by fixture/);
        expect(execute).not.toHaveBeenCalled();
        expect(world.getState()).toEqual({ hp: 10, dead: false, kills: 0 });
        expect(world.getJournal().events).toEqual([]);
        expect(persistence.writes).toBe(0);
    });

    test('derived rule chain commits atomically with trace and provenance', async () => {
        const command = {
            id: 'strike',
            argsSchema: {
                type: 'object',
                additionalProperties: false,
                required: ['amount'],
                properties: {
                    amount: { type: 'integer', minimum: 1, maximum: 20 },
                },
            },
            execute({ args }) {
                return [{ type: 'DamageDealt', payload: { amount: args.amount } }];
            },
        };
        const { persistence, world, logic } = await makeRuntime([command]);

        const result = await logic.dispatch('strike', { amount: 10 });

        expect(result.afterState).toEqual({ hp: 0, dead: true, kills: 1 });
        expect(result.events.map(event => event.type)).toEqual([
            'DamageDealt',
            'EntityDied',
            'QuestKillIncremented',
        ]);
        expect(result.ruleTrace.map(entry => [entry.ruleId, entry.status])).toEqual([
            ['death', 'emitted'],
            ['quest.kill', 'emitted'],
        ]);
        expect(result.events[1].meta).toMatchObject({
            command: {
                id: 'strike',
                transactionId: result.transactionId,
            },
            rule: { id: 'death' },
        });
        expect(result.events[2].meta).toMatchObject({
            command: {
                id: 'strike',
                transactionId: result.transactionId,
            },
            rule: { id: 'quest.kill' },
        });
        expect(world.getState()).toEqual(result.afterState);
        expect(persistence.writes).toBe(1);
    });

    test('simulation follows the same derived-event chain without mutation', async () => {
        const command = {
            id: 'strike',
            argsSchema: {
                type: 'object',
                additionalProperties: false,
                required: ['amount'],
                properties: {
                    amount: { type: 'integer', minimum: 1, maximum: 20 },
                },
            },
            execute({ args }) {
                return [{ type: 'DamageDealt', payload: { amount: args.amount } }];
            },
        };
        const { persistence, world, logic } = await makeRuntime([command]);

        const simulated = await logic.simulate('strike', { amount: 10 });

        expect(simulated.afterState).toEqual({ hp: 0, dead: true, kills: 1 });
        expect(simulated.events.map(event => event.type)).toEqual([
            'DamageDealt',
            'EntityDied',
            'QuestKillIncremented',
        ]);
        expect(simulated.ruleTrace.map(entry => entry.ruleId)).toEqual(['death', 'quest.kill']);
        expect(world.getState()).toEqual({ hp: 10, dead: false, kills: 0 });
        expect(world.getJournal().events).toEqual([]);
        expect(persistence.writes).toBe(0);
    });
});
