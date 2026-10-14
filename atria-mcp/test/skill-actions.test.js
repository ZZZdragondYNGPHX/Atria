import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActionRegistry, PolicyCeiling, RiskExecutor } from '../src/kernel.js';
import { registerSkillActions } from '../src/skill-actions.js';
const boot = '12345678-1234-4123-8123-123456789012';
const hash = 'a'.repeat(64), scope = { kind: 'global' };
function fixture({ changeAfterApproval = false } = {}) {
    let approvals = 0, current = hash, prepared;
    const writes = [], reviews = [];
    const response = data => ({ ok: () => true, status: () => 200, headers: () => ({ 'content-type': 'application/json', 'x-atria-server-boot-id': boot }),
        body: async () => Buffer.from(JSON.stringify(data)), dispose: async () => {} });
    const browser = { config: { url: 'http://localhost', timeout: 1000, maxResponseBytes: 1048576 }, start: async () => {}, runtimeIdentity: async () => ({ serverBootId: boot }),
        context: { request: { get: async () => response({ token: 'csrf' }), fetch: async (url, options) => {
            const body = options.data;
            if (url.endsWith('/scope/inspect')) return response({ count: 1, inventoryHash: current });
            if (url.endsWith('/inspect') && !url.endsWith('/url/inspect')) return response({ skill: { installedHash: current } });
            if (url.endsWith('/url/inspect')) { assert.equal(body.clientInstanceId, prepared.clientInstanceId); return response(prepared); }
            writes.push({ url, body });
            assert.equal(options.headers['x-atria-expected-server-boot-id'], boot);
            if (url.endsWith('/url/prepare')) prepared = { ...body, prepareId: '11111111-1111-4111-8111-111111111111', contentHash: hash, name: 'example', existingHash: current };
            return response(prepared ?? { ok: true });
        } } } };
    const registry = registerSkillActions(new ActionRegistry(), browser);
    const executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), { approve: async review => {
        reviews.push(review); approvals++; if (changeAfterApproval) current = 'b'.repeat(64);
        return { action: 'accept', content: { authorize: true, uses: 1 } };
    } });
    return { registry, writes, reviews, get approvals() { return approvals; }, run: (risk, suffix, input) => executor.execute(risk, { action: 'skill.' + suffix, input }) };
}
test('Skill URL prepare and apply have separate approvals and never accept model-provided client identity', async () => {
    const f = fixture();
    const prepared = await f.run('INTERACT', 'import.url.prepare', { scope, url: 'https://example.test/SKILL.md' });
    assert.equal(prepared.receipt.status, 'succeeded');
    await f.run('MUTATE', 'import.url.apply', { prepareId: f.writes[0].body.prepareId ?? prepared.result.data.prepareId, contentHash: hash, expectedInstalledHash: hash });
    assert.equal(f.approvals, 2); assert.equal(f.writes.length, 2);
    assert.equal(f.writes[0].body.clientInstanceId, f.writes[1].body.clientInstanceId);
    assert.deepEqual(f.reviews[0].before.externalEffects, ['public-network-fetch', 'temporary-inert-skill-candidate']);
    await assert.rejects(f.run('INTERACT', 'import.url.prepare', { scope, url: 'https://example.test/SKILL.md', clientInstanceId: 'forged' }));
    await assert.rejects(f.run('INTERACT', 'import.url.prepare', { scope, url: 'http://127.0.0.1/private' }), /HTTPS/);
});
test('Skill scope deletion is destructive and approval-time inventory drift prevents dispatch', async () => {
    const f = fixture({ changeAfterApproval: true });
    await assert.rejects(f.run('MUTATE', 'scope.delete', { scope, expectedInventoryHash: hash }), /risk mismatch/);
    await assert.rejects(f.run('DESTRUCTIVE', 'scope.delete', { scope, expectedInventoryHash: hash }), /inventory changed/);
    assert.equal(f.approvals, 1); assert.equal(f.writes.length, 0);
});
test('Package Skill originals and arbitrary command fields cannot become a write path', async () => {
    const f = fixture(), packageScope = { kind: 'package', packageId: 'pkg_one', packageVersionId: 'pkgv_one' };
    await assert.rejects(f.run('DESTRUCTIVE', 'delete', { scope: packageScope, name: 'example', expectedInstalledHash: hash }), /read-only/);
    await assert.rejects(f.run('MUTATE', 'file.write', { scope, name: 'example', expectedInstalledHash: hash, path: '../secret', content: 'x' }));
    await assert.rejects(f.run('MUTATE', 'file.write', { scope, name: 'example', expectedInstalledHash: hash, path: 'SKILL.md', content: 'x', command: 'shell' }));
    assert.equal(f.approvals, 0); assert.equal(f.writes.length, 0);
});

