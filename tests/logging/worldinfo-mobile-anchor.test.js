import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

describe('world info virtual-list mobile anchoring', () => {
    test('virtual list disables scroll anchoring and resets after mobile layout settles', () => {
        const source = readFileSync(new URL('../../public/scripts/world-info/workspace.js', import.meta.url), 'utf8');
        const css = readFileSync(new URL('../../public/css/world-info.css', import.meta.url), 'utf8');
        expect(source).toContain("if (viewport && isMobileWorkspace() && !state.mobileDetail) viewport.scrollTop = 0;");
        expect(source).toContain('requestAnimationFrame(() => {');
        expect(css).toContain('overflow-anchor: none;');
    });
});
