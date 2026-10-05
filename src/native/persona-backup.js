import { createHash } from 'node:crypto';
import { assertNativeId } from './identity.js';
import { NATIVE_RESOURCE_KINDS as K } from './contracts.js';
import { hashNativeDocument } from './repositories/common.js';
import { PersonaRepo } from './repositories/persona-repo.js';
import { AssetStore } from './repositories/asset-store.js';
import { assertPersonaContent, assertPersonaRef, personaFields, personaHash, personaFailure, EMPTY_PERSONA_FINGERPRINT as empty } from './persona-contract.js';
import { validateAvatar } from './repositories/persona-repo.js';

export const PERSONA_BACKUP_KINDS = [K.persona, K.personaRevision, K.personaDefault, K.personaMigration];
export async function personaBackupManifest(engine, handle, directories) {
    const records = await engine.withTransaction(handle, async tx => (await Promise.all(PERSONA_BACKUP_KINDS.map(kind => tx.listResources({ kind, handle })))).flat());
    const repo = new PersonaRepo({ engine, assetStore: new AssetStore({ engine, directoriesByHandle: () => directories }) });
    const index = records.map(record => {
        if (record.integrity !== hashNativeDocument(record.doc)) throw personaFailure('native_persona_invalid', { reason: 'backup_integrity' });
        const { handle: _handle, ...key } = record.key;
        return { key, hash: record.integrity };
    }).sort((a, b) => JSON.stringify(a.key).localeCompare(JSON.stringify(b.key)));
    const avatars = new Map();
    const addAvatar = ref => {
        if (avatars.has(ref.assetId) && hashNativeDocument(avatars.get(ref.assetId)) !== hashNativeDocument(ref)) throw personaFailure('native_persona_invalid', { reason: 'backup_avatar_conflict' });
        avatars.set(ref.assetId, ref);
    };
    const referencedRevisions = new Set();
    for (const record of records.filter(item => item.key.kind === K.persona)) {
        const root = record.doc;
        if (root.schemaVersion !== 1 || typeof root.archived !== 'boolean' || !Array.isArray(root.publishedRevisionIds) || !root.publishedRevisionIds.includes(root.currentRevisionId) || new Set(root.publishedRevisionIds).size !== root.publishedRevisionIds.length) throw personaFailure();
        for (const revisionId of root.publishedRevisionIds) {
            const exact = await repo.get(handle, { ref: { personaId: root.personaId, revisionId, contentIdentity: records.find(item => item.key.kind === K.personaRevision && item.key.personaId === root.personaId && item.key.revisionId === revisionId)?.integrity } });
            referencedRevisions.add(root.personaId + ':' + revisionId);
            if (exact.revision.avatar) addAvatar(exact.revision.avatar);
        }
    }
    // Crash residue stays immutable in the backup; roots still control its visibility.
    const revisions = records.filter(item => item.key.kind === K.personaRevision);
    for (const revision of revisions) {
        if (!referencedRevisions.has(revision.key.personaId + ':' + revision.key.revisionId)) {
            const { schemaVersion, personaId, revisionId, ...content } = revision.doc;
            if (schemaVersion !== 1 || personaId !== revision.key.personaId || revisionId !== revision.key.revisionId) throw personaFailure();
            assertPersonaContent(content);
            if (content.avatar) addAvatar(content.avatar);
        }
    }
    for (const record of records.filter(item => item.key.kind === K.personaDefault)) {
        personaFields(record.doc, ['schemaVersion', 'selection']);
        if (record.doc.schemaVersion !== 1 || !Object.hasOwn(record.doc, 'selection')) throw personaFailure();
        if (record.doc.selection !== null) assertPersonaRef(record.doc.selection);
    }
    const defaultSelection = (await repo.readDefault(handle)).selection;
    if (defaultSelection) await repo.get(handle, { ref: defaultSelection }); // Archived defaults remain recoverable.
    for (const record of records.filter(item => item.key.kind === K.personaMigration)) {
        const receipt = record.doc;
        if (receipt.schemaVersion !== 1 || receipt.sourceDigest !== record.key.sourceDigest || typeof receipt.rawSource !== 'string' || !receipt.items || !receipt.planDigest) throw personaFailure();
        personaHash(receipt.planDigest);
        const raw = Buffer.from(receipt.rawSource, 'base64');
        if (raw.length > 16 * 1024 * 1024 || raw.toString('base64') !== receipt.rawSource || createHash('sha256').update(raw).digest('hex') !== receipt.sourceDigest) throw personaFailure();
        if (Object.keys(receipt.items).length > 1000) throw personaFailure();
        for (const item of Object.values(receipt.items)) {
            assertNativeId(item.personaId, 'persona'); assertNativeId(item.revisionId, 'revision');
            assertPersonaContent(item.content);
            if (!['prepared', 'published', 'failed'].includes(item.status)) throw personaFailure();
            if (item.status === 'published') await repo.get(handle, { ref: item.target });
            if (item.avatar && item.assetId) {
                const ref = { assetId: item.assetId, ...item.avatar };
                const stored = await repo.assets.read(handle, ref.assetId);
                // Prepared receipt may precede the first blob. Published mappings must close.
                if (stored || item.status === 'published') addAvatar(ref);
            }
        }
    }
    for (const ref of avatars.values()) {
        const stored = await repo.assets.read(handle, ref.assetId);
        if (!stored || hashNativeDocument(stored.ref) !== hashNativeDocument(ref)) throw personaFailure('native_persona_invalid', { reason: 'backup_avatar_missing' });
        await validateAvatar(stored.bytes, ref.mediaType);
    }
    return { schemaVersion: 1, records: index, avatars: [...avatars.values()].sort((a, b) => a.assetId.localeCompare(b.assetId)), defaultSelection };
}

