/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { activateNativeExperienceRuntime } from '../../public/scripts/extensions/game-runtime/ui/live.js';
import { mountNativePlayHost } from '../../public/scripts/atria-shell/native-play-host.js';

function state(mode, options = {}) {
    return {
        sessionId: options.sessionId || 'session_experience',
        descriptor: {
            packageId: 'package_0123456789abcdef0123456789abcdef',
            packageVersionId: 'packageVersion_0123456789abcdef0123456789abcdef',
            entryPointId: 'entryPoint_0123456789abcdef0123456789abcdef',
            experience: mode === 'text'
                ? { mode: 'text' }
                : { mode, componentModelVersion: 1 },
        },
        runtime: {
            experience: mode === 'text'
                ? { mode: 'text' }
                : {
                    mode,
                    componentModelVersion: 1,
                    component: options.component || 'ui/main.json',
                    ...(options.selectors ? { selectors: options.selectors } : {}),
                    surface: options.surface || 'app.root',
                },
        },
    };
}

function resourceFetch(resources) {
    return jest.fn(async (url, init) => {
        expect(url).toBe('/api/native/session/runtime/resource');
        expect(init.method).toBe('POST');
        const { path } = JSON.parse(init.body);
        if (!(path in resources)) throw new Error('unexpected resource ' + path);
        return {
            ok: true,
            status: 200,
            async json() {
                return structuredClone(resources[path]);
            },
        };
    });
}

function worldSession(initial = {}) {
    let world = structuredClone(initial);
    return {
        getState: () => structuredClone(world),
        async dispatchCommandInternal(commandId, args) {
            if (commandId === 'damage') {
                world = { ...world, hp: Number(world.hp || 0) - Number(args.amount || 0) };
            }
            return { status: 'committed', afterState: structuredClone(world) };
        },
        simulateCommandInternal: jest.fn(async () => ({ status: 'simulated' })),
    };
}

function shellFixture() {
    const stage = document.getElementById('atria-stage');
    const recovery = document.getElementById('atria-test-recovery');
    const playHost = mountNativePlayHost({ document, stage });
    const shell = {
        slots: {
            stage,
            recovery,
            dock: document.getElementById('atria-test-dock'),
            transient: document.getElementById('atria-test-transient'),
        },
    };
    return {
        stage,
        recovery,
        playHost,
        shellFoundation: {
            getShell: () => shell,
            getPlayHost: () => playHost,
        },
    };
}

