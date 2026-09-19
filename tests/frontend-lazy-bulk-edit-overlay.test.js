import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const SCRIPT_URL = new URL('../public/script.js', import.meta.url);
const BULK_EDIT_URL = new URL('../public/scripts/bulk-edit.js', import.meta.url);
const OVERLAY_URL = new URL('../public/scripts/BulkEditOverlay.js', import.meta.url);

describe('lazy bulk edit overlay loading', () => {
    test('keeps BulkEditOverlay out of the initial script.js static graph', () => {
        const source = readFileSync(SCRIPT_URL, 'utf8');

        expect(source).not.toContain("from './scripts/BulkEditOverlay.js'");
        expect(source).not.toContain('new BulkEditOverlay()');
        expect(source).toContain('export let characterGroupOverlay = null;');
        expect(source).toContain('export function setCharacterGroupOverlay(overlay)');
        expect(source).toContain("import('./scripts/bulk-edit.js')");
    });

    test('constructs the overlay only when the post-visible bulk-edit module initializes', () => {
        const source = readFileSync(BULK_EDIT_URL, 'utf8');
        const initAt = source.indexOf('export function initBulkEdit()');
        const constructAt = source.indexOf('setCharacterGroupOverlay(new BulkEditOverlay())', initAt);

        expect(initAt).toBeGreaterThanOrEqual(0);
        expect(constructAt).toBeGreaterThan(initAt);
        expect(source).toContain("import { BulkEditOverlay, BulkEditOverlayState, CharacterContextMenu } from './BulkEditOverlay.js'");
    });

    test('overlay no longer reaches back through script.js for its own singleton', () => {
        const source = readFileSync(OVERLAY_URL, 'utf8');
        const importBlock = source.slice(0, source.indexOf("import { favsToHotswap"));

        expect(importBlock).not.toContain('characterGroupOverlay');
        expect(source).not.toContain('CharacterContextMenu.tag(');
        expect(source).toContain('this.bulkTagPopupHandler.show(this.selectedCharacters);');
    });
});