export async function reviewPersonaBackup({ sourceEngine, sourceHandle, sourceDirs, manifest, targetEngine, targetHandle }) {
    const actual = await personaBackupManifest(sourceEngine, sourceHandle, sourceDirs);
    if (!manifest && actual.records.length) throw personaFailure('native_persona_invalid', { reason: 'persona_manifest_missing' });
    if (manifest && hashNativeDocument(actual) !== hashNativeDocument(manifest)) throw personaFailure('native_persona_invalid', { reason: 'persona_manifest_mismatch' });
    const conflicts = [];
    for (const item of actual.records.filter(item => item.key.kind !== K.personaDefault)) {
        const target = await targetEngine.withTransaction(targetHandle, tx => tx.getResource({ ...item.key, handle: targetHandle }));
        if (target && target.integrity !== item.hash) conflicts.push(item.key);
    }
    for (const avatar of actual.avatars) {
        const target = await targetEngine.withTransaction(targetHandle, tx => tx.getResource({ kind: K.assetRef, handle: targetHandle, assetId: avatar.assetId }));
        if (target && hashNativeDocument(target.doc) !== hashNativeDocument(avatar)) conflicts.push({ kind: K.assetRef, assetId: avatar.assetId });
    }
    const sourceRepo = new PersonaRepo({ engine: sourceEngine, assetStore: new AssetStore({ engine: sourceEngine, directoriesByHandle: () => sourceDirs }) });
    const defaultStatus = actual.defaultSelection ? (await sourceRepo.get(sourceHandle, { ref: actual.defaultSelection })).root.archived ? 'archived' : 'available' : 'none';
    const currentDefault = await targetEngine.withTransaction(targetHandle, tx => tx.getResource({ kind: K.personaDefault, handle: targetHandle }));
    return { manifest: actual, conflicts, defaultSelection: actual.defaultSelection, expectedDefaultFingerprint: currentDefault?.integrity ?? empty, defaultPolicy: 'preserve', defaultStatus, libraryPolicy: 'merge_exact_ids_preserve_target', hasPersonaManifest: Boolean(manifest) };
}

export async function previewPersonaBackup(zipPath, engineMeta, options) {
    const { materializeTransientSource } = await import('../storage/migration/transient-source.js');
    const { randomBytes } = await import('node:crypto');
    const { withReadOnlyBypass } = await import('../storage/read-only-mode.js');
    const source = await withReadOnlyBypass(() => materializeTransientSource(engineMeta, zipPath, { dataRoot: options.dataRoot,
        scratchHandle: '_xrestore_' + randomBytes(16).toString('hex'), scratchCreds: options.scratchCreds, reuseEngine: engineMeta.engineKind === options.targetEngine.kind ? options.targetEngine : null }));
    try {
        return await reviewPersonaBackup({ sourceEngine: source.engine, sourceHandle: source.scratchHandle, sourceDirs: source.scratchDirs,
            manifest: options.manifest, targetEngine: options.targetEngine, targetHandle: options.targetHandle });
    } finally { await source.cleanup(); }
}
