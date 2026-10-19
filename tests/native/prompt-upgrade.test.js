import { mergePromptUpgrade, comparablePromptResource, promptUpgradeOrigin } from '../../public/shared/prompt-upgrade.js';

test('three-way upgrade combines separate edits, ignores object key order and requires a choice for competing prose', () => {
    const base = { body: 'Old voice', displayName: 'Voice', parameters: { tone: { type: 'string', default: 'quiet' } } };
    const local = { ...base, body: 'My private voice' }, upstream = { ...base, displayName: 'New title', body: 'New upstream voice' };
    const first = mergePromptUpgrade(base, local, upstream);
    expect(first.conflicts.map(item => item.path)).toEqual(['/body']);
    expect(first.resource.displayName).toBe('New title');
    expect(mergePromptUpgrade(base, local, upstream, { '/body': 'local' })).toMatchObject({ resource: { body: 'My private voice', displayName: 'New title' }, conflicts: [] });
    expect(mergePromptUpgrade({ a: 1, b: 2 }, { b: 2, a: 1 }, { a: 3, b: 2 }).conflicts).toEqual([]);
});

test('stable Stage and Entry identities preserve independent edits and expose order/deletion conflicts', () => {
    const a = { entryId: 'a', kind: 'anchor', required: false }, b = { entryId: 'b', kind: 'module', disabled: false };
    const resource = entries => ({ stages: [{ stageId: 'main', entries }] });
    const merged = mergePromptUpgrade(resource([a, b]), resource([{ ...a, required: true }, b]), resource([a, { ...b, disabled: true }]));
    expect(merged.conflicts).toEqual([]); expect(merged.resource.stages[0].entries).toEqual([{ ...a, required: true }, { ...b, disabled: true }]);
    const deleted = mergePromptUpgrade(resource([a, b]), resource([a]), resource([a, { ...b, disabled: true }]));
    expect(deleted.conflicts[0].path).toBe('/stages/main/entries/b');
    expect(mergePromptUpgrade(resource([a, b]), resource([a]), resource([a, { ...b, disabled: true }]), { '/stages/main/entries/b': 'upstream' }).resource.stages[0].entries).toHaveLength(2);
});

test('comparison keeps the private identity and provenance while imported origin records retain an exact local base', () => {
    const source = { scope: 'library', resourceType: 'core.prompt-module', resourceId: 'upstream', revision: 'v1' };
    const baseRef = { ...source, resourceId: 'private', revision: 'imported' };
    const current = { promptModuleId: 'private', revision: 'private-v2', body: 'Private', provenance: [{ source: 'atria.resource-bundle', ref: JSON.stringify({ source, baseRef }) }] };
    expect(promptUpgradeOrigin(current)).toEqual({ source, baseRef, derived: false });
    expect(comparablePromptResource({ ...current, promptModuleId: 'other', revision: 'upstream-v2', provenance: [] }, current)).toEqual(current);
});
