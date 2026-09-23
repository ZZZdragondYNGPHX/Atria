import { describe, expect, test } from '@jest/globals';

import {
    TURN_FACT_PRECEDENCE,
    advanceTurnContext,
    createTurnContext,
    createTurnId,
} from '../../public/scripts/extensions/game-runtime/llm/turn-context.js';

function anchor(overrides = {}) {
    return {
        sessionId: 'session_native',
        branchId: 'branch_root',
        revisionId: 'revision_7',
        eventSeq: 7,
        serial: 3,
        ...overrides,
    };
}

describe('A3 Turn Context contract', () => {
    test('creates stable Native Session/Branch/Revision anchored identity', () => {
        expect(createTurnId(anchor()))
            .toBe('turn:session_native:branch_root:revision_7:event:7:n:3');

        const turn = createTurnContext({
            anchor: anchor(),
            userInput: 'Attack the guard',
        });
        expect(turn.anchor).toEqual(anchor());
        expect(turn.turnId).toBe(createTurnId(anchor()));
        expect(Object.isFrozen(turn.anchor)).toBe(true);
    });

    test('requires Native authority identity instead of floor/swipe identity', () => {
        expect(() => createTurnContext({
            anchor: { eventSeq: 1, serial: 0 },
        })).toThrow(/Session\/Branch\/Revision/);
    });

    test('pins architectural fact precedence into every turn', () => {
        const turn = createTurnContext({ anchor: anchor() });
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

    test('provenance identifies Native world/session/timeline authorities', () => {
        const turn = createTurnContext({
            anchor: anchor(),
            commandResults: [{
                commandId: 'attack',
                transactionId: 'tx:7',
                status: 'committed',
            }],
            committedEvents: [{
                id: 'event:branch_root:7',
                type: 'DamageDealt',
                meta: { command: { id: 'attack' } },
            }],
            recentChat: [{ role: 'assistant', content: 'The guard staggers.' }],
        });

        expect(turn.provenance.worldObservation).toEqual({
            authorityRank: 1,
            source: 'native_world_state',
            branchId: 'branch_root',
        });
        expect(turn.provenance.committedEvents.source).toBe('native_session_revision');
        expect(turn.provenance.activeBranchChat).toEqual({
            authorityRank: 4,
            source: 'native_timeline',
            branchId: 'branch_root',
            itemCount: 1,
        });
    });

    test('advances immutable turn facts without changing the Native anchor', () => {
        const turn = createTurnContext({
            anchor: anchor(),
            userInput: 'Open the door',
        });
        const advanced = advanceTurnContext(turn, {
            memories: [{ id: 'fact:key' }],
            orchestration: { mode: 'agenda' },
        });
        expect(advanced.turnId).toBe(turn.turnId);
        expect(advanced.anchor).toEqual(turn.anchor);
        expect(advanced.memories).toHaveLength(1);

        expect(() => advanceTurnContext(turn, { anchor: anchor({ revisionId: 'revision_8' }) }))
            .toThrow(/cannot change 'anchor'/);
    });
});
