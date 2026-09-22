import { createHash } from 'node:crypto';

import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import {
    AssetStore,
    KnowledgeRepo,
    NATIVE_RESOURCE_KINDS,
    PackageRepo,
    SavePointRepo,
    SessionRepo,
    WorldRepo,
    createNativeId,
} from '../../src/native/index.js';
import { ConflictError } from '../../src/storage/errors.js';

const digest = value => createHash('sha256').update(value).digest('hex');

describe.each(CONTRACT_HARNESSES)('N1 Native Storage Foundation — $name', ({ make }) => {
    let h;
    let packageRepo;
    let worldRepo;
    let knowledgeRepo;
    let sessionRepo;
    let savePointRepo;
    let assetStore;

    beforeEach(async () => {
        h = await make();
        packageRepo = new PackageRepo({ engine: h.engine });
        worldRepo = new WorldRepo({ engine: h.engine });
        knowledgeRepo = new KnowledgeRepo({ engine: h.engine });
        sessionRepo = new SessionRepo({ engine: h.engine });
        savePointRepo = new SavePointRepo({ engine: h.engine });
        assetStore = new AssetStore({
            engine: h.engine,
            directoriesByHandle: handle => {
                if (handle !== h.handle) throw new Error('unknown handle');
                return h.dirs;
            },
        });
    });

    afterEach(async () => {
        await h.cleanup();
    });

    test('all N1 authorities round-trip without legacy storage identity', async () => {
        const handle = h.handle;

        // StorageTransaction exposes Native kinds as first-class resources.
        const probePackageId = createNativeId('package');
        const probeKey = {
            kind: NATIVE_RESOURCE_KINDS.packageState,
            handle,
            packageId: probePackageId,
            namespace: 'atri_probe',
        };
        const probeRecord = {
            doc: { probe: true },
            integrity: digest('probe'),
            createdAt: 10,
            updatedAt: 11,
        };
        await h.engine.withTransaction(handle, tx => tx.putResource(probeKey, probeRecord));
        await h.engine.withTransaction(handle, async (tx) => {
            const got = await tx.getResource(probeKey);
            expect(got.doc).toEqual({ probe: true });
            const listed = await tx.listResources({
                kind: NATIVE_RESOURCE_KINDS.packageState,
                handle,
                packageId: probePackageId,
            });
            expect(listed).toHaveLength(1);
            expect(listed[0].key).toEqual(probeKey);
            expect(await tx.deleteResource(probeKey)).toBe(true);
        });

        const packageId = createNativeId('package');
        const packageVersionId = createNativeId('packageVersion');
        const packageRecord = {
            packageId,
            displayName: 'Native Work',
            currentVersionId: null,
            createdAt: 100,
            updatedAt: 100,
        };
        await packageRepo.create(handle, packageRecord);
        const packageVersion = {
            packageVersionId,
            packageId,
            version: '1.0.0',
            packageContentHash: digest('package-v1'),
            createdAt: 101,
        };
        await packageRepo.commitVersion(handle, packageVersion);
        expect((await packageRepo.get(handle, packageId)).currentVersionId).toBe(packageVersionId);
        expect(await packageRepo.getVersion(handle, packageId, packageVersionId)).toEqual(packageVersion);
        await expect(packageRepo.commitVersion(handle, {
            ...packageVersion,
            packageContentHash: digest('mutated-version'),
        })).rejects.toBeInstanceOf(ConflictError);

        const worldId = createNativeId('world');
        const worldV1 = createNativeId('worldRevision');
        const worldV2 = createNativeId('worldRevision');
        await worldRepo.create(handle, {
            worldId,
            displayName: 'Library World',
            currentRevisionId: null,
            createdAt: 200,
            updatedAt: 200,
        });
        await worldRepo.commitRevision(handle, {
            worldRevisionId: worldV1,
            worldId,
            baseline: { era: 1 },
            knowledgeBindingIds: [],
            assetIds: [],
            metadata: {},
            createdAt: 201,
        });
        await worldRepo.commitRevision(handle, {
            worldRevisionId: worldV2,
            worldId,
            baseline: { era: 2 },
            knowledgeBindingIds: [],
            assetIds: [],
            metadata: {},
            createdAt: 202,
        });
        expect((await worldRepo.get(handle, worldId)).currentRevisionId).toBe(worldV2);
        expect(await worldRepo.gcRevisions(handle, worldId)).toEqual([worldV1]);
        expect(await worldRepo.getRevision(handle, worldId, worldV1)).toBeNull();

        const knowledgeBaseId = createNativeId('knowledgeBase');
        const kbV1 = createNativeId('knowledgeRevision');
        const kbV2 = createNativeId('knowledgeRevision');
        const entry1 = createNativeId('knowledgeEntry');
        const entry2 = createNativeId('knowledgeEntry');
        const bindingId = createNativeId('knowledgeBinding');
        await knowledgeRepo.create(handle, {
            knowledgeBaseId,
            displayName: 'Library Knowledge',
            currentRevisionId: null,
            createdAt: 300,
            updatedAt: 300,
        });
        await knowledgeRepo.commitRevision(handle, {
            knowledgeRevisionId: kbV1,
            knowledgeBaseId,
            entryIds: [entry1],
            metadata: {},
            createdAt: 301,
        }, [{
            knowledgeEntryId: entry1,
            content: 'rev one',
            metadata: {},
        }]);
        await knowledgeRepo.saveBinding(handle, {
            knowledgeBindingId: bindingId,
            source: {
                kind: 'library',
                knowledgeBaseId,
                knowledgeRevisionId: kbV1,
            },
            enabled: true,
            mode: 'augment',
            metadata: {},
        });
        await knowledgeRepo.commitRevision(handle, {
            knowledgeRevisionId: kbV2,
            knowledgeBaseId,
            entryIds: [entry2],
            metadata: {},
            createdAt: 302,
        }, [{
            knowledgeEntryId: entry2,
            content: 'rev two',
            metadata: {},
        }]);
        expect(await knowledgeRepo.gcRevisions(handle, knowledgeBaseId)).toEqual([]);
        expect(await knowledgeRepo.deleteBinding(handle, bindingId)).toBe(true);
        expect(await knowledgeRepo.gcRevisions(handle, knowledgeBaseId)).toEqual([kbV1]);
        expect(await knowledgeRepo.getEntry(handle, knowledgeBaseId, kbV1, entry1)).toBeNull();
        await expect(knowledgeRepo.saveBinding(handle, {
            knowledgeBindingId: createNativeId('knowledgeBinding'),
            source: { kind: 'session', knowledgeBaseId, knowledgeRevisionId: kbV2 },
            enabled: true,
            mode: 'augment',
            metadata: {},
        })).rejects.toThrow(/Library-owned/);

        const sessionId = createNativeId('session');
        const branchId = createNativeId('branch');
        const revisionId = createNativeId('revision');
        await sessionRepo.create(handle, {
            sessionId,
            packageId,
            packageVersionId,
            packageVersion: '1.0.0',
            packageContentHash: packageVersion.packageContentHash,
            entryPointId: createNativeId('entryPoint'),
            activeBranchId: branchId,
            headRevisionId: null,
            displayTitle: 'Run',
            createdAt: 400,
            updatedAt: 400,
        });
        await sessionRepo.saveBranch(handle, {
            branchId,
            sessionId,
            parentBranchId: null,
            forkPoint: null,
            displayName: 'Main',
            createdAt: 401,
        });
        const revision = {
            revisionId,
            sessionId,
            branchId,
            timelineHead: null,
            knowledgeHead: 'knowledge-head-1',
            stateHeads: {},
            createdAt: 402,
        };
        await sessionRepo.commitRevision(handle, revision);
        expect((await sessionRepo.get(handle, sessionId)).headRevisionId).toBe(revisionId);
        expect(await sessionRepo.getRevision(handle, sessionId, revisionId)).toEqual(revision);

        const savePoint = {
            saveId: createNativeId('savePoint'),
            sessionId,
            branchId,
            revisionId,
            kind: 'manual',
            displayName: 'Manual save',
            createdAt: 403,
        };
        await savePointRepo.create(handle, savePoint);
        expect(await savePointRepo.get(handle, sessionId, savePoint.saveId)).toEqual(savePoint);

        const bytes = Buffer.from('same immutable asset payload');
        const contentHash = digest(bytes);
        const assetA = {
            assetId: createNativeId('asset'),
            contentHash,
            size: bytes.length,
            mediaType: 'text/plain',
            logicalName: 'a.txt',
        };
        const assetB = {
            ...assetA,
            assetId: createNativeId('asset'),
            logicalName: 'renamed.txt',
        };
        await assetStore.put(handle, assetA, bytes);
        await assetStore.put(handle, assetB, bytes);
        expect((await assetStore.read(handle, assetA.assetId)).bytes.equals(bytes)).toBe(true);
        await assetStore.deleteRef(handle, assetA.assetId);
        await assetStore.deleteRef(handle, assetB.assetId);
        expect(await assetStore.gcBlobs(handle)).toEqual([contentHash]);
    });
});
