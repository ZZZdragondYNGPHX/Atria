import { describe, expect, test } from '@jest/globals';

import { GAME_LOGIC_ERROR_CODES, GameLogicError } from '../../public/scripts/extensions/game-runtime/logic/errors.js';
import { createGameLogicRuntime } from '../../public/scripts/extensions/game-runtime/logic/runtime.js';
import { createSessionWorldTestAdapter } from './helpers/session-world-adapter.js';

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
            if (!Object.isFrozen(args) || !Object.isFrozen(world)) {
                throw new Error('Game Logic command inputs must be frozen');
            }
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
        id: 'formula_damage',
        argsSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['base'],
            properties: {
                base: { type: 'integer', minimum: 1, maximum: 10 },
            },
        },
        execute({ formula }) {
            const amount = formula.evaluate(
                'clamp(args.base + rng.int(1, 3), 1, world.hp)',
            );
            return [{ type: 'DamageDealt', payload: { amount } }];
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
    const world = createSessionWorldTestAdapter({
        initialState: { hp: 20 },
        schema,
        reducers,
        persistence,
    });
    await world.load();

    const nativeWorld = {
        ...world,
        getSnapshot() {
            return {
                ...world.getSnapshot(),
                branchId: 'branch_test',
                revisionId: 'revision_test',
            };
        },
    };
    const logic = createGameLogicRuntime({ world: nativeWorld, commands });
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
            command: {
                id: 'damage',
                args: { amount: 5 },
            },
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

        let error;
        try {
            await logic.dispatch('damage', { amount: 0 });
        } catch (caught) {
            error = caught;
        }

        expect(error).toBeInstanceOf(GameLogicError);
        const serialized = error.toJSON();
        expect(serialized).toMatchObject({
            code: GAME_LOGIC_ERROR_CODES.COMMAND_ARGUMENTS_INVALID,
            stage: 'arguments',
            commandId: 'damage',
            transactionId: null,
        });
        expect(Array.isArray(serialized.details?.errors)).toBe(true);
        expect(serialized.details.errors.length).toBeGreaterThan(0);
        expect(error.message).toMatch(/validation failed/);

        expect(world.getState()).toEqual({ hp: 20 });
        expect(world.getJournal().events).toHaveLength(0);
        expect(persistence.writes).toBe(0);
    });

    test('multi-event schema failure aborts the entire transaction', async () => {
        const { persistence, world, logic } = await makeRuntime();

        let error;
        try {
            await logic.dispatch('broken_combo', {});
        } catch (caught) {
            error = caught;
        }

        expect(error).toBeInstanceOf(GameLogicError);
        expect(error).toMatchObject({
            code: GAME_LOGIC_ERROR_CODES.COMMIT_FAILED,
            stage: 'commit',
            commandId: 'broken_combo',
        });
        expect(error.transactionId).toMatch(/^tx:/);
        expect(error.message).toMatch(/World State validation failed/);

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

        const reloaded = createSessionWorldTestAdapter({
            initialState: { hp: 20 },
            schema,
            reducers,
            persistence,
        });
        const replayed = await reloaded.load();
        expect(replayed.state).toEqual(committed.afterState);
        expect(reloaded.getJournal().events[0].payload).toEqual(committed.events[0].payload);
    });

    test('safe Formula API can consume command args, world state, and transaction RNG', async () => {
        const { persistence, world, logic } = await makeRuntime();

        const simulated = await logic.simulate('formula_damage', { base: 2 });
        const committed = await logic.dispatch('formula_damage', { base: 2 });

        expect(simulated.events[0].payload.amount).toBeGreaterThanOrEqual(3);
        expect(simulated.events[0].payload.amount).toBeLessThanOrEqual(5);
        expect(committed.events[0].payload).toEqual(simulated.events[0].payload);
        expect(committed.rngTrace).toEqual(simulated.rngTrace);
        expect(world.getState()).toEqual(committed.afterState);
        expect(persistence.writes).toBe(1);
    });

    test('simulation and commit share one transaction queue without overlap', async () => {
        const persistence = makePersistence();
        const world = createSessionWorldTestAdapter({
            initialState: { hp: 20 },
            schema,
            reducers,
            persistence,
        });
        await world.load();

        let entered = 0;
        let releaseFirst;
        let markStarted;
        const firstStarted = new Promise(resolve => {
            markStarted = resolve;
        });
        const firstGate = new Promise(resolve => {
            releaseFirst = resolve;
        });
        const logic = createGameLogicRuntime({
            world: {
                ...world,
                getSnapshot() {
                    return {
                        ...world.getSnapshot(),
                        branchId: 'branch_test',
                        revisionId: 'revision_test',
                    };
                },
            },
            commands: [{
                id: 'queued_damage',
                async execute() {
                    entered += 1;
                    if (entered === 1) {
                        markStarted();
                        await firstGate;
                    }
                    return [{ type: 'DamageDealt', payload: { amount: 1 } }];
                },
            }],
        });

        const simulation = logic.simulate('queued_damage', {});
        await firstStarted;
        const commit = logic.dispatch('queued_damage', {});
        await Promise.resolve();
        expect(entered).toBe(1);

        releaseFirst();
        const simulated = await simulation;
        const committed = await commit;

        expect(entered).toBe(2);
        expect(simulated.committed).toBe(false);
        expect(committed.committed).toBe(true);
        expect(world.getState()).toEqual({ hp: 19 });
        expect(persistence.writes).toBe(1);
    });

    test('zero-event command is a no-change transaction and does not write', async () => {
        const { persistence, logic } = await makeRuntime();

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
