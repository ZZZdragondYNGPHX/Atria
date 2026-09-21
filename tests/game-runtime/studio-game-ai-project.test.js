import { describe, expect, test } from '@jest/globals';

import {
    buildGameStudioAiSystemAppendix,
    inspectGameStudioProject,
    validateGameStudioProjectSource,
} from '../../public/scripts/extensions/character-editor-assistant/studio/game-ai-project.js';

function files(...paths) {
    return paths.map((path, index) => ({
        path,
        type: 'file',
        size: 100 + index,
    }));
}

function reader(entries) {
    const map = new Map(Object.entries(entries));
    return async path => {
        if (!map.has(path)) throw new Error('missing ' + path);
        return map.get(path);
    };
}

const manifest = {
    format: 'atria-game',
    manifestVersion: 1,
    id: 'studio.ai',
    name: 'Studio AI',
    version: '1.0.0',
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
    },
    llm: {
        observations: 'llm/observations.json',
    },
};

const entries = {
    'game.json': JSON.stringify(manifest),
    'world/schema.json': JSON.stringify({
        type: 'object',
        additionalProperties: false,
        required: ['hp'],
        properties: {
            hp: { type: 'integer', minimum: 0, maximum: 20 },
        },
    }),
    'world/initial.json': JSON.stringify({ hp: 10 }),
    'logic/game.json': JSON.stringify({
        commands: [{
            id: 'rest',
            argsSchema: {
                type: 'object',
                additionalProperties: false,
                properties: {},
            },
            events: [{ type: 'Rested', payload: {} }],
            llm: { expose: true },
        }],
        reducers: [{
            type: 'Rested',
            payloadSchema: {
                type: 'object',
                additionalProperties: false,
                properties: {},
            },
            assign: { hp: 20 },
        }],
        rules: [],
        interpretations: [],
    }),
    'ui/game.html': '<section>game</section>',
    'ui/selectors.json': JSON.stringify([
        { id: 'player.hp', formula: 'world.hp' },
    ]),
    'llm/observations.json': JSON.stringify([
        { id: 'player.hp', formula: 'world.hp' },
    ]),
};

const sourceFiles = files(...Object.keys(entries));

describe('Game Studio AI project awareness', () => {
    test('inspects the live Game Project source map for the AI Builder', async () => {
        const project = await inspectGameStudioProject({
            files: sourceFiles,
            readFile: reader(entries),
        });

        expect(project.kind).toBe('game');
        expect(project.status).toBe('ready');
        expect(project.manifest.id).toBe('studio.ai');
        expect(project.nodes).toEqual(expect.arrayContaining([
            expect.objectContaining({ role: 'world_schema', path: 'world/schema.json' }),
            expect.objectContaining({ role: 'commands', path: 'logic/game.json', section: 'commands' }),
            expect.objectContaining({ role: 'selectors', path: 'ui/selectors.json' }),
            expect.objectContaining({ role: 'observations', path: 'llm/observations.json' }),
        ]));
    });

    test('builds a Game Runtime-specific system appendix that forbids alternate authoritative state', async () => {
        const project = await inspectGameStudioProject({
            files: sourceFiles,
            readFile: reader(entries),
        });
        const prompt = buildGameStudioAiSystemAppendix(project);

        expect(prompt).toContain('World State + Event Journal');
        expect(prompt).toContain('Typed Commands');
        expect(prompt).toContain('same tool round');
        expect(prompt).toContain('Do not create a second state engine');
        expect(prompt).toContain('Do not replace the Game Runtime architecture');
        expect(prompt).toContain('world/schema.json');
        expect(prompt).toContain('logic/game.json');
    });

    test('preflight accepts a source tree that passes current R2-R5 runtime contracts', async () => {
        const result = await validateGameStudioProjectSource({
            files: sourceFiles,
            readFile: reader(entries),
        });

        expect(result.ok).toBe(true);
        expect(result.kind).toBe('game');
        expect(result.manifest.id).toBe('studio.ai');
    });

    test('preflight fails closed when a cross-file edit leaves Initial State outside World Schema', async () => {
        const broken = {
            ...entries,
            'world/initial.json': JSON.stringify({ hp: 999 }),
        };

        await expect(validateGameStudioProjectSource({
            files: sourceFiles,
            readFile: reader(broken),
        })).rejects.toThrow(/Initial State does not satisfy World Schema/);
    });

    test('preflight rejects alternate malformed logic instead of allowing a Studio-only shape', async () => {
        const broken = {
            ...entries,
            'logic/game.json': JSON.stringify({
                stateUpdates: [{ path: 'hp', value: 0 }],
            }),
        };

        await expect(validateGameStudioProjectSource({
            files: sourceFiles,
            readFile: reader(broken),
        })).rejects.toThrow(/unknown field/);
    });

    test('ordinary CardApp source remains outside the Game Runtime preflight', async () => {
        const result = await validateGameStudioProjectSource({
            files: files('index.js', 'style.css'),
            readFile: reader({
                'index.js': 'export function init() {}',
                'style.css': '',
            }),
        });

        expect(result).toMatchObject({
            ok: true,
            kind: 'cardapp',
        });
    });
});
