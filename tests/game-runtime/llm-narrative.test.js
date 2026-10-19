import { describe, expect, jest, test } from '@jest/globals';
import { buildNarrativeContract, createNarrativeCoordinator } from '../../public/scripts/native/experience/llm/narrative.js';
import { createTurnContext } from '../../public/scripts/native/experience/llm/turn-context.js';

function makeTurn() {
    return createTurnContext({
        anchor: {
            sessionId: 'session_test',
            branchId: 'branch_test',
            revisionId: 'revision_test',
            eventSeq: 4,
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

describe('Native Narrative Contract', () => {
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

    test('Narrative Contract pins authoritative facts and lower-authority sources separately', () => {
        const contract = buildNarrativeContract(makeTurn());

        expect(contract.mustRemainTrue.worldObservation.views.scene.gate).toBe('open');
        expect(contract.mustRemainTrue.committedEvents[0]).toMatchObject({
            id: 'event:3',
            type: 'GateOpened',
        });
        expect(contract.memories[0].authorityRank).toBe(5);
        expect(contract.producerPolicy.exactlyOneFinalBody).toBe(true);
    });
    test('Narrator produces exactly one final body', async () => {
        const narrate = jest.fn(async () => ({ finalProse: 'The open gate frames the road.' }));
        const coordinator = createNarrativeCoordinator({ narrator: { narrate },
            getWorldState: () => ({ gate: 'open' }), getJournal: () => ({ events: [] }) });
        const result = await coordinator.produce(makeTurn());
        expect(narrate).toHaveBeenCalledTimes(1);
        expect(result.producer).toBe('narrator');
        expect(result.turn.narrative).toEqual({ status: 'final', producer: 'narrator', text: result.finalProse });
    });
    test('Narrator mutation of Event Journal is rejected', async () => {
        const journal = { events: [] };
        const coordinator = createNarrativeCoordinator({ narrator: { async narrate() {
            journal.events.push({ id: 'invented' }); return { finalProse: 'Wrong.' };
        } }, getWorldState: () => ({}), getJournal: () => journal });
        await expect(coordinator.produce(makeTurn())).rejects.toThrow('Narrative producer mutated Event Journal');
    });
    test('revoked source after narration cannot publish a final Turn', async () => {
        let current = true;
        const coordinator = createNarrativeCoordinator({ narrator: { async narrate() {
            current = false; return { finalProse: 'Stale.' };
        } }, getWorldState: () => ({}), getJournal: () => ({}) });
        await expect(coordinator.produce(makeTurn(), { assertContextCurrent() {
            if (!current) throw Object.assign(new Error('revoked'), { name: 'AbortError' });
        } })).rejects.toMatchObject({ name: 'AbortError' });
    });
});
