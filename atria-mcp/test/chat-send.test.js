import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActionRegistry, PolicyCeiling, RiskExecutor } from '../src/kernel.js';
import { registerMutationActions } from '../src/mutations.js';

const boot = '12345678-1234-4123-8123-123456789012';
function fixture({ rejectAppend = false, generation = 'accepted', changedBoot = false } = {}) {
    let revision = 'r1', approvals = 0;
    const writes = [];
    const snapshot = () => ({ session: { sessionId: 'ses_fixture', packageVersionId: 'pkgv_fixture', packageContentHash: 'hash' },
        revision: { revisionId: revision, branchId: 'br_fixture' }, timeline: revision === 'r1' ? [] : [{ messageId: 'msg_fixture', role: 'user', content: 'Hello' }] });
    const response = (data, status = 200, serverBoot = boot) => ({ ok: () => status < 400, status: () => status,
        headers: () => ({ 'content-type': 'application/json', 'x-atria-server-boot-id': serverBoot }), body: async () => Buffer.from(JSON.stringify(data)), dispose: async () => {} });
    const browser = { config: { url: 'http://localhost', timeout: 1000, maxResponseBytes: 1048576 }, start: async () => {},
        runtimeIdentity: async () => ({ serverBootId: boot, mutationGuards: 1 }), context: { request: {
            get: async () => response({ token: 'fixture-csrf' }), fetch: async (url, options) => {
                if (url.endsWith('/load')) return response(snapshot());
                writes.push({ url, body: options.data, boot: options.headers['x-atria-expected-server-boot-id'] });
                assert.equal(options.headers['x-atria-expected-server-boot-id'], boot);
                if (url.endsWith('/command')) {
                    assert.equal(options.data.expectedRevisionId, 'r1');
                    assert.deepEqual(options.data.command, { type: 'timeline', commands: [{ type: 'append', draft: { role: 'user', content: 'Hello' } }] });
                    if (rejectAppend) return response({ error: 'conflict' }, 409);
                    revision = 'r2'; return response(snapshot(), 200, changedBoot ? '23456789-1234-4123-8123-123456789012' : boot);
                }
                assert.equal(url, 'http://localhost/api/native/generation/turn/start');
                assert.equal(options.data.revisionId, 'r2'); assert.equal(options.data.userInput, 'Hello');
                if (generation === 'lost') throw new Error('transport lost');
                return generation === 'rejected' ? response({ error: 'generation_conflict' }, 409) : response({ operationId: 'operation' }, 202);
            },
        } } };
    const registry = registerMutationActions(new ActionRegistry(), browser);
    const executor = new RiskExecutor(registry, new PolicyCeiling(registry, ['chat.send']), {
        approve: async () => { approvals++; return { action: 'accept', content: { authorize: true, uses: 1 } }; },
    });
    const send = () => executor.execute('MUTATE', { action: 'chat.send', input: { sessionId: 'ses_fixture', expectedRevisionId: 'r1', invocationId: 'turn', userInput: 'Hello' } });
    return { send, writes, get approvals() { return approvals; } };
}
test('chat.send commits one user anchor then starts generation at that exact revision under one approval', async () => {
    const f = fixture(), result = await f.send();
    assert.equal(result.receipt.status, 'succeeded'); assert.equal(f.approvals, 1); assert.equal(f.writes.length, 2);
    assert.equal(result.receipt.created[0].id, 'msg_fixture'); assert.equal(result.receipt.after.input.revisionId, 'r2');
    await assert.rejects(f.send(), /revision conflict/); assert.equal(f.writes.length, 2); assert.equal(f.approvals, 1);
});
test('append conflict never starts generation', async () => {
    const f = fixture({ rejectAppend: true }), result = await f.send();
    assert.equal(result.receipt.status, 'rejected'); assert.equal(f.writes.length, 1); assert.deepEqual(result.receipt.created, []);
});
for (const generation of ['rejected', 'lost']) test('committed input survives ' + generation + ' generation response with indeterminate evidence and no retry', async () => {
    const f = fixture({ generation }), result = await f.send();
    assert.equal(result.receipt.status, 'indeterminate'); assert.equal(result.receipt.created[0].id, 'msg_fixture');
    assert.equal(result.receipt.after.input.revisionId, 'r2'); assert.equal(f.writes.length, 2);
    assert.match(result.receipt.recovery, /never automatically resubmit/);
});
test('changed server identity after append cannot start generation', async () => {
    const f = fixture({ changedBoot: true }), result = await f.send();
    assert.equal(result.receipt.status, 'indeterminate'); assert.equal(f.writes.length, 1); assert.equal(result.receipt.created[0].id, 'msg_fixture');
});
