import { describe, expect, test } from '@jest/globals';

import { createGameLlmRuntime } from '../../public/scripts/extensions/game-runtime/llm/runtime.js';

function makeSession() {
    let state = {
        hp: 10,
        inCombat: true,
        secretSeed: 999,
    };
    let journal = {
        nextSeq: 2,
        events: [
            {
                id: 'event:1',
                seq: 1,
                type: 'CombatStarted',
                payload: { enemy: 'guard' },
                branchPath: [0, 1],
                meta: {
                    command: { id: 'start_combat', transactionId: 'tx:1' },
                },
            },
            {
                id: 'event:other',
                seq: 99,
                type: 'HiddenBranchEvent',
                payload: { secret: true },
                branchPath: [0, 2],
            },
        ],
    };

    let dispatchCount = 0;

    return {
        getState: () => structuredClone(state),
        getJournal: () => structuredClone(journal),
        getBranchPath: () => [0, 1],
        getCommands: () => [
            {
                id: 'attack',
                description: 'Attack the current enemy',
                argsSchema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {},
                },
                llm: { expose: true },
            },
            {
                id: 'internal_debug',
                argsSchema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {},
                },
            },
        ],
        validateCommand(commandId, args) {
            const valid = commandId === 'attack'
                && args
                && typeof args === 'object'
                && !Array.isArray(args)
                && Object.keys(args).length === 0;
            return {
                ok: valid,
                errors: valid ? [] : ['invalid command proposal'],
                args: valid ? {} : null,
            };
        },
        async dispatchCommandInternal(commandId, args) {
            if (commandId !== 'attack' || Object.keys(args || {}).length !== 0) {
                throw new Error('invalid dispatched command');
            }
            dispatchCount += 1;
            const beforeState = structuredClone(state);
            state = { ...state, hp: state.hp - 1 };
            const seq = journal.nextSeq;
            const event = {
                id: 'event:' + seq,
                seq,
                type: 'DamageDealt',
                payload: { amount: 1 },
                branchPath: [0, 1],
                meta: {
                    command: {
                        id: 'attack',
                        transactionId: 'tx:' + seq,
                    },
                },
            };
            journal.events.push(event);
            journal.nextSeq += 1;
            return {
                ok: true,
                status: 'committed',
                committed: true,
                commandId: 'attack',
                command: { id: 'attack', args: {} },
                args: {},
                beforeState,
                afterState: structuredClone(state),
                events: [structuredClone(event)],
            };
        },
        getDispatchCount() {
            return dispatchCount;
        },
        setState(next) {
            state = structuredClone(next);
        },
        setJournal(next) {
            journal = structuredClone(next);
        },
    };
}

