import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { apiUrl, safeUrl, requireWrite, redact, routeMatches } from '../src/policy.js';
import { SourceCatalog } from '../src/catalog.js';
import { productFixture } from './helpers.js';

test('configuration defaults are local, explicit and secret-free', () => {
    const config = loadConfig(['--repo', '.'], {});
    assert.equal(config.url, 'http://127.0.0.1:8000');
    assert.equal(config.allowWrites, false);
    assert.equal(config.headed, false);
    assert.throws(() => loadConfig([], {}), /ATRIA_REPO/);
    for (const url of ['https://example.com', 'file:///tmp/a', 'http://user:pass@localhost', 'http://localhost/prefix', 'http://localhost/?token=secret']) {
        assert.throws(() => loadConfig(['--repo', '.', '--url', url], {}));
    }
    assert.throws(() => loadConfig(['--repo', '.', '--url', 'http://example.com', '--allow-remote'], {}), /HTTPS/);
    assert.equal(loadConfig(['--repo', '.', '--url', 'https://example.com', '--allow-remote'], {}).allowRemote, true);
});

test('API paths cannot escape Native, traverse, encode separators or access secrets', () => {
    const config = { url: 'http://127.0.0.1:8000' };
    for (const path of ['/api/secrets', '//evil.test', '/api/native/../secrets', '/api/native/studio/%2e%2e', '/api/native/studio/%252e', '/api/native/generation/secrets', '/api/native/studio/x?url=evil', '/api/native/studio/\\evil']) {
        assert.throws(() => apiUrl(config, path), path);
    }
    assert.equal(apiUrl(config, '/api/native/studio/projects', { search: 'a&b', count: 1 }).search, '?search=a%26b&count=1');
    assert.throws(() => safeUrl('//evil.test', config.url));
    assert.equal(safeUrl('/#studio', config.url).origin, config.url);
});

test('writes need both operator opt-in and per-call confirmation', () => {
    assert.throws(() => requireWrite({ allowWrites: false }, true));
    assert.throws(() => requireWrite({ allowWrites: true }, false));
    assert.doesNotThrow(() => requireWrite({ allowWrites: true }, true));
});

test('route matching and nested credential redaction are bounded in scope', () => {
    assert.equal(routeMatches('/projects/:id', '/projects/a'), true);
    assert.equal(routeMatches('/projects/:id', '/projects/a/delete'), false);
    assert.equal(routeMatches('/projects/:id', '/projects/'), false);
    assert.equal(routeMatches('/files/:id/*', '/files/a/dir/main.js'), true);
    assert.deepEqual(redact({ password: 'a', rows: [{ api_key: 'b', secretId: 'reference-only', revision: 'r1' }] }),
        { password: '[REDACTED]', rows: [{ api_key: '[REDACTED]', secretId: 'reference-only', revision: 'r1' }] });
});

test('catalog statically discovers mounts, arrays, loops, template paths and source hints', async t => {
    const fixture = await productFixture(); t.after(fixture.cleanup);
    const catalog = await new SourceCatalog(fixture.root).init();
    const result = await catalog.routes();
    assert.equal(result.routes.length, 11);
    assert.equal(result.unsupported.length, 1);
    assert.ok(result.routes.find(r => r.id === 'POST /api/native/studio/worlds/:id/promote'));
    assert.ok(result.routes.find(r => r.id === 'POST /api/native/studio/shared/snapshot'));
    assert.equal(result.routes.find(r => r.path.endsWith('/secrets')).blocked, true);
    assert.deepEqual(result.routes.find(r => r.id === 'POST /api/native/studio/projects').requestHints.body, ['name']);
    assert.match((await catalog.read('public/example.js')).content, /Atria test evidence/);
    assert.equal((await catalog.search('test evidence', 'public/')).matches.length, 1);
    await fixture.write('public/example.js', 'export const message = "Working tree changed";');
    assert.match((await catalog.read('public/example.js')).content, /Working tree changed/);
    assert.equal((await catalog.status()).trackedWorkingTreeDirty, true);
    await fixture.write('public/example.js', 'x'.repeat(31000) + '\nsecond line');
    const longLine = await catalog.read('public/example.js');
    assert.equal(longLine.truncated, true);
    assert.equal(longLine.nextLine, 2);
    assert.ok(longLine.content.length <= 30000);
    assert.match((await catalog.read('public/example.js', longLine.nextLine)).content, /second line/);
});

test('source access rejects data, untracked files, traversal and symlink aliases', async t => {
    const fixture = await productFixture(); t.after(fixture.cleanup);
    const catalog = await new SourceCatalog(fixture.root).init();
    for (const path of ['data/private.json', '../secret', 'public/../data/private.json', 'src\\server-startup.js']) await assert.rejects(catalog.read(path));
    await fixture.write('public/untracked.js', 'secret');
    await assert.rejects(catalog.read('public/untracked.js'));
    // Directory junction creation does not require Windows developer-mode privileges.
    await symlink(join(fixture.root, 'data'), join(fixture.root, 'public', 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    catalog.files.add('public/linked/private.json');
    await assert.rejects(catalog.readRaw('public/linked/private.json'), /Symlink/);
});
