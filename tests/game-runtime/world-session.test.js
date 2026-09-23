import { describe, expect, jest, test } from '@jest/globals';

import {
    GAME_RUNTIME_STATE_NAMESPACE,
    createGameWorldSession,
} from '../../public/scripts/extensions/game-runtime/world/session.js';

const worldId = 'world_0123456789abcdef0123456789abcdef';
const worldRevisionId = 'worldRevision_0123456789abcdef0123456789abcdef';

const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['hp'],
    properties: {
        hp: { type: 'integer', minimum: 0, maximum: 100 },
    },
};

const reducers = {
    DamageDealt: {
        payloadSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['amount'],
            properties: { amount: { type: 'integer', minimum: 1, maximum: 20 } },
        },
        reduce(state, event) {
            return { hp: state.hp - event.payload.amount };
        },
    },
    Healed(state, event) {
        return { hp: state.hp + event.payload.amount };
    },
};

const commands = [
    {
        id: 'damage',
        argsSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['amount'],
            properties: { amount: { type: 'integer', minimum: 1, maximum: 20 } },
        },
        execute({ args }) {
            return [{ type: 'DamageDealt', payload: { amount: args.amount } }];
        },
    },
    {
        id: 'heal',
        argsSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['amount'],
            properties: { amount: { type: 'integer', minimum: 1, maximum: 20 } },
        },
        execute({ args }) {
            return [{ type: 'Healed', payload: { amount: args.amount } }];
        },
    },
];

function snapshot({ branchId = 'branch_root', revisionId = 'revision_1', hp = 20, runtime = null } = {}) {
    return {
        session: { sessionId: 'session_game' },
        revision: { branchId, revisionId },
        states: {
            atri_world_state: {
                primaryWorldId: worldId,
                worlds: {
                    [worldId]: {
                        worldRevisionId,
                        state: { hp },
                    },
                },
            },
            ...(runtime ? { [GAME_RUNTIME_STATE_NAMESPACE]: structuredClone(runtime) } : {}),
        },
        worlds: [{
            world: { worldId, displayName: 'World' },
            revision: {
                worldId,
                worldRevisionId,
                schema,
                baseline: { hp: 20 },
                knowledgeBindingIds: [],
                assetIds: [],
                metadata: {},
            },
        }],
    };
}

function makeNativeRuntime(initial = snapshot()) {
    let revisionSerial = 1;
    const runtime = {
        active: true,
        snapshot: structuredClone(initial),
        commitStatePatch: jest.fn(async (statePatch, { deleteNamespaces = [] } = {}) => {
            const states = {
                ...runtime.snapshot.states,
                ...structuredClone(statePatch),
            };
            for (const namespace of deleteNamespaces) delete states[namespace];
            revisionSerial += 1;
            runtime.snapshot = {
                ...runtime.snapshot,
                revision: {
                    ...runtime.snapshot.revision,
                    revisionId: 'revision_' + revisionSerial,
                },
                states,
            };
            return structuredClone(runtime.snapshot);
        }),
    };
    return runtime;
}

const packageState = {
    descriptor: {
        packageVersionId: 'packageVersion_runtime',
        entryPointId: 'entryPoint_runtime',
    },
    runtime: {
        experience: { mode: 'text' },
        game: {},
        primaryWorldId: worldId,
    },
};

