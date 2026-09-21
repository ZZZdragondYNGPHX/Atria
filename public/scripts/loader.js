import { loader, getActiveLoaderHandles } from './action-loader.js';

/**
 * Handle for the legacy loader created by showLoader().
 * @type {import('./action-loader.js').ActionLoaderHandle|null}
 */
let legacyLoaderHandle = null;

export function isLoaderVisible() {
    return getActiveLoaderHandles().length > 0 || !!document.getElementById('preloader');
}

/**
 * Shows the loader overlay.
 *
 * @deprecated Use `showActionLoader()` from action-loader.js instead.
 * This function now creates a blocking action loader with no toast.
 * The new system supports stacking multiple loaders and provides better control.
 *
 * @example
 * // New recommended approach:
 * import { showActionLoader } from './action-loader.js';
 * const handle = showActionLoader({ message: 'Loading...' });
 * // ... do work ...
 * handle.hide();
 */
export function showLoader() {
    // Hide any existing legacy loader first to maintain old behavior
    if (legacyLoaderHandle && legacyLoaderHandle.isActive) {
        legacyLoaderHandle.hide();
    }

    // Create a blocking loader with no toast (matches old behavior)
    legacyLoaderHandle = loader.show({
        slug: 'legacy-loader',
        blocking: true,
        toastMode: loader.ToastMode.NONE,
    });
}

/**
 * Hides the loader overlay.
 *
 * @deprecated Use `hideActionLoader()` or `handle.hide()` from action-loader.js instead.
 * This function now hides the legacy loader created by showLoader().
 *
 * @example
 * // New recommended approach:
 * import { showActionLoader } from './action-loader.js';
 * const handle = showActionLoader({ message: 'Loading...' });
 * // ... do work ...
 * await handle.hide();
 *
 * @param {object} [options] Hide options.
 * @param {boolean} [options.immediate=false] Skip the visual fade-out transition.
 * @returns {Promise<void>}
 */
export async function hideLoader({ immediate = false } = {}) {
    // #preloader is only the static first-paint cover from index.html.
    // Dismiss it as soon as startup explicitly asks to hide the loader;
    // its lifetime must not depend on Popup animation/handle bookkeeping.
    document.getElementById('preloader')?.remove();

    if (!legacyLoaderHandle || !legacyLoaderHandle.isActive) {
        console.warn('There is no loader showing to hide');
        return Promise.resolve();
    }

    await legacyLoaderHandle.hide({ immediate });
    legacyLoaderHandle = null;
}
