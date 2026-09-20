import {
    GAME_MANIFEST_PATH,
    GAME_RUNTIME_VERSION,
    getGamePackageDeclaredFiles,
    resolveGamePackageAssetUrl,
    resolveGamePackageInventoryUrl,
    validateGameManifest,
} from './manifest.js';

export const GAME_PACKAGE_STATUS = Object.freeze({
    NONE: 'none',
    READY: 'ready',
    INVALID: 'invalid',
    ERROR: 'error',
});

async function validateDeclaredPackageFiles(charId, manifest, fetchImpl, headers) {
    const declaredFiles = getGamePackageDeclaredFiles(manifest);
    if (declaredFiles.length === 0) {
        return { ok: true, errors: [] };
    }

    let response;
    try {
        response = await fetchImpl(resolveGamePackageInventoryUrl(charId), {
            headers,
            cache: 'no-store',
        });
    } catch (error) {
        return {
            ok: false,
            transport: true,
            errors: [`Failed to list Game Package files: ${error?.message || String(error)}`],
        };
    }

    if (!response?.ok) {
        return {
            ok: false,
            transport: true,
            errors: [`Failed to list Game Package files: HTTP ${response?.status ?? 'unknown'}`],
        };
    }

    let body;
    try {
        body = await response.json();
    } catch (error) {
        return {
            ok: false,
            transport: true,
            errors: [`Game Package file inventory is invalid JSON: ${error?.message || String(error)}`],
        };
    }

    const files = Array.isArray(body?.files)
        ? new Set(body.files
            .filter(item => item?.type === 'file' && typeof item?.path === 'string')
            .map(item => item.path))
        : new Set();

    const errors = declaredFiles
        .filter(path => !files.has(path))
        .map(path => `Game Package declares missing file '${path}'`);

    return { ok: errors.length === 0, errors, transport: false };
}

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

export async function loadGamePackageJsonResource(charId, relativePath, options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
        throw new Error('Game Package resource loader has no fetch implementation');
    }

    const url = resolveGamePackageAssetUrl(charId, relativePath);
    let response;
    try {
        response = await fetchImpl(url, {
            headers: options.headers || {},
            cache: 'no-store',
        });
    } catch (error) {
        throw new Error('Failed to fetch Game Package resource ' + relativePath + ': ' + (error?.message || String(error)));
    }

    if (!response?.ok) {
        throw new Error('Failed to fetch Game Package resource ' + relativePath + ': HTTP ' + (response?.status ?? 'unknown'));
    }

    try {
        return await response.json();
    } catch (error) {
        throw new Error('Game Package resource ' + relativePath + ' is not valid JSON: ' + (error?.message || String(error)));
    }
}

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

    const declaredFiles = await validateDeclaredPackageFiles(
        id,
        validated.manifest,
        fetchImpl,
        options.headers || {},
    );
    if (!declaredFiles.ok) {
        return {
            status: declaredFiles.transport ? GAME_PACKAGE_STATUS.ERROR : GAME_PACKAGE_STATUS.INVALID,
            active: false,
            charId: id,
            manifest: null,
            errors: declaredFiles.errors,
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
