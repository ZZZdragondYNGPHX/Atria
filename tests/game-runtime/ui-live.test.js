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

    test('Hybrid and Full remain deferred instead of using the old broad CardApp runtime', async () => {
        for (const mode of ['hybrid', 'full']) {
            const session = await activateGamePackageUi({
                charId: 'hero',
                manifest: {
                    ui: {
                        mode,
                        entry: 'ui/game.html',
                        surface: 'app.root',
                    },
                },
            }, null, { document });

            expect(session).toMatchObject({
                mode,
                status: 'deferred',
            });
        }
    });
});
