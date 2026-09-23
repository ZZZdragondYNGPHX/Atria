import { createHash } from 'node:crypto';

import { describe, expect, test } from '@jest/globals';

import {
    AssetStore,
    KnowledgeRepo,
    WorldRepo,
    createNativeId,
    resolveProjectDependencyClosure,
} from '../../src/native/index.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';

const digest = value => createHash('sha256').update(value).digest('hex');

function sourceWithAsset(assetId, contentHash) {
    return {
        format: 'atria-project-source',
        schemaVersion: 1,
        project: {
            projectId: createNativeId('project'),
            packageId: createNativeId('package'),
            displayName: 'Asset Closure',
            createdAt: 1,
            updatedAt: 1,
        },
        package: {
            name: 'Asset Closure',
            version: '1.0.0',
            actors: [],
            entryPoints: [{
                entryPointId: createNativeId('entryPoint'),
                displayName: 'Main',
                actorIds: [],
                worldIds: [],
                knowledgeBindingIds: [],
            }],
            capabilities: ['narrative'],
            permissions: [],
        },
        worlds: [],
        knowledge: [],
        knowledgeBindings: [],
        dependencies: {
            worlds: [],
            knowledge: [],
            knowledgeBindings: [],
            assets: [{ assetId, contentHash }],
        },
        assetFiles: [],
    };
}

describe('A2 exact Asset build closure', () => {
    test('resolves the exact content hash and fails closed on a mismatched revision identity', async () => {
        const h = await makeTempFsEngine();
        try {
            const worlds = new WorldRepo({ engine: h.engine });
            const knowledge = new KnowledgeRepo({ engine: h.engine });
            const assets = new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs });
            const bytes = Buffer.from('closure asset');
            const assetId = createNativeId('asset');
            const contentHash = digest(bytes);
            await assets.put(h.handle, {
                assetId,
                contentHash,
                size: bytes.length,
                mediaType: 'text/plain',
            }, bytes);

            const closure = await resolveProjectDependencyClosure({
                handle: h.handle,
                source: sourceWithAsset(assetId, contentHash),
                worldRepo: worlds,
                knowledgeRepo: knowledge,
                assetStore: assets,
            });
            expect(closure.assets).toHaveLength(1);
            expect(closure.assets[0].ref.contentHash).toBe(contentHash);
            expect(closure.assets[0].bytes.equals(bytes)).toBe(true);

            await expect(resolveProjectDependencyClosure({
                handle: h.handle,
                source: sourceWithAsset(assetId, 'f'.repeat(64)),
                worldRepo: worlds,
                knowledgeRepo: knowledge,
                assetStore: assets,
            })).rejects.toMatchObject({
                name: 'NativeDependencyError',
                code: 'native_asset_dependency_revision_mismatch',
            });
        } finally {
            await h.cleanup();
        }
    });
});
