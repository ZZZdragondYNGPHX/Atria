import { describe, expect, test } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';

describe('L09 logging cleanup and canonical export', () => {
    test('Atria-owned frontend callers use split logging modules, while compatibility shim stays thin', () => {
        const callers = [
            '../../public/scripts/user.js',
            '../../public/scripts/logging/workspace.js',
            '../../public/scripts/power-user.js',
            '../../public/scripts/debug-export.js',
        ];
        for (const path of callers) {
            const source = readFileSync(new URL(path, import.meta.url), 'utf8');
            expect(source).not.toContain("frontend-log-manager.js");
        }
        const shim = readFileSync(new URL('../../public/scripts/frontend-log-manager.js', import.meta.url), 'utf8');
        expect(shim).toContain('Stable compatibility shim');
        expect(shim).not.toContain('let installed = false');
    });

    test('backend legacy facade is deleted and Debug Export uses canonical diagnostics sources', () => {
        expect(existsSync(new URL('../../src/log-capture.js', import.meta.url))).toBe(false);
        const server = readFileSync(new URL('../../src/server-main.js', import.meta.url), 'utf8');
        expect(server).toContain('backendLogStore.query({ limit: 5000 }).entries');
        expect(server).toContain('diagnosticIncidentStore.list(');
        expect(server).toContain('startupSessionStore.list({');
        expect(server).toContain('runtimeProvenanceRegistry.list()');
        expect(server).toContain('.map(sanitizeRequestInspectorEntry)');
    });

    test('debug export reads frontend canonical store directly', () => {
        const source = readFileSync(new URL('../../public/scripts/debug-export.js', import.meta.url), 'utf8');
        expect(source).toContain("import { frontendLogStore } from './logging/logger.js'");
        expect(source).toContain('frontendLogStore.query({ limit: 3000 }).entries');
    });
});
