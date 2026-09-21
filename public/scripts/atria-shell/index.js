import { ATRIA_SHELL_RECOVERY_QUERY_KEY } from './constants.js';
import { createAtriaAppShell } from './app-shell.js';
import { createCommandRegistry } from './command-registry.js';
import { createAtriaNavigationAuthority } from './navigation-authority.js';
import { mountNativePlayHost } from './native-play-host.js';
import { createAtriaWorkspaceHost } from './workspace-host.js';

function readRecoveryPreference(windowRef) {
    try {
        const params = new URLSearchParams(windowRef.location?.search || '');
        const value = String(params.get(ATRIA_SHELL_RECOVERY_QUERY_KEY) || '').trim().toLowerCase();
        return value === 'legacy' || value === '1' || value === 'true';
    } catch {
        return false;
    }
}

const COMPATIBILITY_ANCHOR_IDS = Object.freeze([
    'top-bar',
    'top-settings-holder',
    'left-nav-panel',
    'right-nav-panel',
    'WorldInfo',
    'rm_api_block',
    'user-settings-block',
    'rm_extensions_block',
    'extensions_settings',
    'extensions_settings2',
]);

function markCompatibilityAnchors(documentRef) {
    for (const id of COMPATIBILITY_ANCHOR_IDS) {
        const node = documentRef.getElementById(id);
        if (node) node.dataset.atriaCompatibilityAnchor = 'true';
    }
}

export function initializeAtriaShellFoundation({
    document: documentRef = globalThis.document,
    window: windowRef = globalThis.window,
    translate,
    utilities,
    forceRecovery,
} = {}) {
    if (!documentRef?.body || !windowRef) {
        throw new Error('Atria shell foundation requires document and window');
    }

    const registry = createCommandRegistry();
    let navigation = null;
    let shell = null;
    let playHost = null;
    let workspaceHost = null;
    let recoveryMode = forceRecovery === undefined
        ? readRecoveryPreference(windowRef)
        : Boolean(forceRecovery);

    markCompatibilityAnchors(documentRef);

    function mount() {
        if (shell) return shell;
        navigation ||= createAtriaNavigationAuthority({
            window: windowRef,
            initialDomain: 'play',
        });
        shell = createAtriaAppShell({
            document: documentRef,
            window: windowRef,
            registry,
            navigation,
            translate,
            utilities: {
                ...(utilities || {}),
                diagnostics: utilities?.diagnostics || (() => workspaceHost?.openUtility('diagnostics')),
                plugins: utilities?.plugins || (() => workspaceHost?.openUtility('plugins')),
                settings: utilities?.settings || (() => workspaceHost?.openUtility('settings')),
                account: utilities?.account || (() => workspaceHost?.openUtility('account')),
            },
        });
        try {
            playHost = mountNativePlayHost({
                document: documentRef,
                stage: shell.slots.stage,
            });
            workspaceHost = createAtriaWorkspaceHost({
                document: documentRef,
                window: windowRef,
                shell,
                navigation,
            });
        } catch (error) {
            workspaceHost?.dispose();
            workspaceHost = null;
            playHost?.unmount();
            playHost = null;
            shell.destroy();
            shell = null;
            documentRef.body.dataset.atriaShellFailure = 'mount';
            console.error('[Atria Shell] mount failed; legacy recovery surface remains available', error);
            throw error;
        }
        documentRef.body.dataset.atriaShellMounted = 'true';
        delete documentRef.body.dataset.atriaShellFailure;
        delete documentRef.body.dataset.atriaShellRecovery;
        return shell;
    }

    function unmount() {
        if (!shell) return false;
        workspaceHost?.dispose();
        workspaceHost = null;
        playHost?.unmount();
        playHost = null;
        shell.destroy();
        shell = null;
        navigation?.dispose();
        navigation = null;
        delete documentRef.body.dataset.atriaShellMounted;
        return true;
    }

    function setMountedForDebug(enabled) {
        recoveryMode = false;
        if (enabled) return mount();
        unmount();
        return null;
    }

    if (recoveryMode) {
        documentRef.body.dataset.atriaShellRecovery = 'legacy';
    } else {
        try {
            mount();
        } catch {
            // mount() already recorded a diagnosable failure and restored the
            // native host. Continue startup on the legacy recovery surface.
        }
    }

    return Object.freeze({
        registry,
        mount,
        unmount,
        setMountedForDebug,
        isMounted: () => Boolean(shell),
        getShell: () => shell,
        getNavigation: () => navigation,
        getPlayHost: () => playHost,
        getWorkspaceHost: () => workspaceHost,
        getRoot: () => shell?.root || null,
        isRecoveryMode: () => recoveryMode,
    });
}
