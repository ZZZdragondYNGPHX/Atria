import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ActionRegistry, PolicyCeiling, RiskExecutor } from '../src/kernel.js';
import { registerSkillActions } from '../src/skill-actions.js';
import { redactText } from '../src/policy.js';
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
            if (url.endsWith('/identity') || url.endsWith('/inspect') && !url.endsWith('/url/inspect')) return response({ skill: { installedHash: current } });
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

test('all bounded Skill JSON fragments reconstruct redacted metadata without dropping the unread remainder', async () => {
    const data = { skill: { name: 'example', installedHash: hash, metadata: { text: 'readable metadata '.repeat(3000), apiKey: 'must-not-leak' } } }, calls = [];
    const response = value => ({ ok: () => true, status: () => 200, headers: () => ({ 'content-type': 'application/json', 'x-atria-server-boot-id': boot }), body: async () => Buffer.from(JSON.stringify(value)), dispose: async () => {} });
    const browser = { config: { url: 'http://localhost', timeout: 1000, maxResponseBytes: 1048576 }, start: async () => {}, runtimeIdentity: async () => ({ serverBootId: boot }), context: { request: {
        get: async () => response({ token: 'fixture' }), fetch: async (_url, options) => { calls.push(options.data); return response(data); },
    } } };
    const registry = registerSkillActions(new ActionRegistry(), browser, null, { readSource: async (_browser, options) => { calls.push(options.input); return Buffer.from(JSON.stringify(data.skill)); } }), executor = new RiskExecutor(registry, new PolicyCeiling(registry));
    let offset = 0, contentHash; const parts = [];
    do {
        const page = await executor.execute('READ', { action: 'skill.inspect', input: { scope, name: 'example', outputOffset: offset, outputLimit: 5000 } });
        contentHash ??= page.page.contentHash; assert.equal(page.page.contentHash, contentHash); assert.equal(page.data.format, 'json-text-fragment');
        assert.equal(page.data.encoding, 'hex-utf16le'); parts.push(Buffer.from(page.data.encodedText, 'hex').toString('utf16le')); offset = page.page.nextOffset;
    } while (offset !== null);
    const reconstructed = JSON.parse(parts.join('')); assert.equal(reconstructed.skill.metadata.text, data.skill.metadata.text); assert.equal(reconstructed.skill.metadata.apiKey, '[REDACTED]');
    assert.ok(!parts.join('').includes('must-not-leak')); assert.ok(calls.every(input => !('outputOffset' in input) && !('outputLimit' in input)));
    const serialized = parts.join(''), sensitiveAt = serialized.indexOf('"apiKey"'), start = sensitiveAt - 100;
    for (let end = sensitiveAt; end < sensitiveAt + 30; end++) {
        const page = await executor.execute('READ', { action: 'skill.inspect', input: { scope, name: 'example', outputOffset: start, outputLimit: end - start } });
        assert.equal(Buffer.from(page.data.encodedText, 'hex').toString('utf16le'), serialized.slice(start, end));
    }
});

test('oversized inline Skill JSON is rejected before request and directs callers to the fixed source lane', async () => {
    const f = fixture();
    await assert.rejects(f.run('MUTATE', 'install', { scope, expectedInstalledHash: null, payload: { files: [
        { path: 'SKILL.md', encoding: 'utf8', content: 'a'.repeat(400 * 1024) }, { path: 'extra.txt', encoding: 'utf8', content: 'b'.repeat(400 * 1024) },
    ] } }), /payload.capture/);
    await assert.rejects(f.run('MUTATE', 'file.write', { scope, name: 'example', expectedInstalledHash: hash, path: 'extra.txt', content: '\0'.repeat(150000) }), /payload.capture/);
    assert.equal(f.approvals, 0); assert.equal(f.writes.length, 0);
});

