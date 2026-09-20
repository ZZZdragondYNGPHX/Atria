import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const DEFAULT_CHUNK_SIZE = 64 * 1024;
const MAX_CACHE_ENTRIES = 64;
const rangeIndexCache = new Map();

const PATCH_JOURNAL_SUFFIX = '.atria-patch-journal';
const PATCH_JOURNAL_TEMP_PREFIX = PATCH_JOURNAL_SUFFIX + '.tmp-';
const PATCH_JOURNAL_MAGIC = 'ATRIA_FS_CHAT_PATCH_V1';
const PATCH_JOURNAL_PENDING = 'P';
const PATCH_JOURNAL_COMMITTED = 'C';

/**
 * Recovery artifacts are local transaction state, never user content.
 * Sync/backup walkers can use this predicate to keep them out of portable
 * trees while leaving ordinary JSONL names untouched.
 *
 * @param {string} name basename of a candidate file
 * @returns {boolean}
 */
export function isFsChatPatchArtifactName(name) {
    const value = String(name || '');
    return value.endsWith(PATCH_JOURNAL_SUFFIX)
        || value.includes('.jsonl' + PATCH_JOURNAL_TEMP_PREFIX);
}

function writeAll(fd, buffer, position = null) {
    let written = 0;
    while (written < buffer.length) {
        const count = fs.writeSync(
            fd,
            buffer,
            written,
            buffer.length - written,
            position === null ? null : position + written,
        );
        if (count <= 0) throw new Error('Unexpected short write while updating chat storage');
        written += count;
    }
}

function readSpanBuffer(fd, span) {
    const length = Math.max(0, span.end - span.start);
    if (length === 0) return Buffer.alloc(0);
    const buffer = Buffer.allocUnsafe(length);
    let offset = 0;
    while (offset < length) {
        const read = fs.readSync(fd, buffer, offset, length - offset, span.start + offset);
        if (read <= 0) throw new Error('Unexpected EOF while reading chat range');
        offset += read;
    }
    return buffer;
}

function patchJournalPath(filePath) {
    return filePath + PATCH_JOURNAL_SUFFIX;
}

function fsyncDirectoryBestEffort(filePath) {
    let fd = null;
    try {
        fd = fs.openSync(path.dirname(filePath), 'r');
        fs.fsyncSync(fd);
    } catch {
        // Directory fsync is unsupported on some platforms (notably Windows).
        // The journal file itself is still fsynced before target mutation.
    } finally {
        if (fd !== null) {
            try { fs.closeSync(fd); } catch { /* best-effort */ }
        }
    }
}

function removeFileBestEffort(filePath) {
    try { fs.unlinkSync(filePath); } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
    }
}

function readPatchJournal(journalPath) {
    const bytes = fs.readFileSync(journalPath);
    const newline = bytes.indexOf(0x0a);
    if (newline < 0) throw new Error('Invalid Atria FS chat patch journal header');

    const headerLine = bytes.subarray(0, newline).toString('utf8');
    const marker = ' ' + PATCH_JOURNAL_MAGIC + ' ';
    const status = headerLine.slice(0, 1);
    if (![PATCH_JOURNAL_PENDING, PATCH_JOURNAL_COMMITTED].includes(status)
        || !headerLine.slice(1).startsWith(marker)) {
        throw new Error('Invalid Atria FS chat patch journal marker');
    }

    let metadata;
    try {
        metadata = JSON.parse(headerLine.slice(1 + marker.length));
    } catch {
        throw new Error('Invalid Atria FS chat patch journal metadata');
    }

    const headerStart = Number(metadata?.headerStart);
    const headerLength = Number(metadata?.headerLength);
    const suffixStart = Number(metadata?.suffixStart);
    const originalSize = Number(metadata?.originalSize);
    const mtimeMs = Number(metadata?.mtimeMs);
    if (![headerStart, headerLength, suffixStart, originalSize, mtimeMs].every(Number.isFinite)
        || headerStart < 0
        || headerLength < 0
        || suffixStart < 0
        || originalSize < suffixStart) {
        throw new Error('Invalid Atria FS chat patch journal bounds');
    }

    const payload = bytes.subarray(newline + 1);
    const expectedPayloadLength = headerLength + (originalSize - suffixStart);
    if (payload.length !== expectedPayloadLength) {
        throw new Error('Incomplete Atria FS chat patch journal payload');
    }

    return {
        status,
        metadata: { headerStart, headerLength, suffixStart, originalSize, mtimeMs },
        originalHeader: payload.subarray(0, headerLength),
        originalSuffix: payload.subarray(headerLength),
    };
}

