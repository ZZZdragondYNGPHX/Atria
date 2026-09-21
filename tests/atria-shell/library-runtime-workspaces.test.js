/** @jest-environment jsdom */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
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

describe('R7F Library / Runtime domain adapters', () => {
    let context;

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="legacy-character-home">
                <section id="right-nav-panel" class="drawer-content closedDrawer" aria-hidden="true">
                    <button id="rm_button_characters"></button>
                    <div id="rm_print_characters_block">
                        <button class="character_select" chid="1">Alice</button>
                    </div>
                </section>
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
            characterId: 0,
            characters: [
                { name: 'Zero', avatar: 'zero.png' },
                { name: 'Alice', avatar: 'alice.png' },
            ],
            selectCharacterById: jest.fn(async id => {
                context.characterId = id;
            }),
            extensionSettings: {
                connectionManager: {
                    profiles: [],
                    selectedProfile: null,
                },
            },
            getExtensionApi: jest.fn(() => null),
        };
        globalThis.Atria = { getContext: () => context };
    });

    afterEach(() => {
        delete globalThis.Atria;
    });

    test('normalizes Library and Runtime child routes without defining another router', () => {
        expect(normalizeLibrarySection({ child: null })).toBe('characters');
        expect(normalizeLibrarySection({ child: { id: 'character:12' } })).toBe('characters');
        expect(normalizeLibrarySection({ child: { id: 'world-info' } })).toBe('world-info');
        expect(normalizeRuntimeSection({ child: null })).toBe('overview');
        expect(normalizeRuntimeSection({ child: { id: 'retrieval' } })).toBe('connections');
        expect(RUNTIME_SECTIONS.map(section => section.id)).toEqual(['overview', 'roles', 'connections', 'presets']);
    });

    test('Characters reparents the existing controller root and restores the exact node on dispose', async () => {
        const slot = document.getElementById('slot');
        const original = document.getElementById('right-nav-panel');
        const originalParent = original.parentNode;
        const host = {
            openLibrarySection: jest.fn(),
            openLibraryCharacter: jest.fn(),
            openStudio: jest.fn(),
            openPlay: jest.fn(),
        };

        const controller = mountLibraryDomainWorkspace({
            document,
            slot,
            route: { domain: 'library', child: null },
            host,
        });
        await flush();

        expect(document.getElementById('right-nav-panel')).toBe(original);
        expect(slot.contains(original)).toBe(true);
        expect(original.dataset.atriaWorkspaceEmbedded).toBe('true');
        expect(original.classList.contains('openDrawer')).toBe(true);

        original.querySelector('.character_select').click();
        await flush();
        expect(host.openLibraryCharacter).toHaveBeenCalledWith(1, 'Alice');

        controller.updateRoute({
            domain: 'library',
            child: { id: 'character:1', label: 'Alice', kind: 'detail' },
        });
        await flush();
        expect(context.selectCharacterById).toHaveBeenCalledWith(1);

        controller.dispose();
        await flush();
        expect(original.parentNode).toBe(originalParent);
        expect(original.className).toBe('drawer-content closedDrawer');
        expect(original.getAttribute('aria-hidden')).toBe('true');
        expect(original.dataset.atriaWorkspaceEmbedded).toBeUndefined();
    });

    test('Connections embeds the complete native API authority and keeps old Retrieval routes inside it', async () => {
        const slot = document.getElementById('slot');
        const apiBlock = document.getElementById('rm_api_block');
        const managerRoot = document.getElementById('atria-connection-manager-root');
        const originalParent = apiBlock.parentNode;
        const chat = managerRoot.querySelector('[data-mode="chat"]');
        const embed = managerRoot.querySelector('[data-mode="embed"]');
        const chatClick = jest.fn();
        const embedClick = jest.fn();
        chat.addEventListener('click', chatClick);
        embed.addEventListener('click', embedClick);

        const host = {
            openRuntimeSection: jest.fn(),
        };
        const controller = mountRuntimeDomainWorkspace({
            document,
            slot,
            route: { domain: 'runtime', child: { id: 'retrieval' } },
            host,
        });
        await flush();

        expect(slot.contains(apiBlock)).toBe(true);
        expect(apiBlock.dataset.atriaWorkspaceEmbedded).toBe('true');
        expect(managerRoot.dataset.atriaWorkspaceEmbedded).toBe('true');
        expect(slot.querySelector('#native-chat-api-editor')).not.toBeNull();
        expect(embedClick).toHaveBeenCalled();

        controller.updateRoute({
            domain: 'runtime',
            child: { id: 'connections', label: 'Connections', kind: 'workspace' },
        });
        await flush();
        expect(chatClick).toHaveBeenCalled();
        expect(document.querySelectorAll('#rm_api_block')).toHaveLength(1);
        expect(document.querySelectorAll('#atria-connection-manager-root')).toHaveLength(1);

        controller.dispose();
        await flush();
        expect(apiBlock.parentNode).toBe(originalParent);
        expect(apiBlock.className).toBe('drawer-content closedDrawer');
        expect(apiBlock.getAttribute('aria-hidden')).toBe('true');
        expect(apiBlock.dataset.atriaWorkspaceEmbedded).toBeUndefined();
        expect(managerRoot.dataset.atriaWorkspaceEmbedded).toBeUndefined();
    });
});
