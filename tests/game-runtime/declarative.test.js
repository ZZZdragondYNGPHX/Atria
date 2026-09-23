import { describe, expect, test } from '@jest/globals';

import { compileDeclarativeLogic } from '../../public/scripts/extensions/game-runtime/logic/declarative.js';
import { createReducerRegistry } from '../../public/scripts/extensions/game-runtime/logic/reducers.js';
import { createGameLogicRuntime } from '../../public/scripts/extensions/game-runtime/logic/runtime.js';
import { createSessionWorldTestAdapter } from './helpers/session-world-adapter.js';

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
        get writes() {
            return writes;
        },
    };
}

const worldSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['hp', 'dead'],
    properties: {
        hp: { type: 'integer', minimum: 0, maximum: 20 },
        dead: { type: 'boolean' },
    },
};

const declarativeDefinition = {
    commands: [{
        id: 'strike',
        argsSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['amount'],
            properties: {
                amount: { type: 'integer', minimum: 1, maximum: 20 },
            },
        },
        validators: [{
            id: 'can_strike',
            formula: 'world.dead == false && args.amount <= world.hp',
            error: 'actor cannot strike',
        }],
        events: [{
            type: 'DamageDealt',
            payload: {
                amount: { formula: 'args.amount' },
            },
        }],
    }],
    reducers: [
        {
            type: 'DamageDealt',
            payloadSchema: {
                type: 'object',
                additionalProperties: false,
                required: ['amount'],
                properties: {
                    amount: { type: 'integer', minimum: 1, maximum: 20 },
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
    ],
    rules: [{
        id: 'death',
        on: 'DamageDealt',
        when: 'world.hp == 0 && world.dead == false',
        events: [{
            type: 'EntityDied',
            payload: {},
        }],
    }],
};

async function makeRuntime() {
    const compiled = compileDeclarativeLogic(declarativeDefinition);
    const reducerRegistry = createReducerRegistry(compiled.reducers);
    const persistence = makePersistence();
    const world = createSessionWorldTestAdapter({
        initialState: { hp: 10, dead: false },
        schema: worldSchema,
        reducers: reducerRegistry.toMap(),
        persistence,
    });
    await world.load();
    const logic = createGameLogicRuntime({
        world,
        commands: compiled.commands,
        rules: compiled.rules,
        rngSeed: 'declarative-fixture',
    });
    return { compiled, logic, persistence, world };
}

describe('Declarative Game Logic compiler', () => {
    test('compiles into the same Command/Reducer/Rule transaction contracts', async () => {
        const { compiled, logic, persistence, world } = await makeRuntime();

        expect(compiled.commands).toHaveLength(1);
        expect(compiled.reducers).toHaveLength(2);
        expect(compiled.rules).toHaveLength(1);

        const result = await logic.dispatch('strike', { amount: 10 });

        expect(result.afterState).toEqual({ hp: 0, dead: true });
        expect(result.events.map(event => event.type)).toEqual([
            'DamageDealt',
            'EntityDied',
        ]);
        expect(result.ruleTrace).toEqual([
            expect.objectContaining({
                ruleId: 'death',
                status: 'emitted',
            }),
        ]);
        expect(world.getState()).toEqual(result.afterState);
        expect(persistence.writes).toBe(1);
    });

    test('declarative preconditions fail before authoritative mutation', async () => {
        const { logic, persistence, world } = await makeRuntime();

        await expect(logic.dispatch('strike', { amount: 11 })).rejects.toThrow(/actor cannot strike/);

        expect(world.getState()).toEqual({ hp: 10, dead: false });
        expect(world.getJournal().events).toEqual([]);
        expect(persistence.writes).toBe(0);
    });

    test('declarative simulation uses the same chain without persistence', async () => {
        const { logic, persistence, world } = await makeRuntime();

        const result = await logic.simulate('strike', { amount: 10 });

        expect(result.afterState).toEqual({ hp: 0, dead: true });
        expect(result.committed).toBe(false);
        expect(world.getState()).toEqual({ hp: 10, dead: false });
        expect(world.getJournal().events).toEqual([]);
        expect(persistence.writes).toBe(0);
    });

    test('malformed declarative collection and condition types fail during compile', () => {
        expect(() => compileDeclarativeLogic({
            commands: {},
        })).toThrow(/commands must be an array/);

        expect(() => compileDeclarativeLogic({
            commands: [{
                id: 'bad_events',
                events: {},
            }],
        })).toThrow(/events must be an array/);

        expect(() => compileDeclarativeLogic({
            commands: [{
                id: 'bad_validators',
                validators: {},
                events: [],
            }],
        })).toThrow(/validators must be an array/);

        expect(() => compileDeclarativeLogic({
            rules: [{
                id: 'bad_when',
                on: 'DamageDealt',
                when: true,
                events: [],
            }],
        })).toThrow(/when must be a non-empty string/);

        expect(() => compileDeclarativeLogic({
            reducers: {},
        })).toThrow(/reducers must be an array/);
    });

    test('declarative commands can opt into LLM exposure without gaining state-write authority', () => {
        const compiled = compileDeclarativeLogic({
            commands: [{
                id: 'inspect',
                description: 'Inspect the current scene',
                llm: { expose: true },
                events: [],
            }],
        });

        expect(compiled.commands[0]).toMatchObject({
            id: 'inspect',
            llm: { expose: true },
        });

        expect(() => compileDeclarativeLogic({
            commands: [{
                id: 'bad',
                llm: {
                    expose: true,
                    setState: true,
                },
                events: [],
            }],
        })).toThrow(/unknown field/);
    });

    test('declarative interpretation mapping compiles semantic fields into a typed Command proposal', () => {
        const compiled = compileDeclarativeLogic({
            interpretations: [{
                eventType: 'implicit_threat',
                command: 'record_threat',
                when: 'args.confidence >= 0.75',
                args: {
                    severity: { formula: 'args.severity' },
                    participants: { formula: 'args.participants' },
                    confidence: { formula: 'args.confidence' },
                },
            }],
        });

        expect(compiled.interpretations).toHaveLength(1);

        const mapped = compiled.interpretations[0].map({
            interpretation: {
                decision: 'event',
                eventType: 'implicit_threat',
                severity: 'medium',
                participants: ['guard_02'],
                confidence: 0.91,
            },
            world: { threatCount: 0 },
            observation: {},
        });
        expect(mapped).toEqual({
            id: 'record_threat',
            args: {
                severity: 'medium',
                participants: ['guard_02'],
                confidence: 0.91,
            },
        });

        const noChange = compiled.interpretations[0].map({
            interpretation: {
                decision: 'event',
                eventType: 'implicit_threat',
                severity: 'low',
                participants: ['guard_02'],
                confidence: 0.4,
            },
            world: { threatCount: 0 },
            observation: {},
        });
        expect(noChange).toEqual([]);
    });

    test('declarative interpretation mappings reject unsafe shapes', () => {
        expect(() => compileDeclarativeLogic({
            interpretations: [{
                eventType: 'implicit threat',
                command: 'record_threat',
                args: {},
            }],
        })).toThrow(/invalid eventType/);

        expect(() => compileDeclarativeLogic({
            interpretations: [{
                eventType: 'implicit_threat',
                command: 'Record Threat',
                args: {},
            }],
        })).toThrow(/invalid command id/);

        expect(() => compileDeclarativeLogic({
            interpretations: [{
                eventType: 'implicit_threat',
                command: 'record_threat',
                setState: true,
                args: {},
            }],
        })).toThrow(/unknown field/);
    });

    test('unsafe reducer paths and unknown DSL fields fail during compile', () => {
        expect(() => compileDeclarativeLogic({
            reducers: [{
                type: 'Bad',
                assign: {
                    '__proto__.polluted': true,
                },
            }],
        })).toThrow(/unsafe assignment path/);

        expect(() => compileDeclarativeLogic({
            commands: [{
                id: 'bad',
                events: [],
                broadContext: true,
            }],
        })).toThrow(/unknown field/);
    });
});
