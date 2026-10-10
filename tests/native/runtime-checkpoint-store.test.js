import { expect, test } from '@jest/globals';
import { randomBytes } from 'node:crypto';
import { RuntimeCheckpointStore, runtimeCheckpointLimits } from '../../src/native/model-prompt-runtime/runtime-checkpoint-store.js';
import { hashNativeDocument, nativeRecord } from '../../src/native/repositories/common.js';
import { NATIVE_RESOURCE_KINDS } from '../../src/native/contracts.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';
import { inspectAtriaSaveContainer } from '../../src/native/save-container.js';
import { snapshotUser, restoreFromSnapshot } from '../../src/storage/migration/backup.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeModelPromptPersistence } from '../../src/native/model-prompt-runtime/persistence.js';

const harnesses = [['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]];
test.each(harnesses)('Runtime checkpoint %s original deleted configuration versions survive account recovery and same-ID recreation', async (_name, make) => {
    const h = await make();
    try {
        const seeded = await seedGenerationProfiles({ ...h, roles: ['studio'], endpoint: 'http://127.0.0.1:1/v1/responses' }); const p = seeded.persistence;
        const connection = await p.getConnectionProfile(h.handle, seeded.connection.connectionProfileId);
        const model = await p.getModelProfile(h.handle, seeded.model.modelProfileId);
        const route = await p.getRuntimeRoute(h.handle, seeded.routes[0].runtimeRouteId);
        const keys = [['routes', { kind: NATIVE_RESOURCE_KINDS.runtimeRoute, handle: h.handle, runtimeRouteId: route.runtimeRouteId }],
            ['models', { kind: NATIVE_RESOURCE_KINDS.modelProfile, handle: h.handle, modelProfileId: model.modelProfileId }],
            ['connections', { kind: NATIVE_RESOURCE_KINDS.connectionProfile, handle: h.handle, connectionProfileId: connection.connectionProfileId }]];
        const originals = [];
        for (const [kind, key] of keys) { originals.push(await h.engine.withTransaction(h.handle, tx => tx.getResource(key))); await p.deleteProfile(h.handle, kind, Object.values(key).at(-1)); }
        const backupPath = await snapshotUser({ handle: h.handle, userRoot: h.dirs.root, backupRoot: h.backupRoot, engine: h.engine });
        await restoreFromSnapshot({ handle: h.handle, userRoot: h.dirs.root, backupPath, engine: h.engine });
        await h.engine.close();
        const cold = new NativeModelPromptPersistence({ engine: h.engine });
        expect(await cold.listRuntimeRoutes(h.handle)).toEqual([]); expect(await cold.listModelProfiles(h.handle)).toEqual([]); expect(await cold.listConnectionProfiles(h.handle)).toEqual([]);
        await cold.saveConnectionProfile(h.handle, connection); await cold.saveModelProfile(h.handle, model); await cold.saveRuntimeRoute(h.handle, route);
        for (const [index, [, key]] of keys.entries()) {
            const current = await h.engine.withTransaction(h.handle, tx => tx.getResource(key));
            expect(current.integrity).toBe(originals[index].integrity); expect(current.updatedAt).toBeGreaterThan(originals[index].updatedAt);
        }
    } finally { await h.cleanup(); }
});
function fixture(handle, now = 1000) {
    const binding = { schemaVersion: 1, ownerFingerprint: hashNativeDocument(handle), pathFingerprint: hashNativeDocument('path'),
        executionScope: { kind: 'task', projectId: 'project', taskId: 'task' }, continuity: 'task' };
    const entry = { binding, bindingFingerprint: hashNativeDocument(binding), sequence: [{ role: 'user', content: 'Read' }],
        content: [{ type: 'reasoning', encrypted_content: 'PRIVATE-CHECKPOINT' }], text: '', calls: [], expiresAt: now + runtimeCheckpointLimits.ttlMs };
    const state = { schemaVersion: 1, checkpointId: randomBytes(32).toString('hex'), bindingFingerprint: entry.bindingFingerprint, text: '', calls: [] };
    const sequence = [...entry.sequence, { role: 'assistant', content: '', providerState: state }];
    return { entry, state, sequence, binding };
}
test.each(harnesses)('Runtime checkpoint %s cold store reopens exact private state; tampering, wrong owner and changed prefix cannot revive it', async (_name, make) => {
    const h = await make();
    try {
        const store = new RuntimeCheckpointStore({ ...h, now: () => 1000 }); const f = fixture(h.handle);
        await store.save(f.state, f.entry);
        const cold = new RuntimeCheckpointStore({ ...h, now: () => 1001 });
        expect((await cold.read(f.state, f.binding, f.sequence, 1)).content).toEqual(f.entry.content);
        await expect(new RuntimeCheckpointStore({ ...h, handle: 'other', now: () => 1001 }).read(f.state, f.binding, f.sequence, 1)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
        await expect(cold.read({ ...f.state, text: 'forged' }, f.binding, f.sequence, 1)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
        expect((await cold.read(f.state, f.binding, f.sequence, 1)).content).toEqual(f.entry.content);
        await expect(cold.read(f.state, f.binding, [{ role: 'user', content: 'Edited' }, f.sequence[1]], 1)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
        await expect(cold.read(f.state, f.binding, f.sequence, 1)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
        const bad = fixture(h.handle); await store.save(bad.state, bad.entry);
        await h.engine.withTransaction(h.handle, async tx => {
            const key = store.key(bad.state.checkpointId); const row = await tx.getResource(key);
            await tx.putResource(key, { ...row, doc: { ...row.doc, content: ['CORRUPT'] } });
        });
        await expect(cold.read(bad.state, bad.binding, bad.sequence, 1)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
        expect(await h.engine.withTransaction(h.handle, tx => tx.getResource(store.key(bad.state.checkpointId)))).toBeNull();
    } finally { await h.cleanup(); }
});
test.each(harnesses)('Runtime checkpoint %s original account snapshot/recovery preserves private bytes and revalidates bindings', async (_name, make) => {
    const h = await make();
    try {
        const store = new RuntimeCheckpointStore({ ...h, now: () => 1000 }); const f = fixture(h.handle);
        await store.save(f.state, f.entry);
        const backupPath = await snapshotUser({ handle: h.handle, userRoot: h.dirs.root, backupRoot: h.backupRoot, engine: h.engine });
        await store.discard(f.binding);
        expect(await h.engine.withTransaction(h.handle, tx => tx.getResource(store.key(f.state.checkpointId)))).toBeNull();
        await restoreFromSnapshot({ handle: h.handle, userRoot: h.dirs.root, backupPath, engine: h.engine });
        const cold = new RuntimeCheckpointStore({ ...h, now: () => 1001 });
        expect((await cold.read(f.state, f.binding, f.sequence, 1)).content).toEqual(f.entry.content);
        await expect(cold.read(f.state, { ...f.binding, policy: 'changed' }, f.sequence, 1)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
        await expect(cold.read(f.state, f.binding, f.sequence, 1)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
    } finally { await h.cleanup(); }
});
test.each(harnesses)('Runtime checkpoint %s exact path invalidation, TTL, read-only and storage failures deny recovery', async (_name, make) => {
    const h = await make();
    try {
        let now = 1000; const store = new RuntimeCheckpointStore({ ...h, now: () => now }); const f = fixture(h.handle);
        await store.save(f.state, f.entry);
        await expect(store.read(f.state, { ...f.binding, pathFingerprint: hashNativeDocument('changed') }, f.sequence, 1)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
        await expect(store.read(f.state, f.binding, f.sequence, 1)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
        const expired = fixture(h.handle); await store.save(expired.state, expired.entry); now += runtimeCheckpointLimits.ttlMs;
        await expect(store.read(expired.state, expired.binding, expired.sequence, 1)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
        const active = fixture(h.handle, now); await store.save(active.state, active.entry);
        setReadOnly(true);
        await expect(store.read(active.state, active.binding, active.sequence, 1)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
        await expect(store.discard(active.binding)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
        setReadOnly(false); expect((await store.read(active.state, active.binding, active.sequence, 1)).content).toEqual(active.entry.content);
        const broken = new RuntimeCheckpointStore({ engine: { withTransaction: async () => { throw new Error('storage unavailable'); } }, handle: h.handle });
        await expect(broken.discard(f.binding)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
    } finally { setReadOnly(false); await h.cleanup(); }
});
test.each(harnesses)('Runtime checkpoint %s bounds full entries/count/total bytes and excludes opaque records from both portable Save exports', async (_name, make) => {
    const h = await make();
    try {
        let now = 1000; const store = new RuntimeCheckpointStore({ ...h, now: () => now }); const first = fixture(h.handle);
        await store.save(first.state, first.entry);
        const large = fixture(h.handle); large.entry.content = ['x'.repeat(runtimeCheckpointLimits.entryBytes)];
        await expect(store.save(large.state, large.entry)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
        // Real engine eviction uses full persisted bytes, including public prefix.
        for (let i = 0; i < 9; i++) { now++; const item = fixture(h.handle, now); item.entry.content = ['x'.repeat(1900000)]; await store.save(item.state, item.entry); }
        let rows = await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: NATIVE_RESOURCE_KINDS.runtimeCheckpoint, handle: h.handle }));
        expect(rows.reduce((sum, row) => sum + Buffer.byteLength(JSON.stringify(row.doc)), 0)).toBeLessThanOrEqual(runtimeCheckpointLimits.totalBytes);
        expect(rows.length).toBeLessThan(10);
        await store.discard(first.binding);
        for (let i = 0; i < 129; i++) { now++; const item = fixture(h.handle, now); await store.save(item.state, item.entry); }
        rows = await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: NATIVE_RESOURCE_KINDS.runtimeCheckpoint, handle: h.handle }));
        expect(rows).toHaveLength(128);
        const services = await installFixture(h); const view = await services.core.create(h.handle, services.start);
        const save = await services.saveSystem.manualSave(h.handle, view.session.sessionId);
        for (const archive of [(await services.saveSystem.exportSnapshot(h.handle, view.session.sessionId, save.saveId)).archive,
            (await services.saveSystem.exportSession(h.handle, view.session.sessionId)).archive]) {
            const inspected = inspectAtriaSaveContainer(archive);
            expect(JSON.stringify(inspected.save)).not.toContain('PRIVATE-CHECKPOINT');
            expect(JSON.stringify(inspected)).not.toContain(NATIVE_RESOURCE_KINDS.runtimeCheckpoint);
        }
        // Existing Native records participate in account recovery; integrity is
        // still checked by the private consumer after replay, never by a cursor.
        const exported = rows[0];
        await h.engine.withTransaction(h.handle, tx => tx.deleteResource(exported.key));
        await h.engine.withTransaction(h.handle, tx => tx.putResource(exported.key, nativeRecord(exported.doc)));
        const recovered = new RuntimeCheckpointStore({ ...h, now: () => now });
        const doc = exported.doc; const state = { schemaVersion: 1, checkpointId: doc.checkpointId, bindingFingerprint: doc.bindingFingerprint, text: doc.text, calls: doc.calls };
        expect((await recovered.read(state, doc.binding, [...doc.sequence, { role: 'assistant', content: doc.text }], doc.sequence.length)).content).toEqual(doc.content);
    } finally { await h.cleanup(); }
});
