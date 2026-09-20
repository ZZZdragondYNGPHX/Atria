import { describe, expect, test } from '@jest/globals';

import { IncidentAggregator, IncidentStore } from '../../src/logging/incidents.js';
import { createIncidentFromRecent } from '../../src/logging/runtime.js';
import { LogStore } from '../../src/logging/store.js';

describe('create incident from recent diagnostics', () => {
    test('non-admin creation uses submitted frontend evidence without pulling global backend logs', () => {
        const logStore = new LogStore({ capacity: 10 });
        logStore.append({ level: 'error', module: 'generation', event: 'other-user', message: 'backend private', correlation: { requestId: 'req-x' } });
        const incidentStore = new IncidentStore();
        const aggregator = new IncidentAggregator({ incidentStore, logStore });
        const incident = createIncidentFromRecent({
            correlation: { requestId: 'req-x' },
            frontendLogs: [{ side: 'frontend', level: 'error', module: 'network', event: 'fetch.error', message: 'network failed' }],
        }, {
            subjectUser: 'alice',
            includeBackendLogs: false,
            logStore,
            incidentAggregator: aggregator,
            now: Date.now(),
        });
        expect(incident.subjectUser).toBe('alice');
        expect(incident.relatedLogEntryIds).toEqual([]);
        expect(incident.embeddedLogEntries[0]).toMatchObject({ side: 'frontend', module: 'network', event: 'fetch.error' });
        expect(JSON.stringify(incident)).not.toContain('backend private');
    });

    test('admin creation can correlate backend logs into the incident', () => {
        const logStore = new LogStore({ capacity: 10 });
        const entry = logStore.append({ level: 'error', module: 'generation', event: 'dispatch.failed', message: 'failed', correlation: { requestId: 'req-1' } });
        const incidentStore = new IncidentStore();
        const aggregator = new IncidentAggregator({ incidentStore, logStore });
        const incident = createIncidentFromRecent({
            correlation: { requestId: 'req-1' },
            type: 'generation_failure',
        }, {
            subjectUser: 'admin',
            includeBackendLogs: true,
            logStore,
            incidentAggregator: aggregator,
            now: entry.timestamp,
        });
        expect(incident.relatedLogEntryIds).toContain(entry.id);
        expect(incident.primaryModule).toBe('generation');
    });
});
