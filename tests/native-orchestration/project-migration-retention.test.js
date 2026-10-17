import fs from 'node:fs';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectReadFixture, projectReadResponse } from './helpers/project-tool-fixture.js';
import { prepareControllerOwnerRoot } from './fixtures.js';
import { MigrationRunner, DEFAULT_MIGRATION_CATEGORIES } from '../../src/storage/migration/runner.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';
import { NATIVE_STORAGE_KINDS } from '../../src/storage/engines/native-resource-key.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const categories = Object.fromEntries(Object.keys(DEFAULT_MIGRATION_CATEGORIES).map(key => [key, key === 'native']));

function runner(source, destination, options = {}) {
    return new MigrationRunner({
        // This exercises the original Native category; legacy repositories
        // are disabled by the complete category selection above.
        sourceRepos: { settings: new SettingsRepo({ engine: source.engine }) },
        destRepos: { settings: new SettingsRepo({ engine: destination.engine }) },
        sourceEngine: source.engine, destEngine: destination.engine, categories,
        snapshotPaths: { dataRoot: source.dataRoot, backupRoot: source.backupRoot, getUserRoot: () => source.dirs.root },
        ...options,
    });
}

async function attachDestination(source, destination) {
    await prepareControllerOwnerRoot(destination.dirs.root);
    source.engine.nativeHostLifecycle.attachStorageEngine(destination.engine, { directoriesByHandle: () => destination.dirs });
}

const nativeRows = h => h.engine.withTransaction(h.handle, async tx => {
    const rows = [];
    for (const kind of NATIVE_STORAGE_KINDS) rows.push(...await tx.listResources({ kind, handle: h.handle }));
    return rows;
});

describe.each(harnesses)('$name original migration destination retention', ({ make }) => {
    test.each([true, false])('an older engine cannot replace a Project bank with known usage=%s', async knownUsage => {
        const f = await projectReadFixture(make, { responseBody: () => {
            const response = projectReadResponse();
            if (!knownUsage) delete response.usage;
            return response;
        } });
        const old = await make();
        try {
            await attachDestination(f.h, old);
            // Produce a real old Engine snapshot through the same original
            // migration protocol, before any paid Run exists.
            await f.h.engine.nativeHostLifecycle.withMaintenance(() => runner(f.h, old).migrateUser(f.h.handle));
            await f.run();
            const original = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
            expect(original.compute.attempts[0].status).toBe(knownUsage ? 'settled' : 'unknown');
            const retained = await nativeRows(f.h);
            expect(retained.some(row => row.key.kind === K.orchestrationRun)).toBe(true);
            expect(retained.some(row => row.key.kind === K.orchestrationRecord)).toBe(true);
            // The production administrator shares the Host owner and drains
            // operations before migrating. Exercise that actual boundary.
            let failure;
            try { await old.engine.nativeHostLifecycle.withMaintenance(() => runner(old, f.h).migrateUser(old.handle)); }
            catch (error) { failure = error; }
            expect(await f.repository.get(f.h.handle, f.projectId, f.task.taskId)).toEqual(original);
            expect(failure).toMatchObject({ code: 'native_orchestration_retention_review_required' });
            expect(await nativeRows(f.h)).toEqual(retained);
            expect(f.requests).toHaveLength(1);
            expect(fs.existsSync(old.backupRoot)).toBe(false);
        } finally { await old.engine.close(); await old.cleanup(); await f.cleanup(); }
    }, 60000);

    test('an empty destination still imports original paid history without replay or a copied Host fence', async () => {
        const f = await projectReadFixture(make), destination = await make();
        try {
            await f.run();
            const original = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
            await attachDestination(f.h, destination);
            const fenceKey = { kind: K.hostFence, handle: destination.handle };
            const fence = await destination.engine.withTransaction(destination.handle, tx => tx.getResource(fenceKey));
            const stats = await f.h.engine.nativeHostLifecycle.withMaintenance(() => runner(f.h, destination).migrateUser(f.h.handle));
            expect(stats.verified).toBe(true);
            const imported = await nativeRows(destination);
            const task = imported.find(row => row.key.kind === K.projectAgentTask && row.doc.taskId === f.task.taskId);
            expect(task.doc.status).toBe('blocked');
            expect(task.doc.compute).toEqual(original.compute);
            expect(imported.filter(row => row.key.kind === K.orchestrationRun)).toHaveLength(1);
            expect(imported.find(row => row.key.kind === K.hostFence)).toEqual(fence);
            expect(f.requests).toHaveLength(1);
        } finally { await destination.engine.close(); await destination.cleanup(); await f.cleanup(); }
    }, 60000);
});