/**
 * Recover or finalize an interrupted FS whole-message patch.
 *
 * PENDING means the target may have been partially mutated, so the original
 * header + affected suffix are restored. COMMITTED means target fsync and the
 * journal commit marker both completed; only stale journal cleanup remains.
 *
 * @param {string} filePath canonical chat JSONL path
 * @returns {boolean} true when a journal was found
 */
function restorePatchJournal(filePath, journalPath, journal) {
    if (!fs.existsSync(filePath)) {
        throw new Error('Cannot recover Atria FS chat patch journal: target chat is missing');
    }

    const fd = fs.openSync(filePath, 'r+');
    try {
        writeAll(fd, journal.originalHeader, journal.metadata.headerStart);
        writeAll(fd, journal.originalSuffix, journal.metadata.suffixStart);
        fs.ftruncateSync(fd, journal.metadata.originalSize);
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }

    const seconds = journal.metadata.mtimeMs / 1000;
    try { fs.utimesSync(filePath, seconds, seconds); } catch { /* best-effort */ }
    removeFileBestEffort(journalPath);
    fsyncDirectoryBestEffort(journalPath);
    rangeIndexCache.delete(filePath);
}

function rollbackPatchJournal(filePath) {
    const journalPath = patchJournalPath(filePath);
    if (!fs.existsSync(journalPath)) return;
    const journal = readPatchJournal(journalPath);
    // Used only before a commit-marker fsync has completed. Be conservative:
    // even if the one-byte marker write reached page cache before fsync threw,
    // restore the original bytes because durability was not confirmed.
    restorePatchJournal(filePath, journalPath, journal);
}

export function recoverFsChatPatchJournal(filePath) {
    const journalPath = patchJournalPath(filePath);
    if (!fs.existsSync(journalPath)) return false;

    const journal = readPatchJournal(journalPath);
    if (journal.status === PATCH_JOURNAL_COMMITTED) {
        try {
            removeFileBestEffort(journalPath);
            fsyncDirectoryBestEffort(journalPath);
        } catch (error) {
            // Target data is already durably committed. A stale committed
            // journal is safe to retry-clean later and must never trigger a
            // rollback of the successful chat mutation.
            console.warn('[fs-chat] failed to remove committed patch journal:', error);
        }
        rangeIndexCache.delete(filePath);
        return true;
    }

    restorePatchJournal(filePath, journalPath, journal);
    return true;
}

function createPatchJournal(filePath, index, suffixStart) {
    recoverFsChatPatchJournal(filePath);

    const fd = fs.openSync(filePath, 'r');
    let originalHeader;
    let originalSuffix;
    try {
        originalHeader = readSpanBuffer(fd, index.headerSpan);
        originalSuffix = readSpanBuffer(fd, { start: suffixStart, end: index.size });
    } finally {
        fs.closeSync(fd);
    }

    const metadata = {
        headerStart: index.headerSpan.start,
        headerLength: originalHeader.length,
        suffixStart,
        originalSize: index.size,
        mtimeMs: index.mtimeMs,
    };
    const envelope = Buffer.from(
        PATCH_JOURNAL_PENDING + ' ' + PATCH_JOURNAL_MAGIC + ' ' + JSON.stringify(metadata) + '\n',
        'utf8',
    );
    const journalPath = patchJournalPath(filePath);
    const tempPath = journalPath + '.tmp-' + process.pid + '-' + Date.now();

    let journalFd = null;
    try {
        journalFd = fs.openSync(tempPath, 'wx');
        writeAll(journalFd, envelope);
        writeAll(journalFd, originalHeader);
        writeAll(journalFd, originalSuffix);
        fs.fsyncSync(journalFd);
        fs.closeSync(journalFd);
        journalFd = null;
        fs.renameSync(tempPath, journalPath);
        fsyncDirectoryBestEffort(journalPath);
    } catch (error) {
        if (journalFd !== null) {
            try { fs.closeSync(journalFd); } catch { /* best-effort */ }
        }
        removeFileBestEffort(tempPath);
        throw error;
    }

    return journalPath;
}

