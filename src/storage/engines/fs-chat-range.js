import fs from 'node:fs';

const DEFAULT_CHUNK_SIZE = 64 * 1024;
const MAX_CACHE_ENTRIES = 64;
const rangeIndexCache = new Map();

function touchCache(filePath, value) {
    rangeIndexCache.delete(filePath);
    rangeIndexCache.set(filePath, value);
    while (rangeIndexCache.size > MAX_CACHE_ENTRIES) {
        rangeIndexCache.delete(rangeIndexCache.keys().next().value);
    }
}

function sameFileVersion(index, stat) {
    return index
        && index.size === stat.size
        && index.mtimeMs === stat.mtimeMs;
}

function readSpan(fd, span) {
    const length = Math.max(0, span.end - span.start);
    if (length === 0) return '';
    const buffer = Buffer.allocUnsafe(length);
    let offset = 0;
    while (offset < length) {
        const read = fs.readSync(fd, buffer, offset, length - offset, span.start + offset);
        if (read <= 0) throw new Error('Unexpected EOF while reading chat range');
        offset += read;
    }
    return buffer.toString('utf8');
}

function collectLineSpans(filePath, stat, chunkSize = DEFAULT_CHUNK_SIZE) {
    const fd = fs.openSync(filePath, 'r');
    try {
        const spans = [];
        let lineStart = 0;
        let position = 0;
        const buffer = Buffer.allocUnsafe(chunkSize);

        while (position < stat.size) {
            const length = Math.min(buffer.length, stat.size - position);
            const bytesRead = fs.readSync(fd, buffer, 0, length, position);
            if (bytesRead <= 0) break;
            for (let i = 0; i < bytesRead; i++) {
                if (buffer[i] !== 0x0a) continue;
                const lineEnd = position + i;
                if (lineEnd > lineStart) spans.push({ start: lineStart, end: lineEnd });
                lineStart = lineEnd + 1;
            }
            position += bytesRead;
        }

        if (lineStart < stat.size) {
            spans.push({ start: lineStart, end: stat.size });
        }

        if (spans.length === 0) return null;

        // Preserve the old full-read corruption contract when an index is
        // first built or invalidated: every non-empty JSONL line is validated,
        // but parsed message objects are not retained in memory.
        let header = null;
        for (let i = 0; i < spans.length; i++) {
            let parsed;
            try {
                parsed = JSON.parse(readSpan(fd, spans[i]));
            } catch {
                return null;
            }
            if (i === 0) {
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
                header = parsed;
            }
        }

        return {
            filePath,
            size: stat.size,
            mtimeMs: stat.mtimeMs,
            updatedAt: Math.floor(stat.mtimeMs),
            createdAt: Math.floor(stat.birthtimeMs || stat.ctimeMs),
            header,
            headerSpan: spans[0],
            bodySpans: spans.slice(1),
        };
    } finally {
        fs.closeSync(fd);
    }
}

function getRangeIndex(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    const cached = rangeIndexCache.get(filePath);
    if (sameFileVersion(cached, stat)) {
        touchCache(filePath, cached);
        return cached;
    }

    const index = collectLineSpans(filePath, stat);
    if (!index) {
        rangeIndexCache.delete(filePath);
        return null;
    }
    touchCache(filePath, index);
    return index;
}

export function readFsChatInfo(filePath) {
    for (let attempt = 0; attempt < 2; attempt++) {
        const index = getRangeIndex(filePath);
        if (!index) return null;

        let lastMessage = null;
        if (index.bodySpans.length > 0) {
            const fd = fs.openSync(filePath, 'r');
            try {
                const span = index.bodySpans[index.bodySpans.length - 1];
                lastMessage = JSON.parse(readSpan(fd, span));
            } catch {
                rangeIndexCache.delete(filePath);
                return null;
            } finally {
                fs.closeSync(fd);
            }
        }

        const after = fs.statSync(filePath);
        if (!sameFileVersion(index, after)) {
            rangeIndexCache.delete(filePath);
            continue;
        }

        return {
            header: structuredClone(index.header),
            integrity: index.header?.chat_metadata?.integrity ?? '',
            updatedAt: index.updatedAt,
            createdAt: index.createdAt,
            messageCount: index.bodySpans.length,
            byteSize: index.size,
            lastMessage,
        };
    }
    return null;
}

/**
 * Reads a message window from an FS-backed JSONL chat without materializing
 * the rest of the chat body after the line index is warm.
 *
 * The persisted format is unchanged. Index state is process-local and
 * disposable; mtime/size changes invalidate it automatically.
 *
 * @param {string} filePath
 * @param {object} [options]
 * @param {number} [options.fromIndex=0]
 * @param {number} [options.limit=0] 0 means through the end
 * @returns {object|null}
 */
