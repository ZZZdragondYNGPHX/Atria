import { describe, expect, test } from '@jest/globals';
import { normalizeRegexPresets } from '../../public/shared/regex-presets.js';
describe('account Regex groups', () => {
    test('drops retired owners and deleted rule references without mutating input', () => {
        const input = [{ id: 'g', name: 'Group', isSelected: true, global: [{ id: 'a' }, { id: 'gone' }, { id: 'a' }], scoped: [{ id: 'old' }], preset: [] }];
        expect(normalizeRegexPresets(input, [{ id: 'a' }])).toEqual([{ id: 'g', name: 'Group', isSelected: true, global: [{ id: 'a' }] }]);
        expect(input[0].global).toHaveLength(3);
        expect(normalizeRegexPresets(input, [])[0].global).toEqual([]);
        expect(normalizeRegexPresets(null)).toEqual([]);
    });
});
