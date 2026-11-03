import { cloneAdmittedDocument, nativeDocumentBytes, readNativeRecord } from './repositories/common.js';

export const RECORD_VALUE_NAMESPACE = 'atri_record_value';
export const RECORD_SNAPSHOT_FORMAT = 'atria-world-state-v4';
const maxBytes = 64 * 1024 * 1024;
const recordKey = (key, head) => ({ ...key, namespace: RECORD_VALUE_NAMESPACE, head });
export const isRecordSnapshot = doc => doc?.format === RECORD_SNAPSHOT_FORMAT && doc.kind === 'records' && doc.depth === 0;

export function recordSnapshotHeads(doc) {
    if (!isRecordSnapshot(doc) || !Number.isSafeInteger(doc.valueBytes) || doc.valueBytes < 1 || doc.valueBytes > maxBytes
        || !doc.value?.domains || typeof doc.value.domains !== 'object') throw new TypeError('Invalid record snapshot');
    const heads = new Set(); let count = 0;
    for (const domain of Object.values(doc.value.domains)) {
        if (!Array.isArray(domain.records)) throw new TypeError('Invalid record snapshot Domain');
        for (const record of domain.records) {
            if (++count > 131072 || typeof record.value !== 'string' || !/^[a-f0-9]{64}$/.test(record.value)) throw new TypeError('Invalid record snapshot reference');
            heads.add(record.value);
        }
    }
    return [...heads];
}

export async function restoreRecordSnapshot(tx, key, doc) {
    if (key.namespace !== 'atri_lifecycle') throw new TypeError('Invalid record snapshot namespace');
    const heads = recordSnapshotHeads(doc), values = new Map(); let loadedBytes = 0;
    // Read support for retained experimental snapshots. New writes use v3:
    // per-record blobs lost dictionary compression in real long-running worlds.
    // Check each decoded value before loading the next potentially large blob.
    for (const head of heads) {
        const row = await readNativeRecord(tx, recordKey(key, head));
        if (!row || row.integrity !== head) throw new TypeError('Missing or corrupt record snapshot value');
        loadedBytes += nativeDocumentBytes(row.doc);
        if (loadedBytes > maxBytes) throw new TypeError('Record snapshot expansion limit');
        values.set(head, row.doc);
    }
    let size = nativeDocumentBytes(doc.value);
    for (const domain of Object.values(doc.value.domains)) for (const record of domain.records) {
        size += nativeDocumentBytes(values.get(record.value)) - 66;
        if (size > maxBytes) throw new TypeError('Record snapshot expansion limit');
    }
    if (size !== doc.valueBytes) throw new TypeError('Record snapshot byte count mismatch');
    const value = cloneAdmittedDocument(doc.value);
    for (const domain of Object.values(value.domains)) for (const record of domain.records) record.value = cloneAdmittedDocument(values.get(record.value));
    return value;
}
