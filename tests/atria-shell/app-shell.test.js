/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { createAtriaAppShell } from '../../public/scripts/atria-shell/app-shell.js';
import { initializeAtriaShellFoundation } from '../../public/scripts/atria-shell/index.js';
import { createCommandRegistry } from '../../public/scripts/atria-shell/command-registry.js';
import { ATRIA_PRIMITIVES } from '../../public/scripts/atria-shell/primitives.js';

function setViewport(width, height) {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        value: undefined,
    });
}

describe('R7A Atria AppShell foundation', () => {
    beforeEach(() => {
        window.history.replaceState(null, '', '/');
        document.body.innerHTML = `
            <div id="top-bar"></div>
            <div id="top-settings-holder"></div>
            <main id="sheld">
                <div id="chat"><div class="mes">existing conversation</div></div>
                <div id="form_sheld"><div id="send_form"><textarea id="send_textarea"></textarea></div></div>
            </main>
        `;
        setViewport(1440, 900);
        window.matchMedia = jest.fn(query => ({
            matches: query.includes('fine'),
            media: query,
            addEventListener() {},
            removeEventListener() {},
        }));
    });

    test('mounts semantic host regions without moving or cloning native conversation DOM', () => {
        const originalChat = document.getElementById('chat');
        const originalComposer = document.getElementById('send_form');
        const registry = createCommandRegistry();
        const shell = createAtriaAppShell({ document, window, registry });

        expect(shell.root.id).toBe('atria-app-shell');
        expect(shell.root.dataset.atriaViewport).toBe('expanded');
        expect(shell.slots.stage.dataset.atriaPrimitive).toBe('Stage');
        expect(shell.slots.workspace.dataset.atriaPrimitive).toBe('Workspace');
        expect(shell.slots.dock.parentElement.dataset.atriaPrimitive).toBe('Dock');
        expect(document.getElementById('chat')).toBe(originalChat);
        expect(document.getElementById('send_form')).toBe(originalComposer);
        expect(shell.root.contains(originalChat)).toBe(false);
        expect(shell.root.contains(originalComposer)).toBe(false);

        for (const required of [
            'AppShell', 'NavigationRail', 'BottomNavigation', 'GlobalBar',
            'ContextBar', 'FocusArea', 'Stage', 'Workspace', 'Dock', 'Sheet',
            'Inspector', 'Timeline', 'Composer', 'CommandPalette', 'CommandSheet',
            'RuntimeCard', 'StatusChip', 'Toolbar', 'SegmentedControl',
            'SplitPane', 'EmptyState', 'ErrorState', 'LoadingState', 'HostRecovery',
        ]) {
            expect(ATRIA_PRIMITIVES).toContain(required);
        }

        shell.destroy();
        expect(document.getElementById('atria-app-shell')).toBeNull();
        expect(document.getElementById('chat')).toBe(originalChat);
    });

    test('switches navigation chrome between Expanded and Compact on one DOM tree', () => {
        const shell = createAtriaAppShell({
            document,
            window,
            registry: createCommandRegistry(),
        });
        const rail = shell.root.querySelector('[data-atria-primitive="NavigationRail"]');
        const bottom = shell.root.querySelector('[data-atria-primitive="BottomNavigation"]');

        expect(rail.hidden).toBe(false);
        expect(bottom.hidden).toBe(true);

        setViewport(390, 844);
        shell.environment.refresh();

        expect(shell.root.dataset.atriaViewport).toBe('compact');
        expect(rail.hidden).toBe(true);
        expect(bottom.hidden).toBe(false);
        expect(shell.root.querySelector('.atria-command-surface').dataset.atriaCommandPresentation)
            .toBe('sheet');

        shell.destroy();
    });

    test('uses one registry for navigation and Command Palette / Sheet behavior', async () => {
        const registry = createCommandRegistry();
        const shell = createAtriaAppShell({ document, window, registry });

        expect(registry.get('navigate.library')).not.toBeNull();
        shell.openCommand();
        const result = shell.root.querySelector('[data-atria-command-id="navigate.library"]');
        expect(result).not.toBeNull();

        result.click();
        await Promise.resolve();

        expect(shell.getActiveDomain()).toBe('library');
        expect(shell.slots.stage.hidden).toBe(true);
        expect(shell.slots.workspace.hidden).toBe(false);
        expect(shell.isCommandOpen()).toBe(false);

        shell.destroy();
    });

    test('tracks staged preview mount and reversibly reparents the one native Play host', () => {
        const nativeSheld = document.getElementById('sheld');
        const nativeChat = document.getElementById('chat');
        const nativeComposer = document.getElementById('send_form');
        const nativeTextarea = document.getElementById('send_textarea');

        const foundation = initializeAtriaShellFoundation({
            document,
            window,
            forcePreview: true,
        });

        expect(foundation.isPreviewEnabled()).toBe(true);
        expect(foundation.isMounted()).toBe(true);
        expect(foundation.getPlayHost().native.sheld).toBe(nativeSheld);
        expect(foundation.getPlayHost().native.chat).toBe(nativeChat);
        expect(foundation.getPlayHost().native.sendForm).toBe(nativeComposer);
        expect(foundation.getPlayHost().native.sendTextarea).toBe(nativeTextarea);
        expect(foundation.getShell().slots.stage.contains(nativeSheld)).toBe(true);
        expect(document.querySelectorAll('#chat')).toHaveLength(1);
        expect(document.querySelectorAll('#send_form')).toHaveLength(1);

        foundation.setPreviewEnabled(false, { persist: false });
        expect(foundation.isPreviewEnabled()).toBe(false);
        expect(foundation.isMounted()).toBe(false);
        expect(foundation.getPlayHost()).toBeNull();
        expect(nativeSheld.parentElement).toBe(document.body);
        expect(document.getElementById('chat')).toBe(nativeChat);
        expect(document.getElementById('send_form')).toBe(nativeComposer);
        expect(document.getElementById('send_textarea')).toBe(nativeTextarea);

        foundation.setPreviewEnabled(true, { persist: false });
        expect(foundation.isPreviewEnabled()).toBe(true);
        expect(foundation.isMounted()).toBe(true);
        expect(foundation.getPlayHost().native.sheld).toBe(nativeSheld);
        expect(foundation.getPlayHost().native.chat).toBe(nativeChat);
        expect(foundation.getPlayHost().native.sendForm).toBe(nativeComposer);

        foundation.unmount();
        expect(nativeSheld.parentElement).toBe(document.body);
    });

    test('reuses one context slot as Dock on desktop and Context Sheet on Compact', () => {
        const shell = createAtriaAppShell({
            document,
            window,
            registry: createCommandRegistry(),
        });
        const slot = shell.slots.dock;
        const panel = document.createElement('div');
        panel.textContent = 'Timeline fixture';
        shell.setDockContent(panel, { title: 'Timeline', state: 'half' });

        expect(slot.textContent).toBe('Timeline fixture');
        expect(slot.parentElement?.classList.contains('atria-dock')).toBe(true);
        expect(shell.root.querySelector('[data-atria-primitive="Dock"]').hidden).toBe(false);
        expect(shell.root.querySelector('#atria-context-sheet').hidden).toBe(true);

        setViewport(390, 844);
        shell.environment.refresh();

        const sheet = shell.root.querySelector('#atria-context-sheet');
        expect(sheet.hidden).toBe(false);
        expect(sheet.dataset.atriaSheetState).toBe('half');
        expect(slot.parentElement?.classList.contains('atria-sheet-body')).toBe(true);
        expect(slot.textContent).toBe('Timeline fixture');

        expect(shell.closeSheet()).toBe(true);
        expect(sheet.hidden).toBe(true);
        shell.destroy();
    });

    test('routes Rail, Bottom Navigation and navigate.* commands through one history authority', async () => {
        const registry = createCommandRegistry();
        const shell = createAtriaAppShell({ document, window, registry });

        shell.root
            .querySelector('[data-atria-primitive="NavigationRail"] [data-atria-domain="library"]')
            .click();
        expect(shell.getRoute().domain).toBe('library');
        expect(window.location.search).toContain('atriaRoute=library');
        expect(shell.root.querySelectorAll('[data-atria-domain="library"].is-selected')).toHaveLength(2);

        shell.openCommand();
        shell.root.querySelector('[data-atria-command-id="navigate.runtime"]').click();
        await Promise.resolve();

        expect(shell.getRoute().domain).toBe('runtime');
        expect(window.history.state.atriaNavigation.domain).toBe('runtime');
        expect(shell.root.querySelector('.atria-global-bar__breadcrumb').textContent)
            .toContain('Runtime');
        shell.destroy();
    });

    test('Escape closes Compact Context Sheet before Command Sheet', () => {
        setViewport(390, 844);
        const shell = createAtriaAppShell({
            document,
            window,
            registry: createCommandRegistry(),
        });
        shell.setDockContent('context', { title: 'Context', open: true });
        shell.openCommand();

        const commandInput = shell.root.querySelector('.atria-command-input');
        commandInput.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
        }));
        expect(shell.isContextSheetOpen()).toBe(false);
        expect(shell.isCommandOpen()).toBe(true);

        commandInput.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
        }));
        expect(shell.isCommandOpen()).toBe(false);
        shell.destroy();
    });
});
