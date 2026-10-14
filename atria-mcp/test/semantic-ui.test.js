import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { productFixture } from './helpers.js';
import { AtriaBrowser } from '../src/browser.js';
import { Provenance, readSourceIdentity } from '../src/provenance.js';
import { registerSemanticUi, observeSemanticUi, screenshotWithProof } from '../src/semantic-ui.js';
import { ActionRegistry, RiskExecutor, PolicyCeiling, fingerprint } from '../src/kernel.js';
import { execFileSync } from 'node:child_process';

test('real browser semantic manifest, exact screenshot interval, stale rejection and no generic DOM authority', async t => {
    const fixture = await productFixture(); t.after(fixture.cleanup);
    const module = `let count=0; const identity=()=>({source:{kind:'session',sessionId:'session_one',branchId:'branch_one',revisionId:'revision_one',packageVersionId:'version_one'},epoch:'epoch_one',descriptorDigest:'${'d'.repeat(64)}',revisionId:'revision_one',presentationRevision:count});
export const observeMcpSurfaces=()=>[{surfaceId:'surface.one',region:{x:0,y:0,width:1440,height:900},identity:identity(),controls:[{instanceId:'instance.one',componentId:'Main',controlId:'count',actionId:'increment'}]}];
export const interactMcpSurface=async input=>{if(JSON.stringify(input.expectedIdentity)!==JSON.stringify(identity()))throw Error('stale');count++;document.querySelector('output').textContent=count;return {identity:identity(),effect:'local-presentation-state-only'}};
export const changeIdentity=()=>count++;`;
    await fixture.write('public/scripts/native/frontend/mcp-surface.js', module);
    execFileSync('git', ['-C', fixture.root, 'add', 'public/scripts/native/frontend/mcp-surface.js']);
    const runtime = { version: 1, serverBootId: randomUUID(), processStartedAt: Date.now(), appVersion: 'test', mutationGuards: 1, source: await readSourceIdentity(fixture.root) };
    let businessWrites = 0;
    const server = createServer(async (req, res) => {
        res.setHeader('x-atria-server-boot-id', runtime.serverBootId);
        const json = data => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(data)); };
        if (req.url === '/') { res.setHeader('content-type', 'text/html'); return res.end('<!doctype html><h1>Local fixture surface</h1><output>0</output>'); }
        if (req.url === '/scripts/native/frontend/mcp-surface.js') { res.setHeader('content-type', 'text/javascript'); return res.end(module); }
        if (req.url === '/api/diagnostics/runtime-identity') return json(runtime);
        if (req.url === '/csrf-token') return json({ token: 'fixture' });
        if (req.url === '/api/native/session/frontend/observe') return json({ ok: true, epoch: 'epoch_one', revision: 'revision_one', data: {
            sessionId: 'session_one', branchId: 'branch_one', packageVersionId: 'version_one', descriptorDigest: 'd'.repeat(64), readOnly: true } });
        if (req.method !== 'GET') businessWrites++;
        res.statusCode = 404; json({ error: 'not_found' });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    const browser = new AtriaBrowser({ url: `http://127.0.0.1:${server.address().port}`, timeout: 3000, maxResponseBytes: 1048576, channel: process.env.ATRIA_TEST_BROWSER_CHANNEL });
    t.after(() => browser.close()); await browser.open();
    const provenance = new Provenance(fixture.root, browser), surface = (await observeSemanticUi(browser))[0];
    const target = { surfaceId: surface.surfaceId, expectedIdentityHash: fingerprint(surface.identity) };
    const captured = await screenshotWithProof(browser, provenance, { target });
    assert.equal(captured.proof.state, 'EXACT_CURRENT'); assert.equal(captured.proof.pixelWidth, 1440); assert.equal(captured.proof.pixelHeight, 900);
    assert.match(captured.proof.screenshotHash, /^[a-f0-9]{64}$/); assert.equal(businessWrites, 0);
    const registry = registerSemanticUi(new ActionRegistry(), browser), executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), { approve: async () => ({ action: 'accept', content: { authorize: true } }) });
    const input = { ...target, ...surface.controls[0] };
    await assert.rejects(executor.execute('INTERACT', { action: 'browser.ui.interact', input: { ...input, selector: 'body', script: 'steal()' } }));
    const applied = await executor.execute('INTERACT', { action: 'browser.ui.interact', input });
    assert.equal(applied.receipt.status, 'succeeded'); assert.equal(await browser.page.locator('output').innerText(), '1');
    await assert.rejects(executor.execute('INTERACT', { action: 'browser.ui.interact', input }), /identity changed/);
    const now = (await observeSemanticUi(browser))[0], fresh = { surfaceId: now.surfaceId, expectedIdentityHash: fingerprint(now.identity) };
    const screenshot = browser.screenshot.bind(browser);
    browser.screenshot = async args => { const image = await screenshot(args); await browser.page.evaluate(async () => (await import('/scripts/native/frontend/mcp-surface.js')).changeIdentity()); return image; };
    assert.equal((await screenshotWithProof(browser, provenance, { target: fresh })).proof.state, 'CONTEXT_CHANGED_DURING_CAPTURE');
    assert.equal(businessWrites, 0);
    await browser.close(); assert.deepEqual(await observeSemanticUi(browser), []);
});
