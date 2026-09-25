/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
    classifyPluginEntries,
    mountAccountUtility,
    mountPluginsUtility,
    mountSettingsUtility,
} from '../../public/scripts/atria-shell/utility-workspaces.js';

describe('A6 utility product surfaces via WorkspaceHost slot contract', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="extensions-home">
                <div id="extensions_settings"><div id="built-in-settings">built in</div></div>
                <div id="extensions_settings2"><div id="third-party-settings">plugin settings</div></div>
                <button id="extensions_details"></button>
                <button id="third_party_extension_button"></button>
            </div>
            <div id="settings-home">
                <section id="user-settings-block" class="drawer-content closedDrawer" aria-hidden="true">
                    <div id="account_controls"></div>
                    <div id="UI-language-block"><select id="ui_language_select"><option>English</option></select></div>
                    <div id="color-picker-block">Colors</div><div id="UI-Theme-Block"><select id="themes"><option>Default</option></select><label><input type="checkbox" id="reduced_motion">Reduced Motion</label><label><input id="enableLabMode">Sampling</label></div>
                    <div id="movingUIModeCheckBlock"></div>
                    <div id="power-user-options-block"></div>
                </section>
            </div>
            <main id="slot"></main>
        `;
    });

    test('Global Plugins are an explicit allowlist regardless of legacy inventory', () => {
        const plugins = classifyPluginEntries({ globalPluginNames: ['orchestrator', 'memory-graph', 'third-party/example'], disabledPlugins: ['search-tools'] });
        expect(plugins.map(item => item.name)).toEqual(['regex', 'search-tools']);
        expect(plugins[1].enabled).toBe(false);
    });

    test('Plugins show exact Work versions and retain only the two owned settings panels', async () => {
        const slot = document.getElementById('slot'), original = document.getElementById('extensions_settings');
        original.innerHTML = '<div id="regex_container"><div class="inline-drawer-header inline-drawer-toggle"><i class="inline-drawer-icon down"></i>Regex rules</div></div><div id="other">Other extension</div>';
        const regex = document.getElementById('regex_container'), header = regex.firstChild, click = jest.fn(); header.addEventListener('click', click);
        const authority = { capabilitySettings: { disabledPlugins: [] }, disableGlobalPlugin: jest.fn(async () => {}), enableGlobalPlugin: jest.fn(async () => {}) };
        const host = { openLibraryWork: jest.fn() };
        const productClient = {
            listWorks: async () => [{ package: { packageId: 'pkg' } }],
            getWork: async () => ({ package: { packageId: 'pkg' }, versions: [{ packageVersionId: 'old' }, { packageVersionId: 'current' }] }),
            getWorkVersion: jest.fn(async (_id, version) => ({ packageVersion: { packageVersionId: version }, manifest: { name: 'Voyage', version, permissions: [], runtime: { plugins: [{ pluginId: 'plugin.ui', displayName: 'Story controls', version: '1', dependencies: [], packageRuntime: {} }] } } })),
        };
        const controller = await mountPluginsUtility({ document, slot, extensionAuthority: authority, productClient, host });
        expect(slot.querySelectorAll('[data-atria-plugin]')).toHaveLength(2);
        expect(slot.querySelectorAll('[data-atria-native-plugin]')).toHaveLength(2);
        expect(slot.textContent).toContain('Story controls'); expect(slot.textContent).toContain('old');
        expect(slot.querySelector('[data-atria-legacy-plugins]')).toBeNull(); expect(slot.contains(original)).toBe(false);
        const settings = slot.querySelector('[data-atria-global-plugin-settings="regex"]'); settings.open = true; settings.dispatchEvent(new Event('toggle'));
        expect(settings.contains(regex)).toBe(true); expect(slot.querySelector('#other')).toBeNull();
        header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); expect(click).toHaveBeenCalledTimes(1);
        const toggle = slot.querySelector('[role="switch"]'); toggle.checked = false; toggle.dispatchEvent(new Event('change'));
        await Promise.resolve(); await Promise.resolve(); expect(authority.disableGlobalPlugin).toHaveBeenCalledWith('regex', false);
        [...slot.querySelectorAll('button')].find(b => b.textContent === 'Manage owning Work').click(); expect(host.openLibraryWork).toHaveBeenCalledWith('pkg', 'Voyage');
        controller.dispose(); expect(regex.parentNode).toBe(original); expect(header.hasAttribute('role')).toBe(false);
    });

    test('failed Work versions retain loaded plugins and expose a retry', async () => {
        const productClient = {
            listWorks: async () => [{ package: { packageId: 'pkg' } }],
            getWork: async () => ({ package: { packageId: 'pkg' }, versions: [{ packageVersionId: 'v' }] }),
            getWorkVersion: jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ packageVersion: { packageVersionId: 'v' }, manifest: { name: 'Work', version: '1', runtime: { plugins: [{ pluginId: 'plugin.one', displayName: 'Recovered', version: '1' }] } } }),
        };
        const controller = await mountPluginsUtility({ document, slot: document.getElementById('slot'), extensionAuthority: {}, productClient });
        expect(controller.root.textContent).toContain('Results may be incomplete');
        [...controller.root.querySelectorAll('button')].find(b => b.textContent === 'Try again').click();
        await new Promise(resolve => setTimeout(resolve, 0)); expect(controller.root.textContent).toContain('Recovered');
        controller.dispose();
    });

    test('Settings moves preference-only controls and never exposes generation authority, even under Advanced', async () => {
        const slot = document.getElementById('slot');
        const settingsRoot = document.getElementById('user-settings-block');
        const language = document.getElementById('ui_language_select');
        const originalParent = settingsRoot.parentNode;
        const accountControls = document.getElementById('account_controls');

        const controller = mountSettingsUtility({ document, body: slot });

        expect(slot.querySelector('[data-atria-settings-primary="true"]')).not.toBeNull();
        expect(slot.contains(settingsRoot)).toBe(false);
        expect(slot.querySelector('#enableLabMode')).toBeNull();
        expect(slot.querySelector('#reduced_motion')).not.toBeNull();
        expect(document.getElementById('ui_language_select')).toBe(language);
        expect(document.querySelectorAll('#ui_language_select')).toHaveLength(1);
        expect(settingsRoot.dataset.atriaWorkspaceEmbedded).toBeUndefined();
        expect(settingsRoot.classList.contains('closedDrawer')).toBe(true);
        expect(accountControls.hidden).toBe(false);
        expect(slot.textContent).toContain('Appearance');
        expect(slot.textContent).toContain('Accessibility');

        const compatibility = slot.querySelector('[data-atria-settings-compatibility="preferences-only"]');
        expect(compatibility.open).toBe(false);
        compatibility.querySelector('summary').click();
        await Promise.resolve();
        expect(compatibility.open).toBe(true);
        expect(document.getElementById('ui_language_select')).toBe(language);

        controller.dispose();
        expect(settingsRoot.parentNode).toBe(originalParent);
        expect(settingsRoot.contains(language)).toBe(true);
        expect(settingsRoot.querySelector('#reduced_motion')).not.toBeNull();
        expect(settingsRoot.className).toBe('drawer-content closedDrawer');
        expect(settingsRoot.getAttribute('aria-hidden')).toBe('true');
        expect(accountControls.hidden).toBe(false);
        expect(document.getElementById('ui_language_select')).toBe(language);
    });

    test('Account mounts the existing controller as the primary surface without duplicating identity', async () => {
        const slot = document.getElementById('slot');
        const profile = document.createElement('section');
        profile.id = 'existing-account-profile';
        const openUserProfile = jest.fn(async ({ container }) => {
            container.replaceChildren(profile);
            return profile;
        });

        const controller = await mountAccountUtility({
            document,
            slot,
            accountAuthority: {
                accountsEnabled: true,
                getCurrentUserHandle: () => 'alice',
                openUserProfile,
            },
        });

        await Promise.resolve();
        expect(slot.querySelector('[data-atria-account-primary="true"]')).not.toBeNull();
        expect(openUserProfile).toHaveBeenCalledTimes(1);
        expect(slot.contains(profile)).toBe(true);
        expect(profile.dataset.atriaAccountEmbedded).toBe('true');
        expect(document.querySelectorAll('#existing-account-profile')).toHaveLength(1);

        controller.dispose();
        expect(document.getElementById('existing-account-profile')).toBeNull();
    });
    test('Account retains a retry path and ignores a response after disposal', async () => {
        const slot = document.getElementById('slot');
        let resolveProfile;
        const authority = { openUserProfile: jest.fn()
            .mockRejectedValueOnce(new Error('Profile unavailable'))
            .mockImplementationOnce(({ container }) => new Promise(resolve => { resolveProfile = () => { container.append(document.createElement('section')); resolve(container.firstChild); }; })) };
        const controller = await mountAccountUtility({ document, slot, accountAuthority: authority });
        await Promise.resolve();
        expect(slot.textContent).toContain('Profile unavailable');
        slot.querySelector('button').click();
        expect(authority.openUserProfile).toHaveBeenCalledTimes(2);
        controller.dispose();
        resolveProfile();
        await Promise.resolve();
        expect(slot.childElementCount).toBe(0);
    });

    test('Plugin persistence failure restores the switch and exposes recovery feedback', async () => {
        const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
        const controller = await mountPluginsUtility({ document, slot: document.getElementById('slot'),
            productClient: { listWorks: async () => [] }, extensionAuthority: {
                globalPluginNames: ['regex'], globalPluginTypes: {}, capabilitySettings: { disabledPlugins: [] },
                disableGlobalPlugin: jest.fn(async () => { throw new Error('offline'); }),
            } });
        const toggle = controller.root.querySelector('[role="switch"]');
        toggle.checked = false; toggle.dispatchEvent(new Event('change'));
        await Promise.resolve(); await Promise.resolve();
        expect(toggle.checked).toBe(true);
        expect(toggle.disabled).toBe(false);
        expect(controller.root.querySelector('.atria-plugin-feedback').textContent).toContain('Try again');
        controller.dispose(); errorLog.mockRestore();
    });

    test('a superseded async Plugins mount cannot replace the next workspace', async () => {
        const slot = document.getElementById('slot');
        const pending = mountPluginsUtility({ document, slot, extensionAuthority: {}, productClient: { listWorks: async () => [] } });
        const settings = mountSettingsUtility({ document, slot });
        const old = await pending;
        old.dispose();
        expect(slot.firstChild).toBe(settings.root);
        expect(slot.querySelector('#reduced_motion')).not.toBeNull();
        settings.dispose();
    });

});
