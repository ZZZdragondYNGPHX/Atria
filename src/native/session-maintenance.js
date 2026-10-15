import { randomUUID } from 'node:crypto';
import { nativeTaskScheduler } from './task-scheduler.js';
import { NATIVE_RESOURCE_KINDS as K } from './contracts.js';
import { assertWritable } from '../storage/read-only-mode.js';
import { getNativeDocument, hashNativeDocument, putMutable, withNativeResourceWrite } from './repositories/common.js';
import { encodeNativeResourceKey } from '../storage/engines/native-resource-key.js';
import { orchestrationSessionRoots } from './orchestration/reference-roots.js';

const leases = new Map();
const proofs = new WeakMap();
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
export function validateMaintenanceBudget({ now, graceMs, batchSize, scanLimit, maxScanBytes }) {
    if (!Number.isFinite(now) || !Number.isFinite(graceMs) || graceMs < 0
        || !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 256
        || !Number.isSafeInteger(scanLimit) || scanLimit < 1 || scanLimit > 256
        || !Number.isSafeInteger(maxScanBytes) || maxScanBytes < 1 || maxScanBytes > 16 * 1024 * 1024) throw new TypeError('Invalid maintenance budget');
}
async function generation(tx, handle, sessionId) {
    const root = await tx.getResource({ kind: K.session, handle, sessionId });
    if (!root) return null;
    const saves = await tx.listResources({ kind: K.savePoint, handle, sessionId });
    const orchestration = await orchestrationSessionRoots(tx, handle, sessionId);
    return hashNativeDocument({ root: root.integrity, saves: saves.map(item => item.integrity).sort(), orchestration: orchestration.fingerprint });
}
const kinds = [K.sessionRevision, K.sessionState, K.timelineEntry, K.timelineVariant, K.branch];

// SQL Engines expose the original complete list rather than the FS/SQLite scan
// adapter. Apply the same durable key cursor here; list(filter.limit) followed
// by done:true silently skipped the rest of a SQL kind after its first page.
async function listCandidatePage(engine, handle, filter) {
    const all = await engine.withTransaction(handle, tx => tx.listResources({ kind: filter.kind, handle, sessionId: filter.sessionId }));
    const pending = all.sort((left, right) => identity(left.key).localeCompare(identity(right.key)))
        .filter(row => !filter.after || identity(row.key).localeCompare(filter.after) > 0);
    const records = []; let bytes = 0;
    for (const row of pending) {
        const size = Buffer.byteLength(JSON.stringify(row));
        if (records.length && (records.length >= filter.limit || bytes + size > filter.maxBytes)) break;
        records.push(row); bytes += size;
    }
    return { records, cursor: records.length ? identity(records.at(-1).key) : filter.after, done: records.length === pending.length, scanned: records.length, bytes };
}

async function retainedProof(repo, handle, sessionId, current, retention, retainRevisionIds, shouldPause) {
    let cache = proofs.get(repo._engine);
    if (!cache) proofs.set(repo._engine, cache = new Map());
    const key = leaseKey(handle, sessionId), now = Date.now();
    for (const [id, value] of cache) if (value.expiresAt < now) cache.delete(id);
    const prior = cache.get(key);
    if (prior?.generation === current && prior.retention === retention) {
        cache.delete(key); cache.set(key, prior); return prior;
    }
    cache.delete(key);
    const roots = await repo.reachabilitySnapshot(handle, sessionId, { retainRevisionIds, shouldPause });
    const retained = new Set(roots.keys.map(identity));
    const bytes = [...retained].reduce((n, id) => n + id.length * 2 + 64, 0);
    const proof = { generation: roots.generation, retention, retained, bytes, expiresAt: now + 60000 };
    // Only immutable reachability identities are retained, never history bodies.
    // Each use still revalidates persistent roots inside the sweep transaction.
    if (bytes <= 8 * 1024 * 1024) {
        cache.set(key, proof);
        while (cache.size > 8 || [...cache.values()].reduce((n, item) => n + item.bytes, 0) > 8 * 1024 * 1024) cache.delete(cache.keys().next().value);
    }
    return proof;
}

