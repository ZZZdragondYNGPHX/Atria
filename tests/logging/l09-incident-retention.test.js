import { describe, expect, test } from '@jest/globals';

import { buildIncidentSummaryPackage } from '../../src/logging/incident-export.js';
import { IncidentAggregator, IncidentStore } from '../../src/logging/incidents.js';
import { LogStore } from '../../src/logging/store.js';

describe('L09 incident retention across raw-log clear', () => {
    test('incident core summary survives after the canonical raw log store is cleared', () => {
        const logStore = new LogStore({ capacity: 20 });
        const incidentStore = new IncidentStore({ capacity: 20 });
        const aggregator = new IncidentAggregator({ incidentStore, logStore });
        const entry = logStore.append({
            level: 'error',
            module: 'generation',
            category: 'dispatch',
            event: 'dispatch.failed',
            message: 'provider timeout',
            correlation: { requestId: 'req-1', generationId: 'gen-1' },
        });

        const incident = aggregator.capture({
            type: 'generation_failure',
            severity: 'error',
            primaryModule: 'generation',
            stage: 'dispatch.execute',
            summary: 'Generation failed at provider boundary',
            failure: Object.assign(new Error('provider timeout'), { code: 'ETIMEDOUT' }),
            correlation: { requestId: 'req-1', generationId: 'gen-1' },
            relatedLogs: [entry],
            probableOwner: 'external-service',
            ownerName: 'Provider',
            ownerConfidence: 0.9,
            ownershipEvidence: ['provider request timed out'],
        });

        logStore.clear();
        expect(logStore.size).toBe(0);

        const retained = incidentStore.get(incident.incidentId);
        const exported = buildIncidentSummaryPackage({
            incident: retained,
            logStore,
            version: { appVersion: '2.7.0', revision: 'test', branch: 'test' },
        });

        expect(retained).toMatchObject({
            type: 'generation_failure',
            primaryModule: 'generation',
            stage: 'dispatch.execute',
            summary: 'Generation failed at provider boundary',
            correlation: { requestId: 'req-1', generationId: 'gen-1' },
            ownership: { probableOwner: 'external-service', ownerName: 'Provider' },
        });
        expect(exported.human).toContain('Generation failed at provider boundary');
        expect(exported.human).toContain('dispatch.execute');
        expect(exported.human).toContain('external-service');
    });
});
