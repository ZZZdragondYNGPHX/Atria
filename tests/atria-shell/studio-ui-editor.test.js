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
        expect(onStage).not.toHaveBeenCalled();
    });
});
