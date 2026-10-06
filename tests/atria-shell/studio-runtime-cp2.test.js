/** @jest-environment jsdom */
import { expect, jest, test } from '@jest/globals';
import { TextEncoder } from 'node:util';
import { mountStudioRuntimeEditor } from '../../public/scripts/native/studio-runtime-editor.js';
globalThis.TextEncoder = TextEncoder;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const click = (root, text, index = 0) => [...root.querySelectorAll('button')].filter(item => item.textContent === text)[index].click();

test('Runtime authoring shares structured and Source draft, ordered processors and explicit Review', async () => {
    const root = document.createElement('div'); document.body.replaceChildren(root); const onReview = jest.fn();
    const value = { schemaVersion: 1, capabilities: [], dataResources: [] };
    mountStudioRuntimeEditor({ document, root, value, onReview });
    click(root, 'Add Processor'); click(root, 'Add Processor');
    expect(root.querySelector('[data-atria-draft-dirty]').dataset.atriaDraftDirty).toBe('true');
    click(root, 'Move earlier', 1); click(root, 'Source');
    const source = root.querySelector('textarea'); const draft = JSON.parse(source.value);
    expect(draft.processingRuntime.processors.map(item => item.id)).toEqual(['processor-2', 'processor-1']);
    source.value = '{malformed'; source.dispatchEvent(new Event('input', { bubbles: true }));
    click(root, 'Review Changes'); expect(onReview).not.toHaveBeenCalled(); expect(source.value).toBe('{malformed');
    source.value = JSON.stringify(draft); source.dispatchEvent(new Event('input', { bubbles: true }));
    click(root, 'Fields'); click(root, 'Review Changes'); await flush();
    expect(onReview).toHaveBeenCalledWith(draft); expect(value.capabilities).toEqual([]);
});
test('invalid declaration and failed ChangeSet retain exact Source, while duplicate Review is blocked', async () => {
    const root = document.createElement('div'); document.body.replaceChildren(root);
    let release; const onReview = jest.fn(() => new Promise((_, reject) => { release = reject; }));
    mountStudioRuntimeEditor({ document, root, onReview });
    click(root, 'Add Processor'); click(root, 'Source'); const source = root.querySelector('textarea');
    const good = source.value; const invalid = JSON.parse(good); invalid.processingRuntime.processors[0].stage = 'unknown';
    source.value = JSON.stringify(invalid); source.dispatchEvent(new Event('input', { bubbles: true }));
    click(root, 'Review Changes'); expect(onReview).not.toHaveBeenCalled();
    source.value = good; source.dispatchEvent(new Event('input', { bubbles: true }));
    click(root, 'Review Changes'); click(root, 'Review Changes'); expect(onReview).toHaveBeenCalledTimes(1);
    release(new Error('revision conflict')); await flush();
    expect(source.value).toBe(good); expect(root.querySelector('[role="alert"]').textContent).toContain('revision conflict');
});
test('changing Processor implementation supplies its editable required fields and preserves draft through modes', () => {
    const root = document.createElement('div'); document.body.replaceChildren(root);
    mountStudioRuntimeEditor({ document, root, onReview: jest.fn() }); click(root, 'Add Processor');
    let kind = root.querySelector('[name="processingRuntime.processors.0.kind"]');
    kind.value = 'replace'; kind.dispatchEvent(new Event('change'));
    const find = root.querySelector('[name="processingRuntime.processors.0.find"]'); find.value = 'old'; find.dispatchEvent(new Event('input', { bubbles: true }));
    click(root, 'Source'); expect(JSON.parse(root.querySelector('textarea').value).processingRuntime.processors[0].find).toBe('old');
    click(root, 'Fields'); kind = root.querySelector('[name="processingRuntime.processors.0.kind"]');
    kind.value = 'script'; kind.dispatchEvent(new Event('change'));
    expect(root.querySelector('[name="processingRuntime.processors.0.source"]')).not.toBeNull();
    expect(root.querySelector('[name="processingRuntime.processors.0.find"]')).toBeNull();
});
test('Processing preview is a separate saved-revision read and never stages the local draft', async () => {
    const root = document.createElement('div'); document.body.replaceChildren(root);
    const onReview = jest.fn(), onPreview = jest.fn(async value => ({ text: value.text.toUpperCase(), preview: true }));
    mountStudioRuntimeEditor({ document, root, onReview, onPreview }); click(root, 'Add Processor');
    const sample = root.querySelector('[aria-label="Sample text"]'); sample.value = 'test';
    click(root, 'Preview saved revision'); await flush();
    expect(onPreview).toHaveBeenCalledWith({ stage: 'output', text: 'test' });
    expect(root.querySelector('[role="status"]').textContent).toContain('TEST'); expect(onReview).not.toHaveBeenCalled();
});