describe('R5 Game LLM Runtime vertical slice', () => {
    test('builds active-branch Observation and filters Command tools from it', async () => {
        const session = makeSession();
        const runtime = createGameLlmRuntime({
            worldSession: session,
            observationProjectors: [
                {
                    id: 'player',
                    select: world => ({ hp: world.hp }),
                },
                {
                    id: 'combat',
                    select: world => ({ active: world.inCombat }),
                },
            ],
            commandVisibility: {
                attack: context => context.observation.views.combat.active === true,
            },
        });

        const observation = runtime.buildObservation();

        expect(observation.views).toEqual({
            player: { hp: 10 },
            combat: { active: true },
        });
        expect(observation.recentEvents.map(event => event.type))
            .toEqual(['CombatStarted']);
        expect(JSON.stringify(observation)).not.toContain('secretSeed');
        expect(JSON.stringify(observation)).not.toContain('HiddenBranchEvent');

        const catalog = await runtime.getCommandTools({ observation });
        expect(catalog.tools.map(tool => tool.commandId)).toEqual(['attack']);
        expect(catalog.trace).toContainEqual({
            commandId: 'internal_debug',
            status: 'not_exposed',
        });
    });

    test('UI action shortcut bypasses Intent Resolver and enters the same committed Turn Context', async () => {
        const session = makeSession();
        let resolverCalls = 0;
        const runtime = createGameLlmRuntime({
            worldSession: session,
            intentResolver: {
                async resolve() {
                    resolverCalls += 1;
                    throw new Error('UI action must not call resolver');
                },
            },
            observationProjectors: [{
                id: 'player',
                select: world => ({ hp: world.hp }),
            }],
        });

        const result = await runtime.runUiAction({
            commandId: 'attack',
            args: {},
            serial: 9,
        });

        expect(resolverCalls).toBe(0);
        expect(session.getDispatchCount()).toBe(1);
        expect(result.status).toBe('committed');
        expect(result.turn.origin).toBe('ui_action');
        expect(result.turn.resolution).toEqual({
            intentResolver: 'skipped',
            eventInterpreter: 'not_requested',
            reason: 'typed_ui_command',
        });
        expect(result.turn.resolvedCommands).toEqual([{
            id: 'attack',
            args: {},
        }]);
        expect(result.turn.committedEvents.map(event => event.type))
            .toEqual(['DamageDealt']);
        expect(result.turn.observation.views.player.hp).toBe(9);
    });

    test('free text resolves commands, commits them, and refreshes authoritative Observation', async () => {
        const session = makeSession();
        let seenTurn = null;
        let seenCatalog = null;
        const runtime = createGameLlmRuntime({
            worldSession: session,
            observationProjectors: [
                {
                    id: 'player',
                    select: world => ({ hp: world.hp }),
                },
                {
                    id: 'combat',
                    select: world => ({ active: world.inCombat }),
                },
            ],
            commandVisibility: {
                attack: context => context.observation.views.combat.active === true,
            },
            intentResolver: {
                async resolve(turn, catalog) {
                    seenTurn = turn;
                    seenCatalog = catalog;
                    return {
                        decision: 'commands',
                        commands: [{
                            id: 'attack',
                            args: {},
                        }],
                        reason: '',
                    };
                },
            },
        });

        const result = await runtime.runFreeText({
            userInput: 'Attack the guard',
            serial: 10,
        });

        expect(seenTurn.userInput).toBe('Attack the guard');
        expect(seenCatalog.tools.map(tool => tool.commandId)).toEqual(['attack']);
        expect(session.getDispatchCount()).toBe(1);
        expect(result.status).toBe('committed');
        expect(result.turn.origin).toBe('free_text');
        expect(result.turn.resolution).toEqual({
            intentResolver: 'resolved_commands',
            eventInterpreter: 'not_requested',
            reason: 'typed_commands',
        });
        expect(result.turn.resolvedCommands).toEqual([{
            id: 'attack',
            args: {},
        }]);
        expect(result.turn.commandResults).toHaveLength(1);
        expect(result.turn.committedEvents.map(event => event.type))
            .toEqual(['DamageDealt']);
        expect(result.turn.observation.views.player.hp).toBe(9);
        expect(JSON.stringify(result.turn.observation)).not.toContain('secretSeed');
    });

    test('free-text no-change creates no command transaction or Event noise', async () => {
        const session = makeSession();
        const runtime = createGameLlmRuntime({
            worldSession: session,
            observationProjectors: [{
                id: 'player',
                select: world => ({ hp: world.hp }),
            }],
            intentResolver: {
                async resolve() {
                    return {
                        decision: 'no_change',
                        commands: [],
                        reason: 'Greeting only',
                    };
                },
            },
        });

        const result = await runtime.runFreeText({
            userInput: 'Hello there',
            serial: 11,
        });

        expect(result.status).toBe('no_change');
        expect(session.getDispatchCount()).toBe(0);
        expect(result.commandResults).toEqual([]);
        expect(result.turn.committedEvents).toEqual([]);
        expect(result.turn.resolution).toEqual({
            intentResolver: 'resolved_no_change',
            eventInterpreter: 'not_requested',
            reason: 'Greeting only',
        });
        expect(result.turn.observation.views.player.hp).toBe(10);
    });

    test('UI command result stays on the same Turn Context and refreshes authoritative Observation', () => {
        const session = makeSession();
        const runtime = createGameLlmRuntime({
            worldSession: session,
            observationProjectors: [{
                id: 'player',
                select: world => ({ hp: world.hp }),
            }],
        });

        const turn = runtime.beginTurn({
            origin: 'ui_action',
            serial: 5,
        });

        expect(turn.resolution.intentResolver).toBe('skipped');
        expect(turn.observation.views.player.hp).toBe(10);

        session.setState({
            hp: 7,
            inCombat: true,
            secretSeed: 999,
        });
        session.setJournal({
            nextSeq: 3,
            events: [
                {
                    id: 'event:1',
                    seq: 1,
                    type: 'CombatStarted',
                    payload: { enemy: 'guard' },
                    branchPath: [0, 1],
                },
                {
                    id: 'event:2',
                    seq: 2,
                    type: 'DamageDealt',
                    payload: { amount: 3 },
                    branchPath: [0, 1],
                    meta: {
                        command: { id: 'attack', transactionId: 'tx:2' },
                    },
                },
            ],
        });

        const advanced = runtime.applyCommandResult(turn, {
            status: 'committed',
            commandId: 'attack',
            command: {
                id: 'attack',
                args: {},
            },
            events: [{
                id: 'event:2',
                type: 'DamageDealt',
                payload: { amount: 3 },
                branchPath: [0, 1],
            }],
            afterState: { hp: 7, inCombat: true, secretSeed: 999 },
        });

        expect(advanced.turnId).toBe(turn.turnId);
        expect(advanced.resolution).toEqual({
            intentResolver: 'skipped',
            eventInterpreter: 'not_requested',
            reason: 'typed_ui_command',
        });
        expect(advanced.resolvedCommands).toEqual([{
            id: 'attack',
            args: {},
        }]);
        expect(advanced.commandResults).toHaveLength(1);
        expect(advanced.committedEvents).toHaveLength(1);
        expect(advanced.observation.views.player.hp).toBe(7);
        expect(JSON.stringify(advanced.observation)).not.toContain('secretSeed');
    });
});
