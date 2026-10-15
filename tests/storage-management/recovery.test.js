import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createGitClient } from '../../src/git/client.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { installFixture, services } from '../native/helpers/session-fixture.js';
import { WorldRepo, PersonaRepo, ProjectStore, createNativeId } from '../../src/native/index.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { NativeRecoveryService } from '../../src/native/recovery-service.js';
import { recoveryKey } from '../../src/native/recovery-roots.js';
import { nativeRecord } from '../../src/native/repositories/common.js';
import { installAccountQuota } from '../../src/storage/account-quota.js';
import { measureAccount } from '../../src/storage/resource-accounting.js';
import { runFixture } from '../native/helpers/run-fixture.js';
import { seedGenerationProfiles } from '../native/helpers/generation-fixture.js';
import { ExtensionsStore } from '../../src/native/extensions-store.js';
import { withRecoveryPublication } from '../../src/native/recovery-roots.js';

describe.each(CONTRACT_HARNESSES)('Native recycle bin — $name', ({ make }) => {
    let h, svc, recovery, limit;
    beforeEach(async () => {
        h = await make(); limit = -1;
        installAccountQuota(h.engine, { directoriesByHandle: () => h.dirs, limit: async () => limit, makeDefault: true });
        svc = services(h);
        recovery = new NativeRecoveryService({ engine: h.engine, directoriesByHandle: () => h.dirs,
            sessions: svc.sessionRepo, packages: svc.packageRepo, knowledge: svc.knowledgeRepo, assets: svc.assetStore,
            worlds: new WorldRepo({ engine: h.engine }), personas: new PersonaRepo({ engine: h.engine, assetStore: svc.assetStore }),
            projects: new ProjectStore({ directoriesByHandle: () => h.dirs }), graph: null });
    });
    afterEach(async () => { await h.cleanup(); });
    const measure = () => measureAccount({ engine: h.engine, handle: h.handle, directories: h.dirs });

    test('Runtime reference protection, deletion tombstones and original configuration recovery share the domain authority', async () => {
        const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/unused' });
        const connection = { type: 'connection', id: seeded.connection.connectionProfileId };
        expect((await recovery.inspect(h.handle, connection)).allowed).toBe(false);
        const route = { type: 'route', id: seeded.routes[0].runtimeRouteId }, before = await recovery.inspect(h.handle, route);
        const key = recovery.rootKey(h.handle, route), previous = await h.engine.withTransaction(h.handle, tx => tx.getResource(key));
        const item = await recovery.trash(h.handle, route, before.version, 'runtime-route');
        expect(await seeded.persistence.getRuntimeRoute(h.handle, route.id)).toBeNull();
        expect((await h.engine.withTransaction(h.handle, tx => tx.getResource(key))).doc).toBeNull();
        const review = await recovery.preflightRestore(h.handle, item.id); expect(review.allowed).toBe(true);
        await recovery.restore(h.handle, item.id, review.version);
        expect(await seeded.persistence.getRuntimeRoute(h.handle, route.id)).toEqual(seeded.routes[0]);
        expect((await h.engine.withTransaction(h.handle, tx => tx.getResource(key))).updatedAt).toBeGreaterThan(previous.updatedAt);
    });

    test('Extension source returns with its original identity and source, disabled until explicit activation', async () => {
        const extensions = new ExtensionsStore({ engine: h.engine });
        const plugin = await extensions.save(h.handle, { name: 'Local fixture', kind: 'local', enabled: true, targets: { global: true, presets: [], works: [] }, entrypoint: 'index.js', files: { 'index.js': 'export default {};' } });
        const target = { type: 'versioned', resourceType: 'atri.extensions.plugin', id: plugin.id };
        const checked = await recovery.inspect(h.handle, target), item = await recovery.trash(h.handle, target, checked.version, 'plugin');
        await expect(extensions.get(h.handle, plugin.id)).rejects.toMatchObject({ name: 'NotFoundError' });
        const review = await recovery.preflightRestore(h.handle, item.id); await recovery.restore(h.handle, item.id, review.version);
        expect(await extensions.get(h.handle, plugin.id)).toMatchObject({ id: plugin.id, enabled: false, files: plugin.files, contentHash: plugin.contentHash });
    });

    test('identity collision and failed restore commit preserve both the occupant and recovery source', async () => {
        const target = { type: 'world', id: createNativeId('world') }, key = recovery.rootKey(h.handle, target);
        await h.engine.withTransaction(h.handle, tx => tx.putResource(key, nativeRecord({ worldId: target.id, displayName: 'Original', currentRevisionId: null })));
        const checked = await recovery.inspect(h.handle, target), item = await recovery.trash(h.handle, target, checked.version, 'collision');
        await withRecoveryPublication(() => h.engine.withTransaction(h.handle, tx => tx.putResource(key, nativeRecord({ worldId: target.id, displayName: 'Occupied', currentRevisionId: null }))));
        expect((await recovery.preflightRestore(h.handle, item.id)).reason).toBe('native_recovery_identity_conflict');
        expect((await recovery.worlds.get(h.handle, target.id)).displayName).toBe('Occupied');
        expect(await recovery.list(h.handle)).toHaveLength(1);
        await withRecoveryPublication(() => h.engine.withTransaction(h.handle, tx => tx.deleteResource(key)));
        const transaction = h.engine.withTransaction.bind(h.engine);
        h.engine.withTransaction = (handle, operation) => transaction(handle, tx => operation(new Proxy(tx, { get(object, name) {
            if (name === 'putResource') return () => { throw new Error('Injected restore failure'); };
            const value = object[name]; return typeof value === 'function' ? value.bind(object) : value;
        } })));
        await expect(recovery.restore(h.handle, item.id, item.version)).rejects.toThrow('Injected restore failure');
        h.engine.withTransaction = transaction;
        expect(await recovery.list(h.handle)).toHaveLength(1); expect(await recovery.worlds.get(h.handle, target.id)).toBeNull();
    });

    test('recycling and restoring an active Ironman session preserves its permanent terminal authority', async () => {
        const f = await runFixture(h, 'http://127.0.0.1:1/unused'), started = await f.begin('ironman');
        const target = { type: 'session', id: started.session.sessionId }, checked = await recovery.inspect(h.handle, target);
        const item = await recovery.trash(h.handle, target, checked.version, 'ironman');
        expect(await f.core.runStatus(h.handle, target.id)).toMatchObject({ mode: 'ironman', status: 'terminal' });
        const review = await recovery.preflightRestore(h.handle, item.id); expect(review.allowed).toBe(true);
        await recovery.restore(h.handle, item.id, review.version);
        expect(await f.core.runStatus(h.handle, target.id)).toMatchObject({ mode: 'ironman', status: 'terminal' });
        await expect(f.core.beginStory(h.handle, target.id, { input: { mode: 'ironman', name: 'Ada' }, invocationId: 'revive', expectedRevisionId: started.revision.revisionId })).rejects.toMatchObject({ code: 'native_run_terminal' });
    });

    test('a real Session closure returns to SessionCore with the same identity, history and manual save', async () => {
        const f = await installFixture(h, undefined, svc);
        const opened = await svc.core.create(h.handle, f.start);
        const sessionId = opened.session.sessionId, target = { type: 'session', id: sessionId };
        const saveId = createNativeId('savePoint');
        await svc.savePointRepo.create(h.handle, { sessionId, saveId, branchId: opened.revision.branchId,
            revisionId: opened.revision.revisionId, kind: 'manual', createdAt: Date.now() });
        const before = await h.engine.withTransaction(h.handle, tx => recovery.capture(tx, h.handle, target));
        const inspected = await recovery.inspect(h.handle, target);
        expect(inspected.reason).toBeNull();
        const retained = await recovery.trash(h.handle, target, inspected.version, 'session-delete');
        expect(retained.expiresAt - retained.createdAt).toBe(30 * 86400000);
        expect(await svc.sessionRepo.get(h.handle, sessionId)).toBeNull();
        await expect(svc.sessionRepo.create(h.handle, opened.session)).rejects.toMatchObject({ code: 'native_resource_in_recycle_bin' });
        await expect(svc.packageRepo.delete(h.handle, opened.session.packageId)).rejects.toMatchObject({ code: 'native_resource_retained_for_recovery' });
        const preflight = await recovery.preflightRestore(h.handle, retained.id);
        expect(preflight.allowed).toBe(true);
        await recovery.restore(h.handle, retained.id, preflight.version, 'session-restore');
        expect((await svc.core.load(h.handle, sessionId)).session.sessionId).toBe(sessionId);
        expect((await svc.savePointRepo.get(h.handle, sessionId, saveId)).kind).toBe('manual');
        const after = await h.engine.withTransaction(h.handle, tx => recovery.capture(tx, h.handle, target));
        expect(after.records.filter(row => row.key.kind !== K.runControl)).toEqual(before.records.filter(row => row.key.kind !== K.runControl));
        expect(await recovery.restore(h.handle, retained.id, preflight.version, 'session-restore')).toMatchObject({ restored: true });
        expect(await recovery.list(h.handle)).toEqual([]);
    });

    test('quota failure keeps the complete original, and failed restore keeps its recovery source', async () => {
        const id = createNativeId('world'), target = { type: 'world', id };
        const key = { kind: K.world, handle: h.handle, worldId: id };
        await h.engine.withTransaction(h.handle, tx => tx.putResource(key, nativeRecord({ worldId: id, displayName: 'Owned world', currentRevisionId: null })));
        const inspected = await recovery.inspect(h.handle, target);
        limit = (await measure()).totalBytes;
        await expect(recovery.trash(h.handle, target, inspected.version, 'quota-delete')).rejects.toMatchObject({ code: 'storage_quota_exceeded' });
        expect(await recovery.worlds.get(h.handle, id)).not.toBeNull();
        expect(await recovery.list(h.handle)).toEqual([]);
        limit = -1;
        const item = await recovery.trash(h.handle, target, inspected.version, 'quota-delete');
        // A different identity occupying an original key is never overwritten.
        const record = await h.engine.withTransaction(h.handle, tx => tx.getResource(recoveryKey(h.handle, item.id)));
        record.doc.records[0].doc.displayName = 'tampered';
        await h.engine.withTransaction(h.handle, tx => tx.putResource(recoveryKey(h.handle, item.id), nativeRecord(record.doc)));
        expect((await recovery.preflightRestore(h.handle, item.id)).reason).toBe('native_recovery_integrity');
        expect(await recovery.worlds.get(h.handle, id)).toBeNull();
        expect((await recovery.list(h.handle))).toHaveLength(1);
    });

    test('project recovery preserves source and complete Git history, excludes unrelated Agent data, and rejects stale file writes', async () => {
        const projectId = createNativeId('project'), packageId = createNativeId('package');
        await recovery.projects.create(h.handle, { format: 'atria-project-source', schemaVersion: 1,
            project: { projectId, packageId, displayName: 'Studio source', createdAt: 1, updatedAt: 1 },
            package: { name: 'Source', version: '1.0.0', actors: [], entryPoints: [{ entryPointId: createNativeId('entryPoint'), displayName: 'Start', actorIds: [], worldIds: [], knowledgeBindingIds: [] }], capabilities: ['narrative'], permissions: [] },
            worlds: [], knowledge: [], knowledgeBindings: [], dependencies: { worlds: [], knowledge: [], knowledgeBindings: [] }, assetFiles: [] },
        { files: new Map([['chapter.txt', 'Source 中文']]) });
        const git = createGitClient({ backend: 'builtin' }), directory = recovery.projects.getProjectDirectory(h.handle, projectId);
        await recovery.projects.commitHistory(h.handle, projectId, async location => { await git.init(location); await git.commitIfChanged(location, 'Original chapter'); });
        const originalHead = (await git.log(directory, 1))[0].fullHash;
        await recovery.projects.writeFile(h.handle, projectId, 'large.bin', randomBytes(16384));
        limit = (await measure()).totalBytes + 2000;
        await expect(recovery.projects.commitHistory(h.handle, projectId, location => git.commitIfChanged(location, 'Quota refused chapter'))).rejects.toMatchObject({ code: 'storage_quota_exceeded' });
        expect((await git.log(directory, 1))[0].fullHash).toBe(originalHead);
        limit += 128 * 1024;
        await recovery.projects.commitHistory(h.handle, projectId, location => git.commitIfChanged(location, 'Accepted chapter'));
        const acceptedHead = (await git.log(directory, 1))[0].fullHash;
        expect(acceptedHead).not.toBe(originalHead);
        const evidenceKey = { kind: K.agentEvidence, handle: h.handle, evidenceId: 'c'.repeat(64) };
        await h.engine.withTransaction(h.handle, tx => tx.putResource(evidenceKey, nativeRecord({ scope: { domain: 'project', projectId }, source: projectId })));
        const target = { type: 'project', id: projectId }, checked = await recovery.inspect(h.handle, target);
        expect(checked.allowed).toBe(true);
        const item = await recovery.trash(h.handle, target, checked.version, 'project-delete');
        expect(await recovery.projects.get(h.handle, projectId)).toBeNull();
        await expect(recovery.projects.writeFile(h.handle, projectId, 'chapter.txt', 'stale')).rejects.toMatchObject({ code: 'native_resource_in_recycle_bin' });
        expect(await h.engine.withTransaction(h.handle, tx => tx.getResource(evidenceKey))).not.toBeNull();
        const preflight = await recovery.preflightRestore(h.handle, item.id);
        await recovery.restore(h.handle, item.id, preflight.version);
        expect((await recovery.projects.get(h.handle, projectId)).project.projectId).toBe(projectId);
        expect((await git.log(directory, 2)).map(item => item.fullHash)).toEqual([acceptedHead, originalHead]);
        expect((await recovery.projects.readFile(h.handle, projectId, 'chapter.txt')).toString()).toBe('Source 中文');
    });

    test('a failed recovery-record commit never loses a native original', async () => {
        const target = { type: 'world', id: createNativeId('world') }, key = { kind: K.world, handle: h.handle, worldId: null }; key.worldId = target.id;
        await h.engine.withTransaction(h.handle, tx => tx.putResource(key, nativeRecord({ worldId: target.id, displayName: 'Before failure', currentRevisionId: null })));
        const checked = await recovery.inspect(h.handle, target), transaction = h.engine.withTransaction.bind(h.engine);
        h.engine.withTransaction = (handle, operation) => transaction(handle, tx => operation(new Proxy(tx, { get(object, name) {
            if (name === 'putResource') return (key, record) => { if (record.doc?.type === 'recovery') throw new Error('Injected recovery commit failure'); return object.putResource(key, record); };
            const value = object[name]; return typeof value === 'function' ? value.bind(object) : value;
        } })));
        await expect(recovery.trash(h.handle, target, checked.version, 'failed-record')).rejects.toThrow('Injected recovery commit failure');
        h.engine.withTransaction = transaction;
        expect((await recovery.worlds.get(h.handle, target.id)).displayName).toBe('Before failure');
        expect(await recovery.list(h.handle)).toEqual([]);
    });

    test('a retained AssetRef protects its Blob from existing GC until permanent deletion', async () => {
        const bytes = Buffer.from('Unique retained media'), hash = await svc.assetStore.putBlob(h.handle, bytes), assetId = createNativeId('asset');
        await svc.assetStore.put(h.handle, { assetId, contentHash: hash, size: bytes.length, mediaType: 'application/octet-stream' }, bytes);
        const target = { type: 'asset', id: assetId }, checked = await recovery.inspect(h.handle, target);
        const item = await recovery.trash(h.handle, target, checked.version, 'retained-asset');
        await svc.assetStore.gcBlobs(h.handle, { now: Date.now() + 100000 });
        await svc.assetStore.gcBlobs(h.handle, { now: Date.now() + 200000 });
        expect(await svc.assetStore.hasBlob(h.handle, hash)).toBe(true);
        await expect(recovery.purge(h.handle, item.id, item.version, { expiredOnly: true })).rejects.toMatchObject({ code: 'native_recovery_retention_active' });
        await recovery.purge(h.handle, item.id, item.version);
        // The metadata row deletion does not pretend physical GC has happened.
        expect(await svc.assetStore.hasBlob(h.handle, hash)).toBe(true);
    });

    test('a backup file survives interrupted publication and resumes from its persistent phase', async () => {
        const root = h.dirs.backups || path.join(h.dirs.root, 'backups'); fs.mkdirSync(root, { recursive: true });
        const target = { type: 'backup', id: 'manual.zip' }; fs.writeFileSync(path.join(root, target.id), 'backup payload');
        const checked = await recovery.inspect(h.handle, target), transaction = h.engine.withTransaction.bind(h.engine);
        let injected = false;
        h.engine.withTransaction = (handle, operation) => transaction(handle, tx => operation(new Proxy(tx, { get(object, name) {
            if (name === 'putResource') return (key, record) => {
                if (!injected && record.doc?.type === 'recovery' && record.doc.state === 'retained') { injected = true; throw new Error('Injected after file move'); }
                return object.putResource(key, record);
            };
            const value = object[name]; return typeof value === 'function' ? value.bind(object) : value;
        } })));
        await expect(recovery.trash(h.handle, target, checked.version, 'interrupted-backup')).rejects.toThrow('Injected after file move');
        h.engine.withTransaction = transaction;
        expect((await recovery.list(h.handle))[0].state).toBe('preparing');
        expect(await recovery.repair(h.handle)).toEqual([{ id: 'interrupted-backup', repaired: true }]);
        const item = (await recovery.list(h.handle))[0], preflight = await recovery.preflightRestore(h.handle, item.id);
        expect(preflight.allowed).toBe(true);
        await recovery.restore(h.handle, item.id, preflight.version);
        expect(fs.readFileSync(path.join(root, target.id), 'utf8')).toBe('backup payload');
    });
});
