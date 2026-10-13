import fs from 'node:fs';
import path from 'node:path';
import getPublicLibConfig, { getWebpackRootInfo, WEBPACK_BUNDLE_FILES } from '../../webpack.config.js';
import { inspectWebpackOutput, writeWebpackManifest, WEBPACK_MANIFEST_FILE } from './webpack-manifest.js';
import { markStartupMilestone } from '../startup-timing.js';

// Pre-built bundles shipped by the packager (Android APK, etc.) skip the
// in-process Webpack compile entirely. The directory must contain all expected
// entry bundles listed below; any missing file falls back to the normal
// compile path so a partial bundle ship never silently serves a stale lib.
const PREBUILT_BUNDLE_FILES = WEBPACK_BUNDLE_FILES;

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
                if (inspectWebpackOutput(candidate).valid) {
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
        for (const name of [...getOutputFileNames(targetConfig), WEBPACK_MANIFEST_FILE]) {
            fs.copyFileSync(
                path.join(source.outputPath, name),
                path.join(targetConfig.output.path, name),
            );
        }

        return inspectWebpackOutput(targetConfig).valid ? source.outputPath : null;
    } catch (error) {
        console.warn('[startup] frontend-cache legacy migration skipped:', error?.message || error);
        return null;
    }
}

export default function getWebpackServeMiddleware() {
    let prebuiltBundleDir = null, verifiedOutputPath = null;
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
        const outputPath = verifiedOutputPath;
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
        prebuiltBundleDir = null; verifiedOutputPath = null;
        const prebuilt = String(process.env.ATRIA_PREBUILT_BUNDLES_DIR ?? '').trim();
        if (prebuilt && !forceCompile) {
            const config = getPublicLibConfig({ forceDist });
            const inspection = inspectWebpackOutput({ ...config, output: { ...config.output, path: prebuilt } });
            if (inspection.valid) prebuiltBundleDir = path.resolve(prebuilt);
            else console.warn('[startup] frontend-cache prebuilt rejected reason=' + inspection.reason);
        }
        if (prebuiltBundleDir && !forceCompile) {
            console.log();
            console.log(`[startup] frontend-cache source=prebuilt root=${prebuiltBundleDir} hit=true`);
            console.log(`Using pre-built frontend bundles from ${prebuiltBundleDir}`);
            markStartupMilestone('frontend.cache.ready', 'source=prebuilt');
            return { source: 'prebuilt', outputPath: prebuiltBundleDir };
        }

        const publicLibConfig = getPublicLibConfig({ forceDist, pruneCache });
        const outputPath = publicLibConfig.output?.path || '';
        const cacheVersionDir = outputPath ? path.dirname(outputPath) : '';
        const cacheKey = cacheVersionDir ? path.basename(cacheVersionDir) : 'unknown';
        const cacheRootInfo = getWebpackRootInfo({ forceDist });
        const inspection = inspectWebpackOutput(publicLibConfig);
        let cacheHit = !forceCompile && inspection.valid;
        let migratedFrom = null;

        if (!cacheHit && !forceCompile && cacheRootInfo.source === 'termux-private') {
            migratedFrom = migrateLegacyWebpackOutput(publicLibConfig);
            cacheHit = Boolean(migratedFrom) && inspectWebpackOutput(publicLibConfig).valid;
        }

        console.log();
        console.log(`[startup] frontend-cache source=${cacheRootInfo.source} root=${cacheRootInfo.root} key=${cacheKey} hit=${cacheHit} reason=${inspection.reason}`);
        if (migratedFrom) {
            console.log(`[startup] frontend-cache migrated-from=${migratedFrom}`);
        }
        markStartupMilestone('frontend.cache.checked', `source=${cacheRootInfo.source} hit=${cacheHit} reason=${inspection.reason}`);

        if (cacheHit) {
            console.log(`Using cached frontend bundles from ${publicLibConfig.output.path}`);
            verifiedOutputPath = outputPath;
            markStartupMilestone('frontend.cache.ready', 'source=cache');
            return { source: 'cache', cacheKey, outputPath };
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

        return new Promise((resolve, reject) => {
            compiler.run((error, stats) => {
                console.log(`[startup] phase webpack.compiler-run ${Date.now() - compilerRunStartedAt}ms`);
                const output = stats?.toString(publicLibConfig.stats);
                if (output) {
                    console.log(output);
                    console.log();
                }
                const compilerCloseStartedAt = Date.now();
                compiler.close(closeError => {
                    console.log(`[startup] phase webpack.compiler-close ${Date.now() - compilerCloseStartedAt}ms`);
                    if (error || closeError || !stats || stats.hasErrors()) { reject(error ?? closeError ?? new Error('Frontend bundle compilation failed')); return; }
                    try { writeWebpackManifest(publicLibConfig); } catch (cause) { reject(cause); return; }
                    verifiedOutputPath = outputPath;
                    markStartupMilestone('frontend.cache.ready', 'source=compiled');
                    resolve({ source: 'compiled', cacheKey, outputPath });
                });
            });
        });
    };

    return devMiddleware;
}
