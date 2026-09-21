/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { createImmersiveProviderRegistry } from '../../public/scripts/immersive/providers.js';
import { activateGamePackageUi } from '../../public/scripts/extensions/game-runtime/ui/live.js';

describe('Live Game Package UI activation', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="left-nav-panel"></div>
            <div id="right-nav-panel"></div>
            <main id="sheld">
                <div id="sheldheader"></div>
                <div id="chat"></div>
                <div id="form_sheld"><div id="send_form"></div></div>
            </main>
        `;
    });

    test('mounts a static Component into the declared stable surface and disposes cleanly', async () => {
        const fetchImpl = jest.fn(async () => ({
            ok: true,
            status: 200,
            async text() {
                return '<div id="runtime-hud">Ready</div>';
            },
        }));
        const worldSession = {
            getState: () => ({ hp: 10 }),
            dispatchCommandInternal: jest.fn(),
            simulateCommandInternal: jest.fn(),
        };

        const session = await activateGamePackageUi({
            charId: 'hero',
            manifest: {
                ui: {
                    mode: 'component',
                    entry: 'ui/hud.html',
                    surface: 'chat.header',
                },
            },
        }, worldSession, {
            document,
            fetchImpl,
        });

        expect(session).toMatchObject({
            mode: 'component',
            status: 'active',
            mountId: 'package.component',
        });
        expect(document.querySelector(
            '[data-atria-game-host-surface="chat.header"] #runtime-hud',
        )?.textContent).toBe('Ready');

        await session.dispose();
        expect(document.querySelectorAll('[data-atria-game-host-surface]')).toHaveLength(0);
        expect(document.getElementById('chat')).not.toBeNull();
        expect(document.getElementById('send_form')).not.toBeNull();
    });


    test('declared selectors and command actions update live Component DOM through World state', async () => {
        let world = { hp: 10 };
        const fetchImpl = jest.fn(async (url) => {
            if (url.endsWith('/ui/selectors.json')) {
                return {
                    ok: true,
                    status: 200,
                    async json() {
                        return [
                            { id: 'player.hp', formula: 'world.hp' },
                        ];
                    },
                };
            }
            if (url.endsWith('/ui/hud.html')) {
                return {
                    ok: true,
                    status: 200,
                    async text() {
                        return `
                            <div>
                                <span id="hp" data-atria-bind-text="player.hp"></span>
                                <button
                                    id="damage"
                                    data-atria-command="damage"
                                    data-atria-command-args='{"amount":3}'
                                >Damage</button>
                            </div>
                        `;
                    },
                };
            }
            throw new Error('unexpected URL ' + url);
        });
        const worldSession = {
            getState: () => ({ ...world }),
            async dispatchCommandInternal(commandId, args) {
                expect(commandId).toBe('damage');
                expect(args).toEqual({ amount: 3 });
                world = { hp: world.hp - args.amount };
                return {
                    status: 'committed',
                    afterState: { ...world },
                };
            },
            simulateCommandInternal: jest.fn(),
        };

        const session = await activateGamePackageUi({
            charId: 'hero',
            manifest: {
                ui: {
                    mode: 'component',
                    entry: 'ui/hud.html',
                    surface: 'chat.header',
                    selectors: 'ui/selectors.json',
                },
            },
        }, worldSession, {
            document,
            fetchImpl,
        });

        const hp = document.querySelector('#hp');
        const damage = document.querySelector('#damage');
        expect(hp.textContent).toBe('10');

        damage.click();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(world).toEqual({ hp: 7 });
        expect(hp.textContent).toBe('7');
        expect(damage.dataset.atriaCommandState).toBe('success');

        await session.dispose();
    });

    test('registers and disposes an Immersive provider from declared Selector presentation', async () => {
        let world = {
            hp: 10,
            scene: 'inn',
        };
        const fetchImpl = jest.fn(async (url) => {
            if (url.endsWith('/ui/selectors.json')) {
                return {
                    ok: true,
                    status: 200,
                    async json() {
                        return [
                            { id: 'player.hp', formula: 'world.hp' },
                            { id: 'scene.id', formula: 'world.scene' },
                        ];
                    },
                };
            }
            if (url.endsWith('/ui/immersive.json')) {
                return {
                    ok: true,
                    status: 200,
                    async json() {
                        return {
                            scene: {
                                id: { selector: 'scene.id' },
                            },
                            hud: {
                                primary: [{
                                    id: 'hp',
                                    label: 'HP',
                                    selector: 'player.hp',
                                }],
                            },
                        };
                    },
                };
            }
            if (url.endsWith('/ui/hud.html')) {
                return {
                    ok: true,
                    status: 200,
                    async text() {
                        return '<div>HUD</div>';
                    },
                };
            }
            throw new Error('unexpected URL ' + url);
        });
        const registry = createImmersiveProviderRegistry();
        const worldSession = {
            getState: () => ({ ...world }),
            async dispatchCommandInternal() {
                world = { hp: 5, scene: 'road' };
                return { status: 'committed', afterState: { ...world } };
            },
            simulateCommandInternal: jest.fn(),
        };

        const session = await activateGamePackageUi({
            charId: 'hero',
            manifest: {
                id: 'demo.game',
                ui: {
                    mode: 'component',
                    entry: 'ui/hud.html',
                    surface: 'chat.header',
                    selectors: 'ui/selectors.json',
                    immersive: 'ui/immersive.json',
                },
            },
        }, worldSession, {
            document,
            fetchImpl,
            immersiveApi: {
                registerProvider: provider => registry.register(provider),
            },
        });

        expect(session.immersiveStatus).toBe('active');
        expect(registry.getSnapshot().providers).toEqual([
            { id: 'game-runtime:demo.game', priority: 100 },
        ]);
        expect(registry.getSnapshot().scene).toEqual({ id: 'inn' });
        expect(registry.getSnapshot().hud.summary.primary[0].value).toBe('10');

        world = { hp: 6, scene: 'road' };
        session.refresh();
        await new Promise(resolve => queueMicrotask(resolve));

        expect(registry.getSnapshot().scene).toEqual({ id: 'road' });
        expect(registry.getSnapshot().hud.summary.primary[0].value).toBe('6');

        await session.dispose();

        expect(registry.getSnapshot().providers).toEqual([]);
    });

    test('Hybrid recomposes the original native conversation and composer, then restores them', async () => {
        const chat = document.getElementById('chat');
        const sendForm = document.getElementById('send_form');
        const formSheld = document.getElementById('form_sheld');
        const fetchImpl = jest.fn(async () => ({
            ok: true,
            status: 200,
            async text() {
                return `
                    <section id="hybrid-shell">
                        <div id="conversation-slot" data-atria-native-component="conversation"></div>
                        <aside>Game HUD</aside>
                        <div id="composer-slot" data-atria-native-component="composer"></div>
                    </section>
                `;
            },
        }));

        const session = await activateGamePackageUi({
            charId: 'hero',
            manifest: {
                ui: {
                    mode: 'hybrid',
                    entry: 'ui/game.html',
                    surface: 'app.root',
                },
            },
        }, {
            getState: () => ({}),
            dispatchCommandInternal: jest.fn(),
            simulateCommandInternal: jest.fn(),
        }, {
            document,
            fetchImpl,
        });

        expect(session).toMatchObject({
            mode: 'hybrid',
            status: 'active',
            mountId: 'package.hybrid',
        });
        expect(document.getElementById('chat')).toBe(chat);
        expect(document.getElementById('send_form')).toBe(sendForm);
        expect(chat.parentElement.id).toBe('conversation-slot');
        expect(sendForm.parentElement.id).toBe('composer-slot');

        await session.dispose();

        expect(chat.parentElement.id).toBe('sheld');
        expect(sendForm.parentElement).toBe(formSheld);
        expect(document.querySelector('#hybrid-shell')).toBeNull();
        expect(document.querySelectorAll('[data-atria-game-host-surface]')).toHaveLength(0);
    });

    test('Full takes over the main experience while host recovery remains outside package control', async () => {
        const chat = document.getElementById('chat');
        const sendForm = document.getElementById('send_form');
        const sheld = document.getElementById('sheld');
        const formSheld = document.getElementById('form_sheld');
        const exitGameUi = jest.fn();
        const stopGeneration = jest.fn();
        const disablePackage = jest.fn();
        const openDiagnostics = jest.fn();
        const fetchImpl = jest.fn(async () => ({
            ok: true,
            status: 200,
            async text() {
                return `
                    <section id="full-shell">
                        <h1>Game</h1>
                        <div id="full-conversation" data-atria-native-component="conversation"></div>
                        <div id="full-composer" data-atria-native-component="composer"></div>
                    </section>
                `;
            },
        }));

        const session = await activateGamePackageUi({
            charId: 'hero',
            manifest: {
                ui: {
                    mode: 'full',
                    entry: 'ui/game.html',
                    surface: 'app.root',
                },
            },
        }, {
            getState: () => ({}),
            dispatchCommandInternal: jest.fn(),
            simulateCommandInternal: jest.fn(),
        }, {
            document,
            fetchImpl,
            hostActions: {
                exitGameUi,
                stopGeneration,
                disablePackage,
                openDiagnostics,
            },
        });

        expect(session).toMatchObject({
            mode: 'full',
            status: 'active',
            mountId: 'package.full',
            recoveryActive: true,
        });
        expect(document.body.dataset.atriaGameFullActive).toBe('true');
        expect(sheld.style.display).toBe('none');
        expect(document.getElementById('chat')).toBe(chat);
        expect(document.getElementById('send_form')).toBe(sendForm);
        expect(chat.parentElement.id).toBe('full-conversation');
        expect(sendForm.parentElement.id).toBe('full-composer');

        const recovery = document.getElementById('atria-game-full-recovery');
        expect(document.getElementById('atria-game-full-root').contains(recovery)).toBe(false);
        recovery.querySelector('[data-atria-game-recovery-action="stop"]').click();
        recovery.querySelector('[data-atria-game-recovery-action="diagnostics"]').click();
        expect(stopGeneration).toHaveBeenCalledTimes(1);
        expect(openDiagnostics).toHaveBeenCalledTimes(1);

        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
        }));
        expect(exitGameUi).toHaveBeenCalledTimes(1);

        await session.dispose();

        expect(document.body.dataset.atriaGameFullActive).toBeUndefined();
        expect(sheld.style.display).toBe('');
        expect(chat.parentElement).toBe(sheld);
        expect(sendForm.parentElement).toBe(formSheld);
        expect(document.getElementById('atria-game-full-root')).toBeNull();
        expect(document.getElementById('atria-game-full-recovery')).toBeNull();
    });

    test('broken Full package restores host without ever completing takeover', async () => {
        const sheld = document.getElementById('sheld');
        const fetchImpl = jest.fn(async () => ({
            ok: true,
            status: 200,
            async text() {
                return `
                    <section>
                        <div data-atria-native-component="unknown-native-component"></div>
                    </section>
                `;
            },
        }));

        await expect(activateGamePackageUi({
            charId: 'hero',
            manifest: {
                ui: {
                    mode: 'full',
                    entry: 'ui/game.html',
                    surface: 'app.root',
                },
            },
        }, {
            getState: () => ({}),
            dispatchCommandInternal: jest.fn(),
            simulateCommandInternal: jest.fn(),
        }, {
            document,
            fetchImpl,
            hostActions: {
                exitGameUi: jest.fn(),
            },
        })).rejects.toThrow(/Unknown native Game UI component/);

        expect(sheld.style.display).toBe('');
        expect(document.body.dataset.atriaGameFullActive).toBeUndefined();
        expect(document.getElementById('atria-game-full-root')).toBeNull();
        expect(document.getElementById('atria-game-full-recovery')).toBeNull();
        expect(document.getElementById('chat').parentElement).toBe(sheld);
    });
});
