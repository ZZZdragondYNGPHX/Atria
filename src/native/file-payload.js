import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createTemporaryPayload } from './temporary-payload.js';

// Only host-owned, admitted files carry this identity. Request JSON cannot
// supply a local path or manufacture an admitted digest.
const payloads = new WeakSet();
export const isFilePayload = value => value !== null && typeof value === 'object' && payloads.has(value);
export const payloadHash = value => isFilePayload(value) ? value.contentHash : createHash('sha256').update(value).digest('hex');

export function filePayload(file, length, contentHash, dispose = () => {}, origin = 0, ownsFile = true) {
    let closed = false;
    const active = () => { if (closed) throw new Error('File payload is closed'); };
    const payload = Object.freeze({
        length, contentHash,
        readRange(start, size) {
            active();
            if (!Number.isSafeInteger(start) || !Number.isSafeInteger(size) || start < 0 || size < 0 || start + size > length || size > 1024 * 1024) throw new RangeError('Payload metadata range');
            const bytes = Buffer.allocUnsafeSlow(size); let offset = 0;
            while (offset < size) {
                const read = fs.readSync(file.fd, bytes, offset, size - offset, origin + start + offset);
                if (!read) throw new Error('Truncated file payload');
                offset += read;
            }
            return bytes;
        },
        stream(start = 0, end = length - 1) {
            active();
            if (!length) return Readable.from([]);
            if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end >= length || end < start) throw new RangeError('Payload byte range');
            // A range consumer owns its stream, never the shared descriptor.
            // Destroying/cancelling one range must not close sibling readers.
            return Readable.from((async function* () {
                let position = start;
                while (position <= end) {
                    active();
                    const bytes = Buffer.allocUnsafeSlow(Math.min(256 * 1024, end - position + 1));
                    const result = await file.read(bytes, 0, bytes.length, origin + position);
                    if (!result.bytesRead) throw new Error('Truncated file payload');
                    position += result.bytesRead;
                    yield result.bytesRead === bytes.length ? bytes : bytes.subarray(0, result.bytesRead);
                }
            })());
        },
        range(start, size, hash) {
            active();
            if (!Number.isSafeInteger(start) || !Number.isSafeInteger(size) || start < 0 || size < 0 || start + size > length) throw new RangeError('Payload slice');
            return filePayload(file, size, hash, () => {}, origin + start, false);
        },
        async close() { if (closed) return; closed = true; try { if (ownsFile) await file.close(); } finally { dispose(); } },
    });
    payloads.add(payload); return payload;
}

export async function stageFilePayload(source, maxBytes) {
    const backing = createTemporaryPayload('atria-upload-');
    const hash = createHash('sha256'); let length = 0;
    try {
        const meter = new Transform({ transform(chunk, _encoding, next) {
            length += chunk.length;
            if (length > maxBytes) return next(Object.assign(new Error('Package upload exceeds size limit'), { status: 413 }));
            hash.update(chunk); next(null, chunk);
        } });
        await pipeline(source, meter, fs.createWriteStream(backing.path));
        if (!length) throw new TypeError('Package upload is empty');
        return filePayload(await fs.promises.open(backing.path, 'r'), length, hash.digest('hex'), () => backing.dispose());
    } catch (error) { backing.dispose(); throw error; }
}
