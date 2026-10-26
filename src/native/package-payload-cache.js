import fs from 'node:fs';
import { filePayload, isFilePayload } from './file-payload.js';

const digests = new WeakMap(), views = new WeakMap();
export function admitPackagePayload(payload, contentHash) { digests.set(payload, contentHash); return payload; }
export function packagePayloadHash(payload) { return digests.get(payload); }
export function registerPackagePayloadView(view, source, pristine = () => true) { views.set(view, { source, pristine }); }
export function packagePayloadInfo(view, path) {
    const entry = views.get(view);
    if (!entry?.pristine(path)) return null;
    const payload = entry.source.get(path), contentHash = payload && digests.get(payload);
    return contentHash ? { size: payload.length, contentHash } : null;
}

export async function withPackageAssetPayloads(assets, operation) {
    const files = new Map(), payloads = new Map();
    try {
        for (const [id, record] of assets) {
            if (Buffer.isBuffer(record)) { payloads.set(id, record); continue; }
            let file = files.get(record.backing);
            if (!file) {
                const handle = await fs.promises.open(record.backing.path, 'r');
                file = filePayload(handle, Number((await handle.stat()).size), null);
                files.set(record.backing, file);
            }
            payloads.set(id, file.range(record.offset, record.length, packagePayloadHash(record)));
        }
        return await operation(payloads);
    } finally { for (const file of files.values()) await file.close(); }
}

export function copyPackagePayload(payload) {
    if (payload.length > 32 * 1024 * 1024) throw new RangeError('Large Package media requires streaming access');
    const copy = Buffer.allocUnsafeSlow(payload.length);
    if (Buffer.isBuffer(payload)) payload.copy(copy);
    else if (isFilePayload(payload)) {
        for (let offset = 0; offset < copy.length; offset += 1024 * 1024) payload.readRange(offset, Math.min(1024 * 1024, copy.length - offset)).copy(copy, offset);
    } else {
        const descriptor = fs.openSync(payload.backing.path, 'r');
        try {
            let read = 0;
            while (read < copy.length) {
                const count = fs.readSync(descriptor, copy, read, copy.length - read, payload.offset + read);
                if (!count) throw new Error('Package payload cache is truncated');
                read += count;
            }
        } finally { fs.closeSync(descriptor); }
    }
    return copy;
}
