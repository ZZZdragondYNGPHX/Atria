import { createHash } from 'node:crypto';

import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import {
    PackageRepo,
    SavePointRepo,
    SessionRepo,
    createNativeId,
} from '../../src/native/index.js';
import { ConflictError } from '../../src/storage/errors.js';

const digest = value => createHash('sha256').update(value).digest('hex');

describe.each(CONTRACT_HARNESSES)('N1 Native revision GC — $name', ({ make }) => {
    let h;
    let packageRepo;
    let sessionRepo;
    let savePointRepo;

    beforeEach(async () => {
        h = await make();
        packageRepo = new PackageRepo({ engine: h.engine });
        sessionRepo = new SessionRepo({ engine: h.engine });
        savePointRepo = new SavePointRepo({ engine: h.engine });
    });

    afterEach(async () => {
        await h.cleanup();
    });

    test('PackageVersion GC preserves current and Session-pinned versions', async () => {
        const handle = h.handle;
        const packageId = createNativeId('package');
        const currentVersionId = createNativeId('packageVersion');
        const orphanVersionId = createNativeId('packageVersion');

        await packageRepo.create(handle, {
            packageId,
            displayName: 'Work',
            currentVersionId: null,
            createdAt: 1,
            updatedAt: 1,
        });
        await packageRepo.commitVersion(handle, {
            packageVersionId: currentVersionId,
            packageId,
            version: '1.0.0',
            packageContentHash: digest('v1'),
            createdAt: 2,
        });
        await packageRepo.commitVersion(handle, {
            packageVersionId: orphanVersionId,
            packageId,
            version: '2.0.0',
            packageContentHash: digest('v2'),
            createdAt: 3,
        }, { setCurrent: false });

        expect(await packageRepo.gcVersions(handle, packageId)).toEqual([orphanVersionId]);
        expect(await packageRepo.getVersion(handle, packageId, currentVersionId)).not.toBeNull();
        expect(await packageRepo.getVersion(handle, packageId, orphanVersionId)).toBeNull();

        await packageRepo.commitVersion(handle, {
            packageVersionId: orphanVersionId,
            packageId,
            version: '2.0.0',
            packageContentHash: digest('v2'),
            createdAt: 3,
        }, { setCurrent: false });

        const sessionId = createNativeId('session');
        const branchId = createNativeId('branch');
        await sessionRepo.create(handle, {
            sessionId,
            packageId,
            packageVersionId: orphanVersionId,
            packageVersion: '2.0.0',
            packageContentHash: digest('v2'),
            entryPointId: createNativeId('entryPoint'),
            activeBranchId: branchId,
            headRevisionId: null,
            createdAt: 4,
            updatedAt: 4,
        });

        expect(await packageRepo.gcVersions(handle, packageId)).toEqual([]);
        await expect(packageRepo.deleteVersion(handle, packageId, orphanVersionId))
            .rejects.toBeInstanceOf(ConflictError);
    });

    test('SessionRevision GC preserves HEAD and SavePoint-pinned revisions', async () => {
        const handle = h.handle;
        const sessionId = createNativeId('session');
        const branchId = createNativeId('branch');

        await sessionRepo.create(handle, {
            sessionId,
            packageId: createNativeId('package'),
            packageVersionId: createNativeId('packageVersion'),
            packageVersion: '1.0.0',
            packageContentHash: digest('pkg'),
            entryPointId: createNativeId('entryPoint'),
            activeBranchId: branchId,
            headRevisionId: null,
            createdAt: 1,
            updatedAt: 1,
        });
        await sessionRepo.saveBranch(handle, {
            branchId,
            sessionId,
            parentBranchId: null,
            forkPoint: null,
            createdAt: 2,
        });

        const headRevisionId = createNativeId('revision');
        const savedRevisionId = createNativeId('revision');
        await sessionRepo.commitRevision(handle, {
            revisionId: headRevisionId,
            sessionId,
            branchId,
            timelineHead: null,
            knowledgeHead: 'knowledge-head-current',
            stateHeads: {},
            createdAt: 3,
        });
        await sessionRepo.putRevision(handle, {
            revisionId: savedRevisionId,
            sessionId,
            branchId,
            timelineHead: null,
            knowledgeHead: 'knowledge-head-saved',
            stateHeads: {},
            createdAt: 4,
        });

        const saveId = createNativeId('savePoint');
        await savePointRepo.create(handle, {
            saveId,
            sessionId,
            branchId,
            revisionId: savedRevisionId,
            kind: 'manual',
            createdAt: 5,
        });

        expect(await sessionRepo.gcRevisions(handle, sessionId)).toEqual([]);
        await expect(sessionRepo.deleteRevision(handle, sessionId, headRevisionId))
            .rejects.toBeInstanceOf(ConflictError);
        await expect(sessionRepo.deleteRevision(handle, sessionId, savedRevisionId))
            .rejects.toBeInstanceOf(ConflictError);

        expect(await savePointRepo.delete(handle, sessionId, saveId)).toBe(true);
        expect(await sessionRepo.gcRevisions(handle, sessionId)).toEqual([savedRevisionId]);
        expect(await sessionRepo.getRevision(handle, sessionId, savedRevisionId)).toBeNull();
        expect(await sessionRepo.getRevision(handle, sessionId, headRevisionId)).not.toBeNull();
    });
});
