/** @jest-environment jsdom */
import { test, expect, jest } from '@jest/globals';
import { serialize, deserialize } from 'node:v8';
import { mountKnowledgeEditor } from '../../public/scripts/native/knowledge-editor.js';
import { mountStudioKnowledgeEditor, patchStudioKnowledge, validateKnowledgeSnapshot } from '../../public/scripts/native/studio-knowledge-editor.js';
import { assertPackagedKnowledgeSnapshot } from '../../src/native/world-knowledge.js';

globalThis.structuredClone = value => deserialize(serialize(value));
const id = (prefix, letter = 'a') => prefix + '_' + letter.repeat(32), tick = () => new Promise(resolve => setTimeout(resolve, 0));
const kb = (letter = 'a') => ({ knowledgeBase: { knowledgeBaseId: id('kb', letter), displayName: 'Same', currentRevisionId: id('kbv', letter) }, revision: { knowledgeBaseId: id('kb', letter), knowledgeRevisionId: id('kbv', letter), entryIds: [id('kentry', letter)], metadata: { plugin: [null, false, 5] } }, entries: [{ knowledgeEntryId: id('kentry', letter), content: 'Original', metadata: { unknown: { list: [null, false, 3] } } }] });
const source = () => ({ knowledge: [kb(), kb('b')], dependencies: { knowledge: [] }, knowledgeBindings: [{ knowledgeBindingId: id('kbind'), source: { kind: 'project', knowledgeBaseId: id('kb'), knowledgeRevisionId: id('kbv') } }], package: { arbitrary: [null, 7] }, worlds: [] });
function setup(value = kb(), options = {}) {
    const root = document.createElement('div'); document.body.replaceChildren(root); const onReview = jest.fn();
    const editor = mountStudioKnowledgeEditor({ document, root, value, projectSource: source(), onReview, ...options });
    const click = label => [...root.querySelectorAll('button')].find(node => node.textContent === label).click();
    const fill = (label, value) => { const node = root.querySelector('[aria-label="' + label + '"]'); node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })); return node; };
    return { root, onReview, editor, click, fill };
}

test('opening Knowledge fields does not add sections or change canonical snapshots, and lazy section edits compose', async () => {
    const value = kb(), { root, editor, click, fill, onReview } = setup(value); await tick();
    expect(editor.getDraft()).toEqual(value); expect(root.querySelector('[data-atria-draft-dirty]').dataset.atriaDraftDirty).toBe('false');
    fill('Knowledge name', 'Renamed'); click('Add target rule'); fill('Exact target identity 1', 'exact-actor'); fill('Delivery priority', '3.5'); fill('Keywords', 'port');
    click('Source'); click('Fields'); click('Review Changes'); await tick();
    const result = onReview.mock.calls[0][0]; expect(result.entries[0].delivery).toEqual({ target: { kind: 'narrator', id: 'exact-actor' }, priority: 3.5 });
    expect(result.entries[0]).not.toHaveProperty('applicability'); expect(result.entries[0]).not.toHaveProperty('lifecycle'); expect(result.entries[0].metadata).toEqual(value.entries[0].metadata);
    expect(assertPackagedKnowledgeSnapshot(result).knowledgeBase.displayName).toBe('Renamed'); expect(value.entries[0]).not.toHaveProperty('delivery');
});

test('Knowledge snapshot guards preserve invalid Source and reject root, pin, duplicate, relation and metadata loss', async () => {
    const value = kb();
    for (const bad of [{ ...value, extra: true }, { ...value, knowledgeBase: { ...value.knowledgeBase, oldId: 4 } }, { ...value, revision: { ...value.revision, knowledgeRevisionId: id('kbv', 'b') } }, { ...value, revision: { ...value.revision, entryIds: [] } }, { ...value, entries: [value.entries[0], value.entries[0]] }, { ...value, entries: [{ ...value.entries[0], metadata: null }] }, { ...value, entries: [{ ...value.entries[0], relations: { requiredEntryIds: [id('kentry', 'c')] } }] }]) expect(() => validateKnowledgeSnapshot(bad)).toThrow();
    const { click, fill, editor, onReview, root } = setup(); click('Source'); const raw = JSON.stringify({ ...value, revision: { ...value.revision, entryIds: [] } }); fill('Knowledge resource JSON', raw); click('Review Changes'); await tick();
    expect(onReview).not.toHaveBeenCalled(); expect(editor.getSource()).toBe(raw); expect(root.querySelector('[role="alert"]').textContent).toContain('entryIds');
    fill('Knowledge resource JSON', '{ malformed'); click('Fields'); expect(editor.getSource()).toBe('{ malformed');
});

test('exact Knowledge patch retains neighbors, collection order and exact binding pins without guessing or deleting references', () => {
    const original = source(), value = kb('b'); value.knowledgeBase.displayName = 'Changed';
    expect(patchStudioKnowledge(original, id('kb', 'b'), value)).toEqual({ ...original, knowledge: [original.knowledge[0], value] });
    expect(patchStudioKnowledge(original, null, [...original.knowledge].reverse(), true).knowledge[1]).toEqual(original.knowledge[0]);
    expect(() => patchStudioKnowledge(original, null, [kb('b')], true)).toThrow('binding');
    expect(() => patchStudioKnowledge(original, null, [kb(), kb()], true)).toThrow('Duplicate');
    const overlap = source(); overlap.dependencies.knowledge = [{ knowledgeBaseId: id('kb'), knowledgeRevisionId: id('kbv', 'c') }]; expect(() => patchStudioKnowledge(overlap, null, overlap.knowledge, true)).toThrow('attached');
    expect(original.knowledge[1].knowledgeBase.displayName).toBe('Same');
});

test('deferred delete confirmation cannot delete another entry or mutate a disposed editor', async () => {
    for (const dispose of [false, true]) {
        const root = document.createElement('div'); document.body.replaceChildren(root); let resolve;
        const value = { entries: [kb().entries[0], kb('b').entries[0]] };
        const editor = mountKnowledgeEditor({ document, root, value, onReview: jest.fn(), confirmDelete: () => new Promise(done => { resolve = done; }) });
        [...root.querySelectorAll('button')].find(node => node.textContent === 'Delete entry').click();
        if (dispose) editor.dispose(); else { const chooser = root.querySelector('[aria-label="Selected entry"]'); chooser.value = id('kentry', 'b'); chooser.dispatchEvent(new Event('change')); }
        resolve(true); await tick(); expect(editor.getDraft()).toEqual(value);
    }
});

test('Knowledge review blocks duplicate submissions and preserves one Source draft on failure', async () => {
    const { root, click, fill, onReview, editor } = setup(); let reject; onReview.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
    click('Source'); const edited = kb(); edited.entries[0].content = 'Changed'; fill('Knowledge resource JSON', JSON.stringify(edited));
    click('Review Changes'); click('Review Changes'); expect(onReview).toHaveBeenCalledTimes(1); expect(root.querySelector('section').inert).toBe(true);
    reject(new Error('Save failed')); await tick(); expect(editor.getSource()).toBe(JSON.stringify(edited)); expect(root.querySelector('[role="alert"]').textContent).toBe('Save failed');
});
