import { describe, expect, jest, test } from '@jest/globals';

import {
    buildOrchestratorTurnView,
    createGameOrchestratorBridge,
} from '../../public/scripts/extensions/game-runtime/llm/orchestrator-bridge.js';
import {
    buildNarrativeContract,
    chooseNarrativeProducer,
    createNarrativeCoordinator,
} from '../../public/scripts/extensions/game-runtime/llm/narrative.js';
import { createTurnContext } from '../../public/scripts/extensions/game-runtime/llm/turn-context.js';
import { createOrchestratorGameRuntimeApi } from '../../public/scripts/extensions/orchestrator/game-runtime-bridge.js';

function makeTurn() {
    return createTurnContext({
        anchor: {
            branchPath: [0, 1],
            journalNextSeq: 4,
            serial: 20,
        },
        userInput: 'Open the gate',
        commandResults: [{
            status: 'committed',
            commandId: 'open_gate',
            committed: true,
        }],
        committedEvents: [{
            id: 'event:3',
            type: 'GateOpened',
            payload: { gate: 'north' },
            branchPath: [0, 1],
        }],
        observation: {
            views: {
                scene: {
                    gate: 'open',
                    location: 'north_gate',
                },
            },
            recentEvents: [],
        },
        recentChat: [{
            role: 'user',
            content: 'Open the gate',
        }],
        memories: [{
            id: 'memory-recall:turn:test',
            content: 'The north gate used to be locked.',
            authority: 'historical_context',
            references: [{ id: 'fact:old_gate' }],
        }],
        constraints: ['Keep the guard captain present.'],
    });
}

