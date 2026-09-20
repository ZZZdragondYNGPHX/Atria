import { describe, expect, test } from '@jest/globals';

import {
    buildVirtualWindow,
    deriveModuleHealth,
    formatWorkspaceLogEntry,
} from '../../public/scripts/logging/workspace-model.js';

describe('diagnostics workspace model', () => {
    test('module health is derived objectively from active incidents and recent logs', () => {
        const now = 100000;
        const health = deriveModuleHealth({
            now,
            incidents: [{ primaryModule: 'orchestrator', severity: 'error', status: 'open' }],
            logs: [
                { module: 'storage', level: 'warn', timestamp: now - 10 },
                { module: 'generation', level: 'info', timestamp: now - 20 },
            ],
        });
        expect(health.find(item => item.id === 'orchestrator').status).toBe('error');
        expect(health.find(item => item.id === 'storage').status).toBe('warning');
        expect(health.find(item => item.id === 'generation').status).toBe('healthy');
        expect(health.find(item => item.id === 'memory').status).toBe('quiet');
    });

    test('virtual window renders only a bounded slice for large log buffers', () => {
        const windowState = buildVirtualWindow({
            total: 5000,
            scrollTop: 5800,
            viewportHeight: 580,
        });
        expect(windowState.start).toBeGreaterThan(0);
        expect(windowState.end - windowState.start).toBeLessThan(40);
        expect(windowState.bottomSpacer).toBeGreaterThan(0);
    });

    test('structured log formatting includes module and event', () => {
        const text = formatWorkspaceLogEntry({
            timestamp: 1,
            level: 'error',
            module: 'network',
            event: 'fetch.error',
            message: 'boom',
        });
        expect(text).toContain('[ERROR]');
        expect(text).toContain('[network]');
        expect(text).toContain('fetch.error');
        expect(text).toContain('boom');
    });
});
