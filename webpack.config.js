import process from 'node:process';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import isDocker from 'is-docker';
import { serverDirectory } from './src/server-directory.js';
import { color } from './src/util.js';

const require = createRequire(import.meta.url);

// Webpack output only depends on the library entrypoints, installed dependency
// graph, Webpack itself and the bundle configuration. Using the whole Atria
// Git revision here made every unrelated application commit invalidate the
// frontend bundles and forced a 10-20 second mobile rebuild on first launch.
//
// Keep this list intentionally narrow and explicit. Changes to any entry file,
// package-lock, Webpack version or the explicit bundle schema version produce a
// new fingerprint. Cache-routing/logging edits must not invalidate bundle bytes.
const webpackVersion = require('webpack/package.json').version;
const WEBPACK_BUNDLE_SCHEMA_VERSION = '2';
export const WEBPACK_BUNDLE_ENTRIES = Object.freeze({
    'atria-script.bundle': 'public/scripts/native/frontend/script-worker.js',
    'lib.core.bundle': 'public/lib-bundle-core.js',
    'lib.optional.bundle': 'public/lib-bundle-optional.js',
    'lib.webllm.bundle': 'public/lib-bundle-webllm.js',
    'codemirror.bundle': 'public/lib-bundle-codemirror.js',
});
export const WEBPACK_BUNDLE_FILES = Object.freeze(Object.keys(WEBPACK_BUNDLE_ENTRIES).map(name => name + '.js'));
// Follow repository-local literals in the five entry graphs. Dependencies in
// node_modules are pinned by package-lock; transitive local inputs are not.
export function getWebpackBundleInputFiles() {
    const visited = new Set([path.join(serverDirectory, 'package-lock.json')]);
    const pending = Object.values(WEBPACK_BUNDLE_ENTRIES).map(file => path.join(serverDirectory, file));
    while (pending.length) {
        const file = pending.pop(); if (visited.has(file)) continue; visited.add(file);
        const source = fs.readFileSync(file, 'utf8');
        const imports = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|\bnew\s+URL\s*\(\s*)['"](\.[^'"]+)['"]/g;
        for (const match of source.matchAll(imports)) {
            const dependency = path.resolve(path.dirname(file), match[1]);
            if (!dependency.startsWith(serverDirectory + path.sep)) throw new Error('Bundle input escapes repository');
            pending.push(dependency);
        }
    }
    return [...visited].sort((a, b) => a.localeCompare(b));
}

let cachedWebpackCacheVersion = null;

/**
 * Generate the frontend bundle cache key from inputs that can actually affect
 * emitted bundle bytes. Unrelated Atria source commits therefore retain the
 * same output directory and warm-start instantly.
 *
 * @returns {string} Stable content fingerprint for the current bundle inputs.
 */
export function getWebpackCacheVersion() {
    if (cachedWebpackCacheVersion) {
        return cachedWebpackCacheVersion;
    }

    const hash = crypto.createHash('shake256', { outputLength: 8 });
    hash.update(`webpack:${webpackVersion}\0bundle-schema:${WEBPACK_BUNDLE_SCHEMA_VERSION}\0`);

    for (const filePath of getWebpackBundleInputFiles()) {
        hash.update(path.relative(serverDirectory, filePath).split(path.sep).join('/'));
        hash.update('\0');
        hash.update(fs.readFileSync(filePath));
        hash.update('\0');
    }

    cachedWebpackCacheVersion = hash.digest('hex');
    return cachedWebpackCacheVersion;
}

/**
 * Prune old Webpack cache directories that do not match the current cache version.
 * @param {string} webpackRoot The root directory where Webpack caches are stored.
 * @param {string} currentCacheVersion The current cache version to keep.
 */
