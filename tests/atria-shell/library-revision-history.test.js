/** @jest-environment jsdom */
import { test, expect } from '@jest/globals';
import { compareLibraryContent } from '../../public/scripts/native/library-revision-history.js';

test('Knowledge revision diff follows stable entry identities and records ordering separately', () => {
    const a = { knowledgeEntryId: 'a', content: 'First', metadata: { title: 'Harbor' } }, b = { knowledgeEntryId: 'b', content: 'Second' };
    const changes = compareLibraryContent({ entries: [a, b], metadata: {} }, { entries: [b, { ...a, content: 'Changed' }], metadata: {} }, true);
    expect(changes).toEqual([{ path: 'Knowledge entry: Harbor.content', kind: 'Changed', before: 'First', after: 'Changed' }, { path: 'Entry order', kind: 'Changed', before: ['a', 'b'], after: ['b', 'a'] }]);
});
test('World revision diff describes baseline/schema and explicit added or removed dependencies', () => {
    const changes = compareLibraryContent({ baseline: { weather: 'rain' }, schema: {}, assetIds: ['old'], knowledgeBindingIds: ['binding'] }, { baseline: { weather: 'sun' }, schema: {}, assetIds: ['new'], knowledgeBindingIds: ['binding'] });
    expect(changes).toEqual([{ path: 'baseline.weather', kind: 'Changed', before: 'rain', after: 'sun' }, { path: 'assetIds', kind: 'Removed dependency', before: 'old', after: undefined }, { path: 'assetIds', kind: 'Added dependency', before: undefined, after: 'new' }]);
});
