import { describe, expect, jest, test } from '@jest/globals';

import { loadGameLogicDefinition } from '../../public/scripts/extensions/game-runtime/logic/package.js';

function response(body) {
    return {
        ok: true,
        status: 200,
        async json() {
            return structuredClone(body);
        },
    };
}

const packageState = {
    charId: 'hero',
    manifest: {
        logic: {
            entry: 'logic/game.json',
        },
    },
};

describe('Game Package logic loading', () => {
    test('compiles declarative package logic into shared runtime contracts', async () => {
        const fetchImpl = jest.fn(async (url) => {
            expect(url).toBe('/api/card-app/hero/logic/game.json');
            return response({
                commands: [{
                    id: 'rest',
                    events: [{
                        type: 'Rested',
                        payload: {},
                    }],
                }],
                reducers: [{
                    type: 'Rested',
                    assign: {
                        rested: true,
                    },
                }],
                rules: [],
            });
        });

        const definition = await loadGameLogicDefinition(packageState, { fetchImpl });

        expect(definition.source).toEqual({
            kind: 'declarative',
            entry: 'logic/game.json',
        });
        expect(definition.commands).toHaveLength(1);
        expect(definition.reducers).toHaveLength(1);
        expect(definition.rules).toEqual([]);
        expect(definition.commands[0].id).toBe('rest');
        expect(definition.reducers[0].type).toBe('Rested');
    });

    test('packages without logic produce an empty runtime definition', async () => {
        await expect(loadGameLogicDefinition({
            charId: 'hero',
            manifest: {},
        })).resolves.toEqual({
            commands: [],
            reducers: [],
            rules: [],
            source: null,
        });
    });

    test('advanced JavaScript package logic fails closed until restricted execution exists', async () => {
        await expect(loadGameLogicDefinition({
            charId: 'hero',
            manifest: {
                logic: { entry: 'logic/main.js' },
            },
        })).rejects.toThrow(/not yet safe to execute/);
    });
});
