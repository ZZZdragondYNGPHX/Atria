import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { mkdtemp, readFile, rm, realpath, access, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { LaneScheduler } from '../src/scheduler.js';
import { OperationJournal, Operations } from '../src/operations.js';
import { ActionRegistry, PolicyCeiling, RiskExecutor, fingerprint } from '../src/kernel.js';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('blocked browser/mutation lanes leave control reachable; per-target ordering allows unrelated work', async () => {
    const scheduler = new LaneScheduler(), hold = deferred(); const order = [];
    const first = scheduler.run('mutation', ['session:one'], async () => { order.push('first'); await hold.promise; });
    await tick();
    const second = scheduler.run('mutation', ['session:one'], () => order.push('second'));
    await scheduler.run('mutation', ['session:two'], () => order.push('other'));
    const browser = scheduler.run('browser', ['browser:page'], () => hold.promise);
    await scheduler.run('control', [], () => order.push('control'));
    assert.deepEqual(order, ['first', 'other', 'control']); hold.resolve(); await Promise.all([first, second, browser]);
    assert.deepEqual(order, ['first', 'other', 'control', 'second']); scheduler.close();
});

test('admission is bounded, queued cancellation never dispatches and close rejects queued work', async () => {
    const scheduler = new LaneScheduler({ limits: { control: 1, read: 1, mutation: 1, browser: 1 }, maxQueue: 1 }), hold = deferred(), controller = new AbortController();
    const running = scheduler.run('mutation', ['one'], () => hold.promise); await tick();
    const queued = scheduler.run('mutation', ['one'], () => assert.fail('cancelled work dispatched'), { signal: controller.signal });
    await assert.rejects(scheduler.run('mutation', ['two'], () => {}), /full/);
    controller.abort(Error('test cancel')); await assert.rejects(queued, /cancel/);
    const closing = scheduler.run('mutation', ['one'], () => {}); scheduler.close(); await assert.rejects(closing, /closed/); hold.resolve(); await running;
});

test('approval holds no authority lock, native guard rechecks after contention and long admitted work is observable', async () => {
    const approval = deferred(), work = deferred(); let count = 0, approvalCount = 0;
    const registry = new ActionRegistry();
    registry.register({ version: 1, id: 'fixture.write', domain: 'fixture', title: 'write', risk: 'MUTATE', authority: 'Native fixture', adapter: 'fixed-http', externalEffects: [],
        guards: ['version'], approval: 'trusted-approval-required', availability: { available: true, reason: '' } },
    z.strictObject({ sessionId: z.string() }), z.json(), async () => { count++; await work.promise; return { ok: true }; },
    async i => ({ target: { sessionId: i.sessionId }, serverBootId: 'boot', revision: 'r1' }));
    const executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), { approve: async () => {
        approvalCount++; if (approvalCount === 1) await approval.promise;
        return { action: 'accept', content: { authorize: true } };
    } });
    const first = executor.execute('MUTATE', { action: 'fixture.write', input: { sessionId: 'one' } }); await tick();
    assert.equal(executor.operations.list().operations[0].state, 'awaiting_approval');
    const other = await executor.execute('MUTATE', { action: 'fixture.write', input: { sessionId: 'two' } }, { background: true });
    assert.ok(other.operationId); await tick(); assert.equal(count, 1, 'Unrelated approved operation runs while first approval is pending');
    await executor.operations.cancel(other.operationId); assert.equal(executor.operations.get(other.operationId).cancelRequested, true);
    assert.equal(executor.operations.get(other.operationId).dispatched, true, 'Cancellation does not assert rollback');
    approval.resolve(); work.resolve(); await first; await tick();
});

test('atomic private journal recovers dispatched unknown without inputs/leases and never replays work', async t => {
    const root = await mkdtemp(join(tmpdir(), 'atria-mcp-journal-'));
    t.after(async () => { const path = await realpath(root), parent = await realpath(tmpdir());
        assert.equal(dirname(path).toLowerCase(), parent.toLowerCase()); assert.ok(basename(path).startsWith('atria-mcp-journal-')); await rm(path, { recursive: true, force: true }); });
    const owner = { repo: 'fixture', origin: 'http://localhost' };
    const journal = await new OperationJournal({ directory: root, owner }).init(); const operations = new Operations({ journal });
    const op = await operations.create('fixture.write', 'MUTATE', fingerprint({ privatePrompt: 'must-never-persist', password: 'hidden' }));
    await operations.update(op.operationId, { state: 'running', dispatched: true, targetHash: fingerprint('session-one') });
    const bytes = await readFile(join(journal.directory, 'operations.json'), 'utf8');
    assert.doesNotMatch(bytes, /privatePrompt|must-never-persist|password|hidden|lease/i);
    const restarted = await new OperationJournal({ directory: root, owner }).init();
    const recovered = new Operations({ journal: restarted });
    assert.equal(recovered.get(op.operationId).state, 'unknown'); assert.equal(recovered.active.size, 0);
    assert.equal((await recovered.cancel(op.operationId)).cancellation, 'not-running-in-this-instance');
    assert.throws(() => recovered.get('foreign-operation'), /Unknown/);
    await assert.rejects(journal.put({ ...operations.get(op.operationId), prompt: 'forbidden' }));
    await assert.rejects(new OperationJournal({ directory: root, owner }).init({ forbiddenRoots: [root] }), /outside/);
});

test('journal retention prunes only closed aged known outcomes and preserves unresolved history within hard limits', async t => {
    const root = await mkdtemp(join(tmpdir(), 'atria-mcp-journal-retention-'));
    t.after(async () => { const path = await realpath(root); assert.equal(dirname(path).toLowerCase(), (await realpath(tmpdir())).toLowerCase());
        assert.ok(basename(path).startsWith('atria-mcp-journal-retention-')); await rm(path, { recursive: true, force: true }); });
    let now = 1;
    const owner = { repo: 'retention' }, first = await new OperationJournal({ directory: root, owner, now: () => now, retentionMs: 10 }).init();
    const operations = new Operations({ journal: first, now: () => now });
    const completed = await operations.create('fixture.write', 'MUTATE', fingerprint('one'));
    await operations.update(completed.operationId, { state: 'completed', dispatched: true }); operations.release(completed.operationId); await operations.close();
    now = 20;
    const second = await new OperationJournal({ directory: root, owner, now: () => now, retentionMs: 10 }).init();
    await assert.rejects(access(first.directory)); assert.equal(second.records.size, 0);
    const next = new Operations({ journal: second, now: () => now }), unknown = await next.create('fixture.write', 'MUTATE', fingerprint('two'));
    await next.update(unknown.operationId, { state: 'unknown', dispatched: true }); next.release(unknown.operationId); await next.close(); now = 100;
    const third = await new OperationJournal({ directory: root, owner, now: () => now, retentionMs: 10 }).init();
    assert.equal(third.records.get(unknown.operationId).state, 'unknown'); await third.close();
    await assert.rejects(new OperationJournal({ directory: root, owner, maxInstances: 1 }).init(), /capacity/);
    const actual = join(root, 'actual'), linked = join(root, 'linked'); await mkdir(actual); await symlink(actual, linked, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(new OperationJournal({ directory: linked, owner: 'linked-owner' }).init(), /symlink/);
});
