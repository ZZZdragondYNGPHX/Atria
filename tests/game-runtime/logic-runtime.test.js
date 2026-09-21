import { describe, expect, test } from '@jest/globals';

import { createGameLogicRuntime } from '../../public/scripts/extensions/game-runtime/logic/runtime.js';
import { createWorldRuntime } from '../../public/scripts/extensions/game-runtime/world/runtime.js';

function makePersistence(seed = null) {
    let value = seed == null ? null : structuredClone(seed);
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
        inspect() {
            return value == null ? null : structuredClone(value);
        },
        get writes() {
            return writes;
        },
    };
}

const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['hp'],
    properties: {
        hp: { type: 'integer', minimum: 0, maximum: 100 },
    },
};

const reducers = {
    DamageDealt(state, event) {
        return { hp: state.hp - event.payload.amount };
    },
    CorruptState() {
        return { hp: -999 };
    },
};

const commands = [
    {
        id: 'damage',
        argsSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['amount'],
            properties: {
                amount: { type: 'integer', minimum: 1, maximum: 20 },
            },
        },
        execute({ args, world }) {
            expect(Object.isFrozen(args)).toBe(true);
            expect(Object.isFrozen(world)).toBe(true);
            return [{
                type: 'DamageDealt',
                payload: { amount: args.amount },
            }];
        },
    },
    {
        id: 'broken_combo',
        argsSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {},
        },
        execute() {
            return [
                { type: 'DamageDealt', payload: { amount: 3 } },
                { type: 'CorruptState', payload: {} },
            ];
        },
    },
    {
        id: 'roll_damage',
        argsSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {},
        },
        execute({ rng }) {
            return [{
                type: 'DamageDealt',
                payload: { amount: rng.int(1, 6) },
            }];
        },
    },
    {
        id: 'noop',
        execute() {
            return [];
        },
    },
];

async function makeRuntime() {
    const persistence = makePersistence();
    const world = createWorldRuntime({
        initialState: { hp: 20 },
        schema,
        reducers,
        persistence,
    });
    await world.load([0]);

    const logic = createGameLogicRuntime({ world, commands });
    return { persistence, world, logic };
}

describe('Game Logic Runtime command transaction', () => {
    test('validated command emits events and commits through World Runtime', async () => {
        const { persistence, world, logic } = await makeRuntime();

        const result = await logic.dispatch('damage', { amount: 5 });

        expect(result).toMatchObject({
            ok: true,
            status: 'committed',
            commandId: 'damage',
            beforeState: { hp: 20 },
            afterState: { hp: 15 },
            committed: true,
        });
        expect(result.events).toHaveLength(1);
        expect(result.events[0]).toMatchObject({
            type: 'DamageDealt',
            payload: { amount: 5 },
        });
        expect(world.getState()).toEqual({ hp: 15 });
        expect(persistence.writes).toBe(1);
    });

    test('invalid arguments fail before command execution or persistence', async () => {
        const { persistence, world, logic } = await makeRuntime();

        await expect(logic.dispatch('damage', { amount: 0 })).rejects.toThrow(/validation failed/);

        expect(world.getState()).toEqual({ hp: 20 });
        expect(world.getJournal().events).toHaveLength(0);
        expect(persistence.writes).toBe(0);
    });

    test('multi-event schema failure aborts the entire transaction', async () => {
        const { persistence, world, logic } = await makeRuntime();

        await expect(logic.dispatch('broken_combo', {})).rejects.toThrow(/World State validation failed/);

        expect(world.getState()).toEqual({ hp: 20 });
        expect(world.getJournal().events).toHaveLength(0);
        expect(persistence.inspect()).toBeNull();
        expect(persistence.writes).toBe(0);
    });

    test('simulation projects the same event path without persistent mutation', async () => {
        const { persistence, world, logic } = await makeRuntime();

        const simulated = await logic.simulate('damage', { amount: 5 });

        expect(simulated).toMatchObject({
            ok: true,
            status: 'simulated',
            commandId: 'damage',
            beforeState: { hp: 20 },
            afterState: { hp: 15 },
            committed: false,
        });
        expect(simulated.events).toHaveLength(1);
        expect(world.getState()).toEqual({ hp: 20 });
        expect(world.getJournal().events).toHaveLength(0);
        expect(persistence.writes).toBe(0);
    });

    test('simulation and immediate commit consume the same deterministic RNG outcome', async () => {
        const { persistence, world, logic } = await makeRuntime();

        const simulated = await logic.simulate('roll_damage', {});
        const committed = await logic.dispatch('roll_damage', {});

        expect(committed.afterState).toEqual(simulated.afterState);
        expect(committed.events[0].payload).toEqual(simulated.events[0].payload);
        expect(committed.rngTrace).toEqual(simulated.rngTrace);
        expect(committed.rngTrace).toEqual([
            expect.objectContaining({
                stream: 'default',
                operation: 'int',
                minimum: 1,
                maximum: 6,
            }),
        ]);

        const event = world.getJournal().events[0];
        expect(event.meta).toEqual({
            command: {
                id: 'roll_damage',
                transactionId: committed.transactionId,
            },
            rngTrace: committed.rngTrace,
        });
        expect(persistence.writes).toBe(1);

        const reloaded = createWorldRuntime({
            initialState: { hp: 20 },
            schema,
            reducers,
            persistence,
        });
        const replayed = await reloaded.load([0]);
        expect(replayed.state).toEqual(committed.afterState);
        expect(reloaded.getJournal().events[0].payload).toEqual(committed.events[0].payload);
    });

    test('zero-event command is a no-change transaction and does not write', async () => {
        const { persistence, world, logic } = await makeRuntime();

        const result = await logic.dispatch('noop', {});

        expect(result).toMatchObject({
            status: 'no_change',
            beforeState: { hp: 20 },
            afterState: { hp: 20 },
            events: [],
            committed: false,
        });
        expect(persistence.writes).toBe(0);
    });
});
