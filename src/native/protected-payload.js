import fs from 'node:fs';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { filePayload, registerFilePayload } from './file-payload.js';

const MAGIC = Buffer.from('ATRIAB01');
const HEADER_BYTES = 40, BLOCK_BYTES = 256 * 1024, TAG_BYTES = 16;
const keyFor = header => createHash('sha256').update('Atria runtime storage v1\0').update(header.subarray(16, 32)).digest();
const nonceFor = (header, index) => {
    const nonce = Buffer.alloc(12); header.copy(nonce, 0, 32, 40); nonce.writeUInt32BE(index, 8); return nonce;
};
export const protectedPayloadSize = length => HEADER_BYTES + length + Math.max(1, Math.ceil(length / BLOCK_BYTES)) * TAG_BYTES;

// Runtime protection is portable obfuscation, not an author password. Each
// block authenticates its position and the file length before exposing bytes.
export function protectPayload(source, length) {
    const header = Buffer.alloc(HEADER_BYTES); MAGIC.copy(header); header.writeBigUInt64BE(globalThis.BigInt(length), 8);
    randomBytes(24).copy(header, 16);
    const key = keyFor(header);
    return Readable.from((async function* () {
        yield header;
        let block = Buffer.allocUnsafe(BLOCK_BYTES), used = 0, total = 0, index = 0;
        const seal = bytes => {
            const cipher = createCipheriv('aes-256-gcm', key, nonceFor(header, index++)); cipher.setAAD(header);
            return Buffer.concat([cipher.update(bytes), cipher.final(), cipher.getAuthTag()]);
        };
        for await (const bytes of source) {
            total += bytes.length;
            if (total > length) throw new Error('Protected payload exceeds declared length');
            for (let offset = 0; offset < bytes.length;) {
                const size = Math.min(BLOCK_BYTES - used, bytes.length - offset);
                bytes.copy(block, used, offset, offset + size); used += size; offset += size;
                if (used === BLOCK_BYTES) { yield seal(block); block = Buffer.allocUnsafe(BLOCK_BYTES); used = 0; }
            }
        }
        if (total !== length) throw new Error('Protected payload is truncated');
        if (used || !length) yield seal(block.subarray(0, used));
    })());
}

function readAt(fd, start, size) {
    const bytes = Buffer.allocUnsafeSlow(size);
    for (let offset = 0; offset < size;) {
        const count = fs.readSync(fd, bytes, offset, size - offset, start + offset);
        if (!count) throw new Error('Protected payload is truncated');
        offset += count;
    }
    return bytes;
}

export function protectedPayloadReader(fd, physicalLength) {
    if (physicalLength < MAGIC.length || !readAt(fd, 0, MAGIC.length).equals(MAGIC)) return null;
    const header = readAt(fd, 0, HEADER_BYTES), length = Number(header.readBigUInt64BE(8));
    if (!Number.isSafeInteger(length) || protectedPayloadSize(length) !== physicalLength) throw new Error('Protected payload length is invalid');
    const key = keyFor(header);
    const decrypt = (index, encrypted) => {
        const decipher = createDecipheriv('aes-256-gcm', key, nonceFor(header, index)); decipher.setAAD(header);
        decipher.setAuthTag(encrypted.subarray(-TAG_BYTES));
        return Buffer.concat([decipher.update(encrypted.subarray(0, -TAG_BYTES)), decipher.final()]);
    };
    const bounds = index => ({ start: HEADER_BYTES + index * (BLOCK_BYTES + TAG_BYTES), size: Math.min(BLOCK_BYTES, length - index * BLOCK_BYTES) + TAG_BYTES });
    const check = (start, size) => {
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(size) || start < 0 || size < 0 || start + size > length) throw new RangeError('Protected payload range');
    };
    return {
        length,
        readRange(start, size) {
            check(start, size);
            const out = Buffer.allocUnsafeSlow(size);
            for (let offset = 0; offset < size;) {
                const index = Math.floor((start + offset) / BLOCK_BYTES), skip = (start + offset) % BLOCK_BYTES;
                const range = bounds(index), bytes = decrypt(index, readAt(fd, range.start, range.size));
                const count = Math.min(bytes.length - skip, size - offset); bytes.copy(out, offset, skip, skip + count); offset += count;
            }
            return out;
        },
        stream(start = 0, end = length - 1) {
            check(start, Math.max(0, end - start + 1));
            return Readable.from((async function* () {
                const first = Math.floor(start / BLOCK_BYTES), last = Math.max(first, Math.floor(end / BLOCK_BYTES));
                for (let index = first; index <= last; index++) {
                    const range = bounds(index), encrypted = Buffer.allocUnsafe(range.size);
                    for (let offset = 0; offset < encrypted.length;) {
                        const count = await new Promise((resolve, reject) => fs.read(fd, encrypted, offset, encrypted.length - offset, range.start + offset,
                            (error, bytesRead) => error ? reject(error) : resolve(bytesRead)));
                        if (!count) throw new Error('Protected payload is truncated');
                        offset += count;
                    }
                    const bytes = decrypt(index, encrypted);
                    yield bytes.subarray(index === first ? start % BLOCK_BYTES : 0, Math.min(bytes.length, end - index * BLOCK_BYTES + 1));
                }
            })());
        },
    };
}

export async function storedFilePayload(file, contentHash, dispose = () => {}) {
    const physicalLength = Number((await file.stat()).size), reader = protectedPayloadReader(file.fd, physicalLength);
    if (!reader) return filePayload(file, physicalLength, contentHash, dispose);
    let closed = false;
    const active = () => { if (closed) throw new Error('File payload is closed'); };
    const slice = (origin, length, hash, owner) => registerFilePayload(Object.freeze({
        length, contentHash: hash, protected: true,
        readRange(start, size) { active(); if (start < 0 || size < 0 || start + size > length) throw new RangeError('Payload range'); return reader.readRange(origin + start, size); },
        stream(start = 0, end = length - 1) { active(); if (start < 0 || end >= length) throw new RangeError('Payload range'); return reader.stream(origin + start, origin + end); },
        range(start, size, hash) { active(); if (start < 0 || size < 0 || start + size > length) throw new RangeError('Payload slice'); return slice(origin + start, size, hash, false); },
        async close() { if (!owner || closed) return; closed = true; try { await file.close(); } finally { dispose(); } },
    }));
    return slice(0, reader.length, contentHash, true);
}
