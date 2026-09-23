import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

function exists(rel) {
    return fs.existsSync(path.join(root, rel));
}

function read(rel) {
    return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('A9 hard cutover acceptance', () => {
    test('retired CardApp product authority is physically absent', () => {
        expect(exists('src/endpoints/card-app.js')).toBe(false);
        expect(exists('public/scripts/extensions/card-app')).toBe(false);
        expect(exists('public/scripts/extensions/character-editor-assistant/studio')).toBe(false);
        expect(read('src/server-startup.js')).not.toContain('/api/card-app');
        expect(read('src/endpoints/characters.js')).not.toMatch(/cardApps|packCardAppFiles|extractCardAppFiles/);
    });

    test('retired game.json/swipe/Chat-State authorities are physically absent', () => {
        expect(exists('public/scripts/extensions/game-runtime/manifest.js')).toBe(false);
        expect(exists('public/scripts/extensions/game-runtime/world/branch.js')).toBe(false);
        expect(exists('public/scripts/extensions/game-runtime/world/persistence.js')).toBe(false);
        expect(exists('public/scripts/extensions/game-runtime/world/runtime.js')).toBe(false);
        expect(exists('public/scripts/extensions/game-runtime/world/journal.js')).toBe(false);
    });

    test('retired Chat State game-world namespace is absent from active Native consumers', () => {
        expect(read('public/scripts/native/knowledge-runtime.js')).not.toContain('atri_game_world');
        expect(read('public/scripts/native/context-compiler.js')).not.toContain('atri_game_world');
        expect(read('public/scripts/extensions/game-runtime/world/session.js')).toContain('atri_world_state');
        expect(read('public/scripts/extensions/game-runtime/world/session.js')).toContain('atri_game_runtime');
    });

    test('current Native Session and Studio replacements remain mounted', () => {
        const startup = read('src/server-startup.js');
        const runtime = read('public/scripts/extensions/game-runtime/package-loader.js');
        const world = read('public/scripts/extensions/game-runtime/world/session.js');
        const studio = read('public/scripts/native/studio-workspace.js');
        const agent = read('public/scripts/native/studio-agent.js');

        expect(startup).toContain('app.use(\'/api/native/session\'');
        expect(startup).toContain('app.use(\'/api/native/studio\'');
        expect(runtime).toContain('/api/native/session/');
        expect(world).toContain('commitStatePatch');
        expect(studio).toContain('mountNativeStudioAgent');
        expect(agent).toContain('runNativeStudioAgentTask');
    });

    test('SillyTavern chat DOM survives only as hidden Native generation ABI', () => {
        const host = read('public/scripts/atria-shell/native-play-host.js');
        expect(host).toContain('atria-native-play-abi');
        expect(host).toContain('mountAtriaPlayProduct');
        expect(host).toContain('#chat');
        expect(host).toContain('#send_form');
    });
});
