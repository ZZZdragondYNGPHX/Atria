import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { productFixture, httpFixture } from './helpers.js';
import { readSourceIdentity, compareSource, compareBrowser, scopedResponse, experienceSchema, previewSchema, compareScope, Provenance } from '../src/provenance.js';
import { BROWSER_ADAPTERS, invokeBrowserAdapter } from '../src/capability-bridge.js';
import { AtriaBrowser } from '../src/browser.js';
const exec = promisify(execFile);
const runtime = source => ({ version: 1, serverBootId: randomUUID(), processStartedAt: Date.now(), appVersion: '2.7.0', source });

test('source identity distinguishes bytes, revisions, workspace and uncertainty without reading checkout code', async t => {
    const f = await productFixture(); t.after(f.cleanup);
    const source = await readSourceIdentity(f.root), server = runtime(source);
    assert.deepEqual(source.reasons, []); assert.equal(compareSource(source, server), 'EXACT');
    await f.write('public/example.js', 'modified tracked bytes');
    const dirty = await readSourceIdentity(f.root);
    assert.equal(compareSource(dirty, server), 'SOURCE_CHANGED_SINCE_RUNTIME_START');
    await exec('git', ['-C', f.root, 'add', 'public/example.js']);
    assert.equal((await readSourceIdentity(f.root)).fingerprint, dirty.fingerprint);
    await exec('git', ['-C', f.root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'new revision']);
    assert.equal(compareSource(await readSourceIdentity(f.root), server), 'DIFFERENT_REVISION');
    assert.equal(compareSource({ ...source, workspaceId: 'a'.repeat(64) }, server), 'CONTENT_MATCH_DIFFERENT_WORKSPACE');
    for (const invalid of [null, {}, { ...server, source: { ...source, reasons: ['unknown'] } }, { ...server, source: { ...source, fingerprint: null } }]) {
        assert.equal(compareSource(source, invalid), 'UNVERIFIABLE');
    }
    assert.equal(compareBrowser({ serverBootId: server.serverBootId }, server), 'CURRENT');
    assert.equal(compareBrowser({ serverBootId: randomUUID() }, server), 'STALE');
    assert.equal(compareBrowser(null, server), 'UNVERIFIABLE');
});

test('ignored and ordinary untracked runtime files prevent exactness; unrelated files do not', async t => {
    const f = await productFixture(); t.after(f.cleanup);
    const server = runtime(await readSourceIdentity(f.root));
    await f.write('notes.md', 'unrelated');
    assert.equal(compareSource(await readSourceIdentity(f.root), server), 'EXACT');
    await f.write('src/new.js', 'never executed');
    assert.equal(compareSource(await readSourceIdentity(f.root), server), 'UNVERIFIABLE');
    await f.write('.gitignore', 'src/new.js\n');
    assert.equal(compareSource(await readSourceIdentity(f.root), server), 'UNVERIFIABLE');
});

test('Experience Epoch and exact Preview workspace stay separate, stale scoped evidence is rejected', () => {
    const open = '/api/native/session/frontend/open';
    const first = scopedResponse(open, { sessionId: 'session_1' }, { ok: true, epoch: 'epoch-1', revision: 'rev-1', data: { descriptorDigest: 'a'.repeat(64), secret: 'hidden' } });
    const second = scopedResponse(open, { sessionId: 'session_1' }, { ok: true, epoch: 'epoch-2', revision: 'rev-1', data: { descriptorDigest: 'a'.repeat(64) } }, first);
    assert.equal(compareScope(first.experience.identity, second.experience.identity, experienceSchema), 'STALE');
    const rejected = scopedResponse('/api/native/session/frontend/request', { epoch: 'epoch-2' }, { error: { code: 'bridge_epoch_stale' } }, second);
    assert.equal(rejected.experience.state, 'STALE');
    const body = { workspace: { projectId: 'p', baseRevision: 'base', workspaceId: 'w', operations: [{ b: 2, a: 1 }] }, validation: { status: 'passed' },
        preview: { projectId: 'p', previewId: 'preview-1', packageVersionId: 'pv', entryPointId: 'entry', descriptor: { packageContentHash: 'b'.repeat(64) } } };
    const preview = scopedResponse('/api/native/studio/projects/p/frontend/evaluate', {}, body, first);
    assert.equal(preview.experience, first.experience); assert.equal(preview.preview.identity.operationsFingerprint.length, 64);
    assert.equal(compareScope(preview.preview.identity, { ...preview.preview.identity, workspaceId: 'other' }, previewSchema), 'STALE');
    assert.equal(compareScope(null, preview.preview.identity, previewSchema), 'UNVERIFIABLE');
    const normalized = structuredClone(body); normalized.workspace.operations = [{ a: 1, b: 2 }];
    assert.equal(scopedResponse('/api/native/studio/projects/p/frontend/evaluate', {}, normalized).preview.identity.operationsFingerprint, preview.preview.identity.operationsFingerprint);
    assert.equal(scopedResponse('/api/native/studio/previews/preview-1/ui', null, { previewId: 'preview-1', packageVersionId: 'other' }, preview).preview.uiLoaded, false);
    assert.equal(scopedResponse('/api/native/studio/previews/preview-1/ui', null, { previewId: 'preview-1', packageVersionId: 'pv' }, preview).preview.uiLoaded, true);
    assert.doesNotMatch(JSON.stringify(preview), /secret|hidden/);
});

