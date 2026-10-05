/** @jest-environment jsdom */
import { describe, expect, jest, test } from '@jest/globals';
import { mountStudioEntryPointsEditor, patchStudioEntryPoints, validateStudioEntryPoints } from '../../public/scripts/native/studio-entrypoints-editor.js';
import { serialize, deserialize } from 'node:v8';
globalThis.structuredClone = value => deserialize(serialize(value));
const { assertEntryPoint } = await import('../../src/native/contracts.js');

const id = (prefix, letter = 'a') => prefix + '_' + letter.repeat(32);
const entry = (letter = 'a') => ({ entryPointId: id('entry', letter), displayName: 'Same name', actorIds: [id('actor')], worldIds: [id('world')], knowledgeBindingIds: [id('kbind')],
    primaryActorId: id('actor'), primaryWorldId: id('world'), initialStateOverlay: { nested: [null, false, 2], hp: 8 },
    initialTimeline: [{ role: 'assistant', content: 'Opening', metadata: { opaque: [null, false, 3] }, projection: { arbitrary: true } }],
    runtime: { opaque: { values: [false, null, 2] } }, recommendations: null, orchestration: ['custom'], memory: false });
const project = (entries = [entry()]) => ({ package: { actors: [{ actorId: id('actor'), displayName: 'Guide' }], entryPoints: entries, untouched: true },
    worlds: [{ world: { worldId: id('world'), displayName: 'Harbor' }, revision: { worldRevisionId: id('worldv') } }],
    knowledgeBindings: [{ knowledgeBindingId: id('kbind'), source: { knowledgeBaseId: id('kb'), knowledgeRevisionId: id('kbv') } }], resources: [{ opaque: true }],
    dependencies: { worlds: [{ worldId: id('world', 'b'), worldRevisionId: id('worldv', 'b') }], knowledgeBindings: [id('kbind', 'b')] } });
