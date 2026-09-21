import { describe, expect, jest, test } from '@jest/globals';

import { createImmersiveProviderRegistry } from '../../public/scripts/immersive/providers.js';
import {
    activateGameImmersiveProvider,
    loadGameImmersiveDefinition,
} from '../../public/scripts/extensions/game-runtime/ui/immersive.js';
import { createSelectorRuntime } from '../../public/scripts/extensions/game-runtime/ui/selectors.js';

function jsonResponse(body) {
    return {
        ok: true,
        status: 200,
        async json() {
            return structuredClone(body);
        },
    };
}

describe('Game Runtime Immersive bridge', () => {
    test('projects Selector state into the existing Immersive Provider contract', async () => {
        const world = {
            scene: { id: 'inn-night', background: '/inn.webp' },
            player: { hp: 8, name: 'Alice' },
        };
        const selectors = createSelectorRuntime({
            getWorldState: () => world,
            definitions: [
                { id: 'scene.id', select: state => state.scene.id },
                { id: 'scene.background', select: state => state.scene.background },
                { id: 'player.hp', select: state => state.player.hp },
                { id: 'player.name', select: state => state.player.name },
            ],
        });

        const fetchImpl = jest.fn(async url => {
            expect(url).toBe('/api/card-app/hero/ui/immersive.json');
            return jsonResponse({
                priority: 120,
                identity: {
                    speaker: { selector: 'player.name' },
                },
                scene: {
                    id: { selector: 'scene.id' },
                    background: { selector: 'scene.background' },
                },
                visual: {
                    accent: '#b78b61',
                },
                hud: {
                    primary: [{
                        id: 'hp',
                        label: 'HP',
                        selector: 'player.hp',
                    }],
                },
                actions: [{
                    id: 'rest',
                    label: 'Rest',
                    command: 'rest',
                    args: { amount: 1 },
                }],
            });
        });

        const definition = await loadGameImmersiveDefinition({
            charId: 'hero',
            manifest: {
                ui: {
                    immersive: 'ui/immersive.json',
                },
            },
        }, { fetchImpl });

        const snapshots = [];
        const registry = createImmersiveProviderRegistry({
            onChange: snapshot => snapshots.push(snapshot),
        });
        const dispatch = jest.fn(async () => ({ status: 'committed' }));
        const bridge = await activateGameImmersiveProvider({
            definition,
            selectors,
            actions: { dispatch },
            packageId: 'demo.game',
            immersiveApi: {
                registerProvider: provider => registry.register(provider),
            },
        });

        expect(bridge).toMatchObject({
            status: 'active',
            id: 'game-runtime:demo.game',
        });

        const snapshot = registry.getSnapshot();
        expect(snapshot.identity).toEqual({ speaker: 'Alice' });
        expect(snapshot.scene).toEqual({
            id: 'inn-night',
            background: '/inn.webp',
        });
        expect(snapshot.visual).toEqual({ accent: '#b78b61' });
        expect(snapshot.hud.summary.primary).toEqual([
            expect.objectContaining({
                id: 'hp',
                label: 'HP',
                value: '8',
                providerId: 'game-runtime:demo.game',
            }),
        ]);
        expect(snapshot.actions).toEqual([
            expect.objectContaining({
                id: 'rest',
                label: 'Rest',
                providerId: 'game-runtime:demo.game',
            }),
        ]);

        expect(await registry.invokeAction('rest')).toBe(true);
        expect(dispatch).toHaveBeenCalledWith('rest', { amount: 1 });

        bridge.dispose();
        expect(registry.getSnapshot().providers).toEqual([]);
        expect(snapshots.length).toBeGreaterThan(1);
    });

    test('selector changes refresh the provider without granting World ownership', async () => {
        let world = { hp: 10 };
        const selectors = createSelectorRuntime({
            getWorldState: () => world,
            definitions: [{
                id: 'player.hp',
                select: state => state.hp,
            }],
        });
        const registry = createImmersiveProviderRegistry();

        const bridge = await activateGameImmersiveProvider({
            definition: {
                priority: 100,
                identity: null,
                scene: null,
                visual: null,
                hud: {
                    primary: [{
                        id: 'hp',
                        label: 'HP',
                        source: {
                            kind: 'selector',
                            selector: 'player.hp',
                        },
                    }],
                    secondary: [],
                    ambient: [],
                    transient: [],
                    details: [],
                },
                actions: [],
                selectorsUsed: ['player.hp'],
            },
            selectors,
            actions: {
                dispatch: jest.fn(),
            },
            packageId: 'demo',
            immersiveApi: {
                registerProvider: provider => registry.register(provider),
            },
        });

        expect(registry.getSnapshot().hud.summary.primary[0].value).toBe('10');

        world = { hp: 4 };
        selectors.refresh();
        await new Promise(resolve => queueMicrotask(resolve));

        expect(registry.getSnapshot().hud.summary.primary[0].value).toBe('4');

        bridge.dispose();
    });

    test('unknown Selector references fail before provider activation', async () => {
        const selectors = createSelectorRuntime({
            getWorldState: () => ({}),
            definitions: [],
        });
        const registerProvider = jest.fn();

        await expect(activateGameImmersiveProvider({
            definition: {
                priority: 100,
                identity: [['speaker', {
                    kind: 'selector',
                    selector: 'missing.name',
                }]],
                scene: null,
                visual: null,
                hud: null,
                actions: [],
                selectorsUsed: ['missing.name'],
            },
            selectors,
            actions: { dispatch: jest.fn() },
            packageId: 'demo',
            immersiveApi: { registerProvider },
        })).rejects.toThrow(/unknown selector/);

        expect(registerProvider).not.toHaveBeenCalled();
    });

    test('malformed presentation resources fail closed', async () => {
        const fetchImpl = jest.fn(async () => jsonResponse({
            hud: {
                primary: [{
                    id: 'hp',
                    label: 'HP',
                    selector: 'player.hp',
                    value: 10,
                }],
            },
        }));

        await expect(loadGameImmersiveDefinition({
            charId: 'hero',
            manifest: {
                ui: {
                    immersive: 'ui/immersive.json',
                },
            },
        }, { fetchImpl })).rejects.toThrow(/exactly one of selector or value/);
    });

    test('missing Immersive API does not disable Game UI', async () => {
        const bridge = await activateGameImmersiveProvider({
            definition: {
                priority: 100,
                identity: null,
                scene: null,
                visual: null,
                hud: null,
                actions: [],
                selectorsUsed: [],
            },
            selectors: createSelectorRuntime({
                getWorldState: () => ({}),
                definitions: [],
            }),
            actions: { dispatch: jest.fn() },
            packageId: 'demo',
            immersiveApi: null,
        });

        expect(bridge.status).toBe('unavailable');
    });
});
