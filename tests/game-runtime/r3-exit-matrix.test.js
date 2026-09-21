import { describe, expect, test } from '@jest/globals';

import { createGameLogicRuntime } from '../../public/scripts/extensions/game-runtime/logic/runtime.js';
import { createReducerRegistry } from '../../public/scripts/extensions/game-runtime/logic/reducers.js';
import { createWorldRuntime } from '../../public/scripts/extensions/game-runtime/world/runtime.js';

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
    required: ['hp', 'dead', 'score'],
    properties: {
        hp: { type: 'integer', minimum: 0, maximum: 20 },
        dead: { type: 'boolean' },
        score: { type: 'integer', minimum: 0 },
    },
};

const reducerRegistry = createReducerRegistry({
    DamageDealt: {
        payloadSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['amount'],
            properties: {
                amount: { type: 'integer', minimum: 1, maximum: 20 },
            },
        },
        reduce(state, event) {
            return {
                ...state,
                hp: Math.max(0, state.hp - event.payload.amount),
            };
        },
    },
    EntityDied: {
        payloadSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {},
        },
        reduce(state) {
            return { ...state, dead: true };
        },
    },
    ScoreAwarded: {
        payloadSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['amount'],
            properties: {
                amount: { type: 'integer', minimum: 1, maximum: 100 },
            },
        },
        reduce(state, event) {
            return { ...state, score: state.score + event.payload.amount };
        },
    },
});

const command = {
    id: 'strike',
    argsSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['bonus'],
        properties: {
            bonus: { type: 'integer', minimum: 0, maximum: 3 },
        },
    },
    validators: [
        ({ world }) => world.dead === false || 'dead actors cannot strike',
    ],
    execute({ args, formula }) {
        const amount = formula.evaluate('rng.int(7, 9) + args.bonus');
        return [{ type: 'DamageDealt', payload: { amount } }];
    },
};

const rules = [
    {
        id: 'death',
        on: 'DamageDealt',
        priority: 10,
        when({ state }) {
            return state.hp === 0 && state.dead === false;
        },
        emit() {
            return [{ type: 'EntityDied', payload: {} }];
        },
    },
    {
        id: 'award',
        on: 'EntityDied',
        priority: 20,
        emit({ rng }) {
            return [{
                type: 'ScoreAwarded',
                payload: { amount: rng.stream('score').int(5, 7) },
            }];
        },
    },
];

async function createFixture(persistence) {
    const world = createWorldRuntime({
        initialState: { hp: 10, dead: false, score: 0 },
        schema,
        reducers: reducerRegistry.toMap(),
        persistence,
    });
    await world.load([0]);

    const logic = createGameLogicRuntime({
        world,
        commands: [command],
        rules,
        rngSeed: 'r3-exit-matrix',
    });

    return { world, logic };
}

describe('R3 Game Logic Runtime exit matrix', () => {
    test('simulation and commit produce identical deterministic transaction output, while simulation does not persist', async () => {
        const persistence = makePersistence();
        const { world, logic } = await createFixture(persistence);

        const simulated = await logic.simulate('strike', { bonus: 2 });

        expect(simulated.status).toBe('simulated');
        expect(simulated.committed).toBe(false);
        expect(simulated.events.map(event => event.type)).toEqual([
            'DamageDealt',
            'EntityDied',
            'ScoreAwarded',
        ]);
        expect(simulated.ruleTrace.map(entry => [entry.ruleId, entry.status])).toEqual([
            ['death', 'emitted'],
            ['award', 'emitted'],
        ]);
        expect(world.getState()).toEqual({ hp: 10, dead: false, score: 0 });
        expect(world.getJournal().events).toEqual([]);
        expect(persistence.writes).toBe(0);

        const committed = await logic.dispatch('strike', { bonus: 2 });

        expect(committed.status).toBe('committed');
        expect(committed.afterState).toEqual(simulated.afterState);
        expect(committed.events.map(event => ({
            type: event.type,
            payload: event.payload,
        }))).toEqual(simulated.events.map(event => ({
            type: event.type,
            payload: event.payload,
        })));
        expect(committed.rngTrace).toEqual(simulated.rngTrace);
        expect(committed.ruleTrace).toEqual(simulated.ruleTrace);
        expect(persistence.writes).toBe(1);
    });

    test('committed derived-event transaction replays to the same authoritative state', async () => {
        const persistence = makePersistence();
        const first = await createFixture(persistence);
        const committed = await first.logic.dispatch('strike', { bonus: 2 });

        const reloaded = createWorldRuntime({
            initialState: { hp: 10, dead: false, score: 0 },
            schema,
            reducers: reducerRegistry.toMap(),
            persistence,
        });
        const replayed = await reloaded.load([0]);

        expect(replayed.state).toEqual(committed.afterState);
        expect(reloaded.getJournal().events.map(event => event.type)).toEqual([
            'DamageDealt',
            'EntityDied',
            'ScoreAwarded',
        ]);
        expect(reloaded.getJournal().events[0].meta).toMatchObject({
            command: {
                id: 'strike',
                transactionId: committed.transactionId,
            },
            rngTrace: committed.rngTrace,
        });
        expect(reloaded.getJournal().events[1].meta.rule).toEqual({ id: 'death' });
        expect(reloaded.getJournal().events[2].meta.rule).toEqual({ id: 'award' });
    });

    test('failed command leaves no partial mutation or persistence', async () => {
        const persistence = makePersistence();
        const { world, logic } = await createFixture(persistence);

        await expect(logic.dispatch('strike', { bonus: 99 })).rejects.toMatchObject({
            code: 'COMMAND_ARGUMENTS_INVALID',
            stage: 'arguments',
            commandId: 'strike',
        });

        expect(world.getState()).toEqual({ hp: 10, dead: false, score: 0 });
        expect(world.getJournal().events).toEqual([]);
        expect(persistence.inspect()).toBeNull();
        expect(persistence.writes).toBe(0);
    });
});
