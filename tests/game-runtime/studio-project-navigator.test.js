import { describe, expect, test } from '@jest/globals';

import {
    GAME_PROJECT_KIND,
    GAME_PROJECT_STATUS,
    buildGameProjectNavigator,
} from '../../public/scripts/extensions/character-editor-assistant/studio/game-project-navigator.js';

function files(...paths) {
    return paths.map((path, index) => ({
        path,
        type: 'file',
        size: 100 + index,
    }));
}

function createReader(entries) {
    const map = new Map(Object.entries(entries));
    return async path => {
        if (!map.has(path)) throw new Error(`missing ${path}`);
        return map.get(path);
    };
}

function findNode(model, role) {
    return model.groups
        .flatMap(group => group.nodes)
        .find(node => node.role === role);
}

describe('Game Studio project navigator', () => {
    test('keeps ordinary CardApp projects on the raw source-file path', async () => {
        const model = await buildGameProjectNavigator({
            files: files('index.js', 'style.css'),
            readFile: async () => {
                throw new Error('plain CardApp should not read project metadata');
            },
        });

        expect(model.kind).toBe(GAME_PROJECT_KIND.CARDAPP);
        expect(model.status).toBe(GAME_PROJECT_STATUS.PLAIN);
        expect(model.groups).toHaveLength(1);
        expect(model.groups[0].nodes.map(node => node.path)).toEqual(['index.js', 'style.css']);
    });

    test('maps one real Game Runtime source project into runtime-aware groups without shadow config', async () => {
        const manifest = {
            format: 'atria-game',
            manifestVersion: 1,
            id: 'studio.demo',
            name: 'Studio Demo',
            version: '0.1.0',
            runtime: { min: 1 },
            world: {
                schema: 'world/schema.json',
                initial: 'world/initial.json',
            },
            logic: { entry: 'logic/game.json' },
            ui: {
                mode: 'hybrid',
                entry: 'ui/game.html',
                selectors: 'ui/selectors.json',
                immersive: 'ui/immersive.json',
            },
        };
        const logic = {
            commands: [{ id: 'rest' }],
            reducers: [{ type: 'rested' }],
            rules: [{ id: 'tick', on: 'rested', events: [] }],
            interpretations: [{ eventType: 'rest', command: 'rest' }],
        };
        const model = await buildGameProjectNavigator({
            files: files(
                'game.json',
                'world/schema.json',
                'world/initial.json',
                'logic/game.json',
                'ui/game.html',
                'ui/selectors.json',
                'ui/immersive.json',
                'knowledge/lore.md',
                'skills/encounters.md',
                'assets/icon.png',
                'notes/design.md',
            ),
            readFile: createReader({
                'game.json': JSON.stringify(manifest),
                'logic/game.json': JSON.stringify(logic),
            }),
        });

        expect(model.kind).toBe(GAME_PROJECT_KIND.GAME);
        expect(model.status).toBe(GAME_PROJECT_STATUS.READY);
        expect(model.summary).toEqual({ name: 'Studio Demo', version: '0.1.0' });
        expect(findNode(model, 'world_schema').path).toBe('world/schema.json');
        expect(findNode(model, 'initial_state').path).toBe('world/initial.json');
        expect(findNode(model, 'game_logic').path).toBe('logic/game.json');
        expect(findNode(model, 'commands')).toMatchObject({
            kind: 'section',
            path: 'logic/game.json',
            section: 'commands',
            count: 1,
        });
        expect(findNode(model, 'reducers').path).toBe('logic/game.json');
        expect(findNode(model, 'rules').path).toBe('logic/game.json');
        expect(findNode(model, 'interpretations').path).toBe('logic/game.json');
        expect(findNode(model, 'ui').path).toBe('ui/game.html');
        expect(findNode(model, 'selectors').path).toBe('ui/selectors.json');
        expect(findNode(model, 'immersive').path).toBe('ui/immersive.json');
        expect(findNode(model, 'knowledge').path).toBe('knowledge/lore.md');
        expect(findNode(model, 'skill').path).toBe('skills/encounters.md');
        expect(findNode(model, 'asset')).toMatchObject({
            path: 'assets/icon.png',
            editable: false,
        });
        expect(findNode(model, 'source').path).toBe('notes/design.md');
    });

    test('keeps raw files accessible when game.json is malformed', async () => {
        const model = await buildGameProjectNavigator({
            files: files('game.json', 'index.js'),
            readFile: createReader({
                'game.json': '{ definitely not json',
            }),
        });

        expect(model.kind).toBe(GAME_PROJECT_KIND.GAME);
        expect(model.status).toBe(GAME_PROJECT_STATUS.INVALID);
        expect(model.diagnostics[0]).toMatchObject({
            code: 'invalid_json',
            path: 'game.json',
        });
        expect(findNode(model, 'package_metadata').path).toBe('game.json');
        expect(findNode(model, 'source').path).toBe('index.js');
    });

    test('surfaces missing declared runtime files without inventing replacements', async () => {
        const manifest = {
            format: 'atria-game',
            manifestVersion: 1,
            id: 'studio.missing',
            name: 'Missing File Demo',
            version: '1.0.0',
            runtime: { min: 1 },
            world: {
                schema: 'world/schema.json',
                initial: 'world/initial.json',
            },
        };
        const model = await buildGameProjectNavigator({
            files: files('game.json', 'world/initial.json'),
            readFile: createReader({
                'game.json': JSON.stringify(manifest),
            }),
        });

        expect(model.status).toBe(GAME_PROJECT_STATUS.INVALID);
        expect(findNode(model, 'world_schema')).toMatchObject({
            path: 'world/schema.json',
            exists: false,
        });
        expect(model.diagnostics).toContainEqual(expect.objectContaining({
            code: 'missing_file',
            path: 'world/schema.json',
        }));
    });
});
