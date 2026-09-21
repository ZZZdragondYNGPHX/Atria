import { describe, expect, jest, test } from '@jest/globals';

import { createGameWorldSession } from '../../public/scripts/extensions/game-runtime/world/session.js';

function response(body) {
    return {
        ok: true,
        status: 200,
        async json() {
            return structuredClone(body);
        },
    };
}

function makeContext(chatRef) {
    const store = new Map();
    return {
        get chat() {
            return chatRef.value;
        },
        async getChatState(namespace) {
            return {
                ok: true,
                state: store.has(namespace) ? structuredClone(store.get(namespace)) : null,
            };
        },
        async updateChatState(namespace, updater) {
            const current = store.has(namespace) ? structuredClone(store.get(namespace)) : null;
            const next = await updater(current);
            if (next === null || next === undefined) {
                store.delete(namespace);
            } else {
                store.set(namespace, structuredClone(next));
            }
            return {
                ok: true,
                state: store.has(namespace) ? structuredClone(store.get(namespace)) : null,
                updated: true,
            };
        },
        async deleteChatState(namespace) {
            store.delete(namespace);
            return { ok: true };
        },
        _store: store,
    };
}

const packageState = {
    status: 'ready',
    active: true,
    charId: 'hero',
    manifest: {
        world: {
            schema: 'world/schema.json',
            initial: 'world/initial.json',
        },
    },
};

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
            properties: {
                amount: { type: 'integer', minimum: 1, maximum: 20 },
            },
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
            properties: {
                amount: { type: 'integer', minimum: 1, maximum: 20 },
            },
        },
        execute({ args }) {
            return [{ type: 'Healed', payload: { amount: args.amount } }];
        },
    },
];

