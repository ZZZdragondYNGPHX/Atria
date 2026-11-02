import { createHash } from 'node:crypto';
import { ConflictError } from '../../storage/errors.js';

// Admission belongs to an opened immutable file, not a pathname or AssetRef.
// Metadata changes invalidate it. No bytes or file descriptors are retained.
const admitted = new Map();
const stamp = stat => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs, stat.birthtimeNs].join(':');
export async function admitBlob(file, identity, contentHash, size, payload = null) {
    const stat = await file.stat({ bigint: true });
    const signature = stamp(stat), key = identity + ':' + contentHash;
    const length = payload?.length ?? Number(stat.size);
    if (!stat.isFile() || size !== undefined && length !== size) throw new ConflictError('native_asset_blob_corrupt', { contentHash });
    if (admitted.get(key) === signature) {
        admitted.delete(key); admitted.set(key, signature); return;
    }
    const hash = createHash('sha256');
    let position = 0;
    const stream = payload ? payload.stream() : file.createReadStream({ start: 0, autoClose: false });
    for await (const bytes of stream) {
        hash.update(bytes); position += bytes.length;
    }
    if (position !== length || hash.digest('hex') !== contentHash || stamp(await file.stat({ bigint: true })) !== signature) {
        throw new ConflictError('native_asset_blob_corrupt', { contentHash });
    }
    if (admitted.size >= 1024) admitted.delete(admitted.keys().next().value);
    admitted.set(key, signature);
}
