import { describe, expect, test } from '@jest/globals';

import { createIncident } from '../../src/logging/incidents.js';
import { __frontendFetchAdapterTestUtils } from '../../public/scripts/logging/fetch-adapter.js';

describe('logging normalization regressions', () => {
    test('incident preserves normalized recent user action schema', () => {
        const incident = createIncident({
            recentActions: [{
                id: 7,
                timestamp: 123,
                module: 'settings',
                action: 'switch_model',
                label: 'changed model',
                data: { model: 'x', apiKey: 'secret' },
            }],
        });
        expect(incident.recentActions[0]).toMatchObject({
            id: 7,
            timestamp: 123,
            module: 'settings',
            action: 'switch_model',
            label: 'changed model',
            data: { model: 'x', apiKey: '[REDACTED]' },
        });
    });

    test('fetch summary retains only safe generation correlation metadata', () => {
        const body = JSON.stringify({
            atri_generation: { job_id: 'gen-safe' },
            messages: [{ role: 'user', content: 'private body' }],
        });
        const summary = __frontendFetchAdapterTestUtils.summarizeBody(body);
        expect(summary.atri_generation.job_id).toBe('gen-safe');
        expect(JSON.stringify(summary)).not.toContain('private body');
    });
});