test('actual Edge fixture binds document boot, preserves stale page after restart, reloads and rejects dynamic bridge dispatch', { timeout: 120000 }, async t => {
    const f = await productFixture(); t.after(f.cleanup);
    const first = runtime(await readSourceIdentity(f.root));
    const http = await httpFixture({ runtime: first, script: `
globalThis.Atria={getContext:()=>({getCapabilityApi:(name)=>({
 'memory-graph':{getSchemaScopeInfo:()=>({scope:'global',hasOverride:false,hasAvatar:false,password:'hidden'})},
 'orchestrator':{listWorkspacePresets:()=>[{id:'p',name:'token=hidden',mode:'loop',secret:'hidden'}]},
 'game-runtime':{getPackageState:()=>({status:'ready',active:true,sessionId:'s',descriptor:{packageVersionId:'pv'}})}
})[name]})};` }); t.after(http.close);
    const browser = new AtriaBrowser({ url: http.origin, repo: f.root, channel: process.env.ATRIA_TEST_BROWSER_CHANNEL, timeout: 5000 }); t.after(() => browser.close());
    const provenance = new Provenance(f.root, browser);
    assert.equal((await provenance.snapshot()).browserFreshness, 'UNVERIFIABLE');
    assert.equal(browser.context, undefined, 'Status must not launch a browser');
    await browser.open();
    assert.equal((await provenance.snapshot()).browserFreshness, 'CURRENT');
    await browser.page.evaluate(() => history.replaceState({}, '', '/#studio'));
    assert.equal((await provenance.snapshot()).browserFreshness, 'CURRENT', 'SPA history keeps the same document identity');
    for (const adapter of BROWSER_ADAPTERS) {
        const value = await invokeBrowserAdapter(browser, adapter.id);
        assert.equal(value.provenance.serverBootId, first.serverBootId);
        assert.doesNotMatch(JSON.stringify(value), /hidden|password/);
    }
    for (const action of ['constructor', '__proto__', 'eval', 'memory.delete', 'frontend.request']) await assert.rejects(invokeBrowserAdapter(browser, action), /allowlisted/);
    await assert.rejects(invokeBrowserAdapter(browser, 'memory.schema.scope', { capability: 'secrets' }));
    const second = runtime(first.source); http.setRuntime(second);
    let snapshot = await provenance.snapshot(); assert.equal(snapshot.runtimeSourceMatch, 'EXACT'); assert.equal(snapshot.browserFreshness, 'STALE');
    await browser.snapshot(); assert.equal((await provenance.snapshot()).browserFreshness, 'STALE');
    await browser.open({ reload: true }); assert.equal((await provenance.snapshot()).browserFreshness, 'CURRENT');
    http.setRuntime(null); assert.equal((await provenance.snapshot()).runtimeSourceMatch, 'UNVERIFIABLE');
    await browser.page.goto(http.origin); assert.equal(browser.loadedIdentity, null, 'Uncaptured navigation invalidates prior binding');
    await browser.close(); assert.equal(browser.loadedIdentity, null);
});

test('passive scoped response capture is bounded, projected and invalidated by document changes', async () => {
    const browser = new AtriaBrowser({ url: 'http://localhost:1234', timeout: 25 });
    const boot = randomUUID();
    const response = {
        url: () => 'http://localhost:1234/api/native/session/frontend/open', ok: () => true,
        headers: () => ({ 'x-atria-server-boot-id': boot, 'content-type': 'application/json' }),
        request: () => ({ postDataJSON: () => ({ sessionId: 's' }) }),
        body: async () => Buffer.from(JSON.stringify({ ok: true, epoch: 'e', revision: 'r', data: { descriptorDigest: 'a'.repeat(64), password: 'hidden' } })),
    };
    await browser.captureScope(response);
    assert.equal(browser.scopedEvidence.experience.serverBootId, boot);
    assert.doesNotMatch(JSON.stringify(browser.scopedEvidence), /hidden|password/);
    const original = structuredClone(browser.scopedEvidence);
    await browser.captureScope({ ...response, headers: () => ({ ...response.headers(), 'x-atria-server-boot-id': 'invalid' }) });
    assert.deepEqual(browser.scopedEvidence, original);
    await browser.captureScope({ ...response, body: async () => { browser.documentGeneration++; return response.body(); } });
    assert.deepEqual(browser.scopedEvidence, original, 'Late response must not bind to another document');
    await assert.rejects(browser.captureScope({ ...response, body: () => new Promise(() => {}) }), /timed out/);
});
