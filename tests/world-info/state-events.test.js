import { describe, test, expect } from '@jest/globals';
import {
    buildWorldInfoEventRuntimeState,
    evaluateWorldInfoStateEvent,
    evaluateWorldInfoStateEvents,
    fingerprintWorldInfoStateSnapshot,
    resolveWorldInfoEventComparisonBaseline,
    snapshotWorldInfoStateProviders,
} from '../../public/scripts/atri-world-info-state-events.js';

const providers = place => [{
    providerId: 'mvu',
    status: 'ready',
    fields: [
        { path: ['scene', 'place'], value: place },
        { path: ['quest', 'stage'], value: 2 },
    ],
}];

describe('W-03b world info state transition events', () => {
    test('first observation is unknown and never fabricates a transition', () => {
        const current = snapshotWorldInfoStateProviders(providers('clocktower'));
        expect(evaluateWorldInfoStateEvent({
            providerId: 'mvu',
            path: ['scene', 'place'],
            from: 'tavern',
            to: 'clocktower',
        }, null, current)).toMatchObject({
            status: 'unknown',
            reason: 'baseline_absent',
        });
    });

    test('exact from/to transition matches only on a real change', () => {
        const before = snapshotWorldInfoStateProviders(providers('tavern'));
        const after = snapshotWorldInfoStateProviders(providers('clocktower'));
        const event = {
            providerId: 'mvu',
            path: ['scene', 'place'],
            from: 'tavern',
            to: 'clocktower',
        };
        expect(evaluateWorldInfoStateEvent(event, before, after)).toMatchObject({
            status: 'true',
            reason: 'transition_matched',
            previous: 'tavern',
            current: 'clocktower',
        });
        expect(evaluateWorldInfoStateEvent(event, after, after)).toMatchObject({
            status: 'false',
            reason: 'unchanged',
        });
    });

    test('from-only and to-only transitions are supported', () => {
        const before = snapshotWorldInfoStateProviders(providers('tavern'));
        const after = snapshotWorldInfoStateProviders(providers('clocktower'));
        expect(evaluateWorldInfoStateEvent({
            providerId: 'mvu', path: ['scene', 'place'], from: 'tavern',
        }, before, after).status).toBe('true');
        expect(evaluateWorldInfoStateEvent({
            providerId: 'mvu', path: ['scene', 'place'], to: 'clocktower',
        }, before, after).status).toBe('true');
    });

    test('unknown previous/current provider data fails closed', () => {
        const before = snapshotWorldInfoStateProviders([{ providerId: 'mvu', status: 'absent', fields: [] }]);
        const after = snapshotWorldInfoStateProviders(providers('clocktower'));
        const event = { providerId: 'mvu', path: ['scene', 'place'], to: 'clocktower' };
        expect(evaluateWorldInfoStateEvent(event, before, after)).toMatchObject({
            status: 'unknown',
            reason: 'previous_unknown',
        });
        const unavailable = snapshotWorldInfoStateProviders([{ providerId: 'mvu', status: 'initializing', fields: [] }]);
        expect(evaluateWorldInfoStateEvent(event, after, unavailable)).toMatchObject({
            status: 'unknown',
            reason: 'current_unknown',
        });
    });

    test('invalid event shape is unknown', () => {
        const current = snapshotWorldInfoStateProviders(providers('clocktower'));
        expect(evaluateWorldInfoStateEvent({
            providerId: 'mvu', path: ['scene', 'place'],
        }, current, current)).toMatchObject({ status: 'unknown', reason: 'invalid_event' });
        expect(evaluateWorldInfoStateEvent({
            providerId: 'mvu', path: ['__proto__'], to: 'clocktower',
        }, current, current)).toMatchObject({ status: 'unknown', reason: 'invalid_event' });
    });

    test('ALL and ANY preserve unknown semantics', () => {
        const before = snapshotWorldInfoStateProviders(providers('tavern'));
        const after = snapshotWorldInfoStateProviders(providers('clocktower'));
        const yes = { providerId: 'mvu', path: ['scene', 'place'], to: 'clocktower' };
        const no = { providerId: 'mvu', path: ['quest', 'stage'], to: 3 };
        const unknown = { providerId: 'lorestate', path: ['scene'], to: 'clocktower' };

        expect(evaluateWorldInfoStateEvents([yes, unknown], before, after, 'all').status).toBe('unknown');
        expect(evaluateWorldInfoStateEvents([no, unknown], before, after, 'all').status).toBe('false');
        expect(evaluateWorldInfoStateEvents([yes, unknown], before, after, 'any').status).toBe('true');
        expect(evaluateWorldInfoStateEvents([no, unknown], before, after, 'any').status).toBe('unknown');
    });

    test('runtime state replays a committed transition on the same floor/swipe', () => {
        const before = snapshotWorldInfoStateProviders(providers('tavern'));
        const after = snapshotWorldInfoStateProviders(providers('clocktower'));
        const scope = { floor: 4, swipeId: 0 };
        const state = buildWorldInfoEventRuntimeState({}, before, after, scope);
        const replay = resolveWorldInfoEventComparisonBaseline(state, after, scope);
        expect(replay.replay).toBe(true);
        expect(fingerprintWorldInfoStateSnapshot(replay.baseline))
            .toBe(fingerprintWorldInfoStateSnapshot(before));

        const nextFloor = resolveWorldInfoEventComparisonBaseline(state, after, { floor: 5, swipeId: 0 });
        expect(nextFloor.replay).toBe(false);
        expect(fingerprintWorldInfoStateSnapshot(nextFloor.baseline))
            .toBe(fingerprintWorldInfoStateSnapshot(after));
    });

    test('no baseline seeds current state without inventing a transition record', () => {
        const after = snapshotWorldInfoStateProviders(providers('clocktower'));
        const state = buildWorldInfoEventRuntimeState({}, null, after, { floor: 2, swipeId: 0 });
        expect(state.transition).toBeNull();
        expect(fingerprintWorldInfoStateSnapshot(state.baseline))
            .toBe(fingerprintWorldInfoStateSnapshot(after));
    });
});
