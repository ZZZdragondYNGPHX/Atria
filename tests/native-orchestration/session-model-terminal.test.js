import { modelPortFixture } from './helpers/model-port-fixture.js';
import { resolverTurnFixture } from './helpers/resolver-turn-fixture.js';
import { sessionContextRetrievalFixture } from './helpers/session-context-retrieval-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { readAttempt } from '../../src/native/orchestration/controller-common.js';
import { readAttemptSettlement } from '../../src/native/orchestration/attempt-settlement.js';
import { runGuard } from '../../src/native/orchestration/controller-common.js';
import { createNativeId } from '../../src/native/identity.js';

async function current(f) {
    const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
    const attempts = await f.authority.engine.withTransaction(f.h.handle, async tx => Promise.all(root.attemptRefs.map(async id => (await readAttempt(tx, f.h.handle, root, id)).doc)));
    return { root, attempts };
}

describe.each(CONTRACT_HARNESSES)('$name original Session Model terminal consumer', ({ make }) => {
    test.each(['narrator', 'resolver'])('%s final paid HTTP failure settles its original Attempt and fails the Run without output', async role => {
        const f = await (role === 'narrator' ? modelPortFixture : resolverTurnFixture)(make, { responseStatus: () => 503 });
        try {
            await expect(f.start()).rejects.toMatchObject({ code: 'generation_provider_failed' });
            const { root, attempts } = await current(f);
            expect(root.status).toBe('failed'); expect(attempts.map(row => row.status)).toEqual(['failed']);
            expect(root.outputClaims).toEqual([]); expect(root.resultRefs).toEqual([]); expect(f.requests).toHaveLength(1);
            expect((await f.observe()).outcome).toBe('failed');
            const settlement = await f.authority.engine.withTransaction(f.h.handle, tx => readAttemptSettlement(tx, f.h.handle, root, attempts[0]));
            expect(settlement).toMatchObject({ outcome: 'failed', resultRefs: [], effectReceiptRefs: [(await f.observe()).receiptRef.receiptId] });
            expect((await f.core.observe(f.h.handle, f.input.sessionId)).revision).toEqual(f.base.revision);
            await f.cold(); expect((await current(f)).root.status).toBe('failed');
            await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test('a valid Resolver followed by a final failed Narrator preserves both original role attempts without applying the selected action', async () => {
        const f = await resolverTurnFixture(make, { responseStatus: count => count === 1 ? 200 : 503 });
        try {
            await expect(f.start()).rejects.toMatchObject({ code: 'generation_provider_failed' });
            const { root, attempts } = await current(f);
            expect(root.status).toBe('failed'); expect(attempts.map(row => row.status)).toEqual(['completed', 'failed']);
            expect(root.outputClaims).toEqual([]); expect(root.resultRefs).toEqual([]); expect(f.requests).toHaveLength(2);
            expect((await f.core.observe(f.h.handle, f.input.sessionId)).revision).toEqual(f.base.revision);
            await f.cold(); await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(2);
        } finally { await f.cleanup(); }
    }, 60000);

    test('an explicit failure with unreported spending settles the failed Attempt and keeps the Run reconciling', async () => {
        const f = await modelPortFixture(make, { responseStatus: () => 503, usage: false });
        try {
            await expect(f.start()).rejects.toMatchObject({ code: 'generation_provider_failed' });
            const { root, attempts } = await current(f);
            expect(root.status).toBe('reconciling'); expect(attempts.map(row => row.status)).toEqual(['failed']);
            expect(await f.observe()).toMatchObject({ outcome: 'failed', closed: false }); expect(root.outputClaims).toEqual([]);
            const bank = (await f.core.runs.status(f.h.handle, f.input.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
            expect(bank.attempts.map(row => row.status)).toEqual(['unknown']);
            await f.cold(); expect((await current(f)).root.status).toBe('reconciling');
            await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test('unknown submission retains the pending Effect and blocked Attempt without declaring an HTTP failure', async () => {
        const f = await modelPortFixture(make, { responseStatus: () => null });
        try {
            await expect(f.start()).rejects.toMatchObject({ code: 'generation_provider_submission_unknown' });
            const { root, attempts } = await current(f);
            expect(root.status).toBe('reconciling'); expect(attempts.map(row => row.status)).toEqual(['blocked']);
            expect(root.pendingEffectRefs).toEqual([f.effectRef.effectId]); expect((await f.observe()).outcome).toBe('unknown');
            expect(root.outputClaims).toEqual([]); expect(root.resultRefs).toEqual([]);
            await f.cold(); await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each(['source', 'cancel'])('%s during the rejected HTTP request preserves the owner decision and original fee without a fresh grant', async change => {
        const f = await modelPortFixture(make, { responseStatus: () => 503 }); let edited;
        f.onResponse(async () => {
            if (change === 'source') edited = await f.core.appendTimeline(f.h.handle, f.input.sessionId, { role: 'user', content: 'Human input kept after failed Model' });
            else await f.authority.execution.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), {
                ...runGuard(await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId)), reasonCode: 'cancel_during_model_failure' });
        });
        try {
            await expect(f.start()).rejects.toThrow(); const { root } = await current(f);
            expect(root).toMatchObject(change === 'source' ? { status: 'failed', cancelRequested: false } : { status: 'cancelled', cancelRequested: true });
            expect(root.outputClaims).toEqual([]); expect(root.resultRefs).toEqual([]);
            expect((await f.core.observe(f.h.handle, f.input.sessionId)).revision).toEqual(edited?.revision ?? f.base.revision);
            const bank = (await f.core.runs.status(f.h.handle, f.input.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
            expect(bank.attempts).toEqual([expect.objectContaining({ status: 'settled', usage: expect.objectContaining({ totalTokens: 20 }) })]);
            await f.cold(); expect((await current(f)).root.status).toBe(root.status); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test('owned Memory retrieval receipts and fees settle with the failed Model without any domain output', async () => {
        const f = await sessionContextRetrievalFixture(make, { responseStatus: () => 503 });
        try {
            await expect(f.start()).rejects.toMatchObject({ code: 'generation_provider_failed' });
            const { root, attempts } = await current(f);
            expect(root.status).toBe('failed'); expect(attempts.map(row => row.status)).toEqual(['failed']);
            expect(f.calls).toHaveLength(2); expect(f.requests).toHaveLength(1);
            const receipt = await f.authority.engine.withTransaction(f.h.handle, tx => readAttemptSettlement(tx, f.h.handle, root, attempts[0]));
            expect(receipt.effectReceiptRefs).toHaveLength(3); expect(receipt.resultRefs).toEqual([]);
            const bank = (await f.core.runs.status(f.h.handle, f.input.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
            expect(bank.attempts).toHaveLength(3); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
            expect(root.outputClaims).toEqual([]); expect(root.resultRefs).toEqual([]);
            expect((await f.core.observe(f.h.handle, f.input.sessionId)).revision).toEqual(f.base.revision);
            await f.cold(); await expect(f.start()).rejects.toThrow(); expect(f.calls).toHaveLength(2); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 120000);
});
