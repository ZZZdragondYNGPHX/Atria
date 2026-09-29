import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActionRegistry, PolicyCeiling, RiskExecutor } from '../src/kernel.js';
import { registerReadActions, diagnosticSnapshot } from '../src/read-authority.js';
import { invokeBrowserAdapter } from '../src/capability-bridge.js';
import { AtriaBrowser } from '../src/browser.js';
import { httpFixture } from './helpers.js';
import { randomUUID } from 'node:crypto';

function fixture() {
    const calls = [], boot = randomUUID();
    let handler = () => ({ name: 'ok', password: 'do-not-leak' });
    let status = 200;
    const response = data => ({ ok: () => status === 200, status: () => status, headers: () => ({ 'content-type': 'application/json', 'x-atria-server-boot-id': boot }),
        body: async () => Buffer.from(JSON.stringify(data)), dispose: async () => {} });
    const browser = { config: { url: 'http://localhost:8000', timeout: 100, maxResponseBytes: 1048576 }, start: async () => {},
        context: { request: { get: async url => { assert.equal(url, 'http://localhost:8000/csrf-token'); return response({ token: 'private-csrf' }); },
            fetch: async (url, options) => { calls.push({ url, ...options }); return response(handler(url, options)); } } }, diagnostics: () => ({ events: [] }), scopedEvidence: { experience: { epoch: 'old' } } };
    const registry = registerReadActions(new ActionRegistry(), browser), executor = new RiskExecutor(registry, new PolicyCeiling(registry));
    return { browser, registry, executor, calls, boot, data: fn => { handler = fn; }, status: s => { status = s; } };
}
test('full READ catalog covers required domains, exact risks, fixed paths and scoped schemas', async () => {
    const f = fixture();
    for (const domain of ['session', 'chat', 'build', 'library', 'work', 'package', 'memory', 'agents', 'settings', 'connection', 'model', 'route', 'diagnostics', 'game']) assert.ok(f.registry.discover({ domain }).total > 0, domain);
    for (const id of f.registry.ids()) { const d = f.registry.get(id).detail; assert.equal(d.risk, 'READ'); assert.equal(d.approval, 'none'); assert.equal(d.inputSchema.additionalProperties, false); }
    assert.ok(f.registry.get('memory.search.vector').detail.externalEffects.includes('mayIncurCost'));
    for (const action of ['build.frontend.evaluate', 'chat.send', 'frontend.request', 'settings.patch']) await assert.rejects(f.executor.execute('READ', { action }));
    await assert.rejects(f.executor.execute('MUTATE', { action: 'chat.read', input: { sessionId: 's' } }), /risk mismatch/);
    for (const input of [{ projectId: '../secret' }, { projectId: 'p', method: 'DELETE' }, { projectId: 'p', path: '/api/secrets' }]) await assert.rejects(f.executor.execute('READ', { action: 'build.project.get', input }));
    assert.equal(f.calls.length, 0);
});
test('semantic POST reads preserve CSRF, boot/time, error status and redaction; GET foundation stays blocked', async () => {
    const f = fixture();
    const result = await f.executor.execute('READ', { action: 'chat.read', input: { sessionId: 'session_x', revisionId: 'revision_x' } });
    assert.equal(f.calls[0].url, 'http://localhost:8000/api/native/session/timeline');
    assert.equal(f.calls[0].headers['x-csrf-token'], 'private-csrf');
    assert.equal(f.calls[0].data.revisionId, 'revision_x');
    assert.equal(f.calls[0].data.outputLimit, undefined);
    assert.equal(result.serverBootId, f.boot); assert.ok(result.observedAt); assert.doesNotMatch(JSON.stringify(result), /do-not-leak|private-csrf/);
    f.status(403);
    assert.equal((await f.executor.execute('READ', { action: 'diagnostics.modules' })).status, 403);
    const browser = new AtriaBrowser(f.browser.config);
    await assert.rejects(browser.request({ method: 'POST', path: '/api/native/session/timeline' }), /unavailable/);
});
test('output is redacted before pagination and opaque secrets discard unknown fields', async () => {
    const f = fixture();
    f.data(() => ({ password: 'hidden', text: 'a'.repeat(1000) }));
    const a = await f.executor.execute('READ', { action: 'build.project.list', input: { outputLimit: 100 } });
    const b = await f.executor.execute('READ', { action: 'build.project.list', input: { outputLimit: 100, outputOffset: 100 } });
    assert.equal(a.page.nextOffset, 100); assert.equal(a.page.contentHash, b.page.contentHash); assert.doesNotMatch(JSON.stringify(a), /hidden/);
    f.data(() => [{ secretId: 'opaque', label: 'provider', value: 'hidden' }]);
    assert.deepEqual((await f.executor.execute('READ', { action: 'connection.secrets' })).data, [{ secretId: 'opaque', label: 'provider' }]);
    f.data(() => ({ path: 'source.txt', encoding: 'base64', content: Buffer.from('password=hidden').toString('base64') }));
    const source = await f.executor.execute('READ', { action: 'build.source.read', input: { projectId: 'p', path: 'source.txt' } });
    assert.equal(source.data.encoding, 'utf8'); assert.doesNotMatch(JSON.stringify(source), /hidden|aGlkZGVu/);
});
test('connection probe resolves existing profile only and declares provider effects', async () => {
    const f = fixture();
    f.data(url => url.endsWith('/configuration') ? { connections: [{ connectionProfileId: 'conn_x', secretRef: 'opaque', provider: 'openai' }] } : { models: [] });
    await f.executor.execute('READ', { action: 'connection.probe', input: { connectionId: 'conn_x' } });
    assert.equal(f.calls.at(-1).data.secretRef, 'opaque');
    await assert.rejects(f.executor.execute('READ', { action: 'connection.probe', input: { connectionId: 'conn_x', endpoint: 'https://evil' } }));
});
test('diagnostic snapshot retains partial failures and labels independent last-observed scopes', async () => {
    const f = fixture();
    const snapshot = await diagnosticSnapshot(f.executor, async () => ({ phase: 3 }), f.browser);
    assert.equal(snapshot.atomic, false); assert.match(snapshot.activeAuthorityIdentity.evidence, /last-observed/);
    assert.equal(Object.keys(snapshot.productDiagnostics).length, 5);
    assert.equal(snapshot.activeAuthorityIdentity.scopes.preview.available, false);
});
test('actual browser fixed Memory reads avoid write-session API, filter secrets and reject scope drift', { timeout: 30000 }, async t => {
    const http = await httpFixture({ script: `let scope='one'; globalThis.Atria={getContext:()=>({chatId:scope,getCapabilityApi:name=>({
      'memory-graph':{getCurrentInjection:()=>({visibleIds:new Set(['n1'])}),openSession:()=>{throw Error('must not open write session')},openReadSession:async()=>({getSchema:()=>({types:[],password:'hidden'}),keywordSearch:async()=>{scope='two';return []}})},
      'orchestrator':{getRunObservation:()=>({runId:'r',status:'idle',token:'hidden'})},
      'game-runtime':{getPackageState:()=>({sessionId:scope}),getLlmRuntimeState:()=>({status:'idle'})}
    })[name]})};` }); t.after(http.close);
    const browser = new AtriaBrowser({ url: http.origin, timeout: 1000, channel: process.env.ATRIA_TEST_BROWSER_CHANNEL }); t.after(() => browser.close());
    await browser.open();
    const result = await invokeBrowserAdapter(browser, 'memory.schema');
    assert.doesNotMatch(JSON.stringify(result), /hidden/);
    assert.equal((await invokeBrowserAdapter(browser, 'agents.run.get')).value.runId, 'r');
    assert.deepEqual((await invokeBrowserAdapter(browser, 'memory.injection')).value.visibleIds, ['n1']);
    await assert.rejects(invokeBrowserAdapter(browser, 'memory.search.keyword', { query: 'x' }), /scope changed/);
    await assert.rejects(invokeBrowserAdapter(browser, 'memory.schema', { method: 'deleteNode' }));
});
