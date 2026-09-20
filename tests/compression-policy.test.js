import { describe, expect, test } from '@jest/globals';

import { shouldSkipLocalFrontendBundleCompression } from '../src/middleware/compression-policy.js';

describe('local frontend bundle compression policy', () => {
    test.each([
        ['127.0.0.1', '/lib.core.bundle.js'],
        ['::1', '/lib.optional.bundle.js'],
        ['::ffff:127.0.0.1', '/codemirror.bundle.js'],
    ])('skips dynamic compression for %s requesting %s', (remoteAddress, path) => {
        expect(shouldSkipLocalFrontendBundleCompression({
            path,
            socket: { remoteAddress },
        })).toBe(true);
    });

    test('keeps compression for remote bundle clients', () => {
        expect(shouldSkipLocalFrontendBundleCompression({
            path: '/lib.core.bundle.js',
            socket: { remoteAddress: '192.168.1.20' },
        })).toBe(false);
    });

    test('does not affect ordinary localhost responses', () => {
        expect(shouldSkipLocalFrontendBundleCompression({
            path: '/script.js',
            socket: { remoteAddress: '127.0.0.1' },
        })).toBe(false);
    });
});
