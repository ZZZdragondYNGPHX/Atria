import { nativeRecord } from '../../native/repositories/common.js';
import { resourceFingerprint, STORAGE_CENTER_PROTOCOL } from '../resource-catalog.js';
import { pauseRecoveredRecord } from '../../native/recovery-effects.js';

/** Imported intent is evidence, never permission to replay historical work. */
export function importedManagementRecord(record, handle) {
    if (record.doc?.protocol !== STORAGE_CENTER_PROTOCOL) return pauseRecoveredRecord(record, null, handle);
    const doc = structuredClone(record.doc);
    if (doc.type === 'file-publication') doc.status = 'paused-review';
    if (doc.type === 'task') {
        doc.handle = handle;
        if (['preview', 'pending', 'queued', 'running'].includes(doc.status)) doc.status = 'paused-review';
    }
    if (doc.type === 'recovery') {
        const owners = new Set([...(doc.records ?? []).map(item => item.key.handle), ...(doc.dependencies ?? []).map(key => key.handle)]);
        if (owners.size > 1 || doc.owner && owners.size && !owners.has(doc.owner)) throw new Error('Recovery closure account mismatch');
        for (const row of doc.records ?? []) row.key.handle = handle;
        for (const key of doc.dependencies ?? []) key.handle = handle;
        for (const dependency of doc.dependencyChecks ?? []) dependency.key.handle = handle;
        doc.owner = handle;
        doc.version = resourceFingerprint({ records: doc.records, files: doc.files });
        if (['preparing', 'restoring', 'purging'].includes(doc.state)) { doc.resumePhase = doc.state; doc.state = 'paused-review'; }
    }
    return { ...record, ...nativeRecord(doc, { existing: record, createdAt: record.createdAt, updatedAt: record.updatedAt }) };
}
