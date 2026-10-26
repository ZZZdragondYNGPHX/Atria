import { createHash } from 'node:crypto';
import { ConflictError } from '../../storage/errors.js';

// Admission belongs to an opened immutable file, not a pathname or AssetRef.
// Metadata changes invalidate it. No bytes or file descriptors are retained.
const admitted = new Map();
const stamp = stat => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs, stat.birthtimeNs].join(':');
export async function admitBlob(file, identity, contentHash, size) {
    const stat = await file.stat({ bigint: true });
    const signature = stamp(stat), key = identity + ':' + contentHash;
    if (!stat.isFile() || size !== undefined && stat.size !== globalThis.BigInt(size)) throw new ConflictError('native_asset_blob_corrupt', { contentHash });
    if (admitted.get(key) === signature) {
        admitted.delete(key); admitted.set(key, signature); return;
    }
    const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    for (;;) {
        const { bytesRead } = await file.read(buffer, 0, buffer.length, position);
        if (!bytesRead) break;
        hash.update(buffer.subarray(0, bytesRead)); position += bytesRead;
    }
    if (globalThis.BigInt(position) !== stat.size || hash.digest('hex') !== contentHash || stamp(await file.stat({ bigint: true })) !== signature) {
        throw new ConflictError('native_asset_blob_corrupt', { contentHash });
    }
    if (admitted.size >= 1024) admitted.delete(admitted.keys().next().value);
    admitted.set(key, signature);
}
