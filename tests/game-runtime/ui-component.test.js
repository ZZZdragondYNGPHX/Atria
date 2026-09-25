import { describe, expect, test } from '@jest/globals';

import { createGameLogicRuntime } from '../../public/scripts/native/experience/logic/runtime.js';
import { createComponentUiRuntime } from '../../public/scripts/native/experience/ui/runtime.js';
import { createSelectorRuntime } from '../../public/scripts/native/experience/ui/selectors.js';
import { createSurfaceHost } from '../../public/scripts/native/experience/ui/surfaces.js';
import { createSessionWorldTestAdapter } from './helpers/session-world-adapter.js';

function makeElement(tagName = 'div') {
    return {
        tagName,
        dataset: {},
        className: '',
        textContent: '',
        parentNode: null,
        children: [],
        appendChild(child) {
            child.parentNode = this;
            this.children.push(child);
        },
        removeChild(child) {
            const index = this.children.indexOf(child);
            if (index >= 0) this.children.splice(index, 1);
            child.parentNode = null;
        },
        remove() {
            this.parentNode?.removeChild(this);
        },
    };
}

function makePersistence() {
    let value = null;
    return {
        async read() {
            return value == null ? null : structuredClone(value);
        },
        async update(updater) {
            value = structuredClone(await updater(value == null ? null : structuredClone(value)));
            return structuredClone(value);
        },
    };
}

describe('R4 Component UI vertical slice', () => {
    test('component reads selectors and mutates world only through typed command actions', async () => {
        const world = createSessionWorldTestAdapter({
            initialState: { hp: 10 },
            schema: {
                type: 'object',
                additionalProperties: false,
                required: ['hp'],
                properties: {
                    hp: { type: 'integer', minimum: 0, maximum: 10 },
                },
            },
            reducers: {
                DamageDealt(state, event) {
                    return { hp: state.hp - event.payload.amount };
                },
            },
            persistence: makePersistence(),
        });
        await world.load();

        const logicWorld = {
            getState: () => world.getState(),
            getJournal: () => world.getJournal(),
            getSnapshot: () => ({
                ...world.getSnapshot(),
                branchId: 'branch_component_test',
                revisionId: 'revision_component_test',
            }),
            commitEvents: (events, options) => world.commitEvents(events, options),
            simulateEvents: (events, options) => world.simulateEvents(events, options),
        };

        const logic = createGameLogicRuntime({
            world: logicWorld,
            commands: [{
                id: 'damage',
                argsSchema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['amount'],
                    properties: {
                        amount: { type: 'integer', minimum: 1, maximum: 10 },
                    },
                },
                execute({ args }) {
                    return [{ type: 'DamageDealt', payload: { amount: args.amount } }];
                },
            }],
        });

        const selectors = createSelectorRuntime({
            getWorldState: () => world.getState(),
            definitions: [{
                id: 'player.hp',
                select: state => state.hp,
            }],
        });

        const root = makeElement('main');
        const surfaceHost = createSurfaceHost({
            resolveSurface: surfaceId => surfaceId === 'app.root' ? root : null,
            createElement: makeElement,
        });

        let actions;
        let cleanupCount = 0;
        const ui = createComponentUiRuntime({
            surfaceHost,
            selectors,
            dispatchCommand: (commandId, args) => logic.dispatch(commandId, args),
            simulateCommand: (commandId, args) => logic.simulate(commandId, args),
        });

        const handle = await ui.mountComponent({
            id: 'health_hud',
            surface: 'app.root',
            mount(ctx) {
                actions = ctx.actions;
                const render = hp => {
                    ctx.container.textContent = 'HP ' + hp;
                };
                render(ctx.selectors.get('player.hp'));
                ctx.selectors.subscribe('player.hp', render);
                return () => {
                    cleanupCount += 1;
                };
            },
        });

        expect(root.children).toHaveLength(1);
        expect(handle.surface).toBe('app.root');
        expect(root.children[0].textContent).toBe('HP 10');

        const simulation = await actions.simulate('damage', { amount: 3 });
        expect(simulation.afterState).toEqual({ hp: 7 });
        expect(world.getState()).toEqual({ hp: 10 });
        expect(root.children[0].textContent).toBe('HP 10');

        await actions.dispatch('damage', { amount: 3 });
        expect(world.getState()).toEqual({ hp: 7 });
        expect(root.children[0].textContent).toBe('HP 7');

        expect(actions.setState).toBeUndefined();
        expect(actions.getAtriaContext).toBeUndefined();

        await handle.unmount();
        expect(root.children).toEqual([]);
        expect(cleanupCount).toBe(1);
    });

    test('mount failure restores the host surface immediately', async () => {
        const root = makeElement('main');
        const ui = createComponentUiRuntime({
            surfaceHost: createSurfaceHost({
                resolveSurface: () => root,
                createElement: makeElement,
            }),
            selectors: createSelectorRuntime({
                getWorldState: () => ({}),
                definitions: [],
            }),
            dispatchCommand: async () => ({}),
            simulateCommand: async () => ({}),
        });

        await expect(ui.mountComponent({
            id: 'broken',
            surface: 'app.root',
            mount() {
                throw new Error('fixture mount failure');
            },
        })).rejects.toThrow(/fixture mount failure/);

        expect(root.children).toEqual([]);
        expect(ui.getMountedComponents()).toEqual([]);
    });
});
