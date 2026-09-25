import { describe, expect, test } from '@jest/globals';

import {
    createGameTurnController,
    createTurnTransaction,
} from '../../public/scripts/native/experience/llm/turn-controller.js';
import {
    advanceTurnContext,
    createTurnContext,
} from '../../public/scripts/native/experience/llm/turn-context.js';

function baseTurn() {
    return createTurnContext({
        anchor: {
            sessionId: 'session_native',
            branchId: 'branch_base',
            revisionId: 'revision_base',
            eventSeq: 2,
            serial: 30,
        },
        origin: 'free_text',
        userInput: 'Open the chest',
    });
}

function finalizedExecutor(eventType = 'ChestOpened', prose = 'The chest opens.') {
    return async ({ turn, branch, transition }) => {
        transition('resolving');
        transition('calculating');
        transition('recalling');
        transition('narrating');
        return {
            status: 'finalized',
            turn: advanceTurnContext(turn, {
                committedEvents: [{
                    id: 'event:' + branch.branchId,
                    type: eventType,
                    payload: {},
                    branchId: branch.branchId,
                }],
                observation: {
                    views: { chest: { open: eventType === 'ChestOpened' } },
                    recentEvents: [],
                },
                narrative: {
                    status: 'final',
                    producer: 'narrator',
                    text: prose,
                },
            }),
        };
    };
}

function branchAdapter() {
    const calls = [];
    return {
        calls,
        async createAttemptBranch({ attemptIndex }) {
            calls.push(['create', attemptIndex]);
            return {
                sessionId: 'session_native',
                branchId: 'branch_attempt_' + attemptIndex,
                revisionId: 'revision_attempt_' + attemptIndex,
            };
        },
        async prepareAttempt(input) {
            calls.push(['prepare', input.attemptId, input.branch.branchId]);
        },
        async activateAttempt(input) {
            calls.push(['activate', input.attemptId, input.branch.branchId]);
        },
        async deactivateAttempt(input) {
            calls.push(['deactivate', input.attemptId, input.reason, input.restoreAttemptId || null]);
        },
        async restoreBeforeTurn(input) {
            calls.push(['restore', input.attemptId]);
        },
        async deleteAssistantResult(input) {
            calls.push(['delete', input.attemptId]);
        },
        async replaceNarrative(input) {
            calls.push(['rewrite', input.attemptId, input.variantId, input.prose]);
        },
        async activateAttemptBranch(input) {
            calls.push(['switch', input.attemptId, input.branch.branchId]);
        },
    };
}

describe('A3 Turn Controller and Native Branch lifecycle', () => {
    test('Turn Transaction enforces the canonical phase machine', () => {
        const tx = createTurnTransaction({ turnId: 'turn:test', attemptId: 'attempt:1' });
        expect(tx.phase).toBe('submitted');
        tx.transition('resolving');
        tx.transition('calculating');
        tx.transition('recalling');
        tx.transition('narrating');
        tx.finalize({ ok: true });
        expect(tx.phase).toBe('finalized');
        expect(() => tx.transition('calculating')).toThrow(/Invalid Turn Transaction transition/);
    });

    test('Stop aborts unfinished attempt and never activates finalized artifacts', async () => {
        const adapter = branchAdapter();
        const controller = createGameTurnController({ adapter });
        const turn = baseTurn();
        let markStarted;
        const started = new Promise(resolve => {
            markStarted = resolve;
        });
        const running = controller.submit(turn, {
            execute: async ({ signal }) => {
                markStarted();
                if (!signal.aborted) {
                    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
                }
                return null;
            },
        });
        await started;
        const attemptId = controller.getTurn(turn.turnId).attemptIds[0];
        expect(controller.stop(attemptId)).toBe(true);
        const stopped = await running;
        expect(stopped).toMatchObject({ attemptId, phase: 'aborted', active: false });
        expect(adapter.calls.some(call => call[0] === 'activate')).toBe(false);
    });

    test('Undo returns to the pre-turn Native branch', async () => {
        const adapter = branchAdapter();
        const controller = createGameTurnController({ adapter });
        const turn = baseTurn();
        const done = await controller.submit(turn, { execute: finalizedExecutor() });
        expect(done.active).toBe(true);
        expect(await controller.undo(turn.turnId)).toBe(true);
        expect(controller.getTurn(turn.turnId).activeAttemptId).toBeNull();
        expect(adapter.calls).toContainEqual(['restore', done.attemptId]);
    });

    test('Rewrite Narrative preserves authoritative facts while delegating persistence policy to adapter', async () => {
        const adapter = branchAdapter();
        const controller = createGameTurnController({ adapter });
        const done = await controller.submit(baseTurn(), { execute: finalizedExecutor() });
        const before = controller.getAttempt(done.attemptId);
        const rewritten = await controller.rewriteNarrative(done.attemptId, {
            rewrite: async turn => {
                expect(turn.committedEvents).toEqual(before.turn.committedEvents);
                return 'The lid opens with a quieter creak.';
            },
        });
        expect(rewritten.turn.committedEvents).toEqual(before.turn.committedEvents);
        expect(adapter.calls).toContainEqual([
            'rewrite',
            done.attemptId,
            done.attemptId + ':prose:1',
            'The lid opens with a quieter creak.',
        ]);
    });

    test('Retry creates a sibling Native Branch and branch switching restores exact attempt', async () => {
        const adapter = branchAdapter();
        const controller = createGameTurnController({ adapter });
        const turn = baseTurn();

        const first = await controller.submit(turn, {
            execute: finalizedExecutor('ChestOpened', 'The chest opens.'),
        });
        const retry = await controller.retryTurn(turn.turnId, {
            execute: finalizedExecutor('ChestJammed', 'The lock jams.'),
        });

        const firstAttempt = controller.getAttempt(first.attemptId);
        const retryAttempt = controller.getAttempt(retry.attemptId);
        expect(firstAttempt.branch).toEqual({
            sessionId: 'session_native',
            branchId: 'branch_attempt_0',
            revisionId: 'revision_attempt_0',
        });
        expect(retryAttempt.branch.branchId).toBe('branch_attempt_1');
        expect(firstAttempt.turn.committedEvents[0].branchId).toBe('branch_attempt_0');
        expect(retryAttempt.turn.committedEvents[0].branchId).toBe('branch_attempt_1');

        await controller.switchVariant(first.attemptId);
        expect(controller.getTurn(turn.turnId).activeAttemptId).toBe(first.attemptId);
        expect(adapter.calls).toContainEqual(['switch', first.attemptId, 'branch_attempt_0']);
    });

    test('Delete Assistant Result deactivates every attempt for that Turn', async () => {
        const adapter = branchAdapter();
        const controller = createGameTurnController({ adapter });
        const turn = baseTurn();
        const first = await controller.submit(turn, { execute: finalizedExecutor() });
        const retry = await controller.retryTurn(turn.turnId, {
            execute: finalizedExecutor('ChestJammed', 'The lock jams.'),
        });
        await controller.deleteAssistantResult(retry.attemptId);
        expect(controller.getAttempt(first.attemptId).transaction.deleted).toBe(true);
        expect(controller.getAttempt(retry.attemptId).transaction.deleted).toBe(true);
        await expect(controller.switchVariant(first.attemptId)).rejects.toThrow(/unfinished or deleted/);
    });
});
