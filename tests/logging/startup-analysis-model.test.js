import { describe, expect, test } from '@jest/globals';

import {
    buildClientStartupSlices,
    buildSlowStartupItems,
    buildStartupDonut,
    buildStartupTimeline,
    normalizeDonutSlices,
} from '../../public/scripts/logging/startup-analysis-model.js';

function sessionFixture() {
    return {
        server: {
            phases: [
                { name: 'bootstrap', durationMs: 50, timestamp: 1000 },
                { name: 'routes', durationMs: 100, timestamp: 1120 },
            ],
        },
        client: {
            timings: {
                initJsStart: 0,
                firstLoadStart: 100,
                csrfDone: 150,
                getSettingsDone: 300,
                loaderHidden: 500,
                batch1Done: 600,
                batch2Done: 800,
                batch3Done: 900,
                appReady: 1100,
            },
            durations: {
                extensionsDiscover: 20,
                extensionsManifests: 30,
                extensionsActivate: 80,
            },
        },
        extensions: [
            { name: 'slow-ext', totalMs: 200 },
            { name: 'fast-ext', totalMs: 10 },
        ],
    };
}

describe('startup analysis model', () => {
    test('client slices are sequential intervals rather than overlapping totals', () => {
        const slices = buildClientStartupSlices(sessionFixture());
        expect(slices).toHaveLength(8);
        expect(slices.map(item => item.durationMs)).toEqual([100, 50, 150, 200, 100, 200, 100, 200]);
    });

    test('donut normalization produces contiguous non-overlapping slices summing to 100%', () => {
        const donut = normalizeDonutSlices([
            { label: 'a', durationMs: 10 },
            { label: 'b', durationMs: 20 },
            { label: 'c', durationMs: 30 },
        ]);
        expect(donut.totalMs).toBe(60);
        expect(donut.slices[0].startRatio).toBe(0);
        expect(donut.slices.at(-1).endRatio).toBe(1);
        for (let i = 1; i < donut.slices.length; i++) {
            expect(donut.slices[i].startRatio).toBeCloseTo(donut.slices[i - 1].endRatio, 12);
        }
        expect(donut.slices.reduce((sum, item) => sum + item.percentage, 0)).toBeCloseTo(100, 10);
    });

    test('zero and missing timing data stay stable without NaN percentages', () => {
        const donut = buildStartupDonut({ client: { timings: {} } }, 'client');
        expect(donut).toEqual({ totalMs: 0, slices: [] });
        expect(JSON.stringify(donut)).not.toContain('NaN');
    });

    test('timeline has bounded non-negative offsets for all scopes', () => {
        const timeline = buildStartupTimeline(sessionFixture());
        for (const rows of Object.values(timeline)) {
            for (const row of rows) {
                expect(row.startMs).toBeGreaterThanOrEqual(0);
                expect(row.endMs).toBeGreaterThanOrEqual(row.startMs);
                expect(row.durationMs).toBeGreaterThan(0);
            }
        }
    });

    test('slow list merges server, client and per-extension work and sorts descending', () => {
        const items = buildSlowStartupItems(sessionFixture(), { limit: 5 });
        expect(items).toHaveLength(5);
        for (let i = 1; i < items.length; i++) {
            expect(items[i - 1].durationMs).toBeGreaterThanOrEqual(items[i].durationMs);
        }
        expect(items.some(item => item.scope === 'extension')).toBe(true);
        expect(items.some(item => item.scope === 'client')).toBe(true);
    });
});
