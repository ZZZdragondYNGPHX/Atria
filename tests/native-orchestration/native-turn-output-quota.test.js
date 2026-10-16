import { nativeTaskScheduler } from '../../src/native/task-scheduler.js';
import { captureNativeTurnPermit, captureNativeTurnFinalizationPermit } from '../../src/native/orchestration/native-turn-permit.js';
import { mintNativeNarratorQuota, mintNativeResolverQuota, assertNativeTurnQuota, assertNativeNarratorQuota, assertNativeTurnOutputQuota } from '../../src/native/orchestration/native-turn-quota.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { runFixture } from '../native/helpers/run-fixture.js';
import { prepareControllerOwnerRoot } from './fixtures.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { cancelSessionMaintenance } from '../../src/native/session-maintenance.js';

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
async function held({ host = { sessionCore: {} }, handle = 'owner', selection = {}, snapshot = {
    session: { sessionId: 'session' }, revision: { branchId: 'branch', revisionId: 'revision' }, manifest: { runtime: { experienceContract: {} } },
}, beforeFinalize = async () => {} } = {}) {
    const entered = deferred(), release = deferred(), invocationId = 'output-quota-test';
    const sessionId = snapshot.session.sessionId, anchor = { branchId: snapshot.revision.branchId, revisionId: snapshot.revision.revisionId };
    const requestHash = hash({ invocationId, anchor }), resources = ['session:' + handle + ':' + sessionId]; let narrator, resolver;
    const producer = { host, handle, selection, snapshot, invocationId, anchor, requestHash };
    const request = role => ({ role, sessionId, revisionId: anchor.revisionId, requestId: invocationId + (role === 'narrator' ? '' : ':intent') });
    const expected = role => ({ host, sessionCore: host.sessionCore, handle, sessionId, role, invocationId, requestHash, selection, anchor,
        requestId: request(role).requestId, policy: snapshot.manifest.runtime.experienceContract.generationBudget ?? null });
    const operation = nativeTaskScheduler.submit({ owner: handle, anchor: { sessionId, ...anchor }, resources, kind: 'turn', executionClass: 'turn_blocking',
        key: sessionId + ':' + invocationId + ':turn', fingerprint: requestHash, retry: false, fresh: async () => true,
        run: async boundary => {
            producer.permit = captureNativeTurnPermit({ ...producer, sessionId, resources, boundary });
            narrator = mintNativeNarratorQuota({ ...producer, request: request('narrator') }); resolver = mintNativeResolverQuota({ ...producer, request: request('intent_resolver') });
            await beforeFinalize(narrator, expected('narrator')); return 'prepared';
        }, finalize: async (value, _receipt, finalizationBoundary) => {
            const finalizationPermit = captureNativeTurnFinalizationPermit({ permit: producer.permit, finalizationBoundary });
            entered.resolve(finalizationPermit); await release.promise; return value;
        } });
    const finalizationPermit = await entered.promise;
    return { host, selection, producer, narrator, resolver, finalizationPermit, expected, request, operation,
        finish: async () => { release.resolve(); await operation.result; } };
}

test('an original Narrator can revalidate output in its finalizer while all original generation proof checks stay denied', async () => {
    const f = await held();
    try {
        const output = assertNativeTurnOutputQuota(f.narrator, f.finalizationPermit, f.expected('narrator'));
        expect(output).toMatchObject({ role: 'narrator', invocationId: f.producer.invocationId, requestHash: f.producer.requestHash, policy: null });
        expect(() => assertNativeTurnQuota(f.narrator, f.expected('narrator'))).toThrow('operation_boundary_denied');
        expect(() => assertNativeNarratorQuota(f.narrator, f.expected('narrator'))).toThrow('operation_boundary_denied');
        expect(() => assertNativeTurnOutputQuota(f.resolver, f.finalizationPermit, f.expected('intent_resolver'))).toThrow();
        expect(() => assertNativeTurnOutputQuota(f.resolver, f.finalizationPermit, f.expected('narrator'))).toThrow();
    } finally { await f.finish(); }
    expect(() => assertNativeTurnOutputQuota(f.narrator, f.finalizationPermit, f.expected('narrator'))).toThrow();
});

