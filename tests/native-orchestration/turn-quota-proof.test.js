import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../src/native/identity.js';
import { runFixture } from '../native/helpers/run-fixture.js';
import { cancelSessionMaintenance } from '../../src/native/session-maintenance.js';
import { prepareControllerOwnerRoot } from './fixtures.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';

// These negative boundaries exercise the original quota-bearing Session and
// bank. End-to-end producer proof is covered with the real Turn factory.
describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s V3 cannot bypass original foreground quota', (_name, make) => {
    let h, f, base, port, authorityRef;
    const limits = { maxRequests: 4, maxTokens: 4000 };
    beforeEach(async () => {
        h = await make(); await prepareControllerOwnerRoot(h.dirs.root);
        attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        f = await runFixture(h, 'http://127.0.0.1:1/never'); base = await f.begin();
        port = new BudgetPort({ sessionCore: f.core });
        authorityRef = await port.authorityFor(h.handle, { domain: 'native_session', sessionId: base.session.sessionId });
    });
    afterEach(async () => {
        cancelSessionMaintenance(f.sessionRepo, h.handle, base.session.sessionId);
        await h.engine.close(); await h.cleanup();
    });

    test.each(['missing', 'json-proof', 'json-quota'])('%s cannot admit a V3 provider row through the direct bank', async fault => {
        const before = await f.core.runs.status(h.handle, base.session.sessionId);
        const quota = { request: { role: 'narrator', background: false, anchor: { branchId: base.revision.branchId, revisionId: base.revision.revisionId } },
            policy: base.manifest.runtime.experienceContract.generationBudget };
        const input = { authorityRef, effectId: createNativeId('orchestrationEffect'), providerSendOrdinal: 0, requestId: 'not-a-real-turn-producer',
            targetFingerprint: 'a'.repeat(64), inputFingerprint: 'b'.repeat(64), upperBound: 100, limits,
            ...(fault === 'json-proof' ? { quotaProof: {} } : fault === 'json-quota' ? { quota } : {}) };
        await expect(port.admitAttempt(h.handle, input)).rejects.toMatchObject({ code: 'native_generation_budget_lane_denied' });
        expect(await f.core.runs.status(h.handle, base.session.sessionId)).toEqual(before);
    });

    test('JSON trusted-option copies cannot enter generic Host.execute or mint a Narrator proof', async () => {
        const bank = port.sendBank(h.handle, { authorityRef, effectId: createNativeId('orchestrationEffect'), firstOrdinal: 0, limits, quotaProof: {} });
        await expect(f.host.execute(h.handle, { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, requestId: 'copied-role', role: 'narrator' },
            undefined, undefined, { orchestrationSend: { bank, quotaProof: {} } })).rejects.toMatchObject({ code: 'native_generation_budget_lane_denied' });
        expect(bank.nextOrdinal()).toBe(0);
    });
});
