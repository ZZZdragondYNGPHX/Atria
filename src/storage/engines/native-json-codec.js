import { deflateRawSync, inflateRawSync, deflateRaw, inflateRaw, brotliCompressSync, brotliDecompressSync,
    brotliCompress, brotliDecompress, constants } from 'node:zlib';
import { promisify } from 'node:util';

const magic = Buffer.from('ATRZ1\n');
const brotliMagic = Buffer.from('ATRB1\n');
const maxBytes = 64 * 1024 * 1024;
const deflate = promisify(deflateRaw), inflate = promisify(inflateRaw);
const compress = promisify(brotliCompress), decompress = promisify(brotliDecompress);
const brotliOptions = { params: { [constants.BROTLI_PARAM_QUALITY]: 3 } };
const encoding = bytes => bytes.subarray(0, 6).equals(magic) ? 'deflate' : bytes.subarray(0, 6).equals(brotliMagic) ? 'brotli' : null;
export const nativeJsonBytes = bytes => bytes.length >= 10 && encoding(bytes) ? bytes.readUInt32BE(6) : bytes.length;

function wrap(bytes, compressed, marker) {
    if (compressed.length + 10 >= bytes.length) return bytes;
    const header = Buffer.alloc(10); marker.copy(header); header.writeUInt32BE(bytes.length, 6);
    return Buffer.concat([header, compressed]);
}

export async function encodeNativeJsonAsync(value) {
    const bytes = Buffer.from(JSON.stringify(value));
    if (bytes.length < 512 || bytes.length > maxBytes) return bytes;
    // Population deltas share the same repeated fields as full snapshots.
    // Keep tiny metadata cheap and retain both historical decoders.
    const large = bytes.length >= 4096;
    return wrap(bytes, large ? await compress(bytes, brotliOptions) : await deflate(bytes, { level: 1 }), large ? brotliMagic : magic);
}
export async function decodeNativeJsonAsync(bytes) {
    const codec = encoding(bytes);
    if (codec) {
        if (bytes.length < 10) throw new TypeError('Truncated Native JSON');
        const length = bytes.readUInt32BE(6);
        if (!length || length > maxBytes) throw new TypeError('Invalid Native JSON length');
        bytes = await (codec === 'brotli' ? decompress : inflate)(bytes.subarray(10), { maxOutputLength: length });
        if (bytes.length !== length) throw new TypeError('Truncated Native JSON');
    }
    return JSON.parse(bytes.toString('utf8'));
}

// The resource and journal identities stay unchanged; this is only a lossless
// storage encoding. Larger documents retain their original JSON representation.
export function encodeNativeJson(value) {
    return encodeNativeJsonBytes(Buffer.from(JSON.stringify(value)));
}

export function encodeNativeJsonBytes(bytes, { brotliQuality = 3, brotliWindow = 22 } = {}) {
    if (bytes.length < 512 || bytes.length > maxBytes) return bytes;
    const large = bytes.length >= 4096;
    return wrap(bytes, large ? brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: brotliQuality, [constants.BROTLI_PARAM_LGWIN]: brotliWindow } }) : deflateRawSync(bytes, { level: 1 }), large ? brotliMagic : magic);
}

export function decodeNativeJson(bytes) {
    const codec = encoding(bytes);
    if (codec) {
        if (bytes.length < 10) throw new TypeError('Truncated Native JSON');
        const length = bytes.readUInt32BE(6);
        if (!length || length > maxBytes) throw new TypeError('Invalid Native JSON length');
        bytes = (codec === 'brotli' ? brotliDecompressSync : inflateRawSync)(bytes.subarray(10), { maxOutputLength: length });
        if (bytes.length !== length) throw new TypeError('Truncated Native JSON');
    }
    return JSON.parse(bytes.toString('utf8'));
}