describe('R5 Orchestrator and Narrative Contract bridge', () => {
    test('builds read-only orchestration view with authoritative and advisory boundaries', () => {
        const view = buildOrchestratorTurnView(makeTurn());

        expect(view.authoritative.worldObservation.views.scene.gate).toBe('open');
        expect(view.authoritative.committedEvents[0].type).toBe('GateOpened');
        expect(view.memories[0]).toMatchObject({
            authority: 'historical_context',
            authorityRank: 5,
        });
        expect(view.rules).toEqual({
            worldStateIsAuthoritative: true,
            committedEventsAreAuthoritative: true,
            memoryIsHistorical: true,
            guidanceIsAdvisory: true,
            mayWriteWorld: false,
            mayCommitEvents: false,
        });
        expect(Object.isFrozen(view)).toBe(true);
    });

    test('spec/agenda/loop guidance is advisory and reaches Narrative Contract below World facts', async () => {
        let world = { gate: 'open' };
        let journal = { events: [{ id: 'event:3', type: 'GateOpened' }] };
        const orchestratorApi = {
            async runGameGuidance({ mode, turnContext }) {
                expect(turnContext.authoritative.worldObservation.views.scene.gate).toBe('open');
                return {
                    status: 'completed',
                    guidance: 'Emphasize tension; pretend the gate is locked for drama.',
                    stageOutputs: [{ id: 'final', mode: 'serial', nodes: [] }],
                };
            },
        };
        const bridge = createGameOrchestratorBridge({
            orchestratorApi,
            getWorldState: () => structuredClone(world),
            getJournal: () => structuredClone(journal),
        });
        const narrator = {
            async narrate(_turn, { contract }) {
                expect(contract.mustRemainTrue.worldObservation.views.scene.gate).toBe('open');
                expect(contract.orchestrationGuidance).toMatchObject({
                    advisory: true,
                    authorityRank: 6,
                });
                expect(contract.memories[0].authorityRank).toBe(5);
                return {
                    producer: 'narrator',
                    finalProse: 'The already-open north gate creaks in the wind.',
                    contract,
                    routing: {},
                };
            },
        };
        const coordinator = createNarrativeCoordinator({
            narrator,
            orchestratorBridge: bridge,
            getWorldState: () => structuredClone(world),
            getJournal: () => structuredClone(journal),
        });

        for (const mode of ['spec', 'agenda', 'loop']) {
            const result = await coordinator.produce(makeTurn(), {
                orchestrationMode: mode,
            });
            expect(result.producer).toBe('narrator');
            expect(result.turn.orchestration).toMatchObject({
                mode,
                advisory: true,
                authorityRank: 6,
            });
            expect(result.finalProse).toContain('already-open');
        }

        expect(world).toEqual({ gate: 'open' });
        expect(journal).toEqual({ events: [{ id: 'event:3', type: 'GateOpened' }] });
    });

    test('Director takeover is the sole final prose producer and Narrator is never called', async () => {
        const narrator = {
            narrate: jest.fn(async () => {
                throw new Error('Narrator must not run during Director takeover');
            }),
        };
        const bridge = createGameOrchestratorBridge({
            orchestratorApi: {
                async runGameDirector({ turnContext, narrativeContract }) {
                    expect(turnContext.authoritative.committedEvents[0].type).toBe('GateOpened');
                    expect(narrativeContract.mustRemainTrue.worldObservation.views.scene.gate).toBe('open');
                    return {
                        finalProse: 'The open gate frames the road beyond.',
                        guidance: { text: 'Director planning trace.' },
                    };
                },
            },
            getWorldState: () => ({ gate: 'open' }),
            getJournal: () => ({ events: [{ id: 'event:3', type: 'GateOpened' }] }),
        });
        const coordinator = createNarrativeCoordinator({
            narrator,
            orchestratorBridge: bridge,
            getWorldState: () => ({ gate: 'open' }),
            getJournal: () => ({ events: [{ id: 'event:3', type: 'GateOpened' }] }),
        });

        const result = await coordinator.produce(makeTurn(), {
            orchestrationMode: 'director',
        });

        expect(result.producer).toBe('director');
        expect(result.finalProse).toBe('The open gate frames the road beyond.');
        expect(result.turn.narrative).toEqual({
            status: 'final',
            producer: 'director',
            text: 'The open gate frames the road beyond.',
        });
        expect(narrator.narrate).not.toHaveBeenCalled();
    });

    test('Narrative producer mutation of World is rejected', async () => {
        let world = { hp: 10 };
        const coordinator = createNarrativeCoordinator({
            narrator: {
                async narrate() {
                    world.hp = 0;
                    return {
                        producer: 'narrator',
                        finalProse: 'Wrong.',
                        routing: {},
                    };
                },
            },
            getWorldState: () => structuredClone(world),
            getJournal: () => ({ events: [] }),
        });

        await expect(coordinator.produce(makeTurn()))
            .rejects.toThrow(/Narrative producer mutated World State/);
    });

    test('producer arbitration is explicit', () => {
        expect(chooseNarrativeProducer('director')).toBe('director');
        expect(chooseNarrativeProducer('spec')).toBe('narrator');
        expect(chooseNarrativeProducer('agenda')).toBe('narrator');
        expect(chooseNarrativeProducer('loop')).toBe('narrator');
        expect(chooseNarrativeProducer('')).toBe('narrator');
    });

    test('Orchestrator-side guidance wrapper reuses existing runOrchestration and capsule builder', async () => {
        const runOrchestration = jest.fn(async (_context, payload, messages, profile) => {
            expect(payload.__atriaGameTurnContext.turnId).toBe('turn:test');
            expect(messages.at(-1).mes).toContain('<atria_game_turn_context>');
            expect(profile.mode).toBe('spec');
            return {
                status: 'completed',
                stageOutputs: [{
                    id: 'final',
                    mode: 'serial',
                    nodes: [{ node: 'writer', output: 'Guidance body' }],
                }],
                runtimeTrace: { runId: 'orch-1' },
            };
        });
        const api = createOrchestratorGameRuntimeApi({
            getEffectiveProfile: () => ({ mode: 'spec', name: 'Spec' }),
            runOrchestration,
            buildCapsule: outputs => outputs[0].nodes[0].output,
        });

        const result = await api.runGuidance({
            context: {},
            mode: 'spec',
            turnContext: {
                turnId: 'turn:test',
                recentChat: [],
            },
        });

        expect(result).toEqual({
            status: 'completed',
            mode: 'spec',
            guidance: 'Guidance body',
            stageOutputs: [{
                id: 'final',
                mode: 'serial',
                nodes: [{ node: 'writer', output: 'Guidance body' }],
            }],
            trace: { runId: 'orch-1' },
        });
    });

    test('Orchestrator-side Director writes only into a buffer handle and returns final prose', async () => {
        const handle = {
            text: '',
            getText() { return this.text; },
        };
        const context = {
            createMessageEditorHandle: jest.fn(() => handle),
            generateTask: jest.fn(),
        };
        const runMainAgentLoop = jest.fn(async ({ handle: current, deps }) => {
            expect(deps.chat).toEqual([]);
            expect(deps.getContentPayload().messages.at(-1).content)
                .toContain('<atria_game_authoritative_contract>');
            current.text = 'Director-only final body.';
        });
        const api = createOrchestratorGameRuntimeApi({
            getEffectiveProfile: () => ({
                mode: 'director',
                mainAgent: {},
                subAgents: [],
            }),
            runMainAgentLoop,
            getSettings: () => ({}),
        });

        const result = await api.runDirector({
            context,
            turnContext: {
                turnId: 'turn:director',
                recentChat: [],
            },
            narrativeContract: {
                mustRemainTrue: {
                    worldObservation: { hp: 10 },
                },
            },
        });

        expect(result.finalProse).toBe('Director-only final body.');
        expect(context.createMessageEditorHandle).toHaveBeenCalledWith(
            expect.objectContaining({
                owner: 'orchestrator-game-runtime',
            }),
        );
        expect(runMainAgentLoop).toHaveBeenCalledTimes(1);
    });

    test('Narrative Contract pins authoritative facts and lower-authority sources separately', () => {
        const contract = buildNarrativeContract(makeTurn());

        expect(contract.mustRemainTrue.worldObservation.views.scene.gate).toBe('open');
        expect(contract.mustRemainTrue.committedEvents[0]).toMatchObject({
            id: 'event:3',
            type: 'GateOpened',
        });
        expect(contract.memories[0].authorityRank).toBe(5);
        expect(contract.orchestrationGuidance).toBeNull();
        expect(contract.producerPolicy.exactlyOneFinalBody).toBe(true);
    });
});
