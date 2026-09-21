import { describe, expect, test } from '@jest/globals';

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
    required: ['player', 'quests'],
    properties: {
        player: {
            type: 'object',
            additionalProperties: false,
            required: ['hp'],
            properties: {
                hp: { type: 'integer', minimum: 0, maximum: 100 },
            },
        },
        quests: {
            type: 'array',
            items: { type: 'string' },
        },
    },
};

const initialState = {
    player: { hp: 20 },
    quests: [],
};

const reducers = {
    DamageDealt(state, event) {
        return {
            ...state,
            player: {
                hp: state.player.hp - event.payload.amount,
            },
        };
    },
    QuestAccepted(state, event) {
        return {
            ...state,
            quests: [...state.quests, event.payload.id],
        };
    },
    CorruptState(state) {
        return { ...state, player: { hp: -999 } };
    },
};

describe('World Runtime transaction/replay foundation', () => {
    test('commits event history atomically and reloads identical world state', async () => {
        const persistence = makePersistence();
        const runtime = createWorldRuntime({
            initialState,
            schema,
            reducers,
            persistence,
            snapshotEvery: 2,
        });

        await runtime.load([0]);
        const committed = await runtime.commitEvents([
            { type: 'DamageDealt', payload: { amount: 4 } },
            { type: 'QuestAccepted', payload: { id: 'intro' } },
        ], { branchPath: [0, 0] });

        expect(committed.state).toEqual({
            player: { hp: 16 },
            quests: ['intro'],
        });
        expect(persistence.writes).toBe(1);
        expect(persistence.inspect().events).toHaveLength(2);
        expect(persistence.inspect().snapshots).toHaveLength(1);

        const reloaded = createWorldRuntime({
            initialState,
            schema,
            reducers,
            persistence,
            snapshotEvery: 2,
        });
        const loaded = await reloaded.load([0, 0, 0]);
        expect(loaded.state).toEqual(committed.state);
    });

    test('branch switching selects authoritative facts without deleting alternate history', async () => {
        const persistence = makePersistence();
        const runtime = createWorldRuntime({ initialState, schema, reducers, persistence });

        await runtime.load([0]);
        await runtime.commitEvents([
            { type: 'DamageDealt', payload: { amount: 7 } },
        ], { branchPath: [0, 0] });
        await runtime.commitEvents([
            { type: 'QuestAccepted', payload: { id: 'alternate' } },
        ], { branchPath: [0, 1] });

        expect((await runtime.switchBranch([0, 0, 0])).state).toEqual({
            player: { hp: 13 },
            quests: [],
        });
        expect((await runtime.switchBranch([0, 1, 0])).state).toEqual({
            player: { hp: 20 },
            quests: ['alternate'],
        });
        expect(runtime.getJournal().events).toHaveLength(2);
    });

    test('schema failure aborts persistence with no partial mutation', async () => {
        const persistence = makePersistence();
        const runtime = createWorldRuntime({ initialState, schema, reducers, persistence });
        await runtime.load([0]);

        await expect(runtime.commitEvents([
            { type: 'CorruptState', payload: {} },
        ], { branchPath: [0] })).rejects.toThrow(/World State validation failed/);

        expect(persistence.writes).toBe(0);
        expect(persistence.inspect()).toBeNull();
        expect(runtime.getState()).toEqual(initialState);
    });
});
