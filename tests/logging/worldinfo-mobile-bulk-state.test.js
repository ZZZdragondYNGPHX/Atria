import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

describe('World Info mobile catalogue-to-entries state', () => {
    test('opening a book refreshes stale bulk selection without forcing mobile detail', () => {
        const source = readFileSync(new URL('../../public/scripts/world-info/workspace.js', import.meta.url), 'utf8');
        expect(source).toContain('function renderBulkInspector({ enterMobileDetail = true } = {})');
        expect(source).toContain('if (enterMobileDetail && isMobileWorkspace())');
        expect(source).toContain('syncSelectionUi({ enterMobileDetail: !openingEntriesFromAnotherView });');
    });
});
