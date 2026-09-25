import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@jest/globals';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '..', '..');
const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

describe('Regex/Native Game Runtime architecture boundary', () => {
    test('Native Regex scopes do not restore legacy preset/card stores or allow flags', () => {
        for (const file of ['engine.js', 'index.js', 'dropdown.html', 'scriptTemplate.html']) {
            expect(read('public/scripts/extensions/regex/' + file)).not.toMatch(/SCRIPT_TYPES\.SCOPED|getPresetManager|writeExtensionField|['"]regex_scripts['"]|Preset Scripts|Scoped Scripts/);
        }
        expect(read('public/scripts/capability-host.js')).not.toMatch(/character_allowed_regex|preset_allowed_regex/);
    });
    test('Regex Core does not depend on Game Runtime', () => {
        const source = read('public/scripts/extensions/regex/engine.js');
        expect(source).not.toMatch(/from\s+['"][^'"]*game-runtime/i);
        expect(source).not.toMatch(/import\([^)]*game-runtime/i);
    });

    test('Native Game Runtime authority does not depend on Regex or retired CardApp transport', () => {
        for (const relative of [
            'public/scripts/native/experience/package-loader.js',
            'public/scripts/native/experience/world/session.js',
            'public/scripts/native/experience/index.js',
        ]) {
            const source = read(relative);
            expect(source).not.toMatch(/extensions\/regex|regex\/engine|getRegexedString|registerManagedRegexProvider/);
            expect(source).not.toMatch(/\/api\/card-app|GAME_MANIFEST_PATH|game\.json/);
        }
    });

    test('Native state authority does not use Chat State or swipe-derived branches', () => {
        const source = [
            read('public/scripts/native/experience/package-loader.js'),
            read('public/scripts/native/experience/world/session.js'),
        ].join('\n');
        expect(source).not.toMatch(/getChatState|updateChatState|deleteChatState|atri_game_world|buildGameBranchPath|swipe_id|swipeId/);
        expect(source).toContain('atri_world_state');
        expect(source).toContain('atri_game_runtime');
    });
});