test('clones, changed owner/Host/source/selection/policy and caller allow fields cannot become output disclosure authority', async () => {
    const f = await held();
    try {
        for (const proof of [{}, structuredClone(f.narrator), f.finalizationPermit])
            expect(() => assertNativeTurnOutputQuota(proof, f.finalizationPermit, f.expected('narrator'))).toThrow();
        for (const final of [{}, structuredClone(f.finalizationPermit), f.producer.permit])
            expect(() => assertNativeTurnOutputQuota(f.narrator, final, f.expected('narrator'))).toThrow();
        const expected = f.expected('narrator');
        for (const changed of [{ ...expected, host: { sessionCore: {} } }, { ...expected, sessionCore: {} }, { ...expected, handle: 'foreign' },
            { ...expected, selection: {} }, { ...expected, requestId: 'foreign' }, { ...expected, anchor: { ...expected.anchor, revisionId: 'foreign' } },
            { ...expected, policy: {} }, { ...expected, allowed: true }])
            expect(() => assertNativeTurnOutputQuota(f.narrator, f.finalizationPermit, changed)).toThrow();
    } finally { await f.finish(); }
});

test('the same later owner/Host/source/request/selection metadata cannot revive the previous original operation quota', async () => {
    const host = { sessionCore: {} }, selection = {}, first = await held({ host, selection }); await first.finish();
    const second = await held({ host, selection });
    try {
        expect(first.expected('narrator')).toEqual(second.expected('narrator'));
        expect(() => assertNativeTurnOutputQuota(first.narrator, second.finalizationPermit, second.expected('narrator'))).toThrow('native_orchestration_turn_permit_denied');
        expect(assertNativeTurnOutputQuota(second.narrator, second.finalizationPermit, second.expected('narrator')).requestId).toBe(second.request('narrator').requestId);
    } finally { await second.finish(); }
});

describe.each(CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name)))('$name original output disclosure and unchanged bank', ({ make }) => {
    test('the read-only finalization proof cannot admit another Model, while the original admitted charge can be observed and settled', async () => {
        const h = await make(); let session, base, frame;
        try {
            await prepareControllerOwnerRoot(h.dirs.root); attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
            session = await runFixture(h, 'http://127.0.0.1:1/never-sent'); base = await session.begin();
            const port = new BudgetPort({ sessionCore: session.core }), authorityRef = await port.authorityFor(h.handle, { domain: 'native_session', sessionId: base.session.sessionId });
            const effectId = createNativeId('orchestrationEffect'); let receipt;
            const admit = (quotaProof, ordinal) => port.admitAttempt(h.handle, { authorityRef, effectId, providerSendOrdinal: ordinal,
                requestId: 'output-quota-test', targetFingerprint: 'a'.repeat(64), inputFingerprint: 'b'.repeat(64), upperBound: 100,
                limits: { maxRequests: 4, maxTokens: 4000 }, quotaProof });
            frame = await held({ host: session.host, handle: h.handle, snapshot: base, beforeFinalize: async proof => { receipt = await admit(proof, 0); } });
            const before = (await session.core.runs.status(h.handle, base.session.sessionId)).operations[authorityRef.operationId];
            const output = assertNativeTurnOutputQuota(frame.narrator, frame.finalizationPermit, frame.expected('narrator'));
            await expect(admit(frame.narrator, 1)).rejects.toMatchObject({ code: 'operation_boundary_denied' });
            await expect(admit(frame.finalizationPermit, 1)).rejects.toMatchObject({ code: 'native_generation_budget_lane_denied' });
            await expect(admit(output, 1)).rejects.toMatchObject({ code: 'native_generation_budget_lane_denied' });
            expect((await session.core.runs.status(h.handle, base.session.sessionId)).operations[authorityRef.operationId]).toEqual(before);
            expect(await port.observeAttempt(h.handle, receipt.budgetAttemptRef)).toMatchObject({ status: 'charged' });
            await frame.finish();
            await port.settleAttempt(h.handle, receipt.budgetAttemptRef, { inputTokens: 7, outputTokens: 3, totalTokens: 10 });
            expect(await port.observeAttempt(h.handle, receipt.budgetAttemptRef)).toMatchObject({ status: 'settled', usage: { totalTokens: 10 } });
            expect((await session.core.runs.status(h.handle, base.session.sessionId)).operations[authorityRef.operationId].compute.attempts).toHaveLength(1);
        } finally {
            await frame?.finish(); if (base) cancelSessionMaintenance(session.sessionRepo, h.handle, base.session.sessionId);
            await h.engine.close(); await h.cleanup();
        }
    });
});
