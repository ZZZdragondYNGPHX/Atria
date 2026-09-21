import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';

import { extractCardAppFiles, packCardAppFiles } from '../../src/endpoints/card-app.js';

let tmpDir;
let cardAppsDir;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'game-package-transport-'));
    cardAppsDir = path.join(tmpDir, 'card-apps');
    fs.mkdirSync(cardAppsDir, { recursive: true });
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Game Package character-card transport', () => {
    test('package-only nested text and binary assets round-trip without enabling legacy CardApp', () => {
        const charId = 'runtime-game';
        const packageDir = path.join(cardAppsDir, charId);
        fs.mkdirSync(path.join(packageDir, 'world'), { recursive: true });
        fs.mkdirSync(path.join(packageDir, 'ui'), { recursive: true });
        fs.mkdirSync(path.join(packageDir, 'assets', 'images'), { recursive: true });

        const gameJson = JSON.stringify({
            format: 'atria-game',
            manifestVersion: 1,
            id: 'runtime.game',
            name: 'Runtime Game',
            version: '1.0.0',
            runtime: { min: 1 },
            world: {
                schema: 'world/schema.json',
                initial: 'world/initial.json',
            },
            ui: {
                mode: 'component',
                entry: 'ui/hud.html',
            },
        });
        const schemaJson = JSON.stringify({
            type: 'object',
            properties: {
                hp: { type: 'integer' },
            },
        });
        const initialJson = JSON.stringify({ hp: 20 });
        const hudHtml = '<section data-game-hud>HP</section>';
        const binaryAsset = Buffer.from([0, 1, 2, 3, 250, 251, 252, 253]);

        fs.writeFileSync(path.join(packageDir, 'game.json'), gameJson);
        fs.writeFileSync(path.join(packageDir, 'world', 'schema.json'), schemaJson);
        fs.writeFileSync(path.join(packageDir, 'world', 'initial.json'), initialJson);
        fs.writeFileSync(path.join(packageDir, 'ui', 'hud.html'), hudHtml);
        fs.writeFileSync(path.join(packageDir, 'assets', 'images', 'sprite.bin'), binaryAsset);

        const exportedCharacter = {
            data: {
                extensions: {},
            },
        };

        expect(packCardAppFiles(exportedCharacter, charId, cardAppsDir)).toBe(true);
        expect(exportedCharacter.data.extensions.card_app.enabled).toBeUndefined();

        const packed = structuredClone(exportedCharacter.data.extensions.card_app.files);
        expect(packed['game.json']).toBe(gameJson);
        expect(packed['world/schema.json']).toBe(schemaJson);
        expect(packed['world/initial.json']).toBe(initialJson);
        expect(packed['ui/hud.html']).toBe(hudHtml);
        expect(packed['assets/images/sprite.bin']).toMatch(/^data:application\/octet-stream;base64,/);

        fs.rmSync(packageDir, { recursive: true, force: true });

        const importedCharacter = {
            data: {
                extensions: {
                    card_app: {
                        files: structuredClone(packed),
                    },
                },
            },
        };

        expect(extractCardAppFiles(importedCharacter, charId, cardAppsDir)).toBe(true);
        expect(importedCharacter.data.extensions.card_app.files).toBeUndefined();

        expect(fs.readFileSync(path.join(packageDir, 'game.json'), 'utf8')).toBe(gameJson);
        expect(fs.readFileSync(path.join(packageDir, 'world', 'schema.json'), 'utf8')).toBe(schemaJson);
        expect(fs.readFileSync(path.join(packageDir, 'world', 'initial.json'), 'utf8')).toBe(initialJson);
        expect(fs.readFileSync(path.join(packageDir, 'ui', 'hud.html'), 'utf8')).toBe(hudHtml);
        expect(fs.readFileSync(path.join(packageDir, 'assets', 'images', 'sprite.bin'))).toEqual(binaryAsset);
    });

    test('package-only transport does not activate when game.json is absent', () => {
        const charId = 'plain-files';
        const packageDir = path.join(cardAppsDir, charId);
        fs.mkdirSync(packageDir, { recursive: true });
        fs.writeFileSync(path.join(packageDir, 'notes.txt'), 'not a package');

        const character = {
            data: {
                extensions: {},
            },
        };

        expect(packCardAppFiles(character, charId, cardAppsDir)).toBe(false);
        expect(character.data.extensions.card_app).toBeUndefined();
    });
});
