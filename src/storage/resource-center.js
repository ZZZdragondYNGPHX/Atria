import { randomUUID } from 'node:crypto';
import { NATIVE_RESOURCE_KINDS as K } from '../native/contracts.js';
import { NativeRecoveryService, RECOVERABLE_DESCRIPTORS } from '../native/recovery-service.js';
import { nativeRecord } from '../native/repositories/common.js';
import { measureAccount, readAccountContent } from './resource-accounting.js';
import { classifyNativeRecord, resourceFingerprint, STORAGE_CENTER_PROTOCOL } from './resource-catalog.js';
import { ConflictError, NotFoundError } from './errors.js';
import { RuntimeCheckpointStore } from '../native/model-prompt-runtime/runtime-checkpoint-store.js';

const taskKey = (handle, id) => ({ kind: K.maintenance, handle, scope: 'storage-center:task:' + id });
const targetId = target => resourceFingerprint({ type: target.type, id: target.id, ...(target.resourceType ? { resourceType: target.resourceType } : {}), ...(target.revision ? { revision: target.revision } : {}) });
const rowTarget = row => {
    for (const [type, [kind, field]] of Object.entries(RECOVERABLE_DESCRIPTORS)) {
        if (row.key.kind === kind) return { type, id: row.key[field],
            ...(type === 'versioned' ? { resourceType: row.key.resourceType } : {}),
            ...(type === 'retrieval' ? { revision: row.key.revision } : {}) };
    }
    return null;
};
function ownerTarget(row) {
    const key = row.key;
    if (row.owner) return row.owner;
    if (key.sessionId) return { type: 'session', id: key.sessionId };
    if (key.projectId) return { type: 'project', id: key.projectId };
    if (key.personaId) return { type: 'persona', id: key.personaId };
    if (key.worldId) return { type: 'world', id: key.worldId };
    if (key.knowledgeBaseId) return { type: 'knowledge', id: key.knowledgeBaseId };
    if ([K.package, K.packageVersion, K.packageState].includes(key.kind)) return { type: 'package', id: key.packageId };
    if (key.resourceType) return { type: 'versioned', id: key.resourceId, resourceType: key.resourceType };
    if ([K.agentExperience, K.agentEvolution].includes(key.kind)) return { type: 'experience', id: key.scopeId };
    return rowTarget(row);
}