export function readFsChatRange(filePath, { fromIndex = 0, limit = 0 } = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
        const index = getRangeIndex(filePath);
        if (!index) return null;

        const totalMessages = index.bodySpans.length;
        const requestedStart = Number.isFinite(Number(fromIndex)) ? Math.floor(Number(fromIndex)) : 0;
        const requestedLimit = Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : 0;
        const start = Math.max(0, Math.min(requestedStart, totalMessages));
        const end = requestedLimit > 0
            ? Math.min(start + requestedLimit, totalMessages)
            : totalMessages;

        const fd = fs.openSync(filePath, 'r');
        let body;
        try {
            body = index.bodySpans.slice(start, end).map(span => JSON.parse(readSpan(fd, span)));
        } catch {
            rangeIndexCache.delete(filePath);
            return null;
        } finally {
            fs.closeSync(fd);
        }

        const after = fs.statSync(filePath);
        if (!sameFileVersion(index, after)) {
            rangeIndexCache.delete(filePath);
            continue;
        }

        return {
            header: structuredClone(index.header),
            body,
            integrity: index.header?.chat_metadata?.integrity ?? '',
            updatedAt: index.updatedAt,
            createdAt: index.createdAt,
            fromIndex: start,
            nextIndex: end,
            totalMessages,
            hasMore: end < totalMessages,
        };
    }
    return null;
}

/**
 * Appends messages to a canonical FS chat without rewriting existing body
 * lines. Returns unsupported when the header cannot be rotated in place
 * (for example an old file with no fixed-length integrity field), allowing
 * ChatRepo to fall back to the full-resource path.
 *
 * @param {string} filePath
 * @param {object[]} messages
 * @param {{expectedIntegrity?: string|null, newIntegrity: string, updatedAt?: number}} options
 * @returns {{status:'ok',integrity:string,accepted:number}|{status:'conflict',actualIntegrity:string}|{status:'missing'}|{status:'unsupported'}}
 */
export function appendFsChatMessages(filePath, messages, {
    expectedIntegrity = null,
    newIntegrity,
    updatedAt,
} = {}) {
    const index = getRangeIndex(filePath);
    if (!index) return { status: 'missing' };

    const currentIntegrity = String(index.header?.chat_metadata?.integrity ?? '');
    if (expectedIntegrity !== null && expectedIntegrity !== undefined
        && currentIntegrity !== expectedIntegrity) {
        return { status: 'conflict', actualIntegrity: currentIntegrity };
    }

    const nextMessages = Array.isArray(messages) ? messages : [];
    if (nextMessages.length === 0) {
        return { status: 'ok', integrity: currentIntegrity, accepted: 0 };
    }

    const nextHeader = {
        ...index.header,
        chat_metadata: {
            ...(index.header?.chat_metadata ?? {}),
            integrity: newIntegrity,
        },
    };
    const headerText = JSON.stringify(nextHeader);
    const headerBytes = Buffer.from(headerText, 'utf8');
    const headerLength = index.headerSpan.end - index.headerSpan.start;
    if (headerBytes.length !== headerLength) {
        return { status: 'unsupported' };
    }

    const before = fs.statSync(filePath);
    if (!sameFileVersion(index, before)) {
        rangeIndexCache.delete(filePath);
        return { status: 'unsupported' };
    }

    const messageText = nextMessages.map(message => JSON.stringify(message)).join('\n') + '\n';
    const messageBytes = Buffer.from(messageText, 'utf8');
    const fd = fs.openSync(filePath, 'r+');
    try {
        let prefix = Buffer.alloc(0);
        if (before.size > 0) {
            const lastByte = Buffer.allocUnsafe(1);
            fs.readSync(fd, lastByte, 0, 1, before.size - 1);
            if (lastByte[0] !== 0x0a) prefix = Buffer.from('\n');
        }

        // Append first. If a process failure happens before the header rotate,
        // the old integrity remains and the retry path can deduplicate against
        // the newly landed tail instead of rejecting the retry as stale.
        if (prefix.length) fs.writeSync(fd, prefix, 0, prefix.length, before.size);
        const appendAt = before.size + prefix.length;
        fs.writeSync(fd, messageBytes, 0, messageBytes.length, appendAt);
        fs.fsyncSync(fd);

        fs.writeSync(fd, headerBytes, 0, headerBytes.length, index.headerSpan.start);
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }

    if (typeof updatedAt === 'number' && Number.isFinite(updatedAt)) {
        const seconds = updatedAt / 1000;
        try { fs.utimesSync(filePath, seconds, seconds); } catch { /* best-effort */ }
    }
    rangeIndexCache.delete(filePath);
    return { status: 'ok', integrity: newIntegrity, accepted: nextMessages.length };
}

export function invalidateFsChatRangeIndex(filePath) {
    rangeIndexCache.delete(filePath);
}

export function clearFsChatRangeIndexCache() {
    rangeIndexCache.clear();
}
