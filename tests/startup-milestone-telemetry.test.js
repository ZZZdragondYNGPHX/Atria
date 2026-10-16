import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { backendLogStore } from '../src/logging/store.js';

import {
    __startupTimingTestUtils,
    markStartupMilestone,
    startStartupPhase,
} from '../src/startup-timing.js';

describe('startup milestone telemetry', () => {
    afterEach(() => {
        __startupTimingTestUtils.clear();
        backendLogStore.clear();
        jest.restoreAllMocks();
    });

    test('emits each milestone only once', () => {
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        markStartupMilestone('test.once');
        markStartupMilestone('test.once');
        expect(log).toHaveBeenCalledTimes(1);
        const rendered = log.mock.calls[0].map(String).join(' ');
        expect(rendered).toContain('[startup]');
        expect(rendered).toContain('test.once');
        expect(backendLogStore.query({ modules: ['startup'] }).entries[0]).toMatchObject({
            category: 'milestone',
            event: 'test.once',
            source: 'structured',
        });
    });

    test('phase timer reports elapsed time', () => {
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        const finish = startStartupPhase('test.phase');
        const elapsed = finish('done');
        expect(elapsed).toBeGreaterThanOrEqual(0);
        const rendered = log.mock.calls[0].map(String).join(' ');
        expect(rendered).toContain('phase test.phase');
        expect(rendered).toContain('done');
        expect(backendLogStore.query({ events: ['phase.test.phase'] }).entries[0]).toMatchObject({
            module: 'startup',
            category: 'phase',
            source: 'structured',
        });
    });

});
