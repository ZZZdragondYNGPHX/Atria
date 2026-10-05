/** @jest-environment jsdom */
import { test, expect, jest } from '@jest/globals';
import { serialize, deserialize } from 'node:v8';
import { mountStudioWorldsEditor, patchStudioWorlds } from '../../public/scripts/native/studio-worlds-editor.js';
import { mountWorldEditor, validateWorldEditorValue } from '../../public/scripts/native/world-editor.js';
import { assertPackagedWorldSnapshot } from '../../src/native/world-knowledge.js';

globalThis.structuredClone = value => deserialize(serialize(value));
const id = (prefix, letter = 'a') => prefix + '_' + letter.repeat(32);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const world = (letter = 'a') => ({ world: { worldId: id('world', letter), displayName: 'Same', currentRevisionId: id('worldv', letter) }, revision: { worldId: id('world', letter), worldRevisionId: id('worldv', letter), metadata: { custom: { values: [null, false, 7] } } } });
const source = (worlds = [world()]) => ({ worlds, package: { actors: [], entryPoints: [{ entryPointId: id('entry'), worldIds: [id('world')] }] }, dependencies: { worlds: [], knowledgeBindings: [], assets: [] }, knowledgeBindings: [], assetFiles: [] });
function setup(value = world(), projectSource = source(), collection = false, library = []) {
    const root = document.createElement('div'); document.body.replaceChildren(root); const onReview = jest.fn();
    const editor = mountStudioWorldsEditor({ document, root, value, projectSource, collection, library, onReview });
    const click = label => [...root.querySelectorAll('button')].find(node => node.textContent === label).click();
    const fill = (label, value) => { const node = root.querySelector('[aria-label="' + label + '"]'); node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })); return node; };
    return { root, onReview, editor, click, fill };
}
test('World Fields never insert optional defaults and full nested metadata round trips through canonical Source', async () => {
    const value = world(), { root, editor, click, fill, onReview } = setup(value); await tick();
    expect(editor.getDraft()).toEqual(value); expect(root.querySelector('[data-atria-draft-dirty]').dataset.atriaDraftDirty).toBe('false');
    fill('World name', 'Renamed'); click('Source'); click('Fields'); click('Review Changes'); await tick();
    expect(onReview.mock.calls[0][0]).toEqual({ ...value, world: { ...value.world, displayName: 'Renamed' } });
    expect(assertPackagedWorldSnapshot(onReview.mock.calls[0][0]).revision.metadata).toEqual(value.revision.metadata);
    expect(editor.getDraft().revision).not.toHaveProperty('baseline'); expect(value.world.displayName).toBe('Same');
});
test('World roots, identity pins, unknown fields and invalid Source are rejected without changing authored text', async () => {
    for (const key of ['schema', 'baseline', 'metadata']) for (const bad of [null, [], false]) expect(() => validateWorldEditorValue({ ...world(), revision: { ...world().revision, [key]: bad } }, true)).toThrow();
    for (const bad of [{ ...world(), extra: true }, { ...world(), world: { ...world().world, path: 'old' } }, { ...world(), revision: { ...world().revision, worldRevisionId: id('worldv', 'b') } }]) expect(() => validateWorldEditorValue(bad, true)).toThrow();
    const { editor, click, fill, onReview, root } = setup(); click('Source'); fill('Worlds resource JSON', '{ invalid'); click('Review Changes'); await tick();
    expect(editor.getSource()).toBe('{ invalid'); expect(onReview).not.toHaveBeenCalled(); expect(root.querySelector('[role="alert"]')).not.toBeNull();
    const invalid = { ...world(), revision: { ...world().revision, baseline: null } }; fill('Worlds resource JSON', JSON.stringify(invalid)); click('Fields'); await tick();
    expect(editor.getSource()).toBe(JSON.stringify(invalid)); expect(root.querySelector('textarea').value).toBe(JSON.stringify(invalid));
});
test('exact World patch preserves source neighbors and rejects duplicates, attached overlap, undeclared refs and referenced removal', () => {
    const original = source([world(), world('b')]), changed = world('b'); changed.revision.baseline = { nested: [null, true, 3] };
    const next = patchStudioWorlds(original, id('world', 'b'), changed);
    expect(next.worlds[1]).toEqual(changed); expect(next.worlds[0]).toEqual(original.worlds[0]); expect(next.package).toEqual(original.package); expect(original.worlds[1].revision).not.toHaveProperty('baseline');
    expect(() => patchStudioWorlds(source([world(), world()]), id('world'), world())).toThrow(/ambiguous/);
    expect(() => patchStudioWorlds({ ...source(), dependencies: { ...source().dependencies, worlds: [{ worldId: id('world'), worldRevisionId: id('worldv') }] } }, null, [world()], true)).toThrow(/attached/);
    expect(() => patchStudioWorlds(source(), null, [], true)).toThrow(/EntryPoint/);
    expect(() => patchStudioWorlds(source(), id('world'), { ...world(), revision: { ...world().revision, assetIds: [id('asset')] } })).toThrow(/declared/);
    expect(patchStudioWorlds({ ...source(), package: { entryPoints: [] } }, null, [], true).worlds).toEqual([]);
});
test('failed dependency inventory leaves local fields and malformed Source intact; disposal rejects late responses', async () => {
    let resolve;
    globalThis.fetch = jest.fn(() => new Promise(done => { resolve = done; }));
    const { root, click, fill, editor } = setup(world(), source(), false, null);
    fill('World name', 'Before dependencies'); click('Source'); const text = fill('Worlds resource JSON', '{ retain me'); text.focus();
    resolve({ ok: false, status: 503, json: async () => ({ message: 'Unavailable' }) }); await tick();
    expect(editor.getSource()).toBe('{ retain me'); expect(document.activeElement).toBe(text); expect(root.querySelector('[role="alert"]')).not.toBeNull();
    [...root.querySelectorAll('button')].find(node => node.textContent === 'Try again').click(); await tick(); editor.dispose(); root.replaceChildren();
    resolve({ ok: true, json: async () => [] }); await tick(); expect(root.childElementCount).toBe(0); delete globalThis.fetch;
});
test('binding failures retain declared IDs and exact old asset hashes rather than adopting inventory heads', async () => {
    globalThis.fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    const value = world(); value.revision.knowledgeBindingIds = [id('kbind')]; value.revision.assetIds = [id('asset')];
    const project = source([value]); project.dependencies.knowledgeBindings = [id('kbind')]; project.dependencies.assets = [{ assetId: id('asset'), contentHash: 'b'.repeat(64) }];
    const { root, click, onReview, editor } = setup(value, project, false, [{ resourceType: 'core.asset', resourceId: id('asset'), displayName: 'New head', currentRevision: 'c'.repeat(64) }]); await tick();
    expect(root.textContent).toContain('b'.repeat(64)); expect(root.textContent).not.toContain('c'.repeat(64)); expect(editor.getDraft()).toEqual(value);
    click('Review Changes'); await tick(); expect(onReview.mock.calls[0][0]).toEqual(value); delete globalThis.fetch;
});
test('Library content retains omitted fields while review stays on its original bare-content authority', async () => {
    const root = document.createElement('div'); document.body.replaceChildren(root); const onReview = jest.fn();
    const editor = mountWorldEditor({ document, root, value: { metadata: { nested: [null, false] } }, library: [], onReview }); await tick();
    [...root.querySelectorAll('button')].find(node => node.textContent === 'Review Changes').click(); await tick();
    expect(onReview.mock.calls[0][0]).toEqual({ metadata: { nested: [null, false] } }); expect(editor.getDraft()).not.toHaveProperty('baseline');
    expect(() => validateWorldEditorValue({ worldId: id('world') })).toThrow();
});
