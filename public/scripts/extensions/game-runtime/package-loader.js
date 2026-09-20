import {
    GAME_MANIFEST_PATH,
    GAME_RUNTIME_VERSION,
    resolveGamePackageAssetUrl,
    validateGameManifest,
} from './manifest.js';

export const GAME_PACKAGE_STATUS = Object.freeze({
    NONE: 'none',
    READY: 'ready',
    INVALID: 'invalid',
    ERROR: 'error',
});

/**
 * Discover and validate the Game Package rooted at game.json.
 *
 * A missing manifest is not an error: the current character simply has no Game
 * Package. Invalid or incompatible manifests never activate, leaving the host
 * UI untouched as the recovery shell.
 *
 * @param {string} charId
 * @param {{fetchImpl?:Function, headers?:object, runtimeVersion?:number}} [options]
 * @returns {Promise<object>}
 */
export async function loadGamePackage(charId, options = {}) {
    const id = String(charId || '').trim();
    if (!id) {
        return {
            status: GAME_PACKAGE_STATUS.NONE,
            active: false,
            charId: '',
            manifest: null,
            errors: [],
        };
    }

    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
        return {
            status: GAME_PACKAGE_STATUS.ERROR,
            active: false,
            charId: id,
            manifest: null,
            errors: ['Game Package loader has no fetch implementation'],
        };
    }

    const manifestUrl = resolveGamePackageAssetUrl(id, GAME_MANIFEST_PATH);
    let response;
    try {
        response = await fetchImpl(manifestUrl, {
            headers: options.headers || {},
            cache: 'no-store',
        });
    } catch (error) {
        return {
            status: GAME_PACKAGE_STATUS.ERROR,
            active: false,
            charId: id,
            manifest: null,
            errors: [`Failed to fetch game.json: ${error?.message || String(error)}`],
        };
    }

    if (response?.status === 404) {
        return {
            status: GAME_PACKAGE_STATUS.NONE,
            active: false,
            charId: id,
            manifest: null,
            errors: [],
        };
    }

    if (!response?.ok) {
        return {
            status: GAME_PACKAGE_STATUS.ERROR,
            active: false,
            charId: id,
            manifest: null,
            errors: [`Failed to fetch game.json: HTTP ${response?.status ?? 'unknown'}`],
        };
    }

    let rawManifest;
    try {
        rawManifest = await response.json();
    } catch (error) {
        return {
            status: GAME_PACKAGE_STATUS.INVALID,
            active: false,
            charId: id,
            manifest: null,
            errors: [`game.json is not valid JSON: ${error?.message || String(error)}`],
        };
    }

    const validated = validateGameManifest(rawManifest, {
        runtimeVersion: options.runtimeVersion ?? GAME_RUNTIME_VERSION,
    });
    if (!validated.ok) {
        return {
            status: GAME_PACKAGE_STATUS.INVALID,
            active: false,
            charId: id,
            manifest: null,
            errors: validated.errors,
        };
    }

    return {
        status: GAME_PACKAGE_STATUS.READY,
        active: true,
        charId: id,
        manifest: validated.manifest,
        manifestUrl,
        errors: [],
    };
}
