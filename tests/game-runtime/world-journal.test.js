import { describe, expect, test } from '@jest/globals';

import {
    addWorldSnapshot,
    appendWorldEvents,
    normalizeWorldJournal,
    replayWorldJournal,
} from '../../public/scripts/extensions/game-runtime/world/journal.js';

const initialState = {
    player: { hp: 20 },
    flags: [],
};

const reducers = {
    DamageDealt(state, event) {
        return {
            ...state,
            player: {
                ...state.player,
                hp: Math.max(0, state.player.hp - event.payload.amount),
            },
        };
    },
    FlagSet(state, event) {
        return {
            ...state,
            flags: [...state.flags, event.payload.flag],
        };
    },
};

describe('World Event Journal replay', () => {
    test('replay is deterministic and derives state from initial state plus events', () => {
        let journal = normalizeWorldJournal(null);
        journal = appendWorldEvents(journal, [
            { type: 'DamageDealt', payload: { amount: 3 } },
            { type: 'FlagSet', payload: { flag: 'door_open' } },
        ], [0, 0]).journal;

        const first = replayWorldJournal({ initialState, journal, branchPath: [0, 0, 0], reducers });
        const second = replayWorldJournal({ initialState, journal, branchPath: [0, 0, 0], reducers });

        expect(first.state).toEqual({
            player: { hp: 17 },
            flags: ['door_open'],
        });
        expect(second.state).toEqual(first.state);
        expect(second.appliedEventIds).toEqual(first.appliedEventIds);
    });

    test('switching an earlier swipe restores the matching event branch', () => {
        let journal = normalizeWorldJournal(null);
        journal = appendWorldEvents(journal, [
            { type: 'FlagSet', payload: { flag: 'shared' } },
        ], [0]).journal;
        journal = appendWorldEvents(journal, [
            { type: 'DamageDealt', payload: { amount: 8 } },
        ], [0, 0]).journal;
        journal = appendWorldEvents(journal, [
            { type: 'FlagSet', payload: { flag: 'alternate' } },
        ], [0, 1]).journal;

        const branchA = replayWorldJournal({ initialState, journal, branchPath: [0, 0, 0], reducers });
        const branchB = replayWorldJournal({ initialState, journal, branchPath: [0, 1, 0], reducers });

        expect(branchA.state.player.hp).toBe(12);
        expect(branchA.state.flags).toEqual(['shared']);
        expect(branchB.state.player.hp).toBe(20);
        expect(branchB.state.flags).toEqual(['shared', 'alternate']);
    });

    test('a compatible snapshot accelerates replay without replacing event truth', () => {
        let journal = normalizeWorldJournal(null);
        const first = appendWorldEvents(journal, [
            { type: 'DamageDealt', payload: { amount: 2 } },
        ], [0]);
        journal = first.journal;
        const stateAtOne = replayWorldJournal({ initialState, journal, branchPath: [0], reducers }).state;
        journal = addWorldSnapshot(journal, {
            state: stateAtOne,
            seq: first.committed[0].seq,
            branchPath: [0],
        }).journal;
        journal = appendWorldEvents(journal, [
            { type: 'DamageDealt', payload: { amount: 5 } },
        ], [0, 0]).journal;

        const replayed = replayWorldJournal({ initialState, journal, branchPath: [0, 0], reducers });
        expect(replayed.snapshot.seq).toBe(1);
        expect(replayed.state.player.hp).toBe(13);
        expect(replayed.appliedEventIds).toEqual(['event:2']);
    });

    test('unknown event types fail replay instead of silently dropping facts', () => {
        const journal = appendWorldEvents(null, [
            { type: 'UnknownFact', payload: {} },
        ], [0]).journal;

        expect(() => replayWorldJournal({
            initialState,
            journal,
            branchPath: [0],
            reducers,
        })).toThrow(/No World reducer/);
    });
});