describe('A3 Native Game World session', () => {
    test('commits World state and event projection through one Native Session revision', async () => {
        const nativeRuntime = makeNativeRuntime();
        const session = await createGameWorldSession({
            packageState,
            nativeRuntime,
            reducers,
            commands,
        });

        expect(session.getState()).toEqual({ hp: 20 });
        const committed = await session.dispatchCommandInternal('damage', { amount: 5 });

        expect(committed).toMatchObject({
            status: 'committed',
            beforeState: { hp: 20 },
            afterState: { hp: 15 },
            branchId: 'branch_root',
        });
        expect(session.getState()).toEqual({ hp: 15 });
        expect(nativeRuntime.commitStatePatch).toHaveBeenCalledTimes(1);
        expect(nativeRuntime.snapshot.states.atri_world_state.worlds[worldId]).toEqual({
            worldRevisionId,
            state: { hp: 15 },
        });
        expect(nativeRuntime.snapshot.states[GAME_RUNTIME_STATE_NAMESPACE]).toMatchObject({
            schemaVersion: 1,
            nextEventSeq: 2,
            events: [{
                id: 'event:branch_root:1',
                type: 'DamageDealt',
                branchId: 'branch_root',
                payload: { amount: 5 },
            }],
        });
    });

    test('simulation reuses reducers/rules without publishing a SessionRevision', async () => {
        const nativeRuntime = makeNativeRuntime();
        const session = await createGameWorldSession({
            packageState,
            nativeRuntime,
            reducers,
            commands,
        });

        const simulated = await session.simulateCommandInternal('heal', { amount: 4 });
        expect(simulated).toMatchObject({
            status: 'simulated',
            beforeState: { hp: 20 },
            afterState: { hp: 24 },
            committed: false,
            branchId: 'branch_root',
            revisionId: 'revision_1',
        });
        expect(nativeRuntime.commitStatePatch).not.toHaveBeenCalled();
        expect(session.getState()).toEqual({ hp: 20 });
        expect(session.getJournal().events).toEqual([]);
    });

    test('reads branch/revision authority directly from the active Native snapshot', async () => {
        const nativeRuntime = makeNativeRuntime();
        const session = await createGameWorldSession({
            packageState,
            nativeRuntime,
            reducers,
            commands,
        });
        expect(session.getBranchId()).toBe('branch_root');
        expect(session.getRevisionId()).toBe('revision_1');

        nativeRuntime.snapshot = snapshot({
            branchId: 'branch_retry',
            revisionId: 'revision_retry',
            hp: 31,
            runtime: {
                schemaVersion: 1,
                nextEventSeq: 2,
                events: [{
                    id: 'event:branch_retry:1',
                    seq: 1,
                    type: 'Healed',
                    payload: { amount: 11 },
                    branchId: 'branch_retry',
                }],
            },
        });

        expect(await session.syncBranch()).toMatchObject({
            branchId: 'branch_retry',
            revisionId: 'revision_retry',
            state: { hp: 31 },
        });
        expect(session.getState()).toEqual({ hp: 31 });
        expect(session.getJournal().events).toEqual([
            expect.objectContaining({ id: 'event:branch_retry:1', branchId: 'branch_retry' }),
        ]);
    });

    test('typed reducer validation aborts before Native state commit', async () => {
        const nativeRuntime = makeNativeRuntime();
        const session = await createGameWorldSession({
            packageState,
            nativeRuntime,
            reducers,
            commands: [{
                id: 'bad_damage',
                execute() {
                    return [{ type: 'DamageDealt', payload: { amount: 'five' } }];
                },
            }],
        });

        await expect(session.dispatchCommandInternal('bad_damage', {}))
            .rejects.toThrow(/payload validation failed/);
        expect(nativeRuntime.commitStatePatch).not.toHaveBeenCalled();
        expect(session.getState()).toEqual({ hp: 20 });
    });

    test('keeps interpretation mappings as mature algorithm inputs without separate authority', async () => {
        const nativeRuntime = makeNativeRuntime();
        const interpretations = [{ eventType: 'implicit_threat', map: () => ({ id: 'damage', args: { amount: 1 } }) }];
        const session = await createGameWorldSession({
            packageState,
            nativeRuntime,
            reducers,
            commands,
            interpretations,
        });
        expect(session.getInterpretationMappings()).toEqual(interpretations);
        expect(nativeRuntime.commitStatePatch).not.toHaveBeenCalled();
    });
});
