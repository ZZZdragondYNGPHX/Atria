import { createHash } from 'node:crypto';

import { describe, expect, test } from '@jest/globals';

import {
    AssetStore,
    KnowledgeRepo,
    NativeLibraryService,
    WorldRepo,
    createNativeId,
} from '../../src/native/index.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

describe('A2 Native Library exact snapshots', () => {
    test('resolves exact immutable World and Knowledge revisions instead of following current pointers', async () => {
        const h = await makeTempFsEngine();
        try {
            const worlds = new WorldRepo({ engine: h.engine });
            const knowledge = new KnowledgeRepo({ engine: h.engine });
            const assets = new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs });
            const library = new NativeLibraryService({
                worldRepo: worlds,
                knowledgeRepo: knowledge,
                assetStore: assets,
            });

            const worldId = createNativeId('world');
            const worldV1 = createNativeId('worldRevision');
            const worldV2 = createNativeId('worldRevision');
            await worlds.create(h.handle, {
                worldId,
                displayName: 'Pinned World',
                currentRevisionId: null,
            });
            await worlds.commitRevision(h.handle, {
                worldId,
                worldRevisionId: worldV1,
                baseline: { era: 1 },
                knowledgeBindingIds: [],
                assetIds: [],
                metadata: {},
            });
            await worlds.commitRevision(h.handle, {
                worldId,
                worldRevisionId: worldV2,
                baseline: { era: 2 },
                knowledgeBindingIds: [],
                assetIds: [],
                metadata: {},
            });

            const kbId = createNativeId('knowledgeBase');
            const kbV1 = createNativeId('knowledgeRevision');
            const kbV2 = createNativeId('knowledgeRevision');
            const entryV1 = createNativeId('knowledgeEntry');
            const entryV2 = createNativeId('knowledgeEntry');
            await knowledge.create(h.handle, {
                knowledgeBaseId: kbId,
                displayName: 'Pinned Knowledge',
                currentRevisionId: null,
            });
            await knowledge.commitRevision(h.handle, {
                knowledgeBaseId: kbId,
                knowledgeRevisionId: kbV1,
                entryIds: [entryV1],
                metadata: {},
            }, [{ knowledgeEntryId: entryV1, content: 'v1', metadata: {} }]);
            await knowledge.commitRevision(h.handle, {
                knowledgeBaseId: kbId,
                knowledgeRevisionId: kbV2,
                entryIds: [entryV2],
                metadata: {},
            }, [{ knowledgeEntryId: entryV2, content: 'v2', metadata: {} }]);

            const pinnedWorld = await library.getExact(h.handle, {
                resourceType: 'core.world',
                resourceId: worldId,
                revision: worldV1,
            });
            const pinnedKnowledge = await library.getExact(h.handle, {
                resourceType: 'core.knowledge',
                resourceId: kbId,
                revision: kbV1,
            });

            expect(pinnedWorld.snapshot.revision.baseline).toEqual({ era: 1 });
            expect(pinnedWorld.snapshot.world.currentRevisionId).toBe(worldV1);
            expect(pinnedKnowledge.snapshot.entries[0].content).toBe('v1');
            expect(pinnedKnowledge.snapshot.knowledgeBase.currentRevisionId).toBe(kbV1);
            expect(pinnedWorld.ref.immutable).toBe(true);
            expect(pinnedKnowledge.ref.immutable).toBe(true);
        } finally {
            await h.cleanup();
        }
    });

    test('uses content hash as the exact immutable Asset revision', async () => {
        const h = await makeTempFsEngine();
        try {
            const worlds = new WorldRepo({ engine: h.engine });
            const knowledge = new KnowledgeRepo({ engine: h.engine });
            const assets = new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs });
            const library = new NativeLibraryService({
                worldRepo: worlds,
                knowledgeRepo: knowledge,
                assetStore: assets,
            });
            const bytes = Buffer.from('library asset');
            const assetId = createNativeId('asset');
            const contentHash = digest(bytes);
            await assets.put(h.handle, {
                assetId,
                contentHash,
                size: bytes.length,
                mediaType: 'text/plain',
                logicalName: 'asset.txt',
            }, bytes);

            const exact = await library.getExact(h.handle, {
                resourceType: 'core.asset',
                resourceId: assetId,
                revision: contentHash,
            });
            expect(exact.ref).toMatchObject({
                resourceType: 'core.asset',
                resourceId: assetId,
                revision: contentHash,
                contentIdentity: contentHash,
                immutable: true,
            });
            expect(exact.snapshot.bytes.equals(bytes)).toBe(true);
        } finally {
            await h.cleanup();
        }
    });
});
