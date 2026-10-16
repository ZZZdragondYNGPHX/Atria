import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActionRegistry, PolicyCeiling, RiskExecutor, fingerprint } from '../src/kernel.js';
import { registerMutationActions } from '../src/mutations.js';

const boot = '12345678-1234-4123-8123-123456789012';
function fixture({ rejectAppend = false, generation = 'accepted', changedBoot = false, appendLost = false, receiptMode = 'valid', changedConfiguration = false, approvedTarget = true } = {}) {
    let revision = 'r1', approvals = 0, nativeReceipt = null;
    const writes = [], receiptQueries = [], reviews = []; let preflights = 0;
    const snapshot = () => ({ session: { sessionId: 'ses_fixture', packageVersionId: 'pkgv_fixture', packageContentHash: 'hash' },
        revision: { revisionId: revision, branchId: 'br_fixture' }, timeline: revision === 'r1' ? [] : [{ messageId: 'msg_fixture', role: 'user', content: 'Hello' }] });
    const response = (data, status = 200, serverBoot = boot) => ({ ok: () => status < 400, status: () => status,
        headers: () => ({ 'content-type': 'application/json', 'x-atria-server-boot-id': serverBoot }), body: async () => Buffer.from(JSON.stringify(data)), dispose: async () => {} });
    const browser = { config: { url: 'http://localhost', timeout: 1000, maxResponseBytes: 1048576 }, start: async () => {},
        runtimeIdentity: async () => ({ serverBootId: boot, mutationGuards: 1 }), context: { request: {
            get: async () => response({ token: 'fixture-csrf' }), fetch: async (url, options) => {
                if (url.endsWith('/observe')) return response(snapshot());
                if (url.endsWith('/turn/controlled/preflight')) {
                    preflights++;
                    const configuration = { selectedRouteIds: ['narrator'], routes: { narrator: { runtimeRouteId: 'narrator', role: 'role.narrator',
                        policy: { maxRetries: 3 }, executionPolicy: { computeBudget: { maxRequests: 2, maxTokens: 4000 } } } },
                    models: { model: { modelProfileId: 'model', remoteModelId: 'fixture-model' } }, generationBudget: { turnAttempts: 2 },
                    credentialTargets: [{ connectionProfileId: 'connection', authorized: approvedTarget, permitFingerprint: 'a'.repeat(64), target: { endpoint: 'https://fixture.invalid', secretRef: { secretId: 'opaque' } } }],
                    taskRuntime: { turn: { policy: 'authority-first', stages: [] } } };
                    return response({ source: { sessionId: 'ses_fixture', revisionId: revision, branchId: 'br_fixture' }, configuration,
                        configurationFingerprint: fingerprint({ configuration, changed: changedConfiguration && preflights > 1 }), turnInputFingerprint: fingerprint(options.data),
                        requestFingerprint: fingerprint({ draft: { role: 'user', content: options.data.userInput }, expectedRevisionId: 'r1' }),
                        automaticResend: 'disabled', backgroundModel: 'suppressed', backgroundSimulation: 'not_started' });
                }
                if (url.endsWith('/commit-receipt')) {
                    receiptQueries.push(options.data);
                    assert.deepEqual(options.data, { sessionId: 'ses_fixture', commitId: 'commit_fixture' });
                    assert.equal(options.headers['x-atria-expected-server-boot-id'], boot);
                    if (receiptMode === 'lost') throw new Error('Receipt transport lost');
                    if (receiptMode === 'absent') return response(null);
                    return response({ ...nativeReceipt, ...(receiptMode === 'mismatch' ? { fingerprint: 'wrong' } : {}) }, 200,
                        receiptMode === 'changedBoot' ? '23456789-1234-4123-8123-123456789012' : boot);
                }
                writes.push({ url, body: options.data, boot: options.headers['x-atria-expected-server-boot-id'] });
                assert.equal(options.headers['x-atria-expected-server-boot-id'], boot);
                if (url.endsWith('/timeline/append')) {
                    assert.deepEqual(options.data, { sessionId: 'ses_fixture', expectedRevisionId: 'r1', commitId: 'commit_fixture', draft: { role: 'user', content: 'Hello' } });
                    if (rejectAppend) return response({ error: 'conflict' }, 409);
                    revision = 'r2';
                    nativeReceipt = { schemaVersion: 1, sessionId: 'ses_fixture', commitId: 'commit_fixture', expectedRevisionId: 'r1', revisionId: revision,
                        branchId: 'br_fixture', status: 'committed', fingerprint: fingerprint({ draft: options.data.draft, expectedRevisionId: 'r1' }) };
                    if (appendLost) throw new Error('Append response lost after commit');
                    return response(snapshot(), 200, changedBoot ? '23456789-1234-4123-8123-123456789012' : boot);
                }
                assert.equal(url, 'http://localhost/api/native/generation/turn/controlled/start');
                assert.equal(options.data.committedRevisionId, 'r2'); assert.equal(options.data.input.userInput, 'Hello');
                assert.equal(options.data.input.expectedRevisionId, 'r1'); assert.match(options.data.approvedReview.configurationFingerprint, /^[a-f0-9]{64}$/);
                assert.equal(options.data.approvedReview.turnInputFingerprint, fingerprint(options.data.input));
                if (generation === 'lost') throw new Error('transport lost');
                return generation === 'rejected' ? response({ error: 'generation_conflict' }, 409) : response({ operationId: 'operation' }, 202);
            },
        } } };
    const registry = registerMutationActions(new ActionRegistry(), browser);
    const executor = new RiskExecutor(registry, new PolicyCeiling(registry, ['chat.send']), {
        approve: async review => { approvals++; reviews.push(review); return { action: 'accept', content: { authorize: true, uses: 1 } }; },
    });
    const input = { sessionId: 'ses_fixture', expectedRevisionId: 'r1', commitId: 'commit_fixture', invocationId: 'turn', userInput: 'Hello' };
    const send = (overrides = {}) => executor.execute('MUTATE', { action: 'chat.send', input: { ...input, ...overrides } });
    return { send, writes, receiptQueries, reviews, get approvals() { return approvals; } };
}
test('chat.send commits one user anchor then starts generation at that exact revision under one approval', async () => {
    const f = fixture(), result = await f.send();
    assert.equal(result.receipt.status, 'succeeded'); assert.equal(f.approvals, 1); assert.equal(f.writes.length, 2);
    assert.equal(result.receipt.created[0].id, 'msg_fixture'); assert.equal(result.receipt.after.input.revisionId, 'r2');
    assert.equal(result.receipt.after.input.commitId, 'commit_fixture'); assert.equal(result.receipt.after.input.status, 'committed');
    assert.equal(result.receipt.after.generation.status, 'admitted'); assert.equal(f.receiptQueries.length, 1);
    await assert.rejects(f.send(), /revision conflict/); assert.equal(f.writes.length, 2); assert.equal(f.approvals, 1);
});

