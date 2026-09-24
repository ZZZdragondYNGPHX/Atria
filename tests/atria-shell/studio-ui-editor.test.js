/** @jest-environment jsdom */

import { describe, expect, jest, test } from '@jest/globals';

import { mountStructuredUiEditor } from '../../public/scripts/native/studio-ui-editor.js';

function model() {
    return {
        id: 'root',
        type: 'container',
        props: { className: 'hud' },
        children: [
            {
                id: 'label',
                type: 'text',
                props: { text: 'HP' },
                bindings: { text: 'player.hp' },
            },
        ],
    };
}

describe('A7 Structured UI editor', () => {
    test('unapplied properties survive tab changes and cannot stage the old model', async () => {
        const root = document.createElement('div'); const onStage = jest.fn();
        mountStructuredUiEditor({ document, root, initialModel: model(), mode: 'component', onStage });
        const click = label => [...root.querySelectorAll('button')].find(item => item.textContent === label).click();
        const input = root.querySelector('[aria-label="Component text"]'); input.value = 'Local draft'; input.dispatchEvent(new Event('input'));
        click('Stage UI Change'); expect(onStage).not.toHaveBeenCalled();
        click('Structure'); click('Design');
        expect(root.querySelector('[aria-label="Component text"]').value).toBe('Local draft');
        click('Apply Properties'); click('Stage UI Change');
        expect(onStage.mock.calls[0][0].props.text).toBe('Local draft');
    });
    test('removing a component also releases its unapplied property draft', () => {
        const root = document.createElement('div'); const onStage = jest.fn();
        const controller = mountStructuredUiEditor({ document, root, initialModel: model(), mode: 'component', onStage });
        controller.select('label');
        const input = root.querySelector('[aria-label="Component text"]'); input.value = 'Draft'; input.dispatchEvent(new Event('input'));
        [...root.querySelectorAll('button')].find(item => item.textContent === 'Structure').click();
        root.querySelector('[aria-label="Remove label"]').click();
        [...root.querySelectorAll('button')].find(item => item.textContent === 'Stage UI Change').click();
        expect(onStage.mock.calls[0][0].children).toEqual([]);
    });
    test('exposes Design / Structure / Bindings / Source over the shared A4 Component Model', () => {
        const root = document.createElement('div');
        const onStage = jest.fn();
        const controller = mountStructuredUiEditor({
            document,
            root,
            initialModel: model(),
            mode: 'component',
            onStage,
            idFactory: () => '00000000-0000-4000-8000-000000000001',
        });

        const tabs = [...root.querySelectorAll('.atria-studio-editor-tabs button')];
        expect(tabs.map(node => node.textContent)).toEqual(['Design', 'Structure', 'Bindings', 'Source']);
        expect(root.querySelector('[data-atria-studio-canvas="true"] [data-atria-component-id="label"]'))
            .not.toBeNull();

        tabs.find(node => node.textContent === 'Bindings').click();
        const bindings = root.querySelector('[aria-label="Component bindings JSON"]');
        bindings.value = JSON.stringify({
            bindings: { text: 'player.max_hp' },
            actions: {},
            visibility: { selector: 'player.ready', when: 'truthy' },
            responsive: { devices: ['desktop'] },
        });
        [...root.querySelectorAll('button')].find(node => node.textContent === 'Apply Bindings').click();

        tabs.find(node => node.textContent === 'Source').click();
        const source = root.querySelector('[aria-label="Structured UI source JSON"]');
        const parsed = JSON.parse(source.value);
        expect(parsed.bindings.text).toBe('player.max_hp');
        expect(parsed.visibility).toEqual({ selector: 'player.ready', when: 'truthy' });
        expect(parsed.responsive).toEqual({ devices: ['desktop'] });

        [...root.querySelectorAll('button')].find(node => node.textContent === 'Stage UI Change').click();
        expect(onStage).toHaveBeenCalledTimes(1);
        expect(onStage.mock.calls[0][0]).toEqual(parsed);
        controller.dispose();
    });

    test('Source only accepts Atria Structured UI that the shared compiler can round-trip', () => {
        const root = document.createElement('div');
        const onStage = jest.fn();
        mountStructuredUiEditor({
            document,
            root,
            initialModel: model(),
            mode: 'component',
            onStage,
        });

        [...root.querySelectorAll('.atria-studio-editor-tabs button')]
            .find(node => node.textContent === 'Source').click();
        const source = root.querySelector('[aria-label="Structured UI source JSON"]');
        source.value = JSON.stringify({
            id: 'root',
            type: 'container',
            executable: 'unsafe.js',
        });
        [...root.querySelectorAll('button')].find(node => node.textContent === 'Apply Source').click();

        expect(root.textContent).toContain('unknown field');
        expect(root.querySelector('[aria-label="Structured UI source JSON"]').value).toBe(source.value);
        expect([...root.querySelectorAll('button')].find(node => node.textContent === 'Stage UI Change').disabled).toBe(true);
        expect(onStage).not.toHaveBeenCalled();
    });
});
