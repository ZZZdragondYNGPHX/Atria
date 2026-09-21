import { describe, expect, test } from '@jest/globals';

import { createGameLlmRuntime } from '../../public/scripts/extensions/game-runtime/llm/runtime.js';

function makeSession() {
    let state = {
        hp: 10,
        inCombat: true,
        secretSeed: 999,
        threatCount: 0,
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
                id: 'record_threat',
                description: 'Record an interpreted semantic threat',
                argsSchema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['severity'],
                    properties: {
                        severity: {
                            type: 'string',
                            enum: ['low', 'medium', 'high'],
                        },
                    },
                },
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
            const isObject = args
                && typeof args === 'object'
                && !Array.isArray(args);
            const attackValid = commandId === 'attack'
                && isObject
                && Object.keys(args).length === 0;
            const threatValid = commandId === 'record_threat'
                && isObject
                && Object.keys(args).length === 1
                && ['low', 'medium', 'high'].includes(args.severity);
            const valid = attackValid || threatValid;
            return {
                ok: valid,
                errors: valid ? [] : ['invalid command proposal'],
                args: valid ? structuredClone(args) : null,
            };
        },
        async dispatchCommandInternal(commandId, args) {
            dispatchCount += 1;
            const beforeState = structuredClone(state);
            const seq = journal.nextSeq;

            let event;
            if (commandId === 'attack' && Object.keys(args || {}).length === 0) {
                state = { ...state, hp: state.hp - 1 };
                event = {
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
            } else if (
                commandId === 'record_threat'
                && ['low', 'medium', 'high'].includes(args?.severity)
            ) {
                state = { ...state, threatCount: state.threatCount + 1 };
                event = {
                    id: 'event:' + seq,
                    seq,
                    type: 'ThreatRecorded',
                    payload: { severity: args.severity },
                    branchPath: [0, 1],
                    meta: {
                        command: {
                            id: 'record_threat',
                            transactionId: 'tx:' + seq,
                        },
                    },
                };
            } else {
                dispatchCount -= 1;
                throw new Error('invalid dispatched command');
            }

            journal.events.push(event);
            journal.nextSeq += 1;
            return {
                ok: true,
                status: 'committed',
                committed: true,
                commandId,
                command: { id: commandId, args: structuredClone(args || {}) },
                args: structuredClone(args || {}),
                beforeState,
                afterState: structuredClone(state),
                events: [structuredClone(event)],
            };
        },
        getInterpretationMappings() {
            return [{
                eventType: 'implicit_threat',
                map(context) {
                    return {
                        id: 'record_threat',
                        args: {
                            severity: context.interpretation.severity,
                        },
                    };
                },
            }];
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
        let interpreterCalls = 0;
        const runtime = createGameLlmRuntime({
            worldSession: session,
            intentResolver: {
                async resolve() {
                    resolverCalls += 1;
                    throw new Error('UI action must not call resolver');
                },
            },
            eventInterpreter: {
                async interpret() {
                    interpreterCalls += 1;
                    throw new Error('deterministic UI action must not call Event Interpreter');
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
        expect(interpreterCalls).toBe(0);
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
        let interpreterCalls = 0;
        const runtime = createGameLlmRuntime({
            worldSession: session,
            eventInterpreter: {
                async interpret() {
                    interpreterCalls += 1;
                    throw new Error('deterministic free-text command must not call Event Interpreter');
                },
            },
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
        expect(interpreterCalls).toBe(0);
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

    test('Event Interpreter records typed semantics without dispatching or mutating World/Journal', async () => {
        const session = makeSession();
        const runtime = createGameLlmRuntime({
            worldSession: session,
            observationProjectors: [{
                id: 'player',
                select: world => ({ hp: world.hp }),
            }],
            eventInterpreter: {
                async interpret(turn, request) {
                    expect(turn.observation.views.player.hp).toBe(10);
                    expect(request.id).toBe('speech_semantics');
                    return {
                        requestId: 'speech_semantics',
                        status: 'accepted',
                        accepted: true,
                        interpretation: {
                            decision: 'event',
                            eventType: 'implicit_threat',
                            severity: 'medium',
                            participants: ['guard_02'],
                            confidence: 0.88,
                            evidence: ['You will regret this.'],
                        },
                    };
                },
            },
        });

        const turn = runtime.beginTurn({
            origin: 'free_text',
            userInput: 'You will regret this.',
            serial: 12,
        });
        const beforeState = session.getState();
        const beforeJournal = session.getJournal();

        const interpreted = await runtime.interpretEvent(turn, {
            id: 'speech_semantics',
        });

        expect(interpreted.status).toBe('accepted');
        expect(interpreted.accepted).toBe(true);
        expect(session.getDispatchCount()).toBe(0);
        expect(session.getState()).toEqual(beforeState);
        expect(session.getJournal()).toEqual(beforeJournal);
        expect(interpreted.turn.committedEvents).toEqual([]);
        expect(interpreted.turn.interpretations).toEqual([
            expect.objectContaining({
                requestId: 'speech_semantics',
                status: 'accepted',
                accepted: true,
                interpretation: expect.objectContaining({
                    decision: 'event',
                    eventType: 'implicit_threat',
                }),
            }),
        ]);
        expect(interpreted.turn.resolution).toMatchObject({
            eventInterpreter: 'accepted',
            eventInterpreterRequestId: 'speech_semantics',
        });
    });

    test('accepted semantic interpretation maps through typed Command before any Journal mutation', async () => {
        const session = makeSession();
        const runtime = createGameLlmRuntime({
            worldSession: session,
            observationProjectors: [{
                id: 'player',
                select: world => ({
                    hp: world.hp,
                    threatCount: world.threatCount,
                }),
            }],
            eventInterpreter: {
                async interpret() {
                    return {
                        requestId: 'speech_semantics',
                        status: 'accepted',
                        accepted: true,
                        interpretation: {
                            decision: 'event',
                            eventType: 'implicit_threat',
                            severity: 'medium',
                            participants: ['guard_02'],
                            confidence: 0.91,
                            evidence: ['You will regret this.'],
                        },
                    };
                },
            },
        });

        const turn = runtime.beginTurn({
            origin: 'free_text',
            userInput: 'You will regret this.',
            serial: 14,
        });

        const result = await runtime.interpretAndApply(turn, {
            id: 'speech_semantics',
        });

        expect(result.status).toBe('committed');
        expect(result.accepted).toBe(true);
        expect(result.mapping).toEqual({
            status: 'mapped',
            eventType: 'implicit_threat',
            commands: [{
                id: 'record_threat',
                args: { severity: 'medium' },
            }],
        });
        expect(result.commandResult).toMatchObject({
            status: 'committed',
            commandId: 'record_threat',
            command: {
                id: 'record_threat',
                args: { severity: 'medium' },
            },
        });
        expect(result.turn.resolution).toMatchObject({
            eventInterpreter: 'applied',
            reason: 'semantic_mapping',
        });
        expect(result.turn.observation.views.player).toEqual({
            hp: 10,
            threatCount: 1,
        });

        const journalTypes = session.getJournal().events.map(event => event.type);
        expect(journalTypes).toContain('ThreatRecorded');
        expect(journalTypes).not.toContain('implicit_threat');
        expect(session.getJournal().events.at(-1)).toMatchObject({
            type: 'ThreatRecorded',
            payload: { severity: 'medium' },
            meta: {
                command: {
                    id: 'record_threat',
                },
            },
        });
    });

    test('low-confidence Event Interpreter result stays no-change and produces no Event noise', async () => {
        const session = makeSession();
        const runtime = createGameLlmRuntime({
            worldSession: session,
            eventInterpreter: {
                async interpret() {
                    return {
                        requestId: 'speech_semantics',
                        status: 'low_confidence_no_change',
                        accepted: false,
                        interpretation: {
                            decision: 'no_change',
                            confidence: 0.42,
                            evidence: ['Ambiguous'],
                        },
                        rejectedInterpretation: {
                            decision: 'event',
                            eventType: 'implicit_threat',
                            confidence: 0.42,
                        },
                    };
                },
            },
        });

        const turn = runtime.beginTurn({
            origin: 'free_text',
            userInput: 'Maybe you should watch yourself.',
            serial: 13,
        });
        const interpreted = await runtime.interpretEvent(turn, {
            id: 'speech_semantics',
        });

        expect(interpreted.status).toBe('low_confidence_no_change');
        expect(interpreted.accepted).toBe(false);
        expect(session.getDispatchCount()).toBe(0);
        expect(interpreted.turn.committedEvents).toEqual([]);
        expect(interpreted.turn.resolution).toMatchObject({
            eventInterpreter: 'low_confidence_no_change',
        });
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
            threatCount: 0,
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
            afterState: {
                hp: 7,
                inCombat: true,
                secretSeed: 999,
                threatCount: 0,
            },
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
