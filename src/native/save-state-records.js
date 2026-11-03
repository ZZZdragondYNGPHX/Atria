import { deltaStateNamespace } from './state-delta.js';
import { isRecordSnapshot, recordSnapshotHeads, RECORD_VALUE_NAMESPACE } from './state-record-snapshot.js';
import { isRecordPageSnapshot, recordPageHeads, isRecordPage, RECORD_PAGE_NAMESPACE } from './state-record-pages.js';
import { encodeNativeJsonBytes, decodeNativeJson, nativeJsonBytes } from '../storage/engines/native-json-codec.js';

export const SAVE_STATE_ENCODING = 'native-state-v1';
export const SAVE_COMPRESSED_STATE_ENCODING = 'native-state-compressed-v1';
export const storedSaveState = (namespace, data) => namespace === RECORD_PAGE_NAMESPACE ? isRecordPage(data) : deltaStateNamespace(namespace)
    && ['atria-world-state-v2', 'atria-world-state-v3', 'atria-world-state-v4', 'atria-world-state-v5'].includes(data?.format);

export function portableSaveState(namespace, head, data) {
    if (!storedSaveState(namespace, data)) return { namespace, head, data };
    const bytes = Buffer.from(JSON.stringify(data)), encoded = encodeNativeJsonBytes(bytes);
    // Reuse the repository codec without expanding the whole historical graph
    // into a giant JSON string. Tiny records remain plain when base64 costs more.
    return encoded.length * 4 / 3 + 64 < bytes.length
        ? { namespace, head, encoding: SAVE_COMPRESSED_STATE_ENCODING, data: encoded.toString('base64') }
        : { namespace, head, encoding: SAVE_STATE_ENCODING, data };
}

export function saveStateDocument(record) {
    if (record.encoding !== SAVE_COMPRESSED_STATE_ENCODING) return record.data;
    const text = record.data;
    if (!(deltaStateNamespace(record.namespace) || record.namespace === RECORD_PAGE_NAMESPACE) || typeof text !== 'string' || text.length > Math.ceil((64 * 1024 * 1024 + 10) / 3) * 4) throw new TypeError('Invalid compressed Save state');
    const bytes = Buffer.from(text, 'base64'), marker = bytes.subarray(0, 6).toString('ascii');
    if (bytes.toString('base64') !== text || !['ATRZ1\n', 'ATRB1\n'].includes(marker)
        || nativeJsonBytes(bytes) > 64 * 1024 * 1024) throw new TypeError('Invalid compressed Save state');
    return decodeNativeJson(bytes);
}

// Portable Saves carry the same lossless state graph as the repository. Do not
// expand every historical revision into a second full population in memory.
export function saveStateDependencies(record) {
    if (record.encoding === undefined) return [];
    const { namespace, head } = record, data = saveStateDocument(record);
    if (namespace === RECORD_PAGE_NAMESPACE && [SAVE_STATE_ENCODING, SAVE_COMPRESSED_STATE_ENCODING].includes(record.encoding) && isRecordPage(data)) return [];
    if (![SAVE_STATE_ENCODING, SAVE_COMPRESSED_STATE_ENCODING].includes(record.encoding) || !storedSaveState(namespace, data) || data.contentHash !== head
        || !Number.isSafeInteger(data.depth) || data.depth < 0 || data.depth > 128) throw new TypeError('Invalid encoded Save state');
    if (isRecordSnapshot(data)) return recordSnapshotHeads(data).map(head => ({ namespace: RECORD_VALUE_NAMESPACE, head }));
    if (isRecordPageSnapshot(data)) return recordPageHeads(data).map(head => ({ namespace: RECORD_PAGE_NAMESPACE, head }));
    if (data.kind === 'snapshot' && data.depth === 0) return [];
    if (data.kind !== 'delta' || !data.depth || !Array.isArray(data.patch) || !/^[a-f0-9]{64}$/.test(data.baseHead)) throw new TypeError('Invalid encoded Save state');
    return [{ namespace, head: data.baseHead }];
}

export function assertSaveStateDependency(record, dependency) {
    if (!dependency) throw new TypeError('Missing encoded Save state dependency');
    // Check before descending: even forged/cyclic imports cannot construct an
    // unbounded recursive chain by claiming a small depth on every node.
    const data = saveStateDocument(record);
    if (data.kind === 'delta') {
        const depth = dependency.encoding === undefined ? 0 : saveStateDocument(dependency).depth;
        if (data.depth !== depth + 1) throw new TypeError('Encoded Save state depth mismatch');
    }
}
