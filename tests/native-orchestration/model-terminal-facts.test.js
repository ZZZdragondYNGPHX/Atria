import { modelPortFixture as fixture } from './helpers/model-port-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { ProviderFailure } from '../../src/native/model-prompt-runtime/execution-utils.js';
import { ModelPort, readModelCompletionReceipt, readModelTerminalReceipt } from '../../src/native/orchestration/model-port.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';
import { controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';

async function current(f) {
    const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
    const intent = await f.authority.engine.withTransaction(f.h.handle, async tx => (await readEffect(tx, f.h.handle, root, f.effectRef.effectId)).doc);
    return { root, intent };
}

describe.each(CONTRACT_HARNESSES)('$name original Model terminal facts', ({ make }) => {
    test.each([[503, true], [503, false], [400, true], [401, false], [403, false], [404, false]])('actual HTTP %s rejection, reported usage=%s, is separate from fee closure', async (status, usage) => {
        const f = await fixture(make, { responseStatus: () => status, usage });
        try {
            await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
            const saved = await f.observe(), closed = usage;
            expect(saved).toMatchObject({ outcome: 'failed', kind: 'rejected', closed,
                observation: { reasonCode: 'generation_provider_rejected', resultRefs: [], dispatchEvidence: {
                    reference: { responseHash: null, attempts: [expect.objectContaining({ outcome: 'http_rejected', httpStatus: status, status: closed ? 'settled' : 'unknown' })] } } } });
            const { root, intent } = await current(f);
            expect(root.outputClaims).toEqual([]); expect(root.resultRefs).toEqual([]);
            expect(await f.authority.engine.withTransaction(f.h.handle, tx => readModelCompletionReceipt(f.h.handle, tx, root, intent))).toBeNull();
            expect(JSON.stringify(saved)).not.toMatch(/synthetic-model-secret|Synthetic native narrator response/);
            await f.cold(); expect(await f.observe()).toEqual(saved);
            await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test('a validated response denied by a real Source edit records only a late fact and never a Result brand', async () => {
        const f = await fixture(make);
        f.onResponse(() => f.core.appendTimeline(f.h.handle, f.input.sessionId, { role: 'user', content: 'Owner changes the Source during HTTP' }));
        try {
            await expect(f.start()).rejects.toThrow();
            const saved = await f.observe();
            expect(saved).toMatchObject({ outcome: 'confirmed', kind: 'late_response', closed: true,
                observation: { reasonCode: 'generation_response_not_consumed', resultRefs: [], dispatchEvidence: {
                    reference: { responseHash: expect.stringMatching(/^[a-f0-9]{64}$/), attempts: [expect.objectContaining({ outcome: 'response_validated', httpStatus: null })] } } } });
            const { root, intent } = await current(f);
            expect(root.outputClaims).toEqual([]); expect(root.resultRefs).toEqual([]);
            expect(await f.authority.engine.withTransaction(f.h.handle, tx => readModelCompletionReceipt(f.h.handle, tx, root, intent))).toBeNull();
            await expect(ModelPort.prototype.inspectResultCompletion.call(f.port, f.h.handle, { result: {}, ...f.effectRef })).rejects.toThrow(/completion_required/);
            expect((await f.core.observe(f.h.handle, f.input.sessionId)).timeline.some(row => row.content === 'Synthetic native narrator response.')).toBe(false);
            await f.cold(); expect(await f.observe()).toEqual(saved); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each(['transport', 'unbranded', 'parse'])('%s failure cannot forge an HTTP rejection fact', async scenario => {
        const f = await fixture(make, { ...(scenario === 'transport' ? { responseStatus: () => null } : {}),
            ...(scenario === 'parse' ? { responseBody: () => ({ invalid: true }) } : {}) });
        if (scenario === 'unbranded') f.host.providers['provider.openai-responses'] = { ...f.host.providers['provider.openai-responses'], send: async () => {
            throw Object.assign(new ProviderFailure('provider'), { usage: { totalTokens: 0 } });
        } };
        try {
            await expect(f.start()).rejects.toThrow(); expect((await f.observe()).outcome).toBe('unknown');
            const { intent } = await current(f);
            expect((await f.authority.execution.budgetPort.observeAttempt(f.h.handle, intent.budgetAttemptRef)).status).toBe('unknown');
            const count = f.requests.length; await f.cold(); expect((await f.observe()).outcome).toBe('unknown');
            await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(count);
        } finally { await f.cleanup(); }
    }, 60000);

    test('rehashing an impossible HTTP observation cannot turn the original receipt into a valid terminal fact', async () => {
        const f = await fixture(make, { responseStatus: () => 503 });
        try {
            await expect(f.start()).rejects.toThrow(); const saved = await f.observe(), { root, intent } = await current(f);
            await f.authority.engine.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, root.runId, 'receipt', saved.receiptRef.receiptId), original = await tx.getResource(key), doc = structuredClone(original.doc);
                doc.dispatchEvidence.reference.attempts[0].httpStatus = 200;
                try {
                    await tx.putResource(key, { ...original, doc, integrity: hash(doc) });
                    await expect(readModelTerminalReceipt(f.h.handle, tx, root, intent, f.authority.execution.budgetPort)).rejects.toThrow();
                } finally { await tx.putResource(key, original); }
            });
        } finally { await f.cleanup(); }
    }, 60000);

    test.each([true, false])('explicit failure receipt ACK saved=%s never produces a second send', async saved => {
        const f = await fixture(make, { responseStatus: () => 503 }); let writes = 0;
        try {
            const observe = f.authority.execution.effects.observe.bind(f.authority.execution.effects);
            f.authority.execution.effects.observe = async (...args) => {
                writes++; if (saved) await observe(...args);
                throw new StorageCommitUnknownError(new Error('Synthetic rejected Model receipt ACK loss'));
            };
            const actual = await f.start().then(value => ({ value }), error => ({ error: error.code }));
            expect(actual).toEqual({ error: saved ? 'generation_provider_failed' : 'storage_commit_unknown' });
            expect(writes).toBe(1); expect(f.requests).toHaveLength(1);
            await f.cold(); expect((await f.observe()).outcome).toBe(saved ? 'failed' : 'unknown');
            await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test('a paid HTTP rejection followed by an unknown transport cannot become an all-rejected completion', async () => {
        const f = await fixture(make, { responseStatus: count => count === 1 ? 503 : null,
            changeRoute: route => ({ ...route, policy: { ...route.policy, maxRetries: 1 } }) });
        try {
            await expect(f.start()).rejects.toMatchObject({ code: 'generation_provider_submission_unknown' });
            expect(f.requests).toHaveLength(2); expect((await f.observe()).outcome).toBe('unknown');
            const { root } = await current(f), bank = (await f.core.runs.status(f.h.handle, f.input.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;
            expect(bank.attempts.map(row => row.status)).toEqual(['settled', 'unknown']);
            await f.cold(); expect((await f.observe()).outcome).toBe('unknown');
            await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(2);
        } finally { await f.cleanup(); }
    }, 60000);
});
