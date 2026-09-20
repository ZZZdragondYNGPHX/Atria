import { describe, expect, test } from '@jest/globals';

import { createLogger as createBackendLogger } from '../../src/logging/logger.js';
import { BACKEND_LOG_MODULES } from '../../src/logging/modules.js';
import { REDACTED, redactText, redactValue } from '../../src/logging/redact.js';
import { RecentActionStore } from '../../src/logging/recent-actions.js';
import { createSafeConfigSnapshot } from '../../src/logging/safe-config.js';
import { LogStore } from '../../src/logging/store.js';
import { createLogger as createFrontendLogger } from '../../public/scripts/logging/logger.js';
import { FRONTEND_LOG_MODULES } from '../../public/scripts/logging/modules.js';
import { RecentUserActionStore } from '../../public/scripts/logging/recent-actions.js';
import { FrontendLogStore } from '../../public/scripts/logging/store.js';

describe('logging foundation', () => {
    test('module registries expose the planned Atria surfaces', () => {
        expect(BACKEND_LOG_MODULES).toEqual(expect.arrayContaining([
            'startup', 'http', 'websocket', 'storage', 'generation', 'dispatch',
            'orchestrator', 'memory', 'worldbook', 'extensions', 'plugins',
            'request-inspector', 'system', 'uncategorized',
        ]));
        expect(FRONTEND_LOG_MODULES).toEqual(expect.arrayContaining([
            'startup', 'ui', 'network', 'generation', 'extensions',
            'orchestrator', 'memory', 'worldbook', 'regex', 'editor',
            'studio', 'storage', 'settings', 'system', 'uncategorized',
        ]));
    });

    test('backend bounded store preserves IDs and filters incrementally', () => {
        const store = new LogStore({ capacity: 3 });
        const logger = createBackendLogger('generation', { store });
        logger.info('request.start', 'one', {}, { correlation: { requestId: 'r1', atri_generation_id: 'g1' } });
        logger.warn('request.retry', 'two', {}, { correlation: { requestId: 'r1' } });
        logger.error('request.fail', 'three', {}, { correlation: { requestId: 'r2' } });
        logger.debug('request.after', 'four');

        expect(store.size).toBe(3);
        expect(store.query().entries.map(entry => entry.id)).toEqual([2, 3, 4]);
        expect(store.query({ sinceId: 2 }).entries.map(entry => entry.id)).toEqual([3, 4]);
        expect(store.query({ levels: ['error'] }).entries.map(entry => entry.event)).toEqual(['request.fail']);
        expect(store.query({ correlation: 'r1' }).entries.map(entry => entry.event)).toEqual(['request.retry']);
        expect(store.query({ text: 'three' }).entries.map(entry => entry.event)).toEqual(['request.fail']);
    });

    test('structured logger emits full envelope and normalized correlation', () => {
        const store = new LogStore({ capacity: 5 });
        const logger = createBackendLogger('orchestrator', { store });
        const entry = logger.error('agent.failed', 'agent failed', { round: 3 }, {
            category: 'runtime',
            correlation: { run_id: 'run-7', request_id: 'req-9' },
        });

        expect(entry).toMatchObject({
            side: 'backend',
            level: 'error',
            module: 'orchestrator',
            category: 'runtime',
            event: 'agent.failed',
            message: 'agent failed',
            data: { round: 3 },
            correlation: { orchestrationRunId: 'run-7', requestId: 'req-9' },
            source: 'structured',
        });
    });

    test('central redaction covers secret keys and free text', () => {
        const value = redactValue({
            apiKey: 'sk-abcdefghijklmnopqrstuv',
            nested: {
                Authorization: 'Bearer abcdefghijklmnopqrst',
                password: 'hunter2',
                ok: 'visible',
            },
        });
        expect(value.apiKey).toBe(REDACTED);
        expect(value.nested.Authorization).toBe(REDACTED);
        expect(value.nested.password).toBe(REDACTED);
        expect(value.nested.ok).toBe('visible');
        expect(redactText('Authorization: Bearer abcdefghijklmnopqrst')).toContain(REDACTED);
        expect(redactText('https://x.test/?token=abcdefghijklmnopqrst')).toContain(REDACTED);
    });

    test('recent actions are bounded and secret-safe', () => {
        const backend = new RecentActionStore({ capacity: 2 });
        backend.record({ timestamp: 100, module: 'settings', action: 'switch_model', data: { model: 'a', apiKey: 'x' } });
        backend.record({ timestamp: 200, module: 'orchestrator', action: 'start_run', data: { run: 'r' } });
        backend.record({ timestamp: 300, module: 'settings', action: 'switch_model', data: { model: 'b' } });
        const entries = backend.queryWindow({ before: 300, beforeCount: 10 });
        expect(entries).toHaveLength(2);
        expect(entries[0].timestamp).toBe(200);

        const frontend = new RecentUserActionStore({ capacity: 1 });
        frontend.record({ module: 'settings', action: 'switch_connection', data: { apiKey: 'secret' } });
        expect(frontend.queryWindow()[0].data.apiKey).toBe(REDACTED);
    });

    test('safe configuration snapshot is whitelist-only and redacted', () => {
        const snapshot = createSafeConfigSnapshot({
            appVersion: '2.7.0',
            revision: 'abc',
            model: 'model-x',
            provider: 'openai-compatible',
            apiKey: 'must-not-exist',
            prompt: 'must-not-exist',
            network: { proxyMode: 'system', Authorization: 'Bearer abcdefghijklmnopqrst' },
            extensions: [{ name: 'demo', version: '1.2.3', origin: 'https://example.test/demo.git', token: 'hidden' }],
        });
        expect(snapshot.apiKey).toBeUndefined();
        expect(snapshot.prompt).toBeUndefined();
        expect(snapshot.network.Authorization).toBe(REDACTED);
        expect(snapshot.extensions[0]).toMatchObject({ name: 'demo', version: '1.2.3' });
        expect(snapshot.extensions[0].token).toBeUndefined();
    });

    test('frontend store is bounded and supports structured correlation', () => {
        const store = new FrontendLogStore({ capacity: 2 });
        const logger = createFrontendLogger('network', { store });
        logger.info('fetch.start', 'start', {}, { correlation: { request_id: 'r1' } });
        logger.error('fetch.fail', 'failed', { Authorization: 'Bearer abcdefghijklmnopqrst' }, {
            correlation: { request_id: 'r1', atri_generation_id: 'g1' },
        });
        logger.debug('fetch.after', 'after');

        expect(store.size).toBe(2);
        const entry = store.query({ correlation: 'g1' }).entries[0];
        expect(entry.side).toBe('frontend');
        expect(entry.data.Authorization).toBe(REDACTED);
    });
});
