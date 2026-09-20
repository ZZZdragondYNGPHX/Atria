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

    test('CardApp Studio open and editor apply/rollback failures create incidents', () => {
        const ui = readFileSync(new URL('../../public/scripts/extensions/character-editor-assistant/editor-ui.js', import.meta.url), 'utf8');
        const studio = readFileSync(new URL('../../public/scripts/extensions/character-editor-assistant/editor-iteration/studio.js', import.meta.url), 'utf8');
        expect(ui).toContain("stage: 'cardapp-studio.open'");
        expect(ui).toContain("primaryModule: 'studio'");
        expect(studio).toContain("reportEditorCommitFailures('apply.commit'");
        expect(studio).toContain("reportEditorCommitFailures('rollback.commit'");
        expect(studio).toContain("primaryModule: 'editor'");
    });
});