// Speculative reads release engine isolation between dependencies. Their proof
// is accepted only if the root/save generation still matches inside publication.
// Sweep shares that isolation with every root writer; leases are rechecked too.
export async function maintainSession(repo, handle, sessionId, options = {}) {
    assertWritable();
    const budget = { now: Date.now(), graceMs: 60000, batchSize: 32, scanLimit: 128, maxScanBytes: 4 * 1024 * 1024, ...options };
    validateMaintenanceBudget(budget);
    return withNativeResourceWrite(handle, 'maintenance:session:' + sessionId, () => maintain(repo, handle, sessionId, budget));
}
async function maintain(repo, handle, sessionId, { now, graceMs, batchSize, scanLimit, maxScanBytes, signal, retainRevisionIds = [] }) {
    const key = { kind: K.maintenance, handle, scope: 'session:' + sessionId };
    const pause = () => signal?.aborted || nativeTaskScheduler.hasForegroundWork(handle);
    const held = () => Boolean(leases.get(leaseKey(handle, sessionId))?.size);
    if (pause()) return { phase: 'paused', deleted: [] };
    const engine = repo._engine;
    const progress = await engine.withTransaction(handle, tx => getNativeDocument(tx, key));
    const current = await engine.withTransaction(handle, tx => generation(tx, handle, sessionId));
    if (!current) return { phase: 'absent', deleted: [] };
    const retention = hashNativeDocument([...new Set(retainRevisionIds)].sort());
    const valid = progress?.generation === current && progress.retention === retention;
    if (!valid || progress.phase === 'complete' || progress.phase === 'mark') {
        let roots;
        try { roots = await retainedProof(repo, handle, sessionId, current, retention, retainRevisionIds, pause); } catch (error) {
            if (error.code === 'native_maintenance_paused') return { phase: 'paused', deleted: [] };
            throw error;
        }
        const retained = roots.retained, candidates = [];
        const scan = valid && progress.phase === 'mark' ? progress.scan : { kind: 0, after: '' };
        if (pause()) return { phase: 'paused', deleted: [] };
        const filter = { kind: kinds[scan.kind], handle, sessionId, after: scan.after, limit: scanLimit, maxBytes: maxScanBytes };
        const page = engine.scanNativeCandidates ? await engine.scanNativeCandidates(handle, filter)
            : await listCandidatePage(engine, handle, filter);
        for (const record of page.records) if (!retained.has(identity(record.key))) {
            const old = progress?.candidates.find(item => identity(item.key) === identity(record.key) && item.integrity === record.integrity);
            candidates.push({ key: record.key, integrity: record.integrity, quarantinedAt: old?.quarantinedAt ?? now });
        }
        const nextScan = page.done ? { kind: scan.kind + 1, after: '' } : { kind: scan.kind, after: page.cursor };
        return repo.withRunLock(handle, sessionId, () => engine.withTransaction(handle, async tx => {
            if (pause() || await generation(tx, handle, sessionId) !== roots.generation) return { phase: 'paused', deleted: [] };
            const phase = candidates.length ? 'quarantine' : nextScan.kind === kinds.length ? 'complete' : 'mark';
            await putMutable(tx, key, { schemaVersion: 1, generation: roots.generation, retention, phase, candidates, scan: nextScan, cursor: 0 });
            return { phase, candidates: candidates.length, scanned: page.scanned, bytes: page.bytes, deleted: [] };
        }));
    }
    if (held() || pause() || progress.candidates.some(item => now - item.quarantinedAt < graceMs)) return { phase: 'quarantine', deleted: [] };
    return repo.withRunLock(handle, sessionId, () => engine.withTransaction(handle, async tx => {
        if (await generation(tx, handle, sessionId) !== progress.generation || held() || pause()) return { phase: 'paused', deleted: [] };
        const deleted = []; let cursor = progress.cursor;
        const end = Math.min(progress.candidates.length, cursor + batchSize);
        for (; cursor < end; cursor++) {
            const item = progress.candidates[cursor], record = await tx.getResource(item.key);
            if (held() || pause()) break;
            if (!record || record.integrity !== item.integrity || record.updatedAt > item.quarantinedAt) continue;
            if (await tx.deleteResource(item.key)) deleted.push(item.key);
        }
        const phase = cursor < progress.candidates.length ? 'sweep' : progress.scan.kind === kinds.length ? 'complete' : 'mark';
        await putMutable(tx, key, { ...progress, cursor, phase });
        return { phase, deleted };
    }));
}
export function scheduleSessionMaintenance(repo, handle, sessionId, assetStore, { expectedRevisionId } = {}) {
    return repo.withoutRunLockContext(() => nativeTaskScheduler.submit({ owner: handle, kind: 'auxiliary_task', executionClass: 'maintenance',
        anchor: { sessionId }, resources: ['storage:' + handle], key: 'session-gc:' + sessionId, fingerprint: 'session-gc-v2:' + (expectedRevisionId ?? 'automatic'), retry: false,
        fresh: async () => {
            const session = await repo.get(handle, sessionId);
            if (expectedRevisionId && session?.headRevisionId !== expectedRevisionId) throw Object.assign(new Error('native_session_head_conflict'), { code: 'native_session_head_conflict' });
            return Boolean(session);
        },
        run: async ({ signal }) => {
            let result;
            // A short safe slice; durable cursor resumes on the next request.
            for (let i = 0; i < 5; i++) {
                const slice = async () => {
                    if (expectedRevisionId && (await repo.get(handle, sessionId))?.headRevisionId !== expectedRevisionId)
                        throw Object.assign(new Error('native_session_head_conflict'), { code: 'native_session_head_conflict' });
                    return maintainSession(repo, handle, sessionId, { signal });
                };
                result = await (expectedRevisionId ? repo.withRunLock(handle, sessionId, slice) : slice());
                if (['complete', 'quarantine', 'paused', 'absent'].includes(result.phase)) break;
            }
            if (!signal.aborted && !nativeTaskScheduler.hasForegroundWork(handle)) {
                if (assetStore) await assetStore.gcBlobs(handle, { signal });
                await repo._engine.checkpoint?.(handle);
            }
            return result;
        }, finalize: value => value }).result);
}
const maintenanceTimes = new WeakMap();
export function requestSessionMaintenance(repo, handle, sessionId, assetStore) {
    let times = maintenanceTimes.get(repo._engine);
    if (!times) maintenanceTimes.set(repo._engine, times = new Map());
    const key = leaseKey(handle, sessionId), now = Date.now();
    const old = times.get(key);
    if (old?.timer || now - (old?.at ?? 0) < 30000) return;
    const entry = { at: now, timer: null }; times.delete(key); times.set(key, entry);
    while (times.size > 512) { const first = times.keys().next().value; clearTimeout(times.get(first)?.timer); times.delete(first); }
    // Timers only resume scheduler slices; no second execution authority.
    void scheduleSessionMaintenance(repo, handle, sessionId, assetStore).then(result => {
        if (times.get(key) !== entry || result.phase === 'absent') return;
        // Blob work is also incremental, including in an idle Session.
        if (result.phase === 'complete' && !assetStore) return;
        entry.timer = setTimeout(() => { entry.timer = null; entry.at = 0; requestSessionMaintenance(repo, handle, sessionId, assetStore); }, result.phase === 'quarantine' || result.phase === 'complete' ? 60001 : 1000);
        entry.timer.unref?.();
    }).catch(error => {
        if (!['operation_stale', 'operation_cancelled'].includes(error.code)) console.warn('[Native maintenance] Session cleanup failed', { sessionId, code: error.code ?? error.name });
        if (times.get(key) === entry) times.delete(key);
    });
}
export function cancelSessionMaintenance(repo, handle, sessionId) {
    const times = maintenanceTimes.get(repo._engine), key = leaseKey(handle, sessionId);
    clearTimeout(times?.get(key)?.timer); times?.delete(key); proofs.get(repo._engine)?.delete(key);
}
