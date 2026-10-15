import { AsyncLocalStorage } from 'node:async_hooks';
import { NATIVE_RESOURCE_KINDS as K } from './contracts.js';
import { ConflictError } from '../storage/errors.js';
import { hashNativeDocument } from './repositories/common.js';

export const RECOVERY_PROTOCOL = 'atria.storage-center.v1';
const publication = new AsyncLocalStorage();
export const withRecoveryPublication = operation => publication.run(true, operation);
export const recoveryKey = (handle, id) => ({ kind: K.maintenance, handle, scope: 'storage-center:recovery:' + id });
export const isRecoveryRecord = row => row?.doc?.protocol === RECOVERY_PROTOCOL && row.doc.type === 'recovery';

export async function recoveryRecords(tx, handle) {
    const records = (await tx.listResources({ kind: K.maintenance, handle })).filter(isRecoveryRecord);
    if (records.some(row => row.integrity !== hashNativeDocument(row.doc) || !Array.isArray(row.doc.records)
        || !Array.isArray(row.doc.files) || !Array.isArray(row.doc.hashes) || !Array.isArray(row.doc.dependencies))) throw new Error('Recovery retention roots require integrity review');
    return records;
}

export async function retainedBlobHashes(tx, handle) {
    return (await recoveryRecords(tx, handle)).flatMap(row => row.doc.hashes ?? []);
}

/** Match structured identity fields, never a substring of text or a scope label. */
export function documentReferencesKey(value, key) {
    if (!value || typeof value !== 'object') return false;
    const fields = Object.keys(key).filter(field => !['kind', 'handle', 'namespace', 'head'].includes(field));
    if (fields.length && fields.every(field => value[field] === key[field])) return true;
    if (key.kind === K.agentEvidence && value.kind === 'evidence' && value.id === key.evidenceId) return true;
    if (key.kind === K.projectAgentTask && value.kind === 'project_task' && value.id === key.taskId) return true;
    const libraryTypes = { [K.world]: 'core.world', [K.worldRevision]: 'core.world', [K.knowledgeBase]: 'core.knowledge',
        [K.knowledgeRevision]: 'core.knowledge', [K.assetRef]: 'core.asset', [K.package]: 'core.package', [K.packageVersion]: 'core.package' };
    const id = key.worldId ?? key.knowledgeBaseId ?? key.assetId ?? key.packageId;
    if (id && value.resourceId === id && value.resourceType === libraryTypes[key.kind]) {
        const revision = key.worldRevisionId ?? key.knowledgeRevisionId ?? key.packageVersionId;
        if (!revision || !value.revision || value.revision === revision) return true;
    }
    return Object.values(value).some(item => documentReferencesKey(item, key));
}

export async function recoveryReferences(tx, handle, key) {
    return (await recoveryRecords(tx, handle)).filter(row =>
        (row.doc.dependencies ?? []).some(dependency => JSON.stringify(dependency) === JSON.stringify(key))
        || (row.doc.records ?? []).some(record => documentReferencesKey(record.doc, key)),
    ).map(row => ({ kind: 'recycle-bin', recoveryId: row.doc.id }));
}

export async function assertRecoveryWrite(tx, key, proposed = null) {
    if (publication.getStore() || key.kind === K.maintenance || !Object.values(K).includes(key.kind)) return;
    if (key.kind === K.runControl && proposed?.doc?.mode === 'ironman' && proposed.doc.status === 'terminal') {
        const current = await tx.getResource(key);
        if (current?.doc?.status === 'terminal' && current.integrity === hashNativeDocument(proposed.doc)) return;
    }
    for (const row of await recoveryRecords(tx, key.handle)) {
        if ((row.doc.records ?? []).some(record => {
            const original = record.key;
            return JSON.stringify(original) === JSON.stringify(key)
                || key.sessionId && key.sessionId === original.sessionId
                || key.projectId && key.projectId === original.projectId
                || key.packageId && [K.package, K.packageVersion, K.packageState].includes(key.kind) && original.kind === K.package && original.packageId === key.packageId
                || key.personaId && original.personaId === key.personaId
                || key.worldId && original.worldId === key.worldId
                || key.knowledgeBaseId && original.knowledgeBaseId === key.knowledgeBaseId;
        })) throw new ConflictError('native_resource_in_recycle_bin');
    }
}

export async function assertRecoveryDelete(tx, key) {
    if (publication.getStore() || key.kind === K.maintenance || !Object.values(K).includes(key.kind)) return;
    if ((await recoveryReferences(tx, key.handle, key)).length) throw new ConflictError('native_resource_retained_for_recovery');
}
