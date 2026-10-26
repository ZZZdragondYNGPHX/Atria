import { randomUUID, createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { syncDirectoryAsync } from '../storage/durable-file.js';
import { assertAccountPath } from '../storage/path-boundary.js';
import { NATIVE_RESOURCE_KINDS as K } from './contracts.js';
import { withSessionWrite } from './repositories/session-repo.js';
import { withNativeResourceWrite, nativeRecord } from './repositories/common.js';
import { nativeTaskScheduler } from './task-scheduler.js';
import { AgentExperienceRepository } from './agent-intelligence/experience-repository.js';
import { NativeModelPromptPersistence, VersionedJsonResourceHandler, withRuntimeWrite } from './model-prompt-runtime/persistence.js';
import { VERSIONED_MODEL_PROMPT_RESOURCE_TYPES } from './model-prompt-runtime/resources.js';
import { ExtensionsStore } from './extensions-store.js';
import { RuntimeCheckpointStore, runtimeCheckpointOwner } from './model-prompt-runtime/runtime-checkpoint-store.js';
import { visualSessionOwner } from './visual-store.js';
import { pauseRecoveredRecord } from './recovery-effects.js';
import { assertWritable } from '../storage/read-only-mode.js';
import { ConflictError, NotFoundError } from '../storage/errors.js';
import { resourceFingerprint, resourceContentBytes, RECOVERY_RETENTION_MS } from '../storage/resource-catalog.js';
import { readAccountContent, listAccountFiles } from '../storage/resource-accounting.js';
import { RECOVERY_PROTOCOL, recoveryKey, recoveryRecords, recoveryReferences, documentReferencesKey, withRecoveryPublication } from './recovery-roots.js';
import { orchestrationProjectReferences } from './orchestration/reference-roots.js';

export const RECOVERABLE_DESCRIPTORS = {
    session: [K.session, 'sessionId'], package: [K.package, 'packageId'],
    world: [K.world, 'worldId'], knowledge: [K.knowledgeBase, 'knowledgeBaseId'],
    binding: [K.knowledgeBinding, 'knowledgeBindingId'], persona: [K.persona, 'personaId'],
    asset: [K.assetRef, 'assetId'], experience: [K.agentExperience, 'scopeId'],
    evidence: [K.agentEvidence, 'evidenceId'], goal: [K.agentGoal, 'goalId'],
    connection: [K.connectionProfile, 'connectionProfileId'], model: [K.modelProfile, 'modelProfileId'],
    route: [K.runtimeRoute, 'runtimeRouteId'], retrieval: [K.retrievalProfile, 'retrievalProfileId'],
    versioned: [K.versionedJsonResource, 'resourceId'],
};
const descriptors = RECOVERABLE_DESCRIPTORS;
const hashBytes = bytes => createHash('sha256').update(bytes).digest('hex');
const recordId = row => resourceFingerprint(row.key);
const conflict = code => { throw new ConflictError(code); };
const sessionKinds = new Set([K.session, K.runControl, K.branch, K.timelineEntry, K.timelineVariant, K.sessionState, K.sessionRevision, K.savePoint, K.commitReceipt, K.sharedAccess, K.sharedAccessRevision]);
const packageKinds = new Set([K.package, K.packageVersion, K.packageState]);
const exactDependencies = new Set([K.packageVersion, K.worldRevision, K.knowledgeRevision, K.personaRevision, K.versionedJsonResourceRevision, K.assetRef]);

/** Native business-object lifecycle. The storage manager supplies identities;
 * this authority constructs closures and delegates existing domain constraints.
 */
export class NativeRecoveryService {
    constructor({ engine, directoriesByHandle, sessions, packages, worlds, knowledge, personas, assets, graph, projects, studio = null }) {
        Object.assign(this, { engine, directoriesByHandle, sessions, packages, worlds, knowledge, personas, assets, graph, projects, studio });
        this.runtime = new NativeModelPromptPersistence({ engine });
        this.library = new VersionedJsonResourceHandler({ engine });
        this.extensions = new ExtensionsStore({ engine });
    }

    rootKey(handle, target) {
        const descriptor = descriptors[target?.type];
        if (!descriptor || typeof target.id !== 'string' || target.id.length > 512) throw new TypeError('Invalid business resource identity');
        return { kind: descriptor[0], handle, [descriptor[1]]: target.id,
            ...(target.type === 'versioned' ? { resourceType: target.resourceType } : {}),
            ...(target.type === 'retrieval' ? { revision: target.revision } : {}) };
    }

    async lock(handle, target, operation) {
        if (['connection', 'model', 'route', 'retrieval'].includes(target.type) || target.type === 'versioned' && VERSIONED_MODEL_PROMPT_RESOURCE_TYPES.includes(target.resourceType)) return withRuntimeWrite(handle, operation);
        if (target.type === 'versioned' && target.resourceType?.startsWith('atri.extensions.')) return withNativeResourceWrite(handle, 'extensions', operation);
        if (target.type === 'session') {
            const session = await this.sessions.get(handle, target.id);
            const packageId = session?.packageId ?? 'missing';
            return this.sessions.continuity.lock(handle, packageId, () => withSessionWrite(handle, target.id, operation));
        }
        if (target.type === 'project') return this.studio ? this.studio.withProjectWrite(handle, target.id, operation) : this.projects.withLifecycle(handle, target.id, operation);
        const lockId = target.type === 'persona' ? 'personas' : target.type === 'asset' ? 'asset:' + target.id
            : ['experience', 'evidence', 'goal', 'package'].includes(target.type) ? target.type + ':' + target.id : target.id;
        return withNativeResourceWrite(handle, lockId, operation);
    }

    async capture(tx, handle, target, observation = null) {
        const { native, errors } = observation?.content || await readAccountContent(tx, handle);
        if (errors.length) throw new Error('Native closure enumeration incomplete');
        let records, root, files = [];
        if (target.type === 'backup') {
            const file = this.sourceLocation(handle, target), stat = await fsp.lstat(file);
            if (!stat.isFile() || stat.isSymbolicLink()) throw new TypeError('Backup must be a regular account file');
            const bytes = await fsp.readFile(file);
            root = { doc: { name: target.id } }; records = [];
            files = [{ path: target.id, size: bytes.length, hash: hashBytes(bytes) }];
        } else if (target.type === 'project') {
            const source = await this.projects.get(handle, target.id);
            if (!source) throw new NotFoundError('Studio project');
            if (target.baseRevision !== undefined && this.studio && (await this.studio._git.log(this.projects.getProjectDirectory(handle, target.id), 1))[0]?.fullHash !== target.baseRevision) conflict('storage_preview_stale');
            root = { doc: source.project };
            const ownedScopes = new Set(await new AgentExperienceRepository({ engine: this.engine }).projectOwnedScopes(handle, target.id));
            records = native.filter(row => row.key.kind === K.projectAgentTask && row.key.projectId === target.id
                || [K.agentExperience, K.agentEvolution].includes(row.key.kind) && ownedScopes.has(row.key.scopeId)
                || runtimeCheckpointOwner(row)?.type === 'project' && runtimeCheckpointOwner(row).id === target.id);
            const listing = await listAccountFiles(this.projects.getProjectDirectory(handle, target.id));
            if (listing.errors.length) throw new Error('Project closure contains unreadable or linked files');
            for (const file of listing.files) {
                const bytes = await fsp.readFile(file.absolute);
                files.push({ path: file.relative, size: bytes.length, hash: hashBytes(bytes) });
            }
        } else {
            const key = this.rootKey(handle, target);
            root = native.find(row => recordId(row) === resourceFingerprint(key));
            if (!root) throw new NotFoundError('Native resource');
            if (root.doc == null || root.doc.deleted) throw new NotFoundError('Native resource');
            if (target.type === 'versioned') {
                if (root.doc.presetOwner) conflict('native_resource_owned_by_preset');
                if (!VERSIONED_MODEL_PROMPT_RESOURCE_TYPES.includes(target.resourceType)
                    && !['atri.extensions.plugin', 'atri.extensions.settings', 'atri.extensions.official'].includes(target.resourceType)) conflict('native_resource_requires_domain_editor');
            }
            if (target.expectedRevisionId !== undefined && root.doc.headRevisionId !== target.expectedRevisionId
                || target.baseVersionId !== undefined && root.doc.currentVersionId !== target.baseVersionId
                || target.expectedIntegrity !== undefined && root.integrity !== target.expectedIntegrity
                || target.expectedFingerprint !== undefined && root.integrity !== target.expectedFingerprint
                || target.expectedRevision !== undefined && root.doc.revision !== target.expectedRevision) conflict('storage_preview_stale');
            const [, field] = descriptors[target.type];
            records = native.filter(row => {
                if (target.type === 'session') return sessionKinds.has(row.key.kind) && row.key.sessionId === target.id
                    || row.key.kind === K.maintenance && row.key.scope === 'session:' + target.id
                    || runtimeCheckpointOwner(row)?.type === 'session' && runtimeCheckpointOwner(row).id === target.id
                    || visualSessionOwner(row, native) === target.id;
                if (target.type === 'package') return packageKinds.has(row.key.kind) && row.key.packageId === target.id;
                if (target.type === 'world') return [K.world, K.worldRevision].includes(row.key.kind) && row.key.worldId === target.id;
                if (target.type === 'knowledge') return [K.knowledgeBase, K.knowledgeRevision, K.knowledgeEntry].includes(row.key.kind) && row.key.knowledgeBaseId === target.id;
                if (target.type === 'persona') return [K.persona, K.personaRevision].includes(row.key.kind) && row.key.personaId === target.id;
                if (target.type === 'versioned') return [K.versionedJsonResource, K.versionedJsonResourceRevision].includes(row.key.kind)
                    && row.key.resourceType === target.resourceType && row.key.resourceId === target.id;
                if (target.type === 'experience') return [K.agentExperience, K.agentEvolution].includes(row.key.kind) && row.key.scopeId === target.id;
                if (target.type === 'connection') return [K.connectionProfile, K.credentialTargetPermit].includes(row.key.kind) && row.key[field] === target.id;
                if (target.type === 'retrieval') return row.key.kind === K.retrievalProfile && row.key[field] === target.id;
                return row.key.kind === key.kind && row.key[field] === target.id;
            });
        }
        const owned = new Set(records.map(recordId));
        const dependencies = native.filter(row => !owned.has(recordId(row)) && row.key.kind !== K.maintenance
            && records.some(record => documentReferencesKey(record.doc, row.key))).map(row => row.key);
        const hashes = new Set();
        const visit = value => {
            if (!value || typeof value !== 'object') return;
            for (const [field, item] of Object.entries(value)) {
                if ((field === 'contentHash' && value.assetId || field === 'packageContentHash' && value.packageId)
                    && /^[a-f0-9]{64}$/.test(item)) hashes.add(item);
                else if (typeof item === 'object') visit(item);
            }
        };
        for (const record of [...records, ...native.filter(row => dependencies.some(key => resourceFingerprint(key) === recordId(row)))]) visit(record.doc);
        const version = resourceFingerprint({ records, files });
        const describe = row => ({ kind: row.key.kind, name: String(row.doc?.displayName || row.doc?.displayTitle || row.doc?.name
            || Object.entries(row.key).find(([field]) => !['kind', 'handle'].includes(field))?.[1] || row.key.kind) });
        const references = root.key ? native.filter(row => !owned.has(recordId(row)) && row.key.kind !== K.maintenance && documentReferencesKey(row.doc, root.key)).map(describe) : [];
        const dependencyDetails = native.filter(row => dependencies.some(key => resourceFingerprint(key) === recordId(row))).map(describe);
        const dependencyChecks = native.filter(row => exactDependencies.has(row.key.kind) && dependencies.some(key => resourceFingerprint(key) === recordId(row)))
            .map(row => ({ key: row.key, integrity: row.integrity }));
        const personaRevision = target.type === 'persona' && records.find(row => row.key.kind === K.personaRevision && row.key.revisionId === root.doc.currentRevisionId);
        return { target, records, files, dependencies, dependencyChecks, hashes: [...hashes], version,
            references, dependencyDetails, currentRevision: root.doc.currentRevision,
            personaRef: personaRevision ? { personaId: target.id, revisionId: personaRevision.key.revisionId, contentIdentity: personaRevision.integrity } : undefined,
            name: root.doc.displayName || root.doc.displayTitle || root.doc.name || target.id,
            bytes: records.reduce((sum, row) => sum + resourceContentBytes(row.doc), 0) + files.reduce((sum, file) => sum + file.size, 0) };
    }

    async inspectionObservation(handle) {
        // This is a preview observation, never publication authority. Each
        // destructive operation captures and validates current state again.
        const content = await this.engine.withTransaction(handle, tx => readAccountContent(tx, handle));
        return { content, graph: this.graph ? await this.graph.refresh(handle) : null };
    }

    async inspect(handle, target, observation = null) {
        return this.lock(handle, target, () => this.engine.withTransaction(handle, async tx => {
            const closure = await this.capture(tx, handle, target, observation);
            try { await this.checkDelete(tx, handle, closure, observation); return { ...this.summary(closure), allowed: true, reason: null }; } catch (error) { if (!(error instanceof ConflictError)) throw error; return { ...this.summary(closure), allowed: false, reason: error.code }; }
        }));
    }

    summary(closure) {
        return { target: closure.target, name: closure.name, version: closure.version, bytes: closure.bytes,
            recordCount: closure.records.length, fileCount: closure.files.length, dependencyCount: closure.dependencies.length,
            recoverable: true, retentionDays: 30, estimatedPhysicalRelease: null,
            references: closure.references, dependencies: closure.dependencyDetails, relatedMediaBytes: closure.relatedMediaBytes,
            currentRevision: closure.currentRevision, personaRef: closure.personaRef,
            ownedTargets: closure.records.flatMap(row => Object.entries(descriptors).filter(([, [kind]]) => row.key.kind === kind).map(([type, [, field]]) => ({ type, id: row.key[field], ...(type === 'versioned' ? { resourceType: row.key.resourceType } : {}), ...(type === 'retrieval' ? { revision: row.key.revision } : {}) }))),
            consequences: closure.records.some(row => row.key.kind === K.runControl && row.doc.mode === 'ironman') ? ['ironman-remains-terminal'] : [] };
    }

    async checkDelete(tx, handle, closure, observation = null) {
        const { target, records } = closure;
        if (target.type === 'session' && nativeTaskScheduler.hasSessionWork(handle, target.id)) conflict('native_resource_running');
        if (target.type === 'session' && records.some(row => row.key.resourceType === 'atri.visual.job'
            && !['published', 'failed', 'cancelled', 'stale'].includes(row.doc.status))) conflict('native_resource_running');
        if (target.type === 'project' && records.some(row => row.key.kind === K.projectAgentTask
            && ['planning', 'working', 'evaluating', 'repair', 'committing'].includes(row.doc.status))) conflict('native_project_running');
        if (target.type === 'project' && nativeTaskScheduler.hasProjectWork(handle, target.id)) conflict('native_project_running');
        if (target.type === 'project') {
            const references = await orchestrationProjectReferences(tx, handle, target.id);
            closure.references.push(...references.map(reference => ({ ...reference, name: reference.runId })));
            if (references.length) conflict('native_project_orchestration_referenced');
        }
        if (target.type === 'persona') {
            const result = await this.personas.usedBy(handle, { personaId: target.id });
            if (result.references.length) conflict('native_persona_referenced');
        }
        const root = ['project', 'backup'].includes(target.type) ? null : this.rootKey(handle, target);
        const retained = await recoveryRecords(tx, handle);
        if (root && (await recoveryReferences(tx, handle, root, retained)).length) conflict('native_resource_retained_for_recovery');
        for (const record of records) if ((await recoveryReferences(tx, handle, record.key, retained)).length) conflict('native_resource_retained_for_recovery');
        if (this.graph) {
            const types = { package: 'core.package', world: 'core.world', knowledge: 'core.knowledge', binding: 'core.knowledge-binding', asset: 'core.asset' };
            const resourceType = target.type === 'versioned' ? target.resourceType : types[target.type];
            if (resourceType) {
                const references = await this.graph.references(handle, { scope: 'library', resourceType, resourceId: target.id }, { reverse: true, snapshot: observation?.graph });
                if (references.some(item => item.node?.resourceType !== resourceType || item.node?.resourceId !== target.id)) conflict('native_resource_referenced');
            }
        }
        const all = (observation?.content || await readAccountContent(tx, handle)).native;
        const owned = new Set(records.map(recordId));
        // Includes independent Agent material and Runtime/library references not
        // represented by ResourceGraph. Scope labels alone are not a cascade.
        const checkpoints = new RuntimeCheckpointStore({ engine: this.engine, handle });
        if (root && all.some(row => !owned.has(recordId(row)) && row.key.kind !== K.maintenance
            && !(row.key.kind === K.runtimeCheckpoint && checkpoints.expired(row))
            && documentReferencesKey(row.doc, root))) conflict('native_resource_referenced');
        closure.relatedMediaBytes = 0;
        for (const hash of closure.hashes) {
            const bytes = await this.assets.readBlob(handle, hash);
            if (!bytes) conflict('native_recovery_dependency_missing');
            closure.relatedMediaBytes += bytes.length;
        }
    }

    async trash(handle, target, expectedVersion, id = randomUUID()) {
        assertWritable();
        if (['project', 'backup'].includes(target.type)) return this.trashProject(handle, target, expectedVersion, id);
        return this.lock(handle, target, () => this.engine.withTransaction(handle, async tx => {
            const existing = await tx.getResource(recoveryKey(handle, id));
            if (existing) return this.publicRecord(existing.doc);
            const closure = await this.capture(tx, handle, target);
            if (closure.version !== expectedVersion) conflict('storage_preview_stale');
            await this.checkDelete(tx, handle, closure);
            const now = Date.now();
            const doc = { protocol: RECOVERY_PROTOCOL, type: 'recovery', id, owner: handle, state: 'retained',
                target, name: closure.name, records: closure.records, files: closure.files,
                dependencies: closure.dependencies, dependencyChecks: closure.dependencyChecks, hashes: closure.hashes, version: closure.version,
                createdAt: now, expiresAt: now + RECOVERY_RETENTION_MS, effectPolicy: 'no-background-model' };
            // One engine commit holds both the closed recovery source and the
            // removal. The Native transaction durably publishes both before ACK.
            await withRecoveryPublication(async () => {
                if (target.type === 'session') await this.sessions.delete(handle, target.id, { expectedRevisionId: closure.records.find(row => row.key.kind === K.session).doc.headRevisionId });
                else if (target.type === 'package') await this.packages.delete(handle, target.id);
                else if (target.type === 'world') await this.worlds.delete(handle, target.id);
                else if (target.type === 'knowledge') await this.knowledge.delete(handle, target.id);
                else if (target.type === 'binding') await this.knowledge.deleteBinding(handle, target.id);
                else if (target.type === 'persona') {
                    const current = await this.personas.get(handle, { personaId: target.id });
                    await this.personas.delete(handle, { personaId: target.id, expectedFingerprint: current.expectedFingerprint });
                } else if (target.type === 'asset') await this.assets.deleteRef(handle, target.id);
                else if (target.type === 'experience') {
                    const root = closure.records.find(row => row.key.kind === K.agentExperience).doc;
                    await new AgentExperienceRepository({ engine: this.engine }).deleteScope(handle, root.scope, root.subject, root.sequence);
                } else if (['connection', 'model', 'route'].includes(target.type)) await this.runtime.deleteProfile(handle, { connection: 'connections', model: 'models', route: 'routes' }[target.type], target.id);
                else if (target.type === 'versioned') {
                    if (target.resourceType.startsWith('atri.extensions.')) await this.extensions.removeResource(handle, target.resourceType, target.id);
                    else {
                        const root = closure.records.find(row => row.key.kind === K.versionedJsonResource);
                        await this.library.delete(handle, { scope: 'library', resourceType: target.resourceType, resourceId: target.id, revision: root.doc.currentRevision }, () => []);
                    }
                }
            });
            for (const row of closure.records) {
                // Terminal Ironman control is a permanent anti-rollback authority.
                if (row.key.kind === K.runControl && row.doc.mode === 'ironman') continue;
                if ([K.connectionProfile, K.modelProfile, K.runtimeRoute].includes(row.key.kind)) continue;
                await tx.deleteResource(row.key);
            }
            await tx.putResource(recoveryKey(handle, id), nativeRecord(doc));
            this.graph?.invalidate(handle);
            return this.publicRecord(doc);
        }));
    }

    publicRecord(doc) {
        return { id: doc.id, target: doc.target, name: doc.name, state: doc.state, createdAt: doc.createdAt,
            expiresAt: doc.expiresAt, version: resourceFingerprint({ version: doc.version, state: doc.state }),
            bytes: doc.records.reduce((sum, row) => sum + resourceContentBytes(row.doc), 0) + doc.files.reduce((sum, file) => sum + file.size, 0),
            recordCount: doc.records.length, fileCount: doc.files.length, effectPolicy: doc.effectPolicy };
    }

    async list(handle) {
        return this.engine.withTransaction(handle, async tx => (await recoveryRecords(tx, handle)).map(row => this.publicRecord(row.doc)));
    }

    async validateRestore(tx, handle, doc) {
        await recoveryRecords(tx, handle);
        if (doc.protocol !== RECOVERY_PROTOCOL || doc.state !== 'retained') conflict('native_recovery_not_ready');
        if (resourceFingerprint({ records: doc.records, files: doc.files }) !== doc.version) conflict('native_recovery_integrity');
        for (const row of doc.records) {
            if (row.key.handle !== handle) conflict('native_recovery_account_mismatch');
            const current = await tx.getResource(row.key);
            if (current && !(current.doc === null && [K.connectionProfile, K.modelProfile, K.runtimeRoute].includes(row.key.kind))
                && !(row.key.kind === K.runControl && current.doc.mode === 'ironman' && current.doc.status === 'terminal')) conflict('native_recovery_identity_conflict');
        }
        for (const key of doc.dependencies) if (!await tx.getResource(key)) conflict('native_recovery_dependency_missing');
        for (const dependency of doc.dependencyChecks ?? []) {
            const row = await tx.getResource(dependency.key);
            if (!row || row.integrity !== dependency.integrity || row.integrity !== resourceFingerprint(row.doc)) conflict('native_recovery_dependency_missing');
        }
        for (const hash of doc.hashes) if (!await this.assets.readBlob(handle, hash)) conflict('native_recovery_dependency_missing');
        if (['project', 'backup'].includes(doc.target.type)) {
            if (await this.exists(this.sourceLocation(handle, doc.target))) conflict('native_recovery_identity_conflict');
            await this.verifyProjectFiles(handle, doc);
        }
    }

    async preflightRestore(handle, id) {
        return this.engine.withTransaction(handle, async tx => {
            await recoveryRecords(tx, handle);
            const row = await tx.getResource(recoveryKey(handle, id));
            if (!row) throw new NotFoundError('Recovery record');
            const result = this.publicRecord(row.doc);
            try { await this.validateRestore(tx, handle, row.doc); return { ...result, allowed: true, reason: null }; } catch (error) { if (!(error instanceof ConflictError)) throw error; return { ...result, allowed: false, reason: error.code }; }
        });
    }

    async preflightRepair(handle, id) {
        return this.engine.withTransaction(handle, async tx => {
            const doc = (await recoveryRecords(tx, handle)).find(row => row.doc.id === id)?.doc;
            if (!doc) throw new NotFoundError('Recovery record');
            const checked = { ...this.publicRecord(doc), resumePhase: doc.resumePhase, allowed: false, reason: 'native_recovery_not_ready' };
            if (doc.state !== 'paused-review' || !['preparing', 'restoring', 'purging'].includes(doc.resumePhase)
                || !['project', 'backup'].includes(doc.target.type)) return checked;
            try {
                if (resourceFingerprint({ records: doc.records, files: doc.files }) !== doc.version) conflict('native_recovery_integrity');
                const sourceExists = await this.exists(this.sourceLocation(handle, doc.target)), payloadExists = await this.exists(this.payloadLocation(handle, doc));
                if (sourceExists && payloadExists) conflict('native_recovery_identity_conflict');
                if (doc.resumePhase !== 'purging') {
                    if (!sourceExists && !payloadExists) conflict('native_recovery_dependency_missing');
                    if (sourceExists) await this.verifySourceFiles(handle, doc); else await this.verifyProjectFiles(handle, doc);
                    for (const record of doc.records) {
                        const live = await tx.getResource(record.key);
                        if (live && (doc.resumePhase === 'restoring' || live.integrity !== record.integrity)) conflict('native_recovery_identity_conflict');
                    }
                    for (const hash of doc.hashes) if (!await this.assets.readBlob(handle, hash)) conflict('native_recovery_dependency_missing');
                }
                return { ...checked, allowed: true, reason: null, consequences: doc.resumePhase === 'purging' ? ['permanent-deletion'] : [] };
            } catch (error) { if (!(error instanceof ConflictError)) throw error; return { ...checked, reason: error.code }; }
        });
    }

    async repairReviewed(handle, id, expectedVersion, operationId = null) {
        assertWritable();
        if (operationId) {
            const receipt = await this.engine.withTransaction(handle, tx => tx.getResource(this.receiptKey(handle, operationId)));
            if (receipt) return receipt.doc.result;
        }
        const initial = (await this.engine.withTransaction(handle, tx => tx.getResource(recoveryKey(handle, id))))?.doc;
        if (!initial) throw new NotFoundError('Recovery record');
        return this.lock(handle, initial.target, async () => {
            const review = await this.preflightRepair(handle, id);
            if (review.version !== expectedVersion) conflict('storage_preview_stale');
            if (!review.allowed) conflict(review.reason);
            const doc = await this.engine.withTransaction(handle, async tx => {
                const current = (await tx.getResource(recoveryKey(handle, id))).doc;
                const next = { ...current, state: current.resumePhase, repairOperationId: operationId,
                    ...(current.resumePhase === 'restoring' ? { restoreOperationId: operationId } : {}) }; delete next.resumePhase;
                await tx.putResource(recoveryKey(handle, id), nativeRecord(next)); return next;
            });
            if (doc.state === 'preparing') return this.finishProjectRemoval(handle, doc);
            if (doc.state === 'restoring') return this.finishProjectRestore(handle, doc);
            return doc;
        }).then(result => result?.state === 'purging' ? this.purgeProject(handle, result, null, { expiredOnly: false, now: Date.now() }) : result);
    }

    receiptKey(handle, operationId) { return { kind: K.maintenance, handle, scope: 'storage-center:receipt:' + operationId }; }
    async receipt(tx, handle, operationId, result) {
        if (operationId) await tx.putResource(this.receiptKey(handle, operationId), nativeRecord({ protocol: RECOVERY_PROTOCOL, type: 'receipt', operationId, result }));
        return result;
    }
    async restore(handle, id, expectedVersion, operationId = null) {
        assertWritable();
        if (operationId) {
            const done = await this.engine.withTransaction(handle, tx => tx.getResource(this.receiptKey(handle, operationId)));
            if (done) return done.doc.result;
        }
        const initial = await this.engine.withTransaction(handle, tx => tx.getResource(recoveryKey(handle, id)));
        if (!initial) throw new NotFoundError('Recovery record');
        if (['project', 'backup'].includes(initial.doc.target.type)) return this.restoreProject(handle, initial.doc, expectedVersion, operationId);
        return this.lock(handle, initial.doc.target, () => this.engine.withTransaction(handle, async tx => {
            const row = await tx.getResource(recoveryKey(handle, id));
            if (!row) throw new NotFoundError('Recovery record');
            const doc = row.doc;
            if (this.publicRecord(doc).version !== expectedVersion) conflict('storage_preview_stale');
            await this.validateRestore(tx, handle, doc);
            return withRecoveryPublication(async () => {
                // Delete the retained representation inside the same transaction,
                // so quota admission measures the actual conversion, not a copy.
                await tx.deleteResource(recoveryKey(handle, id));
                for (const record of doc.records) {
                    if ([K.runControl, K.rpRunControl].includes(record.key.kind)) {
                        const current = await tx.getResource(record.key);
                        await tx.putResource(record.key, pauseRecoveredRecord(record, current));
                    } else if ([K.agentGoal, K.agentEvolution].includes(record.key.kind)) {
                        await tx.putResource(record.key, pauseRecoveredRecord(record));
                    } else if (record.key.kind === K.projectAgentTask) {
                        await tx.putResource(record.key, this.pausedProjectTask(record));
                    } else if ([K.connectionProfile, K.modelProfile, K.runtimeRoute].includes(record.key.kind)) {
                        const current = await tx.getResource(record.key);
                        await tx.putResource(record.key, nativeRecord(record.doc, { existing: record, updatedAt: Math.max(Date.now(), (current?.updatedAt || record.updatedAt) + 1) }));
                    } else if (record.key.kind === K.versionedJsonResource && record.key.resourceType.startsWith('atri.extensions.')) {
                        await this.extensions.restoreResource(handle, record.key.resourceType, record.key.resourceId, record.doc);
                    } else await tx.putResource(record.key, pauseRecoveredRecord(record));
                }
                this.graph?.invalidate(handle);
                return this.receipt(tx, handle, operationId, { restored: true, target: doc.target, effectPolicy: 'no-background-model' });
            });
        }));
    }

    async purge(handle, id, expectedVersion, { expiredOnly = false, now = Date.now() } = {}) {
        assertWritable();
        const initial = await this.engine.withTransaction(handle, tx => tx.getResource(recoveryKey(handle, id)));
        if (initial && ['project', 'backup'].includes(initial.doc.target.type)) return this.purgeProject(handle, initial.doc, expectedVersion, { expiredOnly, now });
        return this.engine.withTransaction(handle, async tx => {
            await recoveryRecords(tx, handle);
            const row = await tx.getResource(recoveryKey(handle, id));
            if (!row) return { purged: true };
            if (row.doc.state !== 'retained') conflict('native_recovery_not_ready');
            if (expiredOnly && row.doc.expiresAt > now) conflict('native_recovery_retention_active');
            if (expectedVersion && this.publicRecord(row.doc).version !== expectedVersion) conflict('storage_preview_stale');
            await tx.deleteResource(row.key);
            return { purged: true, physicalBytesReleased: null };
        });
    }

    pausedProjectTask(record) {
        return pauseRecoveredRecord(record);
    }

    projectPayload(handle, id) {
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new TypeError('Invalid recovery identity');
        const root = this.directoriesByHandle(handle).root;
        return assertAccountPath(root, path.join(root, 'atria-native', 'recovery', id, 'payload'));
    }
    sourceLocation(handle, target) {
        if (target.type === 'project') return this.projects.getProjectDirectory(handle, target.id);
        if (target.type !== 'backup' || typeof target.id !== 'string' || path.basename(target.id) !== target.id
            || target.id.includes('..') || target.id.includes('\\') || !/\.(jsonl?|zip|tar|gz)$/i.test(target.id)
            || target.id.startsWith('_engine_')) throw new TypeError('Invalid account backup identity');
        const root = this.directoriesByHandle(handle).root;
        return assertAccountPath(root, path.join(this.directoriesByHandle(handle).backups || path.join(root, 'backups'), target.id));
    }
    payloadLocation(handle, doc) {
        const directory = this.projectPayload(handle, doc.id);
        return doc.target.type === 'backup' ? path.join(directory, doc.target.id) : directory;
    }
    async exists(file) { try { await fsp.lstat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }

    async verifyProjectFiles(handle, doc, directory = this.projectPayload(handle, doc.id)) {
        const listing = await listAccountFiles(directory);
        if (listing.errors.length || listing.files.length !== doc.files.length) conflict('native_recovery_integrity');
        for (const file of listing.files) {
            const expected = doc.files.find(item => item.path === file.relative);
            if (!expected || file.bytes !== expected.size || hashBytes(await fsp.readFile(file.absolute)) !== expected.hash) conflict('native_recovery_integrity');
        }
    }

    async verifySourceFiles(handle, doc) {
        const source = this.sourceLocation(handle, doc.target);
        if (doc.target.type === 'project') return this.verifyProjectFiles(handle, doc, source);
        const bytes = await fsp.readFile(source);
        if (doc.files.length !== 1 || bytes.length !== doc.files[0].size || hashBytes(bytes) !== doc.files[0].hash) conflict('native_recovery_integrity');
    }

    async trashProject(handle, target, expectedVersion, id) {
        return this.lock(handle, target, async () => {
            let stored = await this.engine.withTransaction(handle, tx => tx.getResource(recoveryKey(handle, id)));
            if (!stored) {
                stored = await this.engine.withTransaction(handle, async tx => {
                    const closure = await this.capture(tx, handle, target);
                    if (closure.version !== expectedVersion) conflict('storage_preview_stale');
                    await this.checkDelete(tx, handle, closure);
                    const now = Date.now();
                    const doc = { protocol: RECOVERY_PROTOCOL, type: 'recovery', id, owner: handle, state: 'preparing', target,
                        name: closure.name, records: closure.records, files: closure.files, dependencies: closure.dependencies,
                        dependencyChecks: closure.dependencyChecks, hashes: closure.hashes, version: closure.version, createdAt: now, expiresAt: now + RECOVERY_RETENTION_MS,
                        effectPolicy: 'no-background-model' };
                    await tx.putResource(recoveryKey(handle, id), nativeRecord(doc));
                    return { doc };
                });
            }
            if (stored.doc.state === 'retained') return this.publicRecord(stored.doc);
            return this.finishProjectRemoval(handle, stored.doc);
        });
    }

    async finishProjectRemoval(handle, doc) {
        if (doc.state !== 'preparing') conflict('native_recovery_not_ready');
        if (doc.target.type === 'project') await this.engine.withTransaction(handle, async tx => {
            if ((await orchestrationProjectReferences(tx, handle, doc.target.id)).length) conflict('native_project_orchestration_referenced');
        });
        const source = this.sourceLocation(handle, doc.target), destination = this.payloadLocation(handle, doc);
        if (await this.exists(source)) {
            if (await this.exists(destination)) conflict('native_recovery_identity_conflict');
            await this.verifySourceFiles(handle, doc);
            await fsp.mkdir(path.dirname(destination), { recursive: true });
            await fsp.rename(source, destination);
            await syncDirectoryAsync(path.dirname(source)); await syncDirectoryAsync(path.dirname(destination));
        }
        await this.verifyProjectFiles(handle, doc);
        return this.engine.withTransaction(handle, tx => withRecoveryPublication(async () => {
            const current = await tx.getResource(recoveryKey(handle, doc.id));
            if (current?.doc.state === 'retained') return this.publicRecord(current.doc);
            if (current?.doc.state !== 'preparing') conflict('native_recovery_not_ready');
            if (doc.target.type === 'project' && (await orchestrationProjectReferences(tx, handle, doc.target.id)).length)
                conflict('native_project_orchestration_referenced');
            const retainedRecords = await recoveryRecords(tx, handle);
            for (const record of doc.records) {
                if ((await recoveryReferences(tx, handle, record.key, retainedRecords)).some(reference => reference.recoveryId !== doc.id)) conflict('native_resource_retained_for_recovery');
                const live = await tx.getResource(record.key);
                if (live && resourceFingerprint(live.doc) !== resourceFingerprint(record.doc)) conflict('storage_preview_stale');
                await tx.deleteResource(record.key);
            }
            const now = Date.now();
            const retained = { ...doc, state: 'retained', createdAt: now, expiresAt: now + RECOVERY_RETENTION_MS };
            await tx.putResource(recoveryKey(handle, doc.id), nativeRecord(retained));
            this.graph?.invalidate(handle);
            return this.receipt(tx, handle, doc.repairOperationId, this.publicRecord(retained));
        }));
    }

    async restoreProject(handle, initial, expectedVersion, operationId) {
        return this.lock(handle, initial.target, async () => {
            let doc = (await this.engine.withTransaction(handle, tx => tx.getResource(recoveryKey(handle, initial.id))))?.doc;
            if (!doc) throw new NotFoundError('Recovery record');
            if (doc.state === 'retained') {
                if (this.publicRecord(doc).version !== expectedVersion) conflict('storage_preview_stale');
                await this.engine.withTransaction(handle, async tx => {
                    await this.validateRestore(tx, handle, doc);
                    doc = { ...doc, state: 'restoring', restoreOperationId: operationId };
                    await tx.putResource(recoveryKey(handle, doc.id), nativeRecord(doc));
                });
            }
            return this.finishProjectRestore(handle, doc);
        });
    }

    async finishProjectRestore(handle, doc) {
        if (doc.state !== 'restoring') conflict('native_recovery_not_ready');
        const destination = this.sourceLocation(handle, doc.target), source = this.payloadLocation(handle, doc);
        if (await this.exists(source)) {
            if (await this.exists(destination)) conflict('native_recovery_identity_conflict');
            await this.verifyProjectFiles(handle, doc);
            await fsp.mkdir(path.dirname(destination), { recursive: true });
            await fsp.rename(source, destination);
            await syncDirectoryAsync(path.dirname(source)); await syncDirectoryAsync(path.dirname(destination));
        }
        await this.verifySourceFiles(handle, doc);
        return this.engine.withTransaction(handle, tx => withRecoveryPublication(async () => {
            for (const record of doc.records) if (await tx.getResource(record.key)) conflict('native_recovery_identity_conflict');
            await tx.deleteResource(recoveryKey(handle, doc.id));
            for (const record of doc.records) {
                if (record.key.kind === K.agentEvolution) {
                    await tx.putResource(record.key, pauseRecoveredRecord(record));
                } else if (record.key.kind === K.projectAgentTask) await tx.putResource(record.key, this.pausedProjectTask(record));
                else await tx.putResource(record.key, pauseRecoveredRecord(record));
            }
            this.graph?.invalidate(handle);
            return this.receipt(tx, handle, doc.restoreOperationId, { restored: true, target: doc.target, effectPolicy: 'no-background-model' });
        }));
    }

    async purgeProject(handle, initial, expectedVersion, { expiredOnly, now }) {
        return this.lock(handle, initial.target, async () => {
            const current = await this.engine.withTransaction(handle, async tx => {
                await recoveryRecords(tx, handle); return tx.getResource(recoveryKey(handle, initial.id));
            });
            if (!current) return { purged: true };
            let doc = current.doc;
            if (doc.state === 'retained') {
                if (expiredOnly && doc.expiresAt > now) conflict('native_recovery_retention_active');
                if (expectedVersion && this.publicRecord(doc).version !== expectedVersion) conflict('storage_preview_stale');
                doc = { ...doc, state: 'purging' };
                await this.engine.withTransaction(handle, tx => tx.putResource(recoveryKey(handle, doc.id), nativeRecord(doc)));
            }
            if (doc.state !== 'purging') conflict('native_recovery_not_ready');
            await fsp.rm(this.projectPayload(handle, doc.id), { recursive: true, force: true });
            return this.engine.withTransaction(handle, async tx => {
                await tx.deleteResource(recoveryKey(handle, doc.id));
                return this.receipt(tx, handle, doc.repairOperationId, { purged: true, physicalBytesReleased: null });
            });
        });
    }

    /** Resume only local committed file intents; imported intents are paused by
     * the backup/migration adapter before they can reach this coordinator. */
    async repair(handle) {
        const records = await this.engine.withTransaction(handle, tx => recoveryRecords(tx, handle));
        const results = [];
        for (const row of records) {
            if (!['project', 'backup'].includes(row.doc.target.type) || !['preparing', 'restoring', 'purging'].includes(row.doc.state)) continue;
            try {
                if (row.doc.state === 'purging') await this.purgeProject(handle, row.doc, null, { expiredOnly: false, now: Date.now() });
                else await this.lock(handle, row.doc.target, () => row.doc.state === 'preparing'
                    ? this.finishProjectRemoval(handle, row.doc) : this.finishProjectRestore(handle, row.doc));
                results.push({ id: row.doc.id, repaired: true });
            } catch (error) { results.push({ id: row.doc.id, repaired: false, reason: error.code || error.message }); }
        }
        return results;
    }
}
