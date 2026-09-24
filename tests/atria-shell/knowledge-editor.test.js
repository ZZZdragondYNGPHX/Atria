/** @jest-environment jsdom */
import { test, expect, jest } from '@jest/globals';
import { serialize, deserialize } from 'node:v8';
import { randomUUID } from 'node:crypto';
import { mountKnowledgeEditor } from '../../public/scripts/native/knowledge-editor.js';
globalThis.structuredClone = value => deserialize(serialize(value));
globalThis.crypto.randomUUID = randomUUID;
const id = digit => 'kentry_' + digit.repeat(32);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function setup(value) {
    const root = document.createElement('div'); document.body.replaceChildren(root); const onReview = jest.fn();
    const editor = mountKnowledgeEditor({ document, root, value, onReview, confirmDelete: async () => true });
    const buttons = name => [...root.querySelectorAll('button')].filter(item => item.textContent === name);
    const field = name => root.querySelector('[aria-label="' + name + '"]');
    const change = (name, value) => { const node = field(name); node.value = value; node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input')); };
    return { root, onReview, editor, buttons, field, change };
}

test('semantic revision editing preserves identities and relations through create/reorder/delete/review', async () => {
    const value = { entries: [{ knowledgeEntryId: id('a'), content: 'First', metadata: { title: 'First' } }, { knowledgeEntryId: id('b'), content: 'Second', relations: { requiredEntryIds: [id('a')] } }], revision: { entryIds: [id('a'), id('b')] } };
    const { root, buttons, change, editor, onReview } = setup(value);
    buttons('Delete entry')[0].click(); await tick();
    expect(root.querySelector('[role="alert"]').textContent).toContain('Second');
    buttons('Add entry')[0].click(); await tick();
    change('Entry title', 'Third'); change('Entry content', 'New content');
    const third = editor.getDraft().entries[2].knowledgeEntryId;
    buttons('Move entry up')[0].click(); await tick();
    expect(editor.getDraft().entries.map(entry => entry.knowledgeEntryId)).toEqual([id('a'), third, id('b')]);
    buttons('Delete entry')[0].click(); await tick();
    expect(editor.getDraft().entries).toHaveLength(2);
    buttons('Review Changes')[0].click(); await tick();
    expect(onReview.mock.calls[0][0].revision.entryIds).toEqual([id('a'), id('b')]);
    expect(onReview.mock.calls[0][0].entries[1].relations.requiredEntryIds).toEqual([id('a')]);
    expect(value.entries[0]).not.toHaveProperty('applicability');
});

test('typed conditions, lifecycle, target identities and discovery round-trip without JSON authoring', async () => {
    const { root, buttons, field, change, onReview } = setup({ entries: [{ knowledgeEntryId: id('a'), content: 'Harbor' }] });
    change('Keywords', 'harbor\nport'); change('Budget priority', 'scene'); change('Compact content', 'Harbor.'); change('Activation probability (%)', '75'); change('Sticky turns', '2');
    buttons('Add state condition')[0].click(); await tick();
    change('State path segments 1', 'scene\nplace'); change('Expected value 1', 'harbor');
    const activate = [...root.querySelectorAll('label')].find(node => node.textContent === 'Activate from matching state without keywords').querySelector('input'); activate.checked = true; activate.dispatchEvent(new Event('change'));
    buttons('Add target rule')[0].click(); await tick();
    change('Exact target identity 1', 'actor-a'); change('Target kind 1', 'actor');
    buttons('Review Changes')[0].click(); await tick();
    const entry = onReview.mock.calls[0][0].entries[0];
    expect(entry.discovery.keywords).toEqual(['harbor', 'port']);
    expect(entry.metadata).toMatchObject({ budgetTier: 'scene', compactContent: 'Harbor.' });
    expect(entry.lifecycle).toMatchObject({ probability: 75, sticky: 2 });
    expect(entry.applicability).toMatchObject({ stateActivation: true, stateConditions: [{ providerId: 'atri_variables', path: ['scene', 'place'], operator: 'eq', value: 'harbor' }] });
    expect(entry.delivery.target).toEqual({ kind: 'actor', id: 'actor-a' });
    expect(field('Entry content').value).toBe('Harbor');
});

test('Source errors retain the exact draft and failed review never mutates the committed value', async () => {
    const value = { entries: [{ knowledgeEntryId: id('a'), content: 'Original' }], metadata: { custom: { retained: true } } };
    const { buttons, field, root, onReview } = setup(value);
    buttons('Source')[0].click(); await tick();
    const source = field('Knowledge revision JSON'); source.value = '{ bad'; source.dispatchEvent(new Event('input'));
    buttons('Review Changes')[0].click(); await tick(); expect(onReview).not.toHaveBeenCalled(); expect(source.value).toBe('{ bad');
    source.value = JSON.stringify({ ...value, entries: [{ ...value.entries[0], lifecycle: { sticky: { turns: 2 } } }] }); source.dispatchEvent(new Event('input'));
    buttons('Fields')[0].click(); await tick(); expect(root.querySelector('[role="alert"]').textContent).toContain('lifecycle.sticky');
    source.value = JSON.stringify({ ...value, entries: [{ ...value.entries[0], content: 'Edited' }] }); source.dispatchEvent(new Event('input'));
    onReview.mockRejectedValueOnce(new Error('Try again'));
    buttons('Review Changes')[0].click(); await tick(); expect(source.value).toContain('Edited'); expect(value.entries[0].content).toBe('Original');
    buttons('Review Changes')[0].click(); await tick(); expect(onReview).toHaveBeenCalledTimes(2);
});
