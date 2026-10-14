import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActionRegistry, PolicyCeiling, RiskExecutor, fingerprint } from '../src/kernel.js';
import { registerMutationActions } from '../src/mutations.js';

const boot = '12345678-1234-4123-8123-123456789012';
function fixture({ changedAfterApproval = false } = {}) {
    const writes = [], reads = [];
    let approvals = 0;
    const session = { sessionId: 'ses_fixture', headRevisionId: 'r1', packageVersionId: 'pkgv_fixture', packageContentHash: 'hash', activeBranchId: 'b1' };
    const history = { headRevisionId: 'r1', branches: [{ branchId: 'b1' }, { branchId: 'b2' }] };
    const snapshot = () => ({ session, revision: { revisionId: session.headRevisionId, branchId: session.activeBranchId }, timeline: [] });
    const response = (data, status = 200) => ({ ok: () => status < 400, status: () => status,
        headers: () => ({ 'content-type': 'application/json', 'x-atria-server-boot-id': boot }), body: async () => Buffer.from(JSON.stringify(data)), dispose: async () => {} });
    const browser = { config: { url: 'http://localhost', timeout: 1000, maxResponseBytes: 1048576 }, start: async () => {},
        runtimeIdentity: async () => ({ serverBootId: boot, mutationGuards: 1 }), context: { request: {
            get: async () => response({ token: 'csrf' }), fetch: async (url, options) => {
                if (url.endsWith('/session/observe')) { reads.push(url); return response(snapshot()); }
                if (url.endsWith('/history')) { reads.push(url); return response(history); }
                if (url.endsWith('/sessions/ses_fixture/observe')) { reads.push(url); return response({ session, saves: [{ saveId: 'save_fixture', revisionId: 'r1', branchId: 'b1' }] }); }
                assert.equal(options.headers['x-atria-expected-server-boot-id'], boot);
                writes.push({ url, body: options.data });
                if (url.endsWith('/save')) return response({ saveId: 'save_new', kind: options.data.kind, revisionId: 'r1', branchId: 'b1' });
                if (url.endsWith('/experience-metadata')) {
                    assert.equal(options.data.expectedMetadataFingerprint, fingerprint({ autoSavePolicy: session.autoSavePolicy ?? null, branchMetadata: session.branchMetadata ?? {} }));
                    if (options.data.autoSavePolicy) session.autoSavePolicy = options.data.autoSavePolicy;
                    if (options.data.branchId) session.branchMetadata = { ...session.branchMetadata, [options.data.branchId]: {
                        ...(options.data.displayName ? { displayName: options.data.displayName } : {}), ...(options.data.archived === undefined ? {} : { archived: options.data.archived }) } };
                    return response(session);
                }
                if (url.endsWith('/command')) { assert.deepEqual(options.data.command, { type: 'switch', branchId: 'b2' }); session.activeBranchId = 'b2'; session.headRevisionId = 'r2'; return response(snapshot()); }
                if (url.endsWith('/load')) { assert.equal(options.data.saveId, 'save_fixture'); session.activeBranchId = 'b3'; session.headRevisionId = 'r3'; return response(snapshot()); }
                throw new Error('Unexpected authority: ' + url);
            },
        } } };
    const registry = registerMutationActions(new ActionRegistry(), browser);
    const executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), { approve: async () => {
        approvals++; if (changedAfterApproval) session.branchMetadata = { b1: { displayName: 'Concurrent user edit' } };
        return { action: 'accept', content: { authorize: true } };
    } });
    return { registry, writes, reads, run: (action, input = {}) => executor.execute('MUTATE', { action, input: { sessionId: 'ses_fixture', expectedRevisionId: 'r1', ...input } }), get approvals() { return approvals; } };
}
test('unsupported fork and retry contracts are absent from discovery and execution', () => {
    const f = fixture();
    for (const action of ['chat.branch.fork', 'chat.retry.prepare', 'chat.regenerate', 'chat.reenter', 'chat.restart.from', 'chat.remove.from.active']) {
        assert.throws(() => f.registry.get(action), /Unknown semantic action/);
    }
});
for (const [action, kind] of [['session.save', 'manual'], ['session.save.quick', 'quick']]) test(action + ' anchors the exact committed HEAD', async () => {
    const f = fixture(), result = await f.run(action, { displayName: 'Checkpoint' });
    assert.equal(result.receipt.status, 'succeeded'); assert.equal(f.writes.length, 1);
    assert.deepEqual(f.writes[0].body, { kind, expectedRevisionId: 'r1', displayName: 'Checkpoint' });
    assert.equal(result.receipt.created[0].kind, 'save');
    assert.equal(f.reads.every(url => url.endsWith('/observe')), true);
});
test('restore verifies SavePoint membership and creates a branch through the owning product authority', async () => {
    const f = fixture(), result = await f.run('session.restore', { saveId: 'save_fixture' });
    assert.equal(result.receipt.status, 'succeeded'); assert.equal(result.receipt.after.branchId, 'b3');
    assert.deepEqual(f.writes[0].body, { saveId: 'save_fixture', expectedRevisionId: 'r1' });
    const missing = fixture(); await assert.rejects(missing.run('session.restore', { saveId: 'foreign_save' }), /Save not in target Session/);
    assert.equal(missing.writes.length, 0); assert.equal(missing.approvals, 0);
});
test('branch switch uses only the supported Native command and validates membership first', async () => {
    const f = fixture(), result = await f.run('chat.branch.switch', { branchId: 'b2' });
    assert.equal(result.receipt.status, 'succeeded'); assert.equal(result.receipt.after.branchId, 'b2');
    const missing = fixture(); await assert.rejects(missing.run('chat.branch.switch', { branchId: 'foreign_branch' }), /Branch is not/);
    assert.equal(missing.writes.length, 0); assert.equal(missing.approvals, 0);
});
for (const [action, input] of [['chat.branch.rename', { branchId: 'b1', displayName: 'Named' }], ['chat.branch.archive', { branchId: 'b1', archived: true }],
    ['session.save.policy.update', { autoSavePolicy: { enabled: true, intervalMs: 60000, retain: 5 } }]]) test(action + ' binds metadata CAS independently of HEAD', async () => {
    const f = fixture(), result = await f.run(action, input);
    assert.equal(result.receipt.status, 'succeeded'); assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].body.expectedMetadataFingerprint, fingerprint({ autoSavePolicy: null, branchMetadata: {} }));
    assert.equal(result.receipt.after.headRevisionId, 'r1');
});
test('same-HEAD metadata drift during approval invalidates the lease before mutation', async () => {
    const f = fixture({ changedAfterApproval: true });
    await assert.rejects(f.run('chat.branch.rename', { branchId: 'b1', displayName: 'Named' }), /Authority changed/);
    assert.equal(f.approvals, 1); assert.equal(f.writes.length, 0);
});
