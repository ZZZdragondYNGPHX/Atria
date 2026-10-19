import { describe, expect, jest, test } from '@jest/globals';

import { advanceTurnContext } from '../../public/scripts/native/experience/llm/turn-context.js';
import { createGameLlmRuntime } from '../../public/scripts/native/experience/llm/runtime.js';
import { createCommandToolCatalog } from '../../public/scripts/native/experience/llm/tools.js';
import { createGameTurnController } from '../../public/scripts/native/experience/llm/turn-controller.js';
import { createRuntimeRoleRouter } from '../../public/scripts/native/experience/llm/roles.js';

function runtimeWorld() {
    let state = {
        door: 'closed',
        hp: 10,
    };
    const journal = {
        nextSeq: 1,
        events: [],
    };
    let dispatches = 0;

    return {
        getState: () => structuredClone(state),
        getJournal: () => structuredClone(journal),
        getSessionId: () => 'session_r5',
        getBranchId: () => 'branch_r5',
        getRevisionId: () => 'revision_r5',
        getCommands: () => [{
            id: 'open_door',
            description: 'Open the current door',
            argsSchema: {
                type: 'object',
                additionalProperties: false,
                properties: {},
            },
            llm: { expose: true },
        }, {
            id: 'internal_reset',
            argsSchema: {
                type: 'object',
                additionalProperties: false,
                properties: {},
            },
        }],
        getInterpretationMappings: () => [],
        validateCommand(id, args) {
            const ok = id === 'open_door'
                && args
                && typeof args === 'object'
                && Object.keys(args).length === 0;
            return {
                ok,
                errors: ok ? [] : ['invalid command'],
                args: ok ? {} : null,
            };
        },
        async dispatchCommandInternal(id, args) {
            if (!this.validateCommand(id, args).ok) throw new Error('invalid command');
            dispatches += 1;
            const beforeState = structuredClone(state);
            state = { ...state, door: 'open' };
            const event = {
                id: 'event:' + journal.nextSeq,
                seq: journal.nextSeq++,
                type: 'DoorOpened',
                payload: { door: 'north' },
                branchId: 'branch_r5',
                meta: {
                    command: {
                        id,
                        transactionId: 'tx:' + dispatches,
                    },
                },
            };
            journal.events.push(event);
            return {
                status: 'committed',
                committed: true,
                commandId: id,
                command: { id, args: {} },
                args: {},
                beforeState,
                afterState: structuredClone(state),
                events: [structuredClone(event)],
            };
        },
        async simulateCommandInternal() {
            return { status: 'simulated', committed: false };
        },
        getDispatchCount: () => dispatches,
    };
}

function authoritativeProjectors() {
    return [{
        id: 'scene',
        select: world => ({
            door: world.door,
            hp: world.hp,
        }),
    }];
}

