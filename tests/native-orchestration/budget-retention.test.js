import { BudgetPort, localWorkAttemptId, sendAttemptId } from '../../src/native/orchestration/budget-port.js';
import { admitComputeAttempt, assertComputeLedger, retireComputeLedger, settleComputeAttempt } from '../../public/shared/native-compute-budget.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { RpRunControl, rpOperationInput } from '../../src/native/rp-run-control.js';
import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { createNativeId } from '../../src/native/identity.js';
import { runFixture } from '../native/helpers/run-fixture.js';
import { services } from '../native/helpers/session-fixture.js';
import { prepareControllerOwnerRoot } from './fixtures.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';

const limits = { maxRequests: 2, maxTokens: 200, localWork: { maxJobs: 2, maxItems: 10, maxInputBytes: 1000 } };
const usage = { wallMs: 1, cpuUserMicros: 1, cpuSystemMicros: 0, cpuScope: 'process', outcome: 'completed' };

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s V3 root budget identity retention', (_name, make) => {
    test.each(['provider_send', 'local_work'])('%s: unknown survives source move, late actual and reopen without a child reservation', async kind => {
        const h = await make();
        try {
            await prepareControllerOwnerRoot(h.dirs.root);
            attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
            const f = await runFixture(h, 'http://127.0.0.1:1/unused'), base = await f.begin();
            let port = new BudgetPort({ sessionCore: f.core });
            const authorityRef = await port.authorityFor(h.handle, { domain: 'native_session', sessionId: base.session.sessionId });
            const effectId = createNativeId('orchestrationEffect');
            let ref;
            if (kind === 'provider_send') {
                ({ budgetAttemptRef: ref } = await port.admitAttempt(h.handle, { authorityRef, effectId, providerSendOrdinal: 0,
                    requestId: 'root-model', targetFingerprint: 'a'.repeat(64), inputFingerprint: 'b'.repeat(64), upperBound: 100, limits }));
            } else {
                const attemptId = localWorkAttemptId(effectId, 0);
                await port.chargeLocalWork(h.handle, { authorityRef, limits, effectId, localWorkOrdinal: 0,
                    attempt: { attemptId, requestId: 'root-local', kind: 'context_build', estimatedItems: 1, estimatedInputBytes: 10, targetFingerprint: 'c'.repeat(64) } });
                ref = { kind: 'local_work', authorityRef, effectId, localWorkOrdinal: 0, attemptId, reservationId: null };
            }
            await port.settleAttempt(h.handle, ref, null);
            expect(await port.observeAttempt(h.handle, ref)).toMatchObject({ status: 'unknown' });
            await f.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'Move the source while original work is unknown' });
            expect(await port.observeAttempt(h.handle, ref)).toMatchObject({ status: 'unknown' });
            await expect(port.admitAttempt(h.handle, { authorityRef, effectId, providerSendOrdinal: 1, requestId: 'stale-root',
                targetFingerprint: 'a'.repeat(64), inputFingerprint: 'd'.repeat(64), upperBound: 1, limits })).rejects.toMatchObject({ code: 'native_generation_revision_conflict' });
            const actual = kind === 'provider_send' ? { totalTokens: 60 } : usage;
            await port.settleAttempt(h.handle, ref, actual);
            const before = await port.observeAttempt(h.handle, ref);
            expect(before).toMatchObject({ status: 'settled', orchestration: { kind, effectId, ordinal: 0 } });
            const Engine = h.engine.constructor;
            await h.engine.close(); h.engine = new Engine({ directoriesByHandle: () => h.dirs });
            attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
            const core = services(h).core;
            port = new BudgetPort({ sessionCore: core });
            expect(await port.observeAttempt(h.handle, ref)).toEqual(before);
            await port.settleAttempt(h.handle, ref, actual);
            expect(await port.observeAttempt(h.handle, ref)).toEqual(before);
            const control = await core.runs.status(h.handle, base.session.sessionId), ledger = control.operations[authorityRef.operationId].compute;
            expect(ledger.reservations).toBeUndefined();
            expect(kind === 'provider_send' ? ledger.attempts : ledger.localWork).toHaveLength(1);
            expect(control.retiredCompute).toBeUndefined();
        } finally { await h.engine.close(); await h.cleanup(); }
    });

    test('RP 128-operation retirement keeps the exact V3 row while retiring other original closed work', async () => {
        const h = await make();
        try {
            await prepareControllerOwnerRoot(h.dirs.root);
            attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
            const rpControl = new RpRunControl({ engine: h.engine }), chats = new ChatRepo({ engine: h.engine });
            const locator = { charDir: 'Actor', name: 'main', isGroup: false, groupId: null };
            await chats.save(h.handle, 'Actor', 'main', {}, [{ name: 'User', is_user: true, mes: 'Keep original unknown identity', swipe_id: 0, memory_os_source_id: 'm-retain' }], null);
            const { controlId } = await rpControl.bind(h.handle, locator), chat = await chats.get(h.handle, 'Actor', 'main');
            const source = { input: rpOperationInput(chat.body[0], 0), purpose: 'narration', outputSlot: 'assistant' };
            const port = new BudgetPort({ rpControl }), effectId = createNativeId('orchestrationEffect');
            const authorityRef = await port.authorityFor(h.handle, { domain: 'rp_chat', controlId, source });
            const { budgetAttemptRef } = await port.admitAttempt(h.handle, { authorityRef, effectId, providerSendOrdinal: 0,
                requestId: 'retained-rp', targetFingerprint: 'a'.repeat(64), inputFingerprint: 'b'.repeat(64), upperBound: 100, limits });
            await port.settleAttempt(h.handle, budgetAttemptRef, null);
            for (let index = 0; index < 127; index++) {
                const attemptId = hashNativeDocument({ ordinary: index });
                const admitted = await rpControl.admitCompute(h.handle, controlId, { ...source, outputSlot: 'ordinary_' + index }, limits,
                    { attemptId, requestId: 'ordinary-' + index, targetFingerprint: 'c'.repeat(64), inputFingerprint: 'd'.repeat(64), estimatedTokens: 1 });
                await rpControl.settleCompute(h.handle, controlId, admitted.operation, attemptId, { totalTokens: 1 });
            }
            expect(Object.keys((await rpControl.status(h.handle, controlId)).operations)).toHaveLength(128);
            await rpControl.admitCompute(h.handle, controlId, { ...source, outputSlot: 'after_retirement' }, limits,
                { attemptId: 'e'.repeat(64), requestId: 'ordinary-new', targetFingerprint: 'c'.repeat(64), inputFingerprint: 'd'.repeat(64), estimatedTokens: 1 });
            const after = await rpControl.status(h.handle, controlId);
            expect(Object.keys(after.operations)).toHaveLength(2);
            expect(after.retiredCompute).toMatchObject({ modelAttempts: 127, knownTotalTokens: 127 });
            expect(await port.observeAttempt(h.handle, budgetAttemptRef)).toMatchObject({ status: 'unknown' });
            await port.settleAttempt(h.handle, budgetAttemptRef, { totalTokens: 60 });
            expect(await port.observeAttempt(h.handle, budgetAttemptRef)).toMatchObject({ status: 'settled', usage: { totalTokens: 60 } });
        } finally { await h.engine.close(); await h.cleanup(); }
    }, 30000);

    test.each(['provider_send', 'local_work'])('%s: an ordinary bank row cannot be relabeled as a V3 proof from a coinciding stable ID', async kind => {
        const h = await make();
        try {
            await prepareControllerOwnerRoot(h.dirs.root);
            attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
            const f = await runFixture(h, 'http://127.0.0.1:1/unused'), base = await f.begin(), port = new BudgetPort({ sessionCore: f.core });
            const authorityRef = await port.authorityFor(h.handle, { domain: 'native_session', sessionId: base.session.sessionId });
            const effectId = createNativeId('orchestrationEffect'), anchor = { branchId: base.revision.branchId, revisionId: base.revision.revisionId };
            const attemptId = kind === 'provider_send' ? sendAttemptId(effectId, 0) : localWorkAttemptId(effectId, 0);
            const attempt = { attemptId, requestId: 'ordinary-row', targetFingerprint: 'a'.repeat(64) };
            if (kind === 'provider_send') await f.core.runs.admitCompute(h.handle, base, anchor, limits, { ...attempt, estimatedTokens: 10, inputFingerprint: 'b'.repeat(64) });
            else await f.core.runs.chargeLocalWork(h.handle, base, anchor, limits, { ...attempt, kind: 'context_build', estimatedItems: 1, estimatedInputBytes: 10 });
            const ref = kind === 'provider_send' ? { authorityRef, effectId, providerSendOrdinal: 0, attemptId, reservationId: null }
                : { kind: 'local_work', authorityRef, effectId, localWorkOrdinal: 0, attemptId, reservationId: null };
            await expect(port.observeAttempt(h.handle, ref)).rejects.toMatchObject({ code: 'native_orchestration_budget_attempt_invalid' });
            await expect(h.engine.withTransaction(h.handle, tx => port.verifyBudgetAttempt({ handle: h.handle, tx, root: { budgetAuthorityRef: authorityRef }, intent: { effectId }, budgetAttemptRef: ref })))
                .rejects.toMatchObject({ code: 'native_orchestration_budget_attempt_invalid' });
        } finally { await h.engine.close(); await h.cleanup(); }
    });
});

