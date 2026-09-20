// Director profile hard-cutover shape contract.
//
// Atria accepts the current flat profile and the current bare per-mode body.
// The former wrapped `director: {...}` representation is intentionally not
// upgraded after the namespace migration.

import { describe, test, expect } from '@jest/globals';

globalThis.Atria = globalThis.Atria || {
    getContext: () => ({
        translate: (s) => String(s ?? ''),
        addLocaleData: () => {},
    }),
};

const { sanitizeDirectorProfile } = await import(
    '../../public/scripts/extensions/orchestrator/director-defaults.js'
);

const INNER = {
    mainAgent: {
        promptPresetName: 'director-main',
        apiPresetName: 'director-claude',
        systemPrompt: 'You are the cliff-watch coordinator. Synthesize the scouts\' reports.',
        tools: null,
    },
    subAgents: [
        {
            id: 'scout_north',
            description: 'Read the northern reef line for unusual hull silhouettes.',
            systemPrompt: 'You are scout_north. Examine the chart between marker pairs A-B and B-C and report any anomaly.',
            tools: null,
            maxRounds: 6,
        },
        {
            id: 'scout_south',
            description: 'Read the southern reef line.',
            systemPrompt: 'You are scout_south. Mirror scout_north on the southern section.',
            tools: null,
            maxRounds: 6,
        },
    ],
    maxRounds: 12,
    maxConcurrentSubagents: 2,
    maxTotalSubagentRuns: 10,
    discardOnAbort: true,
};

describe('sanitizeDirectorProfile — current flat/bare shapes', () => {
    test('flat input stays flat', () => {
        const out = sanitizeDirectorProfile({ mode: 'director', ...INNER });
        expect(out).toBeTruthy();
        expect(out).not.toHaveProperty('director');
        expect(out.mode).toBe('director');
        expect(out.mainAgent.systemPrompt).toContain('cliff-watch coordinator');
        expect(out.subAgents.map(a => a.id).sort()).toEqual(['scout_north', 'scout_south']);
        expect(out.maxRounds).toBe(12);
        expect(out.maxConcurrentSubagents).toBe(2);
        expect(out.maxTotalSubagentRuns).toBe(10);
        expect(out.discardOnAbort).toBe(true);
    });

    test('bare per-mode body is a current supported shape', () => {
        const out = sanitizeDirectorProfile({ ...INNER });
        expect(out).not.toHaveProperty('director');
        expect(out.mode).toBe('director');
        expect(out.subAgents).toHaveLength(2);
        expect(out.mainAgent.systemPrompt).toContain('cliff-watch coordinator');
    });

    test('obsolete wrapped input is ignored instead of upgraded', () => {
        const out = sanitizeDirectorProfile({ mode: 'director', director: INNER });
        expect(out).not.toHaveProperty('director');
        expect(out.mainAgent.systemPrompt).not.toContain('cliff-watch coordinator');
        expect(out.subAgents).toEqual([]);
        expect(out.maxRounds).not.toBe(12);
        expect(out.discardOnAbort).toBe(false);
    });

    test('flat and bare current inputs sanitize equivalently', () => {
        const flatOut = sanitizeDirectorProfile({ mode: 'director', ...INNER });
        const bareOut = sanitizeDirectorProfile({ ...INNER });
        expect(JSON.parse(JSON.stringify(flatOut))).toEqual(JSON.parse(JSON.stringify(bareOut)));
    });

    test('sanitizer is idempotent on current output', () => {
        const once = sanitizeDirectorProfile({ mode: 'director', ...INNER });
        const twice = sanitizeDirectorProfile(once);
        expect(twice).toEqual(once);
        expect(twice).not.toHaveProperty('director');
    });
});