function pruneWebpackCache(webpackRoot, currentCacheVersion) {
    try {
        if (!fs.existsSync(webpackRoot)) {
            return;
        }

        const cacheDirectories = fs.readdirSync(webpackRoot, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        for (const dir of cacheDirectories) {
            const dirPath = path.join(webpackRoot, dir);
            if (dir !== currentCacheVersion) {
                try {
                    fs.rmSync(dirPath, { recursive: true, force: true });
                    console.debug(`Removed outdated cache directory: ${color.yellow(dir)}`);
                } catch (error) {
                    console.error(`Failed to remove Webpack cache directory: ${color.red(dir)}`, error);
                }
            }
        }
    } catch (error) {
        console.error('Failed to read Webpack cache directories for pruning.', error);
    }
}


/**
 * Detect a Termux process without relying on the launcher to inject Atria-
 * specific environment variables.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isTermuxRuntime(env = process.env) {
    const prefix = String(env.PREFIX || '').toLowerCase();
    const home = String(env.HOME || '').toLowerCase();
    return prefix.includes('com.termux') || home.includes('/com.termux/');
}

/**
 * Resolve the root used for frontend Webpack cache/output.
 *
 * forceDataRoot is used only for migrating legacy shared-storage cache into
 * the new Termux-private cache. Normal callers should leave it false.
 *
 * @param {object} [options]
 * @param {boolean} [options.forceDist=false]
 * @param {boolean} [options.forceDataRoot=false]
 * @returns {{ root: string, source: 'dist'|'env'|'termux-private'|'dataRoot' }}
 */
export function getWebpackRootInfo({ forceDist = false, forceDataRoot = false } = {}) {
    if (forceDist || isDocker()) {
        return { root: path.resolve(process.cwd(), 'dist', '_webpack'), source: 'dist' };
    }

    if (forceDataRoot) {
        if (typeof globalThis.DATA_ROOT === 'string') {
            return { root: path.resolve(globalThis.DATA_ROOT, '_webpack'), source: 'dataRoot' };
        }
        throw new Error('DATA_ROOT variable is not set.');
    }

    const explicitCacheRoot = String(process.env.ATRIA_WEBPACK_CACHE_ROOT || '').trim();
    if (explicitCacheRoot) {
        return { root: path.resolve(explicitCacheRoot), source: 'env' };
    }

    if (isTermuxRuntime()) {
        const home = String(process.env.HOME || '').trim();
        if (home) {
            return { root: path.resolve(home, '.cache', 'atria-webpack'), source: 'termux-private' };
        }
    }

    if (typeof globalThis.DATA_ROOT === 'string') {
        return { root: path.resolve(globalThis.DATA_ROOT, '_webpack'), source: 'dataRoot' };
    }

    throw new Error('DATA_ROOT variable is not set.');
}
/**
 * Get the Webpack configuration for the bundled frontend library chunks.
 * 1. Docker has got cache and the output file pre-baked.
 * 2. Non-Docker environments use the global DATA_ROOT variable to determine the cache and output directories.
 * @param {object} options Configuration options.
 * @param {boolean} [options.forceDist=false] Whether to force the use the /dist folder.
 * @param {boolean} [options.pruneCache=false] Whether to prune old cache directories.
 * @param {boolean} [options.forceDataRoot=false] Force legacy DATA_ROOT/_webpack resolution.
 * @returns {import('webpack').Configuration}
 * @throws {Error} If the DATA_ROOT variable is not set.
 * */
export default function getPublicLibConfig({ forceDist = false, pruneCache = false, forceDataRoot = false } = {}) {
    function getCacheDirectory() {
        return path.join(webpackRoot, cacheVersion, 'cache');
    }

    function getOutputDirectory() {
        return path.join(webpackRoot, cacheVersion, 'output');
    }

    const { root: webpackRoot } = getWebpackRootInfo({ forceDist, forceDataRoot });
    const cacheVersion = getWebpackCacheVersion();
    const cacheDirectory = getCacheDirectory();
    const outputDirectory = getOutputDirectory();

    if (pruneCache) {
        pruneWebpackCache(webpackRoot, cacheVersion);
    }

    return {
        mode: 'production',
        entry: Object.fromEntries(Object.entries(WEBPACK_BUNDLE_ENTRIES).map(([name, file]) => [name, path.join(serverDirectory, file)])),
        cache: {
            type: 'filesystem',
            cacheDirectory: cacheDirectory,
            store: 'pack',
            compression: 'gzip',
        },
        devtool: false,
        watch: false,
        module: { rules: [{ test: /node_modules[\\/](?:@jitl|quickjs-emscripten-core)[\\/]/, parser: { dynamicImportMode: 'eager' } }] },
        stats: {
            preset: 'minimal',
            assets: false,
            modules: false,
            colors: true,
            timings: true,
        },
        experiments: {
            outputModule: true,
        },
        performance: {
            hints: false,
        },
        output: {
            path: outputDirectory,
            filename: '[name].js',
            clean: true,
            libraryTarget: 'module',
        },
    };
}
