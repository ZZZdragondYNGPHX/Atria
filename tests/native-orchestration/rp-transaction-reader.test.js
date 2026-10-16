import { jest } from '@jest/globals';
import { RpRunControl, rpOperationInput } from '../../src/native/rp-run-control.js';
import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { withChatWrite } from '../../src/storage/repositories/chat-write-boundary.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

// Original ChatRepo/RP bank, real Engine transactions and synthetic usage.
// These tests do not send to a provider or implement an RP model consumer.
const at = { charDir: 'Actor', name: 'main', isGroup: false, groupId: null };
const message = (id, mes, swipe = 0) => ({ name: 'User', is_user: true, is_system: false, mes, swipe_id: swipe, memory_os_source_id: id });
const limits = { maxRequests: 2, maxTokens: 200, localWork: { maxJobs: 2, maxItems: 4, maxInputBytes: 1000 } };
const attempt = { attemptId: 'c'.repeat(64), requestId: 'original-rp-request', targetFingerprint: 'a'.repeat(64), inputFingerprint: 'b'.repeat(64), estimatedTokens: 100 };
const usage = { wallMs: 1, cpuUserMicros: 1, cpuSystemMicros: 0, cpuScope: 'process', outcome: 'completed' };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const sql = process.env.ATRIA_TEST_RP_READER_SQL === '1';
const harnesses = CONTRACT_HARNESSES.filter(({ name }) => sql || ['FsEngine', 'SqliteEngine'].includes(name));
if (sql) jest.setTimeout(60000);

async function fixture(make) {
    const h = await make(), chats = new ChatRepo({ engine: h.engine }), bank = new RpRunControl({ engine: h.engine, chatRepo: chats });
    await chats.save(h.handle, at.charDir, at.name, {}, [message('m0', 'Earlier context'), message('m1', 'Current input')], null);
    const { controlId } = await bank.bind(h.handle, at), chat = await chats.get(h.handle, at.charDir, at.name);
    const source = { input: rpOperationInput(chat.body[1], 1), purpose: 'narration', outputSlot: 'assistant' };
    const admitted = await bank.admitCompute(h.handle, controlId, source, limits, attempt);
    return { h, chats, bank, controlId, source, admitted, read: () => chats.get(h.handle, at.charDir, at.name) };
}

