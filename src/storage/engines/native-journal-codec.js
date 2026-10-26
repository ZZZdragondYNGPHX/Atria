import { createHash } from 'node:crypto';

const magic = Buffer.from('ATRJ2\n');
const headerBytes = magic.length + 32 + 4;
export const encodedNativeJournal = bytes => bytes.subarray(0, magic.length).equals(magic);

// The journal carries the exact encoded target files. Compression, serialization
// and envelope construction happen once; recovery installs these same bytes.
export function encodeNativeJournal(items) {
    const metadata = Buffer.from(JSON.stringify(items.map(({ key, bytes }) => ({ key, length: bytes?.length ?? null }))));
    const payloads = items.flatMap(item => item.bytes === null ? [] : [item.bytes]);
    const hash = createHash('sha256').update(metadata);
    for (const payload of payloads) hash.update(payload);
    const header = Buffer.alloc(headerBytes);
    magic.copy(header); hash.digest().copy(header, magic.length);
    header.writeUInt32BE(metadata.length, magic.length + 32);
    return Buffer.concat([header, metadata, ...payloads]);
}

export function decodeNativeJournal(bytes) {
    if (!encodedNativeJournal(bytes) || bytes.length < headerBytes) throw new TypeError('Invalid Native journal header');
    const size = bytes.readUInt32BE(magic.length + 32), end = headerBytes + size;
    if (end > bytes.length || !createHash('sha256').update(bytes.subarray(headerBytes)).digest().equals(bytes.subarray(magic.length, magic.length + 32))) {
        throw new TypeError('Native commit journal integrity mismatch');
    }
    const metadata = JSON.parse(bytes.toString('utf8', headerBytes, end));
    if (!Array.isArray(metadata)) throw new TypeError('Invalid Native journal index');
    let offset = end;
    const items = metadata.map(({ key, length }) => {
        if (length === null) return { key, bytes: null };
        if (!Number.isSafeInteger(length) || length < 1 || length > bytes.length - offset) throw new TypeError('Invalid Native journal entry');
        const item = { key, bytes: bytes.subarray(offset, offset + length) };
        offset += length; return item;
    });
    if (offset !== bytes.length) throw new TypeError('Invalid Native journal size');
    return items;
}
