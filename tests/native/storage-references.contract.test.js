import { createHash } from 'node:crypto';

import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import {
    AssetStore,
    KnowledgeRepo,
    PackageRepo,
    WorldRepo,
    createNativeId,
} from '../../src/native/index.js';
import { ConflictError } from '../../src/storage/errors.js';

const digest = value => createHash('sha256').update(value).digest('hex');

describe.each(CONTRACT_HARNESSES)('N1 Native reference/GC guards — $name', ({ make }) => {
    let h;
    let packageRepo;
    let worldRepo;
    let knowledgeRepo;
    let assetStore;

    beforeEach(async () => {
        h = await make();
        packageRepo = new PackageRepo({ engine: h.engine });
        worldRepo = new WorldRepo({ engine: h.engine });
        knowledgeRepo = new KnowledgeRepo({ engine: h.engine });
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

    test('root create cannot publish a dangling current pointer', async () => {
        const handle = h.handle;

        await expect(packageRepo.create(handle, {
            packageId: createNativeId('package'),
            displayName: 'Dangling Package',
            currentVersionId: createNativeId('packageVersion'),
            createdAt: 1,
            updatedAt: 1,
        })).rejects.toThrow(/native package version/);

        await expect(worldRepo.create(handle, {
            worldId: createNativeId('world'),
            displayName: 'Dangling World',
            currentRevisionId: createNativeId('worldRevision'),
            createdAt: 1,
            updatedAt: 1,
        })).rejects.toThrow(/native world revision/);

        await expect(knowledgeRepo.create(handle, {
            knowledgeBaseId: createNativeId('knowledgeBase'),
            displayName: 'Dangling Knowledge',
            currentRevisionId: createNativeId('knowledgeRevision'),
            createdAt: 1,
            updatedAt: 1,
        })).rejects.toThrow(/native knowledge revision/);
    });

    test('Library World revisions require existing bindings/assets and protect their references', async () => {
        const handle = h.handle;
        const knowledgeBaseId = createNativeId('knowledgeBase');
        const knowledgeRevisionId = createNativeId('knowledgeRevision');
        const knowledgeEntryId = createNativeId('knowledgeEntry');
        const knowledgeBindingId = createNativeId('knowledgeBinding');

        await knowledgeRepo.create(handle, {
            knowledgeBaseId,
            displayName: 'Knowledge',
            currentRevisionId: null,
            createdAt: 1,
            updatedAt: 1,
        });
        await knowledgeRepo.commitRevision(handle, {
            knowledgeRevisionId,
            knowledgeBaseId,
            entryIds: [knowledgeEntryId],
            metadata: {},
            createdAt: 2,
        }, [{
            knowledgeEntryId,
            content: 'base knowledge',
            metadata: {},
        }]);
        await knowledgeRepo.saveBinding(handle, {
            knowledgeBindingId,
            source: {
                kind: 'library',
                knowledgeBaseId,
                knowledgeRevisionId,
            },
            enabled: true,
            mode: 'augment',
            metadata: {},
        });

        const bytes = Buffer.from('world map');
        const assetId = createNativeId('asset');
        const assetRef = {
            assetId,
            contentHash: digest(bytes),
            size: bytes.length,
            mediaType: 'text/plain',
        };
        await assetStore.put(handle, assetRef, bytes);

        const worldId = createNativeId('world');
        await worldRepo.create(handle, {
            worldId,
            displayName: 'World',
            currentRevisionId: null,
            createdAt: 3,
            updatedAt: 3,
        });

        await expect(worldRepo.commitRevision(handle, {
            worldRevisionId: createNativeId('worldRevision'),
            worldId,
            knowledgeBindingIds: [createNativeId('knowledgeBinding')],
            assetIds: [],
            metadata: {},
            createdAt: 4,
        })).rejects.toThrow(/native knowledge binding/);

        await expect(worldRepo.commitRevision(handle, {
            worldRevisionId: createNativeId('worldRevision'),
            worldId,
            knowledgeBindingIds: [knowledgeBindingId],
            assetIds: [createNativeId('asset')],
            metadata: {},
            createdAt: 5,
        })).rejects.toThrow(/native asset ref/);

        const worldRevisionId = createNativeId('worldRevision');
        await worldRepo.commitRevision(handle, {
            worldRevisionId,
            worldId,
            knowledgeBindingIds: [knowledgeBindingId],
            assetIds: [assetId],
            metadata: {},
            createdAt: 6,
        });

        await expect(knowledgeRepo.deleteBinding(handle, knowledgeBindingId))
            .rejects.toBeInstanceOf(ConflictError);
        await expect(assetStore.deleteRef(handle, assetId))
            .rejects.toBeInstanceOf(ConflictError);
        await expect(knowledgeRepo.delete(handle, knowledgeBaseId))
            .rejects.toBeInstanceOf(ConflictError);

        expect(await worldRepo.delete(handle, worldId)).toBe(true);
        expect(await knowledgeRepo.deleteBinding(handle, knowledgeBindingId)).toBe(true);
        expect(await knowledgeRepo.delete(handle, knowledgeBaseId)).toBe(true);
        expect(await assetStore.deleteRef(handle, assetId)).toBe(true);
        expect(await assetStore.gcBlobs(handle)).toEqual([assetRef.contentHash]);
    });

    test('KnowledgeRevision entry relations stay inside the immutable revision closure', async () => {
        const handle = h.handle;
        const knowledgeBaseId = createNativeId('knowledgeBase');
        await knowledgeRepo.create(handle, {
            knowledgeBaseId,
            displayName: 'Knowledge',
            currentRevisionId: null,
            createdAt: 1,
            updatedAt: 1,
        });

        const entryId = createNativeId('knowledgeEntry');
        const missingId = createNativeId('knowledgeEntry');
        const revisionId = createNativeId('knowledgeRevision');
        await expect(knowledgeRepo.commitRevision(handle, {
            knowledgeRevisionId: revisionId,
            knowledgeBaseId,
            entryIds: [entryId],
            metadata: {},
            createdAt: 2,
        }, [{
            knowledgeEntryId: entryId,
            content: 'dangling relation',
            relations: { requiredEntryIds: [missingId] },
            metadata: {},
        }])).rejects.toThrow(/same immutable revision/);

        expect(await knowledgeRepo.getRevision(handle, knowledgeBaseId, revisionId)).toBeNull();
        expect(await knowledgeRepo.getEntry(handle, knowledgeBaseId, revisionId, entryId)).toBeNull();
    });
});
