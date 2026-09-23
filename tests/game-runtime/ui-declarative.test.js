/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
    bindDeclarativeGameUi,
    loadGameSelectorDefinitions,
} from '../../public/scripts/extensions/game-runtime/ui/declarative.js';
import { createSelectorRuntime } from '../../public/scripts/extensions/game-runtime/ui/selectors.js';

function selectorPackage(path = 'ui/selectors.json') {
    return {
        sessionId: 'session_ui',
        runtime: {
            experience: {
                mode: 'component',
                componentModelVersion: 1,
                component: 'ui/main.json',
                selectors: path,
                surface: 'app.root',
            },
        },
    };
}

describe('A4 declarative Experience UI bindings', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    test('loads safe Formula selectors from the exact Session-bound resource', async () => {
        const fetchImpl = jest.fn(async (url, init) => {
            expect(url).toBe('/api/native/session/runtime/resource');
            expect(init.method).toBe('POST');
            expect(JSON.parse(init.body)).toEqual({
                sessionId: 'session_ui',
                path: 'ui/selectors.json',
            });
            return {
                ok: true,
                status: 200,
                async json() {
                    return [
                        { id: 'player.hp', formula: 'world.player.hp' },
                        { id: 'player.ratio', formula: 'world.player.hp / world.player.maxHp' },
                    ];
                },
            };
        });

        const definitions = await loadGameSelectorDefinitions(selectorPackage(), { fetchImpl });
        expect(definitions.map(item => item.id)).toEqual(['player.hp', 'player.ratio']);
        expect(definitions[0].select({ player: { hp: 7 } })).toBe(7);
        expect(definitions[1].select({ player: { hp: 5, maxHp: 10 } })).toBe(0.5);
    });

    test('binds selector text/value/hidden state and updates after selector refresh', () => {
        let world = {
            player: { hp: 10, name: 'Hero', hidden: false },
        };
        const selectors = createSelectorRuntime({
            getWorldState: () => world,
            definitions: [
                { id: 'player.hp', select: state => state.player.hp },
                { id: 'player.name', select: state => state.player.name },
                { id: 'player.hidden', select: state => state.player.hidden },
            ],
        });

        const root = document.createElement('section');
        root.innerHTML = `
            <span id="hp" data-atria-bind-text="player.hp"></span>
            <input id="name" data-atria-bind-value="player.name">
            <div id="panel" data-atria-bind-hidden="player.hidden"></div>
        `;
        document.body.appendChild(root);

        const dispose = bindDeclarativeGameUi(root, {
            selectors,
            actions: {
                dispatch: jest.fn(),
                simulate: jest.fn(),
            },
        });

        expect(root.querySelector('#hp').textContent).toBe('10');
        expect(root.querySelector('#name').value).toBe('Hero');
        expect(root.querySelector('#panel').hidden).toBe(false);

        world = {
            player: { hp: 4, name: 'Wounded Hero', hidden: true },
        };
        expect(selectors.refresh()).toEqual(['player.hp', 'player.name', 'player.hidden']);

        expect(root.querySelector('#hp').textContent).toBe('4');
        expect(root.querySelector('#name').value).toBe('Wounded Hero');
        expect(root.querySelector('#panel').hidden).toBe(true);

        dispose();
    });

    test('binds structured visibility without overwriting other hidden reasons', () => {
        let world = { ready: false };
        const selectors = createSelectorRuntime({
            getWorldState: () => world,
            definitions: [{ id: 'player.ready', select: state => state.ready }],
        });
        const root = document.createElement('section');
        root.innerHTML = '<div id="panel" data-atria-visible-selector="player.ready" data-atria-visible-when="truthy"></div>';
        const panel = root.querySelector('#panel');
        panel.dataset.atriaHiddenResponsive = 'true';

        const dispose = bindDeclarativeGameUi(root, {
            selectors,
            actions: { dispatch: jest.fn(), simulate: jest.fn() },
        });
        expect(panel.hidden).toBe(true);

        world = { ready: true };
        selectors.refresh();
        expect(panel.hidden).toBe(true);

        panel.dataset.atriaHiddenResponsive = 'false';
        selectors.refresh();
        // No selector transition occurred on this refresh, so explicitly
        // trigger the visibility reason by toggling through a false state.
        world = { ready: false };
        selectors.refresh();
        world = { ready: true };
        selectors.refresh();
        expect(panel.hidden).toBe(false);
        dispose();
    });

    test('dispatches typed command actions with static JSON arguments', async () => {
        const dispatch = jest.fn(async () => ({ status: 'committed' }));
        const root = document.createElement('section');
        root.innerHTML = `
            <button
                id="heal"
                data-atria-command="heal"
                data-atria-command-args='{"amount":5}'
            >Heal</button>
        `;

        const dispose = bindDeclarativeGameUi(root, {
            selectors: createSelectorRuntime({
                getWorldState: () => ({}),
                definitions: [],
            }),
            actions: {
                dispatch,
                simulate: jest.fn(),
            },
        });

        root.querySelector('#heal').click();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(dispatch).toHaveBeenCalledWith('heal', { amount: 5 });
        expect(root.querySelector('#heal').dataset.atriaCommandState).toBe('success');
        expect(root.querySelector('#heal').disabled).toBe(false);

        dispose();
    });

    test('supports explicit simulation actions without committing', async () => {
        const simulate = jest.fn(async () => ({ status: 'simulated' }));
        const root = document.createElement('section');
        root.innerHTML = `
            <button
                id="preview"
                data-atria-command="damage"
                data-atria-command-mode="simulate"
                data-atria-command-args='{"amount":3}'
            >Preview</button>
        `;

        bindDeclarativeGameUi(root, {
            selectors: createSelectorRuntime({
                getWorldState: () => ({}),
                definitions: [],
            }),
            actions: {
                dispatch: jest.fn(),
                simulate,
            },
        });

        root.querySelector('#preview').click();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(simulate).toHaveBeenCalledWith('damage', { amount: 3 });
        expect(root.querySelector('#preview').dataset.atriaCommandState).toBe('success');
    });

    test('invalid selector ids and unsafe argument shapes fail closed during binding', () => {
        const selectors = createSelectorRuntime({
            getWorldState: () => ({}),
            definitions: [],
        });

        const badSelector = document.createElement('div');
        badSelector.innerHTML = '<span data-atria-bind-text="#world.hp"></span>';
        expect(() => bindDeclarativeGameUi(badSelector, {
            selectors,
            actions: { dispatch: jest.fn(), simulate: jest.fn() },
        })).toThrow(/valid selector id/);

        const badArgs = document.createElement('div');
        badArgs.innerHTML = `
            <button
                data-atria-command="heal"
                data-atria-command-args='{"constructor":{"polluted":true}}'
            ></button>
        `;
        expect(() => bindDeclarativeGameUi(badArgs, {
            selectors,
            actions: { dispatch: jest.fn(), simulate: jest.fn() },
        })).toThrow(/blocked key/);
    });

    test('malformed selector resources fail before Experience activation', async () => {
        const fetchImpl = jest.fn(async () => ({
            ok: true,
            status: 200,
            async json() {
                return [
                    { id: 'hp', formula: 'world.hp', extra: true },
                ];
            },
        }));

        await expect(loadGameSelectorDefinitions(selectorPackage(), { fetchImpl }))
            .rejects.toThrow(/unknown field/);
    });
});
