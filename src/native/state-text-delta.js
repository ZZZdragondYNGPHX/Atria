const blockSize = 32;
const maxParts = 512;
const maxLength = 256 * 1024;

// Exact block copies, not fuzzy text patches. Work is bounded by the strings'
// lengths; unmatched or highly fragmented text simply keeps its full value.
export function textDelta(before, after) {
    if (before.length < blockSize * 2 || after.length < 256 || Math.max(before.length, after.length) > maxLength) return null;
    const blocks = new Map();
    for (let at = 0; at + blockSize <= before.length; at += blockSize) {
        const block = before.slice(at, at + blockSize);
        if (!blocks.has(block)) blocks.set(block, at);
    }
    const parts = []; let literal = 0, at = 0, copied = 0;
    while (at + blockSize <= after.length) {
        const from = blocks.get(after.slice(at, at + blockSize));
        if (from === undefined) { at++; continue; }
        let length = blockSize;
        while (from + length < before.length && at + length < after.length && before[from + length] === after[at + length]) length++;
        if (literal < at) parts.push(after.slice(literal, at));
        parts.push([from, length]); copied += length;
        at += length; literal = at;
        if (parts.length >= maxParts) return null;
    }
    if (literal < after.length) parts.push(after.slice(literal));
    return copied >= blockSize * 2 && parts.length <= maxParts ? parts : null;
}

export function applyTextDelta(before, parts) {
    if (typeof before !== 'string' || before.length > maxLength || !Array.isArray(parts) || !parts.length || parts.length > maxParts) throw new TypeError('Invalid text Delta');
    const chunks = []; let length = 0;
    for (const part of parts) {
        let chunk;
        if (typeof part === 'string') chunk = part;
        else {
            if (!Array.isArray(part) || part.length !== 2 || part.some(n => !Number.isSafeInteger(n) || n < 0) || part[1] === 0 || part[0] + part[1] > before.length) throw new TypeError('Invalid text Delta range');
            chunk = before.slice(part[0], part[0] + part[1]);
        }
        length += chunk.length;
        if (length > maxLength) throw new TypeError('Text Delta output limit');
        chunks.push(chunk);
    }
    return chunks.join('');
}
