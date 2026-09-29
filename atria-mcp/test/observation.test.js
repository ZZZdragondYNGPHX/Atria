import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { productFixture } from './helpers.js';
import { RepositoryObservation } from '../src/repository.js';
import { ActionRegistry, PolicyCeiling, ReceiptStore, RiskExecutor, RISKS } from '../src/kernel.js';
const exec = promisify(execFile);
const git = async (root, ...args) => (await exec('git', ['-C', root, ...args])).stdout;
const commit = root => git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'observation fixture');

test('repository tree/read/search covers tracked root/workflow/templates and safe untracked files', async t => {
    const f = await productFixture(); t.after(f.cleanup);
    await f.write('README.md', 'root evidence'); await f.write('.github/workflows/check.yml', 'workflow evidence');
    await f.write('default/config.yaml', 'port: 8000');
    await git(f.root, 'add', '.'); await commit(f.root);
    await f.write('new-feature.ts', 'untracked evidence');
    const repo = await new RepositoryObservation(f.root).init();
    const tree = await repo.list();
    assert.ok(tree.entries.some(e => e.path === 'README.md' && e.category === 'tracked'));
    assert.ok(tree.entries.some(e => e.path === 'new-feature.ts' && e.category === 'safe untracked development'));
    assert.match((await repo.read({ path: '.github/workflows/check.yml' })).content, /workflow evidence/);
    assert.match((await repo.read({ path: 'default/config.yaml' })).content, /port/);
    assert.match((await repo.read({ path: 'new-feature.ts' })).content, /untracked evidence/);
    assert.ok((await repo.search({ query: 'evidence' })).matches.length >= 3);
    assert.equal((await repo.list({ limit: 1 })).nextOffset, 1);
});

