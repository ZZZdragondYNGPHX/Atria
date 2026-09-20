/**
 * Atria Game Package manifest contract.
 *
 * R1 intentionally keeps the contract small. World/logic/UI declarations are
 * optional so a package can be discovered and activated before later runtime
 * phases are implemented. The package root is always game.json.
 */

export const GAME_PACKAGE_FORMAT = 'atria-game';
export const GAME_PACKAGE_MANIFEST_VERSION = 1;
export const GAME_RUNTIME_VERSION = 1;
export const GAME_MANIFEST_PATH = 'game.json';

export const GAME_UI_MODES = Object.freeze(['component', 'hybrid', 'full']);
export const GAME_PACKAGE_CAPABILITIES = Object.freeze([
    'chat.read',
    'chat.send',
    'chat.regenerate',
    'host.fullscreen',
    'audio',
    'clipboard',
    'network',
]);

const GAME_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const TOP_LEVEL_KEYS = new Set([
    'format',
    'manifestVersion',
    'id',
    'name',
    'description',
    'version',
    'runtime',
    'capabilities',
    'ui',
    'world',
    'logic',
]);
const UI_KEYS = new Set(['mode', 'entry']);
const WORLD_KEYS = new Set(['schema', 'initial']);
const LOGIC_KEYS = new Set(['entry']);
const RUNTIME_KEYS = new Set(['min', 'max']);

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateObjectKeys(value, allowed, path, errors) {
    if (!isPlainObject(value)) return;
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
            errors.push(`${path}: unexpected property '${key}'`);
        }
    }
}

/**
 * Normalize a package-local path. Unsafe/ambiguous paths return null.
 *
 * Game Package paths are always forward-slash relative paths. URLs, absolute
 * paths, dot segments, query/fragment suffixes and backslashes are rejected so
 * every runtime layer resolves the same file and path traversal is impossible.
 *
 * @param {unknown} input
 * @returns {string|null}
 */
