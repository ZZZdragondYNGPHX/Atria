/** @jest-environment jsdom */
import { describe, expect, jest, test } from '@jest/globals';
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
