import { pipeline } from 'node:stream/promises';
import { ConflictError } from '../storage/errors.js';

export function parseAssetRange(value, size) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(value);
    if (!match || (!match[1] && !match[2]) || size === 0) throw new RangeError('Unsatisfiable asset range');
    let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start
        || (!match[1] && (!Number.isSafeInteger(Number(match[2])) || Number(match[2]) <= 0))) throw new RangeError('Unsatisfiable asset range');
    return { start, end };
}
export async function deliverNativeAsset(req, res, assets, handle) {
    const expected = req.query.contentHash;
    if (expected !== undefined && (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected))) throw new TypeError('Exact Asset contentHash required');
    const asset = await assets.openDelivery(handle, req.params.assetId);
    if (!asset) { res.sendStatus(404); return; }
    try {
        if (expected && expected !== asset.ref.contentHash) throw new ConflictError('native_asset_integrity_mismatch');
        const etag = '"' + asset.ref.contentHash + '"'; const size = asset.ref.size;
        const mediaType = /^(image\/(png|jpeg|gif|webp|avif)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|text\/plain)$/.test(asset.ref.mediaType)
            ? asset.ref.mediaType : 'application/octet-stream';
        res.set({ 'Content-Type': mediaType, 'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': 'sandbox; default-src \'none\'', 'Cache-Control': 'private, max-age=31536000, immutable',
            'Accept-Ranges': 'bytes', 'ETag': etag });
        if (req.headers['if-none-match']?.split(',').map(value => value.trim().replace(/^W\//, '')).some(value => value === etag || value === '*')) { res.status(304).end(); return; }
        let range = size ? { start: 0, end: size - 1 } : null;
        if (req.headers.range && (!req.headers['if-range'] || req.headers['if-range'] === etag)) {
            try { range = parseAssetRange(req.headers.range, size); } catch { res.status(416).set('Content-Range', `bytes */${size}`).end(); return; }
            res.status(206).set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
        }
        res.set('Content-Length', String(range ? range.end - range.start + 1 : 0));
        if (req.method === 'HEAD' || !range) { res.end(); return; }
        await pipeline(asset.stream(range.start, range.end), res);
    } finally { await asset.close(); }
}