function markPatchJournalCommitted(journalPath) {
    const fd = fs.openSync(journalPath, 'r+');
    try {
        writeAll(fd, Buffer.from(PATCH_JOURNAL_COMMITTED), 0);
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
}

function discardPendingPatchJournal(journalPath) {
    removeFileBestEffort(journalPath);
    fsyncDirectoryBestEffort(journalPath);
}

function readDescriptorValue(fd, descriptor) {
    if (descriptor.hasReplacement) return descriptor.value;
    return JSON.parse(readSpan(fd, descriptor.span));
}

function serializeDescriptor(fd, descriptor) {
    const line = descriptor.hasReplacement
        ? descriptor.bytes
        : readSpanBuffer(fd, descriptor.span);
    return Buffer.concat([line, Buffer.from('\n')]);
}

/**
 * One-time recovery sweep used when an FsEngine first touches a user after
 * process start. It makes pending local patches safe before normal Repo reads.
 *
 * @param {object} directories user directory map
 */
export function recoverFsChatPatchJournals(directories) {
    const roots = [];
    if (typeof directories?.groupChats === 'string') roots.push(directories.groupChats);
    if (typeof directories?.chats === 'string' && fs.existsSync(directories.chats)) {
        for (const entry of fs.readdirSync(directories.chats, { withFileTypes: true })) {
            if (entry.isDirectory()) roots.push(path.join(directories.chats, entry.name));
        }
    }

    for (const root of roots) {
        if (!fs.existsSync(root)) continue;
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (!entry.isFile()) continue;
            const full = path.join(root, entry.name);
            if (entry.name.endsWith(PATCH_JOURNAL_SUFFIX)) {
                recoverFsChatPatchJournal(full.slice(0, -PATCH_JOURNAL_SUFFIX.length));
                continue;
            }
            if (isFsChatPatchArtifactName(entry.name)) {
                // Temp journals are renamed to the durable journal before the
                // target is touched, so a leftover temp can always be dropped.
                // Keep the pattern specific enough that a user-named JSONL is
                // never mistaken for recovery debris.
                removeFileBestEffort(full);
            }
        }
    }
}

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
    return readSpanBuffer(fd, span).toString('utf8');
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
        // first built or invalidated: every non-empty JSONL line is validated.
        // While validating, retain only small dedup metadata (generation IDs),
        // never the parsed message bodies.
        let header = null;
        const genIds = new Set();
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
            } else {
                const genId = parsed?.extra?.gen_id;
                if (typeof genId === 'string' && genId.length > 0) {
                    genIds.add(genId);
                }
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
            genIds,
        };
    } finally {
        fs.closeSync(fd);
    }
}

