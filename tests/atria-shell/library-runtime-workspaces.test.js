/** @jest-environment jsdom */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
    LIBRARY_SECTIONS,
    mountLibraryDomainWorkspace,
    mountRuntimeDomainWorkspace,
    normalizeLibrarySection,
    normalizeRuntimeSection,
    RUNTIME_SECTIONS,
} from '../../public/scripts/atria-shell/library-runtime-workspaces.js';

async function flush() {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
}

function jsonResponse(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
            return payload;
        },
    };
}

describe('N9 Library / Runtime domain adapters', () => {
    let context;

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="legacy-character-home">
                <section id="right-nav-panel" class="drawer-content closedDrawer" aria-hidden="true"></section>
            </div>
            <div id="legacy-api-home">
                <div id="rm_api_block" class="drawer-content closedDrawer" aria-hidden="true">
                    <select id="main_api"><option value="openai">Chat Completion</option></select>
                    <div id="native-chat-api-editor">Native chat API editor</div>
                    <section id="atria-connection-manager-root" class="wide100p">
                        <button class="connection_profile_mode_tab" data-mode="chat">Chat</button>
                        <button class="connection_profile_mode_tab" data-mode="embed">Embedding</button>
                        <button class="connection_profile_mode_tab" data-mode="rerank">Rerank</button>
                    </section>
                </div>
            </div>
            <main id="slot"></main>
        `;

        context = {
            extensionSettings: {
                connectionManager: {
                    profiles: [{
                        id: 'chat-main',
                        name: 'Primary Chat',
                        mode: 'cc',
                        provider: 'OpenAI-compatible',
                        model: 'model-a',
                    }],
                    selectedProfile: 'chat-main',
                },
            },
            getExtensionApi: jest.fn(() => null),
            getRequestHeaders: jest.fn(() => ({ 'X-CSRF-Token': 'test' })),
        };
        globalThis.Atria = { getContext: () => context };
        globalThis.fetch = jest.fn(async (url) => {
            const value = String(url);
            if (value.endsWith('/api/native/product/works')) {
                return jsonResponse([{
                    package: {
                        packageId: 'pkg_11111111111111111111111111111111',
                        displayName: 'Native Work',
                        currentVersionId: 'pkgv_11111111111111111111111111111111',
                    },
                    packageVersion: {
                        packageVersionId: 'pkgv_11111111111111111111111111111111',
                        version: '1.0.0',
                    },
                    manifest: {
                        name: 'Native Work',
                        description: 'Native authority',
                        entryPoints: [],
                    },
                    status: 'ready',
                    sessionCount: 0,
                }]);
            }
            if (value.endsWith('/api/native/product/sessions')) {
                return jsonResponse([]);
            }
            throw new Error('Unexpected fetch: ' + value);
        });
    });

    afterEach(() => {
        delete globalThis.Atria;
        delete globalThis.fetch;
    });

    test('normalizes Native Library and existing Runtime child routes without defining another router', () => {
        expect(normalizeLibrarySection({ child: null })).toBe('works');
        expect(normalizeLibrarySection({ child: { id: 'work:pkg_1' } })).toBe('works');
        expect(normalizeLibrarySection({ child: { id: 'worlds' } })).toBe('worlds-knowledge');
        expect(normalizeLibrarySection({ child: { id: 'world:world_1' } })).toBe('worlds-knowledge');
        expect(normalizeLibrarySection({ child: { id: 'knowledge' } })).toBe('worlds-knowledge');
        expect(normalizeLibrarySection({ child: { id: 'knowledge:kb_1' } })).toBe('worlds-knowledge');
        expect(LIBRARY_SECTIONS.map(section => section.id)).toEqual(['works', 'worlds-knowledge', 'prompt-programs', 'prompt-modules', 'generation-profiles', 'skills']);

        expect(normalizeRuntimeSection({ child: null })).toBe('routes');
        expect(normalizeRuntimeSection({ child: { id: 'retrieval' } })).toBe('retrieval');
        expect(RUNTIME_SECTIONS.map(section => section.id)).toEqual(['routes', 'models', 'connections', 'retrieval', 'diagnostics']);
    });

    test('Works is the default Library authority and does not mount the Character controller', async () => {
        const slot = document.getElementById('slot');
        const characterRoot = document.getElementById('right-nav-panel');
        const characterParent = characterRoot.parentNode;
        const host = {
            openLibrarySection: jest.fn(),
            openLibraryWork: jest.fn(),
            openLibraryWorld: jest.fn(),
            openLibraryKnowledge: jest.fn(),
            openPlay: jest.fn(),
        };

        const controller = mountLibraryDomainWorkspace({
            document,
            slot,
            route: { domain: 'library', child: null },
            host,
        });
        await flush();

        expect(slot.querySelector('[data-atria-pattern="master-detail"]')).not.toBeNull();
        expect(slot.querySelector('[data-atria-native-library="works"]')).not.toBeNull();
        expect(slot.querySelector('[data-atria-native-works="true"]')).not.toBeNull();
        expect(slot.querySelector('[data-atria-work-id]')).not.toBeNull();
        expect(characterRoot.parentNode).toBe(characterParent);
        expect(characterRoot.dataset.atriaWorkspaceEmbedded).toBeUndefined();

        slot.querySelector('[data-atria-work-id] button').click();
        expect(host.openLibraryWork).toHaveBeenCalledWith(
            'pkg_11111111111111111111111111111111',
            'Native Work',
        );

        controller.dispose();
    });

    test('Native Connections never reparents the legacy editor and capabilities links resolve to Models', async () => {
        globalThis.fetch = jest.fn(async () => jsonResponse({ connections: [], models: [], routes: [], profiles: [], resources: [] }));
        const slot = document.getElementById('slot');
        const legacy = document.getElementById('rm_api_block'); const parent = legacy.parentNode;
        const controller = mountRuntimeDomainWorkspace({ document, slot, route: { domain: 'runtime', child: { id: 'connections' } }, host: { openRuntimeSection: jest.fn() } });
        await flush();
        expect(slot.querySelector('[data-atria-runtime-native="connections"]')).not.toBeNull();
        expect(slot.textContent).toContain('No connections yet');
        expect(legacy.parentNode).toBe(parent);
        expect(slot.contains(legacy)).toBe(false);
        controller.updateRoute({ domain: 'runtime', child: { id: 'capabilities' } });
        await flush();
        expect(slot.querySelector('[data-atria-runtime-native="models"]')).not.toBeNull();
        controller.dispose();
    });
});
