import {
    KnowledgeRepo,
    NATIVE_RESOURCE_KINDS,
    SessionRepo,
    WorldRepo,
    createNativeId,
} from '../../src/native/index.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';

function failPublishEngine(baseEngine, publishKind, errorMessage) {
    let fail = false;
    return {
        kind: 'fs',
        arm() { fail = true; },
        withTransaction(handle, fn) {
            return baseEngine.withTransaction(handle, tx => fn(new Proxy(tx, {
                get(target, prop) {
                    if (prop === 'putResource') {
                        return async (key, record) => {
                            if (fail && key?.kind === publishKind) {
                                throw new Error(errorMessage);
                            }
                            return target.putResource(key, record);
                        };
                    }
                    const value = target[prop];
                    return typeof value === 'function' ? value.bind(target) : value;
                },
            })));
        },
    };
}

describe('N1 FS commit-last failure semantics', () => {
    let h;

    beforeEach(async () => {
        h = await makeTempFsEngineHarness();
    });

    afterEach(async () => {
        await h.cleanup();
    });

    test('failed Session HEAD publish leaves only an uncommitted immutable revision', async () => {
        const handle = h.handle;
        const sessionId = createNativeId('session');
        const branchId = createNativeId('branch');
        const packageHash = 'a'.repeat(64);
        const baseRepo = new SessionRepo({ engine: h.engine });
        await baseRepo.create(handle, {
            sessionId,
            packageId: createNativeId('package'),
            packageVersionId: createNativeId('packageVersion'),
            packageVersion: '1.0.0',
            packageContentHash: packageHash,
            entryPointId: createNativeId('entryPoint'),
            activeBranchId: branchId,
            headRevisionId: null,
            createdAt: 1,
            updatedAt: 1,
        });
        await baseRepo.saveBranch(handle, {
            branchId,
            sessionId,
            parentBranchId: null,
            forkPoint: null,
            createdAt: 2,
        });

        const failingEngine = failPublishEngine(
            h.engine,
            NATIVE_RESOURCE_KINDS.session,
            'injected session-head publish failure',
        );
        const repo = new SessionRepo({ engine: failingEngine });
        const revisionId = createNativeId('revision');
        const revision = {
            revisionId,
            sessionId,
            branchId,
            timelineHead: null,
            knowledgeHead: 'knowledge-head-1',
            stateHeads: {},
            createdAt: 3,
        };
        failingEngine.arm();

        await expect(repo.commitRevision(handle, revision))
            .rejects.toThrow('injected session-head publish failure');

        expect(await baseRepo.getRevision(handle, sessionId, revisionId)).toEqual(revision);
        expect((await baseRepo.get(handle, sessionId)).headRevisionId).toBeNull();
    });

    test('failed World current-pointer publish leaves an orphan immutable WorldRevision only', async () => {
        const handle = h.handle;
        const worldId = createNativeId('world');
        const revisionId = createNativeId('worldRevision');
        const baseRepo = new WorldRepo({ engine: h.engine });
        await baseRepo.create(handle, {
            worldId,
            displayName: 'World',
            currentRevisionId: null,
            createdAt: 1,
            updatedAt: 1,
        });

        const failingEngine = failPublishEngine(
            h.engine,
            NATIVE_RESOURCE_KINDS.world,
            'injected world-pointer publish failure',
        );
        const repo = new WorldRepo({ engine: failingEngine });
        const revision = {
            worldRevisionId: revisionId,
            worldId,
            knowledgeBindingIds: [],
            assetIds: [],
            metadata: {},
            createdAt: 2,
        };
        failingEngine.arm();

        await expect(repo.commitRevision(handle, revision))
            .rejects.toThrow('injected world-pointer publish failure');

        expect(await baseRepo.getRevision(handle, worldId, revisionId)).toEqual(revision);
        expect((await baseRepo.get(handle, worldId)).currentRevisionId).toBeNull();
    });

    test('failed Knowledge current-pointer publish leaves immutable entries/revision without publishing it', async () => {
        const handle = h.handle;
        const knowledgeBaseId = createNativeId('knowledgeBase');
        const knowledgeRevisionId = createNativeId('knowledgeRevision');
        const entryId = createNativeId('knowledgeEntry');
        const baseRepo = new KnowledgeRepo({ engine: h.engine });
        await baseRepo.create(handle, {
            knowledgeBaseId,
            displayName: 'Knowledge',
            currentRevisionId: null,
            createdAt: 1,
            updatedAt: 1,
        });

        const failingEngine = failPublishEngine(
            h.engine,
            NATIVE_RESOURCE_KINDS.knowledgeBase,
            'injected knowledge-pointer publish failure',
        );
        const repo = new KnowledgeRepo({ engine: failingEngine });
        const revision = {
            knowledgeRevisionId,
            knowledgeBaseId,
            entryIds: [entryId],
            metadata: {},
            createdAt: 2,
        };
        const entry = {
            knowledgeEntryId: entryId,
            content: 'immutable entry',
            metadata: {},
        };
        failingEngine.arm();

        await expect(repo.commitRevision(handle, revision, [entry]))
            .rejects.toThrow('injected knowledge-pointer publish failure');

        expect(await baseRepo.getRevision(handle, knowledgeBaseId, knowledgeRevisionId)).toEqual(revision);
        expect(await baseRepo.getEntry(handle, knowledgeBaseId, knowledgeRevisionId, entryId)).toEqual(entry);
        expect((await baseRepo.get(handle, knowledgeBaseId)).currentRevisionId).toBeNull();
    });
});
