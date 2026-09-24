/** @jest-environment jsdom */
import { test, expect, jest } from '@jest/globals';
import { serialize, deserialize } from 'node:v8';
import { mountWorldEditor } from '../../public/scripts/native/world-editor.js';
globalThis.structuredClone = value => deserialize(serialize(value));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function setup(value, projectSource) {
    const root = document.createElement('div'); document.body.replaceChildren(root); const onReview = jest.fn();
    const editor = mountWorldEditor({ document, root, value, projectSource, library: [], onReview });
    const button = name => [...root.querySelectorAll('button')].find(item => item.textContent === name);
    const field = name => root.querySelector('[aria-label="' + name + '"]');
    const change = (name, value) => { const node = field(name); node.value = value; node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input')); };
    return { root, onReview, editor, button, field, change };
}

test('World composition edits typed baseline/schema and exact project dependencies without changing identity', async () => {
    const source = { dependencies: { knowledgeBindings: [], assets: [] }, knowledge: [], knowledgeBindings: [{ knowledgeBindingId: 'binding', source: { knowledgeRevisionId: 'exact' }, metadata: { displayName: 'Canon' } }], assetFiles: [{ assetId: 'asset', path: 'map.png', logicalName: 'Harbor map' }] };
    const original = { world: { worldId: 'world' }, revision: { worldRevisionId: 'revision', schema: {}, baseline: {}, knowledgeBindingIds: [], assetIds: [] } };
    const { root, change, button, onReview, editor } = setup(original, source); await tick();
    change('baseline new field', 'weather'); button('Add field').click(); await tick(); change('baseline.weather', 'rain');
    const schema = [...root.querySelectorAll('details')].find(item => item.querySelector('summary').textContent === 'World schema');
    change('schema new field', 'temperature'); schema.querySelector('button').click(); await tick();
    change('schema.temperature type', 'object'); await tick(); change('schema.temperature new field', 'type');
    const currentSchema = [...root.querySelectorAll('details')].find(item => item.querySelector('summary').textContent === 'World schema');
    [...currentSchema.querySelectorAll('button')].find(item => item.textContent === 'Add field').click(); await tick(); change('schema.temperature.type', 'number');
    for (const title of ['Canon', 'Harbor map']) { const node = [...root.querySelectorAll('label')].find(item => item.textContent === title).querySelector('input'); node.checked = true; node.dispatchEvent(new Event('change')); }
    button('Review Changes').click(); await tick();
    expect(onReview.mock.calls[0][0]).toMatchObject({ world: { worldId: 'world' }, revision: { worldRevisionId: 'revision', baseline: { weather: 'rain' }, schema: { temperature: { type: 'number' } }, knowledgeBindingIds: ['binding'], assetIds: ['asset'] } });
    expect(onReview.mock.calls[0][1].dependencies[0]).toMatchObject({ name: 'Canon', exact: 'exact' });
    expect(original.revision.baseline).toEqual({}); expect(editor.getDraft().revision.assetIds).toEqual(['asset']);
});

test('missing World dependencies remain explicit and Source errors retain authored text', async () => {
    const { root, button, change, field, onReview } = setup({ baseline: {}, schema: {}, knowledgeBindingIds: ['missing'], assetIds: [] }); await tick();
    expect(root.textContent).toContain('Missing dependency');
    button('Review Changes').click(); await tick(); expect(onReview).not.toHaveBeenCalled();
    button('Remove missing reference').click(); await tick(); button('Source').click(); await tick();
    change('World revision JSON', '{ invalid'); button('Review Changes').click(); await tick();
    expect(field('World revision JSON').value).toBe('{ invalid'); expect(root.querySelector('[role="alert"]')).not.toBeNull();
    change('World revision JSON', JSON.stringify({ baseline: { time: 7 }, schema: {}, assetIds: [], knowledgeBindingIds: [] }));
    button('Fields').click(); await tick(); expect(field('baseline.time').value).toBe('7');
    button('Review Changes').click(); await tick(); expect(onReview).toHaveBeenCalledTimes(1);
});

test('Library dependency loading can retry and exposes exact asset identity in review', async () => {
    let fail = true;
    globalThis.fetch = jest.fn(async () => ({ ok: !fail, status: 503, json: async () => fail ? {} : [{ resourceType: 'core.asset', resourceId: 'asset', displayName: 'Map', currentRevision: 'a'.repeat(64) }] }));
    const root = document.createElement('div'); document.body.replaceChildren(root); const onReview = jest.fn();
    mountWorldEditor({ document, root, value: { baseline: {}, schema: {}, assetIds: [], knowledgeBindingIds: [] }, onReview });
    await tick(); expect(root.querySelector('[role="alert"]')).not.toBeNull();
    fail = false; [...root.querySelectorAll('button')].find(item => item.textContent === 'Try again').click(); await tick();
    const checkbox = [...root.querySelectorAll('label')].find(item => item.textContent === 'Map').querySelector('input'); checkbox.checked = true; checkbox.dispatchEvent(new Event('change'));
    [...root.querySelectorAll('button')].find(item => item.textContent === 'Review Changes').click(); await tick();
    expect(onReview.mock.calls[0][0].assetIds).toEqual(['asset']);
    expect(onReview.mock.calls[0][1].dependencies).toEqual([{ id: 'asset', name: 'Map', exact: 'a'.repeat(64), source: 'library' }]);
    delete globalThis.fetch;
});
