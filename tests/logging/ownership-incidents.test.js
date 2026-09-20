import { describe, expect, test } from '@jest/globals';

import { IncidentAggregator, IncidentStore } from '../../src/logging/incidents.js';
import { createLogger } from '../../src/logging/logger.js';
import { analyzeStackOwnership, attributeOwnership } from '../../src/logging/ownership.js';
import { RecentActionStore } from '../../src/logging/recent-actions.js';
import { LogStore } from '../../src/logging/store.js';

describe('ownership attribution', () => {
    test('third-party throw site wins over later Atria boundary frame', () => {
        const stack = [
            'Error: plugin exploded',
            '    at explode (http://localhost:8000/scripts/extensions/third-party/demo-plugin/main.js:10:2)',
            '    at invokeBoundary (http://localhost:8000/scripts/logging/error-adapter.js:20:1)',
        ].join('\n');
        const analysis = analyzeStackOwnership(stack);
        const ownership = attributeOwnership({ stack });

        expect(analysis.throwFrame.ownerType).toBe('third-party-extension');
        expect(analysis.firstThirdPartyFrame.ownerName).toBe('demo-plugin');
        expect(analysis.firstAtriaFrame.ownerType).toBe('atria');
        expect(ownership).toMatchObject({
            probableOwner: 'third-party-extension',
            ownerName: 'demo-plugin',
            confidence: 0.95,
        });
    });

    test('Atria implementation throw remains attributed to Atria', () => {
        const stack = [
            'Error: contract failed',
            '    at validate (http://localhost:8000/scripts/extensions/orchestrator/runtime.js:12:4)',
            '    at pluginCall (http://localhost:8000/scripts/extensions/third-party/demo-plugin/main.js:42:8)',
        ].join('\n');
        const ownership = attributeOwnership({ stack });
        expect(ownership.probableOwner).toBe('atria');
        expect(ownership.stack.firstThirdPartyFrame.ownerName).toBe('demo-plugin');
    });
});

describe('incident aggregation', () => {
    test('captures logs, correlation, actions, snapshot and cause chain', () => {
        const logs = new LogStore({ capacity: 20 });
        const logger = createLogger('orchestrator', { store: logs });
        logger.info('run.start', 'run started', { round: 1 }, { correlation: { runId: 'run-1' } });
        logger.error('agent.fail', 'agent failed', { agent: 'critic', round: 3 }, {
            correlation: { runId: 'run-1', requestId: 'req-2' },
        });

        const actions = new RecentActionStore();
        actions.record({ action: 'switch_model', module: 'generation', data: { model: 'm2' } });
        const store = new IncidentStore();
        const aggregator = new IncidentAggregator({
            incidentStore: store,
            logStore: logs,
            recentActionStore: actions,
            configSnapshotProvider: () => ({ appVersion: '2.7.0', model: 'm2' }),
        });
        const root = new Error('schema validation failed');
        root.cause = new Error('tool payload invalid');
        const incident = aggregator.capture({
            type: 'orchestration_failure',
            severity: 'error',
            primaryModule: 'orchestrator',
            stage: 'schema validation',
            failure: root,
            correlation: { orchestrationRunId: 'run-1' },
        });

        expect(incident.type).toBe('orchestration_failure');
        expect(incident.correlation).toMatchObject({ orchestrationRunId: 'run-1', requestId: 'req-2' });
        expect(incident.relatedLogEntryIds).toEqual([1, 2]);
        expect(incident.causeChain.map(cause => cause.message)).toEqual([
            'schema validation failed',
            'tool payload invalid',
        ]);
        expect(incident.recentActions[0].action).toBe('switch_model');
        expect(incident.safeConfigSnapshot.model).toBe('m2');
    });

    test('same open correlated failure updates one incident', () => {
        const store = new IncidentStore();
        const aggregator = new IncidentAggregator({ incidentStore: store });
        const first = aggregator.capture({
            type: 'generation_failure',
            primaryModule: 'generation',
            stage: 'upstream request',
            summary: 'first',
            correlation: { generationId: 'g-1' },
        });
        const second = aggregator.capture({
            type: 'generation_failure',
            primaryModule: 'generation',
            stage: 'fallback',
            summary: 'second',
            correlation: { generationId: 'g-1' },
        });
        expect(second.incidentId).toBe(first.incidentId);
        expect(store.list()).toHaveLength(1);
        expect(store.get(first.incidentId).stage).toBe('fallback');
    });

    test('incident retention survives raw log clearing', () => {
        const logs = new LogStore({ capacity: 10 });
        const logger = createLogger('storage', { store: logs });
        logger.error('write.fail', 'disk write failed');
        const incidents = new IncidentStore();
        const aggregator = new IncidentAggregator({ incidentStore: incidents, logStore: logs });
        const incident = aggregator.capture({
            type: 'storage_failure',
            primaryModule: 'storage',
            summary: 'write failed',
        });
        logs.clear();
        expect(logs.size).toBe(0);
        expect(incidents.get(incident.incidentId)?.summary).toBe('write failed');
    });
});
