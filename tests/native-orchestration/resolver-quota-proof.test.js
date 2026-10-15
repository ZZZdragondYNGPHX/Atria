import { jest } from '@jest/globals';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { captureNativeTurnPermit } from '../../src/native/orchestration/native-turn-permit.js';
import { mintNativeNarratorQuota, mintNativeResolverQuota, assertNativeNarratorQuota, assertNativeResolverQuota, assertNativeTurnQuota } from '../../src/native/orchestration/native-turn-quota.js';
import { nativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { runFixture } from '../native/helpers/run-fixture.js';
import { cancelSessionMaintenance } from '../../src/native/session-maintenance.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { prepareControllerOwnerRoot } from './fixtures.js';

if (process.env.ATRIA_TEST_RESOLVER_QUOTA_SQL === '1') jest.setTimeout(60_000);

// Exercise the internal Host bridge against an actual original Scheduler Turn
// and original Session bank. HTTP/model/context admission is tested separately.
async function fixture(make) {
    const h = await make(); let f, base, operation, release;
    try {
        await prepareControllerOwnerRoot(h.dirs.root);
        attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        f = await runFixture(h, 'http://127.0.0.1:1/not-sent'); base = await f.begin();
        const anchor = { branchId: base.revision.branchId, revisionId: base.revision.revisionId };
        const invocationId = 'original-resolver-turn', requestHash = hash({ invocationId, anchor }), selection = Object.freeze({});
        const resources = ['session:' + h.handle + ':' + base.session.sessionId];
        let enter;
        const entered = new Promise(resolve => { enter = resolve; }), held = new Promise(resolve => { release = resolve; });
        operation = nativeTaskScheduler.submit({ owner: h.handle, anchor: { sessionId: base.session.sessionId, ...anchor }, kind: 'turn', executionClass: 'turn_blocking',
            key: base.session.sessionId + ':' + invocationId + ':turn', fingerprint: requestHash, resources, fresh: async () => true, retry: false,
            run: async boundary => { enter(boundary); await held; return 'finished'; }, finalize: async value => value });
        const boundary = await entered;
        const producer = { host: f.host, handle: h.handle, snapshot: base, anchor, invocationId, requestHash, selection };
        producer.permit = captureNativeTurnPermit({ ...producer, sessionId: base.session.sessionId, boundary, resources });
        const request = role => ({ sessionId: base.session.sessionId, revisionId: base.revision.revisionId,
            requestId: role === 'narrator' ? invocationId : invocationId + ':intent', role });
        const expected = role => ({ host: f.host, sessionCore: f.core, handle: h.handle, sessionId: base.session.sessionId,
            requestId: request(role).requestId, invocationId, requestHash, selection, anchor, policy: base.manifest.runtime.experienceContract.generationBudget, role });
        const resolver = mintNativeResolverQuota({ ...producer, request: request('intent_resolver') });
        const narrator = mintNativeNarratorQuota({ ...producer, request: request('narrator') });
        const port = new BudgetPort({ sessionCore: f.core });
        const authorityRef = await port.authorityFor(h.handle, { domain: 'native_session', sessionId: base.session.sessionId });
        const effectId = createNativeId('orchestrationEffect');
        const admit = (quotaProof, role, ordinal) => port.admitAttempt(h.handle, { authorityRef, effectId, providerSendOrdinal: ordinal,
            requestId: request(role).requestId, targetFingerprint: 'a'.repeat(64), inputFingerprint: 'b'.repeat(64), upperBound: 100,
            limits: { maxRequests: 4, maxTokens: 4000 }, quotaProof });
        const status = async () => (await f.core.runs.status(h.handle, base.session.sessionId))?.operations[authorityRef.operationId] ?? null;
        const finish = async () => { release(); await operation.result; };
        return { h, f, base, producer, request, expected, resolver, narrator, port, admit, status, finish,
            cleanup: async () => { await finish(); cancelSessionMaintenance(f.sessionRepo, h.handle, base.session.sessionId); await h.engine.close(); await h.cleanup(); } };
    } catch (error) {
        release?.(); await operation?.result.catch(() => {});
        if (base) cancelSessionMaintenance(f.sessionRepo, h.handle, base.session.sessionId);
        await h.engine.close(); await h.cleanup(); throw error;
    }
}

describe.each(CONTRACT_HARNESSES.filter(({ name }) => process.env.ATRIA_TEST_RESOLVER_QUOTA_SQL === '1' || ['FsEngine', 'SqliteEngine'].includes(name)))('$name original resolver quota proof', ({ make }) => {
    test('one original Turn permit mints distinct closed roles and spends their original bounded quotas', async () => {
        const f = await fixture(make);
        try {
            expect(assertNativeResolverQuota(f.resolver, f.expected('intent_resolver')).quota.request.role).toBe('intent_resolver');
            expect(assertNativeNarratorQuota(f.narrator, f.expected('narrator')).quota.request.role).toBe('narrator');
            const { role: _role, ...generic } = f.expected('intent_resolver');
            expect(assertNativeTurnQuota(f.resolver, generic).role).toBe('intent_resolver');
            const first = await f.admit(f.resolver, 'intent_resolver', 0);
            expect(await f.admit(f.resolver, 'intent_resolver', 0)).toMatchObject({ replayed: true });
            await f.admit(f.resolver, 'intent_resolver', 1); await f.admit(f.narrator, 'narrator', 2);
            const before = await f.status();
            expect(before).toMatchObject({ total: 3, attempts: { intent_resolver: 2, narrator: 1 } });
            expect(before.compute.attempts.map(row => row.generationQuotaRef.role)).toEqual(['intent_resolver', 'intent_resolver', 'narrator']);
            expect(first.budgetAttemptRef.providerSendOrdinal).toBe(0);
            await expect(f.admit(f.resolver, 'intent_resolver', 3)).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
            expect(await f.status()).toEqual(before);
        } finally { await f.cleanup(); }
    });

    test('JSON, cross-role, wrong request and moved producer identity cannot create a proof or charge a row', async () => {
        const f = await fixture(make);
        try {
            for (const copy of [{}, structuredClone(f.resolver), JSON.parse(JSON.stringify(f.resolver))]) {
                expect(() => assertNativeResolverQuota(copy, f.expected('intent_resolver'))).toThrow('Trusted original Turn producer');
                await expect(f.admit(copy, 'intent_resolver', 0)).rejects.toMatchObject({ code: 'native_generation_budget_lane_denied' });
            }
            expect(() => assertNativeNarratorQuota(f.resolver, f.expected('narrator'))).toThrow('Trusted original Turn producer');
            expect(() => assertNativeResolverQuota(f.narrator, f.expected('intent_resolver'))).toThrow('Trusted original Turn producer');
            for (const extra of [{ role: 'narrator' }, { requestId: f.producer.invocationId }, { handle: 'foreign' }, { sessionCore: {} },
                { invocationId: 'foreign' }, { requestHash: 'c'.repeat(64) }, { selection: {} }, { anchor: { ...f.producer.anchor, revisionId: 'foreign' } }, { policy: null }])
                expect(() => assertNativeResolverQuota(f.resolver, { ...f.expected('intent_resolver'), ...extra })).toThrow('Trusted original Turn producer');
            for (const extra of [{ role: 'narrator' }, { role: 'task' }, { requestId: f.producer.invocationId }, { requestId: f.producer.invocationId + ':other' }])
                expect(() => mintNativeResolverQuota({ ...f.producer, request: { ...f.request('intent_resolver'), ...extra } })).toThrow('Trusted original Turn producer');
            await expect(f.admit(f.resolver, 'narrator', 0)).rejects.toMatchObject({ code: 'native_generation_budget_lane_denied' });
            expect(await f.status()).toBeNull();
        } finally { await f.cleanup(); }
    });

    test('completed original Turn proof cannot admit again while factual observation and late settlement remain available', async () => {
        const f = await fixture(make);
        try {
            const accepted = await f.admit(f.resolver, 'intent_resolver', 0), before = await f.status();
            await f.finish();
            expect(() => assertNativeResolverQuota(f.resolver, f.expected('intent_resolver'))).toThrow('operation_boundary_denied');
            await expect(f.admit(f.resolver, 'intent_resolver', 1)).rejects.toMatchObject({ code: 'operation_boundary_denied' });
            expect(await f.status()).toEqual(before);
            expect(await f.port.observeAttempt(f.h.handle, accepted.budgetAttemptRef)).toMatchObject({ status: 'charged' });
            await f.port.settleAttempt(f.h.handle, accepted.budgetAttemptRef, { inputTokens: 7, outputTokens: 3, totalTokens: 10 });
            expect(await f.port.observeAttempt(f.h.handle, accepted.budgetAttemptRef)).toMatchObject({ status: 'settled', usage: { totalTokens: 10 } });
            expect((await f.status()).attempts).toEqual({ intent_resolver: 1 });
        } finally { await f.cleanup(); }
    });
});
