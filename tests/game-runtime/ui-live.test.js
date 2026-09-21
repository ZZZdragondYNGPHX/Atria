/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

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

    test('Full remains deferred until the takeover/recovery contract is implemented', async () => {
        const session = await activateGamePackageUi({
            charId: 'hero',
            manifest: {
                ui: {
                    mode: 'full',
                    entry: 'ui/game.html',
                    surface: 'app.root',
                },
            },
        }, null, { document });

        expect(session).toMatchObject({
            mode: 'full',
            status: 'deferred',
        });
    });
});
