import { describe, expect, test } from '@jest/globals';

import { createStudioSimulationHarness } from '../../public/scripts/extensions/character-editor-assistant/studio/simulation-runtime.js';

const project = {
    packageId: 'studio.sim',
    packageVersion: '1.0.0',
    schema: {
        type: 'object',
        additionalProperties: false,
        required: ['hp', 'dead', 'score'],
        properties: {
            hp: { type: 'integer', minimum: 0, maximum: 20 },
            dead: { type: 'boolean' },
            score: { type: 'integer', minimum: 0 },
        },
    },
    initialState: {
        hp: 10,
        dead: false,
        score: 0,
    },
    logic: {
        commands: [{
            id: 'strike',
            description: 'Strike with deterministic damage',
            argsSchema: {
                type: 'object',
                additionalProperties: false,
                required: ['bonus'],
                properties: {
                    bonus: { type: 'integer', minimum: 0, maximum: 5 },
                },
            },
            validators: [{
                id: 'alive',
                formula: 'world.dead == false',
                error: 'dead actors cannot strike',
            }],
            events: [{
                type: 'DamageDealt',
                payload: {
                    amount: { formula: 'rng.int(8, 8) + args.bonus' },
                },
            }],
            llm: { expose: true },
        }],
        reducers: [
            {
                type: 'DamageDealt',
                payloadSchema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['amount'],
                    properties: {
                        amount: { type: 'integer', minimum: 0 },
                    },
                },
                assign: {
                    hp: { formula: 'max(0, world.hp - args.amount)' },
                },
            },
            {
                type: 'EntityDied',
                payloadSchema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {},
                },
                assign: {
                    dead: true,
                },
            },
            {
                type: 'ScoreAwarded',
                payloadSchema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['amount'],
                    properties: {
                        amount: { type: 'integer', minimum: 0 },
                    },
                },
                assign: {
                    score: { formula: 'world.score + args.amount' },
                },
            },
        ],
        rules: [
            {
                id: 'death',
                on: 'DamageDealt',
                when: 'world.hp == 0 && world.dead == false',
                events: [{ type: 'EntityDied', payload: {} }],
            },
            {
                id: 'award',
                on: 'EntityDied',
                events: [{
                    type: 'ScoreAwarded',
                    payload: { amount: { formula: 'rng.int(5, 5)' } },
                }],
            },
        ],
        interpretations: [],
    },
    selectors: [
        { id: 'player.hp', formula: 'world.hp' },
        { id: 'player.score', formula: 'world.score' },
    ],
    observations: [
        { id: 'player.hp', formula: 'world.hp' },
        { id: 'preview.role', formula: 'args.role' },
    ],
};

describe('Game Studio Simulation Harness', () => {
    test('uses the R3 simulation path and exposes diagnostics without mutation', async () => {
        const harness = await createStudioSimulationHarness(project);
        const result = await harness.simulate('strike', { bonus: 2 }, { role: 'narrator' });

        expect(result.ok).toBe(true);
        expect(result.status).toBe('simulated');
        expect(result.committed).toBe(false);
        expect(result.beforeState).toEqual({ hp: 10, dead: false, score: 0 });
        expect(result.projectedState).toEqual({ hp: 0, dead: true, score: 5 });
        expect(result.events.map(event => event.type)).toEqual([
            'DamageDealt',
            'EntityDied',
            'ScoreAwarded',
        ]);
        expect(result.ruleTrace.map(entry => [entry.ruleId, entry.status])).toEqual([
            ['death', 'emitted'],
            ['award', 'emitted'],
        ]);
        expect(result.rngTrace).toEqual([
            expect.objectContaining({
                operation: 'int',
                minimum: 8,
                maximum: 8,
                value: 8,
            }),
            expect.objectContaining({
                stream: 'default',
                operation: 'int',
                value: 5,
            }),
        ]);
        expect(result.validation.ok).toBe(true);
        expect(result.commandTools.tools).toEqual([
            expect.objectContaining({
                id: 'game.command.strike',
                commandId: 'strike',
            }),
        ]);
        expect(result.observation).toEqual({
            views: {
                'player.hp': 0,
                'preview.role': 'narrator',
            },
            recentEvents: expect.any(Array),
        });
        expect(result.selectors).toEqual({
            'player.hp': 0,
            'player.score': 5,
        });
        expect(result.mutation).toEqual({
            persistenceWrites: 0,
            stateUnchanged: true,
            journalUnchanged: true,
        });

        expect(harness.getInitialState()).toEqual({ hp: 10, dead: false, score: 0 });
        expect(harness.getInitialJournal().events).toEqual([]);
    });

    test('returns command validation diagnostics without running an invalid simulation', async () => {
        const harness = await createStudioSimulationHarness(project);
        const result = await harness.simulate('strike', { bonus: 99 }, { role: 'intent_resolver' });

        expect(result.ok).toBe(false);
        expect(result.status).toBe('invalid');
        expect(result.validation.ok).toBe(false);
        expect(result.validation.errors.join('\n')).toContain('must be <= 5');
        expect(result.events).toEqual([]);
        expect(result.rngTrace).toEqual([]);
        expect(result.ruleTrace).toEqual([]);
        expect(result.mutation).toEqual({
            persistenceWrites: 0,
            stateUnchanged: true,
            journalUnchanged: true,
        });
        expect(result.commandTools.tools[0].commandId).toBe('strike');
    });

    test('lists the same authoring contracts used by the source project', async () => {
        const harness = await createStudioSimulationHarness(project);

        expect(harness.listCommands()).toEqual([
            expect.objectContaining({
                id: 'strike',
                llm: { expose: true },
            }),
        ]);
        expect(harness.listRules()).toEqual([
            { id: 'award', on: ['EntityDied'], priority: 0 },
            { id: 'death', on: ['DamageDealt'], priority: 0 },
        ]);
        expect(harness.listEventTypes().map(item => item.type)).toEqual([
            'DamageDealt',
            'EntityDied',
            'ScoreAwarded',
        ]);
    });
});
