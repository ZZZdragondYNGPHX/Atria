import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { installFixture, services } from './helpers/session-fixture.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { maintainSession, acquireSessionReadLease, sessionMaintenanceStats } from '../../src/native/session-maintenance.js';
import { getNativeDocument } from '../../src/native/repositories/common.js';
import { nativeTaskScheduler } from '../../src/native/task-scheduler.js';

const progressKey = (handle, sessionId) => ({ kind: K.maintenance, handle, scope: 'session:' + sessionId });
const readProgress = (h, sessionId) => h.engine.withTransaction(h.handle, tx => getNativeDocument(tx, progressKey(h.handle, sessionId)));

describe.each(CONTRACT_HARNESSES)('safe maintenance — $name', ({ make }) => {
    let h, f, view, sessionId, now;
    beforeEach(async () => { h = await make(); f = await installFixture(h); view = await f.core.create(h.handle, f.start); sessionId = view.session.sessionId; now = Date.now() + 1000; });
    afterEach(async () => { await h.engine.close(); await h.cleanup(); });
    async function orphan() {
        const revision = { ...view.revision, revisionId: createNativeId('revision') };
        await f.sessionRepo.putRevision(h.handle, revision);
        return revision.revisionId;
    }
    test('quarantine, restart cursor, bounded sweeps and reader leases protect full committed closure', async () => {
        const ids = await Promise.all(Array.from({ length: 5 }, orphan));
        const budget = { now, scanLimit: 2, batchSize: 1 };
        let result;
        for (let i = 0; i < 10; i++) { result = await maintainSession(f.sessionRepo, h.handle, sessionId, budget); if (result.phase === 'quarantine') break; }
        expect(result.phase).toBe('quarantine'); expect(result.candidates).toBeLessThanOrEqual(2);
        expect((await maintainSession(f.sessionRepo, h.handle, sessionId, budget)).deleted).toEqual([]);
        const release = acquireSessionReadLease(h.handle, sessionId, view.revision.revisionId);
        await h.engine.close();
        h.engine = new h.engine.constructor({ url: h.url, nativeHostTopology: h.engine.nativeHostTopology, directoriesByHandle: () => h.dirs });
        f = services(h);
        const resumed = f.sessionRepo;
        expect((await maintainSession(resumed, h.handle, sessionId, { ...budget, now: now + 60001 })).deleted).toEqual([]);
        release(); release(); expect(sessionMaintenanceStats().leases).toBe(0);
        const deleted = [];
        for (let i = 0; i < 30; i++) {
            const step = await maintainSession(resumed, h.handle, sessionId, { ...budget, now: now + (i + 1) * 60001 });
            expect(step.deleted.length).toBeLessThanOrEqual(1); deleted.push(...step.deleted.map(key => key.revisionId));
            if (step.phase === 'complete') break;
        }
        expect(new Set(deleted)).toEqual(new Set(ids));
        expect((await f.core.load(h.handle, sessionId)).timeline[0].content).toBe('Opening');
        expect((await readProgress(h, sessionId)).phase).toBe('complete');
    });
    test('retainRevisionIds joins dependency roots and invalidates prior quarantine', async () => {
        const id = await orphan();
        await maintainSession(f.sessionRepo, h.handle, sessionId, { now });
        expect(await f.sessionRepo.gcRevisions(h.handle, sessionId, { now: now + 60001, retainRevisionIds: [id] })).toEqual([]);
        expect(await f.sessionRepo.getRevision(h.handle, sessionId, id)).not.toBeNull();
        expect((await f.core.load(h.handle, sessionId)).revision).toEqual(view.revision);
    });
    test('generation change during speculative Mark is rejected; concurrent passes share one cursor', async () => {
        await orphan();
        const reachability = f.sessionRepo.reachabilitySnapshot.bind(f.sessionRepo);
        f.sessionRepo.reachabilitySnapshot = async (...args) => {
            const roots = await reachability(...args);
            await f.core.createSavePoint(h.handle, sessionId, { kind: 'manual' });
            f.sessionRepo.reachabilitySnapshot = reachability;
            return roots;
        };
        expect((await maintainSession(f.sessionRepo, h.handle, sessionId, { now })).phase).toBe('paused');
        expect(await readProgress(h, sessionId)).toBeNull();
        await Promise.all([maintainSession(f.sessionRepo, h.handle, sessionId, { now }), maintainSession(services(h).sessionRepo, h.handle, sessionId, { now })]);
        expect((await readProgress(h, sessionId)).cursor).toBe(0);
        await f.core.appendTimeline(h.handle, sessionId, { role: 'user', content: 'New committed root' });
        expect((await maintainSession(f.sessionRepo, h.handle, sessionId, { now: now + 60001 })).deleted).toEqual([]);
        expect((await f.core.load(h.handle, sessionId)).timeline.at(-1).content).toBe('New committed root');
    });
    test('foreground work and abort pause maintenance without publishing progress', async () => {
        let finish;
        const operation = nativeTaskScheduler.submit({ owner: h.handle, kind: 'turn', executionClass: 'turn_blocking', resources: [], key: sessionId,
            fingerprint: sessionId, fresh: () => true, run: () => new Promise(resolve => { finish = resolve; }), finalize: value => value });
        await Promise.resolve(); await Promise.resolve();
        expect((await maintainSession(f.sessionRepo, h.handle, sessionId)).phase).toBe('paused');
        finish(); await operation.result;
        const controller = new AbortController(); controller.abort();
        expect((await maintainSession(f.sessionRepo, h.handle, sessionId, { signal: controller.signal })).phase).toBe('paused');
        expect(await readProgress(h, sessionId)).toBeNull();
        expect((await maintainSession(f.sessionRepo, h.handle, sessionId)).phase).toBeDefined();
        const checkpoint = await h.engine.checkpoint?.(h.handle);
        expect(checkpoint?.[0].busy ?? 0).toBe(0);
    });
    test('open Blob delivery lease blocks physical deletion after its ref is removed', async () => {
        const bytes = Buffer.from('held delivery'), hash = await f.assetStore.putBlob(h.handle, bytes);
        const ref = { assetId: createNativeId('asset'), contentHash: hash, size: bytes.length, mimeType: 'text/plain', metadata: {} };
        await f.assetStore.put(h.handle, ref, bytes);
        const delivery = await f.assetStore.openDelivery(h.handle, ref.assetId);
        await f.assetStore.deleteRef(h.handle, ref.assetId);
        for (let i = 0; i < 10; i++) {
            expect(await f.assetStore.gcBlobs(h.handle, { now })).toEqual([]);
            const progress = await h.engine.withTransaction(h.handle, tx => getNativeDocument(tx, { kind: K.maintenance, handle: h.handle, scope: 'blobs' }));
            if (progress.candidates.some(item => item.hash === hash)) break;
        }
        expect(await f.assetStore.gcBlobs(h.handle, { now: now + 60001 })).toEqual([]);
        expect(await f.assetStore.hasBlob(h.handle, hash)).toBe(true);
        await delivery.close(); await delivery.close();
        expect(await f.assetStore.gcBlobs(h.handle, { now: now + 60001 })).toEqual([hash]);
    });
    test('reserved progress and invalid budgets cannot alter authority', async () => {
        await expect(f.core.updateState(h.handle, sessionId, { atri_gc_progress: {} })).rejects.toThrow('Reserved');
        for (const options of [{ batchSize: 0 }, { scanLimit: NaN }, { maxScanBytes: -1 }, { graceMs: NaN }]) await expect(maintainSession(f.sessionRepo, h.handle, sessionId, options)).rejects.toThrow('budget');
    });
    test('Blob quarantine, restart, publication lease, re-reference and bounded concurrent sweep', async () => {
        const hashes = [];
        for (let i = 0; i < 3; i++) hashes.push(await f.assetStore.putBlob(h.handle, Buffer.from('orphan ' + i)));
        const collect = async (store, time) => {
            const removed = [];
            for (let i = 0; i < 30; i++) removed.push(...await store.gcBlobs(h.handle, { now: time, batchSize: 1 }));
            return removed;
        };
        expect(await collect(f.assetStore, now)).toEqual([]);
        const bytes = Buffer.from('orphan 0'), ref = { assetId: createNativeId('asset'), contentHash: hashes[0], size: bytes.length, mimeType: 'text/plain', metadata: {} };
        let publishing, proceed;
        const gate = new Promise(resolve => { proceed = resolve; });
        const started = new Promise(resolve => { publishing = resolve; });
        const publish = f.assetStore.withBlobLease(h.handle, hashes[0], async () => { publishing(); await gate; return f.assetStore.put(h.handle, ref, bytes); });
        await started;
        const sweep = collect(services(h).assetStore, now + 60001);
        proceed(); await publish;
        const removed = await sweep;
        expect(removed).not.toContain(hashes[0]);
        expect((await f.assetStore.read(h.handle, ref.assetId)).bytes.toString()).toBe('orphan 0');
        const more = await Promise.all([collect(f.assetStore, now + 120002), collect(services(h).assetStore, now + 180003)]);
        expect(new Set([...removed, ...more.flat()])).toEqual(new Set(hashes.slice(1)));
        await expect(f.assetStore.gcBlobs(h.handle, { batchSize: -2 })).rejects.toThrow('budget');
    });
});
