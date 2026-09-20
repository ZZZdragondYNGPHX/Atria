import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

describe('L09 destructive diagnostics actions', () => {
    test('raw-log clear requires explicit confirmation and states that incidents survive', () => {
        const source = readFileSync(new URL('../../public/scripts/logging/workspace.js', import.meta.url), 'utf8');
        expect(source).toContain('POPUP_RESULT');
        expect(source).toContain('POPUP_TYPE.CONFIRM');
        expect(source).toContain('Existing diagnostic incidents will be kept.');
        expect(source).toContain('confirmed !== POPUP_RESULT.AFFIRMATIVE');
        expect(source).toContain('Existing incidents were preserved.');
    });
});
