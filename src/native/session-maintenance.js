import { randomUUID } from 'node:crypto';
import { nativeTaskScheduler } from './task-scheduler.js';
import { NATIVE_RESOURCE_KINDS as K } from './contracts.js';
import { getNativeDocument, hashNativeDocument, putMutable } from './repositories/common.js';
import { encodeNativeResourceKey } from '../storage/engines/native-resource-key.js';

const leases = new Map();
const identity = key => key.kind + ':' + encodeNativeResourceKey(key);
const leaseKey = (handle, sessionId) => JSON.stringify([handle, sessionId]);
export function acquireSessionReadLease(handle, sessionId, revisionId) {
    const key = leaseKey(handle, sessionId), id = randomUUID();
    if (!leases.has(key)) leases.set(key, new Map());
    leases.get(key).set(id, revisionId);
    let released = false;
    return () => { if (released) return; released = true; const values = leases.get(key); values?.delete(id); if (!values?.size) leases.delete(key); };
}
export function sessionMaintenanceStats() { return { leaseScopes: leases.size, leases: [...leases.values()].reduce((n, scope) => n + scope.size, 0) }; }
async function generation(tx, handle, sessionId) {
    const root = await tx.getResource({ kind: K.session, handle, sessionId });
    if (!root) return null;
    const saves = await tx.listResources({ kind: K.savePoint, handle, sessionId });
    return hashNativeDocument({ root: root.integrity, saves: saves.map(item => item.integrity).sort() });
}

// Only unreachable resources are candidates. The durable phase/cursor is local
// maintenance state, never a replacement for a Revision or a gameplay authority.
export async function maintainSession(repo, handle, sessionId, { now = Date.now(), graceMs = 60000, batchSize = 32, signal } = {}) {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 256 || graceMs < 0) throw new TypeError('Invalid maintenance batch');
    const key = { kind: K.sessionState, handle, sessionId, namespace: 'atri_gc_progress', head: 'current' };
    const pause = () => signal?.aborted || nativeTaskScheduler.hasForegroundWork(handle);
    if (pause()) return { phase: 'paused', deleted: [] };
    const engine = repo._engine;
    const progress = await engine.withTransaction(handle, tx => getNativeDocument(tx, key));
    const current = await engine.withTransaction(handle, tx => generation(tx, handle, sessionId));
    if (!current) return { phase: 'absent', deleted: [] };
    if (!progress || progress.phase === 'complete' || progress.generation !== current) {
        const roots = await repo.reachabilitySnapshot(handle, sessionId);
        const retained = new Set(roots.keys.map(identity)), candidates = [];
        for (const kind of [K.sessionRevision, K.sessionState, K.timelineEntry, K.timelineVariant, K.branch]) {
            if (pause()) return { phase: 'paused', deleted: [] };
            const records = engine.scanNativeCandidates ? await engine.scanNativeCandidates(handle, { kind, handle, sessionId })
                : await engine.withTransaction(handle, tx => tx.listResources({ kind, handle, sessionId }));
            for (const record of records) if (!retained.has(identity(record.key)) && record.key.namespace !== 'atri_gc_progress') {
                const old = progress?.candidates.find(item => identity(item.key) === identity(record.key) && item.integrity === record.integrity);
                candidates.push({ key: record.key, integrity: record.integrity, quarantinedAt: old?.quarantinedAt ?? now });
                if (candidates.length >= 256) break;
            }
            if (candidates.length >= 256) break;
        }
        return repo.withRunLock(handle, sessionId, () => engine.withTransaction(handle, async tx => {
            if (await generation(tx, handle, sessionId) !== roots.generation) return { phase: 'paused', deleted: [] };
            const next = { schemaVersion: 1, generation: roots.generation, phase: candidates.length ? 'quarantine' : 'complete', candidates, cursor: 0 };
            await putMutable(tx, key, next); return { phase: next.phase, candidates: candidates.length, deleted: [] };
        }));
    }
    if (leases.get(leaseKey(handle, sessionId))?.size || pause() || progress.candidates.some(item => now - item.quarantinedAt < graceMs)) return { phase: 'quarantine', deleted: [] };
    return repo.withRunLock(handle, sessionId, () => engine.withTransaction(handle, async tx => {
        if (await generation(tx, handle, sessionId) !== progress.generation || leases.get(leaseKey(handle, sessionId))?.size || pause()) return { phase: 'paused', deleted: [] };
        const deleted = [], end = Math.min(progress.candidates.length, progress.cursor + batchSize);
        for (const item of progress.candidates.slice(progress.cursor, end)) {
            const record = await tx.getResource(item.key);
            if (!record || record.integrity !== item.integrity || record.updatedAt > item.quarantinedAt) continue;
            if (await tx.deleteResource(item.key)) deleted.push(item.key);
        }
        await putMutable(tx, key, { ...progress, cursor: end, phase: end === progress.candidates.length ? 'complete' : 'sweep' });
        return { phase: end === progress.candidates.length ? 'complete' : 'sweep', deleted };
    }));
}
export function scheduleSessionMaintenance(repo, handle, sessionId) {
    return repo.withoutRunLockContext(() => nativeTaskScheduler.submit({ owner: handle, kind: 'auxiliary_task', executionClass: 'maintenance',
        anchor: { sessionId }, resources: ['storage:' + handle], key: 'session-gc:' + sessionId, fingerprint: 'session-gc-v1', retry: false,
        fresh: async () => Boolean(await repo.get(handle, sessionId)),
        run: async ({ signal }) => {
            const marked = await maintainSession(repo, handle, sessionId, { signal });
            const result = marked.phase === 'quarantine' ? await maintainSession(repo, handle, sessionId, { signal }) : marked;
            if (!signal.aborted && !nativeTaskScheduler.hasForegroundWork(handle)) await repo._engine.checkpoint?.(handle);
            return result;
        }, finalize: value => value }).result);
}
const maintenanceTimes = new WeakMap();
export function requestSessionMaintenance(repo, handle, sessionId) {
    let times = maintenanceTimes.get(repo._engine);
    if (!times) maintenanceTimes.set(repo._engine, times = new Map());
    const key = leaseKey(handle, sessionId), now = Date.now();
    if (now - (times.get(key) ?? 0) < 30000) return;
    times.delete(key); times.set(key, now);
    while (times.size > 512) times.delete(times.keys().next().value);
    // Detached maintenance cannot inherit the foreground's reentrant domain lock.
    void scheduleSessionMaintenance(repo, handle, sessionId).catch(() => {});
}
