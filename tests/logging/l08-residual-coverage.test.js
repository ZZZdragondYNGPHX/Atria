import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

describe('L08 backup/editor residual coverage', () => {
    test('frontend module registry includes sync and backup', () => {
        const source = readFileSync(new URL('../../src/logging/modules.js', import.meta.url), 'utf8');
        expect(source).toContain("'storage', 'sync'");
        expect(source).toContain("'backup', 'settings'");
    });

    test('archive restore terminal failure creates one backup incident', () => {
        const source = readFileSync(new URL('../../public/scripts/backup-sync-center.js', import.meta.url), 'utf8');
        expect(source).toContain("type: 'backup_failure'");
        expect(source).toContain("backupLogger.error('restore.failed'");
        expect(source).toContain("operationId: globalThis.crypto?.randomUUID?.()");
    });


});
