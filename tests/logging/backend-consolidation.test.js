import { describe, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

import { installConsoleAdapter } from '../../src/logging/console-adapter.js';
import { LogStore } from '../../src/logging/store.js';

describe('backend logging consolidation', () => {
    test('console adapter is idempotent and writes one canonical entry', () => {
        const store = new LogStore({ capacity: 10 });
        const output = jest.fn();
        const fakeConsole = {
            trace: output,
            debug: output,
            log: output,
            info: output,
            warn: output,
            error: output,
        };

        installConsoleAdapter({ store, consoleObject: fakeConsole });
        const wrapped = fakeConsole.log;
        installConsoleAdapter({ store, consoleObject: fakeConsole });

        expect(fakeConsole.log).toBe(wrapped);
        fakeConsole.log('[startup] hello', { ok: true });

        expect(store.size).toBe(1);
        expect(store.query().entries[0]).toMatchObject({
            side: 'backend',
            source: 'console',
            module: 'startup',
            event: 'console.log',
        });
        expect(output).toHaveBeenCalledTimes(1);
    });

    test('server-main owns no duplicate backend buffer or redaction pipeline', () => {
        const source = readFileSync(new URL('../../src/server-main.js', import.meta.url), 'utf8');
        expect(source).not.toContain('backendLogBuffer');
        expect(source).not.toContain('BACKEND_LOG_MAX');
        expect(source).not.toContain('DEBUG_EXPORT_REDACT_PATTERNS');
        expect(source).not.toContain('redactDebugExportValue');
        expect(source).toContain('backendLogStore.query({ limit: 5000 }).entries');
        expect(source).toContain('redactValue(bundle');
        expect(source.match(/installConsoleAdapter\(\);/g)).toHaveLength(1);
    });

    test('admin viewer reads the same canonical backend store', () => {
        const source = readFileSync(new URL('../../src/endpoints/users-admin.js', import.meta.url), 'utf8');
        expect(source).toContain("import { backendLogStore } from '../logging/store.js';");
        expect(source).toContain('backendLogStore.query({');
        expect(source).toContain('backendLogStore.clear();');
        expect(source).not.toContain('../log-capture.js');
    });

    test('legacy log-capture facade owns no storage', () => {
        const source = readFileSync(new URL('../../src/log-capture.js', import.meta.url), 'utf8');
        expect(source).toContain("from './logging/store.js'");
        expect(source).not.toContain('const entries =');
        expect(source).not.toContain('DEFAULT_CAPACITY');
        expect(source).not.toContain('nextId');
    });
});