export function normalizeGamePackagePath(input) {
    if (typeof input !== 'string') return null;
    const value = input.trim();
    if (!value) return null;
    if (value.includes('\\') || value.includes('\0') || value.includes('?') || value.includes('#')) return null;
    if (value.startsWith('/') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return null;
    const segments = value.split('/');
    if (segments.some(segment => !segment || segment === '.' || segment === '..')) return null;
    return segments.join('/');
}

function validatePathField(value, path, errors) {
    const normalized = normalizeGamePackagePath(value);
    if (!normalized) {
        errors.push(`${path}: expected a safe package-relative path`);
    }
    return normalized;
}

function validateRuntime(runtime, runtimeVersion, errors) {
    if (!isPlainObject(runtime)) {
        errors.push('runtime: expected object');
        return null;
    }
    validateObjectKeys(runtime, RUNTIME_KEYS, 'runtime', errors);

    const min = runtime.min;
    const max = runtime.max;
    if (!Number.isInteger(min) || min < 1) {
        errors.push('runtime.min: expected integer >= 1');
    }
    if (max !== undefined && (!Number.isInteger(max) || max < 1)) {
        errors.push('runtime.max: expected integer >= 1 when provided');
    }
    if (Number.isInteger(min) && Number.isInteger(max) && max < min) {
        errors.push('runtime.max: must be >= runtime.min');
    }
    if (Number.isInteger(min) && min > runtimeVersion) {
        errors.push(`runtime: package requires runtime >= ${min}, host is ${runtimeVersion}`);
    }
    if (Number.isInteger(max) && max < runtimeVersion) {
        errors.push(`runtime: package supports runtime <= ${max}, host is ${runtimeVersion}`);
    }

    return {
        min: Number.isInteger(min) ? min : null,
        ...(Number.isInteger(max) ? { max } : {}),
    };
}

function validateCapabilities(capabilities, errors) {
    if (capabilities === undefined) return [];
    if (!Array.isArray(capabilities)) {
        errors.push('capabilities: expected array');
        return [];
    }

    const allowed = new Set(GAME_PACKAGE_CAPABILITIES);
    const seen = new Set();
    const output = [];
    for (let index = 0; index < capabilities.length; index += 1) {
        const value = capabilities[index];
        if (typeof value !== 'string' || !value.trim()) {
            errors.push(`capabilities[${index}]: expected non-empty string`);
            continue;
        }

        const capability = value.trim();
        if (!allowed.has(capability)) {
            errors.push(`capabilities[${index}]: unsupported capability '${capability}'`);
            continue;
        }
        if (seen.has(capability)) {
            errors.push(`capabilities[${index}]: duplicate capability '${capability}'`);
            continue;
        }

        seen.add(capability);
        output.push(capability);
    }

    return output;
}

/**
 * Validate and normalize game.json.
 *
 * @param {unknown} input
 * @param {{runtimeVersion?: number}} [options]
 * @returns {{ok:boolean, errors:string[], manifest:object|null}}
 */
export function validateGameManifest(input, options = {}) {
    const runtimeVersion = Number.isInteger(options.runtimeVersion)
        ? options.runtimeVersion
        : GAME_RUNTIME_VERSION;
    const errors = [];

    if (!isPlainObject(input)) {
        return { ok: false, errors: ['manifest: expected object'], manifest: null };
    }

    validateObjectKeys(input, TOP_LEVEL_KEYS, 'manifest', errors);

    if (input.format !== GAME_PACKAGE_FORMAT) {
        errors.push(`format: expected '${GAME_PACKAGE_FORMAT}'`);
    }
    if (input.manifestVersion !== GAME_PACKAGE_MANIFEST_VERSION) {
        errors.push(`manifestVersion: expected ${GAME_PACKAGE_MANIFEST_VERSION}`);
    }

    const id = typeof input.id === 'string' ? input.id.trim() : '';
    if (!GAME_ID_PATTERN.test(id)) {
        errors.push('id: expected 1-64 lowercase characters matching [a-z0-9._-]');
    }

    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 120) {
        errors.push('name: expected non-empty string up to 120 characters');
    }

    const description = input.description === undefined
        ? ''
        : (typeof input.description === 'string' ? input.description.trim() : null);
    if (description === null || description.length > 1000) {
        errors.push('description: expected string up to 1000 characters');
    }

    const version = typeof input.version === 'string' ? input.version.trim() : '';
    if (!SEMVER_PATTERN.test(version)) {
        errors.push('version: expected semantic version such as 1.0.0');
    }

    const runtime = validateRuntime(input.runtime, runtimeVersion, errors);
    const capabilities = validateCapabilities(input.capabilities, errors);

    let ui;
    if (input.ui !== undefined) {
        if (!isPlainObject(input.ui)) {
            errors.push('ui: expected object');
        } else {
            validateObjectKeys(input.ui, UI_KEYS, 'ui', errors);
            const mode = typeof input.ui.mode === 'string' ? input.ui.mode.trim() : '';
            if (!GAME_UI_MODES.includes(mode)) {
                errors.push(`ui.mode: expected one of ${GAME_UI_MODES.join(', ')}`);
            }
            const entry = validatePathField(input.ui.entry, 'ui.entry', errors);
            ui = { mode, entry };
        }
    }

    let world;
    if (input.world !== undefined) {
        if (!isPlainObject(input.world)) {
            errors.push('world: expected object');
        } else {
            validateObjectKeys(input.world, WORLD_KEYS, 'world', errors);
            const schema = validatePathField(input.world.schema, 'world.schema', errors);
            const initial = validatePathField(input.world.initial, 'world.initial', errors);
            world = { schema, initial };
        }
    }

    let logic;
    if (input.logic !== undefined) {
        if (!isPlainObject(input.logic)) {
            errors.push('logic: expected object');
        } else {
            validateObjectKeys(input.logic, LOGIC_KEYS, 'logic', errors);
            const entry = validatePathField(input.logic.entry, 'logic.entry', errors);
            logic = { entry };
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors, manifest: null };
    }

    return {
        ok: true,
        errors: [],
        manifest: {
            format: GAME_PACKAGE_FORMAT,
            manifestVersion: GAME_PACKAGE_MANIFEST_VERSION,
            id,
            name,
            ...(description ? { description } : {}),
            version,
            runtime,
            capabilities,
            ...(ui ? { ui } : {}),
            ...(world ? { world } : {}),
            ...(logic ? { logic } : {}),
        },
    };
}

/**
 * Build a safe URL to a package file served by the existing character file
 * transport. This resolver is intentionally independent from CardApp runtime
 * activation.
 *
 * @param {string} charId
 * @param {string} relativePath
 * @returns {string}
 */
export function resolveGamePackageAssetUrl(charId, relativePath) {
    const id = String(charId || '').trim();
    const normalizedPath = normalizeGamePackagePath(relativePath);
    if (!id || id.includes('/') || id.includes('\\')) {
        throw new Error('Invalid character package id');
    }
    if (!normalizedPath) {
        throw new Error(`Invalid Game Package path: ${String(relativePath ?? '')}`);
    }

    const encodedPath = normalizedPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
    return `/api/card-app/${encodeURIComponent(id)}/${encodedPath}`;
}
