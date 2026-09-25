import { describe, expect, test } from '@jest/globals';

import { createCommandToolCatalog } from '../../public/scripts/native/experience/llm/tools.js';

const commands = [
    {
        id: 'attack',
        description: 'Attack a visible enemy',
        argsSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['target'],
            properties: {
                target: { type: 'string' },
            },
        },
        llm: { expose: true },
    },
    {
        id: 'buy',
        description: 'Buy an item',
        argsSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['item'],
            properties: {
                item: { type: 'string' },
            },
        },
        llm: { expose: true },
    },
    {
        id: 'debug_reset',
        description: 'Internal reset',
        argsSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {},
        },
    },
];

describe('R5 Command Tool Catalog', () => {
    test('only explicitly opted-in commands enter the LLM tool set', async () => {
        const catalog = await createCommandToolCatalog(commands, {
            observation: {
                views: { scene: 'field' },
            },
        });

        expect(catalog.tools).toEqual([
            {
                id: 'game.command.attack',
                kind: 'command',
                commandId: 'attack',
                description: 'Attack a visible enemy',
                inputSchema: commands[0].argsSchema,
            },
            {
                id: 'game.command.buy',
                kind: 'command',
                commandId: 'buy',
                description: 'Buy an item',
                inputSchema: commands[1].argsSchema,
            },
        ]);
        expect(catalog.trace).toContainEqual({
            commandId: 'debug_reset',
            status: 'not_exposed',
        });
    });

    test('dynamic visibility sees only the supplied Observation/Turn context', async () => {
        const catalog = await createCommandToolCatalog(commands, {
            observation: {
                views: {
                    inCombat: true,
                    merchantVisible: false,
                },
            },
            turn: {
                turnId: 'turn:test',
            },
            visibility: {
                attack(context) {
                    expect(Object.isFrozen(context)).toBe(true);
                    expect(context.observation.views.inCombat).toBe(true);
                    expect(context.world).toBeUndefined();
                    return context.observation.views.inCombat === true;
                },
                buy: context => context.observation.views.merchantVisible === true,
            },
        });

        expect(catalog.tools.map(tool => tool.commandId)).toEqual(['attack']);
        expect(catalog.trace).toContainEqual({
            commandId: 'buy',
            status: 'predicate_hidden',
        });
    });

    test('visibility predicate errors fail closed instead of exposing the command', async () => {
        const catalog = await createCommandToolCatalog(commands, {
            visibility: {
                attack() {
                    throw new Error('visibility failure');
                },
                buy: false,
            },
        });

        expect(catalog.tools).toEqual([]);
        expect(catalog.trace).toContainEqual({
            commandId: 'attack',
            status: 'predicate_error',
            error: 'visibility failure',
        });
        expect(catalog.trace).toContainEqual({
            commandId: 'buy',
            status: 'hidden',
        });
    });
});