function getRangeIndex(filePath) {
    recoverFsChatPatchJournal(filePath);
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
 * @returns {{status:'ok',integrity:string,accepted:number,dedupedGenIds:string[]}|{status:'conflict',actualIntegrity:string}|{status:'missing'}|{status:'unsupported'}}
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
    const seenGenIds = new Set(index.genIds || []);
    const acceptedMessages = [];
    const dedupedGenIds = [];
    for (const message of nextMessages) {
        const genId = message?.extra?.gen_id;
        if (typeof genId === 'string' && genId.length > 0 && seenGenIds.has(genId)) {
            dedupedGenIds.push(genId);
            continue;
        }
        if (typeof genId === 'string' && genId.length > 0) seenGenIds.add(genId);
        acceptedMessages.push(message);
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

    const messageText = acceptedMessages.length
        ? acceptedMessages.map(message => JSON.stringify(message)).join('\n') + '\n'
        : '';
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
        if (messageBytes.length > 0) {
            if (prefix.length) fs.writeSync(fd, prefix, 0, prefix.length, before.size);
            const appendAt = before.size + prefix.length;
            fs.writeSync(fd, messageBytes, 0, messageBytes.length, appendAt);
            fs.fsyncSync(fd);
        }

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
    return {
        status: 'ok',
        integrity: newIntegrity,
        accepted: acceptedMessages.length,
        dedupedGenIds,
    };
}


/**
 * Applies the same native whole-message patch subset as the SQL engines while
 * keeping the canonical JSONL file as the source of truth.
 *
 * Variable-length replace/remove rewrites only the suffix beginning at the
 * earliest affected message. A transient fsynced journal stores the original
 * header + suffix so an interrupted in-place rewrite can be rolled back on
 * the next storage access. Unsupported shapes return before mutation and use
 * ChatRepo's established atomic full-rewrite fallback.
 *
 * @param {string} filePath
 * @param {object[]} operations whole-message test/replace/remove operations
 * @param {{expectedIntegrity?:string|null,newIntegrity:string,updatedAt?:number,chatMetadata?:object}} options
 * @returns {{status:'ok',integrity:string,applied:number,totalMessages:number}|{status:'conflict',actualIntegrity:string}|{status:'missing'}|{status:'unsupported'}}
 */
export function patchFsChatMessages(filePath, operations, {
    expectedIntegrity = null,
    newIntegrity,
    updatedAt = Date.now(),
    chatMetadata = {},
} = {}) {
    const parsedOps = [];
    for (const operation of Array.isArray(operations) ? operations : []) {
        const op = String(operation?.op || '').trim().toLowerCase();
        const match = /^\/(0|[1-9]\d*)$/.exec(String(operation?.path || ''));
        if (!['test', 'replace', 'remove'].includes(op) || !match) {
            return { status: 'unsupported' };
        }
        if ((op === 'test' || op === 'replace') && !Object.hasOwn(operation, 'value')) {
            return { status: 'unsupported' };
        }
        const serialized = op === 'replace' ? JSON.stringify(operation.value) : null;
        if (op === 'replace' && serialized === undefined) return { status: 'unsupported' };
        parsedOps.push({
            op,
            index: Number(match[1]),
            value: operation?.value,
            bytes: serialized === null ? null : Buffer.from(serialized, 'utf8'),
        });
    }
    if (parsedOps.length === 0) return { status: 'unsupported' };

    const index = getRangeIndex(filePath);
    if (!index) return { status: 'missing' };
    if (index.headerSpan.start !== 0) return { status: 'unsupported' };

    const currentMetadata = index.header?.chat_metadata;
    if (!currentMetadata || typeof currentMetadata !== 'object' || Array.isArray(currentMetadata)) {
        return { status: 'unsupported' };
    }

    const currentIntegrity = String(currentMetadata.integrity ?? '');
    if (expectedIntegrity !== null && expectedIntegrity !== undefined
        && currentIntegrity !== expectedIntegrity) {
        return { status: 'conflict', actualIntegrity: currentIntegrity };
    }

    const mergedMetadata = {
        ...currentMetadata,
        ...(chatMetadata && typeof chatMetadata === 'object' && !Array.isArray(chatMetadata)
            ? chatMetadata : {}),
        integrity: newIntegrity,
    };
    const nextHeader = {
        ...index.header,
        chat_metadata: mergedMetadata,
    };
    const headerBytes = Buffer.from(JSON.stringify(nextHeader), 'utf8');
    const currentHeaderLength = index.headerSpan.end - index.headerSpan.start;
    if (headerBytes.length !== currentHeaderLength) {
        return { status: 'unsupported' };
    }

    const descriptors = index.bodySpans.map(span => ({
        span,
        value: undefined,
        bytes: null,
        hasReplacement: false,
    }));
    let earliestChangedStart = null;

    const fd = fs.openSync(filePath, 'r');
    try {
        for (const operation of parsedOps) {
            if (operation.index < 0 || operation.index >= descriptors.length) {
                if (operation.op === 'test') {
                    throw new Error('JSON Patch test failed at /' + operation.index);
                }
                throw new Error('Invalid JSON Patch ' + operation.op + ' path. Array index out of bounds');
            }

            const descriptor = descriptors[operation.index];
            if (operation.op === 'test') {
                const actual = readDescriptorValue(fd, descriptor);
                if (!isDeepStrictEqual(actual, operation.value)) {
                    throw new Error('JSON Patch test failed at /' + operation.index);
                }
                continue;
            }

            earliestChangedStart = earliestChangedStart === null
                ? descriptor.span.start
                : Math.min(earliestChangedStart, descriptor.span.start);
            if (operation.op === 'replace') {
                // Match JSON-backed SQL engines exactly: subsequent tests in
                // the same patch observe the JSON-normalized replacement, not
                // JS-only values such as undefined object properties.
                descriptor.value = JSON.parse(operation.bytes.toString('utf8'));
                descriptor.bytes = operation.bytes;
                descriptor.hasReplacement = true;
                continue;
            }
            descriptors.splice(operation.index, 1);
        }
    } finally {
        fs.closeSync(fd);
    }

    const suffixStart = earliestChangedStart ?? index.size;
    const suffixDescriptors = descriptors.filter(descriptor => descriptor.span.start >= suffixStart);
    let suffixBytes = Buffer.alloc(0);
    if (suffixDescriptors.length > 0) {
        const sourceFd = fs.openSync(filePath, 'r');
        try {
            suffixBytes = Buffer.concat(suffixDescriptors.map(descriptor => serializeDescriptor(sourceFd, descriptor)));
        } finally {
            fs.closeSync(sourceFd);
        }
    }

    const before = fs.statSync(filePath);
    if (!sameFileVersion(index, before)) {
        rangeIndexCache.delete(filePath);
        return { status: 'unsupported' };
    }

    const journalPath = createPatchJournal(filePath, index, suffixStart);
    const afterJournal = fs.statSync(filePath);
    if (!sameFileVersion(index, afterJournal)) {
        discardPendingPatchJournal(journalPath);
        rangeIndexCache.delete(filePath);
        return { status: 'unsupported' };
    }

    try {
        const targetFd = fs.openSync(filePath, 'r+');
        try {
            if (earliestChangedStart !== null) {
                writeAll(targetFd, suffixBytes, suffixStart);
                fs.ftruncateSync(targetFd, suffixStart + suffixBytes.length);
            }
            writeAll(targetFd, headerBytes, index.headerSpan.start);
            fs.fsyncSync(targetFd);
        } finally {
            fs.closeSync(targetFd);
        }

        if (typeof updatedAt === 'number' && Number.isFinite(updatedAt)) {
            const seconds = updatedAt / 1000;
            try { fs.utimesSync(filePath, seconds, seconds); } catch { /* best-effort */ }
        }

        try {
            markPatchJournalCommitted(journalPath);
        } catch (error) {
            // A commit marker that was written but not fsynced is not a
            // durable commit. Roll back conservatively instead of interpreting
            // the page-cache byte as authoritative.
            try {
                rollbackPatchJournal(filePath);
            } catch (rollbackError) {
                rollbackError.cause = error;
                throw rollbackError;
            }
            throw error;
        }

        try {
            removeFileBestEffort(journalPath);
            fsyncDirectoryBestEffort(journalPath);
        } catch (error) {
            // The committed marker is already durable. Keep the successful
            // target mutation and leave the journal for later cleanup.
            console.warn('[fs-chat] committed patch journal cleanup deferred:', error);
        }
    } catch (error) {
        if (fs.existsSync(journalPath)) {
            try {
                rollbackPatchJournal(filePath);
            } catch (rollbackError) {
                rollbackError.cause = error;
                throw rollbackError;
            }
        }
        throw error;
    } finally {
        rangeIndexCache.delete(filePath);
    }

    return {
        status: 'ok',
        integrity: newIntegrity,
        applied: parsedOps.length,
        totalMessages: descriptors.length,
    };
}

export function invalidateFsChatRangeIndex(filePath) {
    rangeIndexCache.delete(filePath);
}

export function clearFsChatRangeIndexCache() {
    rangeIndexCache.clear();
}
