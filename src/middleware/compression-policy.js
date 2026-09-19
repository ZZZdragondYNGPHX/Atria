/**
 * Dynamic compression is counterproductive when Atria and its browser client
 * communicate over loopback on the same device: bytes never leave the host,
 * while both compression and decompression consume CPU on the critical path.
 *
 * LAN/remote clients still use the normal Express compression policy.
 *
 * @param {import('express').Request | {ip?: string, socket?: {remoteAddress?: string}}} request
 * @returns {boolean}
 */
export function shouldSkipLoopbackCompression(request) {
    const address = String(request?.socket?.remoteAddress || request?.ip || '').toLowerCase();
    return address === '127.0.0.1'
        || address === '::1'
        || address === '::ffff:127.0.0.1';
}
