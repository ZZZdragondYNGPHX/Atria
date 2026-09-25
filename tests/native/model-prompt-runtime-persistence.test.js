import { describe, expect, jest, test } from '@jest/globals';

import {
    NativeModelPromptPersistence,
    VersionedJsonResourceHandler,
    createNativeId,
} from '../../src/native/index.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';

function moduleResource({
    id = createNativeId('promptModule'),
    revision = 'rev-1',
    displayName = 'Shared Name',
    body = 'Hello',
} = {}) {
    return {
        schemaVersion: 1,
        promptModuleId: id,
        revision,
        displayName,
        target: 'prompt.system',
        stages: ['stage.main'],
        priority: 0,
        body,
        provenance: [],
    };
}

test('Prompt deletion removes all immutable revisions, rejects owners and protects referenced history', async () => {
    const h = await makeTempFsEngine();
    try {
        const resources = new VersionedJsonResourceHandler({ engine: h.engine });
        const value = moduleResource(); const type = 'core.prompt-module';
        await resources.commit(h.handle, type, value);
        await resources.commit(h.handle, type, { ...value, revision: 'rev-2' });
        const ref = { scope: 'library', resourceType: type, resourceId: value.promptModuleId, revision: value.revision };
        await expect(resources.delete(h.handle, { ...ref, scope: 'package' }, async () => [])).rejects.toThrow(/Library/);
        await expect(resources.delete(h.handle, ref, async target => {
            expect(target).not.toHaveProperty('revision'); return [{ owner: 'Project', revision: 'rev-1' }];
        })).rejects.toMatchObject({ code: 'native_resource_referenced' });
        expect(await resources.listRevisions(h.handle, type, ref.resourceId)).toHaveLength(2);
        await resources.setArchived(h.handle, type, ref.resourceId, true);
        expect((await resources.list(h.handle))[0].archived).toBe(true);
        expect(await resources.delete(h.handle, ref, async () => [])).toEqual({ deleted: true, revisions: 2 });
        expect(await resources.list(h.handle)).toEqual([]);
        await expect(resources.getExact(h.handle, ref)).rejects.toThrow();
    } finally { await h.cleanup(); }
});

function connectionProfile(id = createNativeId('connectionProfile')) {
    return {
        schemaVersion: 1,
        connectionProfileId: id,
        scope: 'player',
        displayName: 'Local Gateway',
        providerAdapter: 'provider.openai-compatible',
        transport: 'transport.http-json',
        endpoint: 'https://example.invalid/v1',
        networkPolicy: {},
        secretRef: { secretId: 'secret-main', scope: 'player' },
        options: {},
    };
}

function modelProfile(id, connectionProfileId) {
    return {
        schemaVersion: 1,
        modelProfileId: id,
        scope: 'player',
        displayName: 'Model A',
        connectionProfileRef: { connectionProfileId, scope: 'player' },
        remoteModelId: 'model-a',
        capabilities: [],
        limits: { contextTokens: 8192, outputTokens: 1024 },
        tokenizer: {},
        messageFormat: {},
        providerHints: {},
    };
}

