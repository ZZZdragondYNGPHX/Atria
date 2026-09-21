import { describe, expect, jest, test } from '@jest/globals';

import {
    buildAuthoritativeEventFactOperations,
    createPostTurnMemoryIngestion,
} from '../../public/scripts/extensions/game-runtime/llm/memory-ingestion.js';
import { createTurnContext } from '../../public/scripts/extensions/game-runtime/llm/turn-context.js';

function turn() {
    return createTurnContext({
        anchor: {
            branchPath: [0, 1],
            journalNextSeq: 3,
            serial: 6,
        },
        userInput: 'Attack the guard',
        committedEvents: [{
            id: 'event:2',
            seq: 2,
            type: 'DamageDealt',
            payload: { amount: 3, target: 'guard_02' },
            branchPath: [0, 1],
            branchId: 'swipes:0.1',
            meta: {
                command: {
                    id: 'attack',
                    transactionId: 'tx:2',
                },
            },
        }],
        observation: {
            views: {
                player: { hp: 57 },
            },
            recentEvents: [],
        },
    });
}

describe('R5 post-turn authoritative Memory ingestion', () => {
    test('derives hard Memory facts directly from committed Events', () => {
        const prepared = buildAuthoritativeEventFactOperations(turn());

        expect(prepared.sourceIds).toEqual(['game-event:event:2']);
        expect(prepared.sources[0]).toMatchObject({
            id: 'game-event:event:2',
            kind: 'game_event',
            eventId: 'event:2',
            branchId: 'swipes:0.1',
        });
        expect(prepared.facts).toEqual([{
            action: 'create',
            type: 'authoritative',
            text: 'Committed game event DamageDealt: {"amount":3,"target":"guard_02"}',
            confidence: 1,
            importance: 1,
            validFrom: 2,
            evidence: [{
                externalSourceId: 'game-event:event:2',
                excerpt: prepared.sources[0].content,
            }],
        }]);
    });

    test('final prose cannot overwrite or redefine authoritative Event facts', async () => {
        const applyAuthoritativeFacts = jest.fn(async input => {
            expect(input.sourceIds).toEqual(['game-event:event:2']);
            expect(input.facts[0].text).toContain('DamageDealt');
            expect(input.facts[0].text).toContain('"amount":3');
            expect(input.facts[0].text).not.toContain('999');
            expect(input.facts[0].type).toBe('authoritative');
            return [{ id: 'fact:game-event-2', action: 'create' }];
        });
        const ingestion = createPostTurnMemoryIngestion({
            context: { chatId: 'chat-1' },
            memoryApi: {
                async openSession() {
                    return { applyAuthoritativeFacts };
                },
            },
        });

        const result = await ingestion.ingest(turn(), {
            producer: 'narrator',
            finalProse: 'The attack deals 999 damage and leaves you at 0 HP.',
        });

        expect(result.status).toBe('ingested');
        expect(applyAuthoritativeFacts).toHaveBeenCalledTimes(1);
        expect(result.update).toEqual({
            status: 'ingested',
            source: 'committed_events',
            eventIds: ['event:2'],
            sourceIds: ['game-event:event:2'],
            factIds: ['fact:game-event-2'],
            producer: 'narrator',
        });
        expect(result.turn.narrative).toEqual({
            status: 'final',
            producer: 'narrator',
            text: 'The attack deals 999 damage and leaves you at 0 HP.',
        });
        expect(result.turn.memoryUpdates).toEqual([result.update]);
        expect(result.turn.observation.views.player.hp).toBe(57);
    });

    test('prefers top-level authoritative API and does not open a chat-capturing session', async () => {
        const applyAuthoritativeFacts = jest.fn(async (_context, input) => {
            expect(input.sourceIds).toEqual(['game-event:event:2']);
            return [{ id: 'fact:top-level', action: 'create' }];
        });
        const openSession = jest.fn(async () => {
            throw new Error('authoritative ingestion must not open chat session');
        });
        const context = { chatId: 'chat-1' };
        const ingestion = createPostTurnMemoryIngestion({
            context,
            memoryApi: {
                applyAuthoritativeFacts,
                openSession,
            },
        });

        const result = await ingestion.ingest(turn(), {
            producer: 'narrator',
            finalProse: 'Final body.',
        });

        expect(result.status).toBe('ingested');
        expect(applyAuthoritativeFacts).toHaveBeenCalledTimes(1);
        expect(applyAuthoritativeFacts.mock.calls[0][0]).toBe(context);
        expect(openSession).not.toHaveBeenCalled();
    });

    test('Director final prose uses the same single Memory ingestion path', async () => {
        const applyAuthoritativeFacts = jest.fn(async () => [
            { id: 'fact:director-event', action: 'create' },
        ]);
        const ingestion = createPostTurnMemoryIngestion({
            context: {},
            memoryApi: {
                async openSession() {
                    return { applyAuthoritativeFacts };
                },
            },
        });

        const result = await ingestion.ingest(turn(), {
            producer: 'director',
            finalProse: 'Director-produced final body.',
        });

        expect(result.turn.narrative.producer).toBe('director');
        expect(result.update.producer).toBe('director');
        expect(applyAuthoritativeFacts).toHaveBeenCalledTimes(1);
    });

    test('requires finalized prose and a single recognized narrative producer', async () => {
        const ingestion = createPostTurnMemoryIngestion({
            context: {},
            memoryApi: {},
        });

        await expect(ingestion.ingest(turn(), {
            producer: 'critic',
            finalProse: 'draft',
        })).rejects.toThrow(/producer must be/);

        await expect(ingestion.ingest(turn(), {
            producer: 'narrator',
            finalProse: '',
        })).rejects.toThrow(/requires finalized prose/);
    });

    test('turns without committed Events finalize without fabricating authoritative facts', async () => {
        const emptyTurn = createTurnContext({
            anchor: {
                branchPath: [0],
                journalNextSeq: 1,
                serial: 7,
            },
            userInput: 'Hello',
        });
        const openSession = jest.fn();
        const ingestion = createPostTurnMemoryIngestion({
            context: {},
            memoryApi: { openSession },
        });

        const result = await ingestion.ingest(emptyTurn, {
            producer: 'narrator',
            finalProse: 'Hello.',
        });

        expect(result.status).toBe('no_authoritative_facts');
        expect(openSession).not.toHaveBeenCalled();
        expect(result.turn.narrative.status).toBe('final');
        expect(result.turn.memoryUpdates[0]).toMatchObject({
            status: 'no_authoritative_facts',
            eventIds: [],
            factIds: [],
        });
    });

    test('Memory unavailable does not alter committed Turn facts', async () => {
        const ingestion = createPostTurnMemoryIngestion({
            context: {},
            memoryApi: null,
        });
        const before = turn();

        const result = await ingestion.ingest(before, {
            producer: 'narrator',
            finalProse: 'Final body.',
        });

        expect(result.status).toBe('unavailable');
        expect(result.turn.committedEvents).toEqual(before.committedEvents);
        expect(result.turn.observation).toEqual(before.observation);
        expect(result.turn.memoryUpdates[0].status).toBe('unavailable');
    });
});
