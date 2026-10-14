import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActionRegistry, PolicyCeiling, RiskExecutor } from '../src/kernel.js';
import { registerSessionActions } from '../src/session-actions.js';

function fixture({ drift = false } = {}) {
    let head = 'revision_fixture', approvals = 0;
    const requests = [], boot = '12345678-1234-4123-8123-123456789012';
    const response = data => ({ ok: () => true, status: () => 200, headers: () => ({ 'content-type': 'application/json', 'x-atria-server-boot-id': boot }),
        body: async () => Buffer.from(JSON.stringify(data)), dispose: async () => {} });
    const browser = { config: { url: 'http://localhost', timeout: 1000, maxResponseBytes: 1048576 }, start: async () => {}, runtimeIdentity: async () => ({ mutationGuards: 1, serverBootId: boot }),
        context: { request: { get: async () => response({ token: 'fixture' }), fetch: async (url, options) => {
            requests.push({ path: new URL(url).pathname, body: options.data });
            return response(url.endsWith('/observe') ? { revision: { revisionId: head, branchId: 'branch_fixture' } } : { phase: 'quarantine', deleted: [] });
        } } } };
    const registry = registerSessionActions(new ActionRegistry(), browser);
    const executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), { approve: async () => { approvals++; if (drift) head = 'revision_concurrent'; return { action: 'accept', content: { authorize: true, uses: 1 } }; } });
    return { registry, executor, requests, get approvals() { return approvals; } };
}
test('Chronicle and Receipt observations use fixed pure ports with bounded semantic queries', async () => {
    const f = fixture();
    await f.executor.execute('READ', { action: 'session.chronicle.query', input: { sessionId: 'session_fixture', revisionId: 'revision_fixture', query: { kind: 'fact', limit: 8 } } });
    assert.equal(f.requests[0].path, '/api/native/session/history/observe'); assert.equal(f.approvals, 0);
    await assert.rejects(f.executor.execute('READ', { action: 'session.chronicle.query', input: { sessionId: 'session_fixture', query: { limit: 1000 } } }));
    await f.executor.execute('READ', { action: 'session.commit.receipt', input: { sessionId: 'session_fixture', commitId: 'input-fixture' } });
    assert.equal(f.requests[1].path, '/api/native/session/commit-receipt');
});
test('maintenance has independent destructive approval and Native expected HEAD, with no caller quarantine override', async () => {
    const f = fixture(), input = { sessionId: 'session_fixture', expectedRevisionId: 'revision_fixture' };
    await assert.rejects(f.executor.execute('MUTATE', { action: 'session.maintenance.collect', input }), /risk mismatch/);
    const result = await f.executor.execute('DESTRUCTIVE', { action: 'session.maintenance.collect', input });
    assert.equal(result.receipt.status, 'succeeded'); assert.equal(f.approvals, 1);
    assert.deepEqual(f.requests.at(-1), { path: '/api/native/session/maintenance/checked', body: input });
    await assert.rejects(f.executor.execute('DESTRUCTIVE', { action: 'session.maintenance.collect', input: { ...input, graceMs: 0 } }));
});
test('maintenance HEAD drift during approval prevents the collection request', async () => {
    const f = fixture({ drift: true });
    await assert.rejects(f.executor.execute('DESTRUCTIVE', { action: 'session.maintenance.collect', input: { sessionId: 'session_fixture', expectedRevisionId: 'revision_fixture' } }), /HEAD conflict/);
    assert.equal(f.requests.filter(value => value.path.endsWith('/maintenance/checked')).length, 0);
});