test('original ledger binds and retains exact immutable V3 provenance; stable hashes keep the frozen namespace', () => {
    const effectId = createNativeId('orchestrationEffect'), holder = {};
    const attempt = { attemptId: sendAttemptId(effectId, 2), requestId: 'pure-model', targetFingerprint: 'a'.repeat(64), inputFingerprint: 'b'.repeat(64), estimatedTokens: 100,
        orchestration: { kind: 'provider_send', effectId, ordinal: 2 } };
    expect(attempt.attemptId).toBe(hashNativeDocument({ effectId, providerSendOrdinal: 2 }));
    expect(localWorkAttemptId(effectId, 2)).toBe(hashNativeDocument({ effectId, localWorkOrdinal: 2 }));
    expect(admitComputeAttempt(holder, limits, attempt).replayed).toBe(false);
    attempt.orchestration.ordinal = 3;
    expect(holder.compute.attempts[0].orchestration.ordinal).toBe(2);
    const replay = { ...attempt, orchestration: { ordinal: 2, effectId, kind: 'provider_send' } };
    expect(admitComputeAttempt(holder, limits, replay).replayed).toBe(true);
    const { orchestration: _provenance, ...naked } = replay;
    expect(() => admitComputeAttempt(holder, limits, naked)).toThrow('native_generation_attempt_conflict');
    const fresh = {};
    expect(() => admitComputeAttempt(fresh, limits, { ...replay, attemptId: sendAttemptId(effectId, 7) })).toThrow('native_generation_budget_invalid');
    expect(fresh.compute).toBeUndefined();
    expect(() => admitComputeAttempt(holder, limits, attempt)).toThrow('native_generation_budget_invalid');
    for (const update of [row => row.orchestration = null, row => row.orchestration.kind = 'local_work', row => row.orchestration.effectId = createNativeId('orchestrationEffect')]) {
        const corrupt = structuredClone(holder.compute); update(corrupt.attempts[0]);
        expect(() => assertComputeLedger(corrupt)).toThrow();
    }
    settleComputeAttempt(holder, replay.attemptId, { totalTokens: 60 });
    expect(() => retireComputeLedger(undefined, holder.compute)).toThrow('native_generation_attempt_conflict');
});
