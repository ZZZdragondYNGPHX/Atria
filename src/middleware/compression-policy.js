const FRONTEND_BUNDLE_PATHS = new Set([
    '/lib.core.bundle.js',
    '/lib.optional.bundle.js',
    '/codemirror.bundle.js',
]);

/**
 * Local browser requests for generated frontend bundles should not pay dynamic
 * gzip/Brotli CPU cost. Loopback transport is effectively memory-speed, while
 * compressing multi-megabyte bundles on Android can delay first interaction.
 *
 * Remote/LAN clients still benefit from normal compression.
 *
 * @param {import('express').Request | {path?: string, url?: string, ip?: string, socket?: {remoteAddress?: string}}} request
 * @returns {boolean}
 */
export function shouldSkipLocalFrontendBundleCompression(request) {
    const rawPath = String(request?.path || request?.url || '').split('?', 1)[0];
    if (!FRONTEND_BUNDLE_PATHS.has(rawPath)) {
        return false;
    }

    const address = String(request?.socket?.remoteAddress || request?.ip || '').toLowerCase();
    return address === '127.0.0.1'
        || address === '::1'
        || address === '::ffff:127.0.0.1';
}

export const frontendBundlePaths = Object.freeze([...FRONTEND_BUNDLE_PATHS]);
