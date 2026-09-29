import { expect, test } from '@jest/globals';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';

test('Session and Work deletion recheck exact revision/version within their owning transaction', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installFixture(h), started = await f.core.create(h.handle, f.start);
        const sessionId = started.session.sessionId;
        await expect(f.sessionRepo.delete(h.handle, sessionId, { expectedRevisionId: 'stale' })).rejects.toMatchObject({ code: 'native_session_delete_conflict' });
        expect(await f.sessionRepo.get(h.handle, sessionId)).not.toBeNull();
        await expect(f.packageRepo.delete(h.handle, f.start.packageId, { baseVersionId: 'stale' })).rejects.toMatchObject({ code: 'native_package_delete_conflict' });
        await expect(f.packageRepo.delete(h.handle, f.start.packageId, { baseVersionId: f.start.packageVersionId })).rejects.toMatchObject({ code: 'native_package_referenced' });
        expect(await f.sessionRepo.delete(h.handle, sessionId, { expectedRevisionId: started.revision.revisionId })).toBe(true);
        expect(await f.packageRepo.delete(h.handle, f.start.packageId, { baseVersionId: f.start.packageVersionId })).toBe(true);
    } finally { await h.cleanup(); }
});
