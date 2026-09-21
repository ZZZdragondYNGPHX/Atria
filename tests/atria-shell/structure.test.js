import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');

describe('R7 shell architecture', () => {
    test('loads semantic tokens and shell stylesheet as first-class frontend assets', () => {
        const index = read('public/index.html');
        expect(index).toContain('href="css/atria-tokens.css"');
        expect(index).toContain('href="css/atria-shell.css"');
    });

    test('initializes the shell foundation after settings/theme setup without making it a second app runtime', () => {
        const script = read('public/script.js');
        expect(script).toContain('import { initializeAtriaShellFoundation } from \'./scripts/atria-shell/index.js\'');
        expect(script).toContain('const shellFoundation = initializeAtriaShellFoundation({');
        expect(script).toContain('globalThis.Atria.shell = shellFoundation');

        const dynamicStyles = script.indexOf('initDynamicStyles();');
        const shellInit = script.indexOf('const shellFoundation = initializeAtriaShellFoundation({');
        const worldWorkspace = script.indexOf('initWorldInfoWorkspace();');
        expect(shellInit).toBeGreaterThan(dynamicStyles);
        expect(shellInit).toBeLessThan(worldWorkspace);
    });

    test('R7B reparents the native host without cloning or creating a second Conversation runtime', () => {
        const shell = read('public/scripts/atria-shell/app-shell.js');
        const entry = read('public/scripts/atria-shell/index.js');
        const nativeHost = read('public/scripts/atria-shell/native-play-host.js');

        expect(shell).not.toContain('getElementById(\'chat\')');
        expect(shell).not.toContain('getElementById(\'send_form\')');
        expect(entry).toContain('import { mountNativePlayHost } from \'./native-play-host.js\';');
        expect(entry).toContain('playHost = mountNativePlayHost({');
        const unmountBody = entry.slice(entry.indexOf('function unmount()'), entry.indexOf('function setMountedForDebug'));
        expect(unmountBody.indexOf('playHost?.unmount();')).toBeGreaterThanOrEqual(0);
        expect(unmountBody.indexOf('playHost?.unmount();')).toBeLessThan(unmountBody.indexOf('shell.destroy();'));
        expect(nativeHost).toContain('\'sheld\'');
        expect(nativeHost).toContain('\'chat\'');
        expect(nativeHost).toContain('\'send_form\'');
        expect(nativeHost).toContain('\'send_textarea\'');
        expect(nativeHost).not.toContain('cloneNode(');
        expect(nativeHost).not.toContain('createElement(\'chat\')');
        expect(nativeHost).not.toContain('createElement(\'send_form\')');
        expect(nativeHost).not.toContain('Generate(');
        expect(nativeHost).not.toContain('chat = []');
    });

    test('isolates SmartTheme compatibility in the semantic token adapter', () => {
        const tokens = read('public/css/atria-tokens.css');
        const shell = read('public/css/atria-shell.css');
        expect(tokens).toContain('--atri-color-canvas');
        expect(tokens).toContain('SmartTheme');
        expect(shell).not.toContain('SmartTheme');
        expect(shell).toContain('var(--atri-color-canvas)');
    });

    test('R7H makes Atria Shell the default Host and keeps only an explicit legacy recovery contract', () => {
        const entry = read('public/scripts/atria-shell/index.js');
        const constants = read('public/scripts/atria-shell/constants.js');
        const css = read('public/css/atria-shell.css');
        expect(constants).toContain("ATRIA_SHELL_RECOVERY_QUERY_KEY = 'atriaShellRecovery'");
        expect(entry).toContain('readRecoveryPreference(windowRef)');
        expect(entry).toContain("documentRef.body.dataset.atriaShellMounted = 'true'");
        expect(entry).toContain("documentRef.body.dataset.atriaShellRecovery = 'legacy'");
        expect(css).toContain('body[data-atria-shell-mounted="true"] > #top-settings-holder');
    });

    test('MovingUI cannot write geometry onto Shell-owned layout', () => {
        const ross = read('public/scripts/RossAscends-mods.js');
        const power = read('public/scripts/power-user.js');
        expect(ross).toContain('export function isAtriaShellLayoutOwned(element)');
        expect(ross).toContain("element?.closest?.('#atria-app-shell')");
        expect(power).toContain('isAtriaShellLayoutOwned(elmnt[0])');
        expect(power).toContain('filter(panel => !isAtriaShellLayoutOwned(panel))');
    });

    test('keeps Backgrounds hash tabs local when the document URL has a query string', () => {
        const backgrounds = read('public/scripts/backgrounds.js');
        const rewriteIndex = backgrounds.indexOf('currentDocumentUrl');
        const tabsInitIndex = backgrounds.indexOf('.tabs();', rewriteIndex);

        expect(backgrounds).toContain('window.location.pathname');
        expect(backgrounds).toContain('window.location.search');
        expect(rewriteIndex).toBeGreaterThanOrEqual(0);
        expect(tabsInitIndex).toBeGreaterThan(rewriteIndex);
    });

    test('locks the shell root to the measured visual viewport on compact devices', () => {
        const shell = read('public/css/atria-shell.css');
        expect(shell).toContain('width: var(--atri-viewport-width, 100dvw);');
        expect(shell).toContain('height: var(--atri-viewport-height, 100dvh);');
        expect(shell).toContain('min-height: 0;');
        expect(shell).toContain('.atria-command-surface:not([hidden])');
        expect(shell).toContain('display: block !important;');
        expect(shell).toContain('var(--atri-safe-area-bottom)');
        expect(shell).toContain('var(--atri-safe-area-left)');
        expect(shell).toContain('var(--atri-safe-area-right)');
    });

    test('R7D has one route/history authority and one ordered Web Back resolver', () => {
        const shell = read('public/scripts/atria-shell/app-shell.js');
        const entry = read('public/scripts/atria-shell/index.js');
        const navigation = read('public/scripts/atria-shell/navigation-authority.js');
        const backResolver = read('public/scripts/atria-shell/back-resolver.js');
        const script = read('public/script.js');

        expect(entry).toContain('createAtriaNavigationAuthority');
        expect(shell).toContain('navigation: navigationAuthority');
        expect(shell).not.toContain('let activeDomain');
        expect(shell).not.toContain('let dockOpen');
        expect(navigation).toContain('windowRef.history[method]');
        expect(navigation).toContain('windowRef.addEventListener?.');
        expect(backResolver).toContain('dismissContextSheet');
        expect(backResolver).toContain('dismissCommandSurface');
        expect(backResolver).toContain('escapeFullGame');
        expect(backResolver).toContain('exitImmersive');
        expect(backResolver).toContain('navigateAtriaBack');
        expect(script).toContain('window.__atriaHandleBack = () => atriaBackResolver.resolve();');
    });
});