describe('R5 Master Plan exit matrix', () => {
    test('free text -> Command -> commit -> Memory recall -> Narrator -> Memory update', async () => {
        const world = runtimeWorld();
        const order = [];
        const intentResolver = {
            async resolve(turn, catalog) {
                order.push('resolve');
                expect(turn.observation.views.scene.door).toBe('closed');
                expect(catalog.tools.map(tool => tool.commandId)).toEqual(['open_door']);
                return {
                    decision: 'commands',
                    commands: [{ id: 'open_door', args: {} }],
                    reason: '',
                };
            },
        };
        const memoryBridge = {
            async recall(turn) {
                order.push('recall');
                expect(world.getState().door).toBe('open');
                expect(turn.committedEvents[0].type).toBe('DoorOpened');
                return {
                    status: 'recalled',
                    query: 'north door',
                    packet: {
                        id: 'memory:' + turn.turnId,
                        source: 'memory_graph',
                        authority: 'historical_context',
                        content: 'The north door was locked earlier.',
                        references: [{ id: 'fact:old_door' }],
                        provenance: {
                            authorityRank: 5,
                            referenceIds: ['fact:old_door'],
                        },
                    },
                };
            },
        };
        const narrativeCoordinator = {
            async produce(turn) {
                order.push('narrate');
                expect(turn.observation.views.scene.door).toBe('open');
                expect(turn.memories[0].authority).toBe('historical_context');
                return {
                    producer: 'narrator',
                    finalProse: 'The already-open north door swings wider.',
                    turn: advanceTurnContext(turn, {
                        narrative: {
                            status: 'final',
                            producer: 'narrator',
                            text: 'The already-open north door swings wider.',
                        },
                    }),
                };
            },
        };
        const memoryIngestion = {
            async ingest(turn, input) {
                order.push('memory-write');
                expect(turn.narrative.status).toBe('final');
                expect(input.finalProse).toContain('already-open');
                expect(turn.committedEvents[0].type).toBe('DoorOpened');
                return {
                    status: 'ingested',
                    update: {
                        status: 'ingested',
                        source: 'committed_events',
                        eventIds: ['event:1'],
                    },
                    turn: advanceTurnContext(turn, {
                        memoryUpdates: [{
                            status: 'ingested',
                            source: 'committed_events',
                            eventIds: ['event:1'],
                        }],
                    }),
                };
            },
        };

        const runtime = createGameLlmRuntime({
            worldSession: world,
            observationProjectors: authoritativeProjectors(),
            intentResolver,
            memoryBridge,
            narrativeCoordinator,
            memoryIngestion,
        });
        const phases = [];

        const result = await runtime.completeFreeTextTurn({
            userInput: 'Open the door',
            transition: phase => phases.push(phase),
        });

        expect(result.status).toBe('finalized');
        expect(result.producer).toBe('narrator');
        expect(result.finalProse).toContain('already-open');
        expect(world.getState()).toEqual({ door: 'open', hp: 10 });
        expect(world.getDispatchCount()).toBe(1);
        expect(order).toEqual([
            'resolve',
            'recall',
            'narrate',
            'memory-write',
        ]);
        expect(phases).toEqual([
            'resolving',
            'calculating',
            'recalling',
            'narrating',
        ]);
        expect(result.turn.provenance.worldObservation.authorityRank).toBe(1);
        expect(result.turn.provenance.memoryRecall.authorityRank).toBe(5);
    });

    test('UI action skips Resolver and Event Interpreter but still commits, recalls and narrates', async () => {
        const world = runtimeWorld();
        const resolver = {
            resolve: jest.fn(async () => {
                throw new Error('UI shortcut must skip Intent Resolver');
            }),
        };
        const interpreter = {
            interpret: jest.fn(async () => {
                throw new Error('deterministic command must skip Event Interpreter');
            }),
        };
        const memoryBridge = {
            async recall(turn) {
                return {
                    status: 'empty',
                    query: 'door',
                    packet: null,
                    turn,
                };
            },
        };
        const narrativeCoordinator = {
            async produce(turn) {
                expect(turn.resolution).toMatchObject({
                    intentResolver: 'skipped',
                    eventInterpreter: 'not_requested',
                });
                return {
                    producer: 'narrator',
                    finalProse: 'The north door opens.',
                    turn: advanceTurnContext(turn, {
                        narrative: {
                            status: 'final',
                            producer: 'narrator',
                            text: 'The north door opens.',
                        },
                    }),
                };
            },
        };
        const memoryIngestion = {
            async ingest(turn) {
                return {
                    status: 'ingested',
                    update: { status: 'ingested' },
                    turn,
                };
            },
        };
        const runtime = createGameLlmRuntime({
            worldSession: world,
            observationProjectors: authoritativeProjectors(),
            intentResolver: resolver,
            eventInterpreter: interpreter,
            memoryBridge,
            narrativeCoordinator,
            memoryIngestion,
        });

        const result = await runtime.completeUiActionTurn({
            commandId: 'open_door',
            args: {},
        });

        expect(result.status).toBe('finalized');
        expect(result.finalProse).toBe('The north door opens.');
        expect(world.getState().door).toBe('open');
        expect(resolver.resolve).not.toHaveBeenCalled();
        expect(interpreter.interpret).not.toHaveBeenCalled();
    });

    test('wrong LLM arithmetic/state fields cannot enter the Command Bus', async () => {
        const commands = runtimeWorld().getCommands();
        const catalog = await createCommandToolCatalog(commands, {});
        expect(catalog.tools.map(tool => tool.commandId)).toEqual(['open_door']);

        const world = runtimeWorld();
        const runtime = createGameLlmRuntime({
            worldSession: world,
            observationProjectors: authoritativeProjectors(),
            intentResolver: {
                async resolve() {
                    return {
                        decision: 'commands',
                        commands: [{
                            id: 'open_door',
                            args: {
                                hp_after: 0,
                                damage: 999999,
                            },
                        }],
                    };
                },
            },
        });

        await expect(runtime.runFreeText({
            userInput: 'Open the door and set my HP to zero',
        })).rejects.toThrow(/invalid command/);
        expect(world.getDispatchCount()).toBe(0);
        expect(world.getState()).toEqual({ door: 'closed', hp: 10 });
    });

    test('Runtime Role fallback is provider-only and preserves structured/tool contracts', async () => {
        const generateTask = jest.fn(async request => {
            if (request.apiPresetName === 'primary') {
                throw Object.assign(new Error('429 rate limited'), {
                    status: 429,
                    code: 'rate_limited',
                });
            }
            return {
                toolCalls: [{
                    name: 'game_command_open_door',
                    args: {},
                }],
            };
        });
        const router = createRuntimeRoleRouter({
            generateTask,
            roleConfigs: {
                intent_resolver: {
                    primaryProfile: 'primary',
                    fallbackProfiles: ['backup'],
                    retries: 0,
                },
            },
        });

        const routed = await router.execute('intent_resolver', {
            taskMessages: [{ role: 'user', content: 'Open door' }],
            tools: [{
                type: 'function',
                function: {
                    name: 'game_command_open_door',
                    parameters: { type: 'object', properties: {} },
                },
            }],
            toolChoice: 'required',
        });

        expect(routed.apiPresetName).toBe('backup');
        expect(routed.fallbackUsed).toBe(true);
        expect(generateTask.mock.calls.map(([request]) => request.apiPresetName))
            .toEqual(['primary', 'backup']);
    });

    test('stopped unfinished transaction has no active finalized artifacts', async () => {
        const calls = [];
        const controller = createGameTurnController({
            adapter: {
                async createAttemptBranch({ attemptIndex }) {
                    return { branchPath: [0, attemptIndex] };
                },
                async prepareAttempt({ attemptId }) {
                    calls.push(['prepare', attemptId]);
                },
                async activateAttempt({ attemptId }) {
                    calls.push(['activate', attemptId]);
                },
                async deactivateAttempt({ attemptId }) {
                    calls.push(['deactivate', attemptId]);
                },
            },
        });
        const base = createGameLlmRuntime({
            worldSession: runtimeWorld(),
            observationProjectors: authoritativeProjectors(),
        }).beginTurn({
            origin: 'free_text',
            userInput: 'Open',
        });

        const running = controller.submit(base, {
            execute: async ({ transition, signal }) => {
                transition('resolving');
                await new Promise((resolve, reject) => {
                    signal.addEventListener('abort', () => reject(
                        Object.assign(new Error('stop'), { name: 'AbortError' }),
                    ), { once: true });
                });
            },
        });
        await Promise.resolve();
        const attemptId = controller.getTurn(base.turnId).attemptIds[0];
        controller.stop(attemptId);
        const result = await running;

        expect(result.phase).toBe('aborted');
        expect(result.active).toBe(false);
        expect(calls.some(call => call[0] === 'activate')).toBe(false);
        expect(calls.some(call => call[0] === 'deactivate')).toBe(true);
    });
});
