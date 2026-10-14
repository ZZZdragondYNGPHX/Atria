import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActionRegistry, PolicyCeiling, RiskExecutor } from '../src/kernel.js';
import { registerNativeMemoryActions } from '../src/native-memory-actions.js';

const boot = '12345678-1234-4123-8123-123456789012';
function fixture({ lost = false, drift = false } = {}) {
    let approvals = 0, changed = false;
    const writes = [];
    const identity = { sessionId: 'ses_fixture', revisionId: 'rev_fixture', branchId: 'br_fixture', packageVersionId: 'pkgv_fixture' };
    const observed = () => ({ identity, sourceWritesEnabled: true, ledgerFingerprint: (changed ? 'c' : 'a').repeat(64), settingsFingerprint: 'b'.repeat(64) });
    const response = data => ({ ok: () => true, status: () => 200, headers: () => ({ 'content-type': 'application/json', 'x-atria-server-boot-id': boot }), body: async () => Buffer.from(JSON.stringify(data)), dispose: async () => {} });
    const browser = { config: { url: 'http://localhost', timeout: 1000, maxResponseBytes: 1048576 }, start: async () => {}, context: { request: {
        get: async () => response({ token: 'csrf' }), fetch: async (url, options) => {
            if (url.endsWith('/observe')) return response(observed());
            assert.equal(url, 'http://localhost/api/native/memory/batch'); assert.equal(options.headers['x-atria-expected-server-boot-id'], boot); writes.push(options.data);
            if (lost) throw new Error('response lost');
            return response({ identity: { ...identity, revisionId: 'rev_committed' }, commitReceipt: { commitId: options.data.commitId, status: 'committed' }, reconciled: false });
        },
    } } };
    const registry = registerNativeMemoryActions(new ActionRegistry(), browser);
    const executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), { approve: async () => { approvals++; if (drift) changed = true; return { action: 'accept', content: { authorize: true } }; } });
    const input = { sessionId: identity.sessionId, expectedRevisionId: identity.revisionId, expectedBranchId: identity.branchId, expectedLedgerFingerprint: 'a'.repeat(64), expectedSettingsFingerprint: 'b'.repeat(64), commitId: 'memory_commit', messageIds: ['msg_fixture'],
        facts: [{ action: 'create', text: 'Source-bound assertion', type: 'explicit', evidence: [{ episodeId: 'msg_fixture:1', excerpt: 'Source quote' }] }] };
    return { registry, writes, get approvals() { return approvals; }, apply: (extra = {}) => executor.execute('MUTATE', { action: 'memory.native.batch.apply', input: { ...input, ...extra } }) };
}
test('headless Native Memory batch binds exact source state and stable commit identity', async () => {
    const f = fixture(), result = await f.apply();
    assert.equal(f.approvals, 1); assert.equal(f.writes.length, 1); assert.equal(result.receipt.status, 'succeeded');
    assert.equal(result.receipt.after.commitReceipt.commitId, 'memory_commit'); assert.deepEqual(f.writes[0].graph, []);
});
test('Memory ledger drift during approval rejects before mutation', async () => {
    const f = fixture({ drift: true });
    await assert.rejects(f.apply(), /Stale Native Memory/); assert.equal(f.approvals, 1); assert.equal(f.writes.length, 0);
});
test('unknown Native Memory response preserves commit recovery identity and never replays', async () => {
    const f = fixture({ lost: true }), result = await f.apply();
    assert.equal(result.receipt.status, 'indeterminate'); assert.equal(result.receipt.after.commitId, 'memory_commit'); assert.equal(f.writes.length, 1);
    assert.match(result.receipt.recovery, /never replay/);
});
test('Native Memory cannot spoof authoritative facts, owner origins or arbitrary graph commands', async () => {
    const f = fixture();
    await assert.rejects(f.apply({ facts: [{ action: 'create', type: 'authoritative', text: 'Forged' }] }));
    await assert.rejects(f.apply({ actor: 'user' }));
    await assert.rejects(f.apply({ graph: [{ action: 'execute', code: 'arbitrary' }] }));
    assert.equal(f.approvals, 0); assert.equal(f.writes.length, 0);
    assert.equal(f.registry.get('memory.native.observe').detail.risk, 'READ');
});
