/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
    classifyPluginEntries,
    isThirdPartyPlugin,
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
                    <div id="UI-Theme-Block"></div>
                    <div id="movingUIModeCheckBlock"></div>
                    <div id="power-user-options-block"></div>
                </section>
            </div>
            <main id="slot"></main>
        `;
    });

    test('classifies only true third-party frontend extensions as Plugins', () => {
        expect(isThirdPartyPlugin('orchestrator', 'system')).toBe(false);
        expect(isThirdPartyPlugin('third-party/example', 'local')).toBe(true);
        expect(isThirdPartyPlugin('example', 'global')).toBe(true);

        const plugins = classifyPluginEntries({
            extensionNames: [
                'orchestrator',
                'memory-graph',
                'third-party/example',
                'third-party/global-example',
            ],
            extensionTypes: {
                orchestrator: 'system',
                'memory-graph': 'system',
                'third-party/example': 'local',
                'third-party/global-example': 'global',
            },
            disabledExtensions: ['third-party/global-example'],
            getManifest: name => ({
                display_name: name.includes('global') ? 'Global Example' : 'Example',
                version: '1.2.3',
            }),
        });

        expect(plugins.map(plugin => plugin.name)).toEqual([
            'third-party/example',
            'third-party/global-example',
        ]);
        expect(plugins.find(plugin => plugin.name === 'third-party/global-example')?.enabled).toBe(false);
    });

    test('Plugins reuses extension state/persistence and restores compatibility settings DOM on dispose', async () => {
        const slot = document.getElementById('slot');
        const settingsOne = document.getElementById('extensions_settings');
        const settingsTwo = document.getElementById('extensions_settings2');
        const originalParent = settingsOne.parentNode;
        const disableExtension = jest.fn(async () => {});
        const enableExtension = jest.fn(async () => {});
        const extensionAuthority = {
            extensionNames: ['orchestrator', 'third-party/example'],
            extensionTypes: {
                orchestrator: 'system',
                'third-party/example': 'local',
            },
            extension_settings: { disabledExtensions: [] },
            getExtensionManifest: jest.fn(name => ({
                display_name: name === 'orchestrator' ? 'Atria Orchestrator' : 'Example Plugin',
                version: '2.0.0',
                author: 'Plugin Author',
                description: 'Third-party fixture',
            })),
            disableExtension,
            enableExtension,
        };

        const productClient = {
            listWorks: jest.fn(async () => [{
                package: { packageId: 'pkg_1', displayName: 'Native Work' },
                manifest: {
                    runtime: {
                        plugins: [{
                            pluginId: 'native.package-ui',
                            version: '1.0.0',
                            packageRuntime: {
                                capabilities: ['ui.contributions'],
                                contributions: [{ type: 'play.toolbar', id: 'toolbar' }],
                            },
                        }],
                    },
                },
            }]),
        };
        const controller = await mountPluginsUtility({
            document,
            slot,
            extensionAuthority,
            productClient,
        });

        expect(slot.querySelector('[data-atria-plugin-surface="native"]')).not.toBeNull();
        expect(slot.querySelector('[data-atria-native-plugin="native.package-ui"]')).not.toBeNull();
        expect(slot.querySelectorAll('[data-atria-plugin]')).toHaveLength(1);
        expect(slot.querySelector('[data-atria-plugin="third-party/example"]')).not.toBeNull();
        expect(slot.querySelector('[data-atria-legacy-plugins="true"]').open).toBe(false);
        expect(slot.textContent).not.toContain('Atria Orchestrator');
        expect(slot.contains(settingsOne)).toBe(true);
        expect(slot.contains(settingsTwo)).toBe(true);
        expect(slot.querySelector('[data-atria-plugin-surface="server"]')?.textContent)
            .toContain('Server plugins');
        expect(document.querySelectorAll('#extensions_settings')).toHaveLength(1);
        expect(document.querySelectorAll('#extensions_settings2')).toHaveLength(1);

        const toggle = slot.querySelector('[data-plugin-name="third-party/example"]');
        toggle.checked = false;
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
        expect(disableExtension).toHaveBeenCalledWith('third-party/example', false);

        slot.querySelector('[data-atria-plugin="third-party/example"] .atria-utility-action').click();
        expect(slot.querySelector('[data-atria-plugin-compatibility="true"]').open).toBe(true);

        controller.dispose();
        expect(settingsOne.parentNode).toBe(originalParent);
        expect(settingsTwo.parentNode).toBe(originalParent);
        expect(settingsOne.dataset.atriaWorkspaceEmbedded).toBeUndefined();
    });

    test('Settings presents Atria product cards and keeps the exact legacy authority under Advanced', async () => {
        const slot = document.getElementById('slot');
        const settingsRoot = document.getElementById('user-settings-block');
        const language = document.getElementById('ui_language_select');
        const originalParent = settingsRoot.parentNode;
        const accountControls = document.getElementById('account_controls');

        const controller = mountSettingsUtility({ document, body: slot });

        expect(slot.querySelector('[data-atria-settings-primary="true"]')).not.toBeNull();
        expect(slot.contains(settingsRoot)).toBe(true);
        expect(document.getElementById('ui_language_select')).toBe(language);
        expect(document.querySelectorAll('#ui_language_select')).toHaveLength(1);
        expect(settingsRoot.dataset.atriaWorkspaceEmbedded).toBe('true');
        expect(settingsRoot.classList.contains('openDrawer')).toBe(true);
        expect(accountControls.hidden).toBe(true);
        expect(slot.textContent).toContain('Appearance');
        expect(slot.textContent).toContain('Accessibility');

        const compatibility = slot.querySelector('[data-atria-settings-compatibility="true"]');
        expect(compatibility.open).toBe(false);
        slot.querySelector('[data-atria-settings-section="language"] .atria-utility-action').click();
        await Promise.resolve();
        expect(compatibility.open).toBe(true);
        expect(document.getElementById('ui_language_select')).toBe(language);

        controller.dispose();
        expect(settingsRoot.parentNode).toBe(originalParent);
        expect(settingsRoot.className).toBe('drawer-content closedDrawer');
        expect(settingsRoot.getAttribute('aria-hidden')).toBe('true');
        expect(accountControls.hidden).toBe(false);
        expect(document.getElementById('ui_language_select')).toBe(language);
    });

    test('Account is Atria-native first and lazily mounts the existing authority only under Advanced', async () => {
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

        expect(slot.querySelector('[data-atria-account-primary="true"]').textContent).toContain('alice');
        expect(openUserProfile).not.toHaveBeenCalled();
        const advanced = slot.querySelector('[data-atria-account-advanced="true"]');
        advanced.open = true;
        advanced.dispatchEvent(new Event('toggle'));
        await Promise.resolve();
        await Promise.resolve();
        expect(openUserProfile).toHaveBeenCalledTimes(1);
        expect(slot.contains(profile)).toBe(true);
        expect(profile.dataset.atriaAccountEmbedded).toBe('advanced');
        expect(document.querySelectorAll('#existing-account-profile')).toHaveLength(1);

        controller.dispose();
        expect(document.getElementById('existing-account-profile')).toBeNull();
    });
});