test('independent path/content policy blocks dataRoot, ignored state, credentials and junctions', async t => {
    const f = await productFixture(); t.after(f.cleanup);
    await f.write('.gitignore', 'ignored.txt\n.artifacts/\n');
    for (const [path, text] of Object.entries({ 'ignored.txt': 'hidden', '.env.local': 'KEY=private', 'config.yaml': 'dataRoot: custom-runtime',
        'custom-runtime/chat.txt': 'private chat', '.artifacts/data/chat.txt': 'private artifact', 'safe.txt': 'password="secret with spaces"\napi_key: abcdef\nBearer opaque-token',
        'innocent.txt': '-----BEGIN PRIVATE KEY-----\nnever-return\n-----END PRIVATE KEY-----', 'store.sqlite': 'database', '.artifacts/result.txt': 'test evidence token=hide-me' })) await f.write(path, text);
    const repo = await new RepositoryObservation(f.root).init();
    for (const path of ['data/private.json', '.env.local', 'config.yaml', 'custom-runtime/chat.txt', 'ignored.txt', 'store.sqlite', '../secret', 'public/../safe.txt', 'C:/x', 'safe.txt:stream', 'safe.txt.', 'src\\server-startup.js']) await assert.rejects(repo.read({ path }), undefined, path);
    assert.doesNotMatch((await repo.read({ path: 'safe.txt' })).content, /secret with spaces|abcdef|opaque-token/);
    await assert.rejects(repo.read({ path: 'innocent.txt' }), /private-key/);
    await assert.rejects(repo.artifact({ operation: 'read', path: '.artifacts/data/chat.txt' }));
    await assert.rejects(repo.read({ path: '.artifacts/result.txt' }));
    assert.doesNotMatch((await repo.artifact({ operation: 'read', path: '.artifacts/result.txt' })).content, /hide-me/);
    await symlink(join(f.root, 'data'), join(f.root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    await symlink(join(f.root, 'public'), join(f.root, '.artifacts', 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(repo.bytes('linked/private.json'), /Symlink/);
    await assert.rejects(repo.artifact({ operation: 'read', path: '.artifacts/linked/example.js' }), /Symlink/);
    await f.write('config.yaml', 'dataRoot: later-runtime'); await f.write('later-runtime/value.txt', 'private');
    await assert.rejects(repo.read({ path: 'later-runtime/value.txt' }));
    await assert.rejects(repo.read({ path: 'custom-runtime/chat.txt' }));
    const explicit = await new RepositoryObservation(f.root, ['public']).init();
    await assert.rejects(explicit.read({ path: 'public/example.js' }));
});

test('Git working/staged/base diffs, status/log/show/blame redact historical evidence', async t => {
    const f = await productFixture(); t.after(f.cleanup);
    await f.write('notes.txt', 'evidence\npassword="old secret"\n'); await f.write('.env', 'PRIVATE=never-return');
    await git(f.root, 'add', '.'); await commit(f.root);
    const base = (await git(f.root, 'rev-parse', 'HEAD')).trim();
    const repo = await new RepositoryObservation(f.root).init();
    assert.match((await repo.evidence({ operation: 'log' })).content, /observation fixture/);
    for (const operation of ['show', 'blame']) {
        const result = await repo.evidence({ operation, path: 'notes.txt' });
        assert.match(result.content, /evidence/); assert.doesNotMatch(result.content, /old secret/);
        await assert.rejects(repo.evidence({ operation, path: '.env' }));
        await assert.rejects(repo.evidence({ operation, path: 'data/private.json' }));
        await assert.rejects(repo.evidence({ operation, path: 'notes.txt', ref: '--output=oops' }));
    }
    await f.write('notes.txt', 'changed evidence\npassword="new secret"\n');
    await f.write('.env', 'PRIVATE=new-private'); await f.write('scratch.js', 'safe untracked');
    assert.ok((await repo.evidence({ operation: 'status' })).entries.some(e => e.status === '??' && e.path === 'scratch.js'));
    let diff = await repo.evidence({ operation: 'diff' });
    assert.match(JSON.stringify(diff), /changed evidence/); assert.doesNotMatch(JSON.stringify(diff), /old secret|new secret|new-private/); assert.equal(diff.denied, 1);
    await git(f.root, 'add', 'notes.txt');
    assert.match(JSON.stringify(await repo.evidence({ operation: 'diff', staged: true })), /changed evidence/);
    await commit(f.root);
    assert.match(JSON.stringify(await repo.evidence({ operation: 'diff', base })), /changed evidence/);
    await f.write('innocent.txt', '-----BEGIN PRIVATE KEY-----\nDO-NOT-LEAK\n-----END PRIVATE KEY-----');
    await git(f.root, 'add', 'innocent.txt'); await commit(f.root);
    await assert.rejects(repo.evidence({ operation: 'show', path: 'innocent.txt' }));
    await assert.rejects(repo.evidence({ operation: 'blame', path: 'innocent.txt' }));
});

test('artifacts have fixed roots, byte/depth bounds, binary identity and image signatures', async t => {
    const f = await productFixture(); t.after(f.cleanup);
    await f.write('.gitignore', '.artifacts/\n'); await f.write('.artifacts/result.log', 'test evidence');
    await f.write('.artifacts/bundle.zip', Buffer.from([0, 1, 2]));
    await f.write('.artifacts/huge.txt', 'x'.repeat(2 * 1024 * 1024 + 1));
    await f.write('.artifacts/fake.png', 'not png');
    await f.write('.artifacts/image.png', Buffer.from('89504e470d0a1a0a00000000', 'hex'));
    const repo = await new RepositoryObservation(f.root).init();
    assert.ok((await repo.artifact({ operation: 'list' })).entries.some(e => e.path.endsWith('result.log')));
    assert.equal((await repo.artifact({ operation: 'search', query: 'evidence' })).matches.length, 1);
    await assert.rejects(repo.artifact({ operation: 'read', path: '.artifacts/bundle.zip' }), /Binary/);
    assert.equal((await repo.artifact({ operation: 'inspect', path: '.artifacts/bundle.zip' })).bytes, 3);
    await assert.rejects(repo.artifact({ operation: 'read', path: '.artifacts/huge.txt' }));
    await assert.rejects(repo.artifact({ operation: 'image', path: '.artifacts/fake.png' }));
    assert.equal((await repo.artifact({ operation: 'image', path: '.artifacts/image.png' })).content[0].mimeType, 'image/png');
    await assert.rejects(repo.artifact({ operation: 'inspect', path: 'public/example.js' }));
});

const descriptor = (id, risk = 'READ') => ({ version: 1, id, domain: 'fixture', title: 'Fixture action', risk, authority: 'fixture authority', adapter: 'test-only',
    externalEffects: [], guards: [], approval: risk === 'READ' ? 'none' : 'trusted-approval-required', availability: { available: true, reason: '' } });
test('registry schema, immutable descriptors, ceiling snapshots and exact four-risk matching fail closed', async () => {
    const registry = new ActionRegistry(); let calls = 0;
    for (const risk of RISKS) registry.register(descriptor('fixture.' + risk.toLowerCase(), risk), z.strictObject({ value: z.number() }), z.strictObject({ value: z.number() }), x => { calls++; return x; });
    assert.throws(() => registry.register(descriptor('fixture.read'), z.object({}), z.object({}), () => {}), /Duplicate/);
    const ceiling = new PolicyCeiling(registry);
    registry.register(descriptor('fixture.later'), z.object({}), z.object({}), () => ({}));
    assert.equal(ceiling.allows('fixture.later'), false);
    const executor = new RiskExecutor(registry, ceiling);
    assert.deepEqual(await executor.execute('READ', { action: 'fixture.read', input: { value: 2 } }), { value: 2 });
    await assert.rejects(executor.execute('READ', { action: 'fixture.read', input: { value: '2' } }));
    for (const risk of RISKS) for (const other of RISKS) if (risk !== other) await assert.rejects(executor.execute(risk, { action: 'fixture.' + other.toLowerCase(), input: { value: 1 } }), /mismatch/);
    for (const risk of RISKS.slice(1)) {
        await assert.rejects(executor.execute(risk, { action: 'fixture.' + risk.toLowerCase(), input: { value: 1 } }), /Ceiling/);
        const generous = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()));
        await assert.rejects(generous.execute(risk, { action: 'fixture.' + risk.toLowerCase(), input: { value: 1 } }), /Missing authority guards|unavailable in Phase 4/);
    }
    const detail = registry.discover({ action: 'fixture.read' }); detail.risk = 'MUTATE';
    assert.equal(registry.discover({ action: 'fixture.read' }).risk, 'READ');
    assert.equal(registry.discover({ domain: 'fixture', risk: 'DESTRUCTIVE' }).total, 1);
    assert.equal(calls, 1);
});

test('ephemeral receipts are redacted, bounded, instance-owned, detached and expire', () => {
    let now = 0; const store = new ReceiptStore({ maxEntries: 1, ttlMs: 10, now: () => now });
    const first = store.put({ receiptId: 'forged', mcpInstanceId: 'forged', password: 'never-return', detail: 'token=never-return' });
    assert.notEqual(first.receiptId, 'forged'); assert.notEqual(first.mcpInstanceId, 'forged'); assert.doesNotMatch(JSON.stringify(first), /never-return/);
    first.password = 'changed'; assert.equal(store.get(first.receiptId).password, '[REDACTED]');
    const second = store.put({ action: 'fixture.read' }); assert.equal(store.get(first.receiptId), null);
    now = 11; assert.equal(store.get(second.receiptId), null);
    store.put({}); store.clear(); assert.equal(store.get(second.receiptId), null);
});

test('YAML dataRoot parsing and historical/index roots cannot be bypassed by config changes', async t => {
    const f = await productFixture(); t.after(f.cleanup);
    await f.write('config.yaml', '{"dataRoot": "old-runtime"}');
    await f.write('old-runtime/record.txt', 'private user content');
    await git(f.root, 'add', '.'); await commit(f.root);
    const old = (await git(f.root, 'rev-parse', 'HEAD')).trim();
    await f.write('config.yaml', 'dataRoot: next-runtime'); await git(f.root, 'add', 'config.yaml'); await commit(f.root);
    const repo = await new RepositoryObservation(f.root).init();
    await assert.rejects(repo.evidence({ operation: 'show', ref: old, path: 'old-runtime/record.txt' }));
    await assert.rejects(repo.evidence({ operation: 'blame', ref: old, path: 'old-runtime/record.txt' }));
    await f.write('config.yaml', 'dataRoot: indexed-runtime'); await f.write('indexed-runtime/evidence.txt', 'user state');
    await git(f.root, 'add', '.'); await f.write('config.yaml', 'dataRoot: current-runtime');
    const diff = await repo.evidence({ operation: 'diff', staged: true });
    assert.doesNotMatch(JSON.stringify(diff), /user state/);
    await f.write('config.yaml', 'dataRoot: [invalid]');
    await assert.rejects(repo.list(), /exclusions/);
    await f.write('config.yaml', 'dataRoot: first\ndataRoot: second');
    await assert.rejects(repo.list(), /exclusions/);
});

test('redaction covers nested credentials and multiline content before paging or Git output', async t => {
    const f = await productFixture(); t.after(f.cleanup);
    await f.write('config-example.txt', 'password: |\n  private-multiline\n');
    await f.write('ordinary.json', '{"providerApiKey":"hidden-provider","access_token":"hidden-access"}');
    await f.write('.npmrc', '//registry.example/:_authToken=hidden-npm');
    await f.write('public/characters/name.json', '{"user":"private-player"}');
    await git(f.root, 'add', '.'); await commit(f.root);
    const repo = await new RepositoryObservation(f.root).init();
    assert.doesNotMatch(JSON.stringify(await repo.read({ path: 'ordinary.json' })), /hidden-provider|hidden-access/);
    assert.doesNotMatch(JSON.stringify(await repo.read({ path: 'config-example.txt', startLine: 2 })), /private-multiline/);
    assert.doesNotMatch(JSON.stringify(await repo.evidence({ operation: 'show', path: 'config-example.txt' })), /private-multiline/);
    for (const path of ['.npmrc', 'public/characters/name.json']) {
        await assert.rejects(repo.read({ path })); await assert.rejects(repo.evidence({ operation: 'show', path }));
    }
});

test('historical symbolic-link blobs and diff cannot bypass the regular-file policy', async t => {
    const f = await productFixture(); t.after(f.cleanup);
    await f.write('target.txt', '../outside-private');
    const oid = (await git(f.root, 'hash-object', '-w', 'target.txt')).trim();
    await git(f.root, 'update-index', '--add', '--cacheinfo', `120000,${oid},link.txt`);
    await commit(f.root);
    const repo = await new RepositoryObservation(f.root).init();
    for (const operation of ['show', 'blame']) await assert.rejects(repo.evidence({ operation, path: 'link.txt' }), /regular file/);
    const diff = await repo.evidence({ operation: 'diff', base: 'HEAD~1' });
    assert.doesNotMatch(JSON.stringify(diff), /outside-private/); assert.ok(diff.denied > 0);
});

test('read and search cursors preserve omitted lines; artifact depth bounds are explicit', async t => {
    const f = await productFixture(); t.after(f.cleanup);
    await f.write('long.txt', 'x'.repeat(31000) + '\nnext evidence');
    await f.write('matches.txt', 'needle first\nneedle second\nneedle third');
    await f.write('.artifacts/a/b/c/d/e/f/g/deep.txt', 'deep');
    const repo = await new RepositoryObservation(f.root).init();
    const first = await repo.read({ path: 'long.txt' }); assert.equal(first.nextLine, 2); assert.equal(first.truncated, true);
    assert.match((await repo.read({ path: 'long.txt', startLine: first.nextLine })).content, /next evidence/);
    const found = await repo.search({ query: 'needle', pathPrefix: 'matches.txt', limit: 1 });
    const next = await repo.search({ query: 'needle', pathPrefix: 'matches.txt', limit: 1, offset: found.nextOffset, startLine: found.nextLine });
    assert.equal(next.matches[0].line, 2);
    assert.equal((await repo.artifact({ operation: 'list' })).scanTruncated, true);
});

test('Git diff cannot leak multiline secret bodies when the marker is outside hunk context', async t => {
    const f = await productFixture(); t.after(f.cleanup);
    const lines = ['secret: |', ...Array.from({ length: 15 }, (_, i) => '  private-line-' + i)];
    await f.write('ordinary.txt', lines.join('\n'));
    await git(f.root, 'add', '.'); await commit(f.root);
    lines[10] = '  altered-private-value'; await f.write('ordinary.txt', lines.join('\n'));
    const repo = await new RepositoryObservation(f.root).init();
    const diff = await repo.evidence({ operation: 'diff' });
    assert.equal(diff.denied, 1); assert.doesNotMatch(JSON.stringify(diff), /private-line|altered-private-value/);
});
