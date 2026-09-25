import fs from 'node:fs';
import path from 'node:path';
import getPublicLibConfig, { getWebpackBundleInputFiles, getWebpackRootInfo } from '../../webpack.config.js';
import { markStartupMilestone } from '../startup-timing.js';

// Pre-built bundles shipped by the packager (Android APK, etc.) skip the
// in-process Webpack compile entirely. The directory must contain the three
// entry bundles listed below; any missing file falls back to the normal
// compile path so a partial bundle ship never silently serves a stale lib.
const PREBUILT_BUNDLE_FILES = ['lib.core.bundle.js', 'lib.optional.bundle.js', 'codemirror.bundle.js', 'lib.webllm.bundle.js'];

/**
 * Returns true when every bundle expected by the current Webpack config
 * already exists in that config's versioned output directory.
 *
 * The output path is content-addressed from the actual frontend bundle inputs
 * (see webpack.config.js), so a hit is safe to reuse across normal restarts
 * and unrelated Atria code updates without recompiling.
 *
 * @param {import('webpack').Configuration} config Webpack configuration.
 * @returns {boolean} Whether all expected output bundles are present.
 */
export function hasCompleteWebpackOutput(config) {
    const outputPath = config?.output?.path;
    if (!outputPath) return false;

    const files = Object.keys(config.entry || {}).map((entryName) => `${entryName}.js`);
    if (files.length === 0) return false;

    return files.every((name) => {
        const filePath = path.join(outputPath, name);
        try {
            const stat = fs.statSync(filePath);
            return stat.isFile() && stat.size > 0;
        } catch {
            return false;
        }
    });
}


function getOutputFileNames(config) {
    return Object.keys(config.entry || {}).map((entryName) => `${entryName}.js`);
}

function getNewestInputMtimeMs() {
    let newest = 0;
    for (const filePath of getWebpackBundleInputFiles()) {
        try {
            newest = Math.max(newest, fs.statSync(filePath).mtimeMs);
        } catch {
            return Number.POSITIVE_INFINITY;
        }
    }
    return newest;
}

function isOutputFreshForCurrentInputs(config) {
    if (!hasCompleteWebpackOutput(config)) return false;
    const outputPath = config.output.path;
    const newestInput = getNewestInputMtimeMs();
    let oldestOutput = Number.POSITIVE_INFINITY;

    for (const name of getOutputFileNames(config)) {
        try {
            oldestOutput = Math.min(oldestOutput, fs.statSync(path.join(outputPath, name)).mtimeMs);
        } catch {
            return false;
        }
    }

    // Allow coarse filesystem timestamp resolution while still rejecting
    // outputs that clearly predate an entry/package-lock change.
    return oldestOutput + 1000 >= newestInput;
}

/**
 * Copy a still-fresh legacy DATA_ROOT/_webpack output into the automatic
 * Termux-private cache. This avoids one final 10-20s rebuild when upgrading
 * from the old shared-storage cache layout.
 *
 * @param {import('webpack').Configuration} targetConfig
 * @returns {string|null} Legacy source directory when migration succeeded.
 */
export function migrateLegacyWebpackOutput(targetConfig) {
    try {
        const rootInfo = getWebpackRootInfo();
        if (rootInfo.source !== 'termux-private' || !globalThis.DATA_ROOT) return null;

        const legacyRoot = getWebpackRootInfo({ forceDataRoot: true }).root;
        if (path.resolve(legacyRoot) === path.resolve(rootInfo.root) || !fs.existsSync(legacyRoot)) {
            return null;
        }

        const candidates = fs.readdirSync(legacyRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => {
                const outputPath = path.join(legacyRoot, entry.name, 'output');
                const candidate = {
                    ...targetConfig,
                    output: { ...targetConfig.output, path: outputPath },
                };
                let newestBundleMtime = 0;
                if (isOutputFreshForCurrentInputs(candidate)) {
                    for (const name of getOutputFileNames(candidate)) {
                        newestBundleMtime = Math.max(newestBundleMtime, fs.statSync(path.join(outputPath, name)).mtimeMs);
                    }
                    return { outputPath, candidate, newestBundleMtime };
                }
                return null;
            })
            .filter(Boolean)
            .sort((a, b) => b.newestBundleMtime - a.newestBundleMtime);

        const source = candidates[0];
        if (!source) return null;

        fs.mkdirSync(targetConfig.output.path, { recursive: true });
        for (const name of getOutputFileNames(targetConfig)) {
            fs.copyFileSync(
                path.join(source.outputPath, name),
                path.join(targetConfig.output.path, name),
            );
        }

        return hasCompleteWebpackOutput(targetConfig) ? source.outputPath : null;
    } catch (error) {
        console.warn('[startup] frontend-cache legacy migration skipped:', error?.message || error);
        return null;
    }
}

