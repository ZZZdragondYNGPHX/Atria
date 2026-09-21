import {
    ATRIA_SHELL_PREVIEW_QUERY_KEY,
    ATRIA_SHELL_PREVIEW_STORAGE_KEY,
} from './constants.js';
import { createAtriaAppShell } from './app-shell.js';
import { createCommandRegistry } from './command-registry.js';
import { mountNativePlayHost } from './native-play-host.js';

function readPreviewPreference(windowRef) {
    try {
        const params = new URLSearchParams(windowRef.location?.search || '');
        const queryValue = params.get(ATRIA_SHELL_PREVIEW_QUERY_KEY);
        if (queryValue === '1' || queryValue === 'true') return true;
        if (queryValue === '0' || queryValue === 'false') return false;
    } catch {
        // Ignore malformed or unavailable location objects.
    }

    try {
        const stored = windowRef.localStorage?.getItem(ATRIA_SHELL_PREVIEW_STORAGE_KEY);
        return stored === '1' || stored === 'true';
    } catch {
        return false;
    }
}

export function initializeAtriaShellFoundation({
    document: documentRef = globalThis.document,
    window: windowRef = globalThis.window,
    translate,
    utilities,
    forcePreview,
} = {}) {
    if (!documentRef?.body || !windowRef) {
        throw new Error('Atria shell foundation requires document and window');
    }

    const registry = createCommandRegistry();
    let shell = null;
    let playHost = null;
    let previewEnabled = forcePreview === undefined
        ? readPreviewPreference(windowRef)
        : Boolean(forcePreview);

    function mount() {
        if (shell) return shell;
        shell = createAtriaAppShell({
            document: documentRef,
            window: windowRef,
            registry,
            translate,
            utilities,
        });
        try {
            playHost = mountNativePlayHost({
                document: documentRef,
                stage: shell.slots.stage,
            });
        } catch (error) {
            shell.destroy();
            shell = null;
            throw error;
        }
        documentRef.body.dataset.atriaShellPreview = 'true';
        return shell;
    }

    function unmount() {
        if (!shell) return false;
        playHost?.unmount();
        playHost = null;
        shell.destroy();
        shell = null;
        delete documentRef.body.dataset.atriaShellPreview;
        return true;
    }

    function setPreviewEnabled(enabled, { persist = true } = {}) {
        const next = Boolean(enabled);
        previewEnabled = next;
        if (persist) {
            try {
                windowRef.localStorage?.setItem(
                    ATRIA_SHELL_PREVIEW_STORAGE_KEY,
                    next ? '1' : '0',
                );
            } catch {
                // Storage may be unavailable in privacy-restricted contexts.
            }
        }
        if (next) return mount();
        unmount();
        return null;
    }

    if (previewEnabled) mount();

    return Object.freeze({
        registry,
        mount,
        unmount,
        setPreviewEnabled,
        isMounted: () => Boolean(shell),
        getShell: () => shell,
        getPlayHost: () => playHost,
        getRoot: () => shell?.root || null,
        isPreviewEnabled: () => previewEnabled,
    });
}