test('chat.send approval binds exact model, network target and budget; changed configuration or unapproved target performs zero input writes', async () => {
    const changed = fixture({ changedConfiguration: true });
    await assert.rejects(changed.send(), /changed|guard/i); assert.equal(changed.approvals, 1); assert.equal(changed.writes.length, 0);
    const blocked = fixture({ approvedTarget: false });
    await assert.rejects(blocked.send(), /credential/); assert.equal(blocked.approvals, 0); assert.equal(blocked.writes.length, 0);
    const approved = fixture(); await approved.send();
    const evidence = JSON.stringify(approved.reviews);
    assert.match(evidence, /fixture-model/); assert.match(evidence, /fixture.invalid/); assert.match(evidence, /maxTokens/); assert.match(evidence, /suppressed/);
});
test('chat.send requires a caller-known commit identity before any write or approval', async () => {
    const f = fixture();
    await assert.rejects(f.send({ commitId: undefined }));
    assert.equal(f.approvals, 0); assert.equal(f.writes.length, 0); assert.equal(f.receiptQueries.length, 0);
});
test('lost append acknowledgement is reconciled without repeating append or starting a model', async () => {
    const f = fixture({ appendLost: true }), result = await f.send();
    assert.equal(result.receipt.status, 'indeterminate'); assert.equal(f.writes.length, 1); assert.equal(f.receiptQueries.length, 1);
    assert.equal(result.receipt.after.input.status, 'committed'); assert.equal(result.receipt.after.input.revisionId, 'r2');
    assert.equal(result.receipt.after.generation.status, 'not_started'); assert.deepEqual(result.receipt.created, []);
});
for (const receiptMode of ['lost', 'absent', 'mismatch', 'changedBoot']) test('unverified native receipt (' + receiptMode + ') blocks generation without replay', async () => {
    const f = fixture({ receiptMode }), result = await f.send();
    assert.equal(result.receipt.status, 'indeterminate'); assert.equal(f.writes.length, 1); assert.equal(f.receiptQueries.length, 1);
    assert.equal(result.receipt.after.input.status, 'unknown'); assert.equal(result.receipt.after.generation.status, 'not_started');
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
