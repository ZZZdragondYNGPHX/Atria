import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const SCRIPT_URL = new URL('../public/script.js', import.meta.url);

describe('on-demand frontend tools', () => {
    test('keeps advanced tools out of the initial static import graph', () => {
        const source = readFileSync(SCRIPT_URL, 'utf8');
        const modules = [
            './scripts/character/manage-bound-presets-dialog.js',
            './scripts/chat-backups.js',
            './scripts/macros/engine/MacroDiagnostics.js',
        ];

        for (const modulePath of modules) {
            expect(source).not.toContain(`from '${modulePath}'`);
            expect(source).toContain(`import('${modulePath}')`);
        }
    });

    test('loads chat backup browser only when past-chat management opens', () => {
        const source = readFileSync(SCRIPT_URL, 'utf8');
        const displayStart = source.indexOf('export async function displayPastChats');
        const importAt = source.indexOf("import('./scripts/chat-backups.js')", displayStart);
        expect(displayStart).toBeGreaterThanOrEqual(0);
        expect(importAt).toBeGreaterThan(displayStart);
    });

    test('loads bound preset manager only from its menu action', () => {
        const source = readFileSync(SCRIPT_URL, 'utf8');
        const caseAt = source.indexOf("case 'manage_character_bound_presets'");
        const importAt = source.indexOf("import('./scripts/character/manage-bound-presets-dialog.js')", caseAt);
        expect(caseAt).toBeGreaterThanOrEqual(0);
        expect(importAt).toBeGreaterThan(caseAt);
    });

    test('loads macro diagnostics fire-and-forget only when a feature is detected', () => {
        const source = readFileSync(SCRIPT_URL, 'utf8');
        expect(source).toContain("if (feature) {");
        expect(source).toContain("import('./scripts/macros/engine/MacroDiagnostics.js')");
        expect(source).toContain("failed to load macro diagnostics");
    });

});
