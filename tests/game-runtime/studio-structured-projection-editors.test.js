import { describe, expect, test } from '@jest/globals';

import {
    PROJECTION_EDITOR,
    addProjectionEntry,
    applyProjectionFieldPatch,
    parseProjectionDocument,
    previewProjectionDocument,
    removeProjectionEntry,
    serializeProjectionDocument,
} from '../../public/scripts/extensions/character-editor-assistant/studio/structured-projection-editors.js';

describe('Game Studio Selector / Observation editors', () => {
    test('edits Selector source and previews values through the real R4 Selector Runtime', () => {
        const source = [
            { id: 'player.hp', formula: 'world.player.hp' },
            { id: 'player.ratio', formula: 'world.player.hp / world.player.maxHp' },
        ];
        const parsed = parseProjectionDocument('selectors', JSON.stringify(source));
        expect(parsed.model.entries).toHaveLength(2);

        const next = applyProjectionFieldPatch(
            source,
            'selectors',
            0,
            'formula',
            'max(0, world.player.hp)',
        );
        const preview = previewProjectionDocument('selectors', next, {
            player: { hp: 7, maxHp: 20 },
        });
        expect(preview.values).toEqual({
            'player.hp': 7,
            'player.ratio': 0.35,
        });
        expect(source[0].formula).toBe('world.player.hp');
    });

    test('edits Observation source and previews the actual R5 observation envelope', () => {
        const source = [
            { id: 'player.hp', formula: 'world.player.hp' },
            { id: 'preview.role', formula: 'args.role' },
        ];
        const preview = previewProjectionDocument(
            PROJECTION_EDITOR.OBSERVATIONS,
            source,
            { player: { hp: 12 } },
            { role: 'director' },
        );

        expect(preview.observation).toEqual({
            views: {
                'player.hp': 12,
                'preview.role': 'director',
            },
            recentEvents: [],
        });
    });

    test('add/remove keeps projection source valid and serializes the same JSON document', () => {
        const withSelector = addProjectionEntry([], PROJECTION_EDITOR.SELECTORS);
        expect(withSelector).toEqual([
            { id: 'new_selector', formula: 'world' },
        ]);
        expect(removeProjectionEntry(withSelector, 'selectors', 0)).toEqual([]);
        expect(serializeProjectionDocument(withSelector, 'selectors'))
            .toContain('"new_selector"');
    });

    test('fails closed on invalid ids and formulas', () => {
        expect(() => parseProjectionDocument(
            'selectors',
            '[{"id":"Bad Selector","formula":"world.hp"}]',
        )).toThrow(/selector id/i);

        expect(() => applyProjectionFieldPatch(
            [{ id: 'hp', formula: 'world.hp' }],
            'selectors',
            0,
            'formula',
            'world.hp ** 2',
        )).toThrow();

        expect(() => parseProjectionDocument(
            'observations',
            '[{"id":"hp","formula":""}]',
        )).toThrow(/requires formula/);
    });
});
