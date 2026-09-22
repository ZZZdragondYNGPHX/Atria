import {
    NATIVE_RESOURCE_KINDS,
    SessionRepo,
    createNativeId,
} from '../../src/native/index.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';

function failSessionHeadEngine(baseEngine) {
    let fail = false;
    return {
        kind: 'fs',
        arm() { fail = true; },
        withTransaction(handle, fn) {
            return baseEngine.withTransaction(handle, tx => fn(new Proxy(tx, {
                get(target, prop) {
                    if (prop === 'putResource') {
                        return async (key, record) => {
                            if (fail && key?.kind === NATIVE_RESOURCE_KINDS.session) {
                                throw new Error('injected session-head publish failure');
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

        const failingEngine = failSessionHeadEngine(h.engine);
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

        // FsEngine has no rollback: immutable child survives, but the Session
        // HEAD commit marker stays on the previous value. The orphan is not
        // observable as committed progress and is eligible for later GC.
        expect(await baseRepo.getRevision(handle, sessionId, revisionId)).toEqual(revision);
        expect((await baseRepo.get(handle, sessionId)).headRevisionId).toBeNull();
    });
});
