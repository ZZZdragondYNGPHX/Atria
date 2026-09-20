import { describe, expect, test } from '@jest/globals';

import { shouldSkipLoopbackCompression } from '../src/middleware/compression-policy.js';

describe('loopback compression policy', () => {
    test.each([
        ['127.0.0.1'],
        ['::1'],
        ['::ffff:127.0.0.1'],
    ])('skips dynamic compression for loopback address %s', (remoteAddress) => {
        expect(shouldSkipLoopbackCompression({
            path: '/api/bootstrap',
            socket: { remoteAddress },
        })).toBe(true);
    });

    test.each([
        ['192.168.1.20'],
        ['10.0.0.8'],
        ['2001:db8::1'],
    ])('keeps compression for remote address %s', (remoteAddress) => {
        expect(shouldSkipLoopbackCompression({
            path: '/lib.core.bundle.js',
            socket: { remoteAddress },
        })).toBe(false);
    });

    test('falls back to request.ip when socket address is unavailable', () => {
        expect(shouldSkipLoopbackCompression({ ip: '127.0.0.1' })).toBe(true);
        expect(shouldSkipLoopbackCompression({ ip: '192.168.1.2' })).toBe(false);
    });
});