describe('Game World session', () => {
    test('loads package world, persists journal, and follows swipe branch changes', async () => {
        const chatRef = { value: [{ swipe_id: 0 }, { swipe_id: 0 }] };
        const context = makeContext(chatRef);
        const fetchImpl = jest.fn(async (url) => {
            if (url.endsWith('/world/schema.json')) return response(schema);
            if (url.endsWith('/world/initial.json')) return response({ hp: 20 });
            throw new Error('unexpected URL ' + url);
        });

        const session = await createGameWorldSession({
            packageState,
            context,
            getChat: () => chatRef.value,
            fetchImpl,
            reducers,
        });

        expect(session.getState()).toEqual({ hp: 20 });
        await session.commitEventsInternal([
            { type: 'DamageDealt', payload: { amount: 5 } },
        ]);
        expect(session.getState()).toEqual({ hp: 15 });

        chatRef.value = [{ swipe_id: 0 }, { swipe_id: 1 }];
        await session.syncBranch();
        expect(session.getState()).toEqual({ hp: 20 });

        await session.commitEventsInternal([
            { type: 'Healed', payload: { amount: 7 } },
        ]);
        expect(session.getState()).toEqual({ hp: 27 });

        chatRef.value = [{ swipe_id: 0 }, { swipe_id: 0 }];
        await session.syncBranch();
        expect(session.getState()).toEqual({ hp: 15 });
        expect(session.getJournal().events).toHaveLength(2);
    });

    test('a fresh session reloads the selected branch from the persisted journal', async () => {
        const chatRef = { value: [{ swipe_id: 0 }] };
        const context = makeContext(chatRef);
        const fetchImpl = jest.fn(async (url) => {
            if (url.endsWith('/world/schema.json')) return response(schema);
            return response({ hp: 20 });
        });

        const first = await createGameWorldSession({
            packageState,
            context,
            getChat: () => chatRef.value,
            fetchImpl,
            reducers,
        });
        await first.commitEventsInternal([
            { type: 'DamageDealt', payload: { amount: 4 } },
        ]);

        const second = await createGameWorldSession({
            packageState,
            context,
            getChat: () => chatRef.value,
            fetchImpl,
            reducers,
        });

        expect(second.getState()).toEqual({ hp: 16 });
        expect(second.getJournal().events).toHaveLength(1);
    });

    test('dispatches typed commands and simulates without committing', async () => {
        const chatRef = { value: [{ swipe_id: 0 }] };
        const context = makeContext(chatRef);
        const fetchImpl = jest.fn(async (url) => {
            if (url.endsWith('/world/schema.json')) return response(schema);
            return response({ hp: 20 });
        });

        const session = await createGameWorldSession({
            packageState,
            context,
            getChat: () => chatRef.value,
            fetchImpl,
            reducers,
            commands,
        });

        expect(session.getCommands().map(command => command.id)).toEqual(['damage', 'heal']);

        const committed = await session.dispatchCommandInternal('damage', { amount: 5 });
        expect(committed).toMatchObject({
            status: 'committed',
            afterState: { hp: 15 },
        });
        expect(session.getState()).toEqual({ hp: 15 });
        expect(session.getJournal().events).toHaveLength(1);

        const simulated = await session.simulateCommandInternal('heal', { amount: 4 });
        expect(simulated).toMatchObject({
            status: 'simulated',
            beforeState: { hp: 15 },
            afterState: { hp: 19 },
            committed: false,
        });
        expect(session.getState()).toEqual({ hp: 15 });
        expect(session.getJournal().events).toHaveLength(1);
    });

    test('exposes deterministic interpretation mappings without executing them', async () => {
        const chatRef = { value: [{ swipe_id: 0 }] };
        const context = makeContext(chatRef);
        const fetchImpl = jest.fn(async (url) => {
            if (url.endsWith('/world/schema.json')) return response(schema);
            return response({ hp: 20 });
        });
        const interpretations = [{
            eventType: 'implicit_threat',
            map() {
                return {
                    id: 'damage',
                    args: { amount: 1 },
                };
            },
        }];

        const session = await createGameWorldSession({
            packageState,
            context,
            getChat: () => chatRef.value,
            fetchImpl,
            reducers,
            commands,
            interpretations,
        });

        expect(session.getInterpretationMappings()).toHaveLength(1);
        expect(session.getInterpretationMappings()[0].eventType).toBe('implicit_threat');
        expect(session.getState()).toEqual({ hp: 20 });
        expect(session.getJournal().events).toHaveLength(0);
    });

    test('typed reducer payload validation aborts an invalid command transaction', async () => {
        const chatRef = { value: [{ swipe_id: 0 }] };
        const context = makeContext(chatRef);
        const fetchImpl = jest.fn(async (url) => {
            if (url.endsWith('/world/schema.json')) return response(schema);
            return response({ hp: 20 });
        });
        const typedReducers = {
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
                    return { hp: state.hp - event.payload.amount };
                },
            },
        };
        const badCommand = [{
            id: 'bad_damage',
            execute() {
                return [{ type: 'DamageDealt', payload: { amount: 'five' } }];
            },
        }];

        const session = await createGameWorldSession({
            packageState,
            context,
            getChat: () => chatRef.value,
            fetchImpl,
            reducers: typedReducers,
            commands: badCommand,
        });

        expect(session.getEventTypes()).toEqual([{
            type: 'DamageDealt',
            payloadSchema: typedReducers.DamageDealt.payloadSchema,
        }]);
        await expect(
            session.dispatchCommandInternal('bad_damage', {}),
        ).rejects.toThrow(/payload validation failed/);
        expect(session.getState()).toEqual({ hp: 20 });
        expect(session.getJournal().events).toHaveLength(0);
        expect(context._store.has('atri_game_world')).toBe(false);
    });

    test('returns null for packages without a World definition', async () => {
        const chatRef = { value: [] };
        const context = makeContext(chatRef);
        const session = await createGameWorldSession({
            packageState: {
                ...packageState,
                manifest: {},
            },
            context,
            getChat: () => chatRef.value,
        });

        expect(session).toBeNull();
    });
});
