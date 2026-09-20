import { describe, expect, jest, test } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';

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

    test('diagnostics API owns canonical backend log access after viewer cutover', () => {
        const diagnostics = readFileSync(new URL('../../src/endpoints/diagnostics.js', import.meta.url), 'utf8');
        const usersAdmin = readFileSync(new URL('../../src/endpoints/users-admin.js', import.meta.url), 'utf8');
        expect(diagnostics).toContain("import { backendLogStore } from '../logging/store.js';");
        expect(diagnostics).toContain('logStore.query(');
        expect(diagnostics).toContain('logStore.clear();');
        expect(usersAdmin).not.toContain("router.post('/logs/get'");
        expect(usersAdmin).not.toContain("router.post('/logs/clear'");
        expect(usersAdmin).not.toContain('../log-capture.js');
    });

    test('legacy backend log-capture facade is removed after diagnostics cutover', () => {
        expect(existsSync(new URL('../../src/log-capture.js', import.meta.url))).toBe(false);
    });
});