function setup(value = entry(), collection = false) {
    const root = document.createElement('div'); document.body.replaceChildren(root); const onReview = jest.fn();
    const source = project(collection ? value : [value]);
    const editor = mountStudioEntryPointsEditor({ document, root, value, projectSource: source, onReview, collection });
    const click = label => [...root.querySelectorAll('button')].find(node => node.textContent === label).click();
    const input = (name, value) => { const node = root.querySelector(`[name="${name}"]`); node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })); return node; };
    return { root, onReview, click, input, editor, source };
}
describe('EntryPoints single draft and pre-review boundaries', () => {
    test('fields, optional primary removal, nested messages and advanced JSON round trip to canonical output', () => {
        const original = entry(); const { root, click, input, onReview, editor } = setup(original);
        input('displayName', 'Renamed'); input('initialStateOverlay.hp', '7.5'); input('initialTimeline.0.content', 'Changed');
        input('runtime.opaque.values.2', '9'); click('Remove primary Actor'); click('Remove primary World'); click('Source');
        const parsed = JSON.parse(root.querySelector('textarea').value);
        expect(parsed).toEqual({ ...original, displayName: 'Renamed', primaryActorId: undefined, primaryWorldId: undefined,
            initialStateOverlay: { ...original.initialStateOverlay, hp: 7.5 }, initialTimeline: [{ ...original.initialTimeline[0], content: 'Changed' }], runtime: { opaque: { values: [false, null, 9] } } });
        click('Fields'); click('Review Changes'); expect(onReview).toHaveBeenCalledWith(parsed);
        expect(assertEntryPoint(JSON.parse(editor.getSource()))).toEqual(parsed); expect(original).toEqual(entry());
    });
    test('missing fields stay absent; exact references append in order and primaries never save implicit fallbacks', () => {
        const value = { entryPointId: id('entry'), displayName: ' ', actorIds: [], worldIds: [], knowledgeBindingIds: [] };
        const { root, click, onReview, editor } = setup(value); click('Review Changes'); expect(onReview).toHaveBeenCalledWith(value);
        const add = [...root.querySelectorAll('button')].find(node => node.textContent.includes(id('world', 'b'))); add.click();
        const primary = root.querySelector('[name="primaryWorldId"]'); primary.value = id('world', 'b'); primary.dispatchEvent(new Event('change', { bubbles: true }));
        expect(JSON.parse(editor.getSource())).toEqual({ ...value, worldIds: [id('world', 'b')], primaryWorldId: id('world', 'b') });
        click('Remove primary World'); expect(JSON.parse(editor.getSource()).primaryWorldId).toBeUndefined();
        expect(root.textContent).toContain(id('worldv', 'b')); expect(root.querySelector('[data-atria-draft-dirty]').dataset.atriaDraftDirty).toBe('true');
    });
    test('invalid Source and unknown/retired fields never stage and remain recoverable verbatim', () => {
        const { root, click, onReview, editor } = setup(); click('Source');
        const source = root.querySelector('textarea');
        for (const text of ['{ malformed', 'null', JSON.stringify({ ...entry(), metadata: { keep: true }, ui: null, world: {}, characterId: 'legacy' })]) {
            source.value = text; source.dispatchEvent(new Event('input', { bubbles: true })); click('Review Changes');
            expect(onReview).not.toHaveBeenCalled(); expect(editor.getSource()).toBe(text); expect(root.querySelector('[role="alert"]')).not.toBeNull();
        }
        expect(root.querySelector('[role="alert"]').textContent).toContain('metadata, ui, world, characterId');
        source.value = 'null'; source.dispatchEvent(new Event('input', { bubbles: true })); click('Fields'); click('Source'); expect(root.querySelector('textarea').value).toBe('null');
    });
    test('collection add/delete/reorder and explicit identity edits clone only entryPoints; last deletion and ambiguity reject', () => {
        const a = entry(), b = entry('b'), c = entry('c'); const source = project([a, b]);
        expect(patchStudioEntryPoints(source, a.entryPointId, [b, a, c], true)).toEqual({ ...source, package: { ...source.package, entryPoints: [b, a, c] } });
        expect(patchStudioEntryPoints(source, b.entryPointId, { ...b, entryPointId: c.entryPointId }).package.entryPoints).toEqual([a, { ...b, entryPointId: c.entryPointId }]);
        expect(patchStudioEntryPoints(source, undefined, [b], true).package.entryPoints).toEqual([b]); expect(source.package.entryPoints).toEqual([a, b]);
        expect(() => patchStudioEntryPoints(source, undefined, [], true)).toThrow(/non-empty/);
        expect(() => patchStudioEntryPoints(source, undefined, [a, a], true)).toThrow(/Duplicate/);
        expect(() => patchStudioEntryPoints(project([a, a]), a.entryPointId, b)).toThrow(/ambiguous/);
        expect(patchStudioEntryPoints(project([]), undefined, [a], true).package.entryPoints).toEqual([a]);
        const { root, click, onReview } = setup([a, b], true); expect(root.querySelector('textarea')).not.toBeNull(); click('Review Changes'); expect(onReview).toHaveBeenCalledWith([a, b]);
    });
    test('ordered references, primary membership and exact dependencies reject invalid values before review', () => {
        const source = project();
        for (const patch of [{ actorIds: null }, { actorIds: [id('actor'), id('actor')] }, { actorIds: [id('actor', 'b')] }, { worldIds: [id('world', 'c')] },
            { knowledgeBindingIds: [id('kbind', 'c')] }, { primaryActorId: id('actor', 'b') }, { primaryWorldId: id('world', 'b') }, { entryPointId: 'legacy' },
            { displayName: '' }, { displayName: 'x'.repeat(257) }, { runtime: { experienceContract: {} } }]) expect(() => validateStudioEntryPoints([{ ...entry(), ...patch }], source)).toThrow();
        const valid = { ...entry(), worldIds: [id('world', 'b'), id('world')], knowledgeBindingIds: [id('kbind', 'b'), id('kbind')], primaryActorId: null };
        expect(() => validateStudioEntryPoints([valid], source)).not.toThrow();
        const { input, click, root } = setup(); const name = input('displayName', ''); click('Review Changes'); expect(document.activeElement).toBe(name); expect(root.querySelector('[role="alert"]')).not.toBeNull();
    });
    test('source contract permits arbitrary optional JSON while startup constraints stay explicit and values unchanged', () => {
        for (const arbitrary of [null, false, 5, 'text', [], { unknown: [null, true, 4] }]) {
            const value = { ...entry(), ...Object.fromEntries(['initialStateOverlay', 'initialTimeline', 'runtime', 'recommendations', 'orchestration', 'memory'].map(key => [key, arbitrary])) };
            const { click, editor, onReview, root } = setup(value); click('Source'); click('Fields'); click('Review Changes');
            expect(onReview).toHaveBeenCalledWith(value); expect(JSON.parse(editor.getSource())).toEqual(assertEntryPoint(value));
            expect(root.textContent).toContain('Review is not a startup check');
        }
    });
});
