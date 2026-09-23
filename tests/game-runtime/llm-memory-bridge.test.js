import { describe, expect, jest, test } from '@jest/globals';

import {
    buildMemoryRecallQuery,
    createMemoryRecallBridge,
    normalizeMemoryRecallPacket,
} from '../../public/scripts/extensions/game-runtime/llm/memory-bridge.js';
import { createTurnContext } from '../../public/scripts/extensions/game-runtime/llm/turn-context.js';

function identity(overrides = {}) {
    return {
        sessionId: 'session_native',
        branchId: 'branch_root',
        revisionId: 'revision_7',
        ...overrides,
    };
}

function makeTurn(overrides = {}) {
    return createTurnContext({
        anchor: {
            ...identity(),
            eventSeq: 7,
            serial: 4,
        },
        userInput: 'Should I trust Alice now?',
        resolvedCommands: [{ id: 'inspect_relationship', args: { target: 'Alice' } }],
        committedEvents: [{
            id: 'event:branch_root:6',
            type: 'RelationshipInspected',
            payload: { target: 'Alice' },
            branchId: 'branch_root',
            meta: { command: { id: 'inspect_relationship', transactionId: 'tx:6' } },
        }],
        observation: {
            views: { player: { hp: 57 }, relationship: { Alice: 'guarded' } },
            recentEvents: [],
        },
        ...overrides,
    });
}

describe('A3 Memory recall bridge', () => {
    test('builds recall query from authoritative turn projections', () => {
        const query = buildMemoryRecallQuery(makeTurn());
        expect(query).toContain('Should I trust Alice now?');
        expect(query).toContain('inspect_relationship');
        expect(query).toContain('RelationshipInspected');
        expect(query).toContain('"hp":57');
    });

    test('normalizes recall provenance against Native Branch/Revision identity', () => {
        const turn = makeTurn();
        const packet = normalizeMemoryRecallPacket({
            text: 'Alice once promised to help.',
            selected: ['fact:alice_promise'],
        }, turn, 'Alice trust');

        expect(packet.branch).toEqual(identity());
        expect(packet.references[0]).toEqual({
            id: 'fact:alice_promise',
            kind: 'fact',
            source: 'memory_graph',
            authority: 'historical_context',
        });
    });

    test('uses public Memory Graph API and checks Native branch currentness', async () => {
        const assertCurrent = jest.fn();
        const recallMemory = jest.fn(async () => ({
            text: 'Alice remembers the old inn.',
            selected: ['fact:inn_memory'],
            assertCurrent,
        }));
        const bridge = createMemoryRecallBridge({
            context: { chatId: 'chat-1' },
            memoryApi: { openSession: jest.fn(async () => ({ recallMemory })) },
            getCurrentBranchIdentity: () => identity(),
        });

        const result = await bridge.recall(makeTurn());
        expect(result.status).toBe('recalled');
        expect(assertCurrent).toHaveBeenCalledTimes(2);
    });

    test('unavailable Memory Graph degrades without changing game authority', async () => {
        const bridge = createMemoryRecallBridge({
            context: { chatId: 'chat-1' },
            memoryApi: null,
            getCurrentBranchIdentity: () => identity(),
        });
        await expect(bridge.recall(makeTurn())).resolves.toMatchObject({
            status: 'unavailable',
            packet: null,
        });
    });

    test('rejects recall when the active Native branch changes during retrieval', async () => {
        let current = identity();
        const bridge = createMemoryRecallBridge({
            context: { chatId: 'chat-1' },
            memoryApi: {
                async openSession() {
                    return {
                        async recallMemory() {
                            current = identity({ branchId: 'branch_retry', revisionId: 'revision_8' });
                            return {
                                text: 'stale branch memory',
                                selected: ['fact:stale'],
                                assertCurrent() {},
                            };
                        },
                    };
                },
            },
            getCurrentBranchIdentity: () => current,
        });

        await expect(bridge.recall(makeTurn()))
            .rejects.toThrow(/branch changed from 'branch_root' to 'branch_retry'/);
    });
});
