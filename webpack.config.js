import process from 'node:process';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import isDocker from 'is-docker';
import { serverDirectory } from './src/server-directory.js';
import { color } from './src/util.js';

const require = createRequire(import.meta.url);

// Keep cache-version calculation on the startup fast path: reading package
// metadata and Git refs from disk is much cheaper than spawning several `git`
// subprocesses on every Termux launch.
const webpackVersion = require('webpack/package.json').version;
const packageVersion = require('./package.json').version;

function resolveGitDirectory() {
    const dotGit = path.join(serverDirectory, '.git');
    try {
        const stat = fs.statSync(dotGit);
        if (stat.isDirectory()) return dotGit;
        if (!stat.isFile()) return null;
        const pointer = fs.readFileSync(dotGit, 'utf8').trim();
        if (!pointer.startsWith('gitdir:')) return null;
        return path.resolve(serverDirectory, pointer.slice('gitdir:'.length).trim());
    } catch {
        return null;
    }
}

function readRefFromGitDirectory(gitDirectory, refName) {
    const candidates = [gitDirectory];
    try {
        const commonDir = fs.readFileSync(path.join(gitDirectory, 'commondir'), 'utf8').trim();
        if (commonDir) candidates.push(path.resolve(gitDirectory, commonDir));
    } catch {
        // Ordinary repositories do not have a commondir file.
    }

    for (const root of candidates) {
        try {
            const value = fs.readFileSync(path.join(root, refName), 'utf8').trim();
            if (value) return value;
        } catch {
            // Fall through to packed-refs.
        }

        try {
            const packed = fs.readFileSync(path.join(root, 'packed-refs'), 'utf8');
            for (const line of packed.split(/\r?\n/)) {
                if (!line || line.startsWith('#') || line.startsWith('^')) continue;
                const [sha, name] = line.trim().split(/\s+/, 2);
                if (name === refName && sha) return sha;
            }
        } catch {
            // No packed refs in this git directory.
        }
    }

    return null;
}

export function readLocalGitRevision() {
    const gitDirectory = resolveGitDirectory();
    if (!gitDirectory) return null;

    try {
        const head = fs.readFileSync(path.join(gitDirectory, 'HEAD'), 'utf8').trim();
        if (/^[0-9a-f]{40}$/i.test(head)) return head;
        if (!head.startsWith('ref:')) return null;
        return readRefFromGitDirectory(gitDirectory, head.slice('ref:'.length).trim());
    } catch {
        return null;
    }
}

const gitRevision = readLocalGitRevision();

/**
 * Generate a cache version string based on the application version, local Git
 * revision, and Webpack version.
 * @returns {string} The cache version string.
 */
function getWebpackCacheVersion() {
    return crypto.createHash('shake256', { outputLength: 8 })
        .update(JSON.stringify([packageVersion, gitRevision, webpackVersion]))
        .digest('hex');
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
 * Get the Webpack configuration for the bundled frontend library chunks.
 * 1. Docker has got cache and the output file pre-baked.
 * 2. Non-Docker environments use the global DATA_ROOT variable to determine the cache and output directories.
 * @param {object} options Configuration options.
 * @param {boolean} [options.forceDist=false] Whether to force the use the /dist folder.
 * @param {boolean} [options.pruneCache=false] Whether to prune old cache directories.
 * @returns {import('webpack').Configuration}
 * @throws {Error} If the DATA_ROOT variable is not set.
 * */
export default function getPublicLibConfig({ forceDist = false, pruneCache = false } = {}) {
    function getWebpackRoot() {
        if (forceDist || isDocker()) {
            return path.resolve(process.cwd(), 'dist', '_webpack');
        }

        if (typeof globalThis.DATA_ROOT === 'string') {
            return path.resolve(globalThis.DATA_ROOT, '_webpack');
        }

        throw new Error('DATA_ROOT variable is not set.');
    }

    function getCacheDirectory() {
        return path.join(webpackRoot, cacheVersion, 'cache');
    }

    function getOutputDirectory() {
        return path.join(webpackRoot, cacheVersion, 'output');
    }

    const webpackRoot = getWebpackRoot();
    const cacheVersion = getWebpackCacheVersion();
    const cacheDirectory = getCacheDirectory();
    const outputDirectory = getOutputDirectory();

    if (pruneCache) {
        pruneWebpackCache(webpackRoot, cacheVersion);
    }

    return {
        mode: 'production',
        entry: {
            'lib.core.bundle': path.join(serverDirectory, 'public/lib-bundle-core.js'),
            'lib.optional.bundle': path.join(serverDirectory, 'public/lib-bundle-optional.js'),
            'codemirror.bundle': path.join(serverDirectory, 'public/lib-bundle-codemirror.js'),
        },
        cache: {
            type: 'filesystem',
            cacheDirectory: cacheDirectory,
            store: 'pack',
            compression: 'gzip',
        },
        devtool: false,
        watch: false,
        module: {},
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
