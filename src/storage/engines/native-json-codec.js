import { deflateRawSync, inflateRawSync } from 'node:zlib';

const magic = Buffer.from('ATRZ1\n');
const maxBytes = 64 * 1024 * 1024;

// The resource and journal identities stay unchanged; this is only a lossless
// file encoding. Larger documents retain their original JSON representation.
export function encodeNativeJson(value) {
    const bytes = Buffer.from(JSON.stringify(value));
    if (bytes.length < 4096 || bytes.length > maxBytes) return bytes;
    const compressed = deflateRawSync(bytes, { level: 1 });
    if (compressed.length + 10 >= bytes.length) return bytes;
    const header = Buffer.alloc(10); magic.copy(header); header.writeUInt32BE(bytes.length, 6);
    return Buffer.concat([header, compressed]);
}

export function decodeNativeJson(bytes) {
    if (bytes.subarray(0, 6).equals(magic)) {
        if (bytes.length < 10) throw new TypeError('Truncated Native JSON');
        const length = bytes.readUInt32BE(6);
        if (!length || length > maxBytes) throw new TypeError('Invalid Native JSON length');
        bytes = inflateRawSync(bytes.subarray(10), { maxOutputLength: length });
        if (bytes.length !== length) throw new TypeError('Truncated Native JSON');
    }
    return JSON.parse(bytes.toString('utf8'));
}
