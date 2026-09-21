import { describe, expect, test } from '@jest/globals';

import {
    TURN_FACT_PRECEDENCE,
    advanceTurnContext,
    createTurnContext,
    createTurnId,
} from '../../public/scripts/extensions/game-runtime/llm/turn-context.js';

describe('R5 Turn Context contract', () => {
    test('creates a stable branch/floor/swipe anchored identity', () => {
        const anchor = {
            branchPath: [0, 2, 1],
            journalNextSeq: 7,
            serial: 3,
        };

        expect(createTurnId(anchor))
            .toBe('turn:swipes_0.2.1:floor:2:swipe:1:seq:7:n:3');

        const turn = createTurnContext({
            anchor,
            userInput: 'Attack the guard',
        });

        expect(turn.turnId).toBe(createTurnId(anchor));
        expect(turn.anchor).toEqual({
            branchPath: [0, 2, 1],
            branchId: 'swipes:0.2.1',
            floor: 2,
            swipe: 1,
            journalNextSeq: 7,
            serial: 3,
        });
        expect(Object.isFrozen(turn)).toBe(true);
        expect(Object.isFrozen(turn.anchor)).toBe(true);
    });

    test('pins architectural fact precedence into every turn', () => {
        const turn = createTurnContext({
            anchor: { branchPath: [0], journalNextSeq: 2 },
        });

        expect(turn.authority.precedence).toEqual(TURN_FACT_PRECEDENCE);
        expect(turn.authority.precedence).toEqual([
            'world_observation',
            'committed_events',
            'command_results',
            'active_branch_chat',
            'memory_recall',
            'orchestrator_guidance',
        ]);
    });

    test('UI typed-command turns explicitly skip Intent Resolver', () => {
        const turn = createTurnContext({
            origin: 'ui_action',
            anchor: { branchPath: [0, 1], journalNextSeq: 4 },
        });

        expect(turn.resolution).toEqual({
            intentResolver: 'skipped',
            eventInterpreter: 'not_requested',
            reason: 'typed_ui_command',
        });
    });

    test('advances one immutable Turn Context without changing identity/anchor', () => {
        const turn = createTurnContext({
            anchor: {
                branchPath: [0, 1],
                journalNextSeq: 4,
                serial: 1,
            },
            userInput: 'Open the door',
        });

        const advanced = advanceTurnContext(turn, {
            memories: [{
                text: 'A key was found earlier',
                provenance: 'memory:event:1',
            }],
            orchestration: {
                mode: 'agenda',
                guidance: 'Emphasize tension',
            },
        });

        expect(advanced).not.toBe(turn);
        expect(advanced.turnId).toBe(turn.turnId);
        expect(advanced.anchor).toEqual(turn.anchor);
        expect(advanced.userInput).toBe('Open the door');
        expect(advanced.memories).toHaveLength(1);
        expect(advanced.orchestration.mode).toBe('agenda');

        expect(() => advanceTurnContext(turn, {
            turnId: 'different',
        })).toThrow(/cannot change 'turnId'/);
        expect(() => advanceTurnContext(turn, {
            anchor: { branchPath: [9] },
        })).toThrow(/cannot change 'anchor'/);
    });
});
