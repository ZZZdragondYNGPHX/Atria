import { NATIVE_RESOURCE_KINDS as K } from './contracts.js';
import { nativeRecord, hashNativeDocument } from './repositories/common.js';
import { runtimeCheckpointLimits } from './model-prompt-runtime/runtime-checkpoint-store.js';

/** Restore persisted facts without replaying historical work. Shared by the
 * Native recycle bin and the existing account backup/migration path. */
export function pauseRecoveredRecord(record, current = null, handle = record?.key?.handle) {
    if (record?.key?.kind === K.runtimeCheckpoint && record.doc?.schemaVersion === 2 && record.doc.binding) {
        const expiresAt = Date.now(), binding = { ...record.doc.binding, ownerFingerprint: hashNativeDocument(handle) };
        // Opaque provider continuation is historical evidence after restore,
        // never permission to replay the original request or automatic work.
        const doc = { ...record.doc, binding, bindingFingerprint: hashNativeDocument(binding),
            createdAt: expiresAt - runtimeCheckpointLimits.ttlMs, expiresAt };
        return { ...record, ...nativeRecord(doc, { existing: record, createdAt: record.createdAt, updatedAt: record.updatedAt }) };
    }
    const extension = record?.key?.kind === K.versionedJsonResource && ['atri.extensions.plugin', 'atri.extensions.official'].includes(record.key.resourceType) && typeof record.doc?.enabled === 'boolean';
    if (!record?.doc || record.doc.schemaVersion !== 1 && record.key.kind !== K.agentEvolution && !extension) return record;
    const doc = structuredClone(record.doc), kind = record.key.kind;
    if ([K.connectionProfile, K.modelProfile, K.runtimeRoute].includes(kind)) return { ...record, ...nativeRecord(doc, { existing: record, createdAt: record.createdAt, updatedAt: Math.max(Date.now(), record.updatedAt + 1, (current?.updatedAt || 0) + 1) }) };
    if (kind === K.runControl) {
        if (current?.doc?.mode === 'ironman' && current.doc.status === 'terminal') return current;
        doc.background = {};
        for (const operation of Object.values(doc.operations ?? {})) for (const task of Object.values(operation.externalTasks ?? {})) {
            if (['queued', 'dispatched'].includes(task.status)) task.status = 'unknown';
        }
    } else if (kind === K.agentGoal && doc.status === 'active') { doc.status = 'paused'; doc.sequence++; } else if (kind === K.agentEvolution && doc.policy) { doc.policy.mode = 'paused'; doc.policy.reason = 'restored'; } else if (kind === K.projectAgentTask) {
        if (['planned', 'planning', 'working', 'evaluating', 'repair', 'committing'].includes(doc.status)) doc.status = 'blocked';
        for (const wake of doc.goalBinding?.wakes ?? []) if (['pending', 'running'].includes(wake.status)) { wake.status = 'unknown'; wake.updatedAt = Date.now(); }
    } else if (extension) {
        doc.enabled = false;
        if (record.key.resourceType === 'atri.extensions.plugin') { const { revision: _revision, ...value } = doc; doc.revision = hashNativeDocument(value); } else if (doc.director) doc.director.mode = 'manual';
    } else return record;
    return { ...record, ...nativeRecord(doc, { existing: record, createdAt: record.createdAt, updatedAt: record.updatedAt }) };
}
