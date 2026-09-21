import { describe, expect, jest, test } from '@jest/globals';

import {
    INTENT_RESOLVER_NO_CHANGE_TOOL,
    buildIntentResolverMessages,
    buildIntentResolverTools,
    createIntentResolver,
    validateIntentResolution,
} from '../../public/scripts/extensions/game-runtime/llm/intent-resolver.js';
import { createTurnContext } from '../../public/scripts/extensions/game-runtime/llm/turn-context.js';

function makeTurn() {
    return createTurnContext({
        anchor: {
            branchPath: [0, 1],
            journalNextSeq: 4,
            serial: 2,
        },
        userInput: 'Attack the guard',
        observation: {
            views: {
                combat: {
                    active: true,
                    enemy: 'guard',
                },
            },
            recentEvents: [],
        },
    });
}

function makeCatalog() {
    return {
        tools: [
            {
                id: 'game.command.attack',
                kind: 'command',
                commandId: 'attack',
                description: 'Attack the current enemy',
                inputSchema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['target'],
                    properties: {
                        target: { type: 'string' },
                    },
                },
            },
            {
                id: 'game.command.use.item',
                kind: 'command',
                commandId: 'use.item',
                description: 'Use an item',
                inputSchema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['item'],
                    properties: {
                        item: { type: 'string' },
                    },
                },
            },
        ],
    };
}

describe('R5 Intent Resolver contract', () => {
    test('maps internal command ids to provider-safe tool names and adds explicit no-change', () => {
        const transport = buildIntentResolverTools(makeCatalog());

        expect(transport.tools.map(tool => tool.function.name)).toEqual([
            'game_command_attack',
            'game_command_use_item',
            INTENT_RESOLVER_NO_CHANGE_TOOL,
        ]);
        expect(transport.mapping.get('game_command_attack')).toBe('attack');
        expect(transport.mapping.get('game_command_use_item')).toBe('use.item');
        expect(transport.tools[0].function.parameters).toEqual(
            makeCatalog().tools[0].inputSchema,
        );
    });

    test('detects transport tool-name collisions instead of routing ambiguously', () => {
        expect(() => buildIntentResolverTools({
            tools: [
                {
                    commandId: 'look.at',
                    description: '',
                    inputSchema: { type: 'object' },
                },
                {
                    commandId: 'look_at',
                    description: '',
                    inputSchema: { type: 'object' },
                },
            ],
        })).toThrow(/tool-name collision/);
    });

    test('builds a non-narrative resolver request from Turn Context observation', () => {
        const messages = buildIntentResolverMessages(makeTurn());

        expect(messages[0].role).toBe('system');
        expect(messages[0].content).toContain('Do not narrate the story');
        expect(messages[0].content).toContain('Do not invent numeric state deltas');

        const payload = JSON.parse(messages[1].content);
        expect(payload.user_input).toBe('Attack the guard');
        expect(payload.authoritative_observation.views.combat.enemy).toBe('guard');
        expect(payload.branch).toEqual({
            id: 'swipes:0.1',
            floor: 1,
            swipe: 1,
        });
        expect(payload.raw_world).toBeUndefined();
    });

    test('uses generateTask tools and revalidates the proposed typed Command', async () => {
        const generateTask = jest.fn(async request => ({
            toolCalls: [{
                name: 'game_command_attack',
                args: { target: 'guard' },
            }],
            requestInfo: {
                model: 'resolver-model',
                api: 'openai',
            },
            usage: {
                prompt_tokens: 100,
                completion_tokens: 8,
            },
        }));
        const validateCommand = jest.fn((id, args) => ({
            ok: id === 'attack' && args.target === 'guard',
            errors: [],
            args,
        }));
        const resolver = createIntentResolver({
            generateTask,
            validateCommand,
        });

        const resolved = await resolver.resolve(makeTurn(), makeCatalog(), {
            apiPresetName: 'intent-primary',
            llmPresetName: 'strict-json-tools',
        });

        expect(resolved).toMatchObject({
            decision: 'commands',
            commands: [{
                id: 'attack',
                args: { target: 'guard' },
            }],
            requestInfo: {
                model: 'resolver-model',
                api: 'openai',
            },
        });
        expect(validateCommand).toHaveBeenCalledWith('attack', { target: 'guard' });

        const request = generateTask.mock.calls[0][0];
        expect(request).toMatchObject({
            promptMode: 'task',
            includeCharacterCard: false,
            worldInfoSource: 'none',
            toolChoice: 'required',
            apiPresetName: 'intent-primary',
            llmPresetName: 'strict-json-tools',
            stream: false,
            temperature: 0,
            substituteMacros: false,
        });
        expect(request.tools.map(tool => tool.function.name)).toContain('game_command_attack');
        expect(request.tools.map(tool => tool.function.name)).toContain(INTENT_RESOLVER_NO_CHANGE_TOOL);
    });

    test('accepts explicit no-change without fabricating a game command', () => {
        const transport = buildIntentResolverTools(makeCatalog());
        const resolution = validateIntentResolution({
            toolCalls: [{
                name: INTENT_RESOLVER_NO_CHANGE_TOOL,
                args: { reason: 'No current command matches a greeting.' },
            }],
        }, {
            mapping: transport.mapping,
            validateCommand: jest.fn(),
        });

        expect(resolution).toEqual({
            decision: 'no_change',
            commands: [],
            reason: 'No current command matches a greeting.',
        });
    });

    test('model-invented arithmetic/state fields fail command schema validation before execution', () => {
        const transport = buildIntentResolverTools(makeCatalog());

        expect(() => validateIntentResolution({
            toolCalls: [{
                name: 'game_command_attack',
                args: {
                    target: 'guard',
                    hp_after: 0,
                    damage: 999999,
                },
            }],
        }, {
            mapping: transport.mapping,
            validateCommand(commandId, args) {
                expect(commandId).toBe('attack');
                expect(args.damage).toBe(999999);
                return {
                    ok: false,
                    errors: [
                        "$command.args: unexpected property 'hp_after'",
                        "$command.args: unexpected property 'damage'",
                    ],
                    args: null,
                };
            },
        })).toThrow(/proposed invalid command 'attack'/);
    });

    test('cannot mix no-change with real command calls', () => {
        const transport = buildIntentResolverTools(makeCatalog());

        expect(() => validateIntentResolution({
            toolCalls: [
                {
                    name: INTENT_RESOLVER_NO_CHANGE_TOOL,
                    args: {},
                },
                {
                    name: 'game_command_attack',
                    args: { target: 'guard' },
                },
            ],
        }, {
            mapping: transport.mapping,
            validateCommand: jest.fn(),
        })).toThrow(/cannot mix/);
    });
});