/** Aggregates business authorities; persistent content remains in the Engine. */
export class ResourceCenterService {
    constructor(options) {
        this.recovery = new NativeRecoveryService(options);
        Object.assign(this, { engine: options.engine, directoriesByHandle: options.directoriesByHandle, quotaLimit: options.quotaLimit });
        this.running = new Map();
    }
    async snapshot(handle) {
        const snapshot = await measureAccount({ engine: this.engine, handle, directories: this.directoriesByHandle(handle) });
        const { native } = await this.engine.withTransaction(handle, tx => readAccountContent(tx, handle));
        const nativeByKey = new Map(native.map(row => [resourceFingerprint(row.key), row]));
        const unitOwners = new Map(snapshot.units.filter(unit => unit.owner).map(unit => [resourceFingerprint(unit.key), unit.owner]));
        const objects = new Map();
        for (const row of native) {
            if (row.doc == null) continue;
            if (unitOwners.has(resourceFingerprint(row.key))) continue;
            if ([K.versionedJsonResource, K.versionedJsonResourceRevision].includes(row.key.kind) && row.key.resourceType.startsWith('atri.visual.')
                && (row.doc?.sessionId || row.doc?.value?.sessionId)) continue;
            const target = rowTarget(row);
            if (!target) continue;
            const category = classifyNativeRecord(row);
            objects.set(targetId(target), { id: targetId(target), target, name: row.doc.displayName || row.doc.displayTitle || row.doc.name || target.id,
                category, bytes: 0, units: 0, updatedAt: row.updatedAt, managed: true });
        }
        for (const project of await this.recovery.projects.list(handle)) {
            const target = { type: 'project', id: project.projectId };
            objects.set(targetId(target), { id: targetId(target), target, name: project.displayName || project.projectId, category: 'projects', bytes: 0, units: 0, updatedAt: project.updatedAt, managed: true });
        }
        for (const unit of snapshot.units) {
            let owner = null;
            if (unit.key) {
                const record = nativeByKey.get(resourceFingerprint(unit.key));
                const sessionId = unit.key.resourceType?.startsWith('atri.visual.') && (record?.doc?.sessionId || record?.doc?.value?.sessionId);
                owner = sessionId ? { type: 'session', id: sessionId } : ownerTarget(unit);
            } else if (unit.relative?.startsWith('projects/')) owner = { type: 'project', id: unit.relative.split('/')[1] };
            const object = owner && objects.get(targetId(owner));
            if (object) { object.bytes += unit.bytes; object.units++; } else if (/^backups\/[^/]+\.(jsonl?|zip|tar|gz)$/i.test(unit.relative || '')) {
                const target = { type: 'backup', id: unit.relative.slice(8) };
                objects.set(targetId(target), { id: targetId(target), target, name: target.id, category: 'recovery', bytes: unit.bytes, units: 1, updatedAt: unit.updatedAt, managed: true });
            } else objects.set(unit.id, { id: unit.id, name: unit.relative || unit.key?.kind || 'Legacy stored content', category: unit.category,
                bytes: unit.bytes, units: 1, updatedAt: unit.updatedAt, managed: false,
                reason: unit.source === 'legacy' || unit.category === 'advanced' ? 'advanced-inspection' : 'owned-version-or-maintenance-data' });
        }
        const resources = [...objects.values()].sort((a, b) => b.bytes - a.bytes || a.id.localeCompare(b.id));
        for (const [category, total] of Object.entries(snapshot.categories)) total.objectCount = resources.filter(resource => resource.category === category).length;
        const { units: _units, ...summary } = snapshot;
        const suggestions = [];
        const checkpoints = new RuntimeCheckpointStore({ engine: this.engine, handle });
        for (const row of native.filter(row => row.key.kind === K.runtimeCheckpoint && checkpoints.expired(row))) {
            suggestions.push({ ...await checkpoints.inspectExpired(row.key.checkpointId), target: { type: 'expired-checkpoint', id: row.key.checkpointId }, safe: true });
        }
        const progress = native.find(row => row.key.kind === K.maintenance && row.key.scope === 'blobs')?.doc;
        for (const candidate of progress?.candidates ?? []) {
            try {
                const checked = await this.recovery.assets.inspectGarbageBlob(handle, candidate.hash);
                suggestions.push({ ...checked, target: { type: 'garbage-blob', id: candidate.hash }, name: candidate.hash, safe: true });
            } catch (error) { if (!(error instanceof ConflictError) && error.code !== 'ENOENT') summary.errors.push({ source: 'blob-gc', reason: error.code || error.message }); }
        }
        return { ...summary, quotaBytes: await this.quotaLimit(handle), resources, suggestions,
            recovery: await this.recovery.list(handle), safeCleanupBytes: suggestions.reduce((sum, item) => sum + item.bytes, 0) };
    }
    async detail(handle, target) { return this.recovery.inspect(handle, target); }
    async tasks(handle) {
        return this.engine.withTransaction(handle, async tx => (await tx.listResources({ kind: K.maintenance, handle }))
            .filter(row => row.doc?.protocol === STORAGE_CENTER_PROTOCOL && row.doc.type === 'task').map(row => row.doc)
            .sort((a, b) => b.createdAt - a.createdAt));
    }
    async task(handle, id) {
        const row = await this.engine.withTransaction(handle, tx => tx.getResource(taskKey(handle, id)));
        if (!row || row.doc?.protocol !== STORAGE_CENTER_PROTOCOL) throw new NotFoundError('Storage task');
        return row.doc;
    }
    async saveTask(handle, doc) {
        await this.engine.withTransaction(handle, tx => tx.putResource(taskKey(handle, doc.id), nativeRecord(doc)));
        return doc;
    }
    async preview(handle, action, targets) {
        if (!['trash', 'restore', 'purge', 'clean'].includes(action) || !Array.isArray(targets) || !targets.length) throw new TypeError('Invalid storage preview');
        const unique = new Map(targets.map(target => [targetId(target), target]));
        const items = [];
        for (const target of unique.values()) {
            try {
                const checked = action === 'clean' && target.type === 'expired-checkpoint' ? await new RuntimeCheckpointStore({ engine: this.engine, handle }).inspectExpired(target.id)
                    : action === 'clean' && target.type === 'garbage-blob' ? await this.recovery.assets.inspectGarbageBlob(handle, target.id)
                        : action === 'trash' ? await this.recovery.inspect(handle, target) : await this.recovery.preflightRestore(handle, target.id);
                const allowed = action === 'clean' ? ['garbage-blob', 'expired-checkpoint'].includes(target.type) : action === 'purge' ? checked.state === 'retained' : checked.allowed;
                items.push({ target, version: checked.version, name: checked.name || target.id, bytes: checked.bytes,
                    status: allowed ? 'pending' : 'blocked', reason: allowed ? null : checked.reason || 'native_recovery_not_ready',
                    consequences: checked.consequences || [], ownedTargets: checked.ownedTargets || [] });
            } catch (error) {
                if (!(error instanceof ConflictError) && !(error instanceof NotFoundError) && !(error instanceof TypeError)) throw error;
                items.push({ target, version: null, name: target.id, bytes: null, status: 'blocked', reason: error.code || error.message, consequences: [] });
            }
        }
        const fixed = items.filter(item => !items.some(parent => parent !== item && parent.status === 'pending'
            && parent.ownedTargets.some(target => targetId(target) === targetId(item.target))));
        const doc = { protocol: STORAGE_CENTER_PROTOCOL, type: 'task', id: randomUUID(), scope: 'server', handle, action,
            status: 'preview', createdAt: Date.now(), updatedAt: Date.now(), stopRequested: false, items: fixed, deduplicatedCount: targets.length - fixed.length,
            processedBytes: 0, estimatedPhysicalRelease: null,
            retentionDays: action === 'trash' ? 30 : null, recoverable: action === 'trash' };
        return this.saveTask(handle, doc);
    }
    async execute(handle, id) {
        const doc = await this.task(handle, id);
        if (doc.status === 'preview') {
            doc.status = 'queued'; doc.updatedAt = Date.now(); await this.saveTask(handle, doc);
        } else if (['paused-review', 'failed', 'stopped'].includes(doc.status)) throw new ConflictError('storage_task_requires_new_preview');
        if (!this.running.has(handle + ':' + id) && ['queued', 'running'].includes(doc.status)) {
            const key = handle + ':' + id;
            const work = this.run(handle, id).catch(() => {}).finally(() => this.running.delete(key));
            this.running.set(key, work);
        }
        return this.task(handle, id);
    }
    async stop(handle, id) {
        const doc = await this.task(handle, id);
        doc.stopRequested = true; doc.updatedAt = Date.now();
        return this.saveTask(handle, doc);
    }
    async run(handle, id) {
        let task = await this.task(handle, id);
        task.status = 'running'; await this.saveTask(handle, task);
        for (let index = 0; index < task.items.length; index++) {
            task = await this.task(handle, id);
            if (task.stopRequested) { task.status = 'stopped'; break; }
            const item = task.items[index];
            if (item.status !== 'pending') continue;
            const operationId = task.id + '_' + index;
            try {
                const result = task.action === 'clean' ? item.target.type === 'expired-checkpoint'
                    ? await new RuntimeCheckpointStore({ engine: this.engine, handle }).cleanExpired(item.target.id, item.version)
                    : await this.recovery.assets.cleanGarbageBlob(handle, item.target.id, item.version) : task.action === 'trash'
                    ? await this.recovery.trash(handle, item.target, item.version, operationId)
                    : task.action === 'restore' ? await this.recovery.restore(handle, item.target.id, item.version, operationId)
                        : await this.recovery.purge(handle, item.target.id, item.version);
                item.status = 'succeeded'; item.result = result;
                task.processedBytes += item.bytes || 0;
            } catch (error) {
                item.status = error.code === 'storage_preview_stale' ? 'repreview' : 'failed';
                item.reason = error.code || error.message;
                const individual = error instanceof ConflictError || error instanceof NotFoundError || error instanceof TypeError;
                if (!individual) task.status = 'failed';
            }
            task.updatedAt = Date.now();
            // Preserve a concurrently received stop request at object boundaries.
            task.stopRequested ||= (await this.task(handle, id)).stopRequested;
            await this.saveTask(handle, task);
            if (task.status === 'failed') break;
        }
        if (task.status === 'running') task.status = task.items.some(item => ['failed', 'blocked', 'repreview'].includes(item.status)) ? 'partial' : 'completed';
        task.updatedAt = Date.now();
        await this.saveTask(handle, task);
        return task;
    }
}
