import { describe, expect, jest, test } from '@jest/globals';

import {
    createGameTurnController,
    createTurnTransaction,
} from '../../public/scripts/extensions/game-runtime/llm/turn-controller.js';
import {
    advanceTurnContext,
    createTurnContext,
} from '../../public/scripts/extensions/game-runtime/llm/turn-context.js';

function baseTurn() {
    return createTurnContext({
        anchor: {
            branchPath: [0],
            journalNextSeq: 2,
            serial: 30,
        },
        origin: 'free_text',
        userInput: 'Open the chest',
        observation: {
            views: {
                chest: { open: false },
            },
            recentEvents: [],
        },
    });
}

function finalizedExecutor(eventType = 'ChestOpened', prose = 'The chest opens.') {
    return async ({ turn, transition, branch }) => {
        transition('resolving');
        transition('calculating');
        transition('recalling');
        transition('narrating');
        return {
            status: 'finalized',
            turn: advanceTurnContext(turn, {
                committedEvents: [{
                    id: 'event:' + branch.branchPath.at(-1),
                    type: eventType,
                    payload: {},
                    branchPath: [...branch.branchPath],
                }],
                observation: {
                    views: {
                        chest: {
                            open: eventType === 'ChestOpened',
                        },
                    },
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
                branchPath: [0, attemptIndex],
                variantId: 'variant:' + attemptIndex,
            };
        },
        async prepareAttempt(input) {
            calls.push(['prepare', input.attemptId, [...input.branch.branchPath]]);
        },
        async activateAttempt(input) {
            calls.push(['activate', input.attemptId, [...input.branch.branchPath]]);
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
            calls.push(['switch', input.attemptId, [...input.branch.branchPath]]);
        },
    };
}

describe('R5 Turn Controller and transaction lifecycle', () => {
    test('Turn Transaction enforces the canonical phase machine', () => {
        const tx = createTurnTransaction({
            turnId: 'turn:test',
            attemptId: 'attempt:1',
        });

        expect(tx.phase).toBe('submitted');
        tx.transition('resolving');
        tx.transition('calculating');
        tx.transition('recalling');
        tx.transition('orchestrating');
        tx.transition('narrating');
        tx.finalize({ ok: true });

        expect(tx.snapshot()).toMatchObject({
            phase: 'finalized',
            active: true,
            deleted: false,
            result: { ok: true },
        });
        expect(() => tx.transition('calculating')).toThrow(/Invalid Turn Transaction transition/);
    });

    test('Stop aborts unfinished attempt and never activates finalized artifacts', async () => {
        const adapter = branchAdapter();
        const controller = createGameTurnController({ adapter });
        const turn = baseTurn();

        const running = controller.submit(turn, {
            execute: async ({ transition, signal }) => {
                transition('resolving');
                await new Promise((resolve, reject) => {
                    signal.addEventListener('abort', () => {
                        reject(Object.assign(new Error('stopped'), {
                            name: 'AbortError',
                        }));
                    }, { once: true });
                });
                return resolve;
            },
        });

        await Promise.resolve();
        const attemptId = controller.getTurn(turn.turnId).attemptIds[0];
        expect(controller.stop(attemptId)).toBe(true);

        const stopped = await running;
        expect(stopped).toMatchObject({
            attemptId,
            phase: 'aborted',
            active: false,
        });
        expect(adapter.calls.some(call => call[0] === 'activate')).toBe(false);
        expect(adapter.calls.some(call => call[0] === 'deactivate' && call[2] === 'user_stop')).toBe(true);
    });

    test('Undo returns to pre-turn projection and deactivates the finalized attempt', async () => {
        const adapter = branchAdapter();
        const controller = createGameTurnController({ adapter });
        const turn = baseTurn();
        const done = await controller.submit(turn, {
            execute: finalizedExecutor(),
        });

        expect(done.active).toBe(true);
        expect(await controller.undo(turn.turnId)).toBe(true);
        expect(controller.getTurn(turn.turnId).activeAttemptId).toBeNull();
        expect(controller.getAttempt(done.attemptId).transaction.active).toBe(false);
        expect(adapter.calls).toContainEqual(['restore', done.attemptId]);
    });

    test('Rewrite Narrative preserves Command/Event/Observation facts and changes prose only', async () => {
        const adapter = branchAdapter();
        const controller = createGameTurnController({ adapter });
        const done = await controller.submit(baseTurn(), {
            execute: finalizedExecutor(),
        });
        const before = controller.getAttempt(done.attemptId);
        const rewritten = await controller.rewriteNarrative(done.attemptId, {
            rewrite: async turn => {
                expect(turn.committedEvents).toEqual(before.turn.committedEvents);
                return 'The lid opens with a quieter creak.';
            },
        });

        expect(rewritten.turn.committedEvents).toEqual(before.turn.committedEvents);
        expect(rewritten.turn.observation).toEqual(before.turn.observation);
        expect(rewritten.turn.narrative.text).toBe('The lid opens with a quieter creak.');
        expect(rewritten.variantId).toBe(done.attemptId + ':prose:1');
        expect(adapter.calls).toContainEqual([
            'rewrite',
            done.attemptId,
            done.attemptId + ':prose:1',
            'The lid opens with a quieter creak.',
        ]);
    });

    test('Retry Turn creates sibling attempt branch and Switch Variant restores matching branch', async () => {
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

        expect(firstAttempt.branch.branchPath).toEqual([0, 0]);
        expect(retryAttempt.branch.branchPath).toEqual([0, 1]);
        expect(firstAttempt.turn.committedEvents[0].type).toBe('ChestOpened');
        expect(retryAttempt.turn.committedEvents[0].type).toBe('ChestJammed');
        expect(firstAttempt.transaction.active).toBe(false);
        expect(retryAttempt.transaction.active).toBe(true);

        await controller.switchVariant(first.attemptId);
        expect(controller.getTurn(turn.turnId).activeAttemptId).toBe(first.attemptId);
        expect(controller.getAttempt(first.attemptId).transaction.active).toBe(true);
        expect(controller.getAttempt(retry.attemptId).transaction.active).toBe(false);
        expect(adapter.calls).toContainEqual(['switch', first.attemptId, [0, 0]]);
    });

    test('Delete Assistant Result deactivates every outcome attempt for that Turn', async () => {
        const adapter = branchAdapter();
        const controller = createGameTurnController({ adapter });
        const turn = baseTurn();

        const first = await controller.submit(turn, {
            execute: finalizedExecutor(),
        });
        const retry = await controller.retryTurn(turn.turnId, {
            execute: finalizedExecutor('ChestJammed', 'The lock jams.'),
        });

        await controller.deleteAssistantResult(retry.attemptId);

        expect(controller.getTurn(turn.turnId).activeAttemptId).toBeNull();
        expect(controller.getAttempt(first.attemptId).transaction.deleted).toBe(true);
        expect(controller.getAttempt(retry.attemptId).transaction.deleted).toBe(true);
        await expect(controller.switchVariant(first.attemptId))
            .rejects.toThrow(/unfinished or deleted/);
        expect(adapter.calls).toContainEqual(['delete', retry.attemptId]);
    });
});
