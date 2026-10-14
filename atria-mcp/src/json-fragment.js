// Slice already-redacted JSON by UTF-16 character offsets. Raw JSON fragments
// can split a sensitive assignment and become corrupt when outer safety layers
// redact again. Hex uses no credential syntax, and UTF-16LE preserves even a
// boundary between surrogate halves. This encodes metadata text, never assets.
export function jsonTextFragment(serialized, offset, size, format = 'json-text-fragment') {
    return { format, encoding: 'hex-utf16le', encodedText: Buffer.from(serialized.slice(offset, offset + size), 'utf16le').toString('hex'),
        note: 'Redacted metadata JSON; decode hex as UTF-16LE, then join the character pages. Asset bytes use the separate Binary Lane.' };
}
