import { describe, expect, test } from '@jest/globals';

import {
    STRUCTURED_RUNTIME_EDITOR,
    applyInitialStateRowValue,
    applyWorldSchemaRowPatch,
    buildInitialStateEditorModel,
    buildWorldSchemaEditorModel,
    parseStructuredRuntimeDocument,
    serializeStructuredRuntimeDocument,
    validateInitialStateAgainstSchema,
} from '../../public/scripts/extensions/character-editor-assistant/studio/structured-runtime-editors.js';

const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['player'],
    properties: {
        player: {
            type: 'object',
            required: ['hp'],
            properties: {
                hp: { type: 'integer', minimum: 0, maximum: 100 },
                name: { type: 'string', minLength: 1 },
            },
        },
        quests: {
            type: 'array',
            items: { type: 'string' },
        },
    },
};

describe('Game Studio structured runtime editors', () => {
    test('projects nested World Schema fields from the source document', () => {
        const model = buildWorldSchemaEditorModel(schema);
        expect(model.editor).toBe(STRUCTURED_RUNTIME_EDITOR.WORLD_SCHEMA);
        expect(model.rows.map(row => row.path)).toEqual([
            '$',
            'player',
            'player.hp',
            'player.name',
            'quests',
            'quests.[]',
        ]);
        expect(model.rows.find(row => row.path === 'player.hp')).toMatchObject({
            type: 'integer',
            required: true,
            minimum: 0,
            maximum: 100,
        });
    });

    test('patches World Schema constraints and required state on the real JSON shape', () => {
        const updated = applyWorldSchemaRowPatch(
            schema,
            ['properties', 'player', 'properties', 'hp'],
            {
                maximum: '250',
                minimum: '',
                required: false,
                description: 'Current vitality',
            },
        );
        expect(updated.properties.player.properties.hp).toMatchObject({
            type: 'integer',
            maximum: 250,
            description: 'Current vitality',
        });
        expect(updated.properties.player.properties.hp.minimum).toBeUndefined();
        expect(updated.properties.player.required).toBeUndefined();
        expect(schema.properties.player.properties.hp.maximum).toBe(100);
    });

    test('projects and edits Initial State values using existing JSON types', () => {
        const initial = {
            player: { hp: 20, alive: true, name: 'A' },
            quests: [],
        };
        const model = buildInitialStateEditorModel(initial);
        expect(model.rows.map(row => row.label)).toEqual([
            'player.hp',
            'player.alive',
            'player.name',
            'quests',
        ]);
        let updated = applyInitialStateRowValue(initial, ['player', 'hp'], '42');
        updated = applyInitialStateRowValue(updated, ['player', 'alive'], 'false');
        updated = applyInitialStateRowValue(updated, ['quests'], '["intro"]');
        expect(updated).toEqual({
            player: { hp: 42, alive: false, name: 'A' },
            quests: ['intro'],
        });
        expect(initial.player.hp).toBe(20);
    });

    test('uses the authoritative R2 validator before Initial State save', () => {
        const valid = validateInitialStateAgainstSchema({
            player: { hp: 20, name: 'A' },
            quests: [],
        }, schema);
        expect(valid.ok).toBe(true);

        const invalid = validateInitialStateAgainstSchema({
            player: { hp: 120, name: 'A' },
            quests: [],
        }, schema);
        expect(invalid.ok).toBe(false);
        expect(invalid.errors.join('\n')).toContain('$.player.hp: must be <= 100');
    });

    test('parses and serializes the same JSON buffer used by CodeMirror', () => {
        const parsed = parseStructuredRuntimeDocument(
            STRUCTURED_RUNTIME_EDITOR.INITIAL_STATE,
            '{"value":1}',
        );
        expect(parsed.value).toEqual({ value: 1 });
        expect(serializeStructuredRuntimeDocument(parsed.value)).toBe('{\n  "value": 1\n}\n');
    });

    test('rejects invalid primitive edits instead of silently coercing them', () => {
        expect(() => applyInitialStateRowValue({ hp: 10 }, ['hp'], 'NaN'))
            .toThrow(/finite number/);
        expect(() => applyWorldSchemaRowPatch(schema, ['properties', 'player'], {
            pattern: '[',
        })).toThrow(/valid regular expression/);
    });
});
