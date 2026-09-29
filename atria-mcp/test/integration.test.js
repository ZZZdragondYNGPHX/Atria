import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { productFixture, httpFixture } from './helpers.js';
import { PUBLIC_TOOLS } from '../src/kernel.js';
const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const unpack = result => JSON.parse(result.content.find(item => item.type === 'text').text);
async function connect(t, fixture, http, authenticated = false) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('ATRIA_')));
    const authPath = join(fixture.root, 'data', 'test-auth.json');
    if (authenticated) await fixture.write('data/test-auth.json', JSON.stringify({ cookies: [{ name: 'auth', value: 'fixture-user', domain: '127.0.0.1', path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Strict' }], origins: [] }));
    const transport = new StdioClientTransport({ command: process.execPath,
        args: [cli, '--repo', fixture.root, '--url', http.origin, ...(authenticated ? ['--storage-state', authPath] : []), ...(process.env.ATRIA_TEST_BROWSER_CHANNEL ? ['--browser-channel', process.env.ATRIA_TEST_BROWSER_CHANNEL] : [])], env, stderr: 'pipe' });
    let stderr = ''; transport.stderr.on('data', bytes => { stderr += bytes; });
    const client = new Client({ name: 'atria-test-client', version: '1.0.0' });
    t.after(async () => { await client.close(); assert.equal(stderr, '', 'No protocol noise or startup errors on stderr'); });
    await client.connect(transport);
    return { client, call: (name, args = {}) => client.callTool({ name, arguments: args }) };
}

test('stdio exact 18-tool/schema contract, legacy rejection and Phase 1 fail-closed writes', { timeout: 120000 }, async t => {
    const fixture = await productFixture(), http = await httpFixture(); t.after(fixture.cleanup); t.after(http.close);
    const { client, call } = await connect(t, fixture, http);
    const tools = (await client.listTools()).tools;
    assert.deepEqual(tools.map(t => t.name).sort(), [...PUBLIC_TOOLS].sort());
    for (const tool of tools) { assert.equal(tool.inputSchema.additionalProperties, false); assert.equal(tool.inputSchema.properties.confirm, undefined); }
    for (const risk of ['read', 'interact', 'mutate', 'destructive']) {
        const tool = tools.find(t => t.name === 'atri_' + risk);
        assert.equal(tool.annotations.readOnlyHint, risk === 'read'); assert.equal(tool.annotations.destructiveHint, risk === 'destructive');
        assert.equal((await call(tool.name, { action: 'chat.send', input: {} })).isError, true);
    }
    const status = unpack(await call('atri_status'));
    assert.equal(status.productMutationAvailable, false); assert.equal(status.browser.started, false); assert.equal(status.runtimeSourceMatch, 'UNVERIFIABLE');
    assert.equal(unpack(await call('atri_capabilities')).result.total, 0);
    assert.equal(unpack(await call('atri_diagnose_snapshot')).status.provenance.server, null);
    assert.equal((await client.listResources()).resources.length, 2);
    assert.match((await client.readResource({ uri: 'atria://guide' })).contents[0].text, /Review -> Apply/);
    assert.match((await client.getPrompt({ name: 'atria_verify_change', arguments: { task: 'Verify frontend' } })).messages[0].content.text, /UNVERIFIABLE/);
    assert.equal(unpack(await call('atri_api', { operation: 'list', query: 'projects' })).total, 3);
    assert.match(unpack(await call('atri_api', { operation: 'detail', id: 'POST /api/native/studio/projects' })).source.content, /req.body.name/);
    for (const args of [{ method: 'POST' }, { body: {} }, { confirm: true }]) assert.equal((await call('atri_api', { operation: 'read', path: '/api/native/studio/projects', ...args })).isError, true);
    assert.equal((await call('atri_browser_interact', { action: 'click', selector: '#login' })).isError, true);
    assert.equal((await call('atri_browser_interact', { action: 'scroll', confirm: true })).isError, true);
    assert.equal((await call('atri_repo', { operation: 'read', path: 'data/private.json' })).isError, true);
    assert.match(unpack(await call('atri_repo', { operation: 'read', path: 'public/example.js' })).content, /Atria test evidence/);
    await fixture.write('new.ts', 'safe new development file');
    assert.match(unpack(await call('atri_repo', { operation: 'read', path: 'new.ts' })).content, /safe new/);
    assert.ok(unpack(await call('atri_git', { operation: 'status' })).entries.some(e => e.path === 'new.ts'));
    for (const name of ['atri_source_read', 'atri_source_search', 'atri_api_request', 'atri_api_list', 'atri_browser_snapshot']) assert.equal((await call(name)).isError, true);
    for (const path of ['/api/native/generation/secrets', '/api/native/studio/not-discovered']) assert.equal((await call('atri_api', { operation: 'read', path })).isError, true);
    const unauthorized = await call('atri_api', { operation: 'read', path: '/api/native/studio/projects' });
    assert.equal(unauthorized.isError, true); assert.equal(unpack(unauthorized).status, 401); assert.equal(http.stats().writes, 0);
});

test('real Chromium fixture: authentication, GET redaction, protocol images, frames, resize and diagnostics', { timeout: 180000 }, async t => {
    const fixture = await productFixture(), http = await httpFixture(); t.after(fixture.cleanup); t.after(http.close);
    const { call } = await connect(t, fixture, http, true);
    const opened = await call('atri_browser_open', { waitFor: '#ready' }); assert.equal(opened.isError, undefined, JSON.stringify(opened));
    assert.match(unpack(opened).accessibility, /Atria MCP browser fixture/);
    const read = await call('atri_api', { operation: 'read', path: '/api/native/studio/projects', parameters: { search: 'a&b' } });
    assert.equal(read.isError, undefined, JSON.stringify(read)); assert.equal(unpack(read).data.password, '[REDACTED]'); assert.equal(unpack(read).data.query, 'a&b');
    assert.equal(unpack(await call('atri_reference')).data.references[0].id, 'project');
    assert.match(unpack(await call('atri_reference', { id: 'project' })).data.content, /Exact revisions/);
    for (const path of ['redirect', 'oversize', 'nonjson']) assert.equal((await call('atri_api', { operation: 'read', path: '/api/native/studio/' + path })).isError, true, path);
    assert.equal(http.stats().redirects, 0);
    assert.equal((await call('atri_browser_open', { path: '//example.invalid' })).isError, true);
    for (const action of ['click', 'fill', 'press', 'select']) assert.equal((await call('atri_browser_interact', { action, selector: '#login', value: 'x' })).isError, true);
    assert.equal((await call('atri_browser_observe', { operation: 'wait', selector: '#ready' })).isError, undefined);
    const image = (await call('atri_browser_screenshot')).content.find(i => i.type === 'image');
    assert.equal(image.mimeType, 'image/jpeg'); assert.equal(Buffer.from(image.data, 'base64').readUInt16BE(0), 0xffd8); assert.ok(Buffer.from(image.data, 'base64').length > 5000);
    assert.match(unpack(await call('atri_browser_observe', { frame: 1 })).accessibility, /Embedded Atria preview/);
    assert.ok((await call('atri_browser_screenshot', { frame: 1, selector: 'body' })).content.some(i => i.type === 'image'));
    assert.equal(unpack(await call('atri_browser_observe', { operation: 'resize', width: 390, height: 844 })).viewport.width, 390);
    assert.ok((await call('atri_browser_screenshot')).content.some(i => i.type === 'image'));
    assert.equal((await call('atri_browser_interact', { action: 'scroll', y: 200 })).isError, undefined);
    assert.match(unpack(await call('atri_browser_open', { reload: true, waitFor: '#ready' })).accessibility, /Initial frontend/);
    const diagnostics = unpack(await call('atri_browser_diagnostics'));
    assert.ok(diagnostics.events.some(i => i.type === 'http-error')); assert.match(JSON.stringify(diagnostics), /REDACTED/); assert.doesNotMatch(JSON.stringify(diagnostics), /do-not-leak/);
    await call('atri_browser_diagnostics', { clear: true }); assert.equal(unpack(await call('atri_browser_diagnostics')).count, 0);
    assert.equal(http.stats().writes, 0);
    await call('atri_browser_close'); assert.equal(unpack(await call('atri_status')).browser.started, false);
});