describe.each(harnesses)('$name RP original transaction readers', ({ make }) => {
    test('all three readers use the exact supplied transaction without opening a transaction or writer queue', async () => {
        const f = await fixture(make), { h, bank, controlId, source, admitted } = f;
        try {
            const before = await bank.status(h.handle, controlId), originalTransaction = h.engine.withTransaction, originalLock = bank._locked;
            await originalTransaction.call(h.engine, h.handle, async tx => {
                const originalSource = bank._source, seen = [];
                bank._source = function (transaction, ...args) { seen.push(transaction); return originalSource.call(this, transaction, ...args); };
                h.engine.withTransaction = () => { throw new Error('unexpected_nested_transaction'); };
                bank._locked = () => { throw new Error('unexpected_reader_writer_queue'); };
                try {
                    const status = await bank.status(h.handle, controlId, { tx });
                    const context = await bank.context(h.handle, controlId, source, { tx });
                    const observed = await bank.observeCompute(h.handle, controlId, admitted.operation, attempt.attemptId, { tx });
                    expect(status).toEqual(before);
                    expect(context.messages).toEqual([{ role: 'user', content: 'Earlier context' }, { role: 'user', content: 'Current input' }]);
                    expect(context.prefixDigest).toMatch(/^[a-f0-9]{64}$/);
                    expect(observed).toMatchObject({ operation: admitted.operation, compute: { ...attempt, status: 'charged' }, limits });
                    expect(seen).toEqual([tx]);
                    status.operations = {}; observed.compute.status = 'settled'; context.messages[0].content = 'Only a detached result';
                } finally { bank._source = originalSource; h.engine.withTransaction = originalTransaction; bank._locked = originalLock; }
            });
            expect(await bank.status(h.handle, controlId)).toEqual(before);
            expect((await bank.context(h.handle, controlId, source)).messages[0].content).toBe('Earlier context');
            expect(bank._chatRepo).toBe(f.chats);
            expect(() => new RpRunControl({ engine: h.engine, chatRepo: {} })).toThrow('native_rp_chat_authority_unavailable');
            expect(() => new RpRunControl({ engine: h.engine, chatRepo: new ChatRepo({ engine: {} }) })).toThrow('native_rp_chat_authority_unavailable');
        } finally { await h.cleanup(); }
    });

    test('bank admission and settlement change sequence without changing the original source prefix', async () => {
        const f = await fixture(make), { h, bank, controlId, source, admitted } = f;
        try {
            const context = await bank.context(h.handle, controlId, source), before = await bank.status(h.handle, controlId);
            const local = { attemptId: 'd'.repeat(64), requestId: attempt.requestId, targetFingerprint: 'e'.repeat(64), kind: 'context_build', estimatedItems: 1, estimatedInputBytes: 20 };
            await bank.chargeLocalWork(h.handle, controlId, source, limits, local);
            await bank.settleLocalWork(h.handle, controlId, admitted.operation, local.attemptId, usage);
            await bank.settleCompute(h.handle, controlId, admitted.operation, attempt.attemptId, { totalTokens: 60 });
            await h.engine.withTransaction(h.handle, async tx => {
                expect(await bank.context(h.handle, controlId, source, { tx })).toEqual(context);
                const status = await bank.status(h.handle, controlId, { tx });
                expect(status.sequence).toBe(before.sequence + 3);
                expect(status.operations[admitted.operation].compute.localWork).toEqual([expect.objectContaining({ status: 'settled', usage })]);
                expect(await bank.observeCompute(h.handle, controlId, admitted.operation, attempt.attemptId, { tx })).toMatchObject({ compute: { status: 'settled', usage: { totalTokens: 60 } } });
            });
        } finally { await h.cleanup(); }
    });

    test.each([
        ['content', 'native_generation_revision_conflict'], ['variant', 'native_generation_revision_conflict'],
        ['header', 'native_rp_control_relocated'], ['rename', 'native_rp_source_missing'],
    ])('original %s change invalidates source while frozen late accounting remains readable', async (change, code) => {
        const f = await fixture(make), { h, bank, chats, controlId, source, admitted } = f;
        try {
            const chat = await f.read();
            const changes = {
                content: () => chats.save(h.handle, at.charDir, at.name, chat.header, [chat.body[0], { ...chat.body[1], mes: 'Changed original input' }], chat.integrity),
                variant: () => chats.save(h.handle, at.charDir, at.name, chat.header, [chat.body[0], { ...chat.body[1], swipe_id: 1 }], chat.integrity),
                header: () => chats.save(h.handle, at.charDir, at.name, { ...chat.header, chat_metadata: {} }, chat.body, chat.integrity),
                rename: () => chats.rename(h.handle, at.charDir, at.name, 'renamed'),
            };
            await changes[change]();
            await h.engine.withTransaction(h.handle, async tx => {
                await expect(bank.context(h.handle, controlId, source, { tx })).rejects.toMatchObject({ code });
                expect(await bank.observeCompute(h.handle, controlId, admitted.operation, attempt.attemptId, { tx })).toMatchObject({ compute: { status: 'charged' } });
            });
            await expect(bank.admitCompute(h.handle, controlId, source, limits, { ...attempt, attemptId: 'f'.repeat(64) })).rejects.toMatchObject({ code });
            await bank.settleCompute(h.handle, controlId, admitted.operation, attempt.attemptId, { totalTokens: 60 });
            expect((await bank.observeCompute(h.handle, controlId, admitted.operation, attempt.attemptId)).compute).toMatchObject({ status: 'settled', usage: { totalTokens: 60 } });
            expect(Object.keys((await bank.status(h.handle, controlId)).operations)).toEqual([admitted.operation]);
        } finally { await h.cleanup(); }
    });

    test('the original owner chat boundary precedes any bank transaction and supports reentrant chat work', async () => {
        const f = await fixture(make), { h, bank, controlId, source } = f;
        const entered = deferred(), release = deferred(), original = h.engine.withTransaction, transactions = [];
        let held, admission;
        try {
            held = withChatWrite(h.handle, async () => { entered.resolve(); await release.promise; });
            await entered.promise;
            h.engine.withTransaction = function (...args) { transactions.push('transaction'); return original.apply(this, args); };
            admission = bank.admitCompute(h.handle, controlId, source, limits, attempt);
            await new Promise(resolve => setImmediate(resolve));
            expect(transactions).toEqual([]);
            release.resolve(); await held; expect((await admission).replayed).toBe(true);
            await f.chats.withWriteLock(h.handle, async () => {
                const current = await bank.status(h.handle, controlId);
                expect(hashNativeDocument(current.locator)).toBe(hashNativeDocument(at));
                expect((await bank.bind(h.handle, at)).controlId).toBe(controlId);
            });
            expect(transactions.length).toBeGreaterThan(0);
        } finally {
            release.resolve(); await Promise.allSettled([held, admission]); h.engine.withTransaction = original; await h.cleanup();
        }
    });
});