test('maximum file text is redacted as a whole before every secret-boundary page and retains distinct original/safe hashes', async () => {
    const secret = 'synthetic-private-assignment', prefix = 'safe '.repeat(396) + 'apiKey="' + secret + '"\n',
        bytes = Buffer.from(prefix + 'z'.repeat(4 * 1024 * 1024 - prefix.length)), originalHash = createHash('sha256').update(bytes).digest('hex'), safe = redactText(bytes.toString());
    const browser = { runtimeIdentity: async () => ({ serverBootId: boot }) }, registry = registerSkillActions(new ActionRegistry(), browser, null, {
        readSource: async (_browser, options) => { assert.equal(options.path, '/api/native/skills/file/content'); assert.equal(options.maxBytes, 4 * 1024 * 1024); return bytes; },
    }), executor = new RiskExecutor(registry, new PolicyCeiling(registry));
    const placeholder = safe.indexOf('[REDACTED]'), decode = value => value.content ?? Buffer.from(value.contentFragment.encodedText, 'hex').toString('utf16le');
    for (let end = placeholder - 10; end < placeholder + 20; end++) {
        const start = end - 100, response = await executor.execute('READ', { action: 'skill.file.read', input: { scope, name: 'example', path: 'support.txt', offset: start, limit: 100 } }), page = response.data;
        assert.equal(page.contentHash, originalHash); assert.equal(page.redactedContentHash, createHash('sha256').update(safe).digest('hex'));
        assert.equal(decode(page), safe.slice(start, end)); assert.ok(!JSON.stringify(response).includes(secret));
    }
});

test('candidate before/after source bytes are fully redacted before character paging and stale metadata cannot fetch bytes', async () => {
    const before = 'prefix '.repeat(300) + 'apiKey="synthetic-before-private"\nend', after = 'prefix '.repeat(300) + 'apiKey="synthetic-after-private"\nend', metadataHash = 'b'.repeat(64),
        metadata = { metadataHash, diff: { beforeHash: createHash('sha256').update(before).digest('hex'), afterHash: createHash('sha256').update(after).digest('hex') } };
    const response = value => ({ ok: () => true, status: () => 200, headers: () => ({ 'content-type': 'application/json', 'x-atria-server-boot-id': boot }), body: async () => Buffer.from(JSON.stringify(value)), dispose: async () => {} });
    let reads = 0;
    const browser = { config: { url: 'http://localhost', timeout: 1000, maxResponseBytes: 1048576 }, start: async () => {}, runtimeIdentity: async () => ({ serverBootId: boot }), context: { request: {
        get: async () => response({ token: 'fixture' }), fetch: async () => response(metadata),
    } } }, registry = registerSkillActions(new ActionRegistry(), browser, null, { readSource: async (_browser, options) => {
        reads++; assert.equal(options.expectedHash, metadata.diff[options.input.field + 'Hash']); return Buffer.from(options.input.field === 'before' ? before : after);
    } }), executor = new RiskExecutor(registry, new PolicyCeiling(registry));
    for (const field of ['before', 'after']) {
        const safe = redactText(field === 'before' ? before : after), placeholder = safe.indexOf('[REDACTED]');
        for (let end = placeholder - 10; end < placeholder + 20; end++) {
            const offset = end - 100, result = await executor.execute('READ', { action: 'skill.candidate.diff', input: { scope, name: 'example', candidateId: hash,
                expectedMetadataHash: metadataHash, field, offset, limit: 100 } }), page = result.data;
            assert.equal(page.content ?? Buffer.from(page.contentFragment.encodedText, 'hex').toString('utf16le'), safe.slice(offset, end));
            assert.ok(!JSON.stringify(result).includes('synthetic-' + field + '-private'));
        }
    }
    const originalReads = reads;
    await assert.rejects(executor.execute('READ', { action: 'skill.candidate.diff', input: { scope, name: 'example', candidateId: hash, expectedMetadataHash: 'c'.repeat(64), field: 'after' } }), /metadata changed/);
    assert.equal(reads, originalReads);
});
