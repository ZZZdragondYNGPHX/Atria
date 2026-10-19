import { jest } from '@jest/globals';
import { rpConsumptionFixture as fixture } from './helpers/rp-consumption-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { withChatWrite } from '../../src/storage/repositories/chat-write-boundary.js';
import { withRuntimeWrite } from '../../src/native/model-prompt-runtime/runtime-write.js';
import { withNativeResourceWrite } from '../../src/native/repositories/common.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { RpRunControl } from '../../src/native/rp-run-control.js';

const sql = process.env.ATRIA_TEST_RP_CONSUMPTION_SQL === '1';
if (sql) jest.setTimeout(60000);
const harnesses = CONTRACT_HARNESSES.filter(({ name }) => sql || ['FsEngine', 'SqliteEngine'].includes(name));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const changes = ['content', 'variant', 'history-role', 'header', 'rename', 'delete', 'bulk-rename', 'bulk-delete', 'group-cascade'];

describe.each(harnesses)('$name original RP source consumption boundary', ({ make }) => {
    test('constructs without reads and uses the original prototype domain fence with fresh original-bank transaction readers', async () => {
        const f = await fixture(make), original = f.h.engine.withTransaction.bind(f.h.engine);
        try {
            f.h.engine.withTransaction = () => { throw new Error('Construction must be pure'); };
            const boundary = f.boundary(); expect(typeof boundary).toBe('function'); f.h.engine.withTransaction = original;
            f.chats.withWriteLock = (_handle, operation) => operation();
            f.control.context = () => { throw new Error('Instance context replacement is not authority'); };
            f.control.status = () => { throw new Error('Instance status replacement is not authority'); };
            expect(await f.consume()).toBe('Current original input');
        } finally { f.h.engine.withTransaction = original; await f.cleanup(); }
    });

    test.each(['control-class', 'foreign-engine', 'repo-class', 'bank-identity', 'operation'])('refuses %s before constructing an RP domain boundary', async change => {
        const f = await fixture(make);
        try {
            const binding = structuredClone(f.root.sourceBinding);
            if (change === 'control-class') {
                const fake = { ...f.control }; f.source.rpControl = fake; f.budget.rpControl = fake;
            }
            if (change === 'foreign-engine') f.control._engine = {};
            if (change === 'repo-class') f.control._chatRepo = { _engine: f.h.engine };
            if (change === 'bank-identity') f.source.budgetPort = new BudgetPort({ rpControl: new RpRunControl({ engine: f.h.engine }) });
            if (change === 'operation') {
                binding.budgetAuthorityRef.operationId = 'f'.repeat(64);
                const { bindingDigest: _digest, ...source } = binding; binding.bindingDigest = hash(source);
            }
            expect(() => f.source.consumptionBoundary(f.h.handle, binding, { engine: f.h.engine }))
                .toThrow('native_orchestration_consumption_authority_unavailable');
        } finally { await f.cleanup(); }
    });

    test('verifies the original RP bank in the actual transaction despite instance status replacement', async () => {
        const f = await fixture(make);
        try {
            const effectId = 'oeffect_' + 'a'.repeat(32), limits = { maxRequests: 2, maxTokens: 200 };
            const result = await f.budget.admitAttempt(f.h.handle, { authorityRef: f.root.budgetAuthorityRef, effectId, providerSendOrdinal: 0,
                requestId: 'controlled_rp_bank', targetFingerprint: 'b'.repeat(64), inputFingerprint: 'c'.repeat(64), upperBound: 10, limits });
            f.control.status = () => { throw new Error('Instance status is not bank evidence'); };
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                expect(await f.budget.verifyBudgetAttempt({ handle: f.h.handle, tx, root: f.root, intent: { effectId }, budgetAttemptRef: result.budgetAttemptRef }))
                    .toEqual({ status: 'charged' });
                await f.source.revalidate(f.h.handle, f.root.sourceBinding, { tx });
            });
            expect(await f.consume()).toBe('Current original input');
        } finally { await f.cleanup(); }
    });

    test.each(['Runtime', 'chat-domain'])('waits to decide the body until the original %s fence is released', async kind => {
        const f = await fixture(make), release = deferred(), entered = deferred(), events = [];
        const actualBoundary = f.source.consumptionBoundary.bind(f.source), atBoundary = deferred();
        f.source.consumptionBoundary = (...args) => {
            const original = actualBoundary(...args);
            return operation => { atBoundary.resolve(); return original(operation); };
        };
        f.chats.withWriteLock = (_owner, operation) => operation();
        const lock = kind === 'Runtime' ? operation => withRuntimeWrite(f.h.handle, operation)
            : operation => withNativeResourceWrite(f.h.handle, 'rp-chat-domain', operation);
        const holder = lock(async () => { entered.resolve(); await release.promise; events.push('domain_released'); });
        let pending;
        try {
            await entered.promise;
            pending = f.consume(async args => { events.push('consume_decided'); return f.read(args); });
            await atBoundary.promise;
            expect(await Promise.race([pending.then(() => 'decided'), new Promise(resolve => setTimeout(() => resolve('waiting'), 250))])).toBe('waiting');
            expect(events).toEqual([]);
            release.resolve(); await holder; expect(await pending).toBe('Current original input');
            expect(events).toEqual(['domain_released', 'consume_decided']);
        } finally { release.resolve(); await holder; await pending?.catch(() => {}); await f.cleanup(); }
    });

    test.each(changes)('original %s COMMIT before queued consumption refuses the source', async change => {
        const f = await fixture(make, { isGroup: change === 'group-cascade' }), events = [];
        const startConsume = deferred();
        const pending = (async () => {
            await startConsume.promise;
            return f.consume(async args => { events.push('consume_read'); return f.read(args); });
        })().then(value => ({ value }), error => ({ error }));
        try {
            await withChatWrite(f.h.handle, async () => {
                startConsume.resolve();
                await f.write(change); events.push('writer_committed');
            });
            expect((await pending).error).toBeDefined(); expect(events).toEqual(['writer_committed', 'consume_read']);
        } finally { startConsume.resolve(); await pending; await f.cleanup(); }
    });

    test.each(changes)('original %s writer waits until the current consumption decision', async change => {
        const f = await fixture(make, { isGroup: change === 'group-cascade' }), entered = deferred(), release = deferred(), startWriter = deferred(), events = [];
        // Register this task before entering any consumer ALS scope. It is a
        // real independent original-domain writer, not same-scope reentry.
        const writer = (async () => { await startWriter.promise; await f.write(change); events.push('writer_committed'); })();
        let pending;
        try {
            pending = f.consume(async args => { entered.resolve(); await release.promise; const body = await f.read(args); events.push('consume_decided'); return body; });
            await entered.promise; startWriter.resolve();
            await new Promise(resolve => setTimeout(resolve, 25)); expect(events).toEqual([]);
            release.resolve(); expect(await pending).toBe('Current original input'); await writer;
            expect(events).toEqual(['consume_decided', 'writer_committed']);
            await expect(f.consume()).rejects.toThrow();
        } finally { startWriter.resolve(); release.resolve(); await Promise.allSettled([pending, writer]); await f.cleanup(); }
    });
});