describe('P1 generic versioned JSON resource persistence', () => {
    test('round-trips exact revisions without following the current pointer', async () => {
        const h = await makeTempFsEngine();
        try {
            const resources = new VersionedJsonResourceHandler({ engine: h.engine });
            const id = createNativeId('promptModule');
            await resources.commit(h.handle, 'core.prompt-module', moduleResource({
                id,
                revision: 'rev-1',
                body: 'v1',
            }));
            await resources.commit(h.handle, 'core.prompt-module', moduleResource({
                id,
                revision: 'rev-2',
                body: 'v2',
            }));

            const current = await resources.getCurrent(h.handle, 'core.prompt-module', id);
            const pinned = await resources.getExact(h.handle, {
                resourceType: 'core.prompt-module',
                resourceId: id,
                revision: 'rev-1',
            });

            expect(current.snapshot.body).toBe('v2');
            expect(current.ref.revision).toBe('rev-2');
            expect(pinned.snapshot.body).toBe('v1');
            expect(pinned.ref.revision).toBe('rev-1');
            expect(await resources.listRevisions(h.handle, 'core.prompt-module', id))
                .toEqual(['rev-1', 'rev-2']);
        } finally {
            await h.cleanup();
        }
    });

    test('same display name with different IDs does not collide', async () => {
        const h = await makeTempFsEngine();
        try {
            const resources = new VersionedJsonResourceHandler({ engine: h.engine });
            const first = moduleResource();
            const second = moduleResource();
            await resources.commit(h.handle, 'core.prompt-module', first);
            await resources.commit(h.handle, 'core.prompt-module', second);
            await resources.commit(h.handle, 'core.prompt-module', { ...first, revision: 'rev-2' });
            const transactions = jest.spyOn(h.engine, 'withTransaction');

            const listed = await resources.listWithRevisions(h.handle, {
                resourceType: 'core.prompt-module',
            });
            expect(listed).toHaveLength(2);
            expect(transactions).toHaveBeenCalledTimes(2); // One root scan and one revision scan, independent of root count.
            expect(listed.find(item => item.resourceId === first.promptModuleId).revisions).toEqual(['rev-1', 'rev-2']);
            expect(listed.find(item => item.resourceId === second.promptModuleId).revisions).toEqual(['rev-1']);
            transactions.mockRestore();
            expect(new Set(listed.map(item => item.resourceId))).toEqual(
                new Set([first.promptModuleId, second.promptModuleId]),
            );
            expect(listed.every(item => item.displayName === 'Shared Name')).toBe(true);
        } finally {
            await h.cleanup();
        }
    });

    test('one exact revision identity is immutable', async () => {
        const h = await makeTempFsEngine();
        try {
            const resources = new VersionedJsonResourceHandler({ engine: h.engine });
            const value = moduleResource();
            await resources.commit(h.handle, 'core.prompt-module', value);
            await expect(resources.commit(h.handle, 'core.prompt-module', {
                ...value,
                body: 'changed under same revision',
            })).rejects.toMatchObject({ code: 'native_immutable_conflict' });
        } finally {
            await h.cleanup();
        }
    });
});

describe('P1 player model/prompt persistence', () => {
    test('persists Connection, Model and player Runtime Route without secret material', async () => {
        const h = await makeTempFsEngine();
        try {
            const persistence = new NativeModelPromptPersistence({ engine: h.engine });
            const connection = connectionProfile();
            const modelId = createNativeId('modelProfile');
            const model = modelProfile(modelId, connection.connectionProfileId);
            const route = {
                schemaVersion: 1,
                runtimeRouteId: createNativeId('runtimeRoute'),
                scope: 'player',
                displayName: 'Role Route',
                role: 'role.narrator',
                modelProfileRef: { modelProfileId: modelId, scope: 'player' },
                connectionProfileRef: {
                    connectionProfileId: connection.connectionProfileId,
                    scope: 'player',
                },
                generationProfileRef: {
                    resourceType: 'core.generation-profile',
                    resourceId: createNativeId('generationProfile'),
                    revision: 'gen-v1',
                    scope: 'library',
                },
                promptProgramRef: {
                    resourceType: 'core.prompt-program',
                    resourceId: createNativeId('promptProgram'),
                    revision: 'prompt-v1',
                    scope: 'library',
                },
                fallbackRouteRefs: [],
                policy: { timeoutMs: 30000, maxRetries: 1, maxFallbackAttempts: 1 },
                requirements: [],
            };

            await persistence.saveConnectionProfile(h.handle, connection);
            await persistence.saveModelProfile(h.handle, model);
            await persistence.saveRuntimeRoute(h.handle, route);

            expect(await persistence.getConnectionProfile(h.handle, connection.connectionProfileId))
                .toEqual(connection);
            expect(await persistence.getModelProfile(h.handle, modelId)).toEqual(model);
            expect(await persistence.getRuntimeRoute(h.handle, route.runtimeRouteId)).toEqual(route);
            expect(JSON.stringify(await persistence.listConnectionProfiles(h.handle)))
                .not.toContain('super-secret');
        } finally {
            await h.cleanup();
        }
    });

    test('rejects secret values and missing player-profile references', async () => {
        const h = await makeTempFsEngine();
        try {
            const persistence = new NativeModelPromptPersistence({ engine: h.engine });
            const connection = connectionProfile();
            await expect(persistence.saveConnectionProfile(h.handle, {
                ...connection,
                options: { apiKey: 'super-secret' },
            })).rejects.toThrow(/secret material/);

            await expect(persistence.saveModelProfile(
                h.handle,
                modelProfile(createNativeId('modelProfile'), createNativeId('connectionProfile')),
            )).rejects.toMatchObject({ name: 'NotFoundError' });
        } finally {
            await h.cleanup();
        }
    });
});
