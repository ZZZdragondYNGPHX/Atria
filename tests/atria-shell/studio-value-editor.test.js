/** @jest-environment jsdom */
import { describe, expect, jest, test } from '@jest/globals';
import { knowledgeEditorFieldOptions, validateKnowledgeEditorValue } from '../../public/scripts/native/knowledge-contracts.js';
import { mountStudioValueEditor } from '../../public/scripts/native/studio-value-editor.js';

function setup(value) {
    const root = document.createElement('div'); document.body.replaceChildren(root);
    const onReview = jest.fn();
    mountStudioValueEditor({ document, root, value, label: 'Resource JSON', onReview });
    const button = label => [...root.querySelectorAll('button')].find(item => item.textContent === label);
    return { root, onReview, button };
}
describe('Studio local structured draft', () => {
    test('edits preserve unknown plugin members and never mutate the committed projection', () => {
        const value = { displayName: 'Original', plugin: { custom: true }, nullable: null, items: [1, 2] };
        const { root, onReview, button } = setup(value);
        const input = root.querySelector('[name="displayName"]'); input.value = 'Edited'; input.dispatchEvent(new Event('input'));
        button('Review Changes').click();
        expect(value.displayName).toBe('Original');
        expect(onReview).toHaveBeenCalledWith({ ...value, displayName: 'Edited' });
    });
    test('invalid JSON retains the exact draft and focuses the error without staging', () => {
        const { root, onReview, button } = setup({ value: 1 });
        button('Source').click();
        const source = root.querySelector('textarea'); source.value = '{ invalid'; source.dispatchEvent(new Event('input'));
        button('Review Changes').click();
        expect(source.value).toBe('{ invalid'); expect(onReview).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(root.querySelector('[role="alert"]'));
        button('Fields').click(); expect(root.querySelector('textarea').value).toBe('{ invalid');
    });
    test('an empty numeric field cannot silently stage its old numeric value', () => {
        const { root, onReview, button } = setup({ weight: 1 });
        const input = root.querySelector('input'); input.value = ''; input.dispatchEvent(new Event('input'));
        button('Review Changes').click(); expect(onReview).not.toHaveBeenCalled();
        button('Source').click(); expect(root.querySelector('textarea')).toBeNull();
    });
    test('one review is in flight even when activated twice', async () => {
        const { onReview, button } = setup({ enabled: true });
        let resolve; onReview.mockImplementation(() => new Promise(done => { resolve = done; }));
        button('Review Changes').click(); button('Review Changes').click();
        expect(onReview).toHaveBeenCalledTimes(1);
        resolve(); await Promise.resolve();
        expect(button('Review Changes').disabled).toBe(false);
    });
});


test('Knowledge delivery uses typed options and invalid Source retains field-level feedback before Review', async () => {
    const root = document.createElement('div'); document.body.replaceChildren(root);
    const onReview = jest.fn();
    mountStudioValueEditor({ document, root, label: 'Knowledge JSON', value: { entries: [{ delivery: { position: 'before', target: 'narrator' } }] }, onReview, fieldOptions: knowledgeEditorFieldOptions, validate: validateKnowledgeEditorValue });
    const position = root.querySelector('[name="entries.0.delivery.position"]');
    expect(position.tagName).toBe('SELECT');
    expect([...position.options].map(option => option.value)).toEqual(['before', 'after']);
    position.value = 'after'; position.dispatchEvent(new Event('input'));
    const button = label => [...root.querySelectorAll('button')].find(item => item.textContent === label);
    button('Source').click();
    const source = root.querySelector('textarea');
    source.value = JSON.stringify({ entries: [{ delivery: { position: 'unsupported', target: 'narrator' } }] }); source.dispatchEvent(new Event('input'));
    button('Review Changes').click();
    expect(onReview).not.toHaveBeenCalled();
    expect(root.querySelector('[role="alert"]').textContent).toContain('entries.0.delivery.position');
    button('Fields').click(); button('Review Changes').click();
    const invalid = root.querySelector('[name="entries.0.delivery.position"]');
    expect(document.activeElement).toBe(invalid); expect(invalid.getAttribute('aria-invalid')).toBe('true');
    invalid.value = 'after'; invalid.dispatchEvent(new Event('input')); button('Review Changes').click();
    expect(onReview).toHaveBeenCalledWith({ entries: [{ delivery: { position: 'after', target: 'narrator' } }] });
});


test.each([null, 1, false])('typed fields can repair invalid imported primitive %j', position => {
    const root = document.createElement('div'); document.body.replaceChildren(root); const onReview = jest.fn();
    mountStudioValueEditor({ document, root, label: 'Knowledge JSON', value: { entries: [{ delivery: { position } }] }, onReview, fieldOptions: knowledgeEditorFieldOptions, validate: validateKnowledgeEditorValue });
    const input = root.querySelector('select'); input.value = 'after'; input.dispatchEvent(new Event('input'));
    [...root.querySelectorAll('button')].find(button => button.textContent === 'Review Changes').click();
    expect(onReview).toHaveBeenCalledWith({ entries: [{ delivery: { position: 'after' } }] });
});