describe('A4 Native Experience Runtime activation', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="left-nav-panel"></div>
            <div id="right-nav-panel"></div>
            <main id="sheld">
                <div id="sheldheader"></div>
                <div id="chat"></div>
                <div id="form_sheld"><div id="send_form"><textarea id="send_textarea"></textarea></div></div>
            </main>
            <section id="atria-stage"></section>
            <aside id="atria-test-dock"></aside>
            <div id="atria-test-transient"></div>
            <div id="atria-test-recovery"></div>
        `;
    });

    test('Text participates in the shared dispatcher without replacing the A3 host ABI', async () => {
        const chat = document.getElementById('chat');
        const composer = document.getElementById('send_form');

        const session = await activateNativeExperienceRuntime(
            state('text'),
            worldSession(),
            { document, fetchImpl: jest.fn() },
        );

        expect(session).toMatchObject({
            mode: 'text',
            status: 'active',
            mountId: null,
            recoveryActive: false,
        });
        expect(document.getElementById('chat')).toBe(chat);
        expect(document.getElementById('send_form')).toBe(composer);
        expect(document.querySelectorAll('[data-atria-game-host-surface]')).toHaveLength(0);
        await session.dispose();
    });

    test('Component mounts structured UI into a semantic host surface and updates via Native World actions', async () => {
        const world = worldSession({ hp: 10 });
        const fetchImpl = resourceFetch({
            'ui/selectors.json': [
                { id: 'player.hp', formula: 'world.hp' },
            ],
            'ui/hud.json': {
                id: 'hud',
                type: 'container',
                children: [
                    {
                        id: 'hp',
                        type: 'text',
                        bindings: { text: 'player.hp' },
                    },
                    {
                        id: 'damage',
                        type: 'button',
                        props: { text: 'Damage' },
                        actions: {
                            click: {
                                commandId: 'damage',
                                args: { amount: 3 },
                            },
                        },
                    },
                ],
            },
        });

        const session = await activateNativeExperienceRuntime(
            state('component', {
                component: 'ui/hud.json',
                selectors: 'ui/selectors.json',
                surface: 'chat.header',
            }),
            world,
            { document, fetchImpl },
        );

        expect(session.mode).toBe('component');
        expect(session.mountId).toBe('experience.component');
        const hp = document.querySelector('[data-atria-component-id="hp"]');
        const damage = document.querySelector('[data-atria-component-id="damage"]');
        expect(hp.textContent).toBe('10');

        damage.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(hp.textContent).toBe('7');
        expect(damage.dataset.atriaCommandState).toBe('success');

        expect(document.querySelector(
            '[data-atria-game-host-surface="chat.header"] [data-atria-component-id="hud"]',
        )).not.toBeNull();

        await session.dispose();
        expect(document.querySelectorAll('[data-atria-game-host-surface]')).toHaveLength(0);
    });

    test('Hybrid owns Stage composition while reusing the exact Native Conversation and Composer slots', async () => {
        const { playHost, shellFoundation } = shellFixture();
        const chat = playHost.native.chat;
        const composer = playHost.native.sendForm;
        const textarea = playHost.native.sendTextarea;

        const session = await activateNativeExperienceRuntime(
            state('hybrid'),
            worldSession(),
            {
                document,
                shell: shellFoundation,
                fetchImpl: resourceFetch({
                    'ui/main.json': {
                        id: 'hybrid-root',
                        type: 'container',
                        children: [
                            {
                                id: 'conversation-slot',
                                type: 'native-slot',
                                props: { component: 'conversation' },
                            },
                            {
                                id: 'composer-slot',
                                type: 'native-slot',
                                props: { component: 'composer' },
                            },
                        ],
                    },
                }),
            },
        );

        expect(playHost.getStageOwner()).toBe('game-runtime:hybrid');
        expect(playHost.root.style.display).toBe('none');
        expect(chat.parentElement.dataset.atriaComponentId).toBe('conversation-slot');
        expect(composer.parentElement.dataset.atriaComponentId).toBe('composer-slot');
        expect(document.getElementById('chat')).toBe(chat);
        expect(document.getElementById('send_form')).toBe(composer);
        expect(document.getElementById('send_textarea')).toBe(textarea);
        expect(document.querySelectorAll('#chat')).toHaveLength(1);
        expect(document.querySelectorAll('#send_form')).toHaveLength(1);
        expect(playHost.assertIntegrity()).toBe(true);

        await session.dispose();

        expect(playHost.getStageOwner()).toBeNull();
        expect(playHost.root.style.display).toBe('');
        expect(chat.parentElement).toBe(playHost.native.sheld);
        expect(composer.parentElement).toBe(playHost.native.formSheld);
        expect(playHost.assertIntegrity()).toBe(true);
        playHost.unmount();
    });

    test('Full owns the visual Stage while Native recovery remains outside package control', async () => {
        const { stage, recovery, playHost, shellFoundation } = shellFixture();
        const exitExperience = jest.fn();
        const stopGeneration = jest.fn();
        const save = jest.fn();
        const openDiagnostics = jest.fn();

        const session = await activateNativeExperienceRuntime(
            state('full'),
            worldSession(),
            {
                document,
                shell: shellFoundation,
                hostActions: {
                    exitExperience,
                    stopGeneration,
                    save,
                    openDiagnostics,
                },
                fetchImpl: resourceFetch({
                    'ui/main.json': {
                        id: 'full-root',
                        type: 'container',
                        children: [
                            { id: 'title', type: 'text', props: { text: 'Full Experience' } },
                            {
                                id: 'conversation-slot',
                                type: 'native-slot',
                                props: { component: 'conversation' },
                            },
                            {
                                id: 'composer-slot',
                                type: 'native-slot',
                                props: { component: 'composer' },
                            },
                        ],
                    },
                }),
            },
        );

        const fullRoot = document.getElementById('atria-game-full-root');
        const fullRecovery = document.getElementById('atria-game-full-recovery');
        expect(session.recoveryActive).toBe(true);
        expect(playHost.getStageOwner()).toBe('game-runtime:full');
        expect(fullRoot.parentElement).toBe(stage);
        expect(fullRecovery.parentElement).toBe(recovery);
        expect(fullRoot.contains(fullRecovery)).toBe(false);
        expect(fullRoot.textContent).toContain('Full Experience');

        const actions = [...fullRecovery.querySelectorAll('[data-atria-game-recovery-action]')]
            .map(node => node.dataset.atriaGameRecoveryAction);
        expect(actions).toEqual(['exit', 'stop', 'save', 'diagnostics']);

        fullRecovery.querySelector('[data-atria-game-recovery-action="save"]').click();
        fullRecovery.querySelector('[data-atria-game-recovery-action="diagnostics"]').click();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(save).toHaveBeenCalledTimes(1);
        expect(openDiagnostics).toHaveBeenCalledTimes(1);

        await session.dispose();
        expect(playHost.getStageOwner()).toBeNull();
        expect(document.getElementById('atria-game-full-root')).toBeNull();
        expect(document.getElementById('atria-game-full-recovery')).toBeNull();
        expect(playHost.native.chat.parentElement).toBe(playHost.native.sheld);
        expect(playHost.native.sendForm.parentElement).toBe(playHost.native.formSheld);
        expect(playHost.assertIntegrity()).toBe(true);
        playHost.unmount();
    });

    test('broken Full Component Model restores Stage and Native Play ownership', async () => {
        const { playHost, shellFoundation } = shellFixture();

        await expect(activateNativeExperienceRuntime(
            state('full'),
            worldSession(),
            {
                document,
                shell: shellFoundation,
                hostActions: { exitExperience: jest.fn() },
                fetchImpl: resourceFetch({
                    'ui/main.json': {
                        id: 'broken',
                        type: 'native-slot',
                        props: { component: 'unknown' },
                    },
                }),
            },
        )).rejects.toThrow(/conversation or composer/);

        expect(playHost.getStageOwner()).toBeNull();
        expect(playHost.root.style.display).toBe('');
        expect(document.getElementById('atria-game-full-root')).toBeNull();
        expect(document.getElementById('atria-game-full-recovery')).toBeNull();
        expect(playHost.native.chat.parentElement).toBe(playHost.native.sheld);
        expect(playHost.native.sendForm.parentElement).toBe(playHost.native.formSheld);
        expect(playHost.assertIntegrity()).toBe(true);
        playHost.unmount();
    });
});
