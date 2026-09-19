import fs from 'node:fs';
import path from 'node:path';
import getPublicLibConfig from '../../webpack.config.js';
import { markStartupMilestone } from '../startup-timing.js';

// Pre-built bundles shipped by the packager (Android APK, etc.) skip the
// in-process Webpack compile entirely. The directory must contain the three
// entry bundles listed below; any missing file falls back to the normal
// compile path so a partial bundle ship never silently serves a stale lib.
const PREBUILT_BUNDLE_FILES = ['lib.core.bundle.js', 'lib.optional.bundle.js', 'codemirror.bundle.js'];

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
        const cacheRoot = cacheVersionDir ? path.dirname(cacheVersionDir) : 'unknown';
        const cacheSource = process.env.ATRIA_WEBPACK_CACHE_ROOT ? 'env' : (forceDist ? 'dist' : 'dataRoot');
        const cacheHit = !forceCompile && hasCompleteWebpackOutput(publicLibConfig);
        console.log();
        console.log(`[startup] frontend-cache source=${cacheSource} root=${cacheRoot} key=${cacheKey} hit=${cacheHit}`);
        markStartupMilestone('frontend.cache.checked', `source=${cacheSource} hit=${cacheHit}`);

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
