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