// Resolved once at module load: ATRIA_PREBUILT_BUNDLES_DIR is set by the
// packager before server.js is imported and never changes at runtime. Caching
// avoids 4 fs.existsSync syscalls per bundle request on slow Android flash.
const prebuiltBundleDir = (() => {
    const raw = process.env.ATRIA_PREBUILT_BUNDLES_DIR;
    if (!raw) return null;
    const trimmed = String(raw).trim();
    if (!trimmed) return null;
    if (!fs.existsSync(trimmed)) return null;
    const allPresent = PREBUILT_BUNDLE_FILES.every((name) => fs.existsSync(path.join(trimmed, name)));
    return allPresent ? trimmed : null;
})();

export default function getWebpackServeMiddleware() {
    /**
     * A very spartan recreation of webpack-dev-middleware.
     * @param {import('express').Request} req Request object.
     * @param {import('express').Response} res Response object.
     * @param {import('express').NextFunction} next Next function.
     * @type {import('express').RequestHandler}
     */
    function devMiddleware(req, res, next) {
        const parsedPath = path.parse(req.path);
        const requestedFile = parsedPath.base;

        if (req.method === 'GET' && parsedPath.dir === '/' && PREBUILT_BUNDLE_FILES.includes(requestedFile)) {
            if (prebuiltBundleDir) {
                return res.sendFile(requestedFile, { root: prebuiltBundleDir });
            }
        }

        const publicLibConfig = getPublicLibConfig();
        const outputPath = publicLibConfig.output?.path;
        const outputFiles = new Set(Object.keys(publicLibConfig.entry || {}).map((entryName) => `${entryName}.js`));
        const requestedPath = outputPath && requestedFile
            ? path.join(outputPath, requestedFile)
            : null;

        if (req.method === 'GET' && parsedPath.dir === '/' && outputFiles.has(requestedFile) && requestedPath && fs.existsSync(requestedPath)) {
            return res.sendFile(requestedFile, { root: outputPath });
        }

        next();
    }

    /**
     * Wait until Webpack is done compiling.
     * @param {object} param Parameters.
     * @param {boolean} [param.forceDist=false] Whether to force the use the /dist folder.
     * @param {boolean} [param.pruneCache=false] Whether to prune old cache directories before compiling.
     * @param {boolean} [param.forceCompile=false] Rebuild even when the current versioned output already exists.
     * @returns {Promise<void>}
     */
    devMiddleware.runWebpackCompiler = async ({ forceDist = false, pruneCache = false, forceCompile = false } = {}) => {
        if (prebuiltBundleDir && !forceCompile) {
            console.log();
            console.log(`[startup] frontend-cache source=prebuilt root=${prebuiltBundleDir} hit=true`);
            console.log(`Using pre-built frontend bundles from ${prebuiltBundleDir}`);
            markStartupMilestone('frontend.cache.ready', 'source=prebuilt');
            return;
        }

        const publicLibConfig = getPublicLibConfig({ forceDist, pruneCache });
        const outputPath = publicLibConfig.output?.path || '';
        const cacheVersionDir = outputPath ? path.dirname(outputPath) : '';
        const cacheKey = cacheVersionDir ? path.basename(cacheVersionDir) : 'unknown';
        const cacheRootInfo = getWebpackRootInfo({ forceDist });
        let cacheHit = !forceCompile && hasCompleteWebpackOutput(publicLibConfig);
        let migratedFrom = null;

        if (!cacheHit && !forceCompile && cacheRootInfo.source === 'termux-private') {
            migratedFrom = migrateLegacyWebpackOutput(publicLibConfig);
            cacheHit = Boolean(migratedFrom) && hasCompleteWebpackOutput(publicLibConfig);
        }

        console.log();
        console.log(`[startup] frontend-cache source=${cacheRootInfo.source} root=${cacheRootInfo.root} key=${cacheKey} hit=${cacheHit}`);
        if (migratedFrom) {
            console.log(`[startup] frontend-cache migrated-from=${migratedFrom}`);
        }
        markStartupMilestone('frontend.cache.checked', `source=${cacheRootInfo.source} hit=${cacheHit}`);

        if (cacheHit) {
            console.log(`Using cached frontend bundles from ${publicLibConfig.output.path}`);
            return;
        }

        console.log();
        console.log('Compiling frontend libraries...');

        // Webpack pulls in ~7 MB of code at parse time. Defer to here so warm
        // starts that already have version-matched bundles never pay for the
        // compiler import or compilation itself.
        const importStartedAt = Date.now();
        const { default: webpack } = await import('webpack');
        console.log(`[startup] phase webpack.import ${Date.now() - importStartedAt}ms`);
        const compiler = webpack(publicLibConfig);
        const compilerRunStartedAt = Date.now();

        return new Promise((resolve) => {
            compiler.run((_error, stats) => {
                console.log(`[startup] phase webpack.compiler-run ${Date.now() - compilerRunStartedAt}ms`);
                const output = stats?.toString(publicLibConfig.stats);
                if (output) {
                    console.log(output);
                    console.log();
                }
                const compilerCloseStartedAt = Date.now();
                compiler.close(() => {
                    console.log(`[startup] phase webpack.compiler-close ${Date.now() - compilerCloseStartedAt}ms`);
                    markStartupMilestone('frontend.cache.ready', 'source=compiled');
                    resolve();
                });
            });
        });
    };

    return devMiddleware;
}
