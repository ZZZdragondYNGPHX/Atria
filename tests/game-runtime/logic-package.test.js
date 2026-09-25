import { describe, expect, jest, test } from '@jest/globals';

import { loadGameLogicDefinition } from '../../public/scripts/native/experience/logic/package.js';

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
    sessionId: 'session_logic',
    runtime: {
        game: {
            logic: 'logic/main.json',
        },
    },
};

describe('Game Package logic loading', () => {
    test('compiles declarative package logic into shared runtime contracts', async () => {
        const fetchImpl = jest.fn(async (url) => {
            expect(url).toBe('/api/native/session/runtime/resource');
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
                interpretations: [{
                    eventType: 'implicit_threat',
                    command: 'rest',
                    args: {},
                }],
            });
        });

        const definition = await loadGameLogicDefinition(packageState, { fetchImpl });

        expect(definition.source).toEqual({
            kind: 'declarative',
            entry: 'logic/main.json',
        });
        expect(definition.commands).toHaveLength(1);
        expect(definition.reducers).toHaveLength(1);
        expect(definition.rules).toEqual([]);
        expect(definition.interpretations).toHaveLength(1);
        expect(definition.interpretations[0].eventType).toBe('implicit_threat');
        expect(definition.commands[0].id).toBe('rest');
        expect(definition.reducers[0].type).toBe('Rested');
    });

    test('packages without logic produce an empty runtime definition', async () => {
        await expect(loadGameLogicDefinition({
            sessionId: 'session_logic',
            runtime: { game: {} },
        })).resolves.toEqual({
            commands: [],
            reducers: [],
            rules: [],
            interpretations: [],
            source: null,
        });
    });

    test('advanced JavaScript package logic fails closed until restricted execution exists', async () => {
        await expect(loadGameLogicDefinition({
            sessionId: 'session_logic',
            runtime: {
                game: { logic: 'logic/main.js' },
            },
        })).rejects.toThrow(/not yet safe to execute/);
    });
});
