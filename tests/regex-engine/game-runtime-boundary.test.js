import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from '@jest/globals';

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

describe('Regex/Game Runtime architecture boundary', () => {
    test('Regex Core does not depend on Game Runtime', () => {
        const source = read('public/scripts/extensions/regex/engine.js');
        expect(source).not.toMatch(/from\s+['"][^'"]*game-runtime/i);
        expect(source).not.toMatch(/import\([^)]*game-runtime/i);
    });

    test('Game Runtime foundation does not depend on Regex for state, package activation or assets', () => {
        for (const relative of [
            'public/scripts/extensions/game-runtime/manifest.js',
            'public/scripts/extensions/game-runtime/package-loader.js',
            'public/scripts/extensions/game-runtime/index.js',
        ]) {
            const source = read(relative);
            expect(source).not.toMatch(/extensions\/regex|regex\/engine|getRegexedString|registerManagedRegexProvider/);
        }
    });

    test('Game Runtime foundation has no world mutation or DOM takeover surface in R0/R1', () => {
        const source = [
            read('public/scripts/extensions/game-runtime/manifest.js'),
            read('public/scripts/extensions/game-runtime/package-loader.js'),
            read('public/scripts/extensions/game-runtime/index.js'),
        ].join('\n');
        expect(source).not.toMatch(/querySelector|createElement|innerHTML|setVariable|updateChatState|patchChatState|world\.hp|set_state/);
    });
});
