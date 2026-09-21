/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { createAtriaAppShell } from '../../public/scripts/atria-shell/app-shell.js';
import { createCommandRegistry } from '../../public/scripts/atria-shell/command-registry.js';
import { createAtriaNavigationAuthority } from '../../public/scripts/atria-shell/navigation-authority.js';
import {
    createAtriaWorkspaceHost,
    normalizeAgentSection,
    routeDescriptor,
} from '../../public/scripts/atria-shell/workspace-host.js';

async function flushWorkspace() {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
}

function setViewport(width = 1280, height = 800) {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        value: undefined,
    });
    window.matchMedia = jest.fn(query => ({
        matches: query.includes('fine'),
        media: query,
        addEventListener() {},
        removeEventListener() {},
    }));
}

function makeAdapter(kind, records) {
    return jest.fn(({ document, slot, descriptor, host }) => {
        const root = document.createElement('section');
        root.dataset.testWorkspace = kind;
        root.textContent = descriptor.title;
        slot.replaceChildren(root);

        const controller = {
            root,
            updateRoute: jest.fn(),
            dispose: jest.fn(() => root.remove()),
        };
        records.push({ kind, descriptor, host, controller });
        return controller;
    });
}

describe('R7G WorkspaceHost', () => {
    beforeEach(() => {
        window.history.replaceState(null, '', '/');
        setViewport();
        document.body.innerHTML = `
            <main id="sheld">
                <div id="chat"></div>
                <div id="form_sheld">
                    <div id="send_form"><textarea id="send_textarea"></textarea></div>
                </div>
            </main>
        `;
    });

    test('maps Agents child routes without creating a second top-level router', async () => {
        const navigation = createAtriaNavigationAuthority({ window });
        const registry = createCommandRegistry();
        const shell = createAtriaAppShell({ document, window, registry, navigation });
        const records = [];
        const adapters = {
            agents: makeAdapter('agents', records),
            studio: makeAdapter('studio', records),
            library: makeAdapter('library', records),
            runtime: makeAdapter('runtime', records),
            diagnostics: makeAdapter('diagnostics', records),

            plugins: makeAdapter('plugins', records),

            settings: makeAdapter('settings', records),

            account: makeAdapter('account', records),
            placeholder: makeAdapter('placeholder', records),
        };
        const host = createAtriaWorkspaceHost({ document, window, shell, navigation, adapters });

        shell.navigate('agents');
        await flushWorkspace();

        expect(host.getActiveWorkspace()).toMatchObject({
            key: 'agents',
            kind: 'agents',
            section: 'orchestration',
        });
        expect(adapters.agents).toHaveBeenCalledTimes(1);
        expect(shell.slots.workspace.querySelector('[data-test-workspace="agents"]')).not.toBeNull();

        host.openAgentSection('memory');
        await flushWorkspace();

        expect(navigation.getRoute()).toMatchObject({
            domain: 'agents',
            child: { id: 'memory', kind: 'workspace' },
        });
        expect(normalizeAgentSection(navigation.getRoute())).toBe('memory');
        expect(adapters.agents).toHaveBeenCalledTimes(1);
        expect(records.at(-1).controller.updateRoute).toHaveBeenCalled();
        expect(registry.get('workspace.memory')).not.toBeNull();

        host.dispose();
        shell.destroy();
        navigation.dispose();
    });

    test('opens Library and Runtime child routes through one domain adapter each', async () => {
        const navigation = createAtriaNavigationAuthority({ window });
        const shell = createAtriaAppShell({
            document,
            window,
            registry: createCommandRegistry(),
            navigation,
        });
        const records = [];
        const adapters = {
            agents: makeAdapter('agents', records),
            studio: makeAdapter('studio', records),
            library: makeAdapter('library', records),
            runtime: makeAdapter('runtime', records),
            diagnostics: makeAdapter('diagnostics', records),

            plugins: makeAdapter('plugins', records),

            settings: makeAdapter('settings', records),

            account: makeAdapter('account', records),
            placeholder: makeAdapter('placeholder', records),
        };
        const host = createAtriaWorkspaceHost({ document, window, shell, navigation, adapters });

        host.openWorldInfo();
        await flushWorkspace();
        expect(navigation.getRoute()).toMatchObject({
            domain: 'library',
            child: { id: 'world-info', kind: 'workspace' },
        });
        expect(host.getActiveWorkspace()).toMatchObject({
            key: 'library',
            kind: 'library',
            section: 'world-info',
        });
        expect(adapters.library).toHaveBeenCalledTimes(1);

        host.openLibrarySection('skills');
        await flushWorkspace();
        expect(navigation.getRoute().child?.id).toBe('skills');
        expect(adapters.library).toHaveBeenCalledTimes(1);
        expect(records.find(item => item.kind === 'library').controller.updateRoute).toHaveBeenCalled();

        host.openRuntimeSection('roles');
        await flushWorkspace();
        expect(navigation.getRoute()).toMatchObject({
            domain: 'runtime',
            child: { id: 'roles', kind: 'workspace' },
        });
        expect(host.getActiveWorkspace()).toMatchObject({
            key: 'runtime',
            kind: 'runtime',
            section: 'roles',
        });
        expect(adapters.runtime).toHaveBeenCalledTimes(1);

        host.openRuntimeSection('retrieval');
        await flushWorkspace();
        expect(navigation.getRoute().child?.id).toBe('connections');
        expect(adapters.runtime).toHaveBeenCalledTimes(1);

        host.openUtility('diagnostics');
        await flushWorkspace();
        expect(navigation.getRoute().child?.id).toBe('utility.diagnostics');
        expect(host.getActiveWorkspace()?.key).toBe('utility:diagnostics');
        expect(adapters.diagnostics).toHaveBeenCalledTimes(1);

        host.openUtility('plugins');
        await flushWorkspace();
        expect(navigation.getRoute().child?.id).toBe('utility.plugins');
        expect(host.getActiveWorkspace()).toMatchObject({ key: 'utility:plugins', kind: 'plugins' });
        expect(adapters.plugins).toHaveBeenCalledTimes(1);

        host.openUtility('settings');
        await flushWorkspace();
        expect(navigation.getRoute().child?.id).toBe('utility.settings');
        expect(host.getActiveWorkspace()).toMatchObject({ key: 'utility:settings', kind: 'settings' });
        expect(adapters.settings).toHaveBeenCalledTimes(1);

        host.openUtility('account');
        await flushWorkspace();
        expect(navigation.getRoute().child?.id).toBe('utility.account');
        expect(host.getActiveWorkspace()).toMatchObject({ key: 'utility:account', kind: 'account' });
        expect(adapters.account).toHaveBeenCalledTimes(1);

        host.dispose();
        shell.destroy();
        navigation.dispose();
    });

    test('Context updates reuse the R7D Dock/Sheet state without remounting the active controller', async () => {
        const navigation = createAtriaNavigationAuthority({ window });
        const shell = createAtriaAppShell({
            document,
            window,
            registry: createCommandRegistry(),
            navigation,
        });
        const records = [];
        const agents = makeAdapter('agents', records);
        const host = createAtriaWorkspaceHost({
            document,
            window,
            shell,
            navigation,
            adapters: {
                agents,
                studio: makeAdapter('studio', records),
                library: makeAdapter('library', records),
                runtime: makeAdapter('runtime', records),
                diagnostics: makeAdapter('diagnostics', records),

                plugins: makeAdapter('plugins', records),

                settings: makeAdapter('settings', records),

                account: makeAdapter('account', records),
                placeholder: makeAdapter('placeholder', records),
            },
        });

        host.openAgents();
        await flushWorkspace();
        expect(agents).toHaveBeenCalledTimes(1);
        expect(shell.slots.dock.querySelector('[data-atria-workspace-context="true"]')).not.toBeNull();

        shell.setDockOpen(false);
        shell.setDockOpen(true);
        await flushWorkspace();

        expect(agents).toHaveBeenCalledTimes(1);
        expect(host.getActiveWorkspace()?.key).toBe('agents');

        host.dispose();
        shell.destroy();
        navigation.dispose();
    });

    test('workspace switching disposes the previous adapter and preserves the one native conversation DOM', async () => {
        const native = {
            chat: document.getElementById('chat'),
            sendForm: document.getElementById('send_form'),
            textarea: document.getElementById('send_textarea'),
        };
        const navigation = createAtriaNavigationAuthority({ window });
        const shell = createAtriaAppShell({
            document,
            window,
            registry: createCommandRegistry(),
            navigation,
        });
        const records = [];
        const adapters = {
            agents: makeAdapter('agents', records),
            studio: makeAdapter('studio', records),
            library: makeAdapter('library', records),
            runtime: makeAdapter('runtime', records),
            diagnostics: makeAdapter('diagnostics', records),

            plugins: makeAdapter('plugins', records),

            settings: makeAdapter('settings', records),

            account: makeAdapter('account', records),
            placeholder: makeAdapter('placeholder', records),
        };
        const host = createAtriaWorkspaceHost({ document, window, shell, navigation, adapters });

        host.openAgents();
        await flushWorkspace();
        const agentsController = records.find(item => item.kind === 'agents').controller;

        host.openStudio(7);
        await flushWorkspace();

        expect(agentsController.dispose).toHaveBeenCalledTimes(1);
        expect(host.getActiveWorkspace()?.key).toBe('studio');
        expect(document.querySelectorAll('#chat')).toHaveLength(1);
        expect(document.querySelectorAll('#send_form')).toHaveLength(1);
        expect(document.querySelectorAll('#send_textarea')).toHaveLength(1);
        expect(document.getElementById('chat')).toBe(native.chat);
        expect(document.getElementById('send_form')).toBe(native.sendForm);
        expect(document.getElementById('send_textarea')).toBe(native.textarea);

        host.dispose();
        shell.destroy();
        navigation.dispose();
    });

    test('legacy Library and Runtime triggers forward into the same Navigation Authority', async () => {
        const navigation = createAtriaNavigationAuthority({ window });
        const shell = createAtriaAppShell({
            document,
            window,
            registry: createCommandRegistry(),
            navigation,
        });
        const records = [];
        const host = createAtriaWorkspaceHost({
            document,
            window,
            shell,
            navigation,
            adapters: {
                agents: makeAdapter('agents', records),
                studio: makeAdapter('studio', records),
                library: makeAdapter('library', records),
                runtime: makeAdapter('runtime', records),
                diagnostics: makeAdapter('diagnostics', records),

                plugins: makeAdapter('plugins', records),

                settings: makeAdapter('settings', records),

                account: makeAdapter('account', records),
                placeholder: makeAdapter('placeholder', records),
            },
        });

        const characters = document.createElement('button');
        characters.id = 'rightNavDrawerIcon';
        document.body.append(characters);
        characters.click();
        await flushWorkspace();
        expect(navigation.getRoute()).toMatchObject({ domain: 'library', child: null });

        const world = document.createElement('button');
        world.id = 'WIDrawerIcon';
        document.body.append(world);
        world.click();
        await flushWorkspace();
        expect(navigation.getRoute()).toMatchObject({
            domain: 'library',
            child: { id: 'world-info' },
        });

        const api = document.createElement('button');
        api.id = 'API-status-top';
        document.body.append(api);
        api.click();
        await flushWorkspace();
        expect(navigation.getRoute()).toMatchObject({
            domain: 'runtime',
            child: { id: 'connections' },
        });

        const presets = document.createElement('button');
        presets.id = 'leftNavDrawerIcon';
        document.body.append(presets);
        presets.click();
        await flushWorkspace();
        expect(navigation.getRoute()).toMatchObject({
            domain: 'runtime',
            child: { id: 'presets' },
        });

        const skills = document.createElement('button');
        skills.dataset.atriaAction = 'manage-skills';
        document.body.append(skills);
        skills.click();
        await flushWorkspace();
        expect(navigation.getRoute()).toMatchObject({
            domain: 'library',
            child: { id: 'skills' },
        });

        const diagnostics = document.createElement('button');
        diagnostics.id = 'server_logs_button';
        document.body.append(diagnostics);
        diagnostics.click();
        await flushWorkspace();
        expect(navigation.getRoute().child?.id).toBe('utility.diagnostics');

        const extensionsDrawer = document.createElement('div');
        extensionsDrawer.id = 'extensions-settings-button';
        const extensionsToggle = document.createElement('button');
        extensionsToggle.className = 'drawer-toggle';
        extensionsDrawer.append(extensionsToggle);
        document.body.append(extensionsDrawer);
        extensionsToggle.click();
        await flushWorkspace();
        expect(navigation.getRoute().child?.id).toBe('utility.plugins');

        const settingsDrawer = document.createElement('div');
        settingsDrawer.id = 'user-settings-button';
        const settingsToggle = document.createElement('button');
        settingsToggle.className = 'drawer-toggle';
        settingsDrawer.append(settingsToggle);
        document.body.append(settingsDrawer);
        settingsToggle.click();
        await flushWorkspace();
        expect(navigation.getRoute().child?.id).toBe('utility.settings');

        const account = document.createElement('button');
        account.id = 'account_button';
        document.body.append(account);
        account.click();
        await flushWorkspace();
        expect(navigation.getRoute().child?.id).toBe('utility.account');

        host.dispose();
        shell.destroy();
        navigation.dispose();
    });

    test('route descriptor maps R7F Library and Runtime without creating new routers', () => {
        expect(routeDescriptor({
            domain: 'play',
            child: { id: 'utility.diagnostics', label: 'Diagnostics', kind: 'workspace' },
        })).toMatchObject({ key: 'utility:diagnostics', kind: 'diagnostics' });
        expect(routeDescriptor({
            domain: 'play',
            child: { id: 'utility.plugins', label: 'Plugins', kind: 'workspace' },
        })).toMatchObject({ key: 'utility:plugins', kind: 'plugins', title: 'Plugins' });
        expect(routeDescriptor({
            domain: 'runtime',
            child: { id: 'utility.settings', label: 'Settings', kind: 'workspace' },
        })).toMatchObject({ key: 'utility:settings', kind: 'settings', title: 'Settings' });
        expect(routeDescriptor({
            domain: 'library',
            child: { id: 'utility.account', label: 'Account', kind: 'workspace' },
        })).toMatchObject({ key: 'utility:account', kind: 'account', title: 'Account' });
        expect(routeDescriptor({ domain: 'library', child: null, breadcrumb: ['Library'] }))
            .toMatchObject({ key: 'library', kind: 'library', section: 'characters', title: 'Characters' });
        expect(routeDescriptor({
            domain: 'library',
            child: { id: 'world-info', label: 'Worlds & Knowledge', kind: 'workspace' },
        })).toMatchObject({ key: 'library', kind: 'library', section: 'world-info' });
        expect(routeDescriptor({ domain: 'runtime', child: null, breadcrumb: ['Runtime'] }))
            .toMatchObject({ key: 'runtime', kind: 'runtime', section: 'overview', title: 'Overview' });
        expect(routeDescriptor({
            domain: 'runtime',
            child: { id: 'retrieval', label: 'Retrieval', kind: 'workspace' },
        })).toMatchObject({ key: 'runtime', kind: 'runtime', section: 'retrieval' });
        expect(routeDescriptor({ domain: 'play', child: null, breadcrumb: ['Play'] })).toBeNull();
    });
});
