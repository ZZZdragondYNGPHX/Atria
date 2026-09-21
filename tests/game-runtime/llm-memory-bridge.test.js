import { describe, expect, jest, test } from '@jest/globals';

import {
    buildMemoryRecallQuery,
    createMemoryRecallBridge,
    normalizeMemoryRecallPacket,
} from '../../public/scripts/extensions/game-runtime/llm/memory-bridge.js';
import { createTurnContext } from '../../public/scripts/extensions/game-runtime/llm/turn-context.js';

function makeTurn(overrides = {}) {
    return createTurnContext({
        anchor: {
            branchPath: [0, 1],
            journalNextSeq: 7,
            serial: 4,
        },
        userInput: 'Should I trust Alice now?',
        resolvedCommands: [{
            id: 'inspect_relationship',
            args: { target: 'Alice' },
        }],
        committedEvents: [{
            id: 'event:6',
            type: 'RelationshipInspected',
            payload: { target: 'Alice' },
            meta: {
                command: {
                    id: 'inspect_relationship',
                    transactionId: 'tx:6',
                },
            },
        }],
        observation: {
            views: {
                player: { hp: 57 },
                relationship: {
                    Alice: 'guarded',
                },
            },
            recentEvents: [],
        },
        ...overrides,
    });
}

describe('R5 Memory recall bridge', () => {
    test('builds recall query from authoritative turn projections instead of raw World State', () => {
        const query = buildMemoryRecallQuery(makeTurn());

        expect(query).toContain('Should I trust Alice now?');
        expect(query).toContain('inspect_relationship');
        expect(query).toContain('RelationshipInspected');
        expect(query).toContain('"hp":57');
        expect(query).toContain('"Alice":"guarded"');
        expect(query).not.toContain('secretSeed');
        expect(query).not.toContain('raw World');
    });

    test('normalizes Memory references as lower-authority historical context', () => {
        const turn = makeTurn();
        const packet = normalizeMemoryRecallPacket({
            text: 'Alice once promised to help. Player HP used to be 20.',
            selected: ['fact:alice_promise', 'relation:alice_player', 'episode:42'],
            tokenCount: 83,
            budget: 500,
            providers: [{
                providerId: 'legacy-status',
                status: 'active',
            }],
            diagnostics: ['vector_unconfigured'],
        }, turn, 'Alice trust');

        expect(packet).toMatchObject({
            id: 'memory-recall:' + turn.turnId,
            source: 'memory_graph',
            authority: 'historical_context',
            branch: {
                id: 'swipes:0.1',
                floor: 1,
                swipe: 1,
            },
            content: 'Alice once promised to help. Player HP used to be 20.',
            tokens: 83,
            budget: 500,
            provenance: {
                source: 'memory_graph',
                sourceCurrent: true,
                authorityRank: 5,
                referenceIds: [
                    'fact:alice_promise',
                    'relation:alice_player',
                    'episode:42',
                ],
            },
        });
        expect(packet.references).toEqual([
            {
                id: 'fact:alice_promise',
                kind: 'fact',
                source: 'memory_graph',
                authority: 'historical_context',
            },
            {
                id: 'relation:alice_player',
                kind: 'relation',
                source: 'memory_graph',
                authority: 'historical_context',
            },
            {
                id: 'episode:42',
                kind: 'episode',
                source: 'memory_graph',
                authority: 'historical_context',
            },
        ]);
        expect(Object.isFrozen(packet)).toBe(true);
    });

    test('uses the public Memory Graph session and verifies source currentness', async () => {
        const assertCurrent = jest.fn();
        const recallMemory = jest.fn(async (query, options) => ({
            text: 'Alice remembers the old inn.',
            selected: ['fact:inn_memory'],
            tokenCount: 22,
            budget: 300,
            diagnostics: [],
            providers: [],
            assertCurrent,
            query,
            options,
        }));
        const openSession = jest.fn(async () => ({ recallMemory }));
        const bridge = createMemoryRecallBridge({
            context: { chatId: 'chat-1' },
            memoryApi: { openSession },
            getCurrentBranchPath: () => [0, 1],
        });

        const result = await bridge.recall(makeTurn(), {
            at: 123,
            accountExistingState: false,
            corePacket: 'package constraints',
        });

        expect(result.status).toBe('recalled');
        expect(result.packet.references[0].id).toBe('fact:inn_memory');
        expect(openSession).toHaveBeenCalledTimes(1);
        expect(recallMemory).toHaveBeenCalledWith(
            expect.stringContaining('Should I trust Alice now?'),
            expect.objectContaining({
                at: 123,
                accountExistingState: false,
                corePacket: 'package constraints',
            }),
        );
        expect(assertCurrent).toHaveBeenCalledTimes(2);
    });

    test('Memory Graph unavailable degrades to no memory instead of breaking the turn', async () => {
        const bridge = createMemoryRecallBridge({
            context: { chatId: 'chat-1' },
            memoryApi: null,
            getCurrentBranchPath: () => [0, 1],
        });

        const result = await bridge.recall(makeTurn());

        expect(result).toMatchObject({
            status: 'unavailable',
            packet: null,
        });
        expect(result.query).toContain('Should I trust Alice now?');
    });

    test('rejects stale recall when the active swipe branch changes during retrieval', async () => {
        let branchPath = [0, 1];
        const bridge = createMemoryRecallBridge({
            context: { chatId: 'chat-1' },
            memoryApi: {
                async openSession() {
                    return {
                        async recallMemory() {
                            branchPath = [0, 2];
                            return {
                                text: 'stale branch memory',
                                selected: ['fact:stale'],
                                assertCurrent() {},
                            };
                        },
                    };
                },
            },
            getCurrentBranchPath: () => branchPath,
        });

        await expect(bridge.recall(makeTurn()))
            .rejects.toThrow(/branch changed from 'swipes:0.1' to 'swipes:0.2'/);
    });

    test('Memory source guard failure rejects recall before it enters Turn Context', async () => {
        const bridge = createMemoryRecallBridge({
            context: { chatId: 'chat-1' },
            memoryApi: {
                async openSession() {
                    return {
                        async recallMemory() {
                            return {
                                text: 'stale memory',
                                selected: ['fact:stale'],
                                assertCurrent() {
                                    throw Object.assign(new Error('Memory source changed'), {
                                        name: 'AbortError',
                                    });
                                },
                            };
                        },
                    };
                },
            },
            getCurrentBranchPath: () => [0, 1],
        });

        await expect(bridge.recall(makeTurn()))
            .rejects.toThrow(/Memory source changed/);
    });
});
